import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";

let sessionId = null;
let parkedPrompt = null;
let nextRequestId = 10_000;
const pending = new Map();

function send(frame) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...frame })}\n`);
}

function result(id, value) {
  send({ id, result: value });
}

function error(id, message) {
  send({ id, error: { code: -32000, message } });
}

function chunk(text) {
  send({ method: "session/update", params: { sessionId, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text } } } });
}

async function prompt(id, params) {
  const text = params.prompt?.map((block) => block.text ?? "").join("") ?? "";
  if (text.startsWith("fixture:hang")) {
    parkedPrompt = id;
    return;
  }
  if (text.startsWith("fixture:error")) {
    error(id, "model failed with api_key=fixture-secret");
    return;
  }
  if (text.startsWith("fixture:oversized")) {
    chunk("x".repeat(32_768));
    result(id, { stopReason: "end_turn" });
    return;
  }
  if (text.startsWith("fixture:approval")) {
    const requestId = nextRequestId++;
    const permission = new Promise((resolve) => pending.set(requestId, resolve));
    send({
      id: requestId,
      method: "session/request_permission",
      params: {
        sessionId,
        toolCall: { toolCallId: "fixture-tool-call", title: "Write a file", rawInput: { token: "never-project-me" } },
        options: [
          { optionId: "allow", name: "Allow once", kind: "allow_once" },
          { optionId: "reject", name: "Reject once", kind: "reject_once" },
          { optionId: "always", name: "Allow always", kind: "allow_always" },
        ],
      },
    });
    const decision = await permission;
    chunk(`approval:${decision?.outcome?.outcome === "selected" ? decision.outcome.optionId : "cancelled"}`);
  } else chunk("Fixture completed. token=fixture-secret");
  result(id, { stopReason: "end_turn" });
}

function handle(frame) {
  if (frame.method === undefined && pending.has(frame.id)) {
    pending.get(frame.id)(frame.result);
    pending.delete(frame.id);
    return;
  }
  const params = frame.params ?? {};
  switch (frame.method) {
    case "initialize":
      result(frame.id, { protocolVersion: 1, agentCapabilities: { loadSession: false }, authMethods: [] });
      break;
    case "session/new":
      if ((params.mcpServers?.length ?? 0) > 0 || (params.additionalDirectories?.length ?? 0) > 0) error(frame.id, "unsupported scope");
      else {
        sessionId = randomUUID();
        result(frame.id, { sessionId });
      }
      break;
    case "session/prompt":
      void prompt(frame.id, params);
      break;
    case "session/cancel":
      if (parkedPrompt !== null) {
        result(parkedPrompt, { stopReason: "cancelled" });
        parkedPrompt = null;
      }
      break;
    default:
      if (frame.id !== undefined) error(frame.id, `unsupported ${frame.method}`);
  }
}

createInterface({ input: process.stdin }).on("line", (line) => {
  if (line.trim()) handle(JSON.parse(line));
});
