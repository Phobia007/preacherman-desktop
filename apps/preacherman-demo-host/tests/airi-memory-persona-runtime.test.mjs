import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createAiriMemoryPersonaRuntime } from "../server/airiMemoryPersonaRuntime.mjs";

async function withStore(run) {
  const directory = await mkdtemp(join(tmpdir(), "preacherman-memory-"));
  try {
    await run(join(directory, "memory-persona.json"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function tickingClock(start = Date.parse("2026-08-08T00:00:00.000Z")) {
  let tick = start;
  return () => new Date(tick += 1_000).toISOString();
}

test("persona CRUD persists selection and cascades scoped memories", async () => withStore(async (file) => {
  const runtime = createAiriMemoryPersonaRuntime({ file, now: tickingClock() });
  assert.equal(runtime.getLifecycle().phase, "cold");

  const first = await runtime.createPersona({ name: "Airi", description: "Demo guide", instructions: "Be concise" });
  const second = await runtime.createPersona({ name: "Researcher" });
  assert.equal(runtime.getLifecycle().phase, "ready");
  assert.equal((await runtime.getSelectedPersona()).id, first.id);

  await runtime.selectPersona(second.id);
  const updated = await runtime.updatePersona(second.id, { description: "Find evidence" });
  assert.equal(updated.description, "Find evidence");
  assert.deepEqual((await runtime.listPersonas()).map(({ name, selected }) => [name, selected]), [
    ["Airi", false],
    ["Researcher", true],
  ]);

  await runtime.remember({ personaId: second.id, namespace: "work", text: "Prepare the demo" });
  const removed = await runtime.deletePersona(second.id);
  assert.equal(removed.deletedMemories, 1);
  assert.equal((await runtime.getSelectedPersona()).id, first.id);
  assert.deepEqual(await runtime.recall({ personaId: first.id, namespace: "work" }), []);

  await runtime.close();
  assert.equal(runtime.getLifecycle().phase, "stopped");
  await assert.rejects(runtime.listPersonas(), { code: "MEMORY_RUNTIME_CLOSED", statusCode: 409 });
}));

test("memory recall is isolated by persona and namespace and deletion requires the exact scope", async () => withStore(async (file) => {
  const runtime = createAiriMemoryPersonaRuntime({ file, now: tickingClock() });
  const airi = await runtime.createPersona({ name: "Airi" });
  const analyst = await runtime.createPersona({ name: "Analyst" });
  const work = await runtime.remember({ personaId: airi.id, namespace: "work", text: "Ship plugin manager", tags: ["demo"] });
  await runtime.remember({ personaId: airi.id, namespace: "private", text: "Personal preference" });
  await runtime.remember({ personaId: analyst.id, namespace: "work", text: "Ship financial report" });

  assert.deepEqual((await runtime.recall({ personaId: airi.id, namespace: "work", query: "demo" })).map(({ id }) => id), [work.id]);
  assert.equal((await runtime.recall({ personaId: analyst.id, namespace: "work" })).length, 1);
  assert.equal((await runtime.recall({ personaId: airi.id, namespace: "private" })).length, 1);
  await assert.rejects(
    runtime.deleteMemory({ personaId: analyst.id, namespace: "work", memoryId: work.id }),
    { code: "MEMORY_NOT_FOUND", statusCode: 404 },
  );
  assert.equal((await runtime.deleteMemory({ personaId: airi.id, namespace: "work", memoryId: work.id })).deleted, true);
  assert.deepEqual(await runtime.recall({ personaId: airi.id, namespace: "work" }), []);
}));

test("sensitive fields are rejected, credential-like text is redacted, and limits are enforced", async () => withStore(async (file) => {
  const runtime = createAiriMemoryPersonaRuntime({
    file,
    now: tickingClock(),
    limits: { maxPersonas: 1, maxMemoriesPerNamespace: 1, maxMemoryBytes: 100 },
  });
  const persona = await runtime.createPersona({ name: "Airi" });
  await assert.rejects(
    runtime.remember({ personaId: persona.id, namespace: "work", text: "voice note", audio: "base64" }),
    { code: "SENSITIVE_FIELD_REJECTED" },
  );
  await assert.rejects(
    runtime.updatePersona(persona.id, { apiKey: "do-not-store" }),
    { code: "SENSITIVE_FIELD_REJECTED" },
  );

  const memory = await runtime.remember({
    personaId: persona.id,
    namespace: "work",
    text: "Use token=abcdefghijk12345 for the call",
  });
  assert.equal(memory.redacted, true);
  assert.equal(memory.text.includes("abcdefghijk12345"), false);
  assert.equal((await readFile(file, "utf8")).includes("abcdefghijk12345"), false);
  await assert.rejects(
    runtime.remember({ personaId: persona.id, namespace: "work", text: "Second item" }),
    { code: "MEMORY_LIMIT_REACHED", statusCode: 409 },
  );
  await assert.rejects(runtime.createPersona({ name: "Second" }), { code: "PERSONA_LIMIT_REACHED", statusCode: 409 });
}));

test("time-aware memory metadata reports age and expiration", async () => withStore(async (file) => {
  let current = "2026-08-08T12:00:00.000Z";
  const runtime = createAiriMemoryPersonaRuntime({ file, now: () => current, defaultTimezone: "Asia/Shanghai" });
  const persona = await runtime.createPersona({ name: "Airi" });
  const memory = await runtime.remember({
    personaId: persona.id,
    namespace: "schedule",
    text: "Demo rehearsal",
    occurredAt: "2026-08-08T10:00:00+08:00",
    expiresAt: "2026-08-08T13:00:00Z",
    timezone: "Asia/Shanghai",
  });
  assert.equal(memory.temporal.occurredAt, "2026-08-08T02:00:00.000Z");
  assert.equal(memory.temporal.timezone, "Asia/Shanghai");

  current = "2026-08-08T14:00:00.000Z";
  assert.deepEqual(await runtime.recall({ personaId: persona.id, namespace: "schedule" }), []);
  const [expired] = await runtime.recall({ personaId: persona.id, namespace: "schedule", includeExpired: true });
  assert.equal(expired.temporal.isExpired, true);
  assert.equal(expired.temporal.ageMs, 12 * 60 * 60 * 1_000);
}));

test("a new runtime restores personas, selection, and memories from the private JSON store", async () => withStore(async (file) => {
  const firstRuntime = createAiriMemoryPersonaRuntime({ file, now: tickingClock() });
  const persona = await firstRuntime.createPersona({ name: "Persistent Airi", instructions: "Remember locally" });
  const saved = await firstRuntime.remember({ personaId: persona.id, namespace: "demo", text: "The demo is ready" });
  await firstRuntime.close();

  const restarted = createAiriMemoryPersonaRuntime({ file, now: () => "2026-08-09T00:00:00.000Z" });
  await restarted.initialize();
  assert.equal((await restarted.getSelectedPersona()).id, persona.id);
  assert.equal((await restarted.listPersonas())[0].instructions, "Remember locally");
  assert.equal((await restarted.recall({ personaId: persona.id, namespace: "demo" }))[0].id, saved.id);
  assert.deepEqual(restarted.getLifecycle().events.map(({ phase }) => phase), ["cold", "loading", "ready"]);
}));

test("invalid persisted JSON produces an explicit lifecycle error", async () => withStore(async (file) => {
  await writeFile(file, "not-json", "utf8");
  const runtime = createAiriMemoryPersonaRuntime({ file });
  await assert.rejects(runtime.initialize(), { code: "MEMORY_STORE_INVALID", statusCode: 500 });
  assert.equal(runtime.getLifecycle().phase, "error");
}));

test("owner principal isolates remember, recall, and delete without accepting an input override", async () => withStore(async (file) => {
  const host = createAiriMemoryPersonaRuntime({ file, now: tickingClock() });
  const persona = await host.createPersona({ name: "Shared persona" });
  const hostMemory = await host.remember({ personaId: persona.id, namespace: "work", text: "Host-only memory" });
  await assert.rejects(
    host.remember({ personaId: persona.id, namespace: "work", text: "Override", owner: "external-plugin" }),
    /does not support field: owner/,
  );
  await assert.rejects(
    host.recall({ personaId: persona.id, namespace: "work", principal: "external-plugin" }),
    /does not support field: principal/,
  );
  await host.close();

  const plugin = createAiriMemoryPersonaRuntime({ file, principal: "external-plugin", now: tickingClock() });
  assert.deepEqual(await plugin.recall({ personaId: persona.id, namespace: "work" }), []);
  const pluginMemory = await plugin.remember({ personaId: persona.id, namespace: "work", text: "Plugin-only memory" });
  await assert.rejects(
    plugin.deleteMemory({ personaId: persona.id, namespace: "work", memoryId: hostMemory.id }),
    { code: "MEMORY_NOT_FOUND", statusCode: 404 },
  );
  assert.equal((await plugin.recall({ personaId: persona.id, namespace: "work" }))[0].id, pluginMemory.id);
  await plugin.close();

  const restartedHost = createAiriMemoryPersonaRuntime({ file });
  assert.deepEqual((await restartedHost.recall({ personaId: persona.id, namespace: "work" })).map(({ id }) => id), [hostMemory.id]);
}));

test("version 1 memories migrate to the default host owner", async () => withStore(async (file) => {
  const initial = createAiriMemoryPersonaRuntime({ file, now: tickingClock() });
  const persona = await initial.createPersona({ name: "Legacy persona" });
  const memory = await initial.remember({ personaId: persona.id, namespace: "legacy", text: "Legacy memory" });
  await initial.close();

  const legacyState = JSON.parse(await readFile(file, "utf8"));
  legacyState.version = 1;
  delete legacyState.memories[0].owner;
  await writeFile(file, JSON.stringify(legacyState), "utf8");

  const host = createAiriMemoryPersonaRuntime({ file });
  assert.equal((await host.recall({ personaId: persona.id, namespace: "legacy" }))[0].id, memory.id);
  await host.close();
  const migratedState = JSON.parse(await readFile(file, "utf8"));
  assert.equal(migratedState.version, 2);
  assert.equal(migratedState.memories[0].owner, "preacherman-runtime");

  const other = createAiriMemoryPersonaRuntime({ file, principal: "other-owner" });
  assert.deepEqual(await other.recall({ personaId: persona.id, namespace: "legacy" }), []);
}));
