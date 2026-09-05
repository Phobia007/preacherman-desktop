import assert from "node:assert/strict";
import test from "node:test";
import { createLocalAgentRegistry } from "../server/local-agent/index.mjs";

function adapter(id = "fixture") {
  return {
    id,
    label: "Fixture",
    kind: "local-subscription-agent",
    detect: async () => ({ installed: true, version: "1.0.0", executable: "/fixture" }),
    authStatus: async () => ({ status: "ready", reason: "fixture" }),
    capabilities: () => ({ progress: true, cancel: true }),
    start: async (input) => ({ runId: "run-1", ...input }),
    events: async (runId, cursor) => ({ runId, cursor }),
    cancel: async (runId) => ({ runId, cancelled: true }),
    close: async () => undefined,
  };
}

test("local agent registry enforces the unified adapter contract and delegates without brand branching", async () => {
  const fixture = adapter();
  const registry = createLocalAgentRegistry({ adapters: [fixture] });
  assert.deepEqual(registry.ids(), ["fixture"]);
  assert.deepEqual((await registry.list())[0], {
    id: "fixture",
    label: "Fixture",
    kind: "local-subscription-agent",
    installed: true,
    version: "1.0.0",
    detection: { state: "detected" },
    auth: { state: "ready", reason: "fixture" },
    capabilities: { progress: true, cancel: true },
  });
  assert.equal((await registry.start("fixture", { taskId: "task-1" })).taskId, "task-1");
  assert.deepEqual(await registry.events("fixture", "run-1", 2), { runId: "run-1", cursor: 2 });
  assert.equal((await registry.cancel("fixture", "run-1")).cancelled, true);
});

test("local agent registry rejects incomplete and duplicate adapters", () => {
  assert.throws(() => createLocalAgentRegistry({ adapters: [{ id: "bad", label: "Bad", kind: "local" }] }), /missing detect/);
  assert.throws(() => createLocalAgentRegistry({ adapters: [adapter("same"), adapter("same")] }), /already registered/);
});

test("local agent registry reports probe failures without hiding healthy adapters", async () => {
  const broken = adapter("broken");
  broken.detect = async () => { throw new Error("probe unavailable"); };
  const [entry] = await createLocalAgentRegistry({ adapters: [broken] }).list();
  assert.equal(entry.installed, false);
  assert.equal(entry.version, null);
  assert.equal(entry.auth.reason, "not-installed");
});
