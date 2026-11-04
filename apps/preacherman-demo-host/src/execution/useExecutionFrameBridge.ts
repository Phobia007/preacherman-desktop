import { useEffect, type RefObject } from "react";
import { preachermanServiceRequest } from "../preacherman/capabilityClient";
import { activeCharacterId } from "../character-state/activeCharacter";
import { confirmPlayback } from "../character-state/playbackReceipt";

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? value as Record<string, unknown> : {};

// Authored frames share appearance; execution is opt-in for conversation surfaces.
// Only public connection metadata crosses this boundary; credentials stay in the service.
export function useExecutionFrameBridge(frameRef: RefObject<HTMLIFrameElement>, executionEnabled = true) {
  useEffect(() => {
    const lifetime = new AbortController();
    let revision = 0;
    const sessions = new Map<string, string>();
    const receipts = new Map<string, { characterId: string; sessionId: string; replyId: string; heardCharacters: number; interrupted: boolean }>();
    const post = (message: unknown) => {
      if (!lifetime.signal.aborted) frameRef.current?.contentWindow?.postMessage(message, location.origin === "null" ? "*" : location.origin);
    };
    const request = (path: string, body?: unknown) => preachermanServiceRequest<unknown>(path, {
      signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(135000)]),
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
      // Capture before awaiting network requests: browsing or activating later cannot reassign this turn.
      const characterId = activeCharacterId();
      try {
        let result: unknown;
        if (data.action === "chat") {
          const sessionKey = `${characterId ?? "none"}:${String(data.conversationId ?? "task").slice(0, 120)}`;
          if (!sessions.has(sessionKey)) sessions.set(sessionKey, crypto.randomUUID());
          const sessionId = sessions.get(sessionKey)!;
          const messages = Array.isArray(data.messages) ? data.messages : [];
          const input = record(messages.at(-1)).content;
          if (characterId && typeof input === "string" && input.length > 4000) throw new Error("Keep character messages within 4,000 characters.");
          if (typeof input === "string" && /^(?:run|execute)\s+(?:(?:the\s+)?plugin\s+tool\s+)?[A-Za-z0-9_-]+::[A-Za-z0-9_.-]+(?:\s|$)/i.test(input.trim())) {
            if (!characterId) throw new Error("Activate a character in Asset before running a skill.");
            const turn = record(await request("/api/agent/turn", { input, locale: "en", characterId }));
            result = { text: turn.displayText, proposal: turn.proposal, characterId };
          } else {
          const settings = record(await request("/api/settings/execution"));
          const local = record(settings.local);
          const active = record(settings.active);
          const selection = data.useActive === true ? { providerId: active.mode === "cli" ? active.agentId : active.connectionId, modelId: active.model } : record(data.selection);
          if (typeof selection.providerId !== "string" || typeof selection.modelId !== "string") throw new Error("Connect a model in Settings → Execution Mode first.");
          if (selection.providerId === local.agentId) {
            if (local.agentId !== "codex-cli") throw new Error("This Agent does not support direct chat yet.");
            result = await request("/api/execution/codex-chat", { model: selection.modelId, messages, characterId, sessionId, replyId: requestId });
          } else {
            result = await request("/api/execution/chat", {
              connectionId: selection.providerId === "deepseek" ? "legacy-deepseek" : selection.providerId,
              model: selection.modelId, messages, characterId, sessionId, replyId: requestId,
            });
          }
          const reply = record(result);
          if (characterId && typeof reply.replyId === "string" && typeof reply.text === "string") {
            if (receipts.size >= 64) receipts.delete(receipts.keys().next().value!);
            receipts.set(requestId, { characterId, sessionId, replyId: reply.replyId, heardCharacters: reply.text.length, interrupted: false });
            result = { ...reply, receiptId: requestId };
          }
          }
        } else if (data.action === "displayed") {
          const receipt = receipts.get(String(data.receiptId));
          if (receipt) { receipts.delete(String(data.receiptId)); void confirmPlayback(receipt.characterId, receipt.sessionId, receipt); }
          result = { accepted: Boolean(receipt) };
        } else if (data.action === "confirm-proposal") {
          if (typeof data.proposalId !== "string" || !/^[a-zA-Z0-9_-]{1,120}$/.test(data.proposalId)) throw new Error("Invalid proposal.");
          const confirmed = record(await request(`/api/agent/proposals/${data.proposalId}/confirm`, { objective: data.objective }));
          result = { task: confirmed.run };
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
      if (data.type === "gallery-theme-request") sendTheme();
      if (executionEnabled && data.type === "gallery-provider-request") void sendCatalog();
      if (executionEnabled && data.type === "gallery-execution-request") void dispatch(data);
    };
    window.addEventListener("message", receive);
    if (executionEnabled) window.addEventListener("preacherman-execution-changed", sendCatalog);
    const observer = new MutationObserver(sendTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-appearance"] });
    return () => {
      lifetime.abort(); observer.disconnect();
      window.removeEventListener("message", receive);
      window.removeEventListener("preacherman-execution-changed", sendCatalog);
    };
  }, [frameRef, executionEnabled]);
}
