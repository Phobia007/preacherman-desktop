const DEFAULT_TIMEOUT_MS = 10_000;

function redact(value, secrets) {
  let message = String(value ?? "HomeRail request failed.");
  for (const secret of secrets) if (secret) message = message.replaceAll(secret, "[REDACTED]");
  return message.replace(/(Bearer\s+)[^\s]+/gi, "$1[REDACTED]");
}

function clientError(code, message, statusCode = 502, details) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  if (details !== undefined) error.details = details;
  return error;
}

function normalizeBaseUrl(value) {
  const url = new URL(value || "http://127.0.0.1:19191");
  if (!new Set(["http:", "https:"]).has(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new TypeError("HomeRail Manager URL must be an HTTP(S) origin without credentials, query, or hash.");
  }
  return url.href.replace(/\/$/, "");
}

export function createHomeRailClient({
  baseUrl = "http://127.0.0.1:19191",
  token,
  approvalToken,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const managerUrl = normalizeBaseUrl(baseUrl);
  const secrets = [token, approvalToken].filter(Boolean);

  async function request(path, { method = "GET", body, signal } = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error("HomeRail request timed out.")), timeoutMs);
    const abort = () => controller.abort(signal?.reason);
    if (signal) {
      if (signal.aborted) abort();
      else signal.addEventListener("abort", abort, { once: true });
    }
    try {
      const response = await fetchImpl(`${managerUrl}${path}`, {
        method,
        headers: {
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
      });
      let payload;
      try { payload = await response.json(); } catch { payload = null; }
      if (!response.ok || payload?.success === false) {
        const message = redact(payload?.error ?? payload?.message ?? `HomeRail returned HTTP ${response.status}.`, secrets);
        throw clientError("HOMERAIL_HTTP_ERROR", message, response.status, { path, providerCode: payload?.data?.code });
      }
      if (!payload || payload.success !== true || !("data" in payload)) {
        throw clientError("HOMERAIL_RESPONSE_INVALID", "HomeRail returned an invalid BaseResponse.");
      }
      return payload.data;
    } catch (error) {
      if (error?.code?.startsWith?.("HOMERAIL_")) throw error;
      if (controller.signal.aborted) throw clientError("HOMERAIL_TIMEOUT", "HomeRail request timed out.", 504);
      throw clientError("HOMERAIL_UNREACHABLE", redact(error instanceof Error ? error.message : error, secrets), 503);
    } finally {
      clearTimeout(timeout);
      if (signal) signal.removeEventListener("abort", abort);
    }
  }

  async function watchRunEvents(runId, { signal, onSignal } = {}) {
    if (typeof onSignal !== "function") throw new TypeError("HomeRail event watcher requires onSignal.");
    const controller = new AbortController();
    const connectTimeout = setTimeout(() => controller.abort(new Error("HomeRail event stream timed out.")), timeoutMs);
    const abort = () => controller.abort(signal?.reason);
    if (signal) {
      if (signal.aborted) abort();
      else signal.addEventListener("abort", abort, { once: true });
    }
    let connected = false;
    try {
      const response = await fetchImpl(`${managerUrl}/api/dag-status/${encodeURIComponent(runId)}/events`, {
        headers: {
          Accept: "text/event-stream",
          "Cache-Control": "no-cache",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: controller.signal,
      });
      connected = true;
      clearTimeout(connectTimeout);
      if (!response.ok) throw clientError("HOMERAIL_EVENT_STREAM_FAILED", `HomeRail event stream returned HTTP ${response.status}.`, response.status);
      if (!response.body) throw clientError("HOMERAIL_EVENT_STREAM_INVALID", "HomeRail event stream did not include a response body.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffered = "";
      while (true) {
        const { done, value } = await reader.read();
        buffered += decoder.decode(value, { stream: !done }).replaceAll("\r\n", "\n");
        let boundary;
        while ((boundary = buffered.indexOf("\n\n")) >= 0) {
          const block = buffered.slice(0, boundary);
          buffered = buffered.slice(boundary + 2);
          const event = block.split("\n").find((line) => line.startsWith("event:"))?.slice(6).trim();
          if (event && event !== "keepalive") await onSignal({ event });
        }
        if (done) break;
      }
      return { closed: true };
    } catch (error) {
      if (signal?.aborted) return { closed: true, aborted: true };
      if (error?.code?.startsWith?.("HOMERAIL_")) throw error;
      if (controller.signal.aborted && !connected) throw clientError("HOMERAIL_TIMEOUT", "HomeRail event stream timed out.", 504);
      throw clientError("HOMERAIL_UNREACHABLE", redact(error instanceof Error ? error.message : error, secrets), 503);
    } finally {
      clearTimeout(connectTimeout);
      if (signal) signal.removeEventListener("abort", abort);
    }
  }

  return {
    managerUrl,
    runtimeStatus: () => request("/api/runtime/status"),
    workflows: () => request("/api/dag/workflows"),
    workflow: (workflowId) => request(`/api/dag/workflows/${encodeURIComponent(workflowId)}`),
    profiles: (workflowId) => request(`/api/dag/profiles?workflow_id=${encodeURIComponent(workflowId)}`),
    detectModelRuntime: (settingId, options) => request("/api/llm/models/detect-runtime", {
      method: "POST",
      body: { setting_id: settingId },
      ...options,
    }),
    createAndRun: (input, options) => request("/api/runs/create-and-run", { method: "POST", body: input, ...options }),
    runStatus: (runId, options) => request(`/api/runs/${encodeURIComponent(runId)}/status`, options),
    runEvents: (runId, options) => request(`/api/runs/${encodeURIComponent(runId)}/events`, options),
    watchRunEvents,
    runArtifacts: (runId, options) => request(`/api/runs/${encodeURIComponent(runId)}/artifacts`, options),
    async artifactContent(runId, name, { range, signal } = {}) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(`${managerUrl}/api/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(name)}/content`, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(range ? { Range: range } : {}),
          },
          signal: signal ?? controller.signal,
        });
        if (!response.ok && response.status !== 206) throw clientError("HOMERAIL_ARTIFACT_FAILED", `HomeRail artifact returned HTTP ${response.status}.`, response.status);
        return response;
      } finally { clearTimeout(timeout); }
    },
    cancelRun: (runId, options) => request(`/api/runs/${encodeURIComponent(runId)}/cancel`, { method: "POST", body: {}, ...options }),
    sendCommands: (runId, input, options) => request(`/api/runs/${encodeURIComponent(runId)}/commands`, { method: "POST", body: input, ...options }),
    approveRun: async (runId, nodeId, input, options = {}) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(`${managerUrl}/api/runs/${encodeURIComponent(runId)}/node/${encodeURIComponent(nodeId)}/approval`, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(approvalToken ? { "X-Homerail-Approval-Token": approvalToken } : {}),
          },
          body: JSON.stringify(input),
          signal: options.signal ?? controller.signal,
        });
        const payload = await response.json();
        if (!response.ok || payload?.success !== true) throw clientError("HOMERAIL_HTTP_ERROR", redact(payload?.error ?? payload?.message, secrets), response.status);
        return payload.data;
      } finally { clearTimeout(timeout); }
    },
  };
}
