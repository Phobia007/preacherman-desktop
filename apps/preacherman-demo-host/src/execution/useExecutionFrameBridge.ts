import { useEffect, type RefObject } from "react";
import { preachermanServiceRequest } from "../preacherman/capabilityClient";

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? value as Record<string, unknown> : {};

// Both authored conversation frames use the host's saved execution configuration.
// Only public connection metadata crosses this boundary; credentials stay in the service.
export function useExecutionFrameBridge(frameRef: RefObject<HTMLIFrameElement>) {
  useEffect(() => {
    const lifetime = new AbortController();
    let revision = 0;
    const post = (message: unknown) => {
      if (!lifetime.signal.aborted) frameRef.current?.contentWindow?.postMessage(message, location.origin === "null" ? "*" : location.origin);
    };
    const request = (path: string, body?: unknown) => preachermanServiceRequest<unknown>(path, {
      signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(70000)]),
      ...(body === undefined ? {} : { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
    });
    const sendTheme = () => {
      const source = document.querySelector(".demo-app-shell") ?? document.documentElement;
      const styles = getComputedStyle(source);
      const theme = Object.fromEntries(["canvas", "text", "muted", "border", "surface", "hover", "focus", "loading", "error"]
        .map(key => [key, styles.getPropertyValue("--demo-theme-settings-" + key).trim()]));
      post({ type: "gallery-conversation-theme", theme, appearance: document.documentElement.dataset.appearance });
    };
    const sendCatalog = async () => {
      const current = ++revision;
      sendTheme();
      try {
        const settings = record(await request("/api/settings/execution"));
        const connections = Array.isArray(settings.connections) ? settings.connections : [];
        const providers = connections.flatMap(value => {
          const item = record(value);
          return typeof item.id === "string" && typeof item.name === "string" && typeof item.model === "string" && item.keySaved
            ? [{ id: item.id, label: item.name, kind: "api", models: [{ id: item.model, label: item.model }] }] : [];
        });
        const local = record(settings.local);
        if (typeof local.agentId === "string") providers.push({
          id: local.agentId, label: typeof local.label === "string" ? local.label : local.agentId, kind: "cli",
          models: [{ id: "default", label: (local.label || local.agentId) + " · default" }],
        });
        if (current === revision) post({ type: "gallery-provider-catalog", providers, active: settings.active });
      } catch {
        if (current === revision) post({ type: "gallery-provider-catalog", providers: [], error: true });
      }
    };
    const dispatch = async (data: Record<string, unknown>) => {
      const requestId = data.requestId;
      if (typeof requestId !== "string" || requestId.length > 100) return;
      try {
        let result: unknown;
        if (data.action === "chat") {
          const selection = record(data.selection);
          if (typeof selection.providerId !== "string" || typeof selection.modelId !== "string") throw new Error("Choose a connected model.");
          const settings = record(await request("/api/settings/execution"));
          const local = record(settings.local);
          if (selection.providerId === local.agentId) {
            const messages = Array.isArray(data.messages) ? data.messages : [];
            result = await request("/api/execution/local-turn", {
              agentId: local.agentId, workspaceId: local.workspaceId, objective: record(messages.at(-1)).content,
            });
          } else {
            result = await request("/api/execution/chat", {
              connectionId: selection.providerId === "deepseek" ? "legacy-deepseek" : selection.providerId,
              model: selection.modelId, messages: data.messages,
            });
          }
        } else {
          if (typeof data.taskId !== "string" || !/^[a-zA-Z0-9_-]{1,120}$/.test(data.taskId)) throw new Error("Invalid task.");
          const path = "/api/tasks/" + encodeURIComponent(data.taskId);
          if (data.action === "status") result = await request(path);
          else if (["approve", "reject", "cancel"].includes(String(data.action))) result = await request(path + "/commands", { type: data.action, approvalId: data.approvalId });
          else throw new Error("Unsupported conversation action.");
        }
        post({ type: "gallery-execution-result", requestId, result });
      } catch (error) {
        post({ type: "gallery-execution-result", requestId, error: error instanceof Error ? error.message : "Execution request failed." });
      }
    };
    const receive = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow || (location.origin !== "null" && event.origin !== location.origin)) return;
      const data = record(event.data);
      if (data.type === "gallery-provider-request") void sendCatalog();
      if (data.type === "gallery-execution-request") void dispatch(data);
    };
    window.addEventListener("message", receive);
    window.addEventListener("preacherman-execution-changed", sendCatalog);
    const observer = new MutationObserver(sendTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-appearance"] });
    return () => {
      lifetime.abort(); observer.disconnect();
      window.removeEventListener("message", receive);
      window.removeEventListener("preacherman-execution-changed", sendCatalog);
    };
  }, [frameRef]);
}
