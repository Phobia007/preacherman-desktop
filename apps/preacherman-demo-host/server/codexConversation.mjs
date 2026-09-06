import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { StringDecoder } from "node:string_decoder";
import { createCodexCliAdapter } from "./local-agent/codexCliAdapter.mjs";
import { validateChatMessages } from "./executionConnections.mjs";

const fail = (message, statusCode = 502) => Object.assign(new Error(message), { statusCode });
const disabledFeatures = ["shell_tool", "unified_exec", "code_mode", "code_mode_host", "apps", "plugins", "hooks",
  "computer_use", "browser_use", "browser_use_external", "image_generation", "view_image", "workspace_dependencies",
  "skill_search", "multi_agent", "multi_agent_v2", "shell_snapshot", "unbounded_connection_retries"];
const chatConfig = {
  ...Object.fromEntries(disabledFeatures.map(name => ["features." + name, false])),
  "features.skip_host_skill_discovery": true, web_search: "disabled", project_doc_max_bytes: 0,
  "skills.include_instructions": false, "memories.use_memories": false, "memories.generate_memories": false,
};
const instructions = "You are the conversational assistant in Preacherman. Answer questions and help plan. " +
  "Use the supplied conversation only. Do not execute commands, inspect files, use tools, create tasks, or request a workspace. " +
  "If asked to act on a project, explain that this surface supports conversation and planning only. Reply in the user's language.";

