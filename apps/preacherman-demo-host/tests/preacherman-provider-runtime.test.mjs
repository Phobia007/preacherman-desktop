import assert from "node:assert/strict";
import test from "node:test";
import { createPreachermanProviderRuntime, createDashScopeStreamingAdapter } from "../server/preachermanProviderRuntime.mjs";

test("provider catalog reports configuration-required without probing unconfigured providers", async () => {
  let calls = 0;
  const runtime = createPreachermanProviderRuntime({
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
  assert.deepEqual(await runtime.listModels("deepseek"), {
    providerId: "deepseek",
    state: "configuration-required",
    source: "declared",
    models: [{ id: "deepseek-v4-flash", label: "DeepSeek V4 Flash", capability: "chat", source: "declared" }],
  });
  assert.equal(calls, 0);
  assert.doesNotMatch(JSON.stringify(catalog), /api-key-value/);
});

test("DeepSeek adapter performs real test and invoke calls while redacting credentials", async () => {
  const secret = "deepseek-secret-value";
  const requests = [];
  const runtime = createPreachermanProviderRuntime({
    getConfig: async () => ({ DEEPSEEK_API_KEY: secret, DEEPSEEK_MODEL: "deepseek-test" }),
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      if (url.endsWith("/models")) return { ok: true, status: 200, json: async () => ({ data: [{ id: "deepseek-v4-flash" }] }) };
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
    models: [{ id: "deepseek-v4-flash", label: "deepseek-v4-flash", capability: "chat", source: "provider" }],
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
  assert.deepEqual(await runtime.listModels("deepseek"), {
    providerId: "deepseek",
    state: "ready",
    source: "provider",
    models: [{ id: "deepseek-v4-flash", label: "deepseek-v4-flash", capability: "chat", source: "provider" }],
  });
});

test("core catalog registers LLM, ASR, TTS, and real DashScope vision discovery", async () => {
  const requests = [];
  const runtime = createPreachermanProviderRuntime({
    getConfig: async () => ({ DASHSCOPE_API_KEY: "dashscope-secret", DASHSCOPE_WORKSPACE_ID: "workspace-1" }),
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      if (url.endsWith("/models")) {
        return { ok: true, status: 200, json: async () => ({ data: [{ id: "qwen3-vl-plus" }, { id: "text-only" }] }) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ model: "qwen3-vl-plus", choices: [{ message: { content: "visible" } }], usage: { total_tokens: 5 } }),
      };
    },
  });

  const dashscope = await runtime.get("dashscope");
  assert.deepEqual(Object.keys(dashscope.capabilities), ["asr", "tts", "vision"]);
  assert.equal(dashscope.capabilities.asr.state, "adapter-required");
  assert.equal(dashscope.capabilities.tts.state, "adapter-required");
  assert.equal(dashscope.capabilities.vision.state, "ready");
  assert.deepEqual(dashscope.models.map(({ id, capability }) => [id, capability]), [
    ["qwen3-asr-flash-realtime", "asr"],
    ["qwen3-tts-flash-realtime", "tts"],
    ["qwen3-vl-plus", "vision"],
  ]);
  const tested = await runtime.test("dashscope", { capability: "vision" });
  assert.equal(tested.ok, true);
  assert.deepEqual(tested.models.map(({ id }) => id), ["qwen3-vl-plus"]);
  const invoked = await runtime.invoke("dashscope", {
    capability: "vision",
    input: { messages: [{ role: "user", content: [{ type: "text", text: "Describe the image" }] }] },
  });
  assert.equal(invoked.content, "visible");
  assert.match(requests[0].url, /^https:\/\/workspace-1\.cn-beijing\.maas\.aliyuncs\.com\/compatible-mode\/v1\/models$/);
  assert.equal(requests[0].options.headers.Authorization, "Bearer dashscope-secret");
  assert.doesNotMatch(JSON.stringify(tested), /dashscope-secret/);
});

test("DashScope host streaming adapter coexists with vision and keeps opaque sessions and credentials private", async () => {
  const secret = "dashscope-stream-secret";
  const workspaceId = "stream-workspace";
  const contexts = [];
  const closed = [];
  const events = [];
  let openSignal;

  function protocol(capability) {
    return {
      async test(context) {
        contexts.push({ operation: "test", capability, context });
        return { ok: true, message: `${capability} connected` };
      },
      async open(context) {
        contexts.push({ operation: "open", capability, context });
        openSignal = context.signal;
        context.emit({ type: "partial", text: `heard ${secret}`, authorization: secret });
        return {
          session: { capability, socketSecret: secret },
          metadata: { model: `qwen3-${capability}-realtime`, apiKey: secret },
        };
      },
      async send({ session, event }) {
        assert.equal(session.socketSecret, secret);
        return { accepted: true, event, authorization: secret };
      },
      async close({ session, reason }) {
        closed.push({ capability, session, reason });
        return { ok: true };
      },
    };
  }

  const runtime = createPreachermanProviderRuntime({
    getConfig: async () => ({
      DASHSCOPE_API_KEY: secret,
      DASHSCOPE_WORKSPACE_ID: workspaceId,
      DATABASE_PASSWORD: "must-never-reach-adapter",
    }),
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ data: [] }) }),
  });
  runtime.registerAdapter({
    pluginId: "dashscope-stream-host",
    providerId: "dashscope",
    ...createDashScopeStreamingAdapter({ asr: protocol("asr"), tts: protocol("tts") }),
  });

  const dashscope = await runtime.get("dashscope");
  assert.equal(dashscope.capabilities.asr.state, "ready");
  assert.equal(dashscope.capabilities.tts.state, "ready");
  assert.equal(dashscope.capabilities.vision.state, "ready");
  assert.equal(dashscope.adapter.pluginId, "multiple");
  await assert.rejects(
    () => runtime.invoke("dashscope", { capability: "asr", input: {} }),
    { code: "PROVIDER_INVOKE_UNSUPPORTED", statusCode: 409 },
  );

  assert.equal((await runtime.test("dashscope", { capability: "asr" })).ok, true);
  assert.equal((await runtime.test("dashscope", { capability: "tts" })).ok, true);
  const asrTest = contexts.find(({ operation, capability }) => operation === "test" && capability === "asr").context;
  const ttsTest = contexts.find(({ operation, capability }) => operation === "test" && capability === "tts").context;
  assert.equal(asrTest.apiKey, secret);
  assert.equal(asrTest.workspaceId, workspaceId);
  assert.equal(asrTest.DATABASE_PASSWORD, undefined);
  assert.equal(ttsTest.apiKey, secret);
  assert.equal(ttsTest.workspaceId, undefined);
  assert.equal(ttsTest.DATABASE_PASSWORD, undefined);

  const opened = await runtime.openStream("dashscope", {
    capability: "asr",
    input: { format: "pcm" },
    onEvent: (event) => events.push(event),
  });
  assert.equal(opened.phase, "open");
  assert.match(opened.id, /^provider-stream-/);
  assert.deepEqual(opened.metadata, { model: "qwen3-asr-realtime", apiKey: "[REDACTED]" });
  assert.equal(Object.hasOwn(opened, "session"), false);
  assert.deepEqual(events, [{ type: "partial", text: "heard [REDACTED]", authorization: "[REDACTED]" }]);
  assert.equal(openSignal.aborted, false);
  assert.doesNotMatch(JSON.stringify(opened), new RegExp(secret));

  const sent = await runtime.sendStream(opened.id, { audio: "base64-audio" });
  assert.deepEqual(sent, { accepted: true, event: { audio: "base64-audio" }, authorization: "[REDACTED]" });
  assert.equal(runtime.listStreams().length, 1);
  assert.equal((await runtime.closeStream(opened.id, { reason: "utterance-complete" })).phase, "closed");
  assert.equal(openSignal.aborted, true);
  assert.equal(runtime.listStreams().length, 0);
  assert.equal(closed[0].session.socketSecret, secret);
  assert.equal(closed[0].reason, "utterance-complete");
});

