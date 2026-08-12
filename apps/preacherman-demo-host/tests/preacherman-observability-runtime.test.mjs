import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPreachermanObservabilityRuntime } from "../server/preachermanObservabilityRuntime.mjs";

async function createRuntime(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), "preacherman-observability-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, "preacherman-observability.v1.json");
  return { file, runtime: createPreachermanObservabilityRuntime({ file, ...options }) };
}

test("traces real success and failure duration while redacting persisted sensitive values", async (t) => {
  const ticks = [100, 112, 200, 225];
  const { file, runtime } = await createRuntime(t, { clock: () => ticks.shift() });
  t.after(() => runtime.close());

  const result = await runtime.trace({
    caller: "plugin:fixture",
    target: "tool:echo",
    input: { apiKey: "sk-input-secret", nested: { password: "hunter2" }, url: "https://example.test?token=abc123" },
  }, async () => ({ ok: true, authorization: "Bearer output-secret", note: "Bearer visible-secret" }));
  assert.deepEqual(result, { ok: true, authorization: "Bearer output-secret", note: "Bearer visible-secret" }, "tracing must not mutate the real result");

  const failure = Object.assign(new Error("request token=raw-failure-token failed"), { code: "UPSTREAM_FAILURE", statusCode: 502 });
  await assert.rejects(runtime.trace({ caller: "plugin:fixture", target: "provider:chat", input: {} }, async () => { throw failure; }), failure);

  const traces = await runtime.listTraces();
  assert.equal(traces.length, 2);
  assert.deepEqual(traces.map(({ status, durationMs }) => ({ status, durationMs })), [
    { status: "failed", durationMs: 25 },
    { status: "succeeded", durationMs: 12 },
  ]);
  assert.equal(traces[1].input.apiKey, "[REDACTED]");
  assert.equal(traces[1].input.nested.password, "[REDACTED]");
  assert.match(traces[1].input.url, /token=\[REDACTED\]/);
  assert.equal(traces[1].result.authorization, "[REDACTED]");
  assert.equal(traces[1].result.note, "Bearer [REDACTED]");
  assert.match(traces[0].error.message, /token=\[REDACTED\]/);

  const persisted = await readFile(file, "utf8");
  for (const secret of ["sk-input-secret", "hunter2", "abc123", "output-secret", "visible-secret", "raw-failure-token"]) {
    assert.doesNotMatch(persisted, new RegExp(secret), `persisted trace leaked ${secret}`);
  }
  const diagnostics = await runtime.diagnostics();
  assert.equal(diagnostics.traceCount, 2);
  assert.equal(diagnostics.failureCount, 1);
  assert.equal(diagnostics.averageDurationMs, 18.5);

  await runtime.close();
  const restored = createPreachermanObservabilityRuntime({ file });
  t.after(() => restored.close());
  assert.equal((await restored.listTraces()).length, 2, "trace history must survive restart");
});

test("builds Plugin Inspector data and records genuine lifecycle revisions without duplicates", async (t) => {
  const { runtime } = await createRuntime(t);
  t.after(() => runtime.close());
  const plugin = {
    id: "fixture-plugin",
    manifest: { name: "fixture-plugin", apiVersion: "v1", token: "must-not-leak" },
    phase: "ready",
    lifecycle: ["loading", "loaded", "ready"],
    revision: 1,
    kits: ["tools", "task"],
    bindings: ["tools.call", "task.create"],
    error: null,
  };
  const tools = [{ pluginId: "fixture-plugin", name: "fixture-plugin::echo", description: "Echo", requiresApproval: true }];

  const first = await runtime.snapshot({ plugins: [plugin], tools });
  assert.deepEqual(first.plugins[0], {
    id: "fixture-plugin",
    name: "fixture-plugin",
    manifest: { name: "fixture-plugin", apiVersion: "v1", token: "[REDACTED]" },
    phase: "ready",
    revision: 1,
    kits: ["tools", "task"],
    bindings: ["tools.call", "task.create"],
    tools: [{ name: "fixture-plugin::echo", description: "Echo", requiresApproval: true }],
    error: null,
  });
  assert.deepEqual(first.activity.map(({ phase }) => phase), ["ready", "loaded", "loading"]);

  await runtime.syncPluginSessions([plugin]);
  assert.equal((await runtime.listActivity()).length, 3, "unchanged revision must not duplicate lifecycle activity");
  await runtime.syncPluginSessions([{ ...plugin, phase: "failed", lifecycle: ["loading", "failed"], revision: 2, error: "secret=hidden" }]);
  assert.equal((await runtime.listActivity())[0].phase, "failed");
  assert.match(JSON.stringify((await runtime.listActivity())[0].error), /secret=\[REDACTED\]/);
  await runtime.syncPluginSessions([]);
  assert.equal((await runtime.listActivity())[0].phase, "uninstalled");
});

test("records explicit activity and exposes bounded failure diagnostics", async (t) => {
  const { runtime } = await createRuntime(t, { maxEntries: 20 });
  t.after(() => runtime.close());
  await runtime.recordActivity({ pluginId: "fixture", phase: "failed", revision: 3, message: "Bearer activity-secret", error: { apiKey: "hidden" } });
  await runtime.recordTrace({ caller: "plugin:fixture", target: "tool:bad", durationMs: 8, status: "failed", error: { message: "boom" } });
  const activity = await runtime.listActivity({ pluginId: "fixture" });
  assert.equal(activity[0].message, "Bearer [REDACTED]");
  assert.equal(activity[0].error.apiKey, "[REDACTED]");
  const diagnostics = await runtime.diagnostics();
  assert.equal(diagnostics.pluginErrorCount, 1);
  assert.equal(diagnostics.recentFailures[0].target, "tool:bad");
});
