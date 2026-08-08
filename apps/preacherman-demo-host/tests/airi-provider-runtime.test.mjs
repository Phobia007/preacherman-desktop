import assert from "node:assert/strict";
import test from "node:test";
import { createAiriProviderRuntime } from "../server/airiProviderRuntime.mjs";

test("provider catalog reports configuration-required without probing unconfigured providers", async () => {
  let calls = 0;
  const runtime = createAiriProviderRuntime({
    getConfig: async () => ({}),
    fetchImpl: async () => { calls += 1; throw new Error("must not run"); },
  });

  const catalog = await runtime.catalog();
  const deepseek = catalog.find(({ id }) => id === "deepseek");
  const dashscope = catalog.find(({ id }) => id === "dashscope");
  assert.equal(deepseek.capabilities.chat.state, "configuration-required");
  assert.equal(dashscope.capabilities.asr.state, "configuration-required");
  assert.equal(dashscope.capabilities.tts.state, "configuration-required");
  assert.deepEqual(await runtime.test("deepseek", { capability: "chat" }), {
    providerId: "deepseek",
    capability: "chat",
    state: "configuration-required",
    ok: false,
    missingRequirements: [{ key: "DEEPSEEK_API_KEY", label: "DeepSeek API key" }],
  });
  assert.equal(calls, 0);
  assert.doesNotMatch(JSON.stringify(catalog), /api-key-value/);
});

test("DeepSeek adapter performs real test and invoke calls while redacting credentials", async () => {
  const secret = "deepseek-secret-value";
  const requests = [];
  const runtime = createAiriProviderRuntime({
    getConfig: async () => ({ DEEPSEEK_API_KEY: secret, DEEPSEEK_MODEL: "deepseek-test" }),
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      if (url.endsWith("/models")) return { ok: true, status: 200, json: async () => ({ data: [] }) };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          model: "deepseek-test",
          choices: [{ message: { content: `reply must hide ${secret}` } }],
          usage: { total_tokens: 7, apiKey: secret },
        }),
      };
    },
  });

  assert.deepEqual(await runtime.test("deepseek", { capability: "chat" }), {
    providerId: "deepseek",
    capability: "chat",
    state: "ready",
    ok: true,
    message: "Connected",
  });
  const result = await runtime.invoke("deepseek", {
    capability: "chat",
    input: { messages: [{ role: "user", content: "Hello" }] },
  });
  assert.equal(result.content, "reply must hide [REDACTED]");
  assert.equal(result.usage.apiKey, "[REDACTED]");
  assert.equal(requests.length, 2);
  assert.equal(requests[0].options.headers.Authorization, `Bearer ${secret}`);
  assert.equal(JSON.parse(requests[1].options.body).model, "deepseek-test");
  assert.doesNotMatch(JSON.stringify(await runtime.catalog()), new RegExp(secret));
  assert.doesNotMatch(JSON.stringify(result), new RegExp(secret));
});

test("plugin adapters declare vision and image capabilities and are removed with their plugin", async () => {
  const secret = "vision-provider-secret";
  const runtime = createAiriProviderRuntime({ getConfig: async () => ({ VISION_API_KEY: secret }) });
  runtime.registerAdapter({
    pluginId: "vision-plugin",
    provider: {
      id: "local-vision",
      label: "Local Vision",
      capabilities: ["vision", "image"],
      requirements: [{ key: "VISION_API_KEY", label: "Vision API key", secret: true }],
    },
    test: async ({ capability }) => ({ ok: true, message: `${capability} ready` }),
    invoke: async ({ capability, input }) => ({ capability, received: input, authorization: secret }),
  });

  const providers = await runtime.catalog({ capability: "vision" });
  assert.equal(providers.find(({ id }) => id === "local-vision").capabilities.vision.state, "ready");
  assert.equal((await runtime.test("local-vision", { capability: "vision" })).ok, true);
  const result = await runtime.invoke("local-vision", { capability: "image", input: { prompt: "portrait" } });
  assert.deepEqual(result, { capability: "image", received: { prompt: "portrait" }, authorization: "[REDACTED]" });
  assert.deepEqual(runtime.removePlugin("vision-plugin"), { adapters: 1, providers: 1 });
  await assert.rejects(() => runtime.get("local-vision"), { code: "PROVIDER_NOT_FOUND" });
});

test("provider adapters receive only configuration keys declared by their provider", async () => {
  let receivedConfig;
  const runtime = createAiriProviderRuntime({
    getConfig: async () => ({
      VISION_API_KEY: "vision-secret",
      VISION_MODEL: "vision-model",
      UNRELATED_API_KEY: "unrelated-api-secret",
      DATABASE_PASSWORD: "database-secret",
    }),
  });
  runtime.registerAdapter({
    pluginId: "isolated-provider",
    provider: {
      id: "isolated-vision",
      label: "Isolated Vision",
      capabilities: ["vision"],
      requirements: [
        { key: "VISION_API_KEY", label: "Vision API key", secret: true },
        { key: "VISION_MODEL", label: "Vision model", secret: false, required: false },
      ],
    },
    invoke: async ({ config }) => {
      receivedConfig = config;
      return { configuration: config };
    },
  });

  const result = await runtime.invoke("isolated-vision", { capability: "vision", input: {} });
  assert.deepEqual(Object.keys(receivedConfig).sort(), ["VISION_API_KEY", "VISION_MODEL"]);
  assert.equal(receivedConfig.UNRELATED_API_KEY, undefined);
  assert.equal(receivedConfig.DATABASE_PASSWORD, undefined);
  assert.deepEqual(result, { configuration: { VISION_API_KEY: "[REDACTED]", VISION_MODEL: "vision-model" } });
  assert.doesNotMatch(JSON.stringify(result), /unrelated-api-secret|database-secret|vision-secret/);
});

test("provider adapters surface bounded timeout and redacted execution errors", async () => {
  const secret = "dashscope-secret-value";
  const runtime = createAiriProviderRuntime({
    getConfig: async () => ({ DASHSCOPE_API_KEY: secret, DASHSCOPE_WORKSPACE_ID: "workspace" }),
    timeoutMs: 20,
  });
  runtime.registerAdapter({
    pluginId: "dashscope-bridge",
    providerId: "dashscope",
    capabilities: ["asr", "tts"],
    test: async () => new Promise(() => {}),
    invoke: async () => { throw new Error(`upstream rejected ${secret}`); },
  });

  await assert.rejects(() => runtime.test("dashscope", { capability: "asr" }), {
    code: "PROVIDER_TIMEOUT",
    statusCode: 504,
  });
  await assert.rejects(
    () => runtime.invoke("dashscope", { capability: "tts", input: { text: "hello" } }),
    (error) => error.code === "PROVIDER_ADAPTER_FAILED" && !error.message.includes(secret) && error.message.includes("[REDACTED]"),
  );
});

test("configured providers without a matching adapter never report ready", async () => {
  const runtime = createAiriProviderRuntime({
    getConfig: async () => ({ DASHSCOPE_API_KEY: "key", DASHSCOPE_WORKSPACE_ID: "workspace" }),
  });
  const dashscope = await runtime.get("dashscope");
  assert.equal(dashscope.capabilities.asr.state, "adapter-required");
  assert.equal(dashscope.capabilities.tts.state, "adapter-required");
  await assert.rejects(
    () => runtime.invoke("dashscope", { capability: "asr", input: {} }),
    { code: "PROVIDER_ADAPTER_REQUIRED", state: "adapter-required" },
  );
});