test("DashScope stream timeout, failure redaction, removePlugin, and runtime close own the full session lifecycle", async () => {
  const secret = "dashscope-lifecycle-secret";
  const closed = [];
  const disposed = [];
  const asr = {
    test: async () => ({ ok: true }),
    open: async () => ({ session: { capability: "asr", secret } }),
    send: async () => new Promise(() => {}),
    close: async () => { throw new Error(`socket close rejected ${secret}`); },
    dispose: async () => disposed.push("asr"),
  };
  const tts = {
    test: async () => ({ ok: true }),
    open: async () => ({ session: { capability: "tts", secret } }),
    send: async () => ({ ok: true }),
    close: async ({ session, reason }) => closed.push({ session, reason }),
    dispose: async () => disposed.push("tts"),
  };
  const runtime = createPreachermanProviderRuntime({
    getConfig: async () => ({ DASHSCOPE_API_KEY: secret, DASHSCOPE_WORKSPACE_ID: "workspace" }),
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ data: [] }) }),
    timeoutMs: 20,
  });
  runtime.registerAdapter({
    pluginId: "dashscope-stream-host",
    providerId: "dashscope",
    ...createDashScopeStreamingAdapter({ asr, tts }),
  });

  const asrSession = await runtime.openStream("dashscope", { capability: "asr" });
  await assert.rejects(() => runtime.sendStream(asrSession.id, { audio: "chunk" }), { code: "PROVIDER_TIMEOUT", statusCode: 504 });
  await assert.rejects(
    () => runtime.closeStream(asrSession.id),
    (error) => error.code === "PROVIDER_ADAPTER_FAILED" && error.message.includes("[REDACTED]") && !error.message.includes(secret),
  );
  assert.equal(runtime.listStreams().length, 0);

  const ttsSession = await runtime.openStream("dashscope", { capability: "tts" });
  assert.deepEqual(await runtime.removePlugin("dashscope-stream-host"), { adapters: 1, providers: 0 });
  assert.equal(runtime.listStreams().length, 0);
  assert.equal(closed[0].session.secret, secret);
  assert.equal(closed[0].reason, "plugin-removed");
  assert.deepEqual(disposed.sort(), ["asr", "tts"]);
  const dashscope = await runtime.get("dashscope");
  assert.equal(dashscope.capabilities.asr.state, "adapter-required");
  assert.equal(dashscope.capabilities.tts.state, "adapter-required");
  assert.equal(dashscope.capabilities.vision.state, "ready");

  runtime.registerAdapter({
    pluginId: "dashscope-stream-host",
    providerId: "dashscope",
    ...createDashScopeStreamingAdapter({ tts }),
  });
  await runtime.openStream("dashscope", { capability: "tts" });
  await runtime.close();
  assert.equal(runtime.listStreams().length, 0);
  assert.equal(closed.at(-1).reason, "runtime-closed");
});

test("plugin adapters declare vision and image capabilities and are removed with their plugin", async () => {
  const secret = "vision-provider-secret";
  const runtime = createPreachermanProviderRuntime({ getConfig: async () => ({ VISION_API_KEY: secret }) });
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
  assert.deepEqual(await runtime.removePlugin("vision-plugin"), { adapters: 1, providers: 1 });
  await assert.rejects(() => runtime.get("local-vision"), { code: "PROVIDER_NOT_FOUND" });
});

test("provider adapters receive only configuration keys declared by their provider", async () => {
  let receivedConfig;
  const runtime = createPreachermanProviderRuntime({
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
  const runtime = createPreachermanProviderRuntime({
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
  const runtime = createPreachermanProviderRuntime({
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
