import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const serverUrl = new URL("../server/preachermanServer.mjs", import.meta.url);

test("Settings and voice proxy reuse the Provider Runtime streaming boundary", async () => {
  const source = await readFile(serverUrl, "utf8");
  assert.match(source, /createDashScopeStreamingAdapter/);
  assert.match(source, /preachermanProviderRuntime\.test\(providerId, \{ capability \}\)/);
  const proxy = source.slice(source.indexOf('voiceProxy.on("connection"'));
  assert.match(proxy, /preachermanProviderRuntime\.openStream\("dashscope"/);
  assert.match(proxy, /preachermanProviderRuntime\.sendStream\(providerSessionId/);
  assert.match(proxy, /preachermanProviderRuntime\.closeStream\(providerSessionId/);
  assert.doesNotMatch(proxy, /new WebSocket\(/, "the public voice proxy must not create a second upstream client");
  assert.doesNotMatch(proxy, /DASHSCOPE_API_KEY/, "the public voice proxy must not receive provider credentials");
});
