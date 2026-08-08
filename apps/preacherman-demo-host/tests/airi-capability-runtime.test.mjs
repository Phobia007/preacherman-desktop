import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { createAiriCapabilityRuntime } from "../server/airiCapabilityRuntime.mjs";

async function runtimeFor(t, overrides = {}) {
  const directory = await mkdtemp(join(import.meta.dirname, ".tmp-airi-capabilities-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return createAiriCapabilityRuntime({
    file: join(directory, "events.json"),
    getRuntimeEnv: async () => ({}),
    ...overrides,
  });
}

test("provider-specific credentials do not mark unrelated families available", async (t) => {
  const runtime = await runtimeFor(t, {
    getRuntimeEnv: async () => ({ DASHSCOPE_API_KEY: "configured", DASHSCOPE_WORKSPACE_ID: "workspace" }),
  });
  const statuses = await runtime.status([
    "voice.asr", "voice.tts", "voice.elevenlabs", "voice.azure-speech", "provider.ollama", "avatar.vrm-import",
  ]);
  assert.deepEqual(statuses.map(({ capabilityId, state }) => [capabilityId, state]), [
    ["voice.asr", "available"],
    ["voice.tts", "available"],
    ["voice.elevenlabs", "external-runtime-required"],
    ["voice.azure-speech", "external-runtime-required"],
    ["provider.ollama", "external-runtime-required"],
    ["avatar.vrm-import", "external-runtime-required"],
  ]);
});

test("async runtime status resolver is authoritative and validated", async (t) => {
  const runtime = await runtimeFor(t, {
    resolveCapabilityStatus: async (capabilityId) => capabilityId === "connection.discord"
      ? { state: "configuration-required", adapter: "airi-connection", requirements: ["bot token"] }
      : undefined,
  });
  const [status] = await runtime.status(["connection.discord"]);
  assert.equal(status.state, "configuration-required");
  assert.equal(status.adapter, "airi-connection");
  assert.deepEqual(status.requirements, ["bot token"]);
});

test("blocked execution cannot be recorded as backend success", async (t) => {
  const runtime = await runtimeFor(t, {
    executeCapability: async () => ({
      status: "external-runtime-required",
      summary: "Desktop adapter required.",
    }),
  });
  const event = await runtime.invoke("computer-use.desktop", { surface: "workspace", locale: "en" });
  assert.equal(event.state, "external-runtime-required");
  assert.equal(event.execution.status, "external-runtime-required");
  assert.equal(event.message, "Desktop adapter required.");
  assert.deepEqual((await runtime.list()).map((entry) => entry.eventId), [event.eventId]);
});

test("host operations can record a safe event without executing the capability twice", async (t) => {
  let executions = 0;
  const runtime = await runtimeFor(t, {
    executeCapability: async () => { executions += 1; },
  });
  const event = await runtime.record("agent.plugin-tools", {
    surface: "work",
    execution: {
      status: "succeeded",
      summary: "Plugin tool completed.",
      taskId: "task-1",
      toolName: "example::summarize",
      artifactPath: "summary.json",
      secret: "must-not-be-recorded",
    },
  });
  assert.equal(executions, 0);
  assert.equal(event.execution.taskId, "task-1");
  assert.equal(event.execution.secret, undefined);
  assert.deepEqual((await runtime.list()).map((entry) => entry.eventId), [event.eventId]);
});
