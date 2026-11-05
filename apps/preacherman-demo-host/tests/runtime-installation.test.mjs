import assert from "node:assert/strict";
import test from "node:test";
import { resolveRuntimeInstallation } from "../server/runtimeInstallation.mjs";

const machine = { platform: "win32", home: "C:\\Users\\New User", env: { LOCALAPPDATA: "C:\\Users\\New User\\AppData\\Local" }, exists: () => false };

test("a clean machine needs neither a D drive nor the author's username", () => {
  const runtime = resolveRuntimeInstallation(machine);
  assert.equal(runtime.breezeRoot, "C:\\Users\\New User\\AppData\\Local\\Preacherman\\runtime\\breeze");
  assert.equal(runtime.docker, "docker");
  assert.doesNotMatch(JSON.stringify(runtime), /Administrator|D:\\\\AI|D:\\\\Codex/);
});
test("an installer record relocates all components, including paths with spaces", () => {
  const runtime = resolveRuntimeInstallation({ ...machine, exists: file => file.endsWith("runtime-installation.json"),
    read: () => '\uFEFF' + JSON.stringify({ schemaVersion: 1, root: "F:\\My Apps\\Preacherman Runtime" }) });
  assert.equal(runtime.speechRoot, "F:\\My Apps\\Preacherman Runtime\\speech");
  assert.equal(runtime.audioFaceCompose, "F:\\My Apps\\Preacherman Runtime\\audio2face\\compose.yaml");
  assert.equal(runtime.speechMotionCompose, "F:\\My Apps\\Preacherman Runtime\\speech2motion\\compose.yaml");
});
test("trusted environment overrides the installer; malformed records cannot block Home", () => {
  const override = resolveRuntimeInstallation({ ...machine, env: { PREACHERMAN_RUNTIME_ROOT: "G:\\Runtime" }, exists: () => true, read: () => { throw Error(); } });
  assert.equal(override.breezeRoot, "G:\\Runtime\\breeze");
  for (const record of ['{', '{"schemaVersion":1,"root":"relative"}', '{"schemaVersion":99,"root":"F:\\\\Old"}']) {
    assert.equal(resolveRuntimeInstallation({ ...machine, exists: () => true, read: () => record }).root,
      "C:\\Users\\New User\\AppData\\Local\\Preacherman\\runtime");
  }
  assert.throws(() => resolveRuntimeInstallation({ ...machine, env: { PREACHERMAN_RUNTIME_ROOT: "relative" } }), /absolute/);
});
test("existing workstation installations remain in place without copying voices or memories", () => {
  const runtime = resolveRuntimeInstallation({ ...machine, exists: file => /^D:\\(?:AI|Codex)\\/.test(file) });
  assert.equal(runtime.breezeRoot, "D:\\AI\\Breeze-TTS-2");
  assert.equal(runtime.speechRoot, "D:\\AI\\PreachermanSpeech");
  assert.equal(runtime.speechMotionCompose, "D:\\Codex\\speech2motion\\compose.yaml");
});
