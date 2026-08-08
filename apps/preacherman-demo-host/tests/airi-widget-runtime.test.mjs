import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { AIRI_WIDGET_KIND, createAiriWidgetRuntime } from "../server/airiWidgetRuntime.mjs";

function definition(id, overrides = {}) {
  return {
    manifest: {
      apiVersion: "v1",
      kind: AIRI_WIDGET_KIND,
      id,
      version: "1.0.0",
      title: `Widget ${id}`,
      placement: "work",
      ...overrides.manifest,
    },
    schema: overrides.schema ?? {
      type: "container",
      orientation: "vertical",
      gap: 8,
      children: [
        { type: "text", text: "Ready", variant: "heading", tone: "primary" },
        { type: "metric", label: "Tasks", value: 3, tone: "success" },
        { type: "progress", label: "Completion", value: 0.75 },
        { type: "button", label: "Open", action: { type: "emit", event: "open-task", payload: { taskId: "task-1" } } },
      ],
    },
  };
}

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "preacherman-widget-"));
  return { directory, file: join(directory, "widgets.json") };
}

test("registers, lists, gets, updates, removes, and persists declarative widgets", async () => {
  const { file } = await fixture();
  let tick = 0;
  const runtime = createAiriWidgetRuntime({ file, now: () => `tick-${tick += 1}` });
  const registered = await runtime.register({ pluginId: "demo-plugin", ...definition("task-card") });

  assert.equal(registered.phase, "ready");
  assert.equal(registered.revision, 1);
  assert.deepEqual(registered.lifecycle.map(({ phase }) => phase), ["registered", "ready"]);
  assert.deepEqual((await runtime.list({ pluginId: "demo-plugin" })).map(({ id }) => id), ["task-card"]);
  assert.equal((await runtime.get({ pluginId: "demo-plugin", id: "task-card" })).schema.children[1].value, 3);

  const updatedDefinition = definition("task-card", {
    manifest: { title: "Updated tasks", version: "1.1.0" },
    schema: { type: "text", text: "4 active tasks" },
  });
  const updated = await runtime.update({ pluginId: "demo-plugin", id: "task-card", ...updatedDefinition });
  assert.equal(updated.revision, 2);
  assert.equal(updated.manifest.title, "Updated tasks");
  assert.deepEqual(updated.lifecycle.map(({ phase }) => phase), ["registered", "ready", "updated", "ready"]);

  const restarted = createAiriWidgetRuntime({ file });
  assert.equal((await restarted.get({ pluginId: "demo-plugin", id: "task-card" })).schema.text, "4 active tasks");
  assert.equal(JSON.parse(await readFile(file, "utf8")).widgets.length, 1);

  const removed = await restarted.remove({ pluginId: "demo-plugin", id: "task-card" });
  assert.equal(removed.phase, "removed");
  assert.deepEqual(await restarted.list(), []);
});

test("enforces ownership isolation while allowing host-wide listing", async () => {
  const { file } = await fixture();
  const runtime = createAiriWidgetRuntime({ file });
  await runtime.register({ pluginId: "alpha-plugin", ...definition("alpha-card") });
  await runtime.register({ pluginId: "beta-plugin", ...definition("beta-card") });

  assert.deepEqual((await runtime.list()).map(({ id }) => id), ["alpha-card", "beta-card"]);
  assert.deepEqual((await runtime.list({ pluginId: "beta-plugin" })).map(({ id }) => id), ["beta-card"]);
  await assert.rejects(runtime.get({ pluginId: "beta-plugin", id: "alpha-card" }), {
    code: "WIDGET_OWNER_MISMATCH",
    statusCode: 403,
  });
  await assert.rejects(runtime.update({ pluginId: "beta-plugin", id: "alpha-card", schema: { type: "text", text: "hijacked" } }), {
    code: "WIDGET_OWNER_MISMATCH",
    statusCode: 403,
  });
  await assert.rejects(runtime.remove({ pluginId: "beta-plugin", id: "alpha-card" }), {
    code: "WIDGET_OWNER_MISMATCH",
    statusCode: 403,
  });
});

