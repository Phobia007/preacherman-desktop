import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCharacterConversation } from "../server/characterConversation.mjs";
import { createSpeechMotionService } from "../server/speechMotionService.mjs";

test("motion preference persists per character without changing voice or execution", async t => {
  const dir = await mkdtemp(join(tmpdir(), "preacherman-motion-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const args = { file: join(dir, "characters.json"), connections: { status: async () => ({ active: { mode: "cli", agentId: "codex-cli" } }) } };
  const service = createCharacterConversation(args);
  await service.saveMotion("cortana", { enabled: true, style: "expressive" });
  await service.saveMotion("ai-moe-deepseek", { enabled: false, style: "subtle" });
  const restored = createCharacterConversation(args);
  assert.equal((await restored.settings("cortana")).motion.style, "expressive");
  assert.equal((await restored.motionSettings("ai-moe-deepseek")).enabled, false);
  assert.equal((await restored.settings("cortana")).active.agentId, "codex-cli");
  assert.equal((await restored.motionSettings("zima")).style, "natural");
  await assert.rejects(service.saveMotion("cortana", { enabled: "true", style: "natural" }), /valid motion/);
  await assert.rejects(service.motionSettings("missing-character"), /Unknown character/);
});

test("healthy service is reused and simultaneous reconnects start only one container", async () => {
  let ready = true; const commands = [];
  const service = createSpeechMotionService({ health: async () => ({ state: ready ? "ready" : "unavailable" }),
    exists: async () => {}, portOccupied: async () => false, pause: async () => {},
    run: async args => { commands.push(args); if (args[0] === "compose") ready = true; },
  });
  try {
    await service.start(); assert.equal(commands.length, 0);
    ready = false; await Promise.all([service.start(), service.start(), service.start()]);
    assert.equal(commands.filter(args => args[0] === "compose").length, 1);
    assert.ok(commands[1].includes("D:\\Codex\\speech2motion\\compose.yaml"));
    assert.equal((await service.status()).state, "ready");
  } finally { service.close(); }
});

test("unrelated occupied port and custom endpoints never start another deployment", async () => {
  for (const managed of [true, false]) {
    let calls = 0;
    const service = createSpeechMotionService({ managed, health: async () => ({ state: "unavailable" }),
      exists: async () => {}, portOccupied: async () => true, run: async () => { calls++; },
    });
    try { await service.start(); assert.equal(calls, 0); assert.equal((await service.status()).state, "unavailable"); }
    finally { service.close(); }
  }
});

test("Audio2Face lifecycle reuses its installed D drive deployment", async () => {
  let ready = false; const commands = [];
  const service = createSpeechMotionService({ managed: true, compose: "D:\\Codex\\audio2face\\compose.yaml", port: 18083, serviceName: "Audio2Face",
    health: async () => ({ state: ready ? "ready" : "unavailable" }), exists: async () => {}, portOccupied: async () => false,
    run: async args => { commands.push(args); if (args[0] === "compose") ready = true; } });
  try {
    await service.start(); await service.start();
    assert.equal(commands.filter(args => args[0] === "compose").length, 1);
    assert.ok(commands[1].includes("D:\\Codex\\audio2face\\compose.yaml"));
    assert.equal((await service.status()).state, "ready");
  } finally { service.close(); }
});

test("motion pages use semantic tokens defined for light and dark", async () => {
  const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/surfaces/asset/asset-action.css", import.meta.url), "utf8");
  for (const token of new Set(css.match(/--demo-theme-[\w-]+/g))) assert.ok(styles.split(token + ":").length >= 3, token);
  assert.match(css, /:focus-visible/); assert.doesNotMatch(css, /(?:color|background)\s*:\s*#[\da-f]+/i);
});
