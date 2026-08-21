import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createPreachermanVisionEnhancementRuntime } from "../server/preachermanVisionEnhancementRuntime.mjs";

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

test("workspace vision observations are scoped, persisted without image bytes, and reused after restart", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "preacherman-vision-"));
  const workspace = join(directory, "workspace");
  const file = join(directory, "observations.json");
  await writeFile(join(directory, "outside.png"), png);
  await mkdir(workspace);
  await writeFile(join(workspace, "screen.png"), png);
  t.after(() => rm(directory, { recursive: true, force: true }));

  const calls = [];
  const providerRuntime = {
    get: async () => ({ capabilities: { vision: { state: "ready" } } }),
    invoke: async (providerId, request) => {
      calls.push({ providerId, request });
      return { content: "The screenshot shows a TypeError on line 42.", model: "qwen3-vl-plus" };
    },
  };
  const runtime = createPreachermanVisionEnhancementRuntime({ file, providerRuntime });
  const first = await runtime.analyze({ workspaceRoot: workspace, filePath: "screen.png", question: "Read the error" });
  const second = await runtime.analyze({ workspaceRoot: workspace, filePath: "screen.png", question: "Read the error" });
  assert.equal(first.cacheHit, false);
  assert.equal(second.cacheHit, true);
  assert.equal(first.description, "The screenshot shows a TypeError on line 42.");
  assert.equal(calls.length, 1);
  assert.match(calls[0].request.input.messages[0].content[1].image_url.url, /^data:image\/png;base64,/);

  const restarted = createPreachermanVisionEnhancementRuntime({ file, providerRuntime });
  assert.equal((await restarted.analyze({ workspaceRoot: workspace, filePath: "screen.png", question: "Read the error" })).cacheHit, true);
  assert.equal(calls.length, 1);
  const stored = await readFile(file, "utf8");
  assert.doesNotMatch(stored, /data:image|iVBOR|workspace\\|workspace\//);
  assert.match(stored, /screen\.png/);

  await assert.rejects(
    runtime.analyze({ workspaceRoot: workspace, filePath: join(directory, "outside.png") }),
    { code: "VISION_IMAGE_OUT_OF_SCOPE", statusCode: 403 },
  );
});

test("vision provider configuration and failures are surfaced as stable secret-safe errors", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "preacherman-vision-errors-"));
  const image = join(directory, "screen.png");
  await writeFile(image, png);
  t.after(() => rm(directory, { recursive: true, force: true }));

  const configurationRequired = createPreachermanVisionEnhancementRuntime({
    file: join(directory, "configuration.json"),
    providerRuntime: {
      get: async () => ({ capabilities: { vision: { state: "configuration-required" } } }),
      invoke: async () => { throw Object.assign(new Error("apiKey=super-secret"), { code: "PROVIDER_CONFIGURATION_REQUIRED" }); },
    },
  });
  assert.equal((await configurationRequired.status()).state, "configuration-required");
  await assert.rejects(configurationRequired.analyze({ workspaceRoot: directory, filePath: "screen.png" }), (error) => {
    assert.equal(error.code, "VISION_CONFIGURATION_REQUIRED");
    assert.doesNotMatch(error.message, /super-secret/);
    return true;
  });

  const failed = createPreachermanVisionEnhancementRuntime({
    file: join(directory, "failed.json"),
    providerRuntime: {
      get: async () => ({ capabilities: { vision: { state: "ready" } } }),
      invoke: async () => { throw new Error("Bearer provider-secret"); },
    },
  });
  await assert.rejects(failed.analyze({ workspaceRoot: directory, filePath: "screen.png" }), (error) => {
    assert.equal(error.code, "VISION_PROVIDER_FAILED");
    assert.doesNotMatch(error.message, /provider-secret/);
    return true;
  });
});
