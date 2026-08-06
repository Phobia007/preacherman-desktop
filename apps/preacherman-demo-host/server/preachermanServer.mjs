import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { mkdir, readFile, rename, writeFile, chmod } from "node:fs/promises";
import { dirname, join } from "node:path";
import { WebSocket, WebSocketServer } from "ws";
import {
  createPitchProposal,
  generatePitchKit,
  repairPitchKit,
  readPitchBrief,
  validatePitchKit,
  writePitchKit,
} from "./agentRuntime.mjs";

const MAX_BODY_BYTES = 32 * 1024;
const DEFAULT_PORT = 8787;

function json(response, status, body, origin) {
  response.writeHead(status, {
    "Access-Control-Allow-Origin": origin,
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Origin",
  });
  response.end(JSON.stringify(body));
}

function readJson(request) {
  return new Promise((resolveBody, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
        reject(new Error("Request body is too large."));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolveBody(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Request body must be valid JSON."));
      }
    });
    request.on("error", reject);
  });
}

export function createPreachermanServer(options = {}) {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const allowedOrigins = new Set([
    "http://127.0.0.1:1420",
    "http://localhost:1420",
    "http://tauri.localhost",
    "https://tauri.localhost",
    "tauri://localhost",
  ]);
  const proposals = new Map();
  const pitchRuns = new Map();
  let savedProviderConfig = null;

  function providerConfigFile() {
    return join(env.PREACHERMAN_DATA_DIR || join(homedir(), ".preacherman-demo"), "provider-settings.json");
  }

  function conversationLedgerFile() {
    return join(env.PREACHERMAN_DATA_DIR || join(homedir(), ".preacherman-demo"), "conversation-ledger.json");
  }

  async function readConversationLedger() {
    try {
      const entries = JSON.parse(await readFile(conversationLedgerFile(), "utf8"));
      return Array.isArray(entries) ? entries : [];
    } catch {
      return [];
    }
  }

  async function saveConversation(id, entry) {
    if (!/^[A-Za-z0-9:_-]{1,120}$/.test(id)) throw new Error("Invalid conversation id.");
    const locale = entry?.locale === "en" ? "en" : "zh-CN";
    const messages = Array.isArray(entry?.messages) ? entry.messages
      .filter((message) => (message?.role === "user" || message?.role === "assistant") && typeof message?.text === "string")
      .slice(-20)
      .map((message) => ({ role: message.role, text: message.text.slice(0, 4_000) })) : [];
    const next = { id, locale, updatedAt: new Date().toISOString(), messages };
    const entries = (await readConversationLedger()).filter((item) => item?.id !== id);
    const target = conversationLedgerFile();
    await mkdir(dirname(target), { recursive: true });
    const temporary = `${target}.tmp`;
    await writeFile(temporary, JSON.stringify([next, ...entries].slice(0, 10)), { mode: 0o600 });
    await rename(temporary, target);
    await chmod(target, 0o600);
    return next;
  }

  async function providerConfig() {
    if (savedProviderConfig) return savedProviderConfig;
    try {
      savedProviderConfig = JSON.parse(await readFile(providerConfigFile(), "utf8"));
    } catch {
      savedProviderConfig = {};
    }
    return savedProviderConfig;
  }

  async function runtimeEnv() {
    const saved = await providerConfig();
    return {
      ...env,
      DEEPSEEK_API_KEY: saved.deepseekApiKey || env.DEEPSEEK_API_KEY || "",
      DASHSCOPE_API_KEY: saved.dashscopeApiKey || env.DASHSCOPE_API_KEY || "",
      DASHSCOPE_WORKSPACE_ID: saved.dashscopeWorkspaceId || env.DASHSCOPE_WORKSPACE_ID || "",
    };
  }

  async function saveProviderConfig(next) {
    const current = await providerConfig();
    savedProviderConfig = {
      deepseekApiKey: typeof next.deepseekApiKey === "string" && next.deepseekApiKey.trim() ? next.deepseekApiKey.trim() : current.deepseekApiKey || "",
      dashscopeApiKey: typeof next.dashscopeApiKey === "string" && next.dashscopeApiKey.trim() ? next.dashscopeApiKey.trim() : current.dashscopeApiKey || "",
      dashscopeWorkspaceId: typeof next.dashscopeWorkspaceId === "string" && next.dashscopeWorkspaceId.trim() ? next.dashscopeWorkspaceId.trim() : current.dashscopeWorkspaceId || "",
    };
    const target = providerConfigFile();
    await mkdir(dirname(target), { recursive: true });
    const temporary = `${target}.tmp`;
    await writeFile(temporary, JSON.stringify(savedProviderConfig), { mode: 0o600 });
    await rename(temporary, target);
    await chmod(target, 0o600);
    return savedProviderConfig;
  }

  async function providerStatus() {
    const config = await runtimeEnv();
    return {
      deepseekConfigured: Boolean(config.DEEPSEEK_API_KEY),
      dashscopeWorkspaceConfigured: Boolean(config.DASHSCOPE_WORKSPACE_ID),
      asrConfigured: Boolean(config.DASHSCOPE_API_KEY && config.DASHSCOPE_WORKSPACE_ID),
      ttsConfigured: Boolean(config.DASHSCOPE_API_KEY),
    };
  }

  function dashscopeAsrUrl(config) {
    const model = "qwen3-asr-flash-realtime";
    return `wss://${config.DASHSCOPE_WORKSPACE_ID}.cn-beijing.maas.aliyuncs.com/api-ws/v1/realtime?model=${encodeURIComponent(model)}`;
  }

  function dashscopeTtsUrl() {
    return "wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=qwen3-tts-flash-realtime";
  }

  function testDashscopeConnection(url, apiKey) {
    return new Promise((resolveTest) => {
      const socket = new WebSocket(url, {
        headers: { Authorization: `Bearer ${apiKey}`, "OpenAI-Beta": "realtime=v1" },
      });
      const timeout = setTimeout(() => { socket.terminate(); resolveTest({ configured: true, ok: false, message: "Connection timed out" }); }, 8_000);
      socket.once("open", () => { clearTimeout(timeout); socket.close(); resolveTest({ configured: true, ok: true, message: "Connected" }); });
      socket.once("unexpected-response", (_request, response) => { clearTimeout(timeout); resolveTest({ configured: true, ok: false, message: `HTTP ${response.statusCode || 401}` }); });
      socket.once("error", () => { clearTimeout(timeout); resolveTest({ configured: true, ok: false, message: "Connection failed" }); });
    });
  }

  function cleanConversationHistory(history) {
    if (!Array.isArray(history)) return [];
    return history
      .filter((message) => (message?.role === "user" || message?.role === "assistant") && typeof message?.text === "string")
      .slice(-10)
      .map((message) => ({ role: message.role, content: message.text.trim().slice(0, 2_000) }))
      .filter((message) => message.content);
  }

  function companionFallback(locale, proposalRequested, reason) {
    return {
      message: locale === "zh-CN" ? "我暂时没能拿到完整的模型回复。你可以换一种说法，或直接告诉我想讨论、修改或制作什么。" : "I could not get a complete model reply just now. Try phrasing it another way, or tell me what you would like to discuss, revise, or create.",
      action: proposalRequested ? "propose_task" : "reply",
      diagnostics: { source: "fallback", model: null, reason },
    };
  }

  function parseCompanionResponse(raw, fallback, model) {
    const text = typeof raw === "string" ? raw.trim() : "";
    if (!text) return fallback;
    const jsonCandidate = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    try {
      const turn = JSON.parse(jsonCandidate);
      if (typeof turn.message !== "string" || !turn.message.trim()) return fallback;
      return {
        message: turn.message.trim(),
        speechText: typeof turn.speechText === "string" ? turn.speechText.trim().slice(0, 160) : undefined,
        action: turn.action === "propose_task" ? "propose_task" : "reply",
        diagnostics: { source: "deepseek", model, reason: null },
      };
    } catch {
      // A useful natural-language answer is better than throwing it away because
      // the provider did not follow the optional JSON envelope exactly.
      return {
        message: text,
        speechText: text.slice(0, 160),
        action: fallback.action,
        diagnostics: { source: "deepseek-unstructured", model, reason: "unstructured_response" },
      };
    }
  }

  async function createCompanionTurn(input, locale, history) {
    const proposalRequested = /pitch|路演|演示|方案|生成|制作/i.test(input);
    const fallback = companionFallback(locale, proposalRequested, "provider_unavailable");
    const configuredEnv = await runtimeEnv();
    if (!configuredEnv.DEEPSEEK_API_KEY) return fallback;
    try {
      const model = configuredEnv.DEEPSEEK_MODEL || "deepseek-v4-flash";
      const upstream = await fetchImpl("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${configuredEnv.DEEPSEEK_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          temperature: 0.45,
          max_tokens: 600,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: "你是 Preacherman，一位自然、可靠的数字伙伴。理解用户的上下文并直接回答，不要自称 A 或 Agent。返回 JSON：message（完整文字）、speechText（不超过80汉字）、action（reply 或 propose_task）。只有用户明确要求生成、整理、制作路演或演示方案时才使用 propose_task。不要编造已完成的工作。" },
            ...cleanConversationHistory(history),
            { role: "user", content: input },
          ],
        }),
        signal: AbortSignal.timeout(20_000),
      });
      const payload = await upstream.json();
      if (!upstream.ok) return companionFallback(locale, proposalRequested, "provider_request_failed");
      return parseCompanionResponse(payload?.choices?.[0]?.message?.content, fallback, model);
    } catch {
      return companionFallback(locale, proposalRequested, "provider_request_failed");
    }
  }

  async function startPitchRun(proposal) {
    const run = {
      runId: `run_${randomUUID()}`,
      proposalId: proposal.proposalId,
      objective: proposal.objective,
      status: "queued",
      events: [],
      artifact: null,
      error: null,
    };
    pitchRuns.set(run.runId, run);
    const event = (stage, message) => run.events.push({ stage, message, at: new Date().toISOString() });
    void (async () => {
      try {
        run.status = "running";
        event("reading", "Reading the fixed PitchKit brief");
        const brief = await readPitchBrief();
        if (run.status === "cancelled") return;
        event("generating", "Generating a constrained PitchKit");
        let markdown = await generatePitchKit({ env: await runtimeEnv(), objective: run.objective, brief, fetchImpl });
        if (run.status === "cancelled") return;
        event("validating", "Validating required sections");
        try {
          validatePitchKit(markdown);
        } catch {
          event("generating", "Repairing the required PitchKit format");
          markdown = repairPitchKit(run.objective, brief);
          validatePitchKit(markdown);
        }
        event("writing", "Writing the PitchKit artifact");
        const artifactPath = await writePitchKit({ env, runId: run.runId, markdown });
        run.artifact = { name: "pitch-kit.md", path: artifactPath, mediaType: "text/markdown" };
        run.status = "succeeded";
        event("terminal", "PitchKit completed");
      } catch (error) {
        run.status = "failed";
        run.error = error instanceof Error ? error.message : String(error);
        event("terminal", run.error);
      }
    })();
    return run;
  }

  function requestOrigin(request) {
    const origin = request.headers.origin;
    if (!origin) return "http://127.0.0.1:1420";
    return allowedOrigins.has(origin) ? origin : null;
  }

  const server = createServer(async (request, response) => {
    const origin = requestOrigin(request);
    if (!origin) {
      json(response, 403, { error: "Origin is not allowed." }, "null");
      return;
    }
    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
        "Access-Control-Allow-Origin": origin,
        Vary: "Origin",
      });
      response.end();
      return;
    }

    try {
      const url = new URL(request.url, "http://127.0.0.1");
      if (request.method === "GET" && url.pathname === "/api/health") {
        const status = await providerStatus();
        json(response, 200, {
          ok: true,
          ...status,
        }, origin);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/settings/providers") {
        json(response, 200, await providerStatus(), origin);
        return;
      }
      if (request.method === "PUT" && url.pathname === "/api/settings/providers") {
        const body = await readJson(request);
        await saveProviderConfig(body);
        json(response, 200, await providerStatus(), origin);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/settings/test") {
        const config = await runtimeEnv();
        const result = {
          deepseek: { configured: Boolean(config.DEEPSEEK_API_KEY), ok: false, message: "Not configured" },
          asr: { configured: Boolean(config.DASHSCOPE_API_KEY && config.DASHSCOPE_WORKSPACE_ID), ok: false, message: "Not configured" },
          tts: { configured: Boolean(config.DASHSCOPE_API_KEY), ok: false, message: "Not configured" },
        };
        if (config.DEEPSEEK_API_KEY) {
          try {
            const upstream = await fetchImpl("https://api.deepseek.com/models", { headers: { Authorization: `Bearer ${config.DEEPSEEK_API_KEY}` }, signal: AbortSignal.timeout(8_000) });
            result.deepseek = { configured: true, ok: upstream.ok, message: upstream.ok ? "Connected" : `HTTP ${upstream.status}` };
          } catch {
            result.deepseek = { configured: true, ok: false, message: "Connection failed" };
          }
        }
        if (config.DASHSCOPE_API_KEY && config.DASHSCOPE_WORKSPACE_ID) result.asr = await testDashscopeConnection(dashscopeAsrUrl(config), config.DASHSCOPE_API_KEY);
        if (config.DASHSCOPE_API_KEY) result.tts = await testDashscopeConnection(dashscopeTtsUrl(), config.DASHSCOPE_API_KEY);
        json(response, 200, result, origin);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/conversations/recent") {
        json(response, 200, { entries: await readConversationLedger() }, origin);
        return;
      }
      const conversationMatch = url.pathname.match(/^\/api\/conversations\/([^/]+)$/);
      if (request.method === "PUT" && conversationMatch) {
        const entry = await saveConversation(decodeURIComponent(conversationMatch[1]), await readJson(request));
        json(response, 200, { entry }, origin);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/agent/turn") {
        const body = await readJson(request);
        const input = typeof body.input === "string" ? body.input.trim() : "";
        const locale = body.locale === "en" ? "en" : "zh-CN";
        if (!input || input.length > 4_000) {
          json(response, 400, { error: "input must contain 1 to 4000 characters." }, origin);
          return;
        }
        const turn = await createCompanionTurn(input, locale, body.history);
        let proposal = null;
        if (turn.action === "propose_task") {
          proposal = createPitchProposal({ id: `proposal_${randomUUID()}`, objective: input, locale });
          proposals.set(proposal.proposalId, proposal);
        }
        json(response, 200, { displayText: turn.message, speechText: turn.speechText || turn.message.slice(0, 80), action: turn.action, proposal, diagnostics: turn.diagnostics }, origin);
        return;
      }
      const proposalMatch = url.pathname.match(/^\/api\/agent\/proposals\/([^/]+)\/confirm$/);
      if (request.method === "POST" && proposalMatch) {
        const proposal = proposals.get(decodeURIComponent(proposalMatch[1]));
        if (!proposal) {
          json(response, 404, { error: "Task proposal not found." }, origin);
          return;
        }
        const body = await readJson(request);
        if (typeof body.objective === "string" && body.objective.trim()) proposal.objective = body.objective.trim();
        const run = await startPitchRun(proposal);
        json(response, 202, { run }, origin);
        return;
      }
      const runMatch = url.pathname.match(/^\/api\/agent\/runs\/([^/]+)$/);
      if (request.method === "GET" && runMatch) {
        const run = pitchRuns.get(decodeURIComponent(runMatch[1]));
        if (!run) {
          json(response, 404, { error: "Task run not found." }, origin);
          return;
        }
        json(response, 200, { run }, origin);
        return;
      }
      const runActionMatch = url.pathname.match(/^\/api\/agent\/runs\/([^/]+)\/(cancel|retry)$/);
      if (request.method === "POST" && runActionMatch) {
        const run = pitchRuns.get(decodeURIComponent(runActionMatch[1]));
        if (!run) {
          json(response, 404, { error: "Task run not found." }, origin);
          return;
        }
        if (runActionMatch[2] === "cancel") {
          if (["queued", "running"].includes(run.status)) {
            run.status = "cancelled";
            run.events.push({ stage: "terminal", message: "PitchKit cancelled", at: new Date().toISOString() });
          }
          json(response, 200, { run }, origin);
          return;
        }
        const retry = await startPitchRun({ proposalId: run.proposalId, objective: run.objective });
        json(response, 202, { run: retry, previousRunId: run.runId }, origin);
        return;
      }
      json(response, 404, { error: "Route not found." }, origin);
    } catch (error) {
      const status = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
      json(response, status, {
        error: error instanceof Error ? error.message : "Unexpected service error.",
      }, origin);
    }
  });

  const voiceProxy = new WebSocketServer({ noServer: true });
  voiceProxy.on("connection", async (client, request, kind) => {
    const config = await runtimeEnv();
    if (!config.DASHSCOPE_API_KEY) {
      client.close(1011, "Set DASHSCOPE_API_KEY in .env.local.");
      return;
    }
    if (kind === "asr" && !config.DASHSCOPE_WORKSPACE_ID) {
      client.close(1011, "Set DASHSCOPE_WORKSPACE_ID in Settings.");
      return;
    }
    const upstream = new WebSocket(kind === "asr" ? dashscopeAsrUrl(config) : dashscopeTtsUrl(), {
      headers: { Authorization: `Bearer ${config.DASHSCOPE_API_KEY}`, "OpenAI-Beta": "realtime=v1" },
    });
    const pendingMessages = [];
    const closeBoth = () => {
      if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) upstream.close();
      if (client.readyState === WebSocket.OPEN || client.readyState === WebSocket.CONNECTING) client.close();
    };
    upstream.on("open", () => {
      client.send(JSON.stringify({ type: "preacherman.voice.ready", kind }));
      for (const message of pendingMessages) upstream.send(message.data, { binary: message.isBinary });
      pendingMessages.length = 0;
    });
    upstream.on("message", (data, isBinary) => {
      if (client.readyState === WebSocket.OPEN) client.send(data, { binary: isBinary });
    });
    upstream.on("error", () => {
      if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify({ type: "preacherman.voice.error", message: "DashScope connection failed." }));
    });
    client.on("message", (data, isBinary) => {
      if (upstream.readyState === WebSocket.OPEN) upstream.send(data, { binary: isBinary });
      else if (upstream.readyState === WebSocket.CONNECTING) pendingMessages.push({ data, isBinary });
    });
    client.on("close", closeBoth);
    upstream.on("close", () => {
      if (client.readyState === WebSocket.OPEN) client.close();
    });
  });

  server.on("upgrade", (request, socket, head) => {
    const origin = requestOrigin(request);
    const path = new URL(request.url || "/", "http://127.0.0.1").pathname;
    const kind = path === "/api/voice/asr" ? "asr" : path === "/api/voice/tts" ? "tts" : null;
    if (!origin || !kind) {
      socket.destroy();
      return;
    }
    voiceProxy.handleUpgrade(request, socket, head, (client) => voiceProxy.emit("connection", client, request, kind));
  });

  return {
    server,
    listen(port = Number(env.PREACHERMAN_SERVICE_PORT) || DEFAULT_PORT) {
      return new Promise((resolveListen, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", () => {
          server.off("error", reject);
          resolveListen(server.address());
        });
      });
    },
    close() {
      for (const client of voiceProxy.clients) client.close();
      return new Promise((resolveClose, reject) => {
        server.close((error) => error ? reject(error) : resolveClose());
      });
    },
  };
}