// A bounded, ephemeral app-server conversation. Normal Codex authentication stays
// inside Codex; this service never reads, copies or converts login credentials.
export function createCodexConversation({ directory, adapter = createCodexCliAdapter(), spawnImpl = spawn, timeoutMs = 120000, env = process.env } = {}) {
  const active = new Set();
  let closed = false;
  return {
    async chat({ messages, model = "default", signal } = {}) {
      const context = validateChatMessages(messages);
      if (context.at(-1).role !== "user") throw fail("A user message is required.", 400);
      if (model !== "default") throw fail("Codex chat currently follows the CLI's configured model.", 400);
      if (closed || active.size >= 2) throw fail("Codex is busy. Wait for the current reply and retry.", 409);
      const cancellation = new AbortController();
      active.add(cancellation);
      const combined = AbortSignal.any([cancellation.signal, ...(signal ? [signal] : []), AbortSignal.timeout(timeoutMs)]);
      let child, timer, finished = false;
      const pending = new Map();
      let resolveTurn, rejectTurn;
      const completed = new Promise((resolve, reject) => { resolveTurn = resolve; rejectTurn = reject; });
      completed.catch(() => {});
      const stop = error => {
        if (finished) return;
        for (const operation of pending.values()) operation.reject(error);
        pending.clear(); rejectTurn(error);
        child?.kill();
      };
      const abort = () => stop(fail(combined.reason?.name === "TimeoutError" ? "Codex reply timed out. Please retry." : "Conversation closed.", 504));
      combined.addEventListener("abort", abort, { once: true });
      try {
        const detection = await adapter.detect();
        if (!detection.installed) throw fail("Codex CLI was not found. Rescan in Settings.", 409);
        if ((await adapter.authStatus()).status !== "ready") throw fail("Sign in to Codex CLI, then reconnect in Settings.", 409);
        combined.throwIfAborted();
        await mkdir(directory, { recursive: true });
        // Dedicated empty application directory, never the selected/user project.
        const args = Object.entries(chatConfig).flatMap(([key, value]) => ["-c", key + "=" + JSON.stringify(value)]);
        args.push("app-server");
        const allowed = /^(APPDATA|CODEX_HOME|HOME|HTTPS?_PROXY|LANG|LC_ALL|LOCALAPPDATA|NO_PROXY|PATH|PATHEXT|SSL_CERT_DIR|SSL_CERT_FILE|SYSTEMROOT|TEMP|TERM|TMP|USERPROFILE|WINDIR)$/i;
        child = spawnImpl(detection.executable, args, { cwd: directory, env: Object.fromEntries(Object.entries(env).filter(([key]) => allowed.test(key))), shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
        let sequence = 0, buffer = "", bytes = 0, threadId;
        const decoder = new StringDecoder("utf8"), replies = new Map();
        const send = data => child.stdin.write(JSON.stringify(data) + "\n");
        const rpc = (method, params) => new Promise((resolve, reject) => {
          const id = ++sequence; pending.set(id, { resolve, reject }); send({ id, method, params });
        });
        child.on("error", () => stop(fail("Could not start the Codex conversation service.")));
        child.stdin.on("error", () => stop(fail("Codex conversation connection closed.")));
        child.on("close", () => { if (!finished) stop(fail("Codex closed before replying. Check its login and model settings.")); });
        // Drain diagnostic output without exposing paths, credentials or private configuration.
        child.stderr.on("data", () => {});
        child.stdout.on("data", chunk => {
          bytes += chunk.length;
          if (bytes > 4 * 1024 * 1024) return stop(fail("Codex response exceeded the supported limit."));
          buffer += decoder.write(chunk);
          const lines = buffer.split("\n"); buffer = lines.pop();
          for (const line of lines) {
            if (!line.trim()) continue;
            let event;
            try { event = JSON.parse(line); } catch { stop(fail("Codex returned an invalid conversation response.")); return; }
            if (event.id !== undefined && !event.method) {
              const operation = pending.get(event.id); pending.delete(event.id);
              if (operation) event.error ? operation.reject(fail("Codex rejected the conversation configuration. Check the CLI version and model access.")) : operation.resolve(event.result);
            } else if (event.id !== undefined) {
              // No implicit approvals, tools, file changes or authentication prompts.
              send({ id: event.id, error: { code: -32601, message: "This client supports text conversation only." } });
              stop(fail("Codex requested an operation that is unavailable in chat. No execution was approved."));
            } else if (event.params?.threadId === threadId) {
              const item = event.params.item;
              if (event.method === "item/started" && item && !["userMessage", "agentMessage", "reasoning", "plan", "contextCompaction"].includes(item.type)) {
                stop(fail("This conversation supports text and planning only. Tool execution is unavailable."));
              }
              if (event.method === "item/completed" && item?.type === "agentMessage") replies.set(item.id, { text: item.text, phase: item.phase });
              if (event.method === "turn/completed") {
                if (event.params.turn?.status !== "completed") stop(fail("Codex could not finish its reply. Check your connection, usage and model access."));
                else {
                  const all = [...replies.values()], final = all.filter(item => item.phase === "final_answer");
                  const text = (final.length ? final : all).map(item => item.text || "").join("\n\n").trim();
                  text ? resolveTurn({ text: text.slice(0, 100000), source: "codex-cli" }) : stop(fail("Codex returned no text. Please retry."));
                }
              }
            }
          }
        });
        await rpc("initialize", { clientInfo: { name: "preacherman_chat", title: "Preacherman", version: "0.1.0" }, capabilities: { experimentalApi: true } });
        send({ method: "initialized", params: {} });
        // Read only server names to disable inherited MCPs before a thread starts.
        const settings = await rpc("config/read", { includeLayers: false });
        const config = { ...chatConfig };
        for (const name of Object.keys(settings.config?.mcp_servers || {})) config["mcp_servers." + name + ".enabled"] = false;
        const started = await rpc("thread/start", { cwd: directory, ephemeral: true, sandbox: "read-only", approvalPolicy: "never", baseInstructions: instructions, developerInstructions: instructions, config });
        threadId = started.thread.id;
        if (context.length > 1) await rpc("thread/inject_items", { threadId, items: context.slice(0, -1).map(({ role, content }) => ({ type: "message", role, ...(role === "assistant" ? { phase: "final_answer" } : {}), content: [{ type: role === "assistant" ? "output_text" : "input_text", text: content }] })) });
        await rpc("turn/start", { threadId, input: [{ type: "text", text: context.at(-1).content }], approvalPolicy: "never", sandboxPolicy: { type: "readOnly", networkAccess: false } });
        return await completed;
      } finally {
        finished = true; active.delete(cancellation); combined.removeEventListener("abort", abort);
        for (const operation of pending.values()) operation.reject(fail("Conversation closed."));
        pending.clear();
        if (child && child.exitCode === null && child.signalCode === null) await new Promise(resolve => {
          child.once("close", resolve); child.stdin.end();
          timer = setTimeout(() => { child.kill(); resolve(); }, 1000);
        });
        clearTimeout(timer);
      }
    },
    close() { closed = true; for (const request of active) request.abort(); },
  };
}