test("removePlugin cleans up every widget owned by only that plugin", async () => {
  const { file } = await fixture();
  const runtime = createAiriWidgetRuntime({ file });
  await runtime.register({ pluginId: "alpha-plugin", ...definition("alpha-one") });
  await runtime.register({ pluginId: "alpha-plugin", ...definition("alpha-two") });
  await runtime.register({ pluginId: "beta-plugin", ...definition("beta-one") });

  assert.deepEqual(await runtime.removePlugin("alpha-plugin"), {
    pluginId: "alpha-plugin",
    removed: 2,
    widgetIds: ["alpha-one", "alpha-two"],
  });
  assert.deepEqual((await runtime.list()).map(({ id }) => id), ["beta-one"]);
  assert.deepEqual((await createAiriWidgetRuntime({ file }).list()).map(({ id }) => id), ["beta-one"]);
});

test("rejects executable, unknown, malformed, oversized, and over-complex schema input", async () => {
  const { file } = await fixture();
  const runtime = createAiriWidgetRuntime({ file, maxWidgetBytes: 700, maxDepth: 2, maxNodes: 4 });

  await assert.rejects(runtime.register({
    pluginId: "unsafe-plugin",
    ...definition("html-card", { schema: { type: "text", text: "hello", html: "<script>alert(1)</script>" } }),
  }), { code: "INVALID_WIDGET_SCHEMA", statusCode: 400 });
  await assert.rejects(runtime.register({
    pluginId: "unsafe-plugin",
    ...definition("script-card", { schema: { type: "script", source: "alert(1)" } }),
  }), { code: "INVALID_WIDGET_SCHEMA", statusCode: 400 });
  await assert.rejects(runtime.register({
    pluginId: "unsafe-plugin",
    ...definition("callback-card", { schema: { type: "button", label: "Run", action: { type: "javascript", event: "run" } } }),
  }), { code: "INVALID_WIDGET_SCHEMA", statusCode: 400 });
  await assert.rejects(runtime.register({
    pluginId: "unsafe-plugin",
    ...definition("function-card", { schema: { type: "button", label: "Run", action: { type: "emit", event: "run", payload: { callback() {} } } } }),
  }), { code: "INVALID_WIDGET_SCHEMA", statusCode: 400 });
  await assert.rejects(runtime.register({
    pluginId: "unsafe-plugin",
    ...definition("huge-card", { schema: { type: "text", text: "x".repeat(600) } }),
  }), { code: "WIDGET_TOO_LARGE", statusCode: 413 });
  await assert.rejects(runtime.register({
    pluginId: "unsafe-plugin",
    ...definition("deep-card", { schema: { type: "container", children: [{ type: "container", children: [{ type: "container", children: [{ type: "text", text: "too deep" }] }] }] } }),
  }), { code: "INVALID_WIDGET_SCHEMA", statusCode: 400 });
});

test("rejects duplicate ids, manifest mutation, limits, and corrupt persistence explicitly", async () => {
  const { file } = await fixture();
  const runtime = createAiriWidgetRuntime({ file, maxWidgetsPerPlugin: 1 });
  await runtime.register({ pluginId: "alpha-plugin", ...definition("shared-card") });
  await assert.rejects(runtime.register({ pluginId: "beta-plugin", ...definition("shared-card") }), {
    code: "WIDGET_ALREADY_REGISTERED",
    statusCode: 409,
  });
  await assert.rejects(runtime.register({ pluginId: "alpha-plugin", ...definition("second-card") }), {
    code: "WIDGET_LIMIT_EXCEEDED",
    statusCode: 409,
  });
  await assert.rejects(runtime.update({ pluginId: "alpha-plugin", id: "shared-card", manifest: definition("renamed-card").manifest }), {
    code: "INVALID_WIDGET_MANIFEST",
    statusCode: 409,
  });
  await assert.rejects(runtime.get({ pluginId: "alpha-plugin", id: "missing-card" }), {
    code: "WIDGET_NOT_FOUND",
    statusCode: 404,
  });

  const corruptFile = join((await fixture()).directory, "corrupt.json");
  await writeFile(corruptFile, JSON.stringify({ version: 999, widgets: [] }));
  await assert.rejects(createAiriWidgetRuntime({ file: corruptFile }).list(), {
    code: "WIDGET_STATE_INVALID",
    statusCode: 500,
  });
});
