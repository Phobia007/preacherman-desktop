import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  AIRI_CONNECTION_CATALOG,
  createAiriConnectionRuntime,
  createDiscordConnectionAdapter,
  createFactorioConnectionAdapter,
  createMinecraftConnectionAdapter,
  createTelegramConnectionAdapter,
  createYouTubeConnectionAdapter,
} from "../server/airiConnectionRuntime.mjs";
import { createDiscordProtocolFixture } from "./fixtures/airi-connections/discord-protocol.mjs";
import { createTelegramProtocolFixture } from "./fixtures/airi-connections/telegram-protocol.mjs";
import { createYouTubeProtocolFixture } from "./fixtures/airi-connections/youtube-protocol.mjs";
import { createMinecraftRconProtocolFixture } from "./fixtures/airi-connections/minecraft-rcon-protocol.mjs";
import { createFactorioRconProtocolFixture } from "./fixtures/airi-connections/factorio-rcon-protocol.mjs";

async function exerciseProtocolAdapter({ service, configuration, secret, adapter, events, operations }) {
  const runtime = createAiriConnectionRuntime();
  runtime.configure(service, configuration);
  runtime.registerAdapter({ pluginId: `${service}-fixture`, service, adapter });
  assert.equal((await runtime.test(service)).status, "disconnected");
  assert.equal((await runtime.connect(service)).status, "connected");
  assert.equal((await runtime.disconnect(service)).status, "disconnected");
  assert.deepEqual(events.map(({ operation }) => operation), operations);
  assert.equal(JSON.stringify(runtime.get(service)).includes(secret), false);
  assert.equal(JSON.stringify(runtime.history({ service })).includes(secret), false);
}

test("connection catalog declares the five demo ecosystems without configured credentials", () => {
  const runtime = createAiriConnectionRuntime({ now: () => "2026-08-08T00:00:00.000Z" });

  assert.deepEqual(runtime.catalog().map(({ id }) => id), ["discord", "telegram", "youtube", "minecraft", "factorio"]);
  assert.deepEqual(AIRI_CONNECTION_CATALOG.map(({ id }) => id), ["discord", "telegram", "youtube", "minecraft", "factorio"]);
  assert.equal(runtime.list().every((connection) => connection.status === "configuration-required"), true);
  assert.equal(runtime.list().every((connection) => connection.adapter === null), true);
  assert.equal(runtime.status("discord").status, "configuration-required");
});

test("configuration survives a real runtime restart in an atomic private file", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "airi-connection-runtime-"));
  const file = join(directory, "connections.json");
  t.after(() => rm(directory, { recursive: true, force: true }));

  const first = createAiriConnectionRuntime({ file });
  assert.throws(() => first.get("youtube"), {
    code: "CONNECTION_RUNTIME_NOT_INITIALIZED",
    statusCode: 409,
  });
  await first.initialize();
  first.configure("youtube", { videoId: "live-video-1", accessToken: "persisted-youtube-secret" });
  first.configure("minecraft", {
    host: "127.0.0.1",
    port: 25575,
    password: "persisted-rcon-secret",
  });
  await first.close();

  assert.deepEqual(await readdir(directory), ["connections.json"]);
  if (process.platform !== "win32") assert.equal((await stat(file)).mode & 0o777, 0o600);

  const second = createAiriConnectionRuntime({ file });
  await second.initialize();
  assert.deepEqual(second.get("youtube").configuration, {
    values: { videoId: "live-video-1" },
    secrets: { accessToken: true },
  });
  assert.deepEqual(second.get("minecraft").configuration, {
    values: { host: "127.0.0.1", port: 25575 },
    secrets: { password: true },
  });
  const publicState = JSON.stringify({ list: second.list(), history: second.history() });
  assert.equal(publicState.includes("persisted-youtube-secret"), false);
  assert.equal(publicState.includes("persisted-rcon-secret"), false);

  let adapterSecret;
  second.registerAdapter({
    pluginId: "youtube-plugin",
    service: "youtube",
    adapter: {
      async test({ configuration }) {
        adapterSecret = configuration.accessToken;
        return { ok: true };
      },
      async connect() { return { connected: true }; },
      async disconnect() { return { disconnected: true }; },
    },
  });
  await second.test("youtube");
  assert.equal(adapterSecret, "persisted-youtube-secret");
  await second.close();

  const stored = await readFile(file, "utf8");
  assert.equal(stored.includes("persisted-youtube-secret"), true);
  assert.deepEqual(await readdir(directory), ["connections.json"]);
});

test("Discord adapter verifies Bot identity and owns a Gateway session", async () => {
  const events = [];
  await exerciseProtocolAdapter({
    service: "discord",
    configuration: { botToken: "discord-secret" },
    secret: "discord-secret",
    adapter: createDiscordConnectionAdapter(createDiscordProtocolFixture(events)),
    events,
    operations: ["getCurrentUser", "openGateway", "closeGateway"],
  });
  assert.equal(events[0].authorization, "Bot discord-secret");
  assert.equal(events[2].sessionId, "discord-gateway-1");
});

test("Telegram adapter verifies getMe and controls the Updates session", async () => {
  const events = [];
  await exerciseProtocolAdapter({
    service: "telegram",
    configuration: { botToken: "telegram-secret" },
    secret: "telegram-secret",
    adapter: createTelegramConnectionAdapter(createTelegramProtocolFixture(events)),
    events,
    operations: ["getMe", "startUpdates", "stopUpdates"],
  });
  assert.equal(events[0].botToken, "telegram-secret");
  assert.equal(events[2].sessionId, "telegram-updates-1");
});

test("YouTube adapter resolves a liveChatId before polling live chat", async () => {
  const events = [];
  await exerciseProtocolAdapter({
    service: "youtube",
    configuration: { videoId: "video-1", accessToken: "youtube-secret" },
    secret: "youtube-secret",
    adapter: createYouTubeConnectionAdapter(createYouTubeProtocolFixture(events)),
    events,
    operations: ["resolveLiveChat", "resolveLiveChat", "startPolling", "stopPolling"],
  });
  assert.equal(events[0].videoId, "video-1");
  assert.equal(events[2].liveChatId, "youtube-live-chat-1");
});

test("Minecraft adapter probes and opens the Minecraft RCON protocol", async () => {
  const events = [];
  await exerciseProtocolAdapter({
    service: "minecraft",
    configuration: { host: "127.0.0.1", port: 25575, password: "minecraft-secret" },
    secret: "minecraft-secret",
    adapter: createMinecraftConnectionAdapter(createMinecraftRconProtocolFixture(events)),
    events,
    operations: ["probe", "open", "close"],
  });
  assert.equal(events[0].command, "list");
  assert.equal(events[1].port, 25575);
});

test("Factorio adapter probes and opens the Factorio RCON protocol", async () => {
  const events = [];
  await exerciseProtocolAdapter({
    service: "factorio",
    configuration: { host: "127.0.0.1", port: 27015, password: "factorio-secret" },
    secret: "factorio-secret",
    adapter: createFactorioConnectionAdapter(createFactorioRconProtocolFixture(events)),
    events,
    operations: ["probe", "open", "close"],
  });
  assert.equal(events[0].command, "/players online");
  assert.equal(events[1].port, 27015);
});

test("configuration stays secret-safe and fake adapter operations are actually invoked", async () => {
  const calls = [];
  const runtime = createAiriConnectionRuntime({ now: () => "2026-08-08T01:00:00.000Z" });

  const configured = runtime.configure("discord", { botToken: "discord-super-secret" });
  assert.equal(configured.status, "external-runtime-required");
  assert.deepEqual(configured.configuration, { values: {}, secrets: { botToken: true } });
  assert.equal(JSON.stringify(configured).includes("discord-super-secret"), false);

  runtime.registerAdapter({
    pluginId: "discord-plugin",
    service: "discord",
    adapter: {
      async test(context) {
        calls.push(["test", context.configuration.botToken, context.signal instanceof AbortSignal]);
        return { ok: true };
      },
      async connect(context) {
        calls.push(["connect", context.configuration.botToken]);
        return { connected: true, session: { opaqueId: "session-1" } };
      },
      async disconnect(context) {
        calls.push(["disconnect", context.session.opaqueId]);
        return { disconnected: true };
      },
    },
  });

  assert.equal((await runtime.test("discord")).lastTest.ok, true);
  assert.deepEqual(
    (({ status, connected }) => ({ status, connected }))(await runtime.connect("discord")),
    { status: "connected", connected: true },
  );
  assert.deepEqual(
    (({ status, connected }) => ({ status, connected }))(await runtime.disconnect("discord")),
    { status: "disconnected", connected: false },
  );
  assert.deepEqual(calls, [
    ["test", "discord-super-secret", true],
    ["connect", "discord-super-secret"],
    ["disconnect", "session-1"],
  ]);
  assert.deepEqual(runtime.history({ service: "discord" }).map(({ type }) => type), [
    "configured",
    "adapter-registered",
    "test-started",
    "test-succeeded",
    "connect-started",
    "connect-succeeded",
    "disconnect-started",
    "disconnect-succeeded",
  ]);
  assert.equal(JSON.stringify(runtime.history()).includes("discord-super-secret"), false);
});

test("missing prerequisites and adapter failures never report a live connection", async () => {
  const runtime = createAiriConnectionRuntime();

  assert.equal((await runtime.connect("telegram")).status, "configuration-required");
  runtime.configure("telegram", { botToken: "token" });
  assert.equal((await runtime.connect("telegram")).status, "external-runtime-required");

  runtime.registerAdapter({
    pluginId: "telegram-plugin",
    service: "telegram",
    adapter: {
      async test() { return { ok: false }; },
      async connect() { return { connected: false }; },
      async disconnect() { return { disconnected: false }; },
    },
  });
  const tested = await runtime.test("telegram");
  assert.equal(tested.status, "error");
  assert.equal(tested.lastTest.ok, false);
  assert.equal((await runtime.connect("telegram")).status, "error");
  assert.equal(runtime.get("telegram").lastError.code, "CONNECTION_ADAPTER_FAILED");
});

test("adapter timeouts are bounded, explicit, and secret-safe", async () => {
  let aborted = false;
  const runtime = createAiriConnectionRuntime({ timeoutMs: 20 });
  runtime.configure("youtube", { videoId: "video-1", accessToken: "youtube-secret" });
  runtime.registerAdapter({
    pluginId: "youtube-plugin",
    service: "youtube",
    adapter: {
      async test() { return { ok: true }; },
      connect({ signal }) {
        signal.addEventListener("abort", () => { aborted = true; }, { once: true });
        return new Promise(() => {});
      },
      async disconnect() { return { disconnected: true }; },
    },
  });

  const result = await runtime.connect("youtube");
  assert.equal(aborted, true);
  assert.equal(result.status, "error");
  assert.equal(result.lastError.code, "CONNECTION_TIMEOUT");
  assert.equal(result.lastError.statusCode, 504);
  assert.equal(JSON.stringify(result).includes("youtube-secret"), false);
});

test("removePlugin and close disconnect and dispose every owned adapter", async () => {
  const calls = [];
  const runtime = createAiriConnectionRuntime();
  const adapter = (service) => ({
    async test() { return { ok: true }; },
    async connect() { calls.push(`${service}:connect`); return { connected: true, session: service }; },
    async disconnect({ session }) { calls.push(`${session}:disconnect`); return { disconnected: true }; },
    async dispose() { calls.push(`${service}:dispose`); },
  });

  runtime.configure("minecraft", { host: "127.0.0.1", port: 25575, password: "mc-secret" });
  runtime.configure("factorio", { host: "127.0.0.1", port: 27015, password: "factorio-secret" });
  runtime.registerAdapter({ pluginId: "game-plugin", service: "minecraft", adapter: adapter("minecraft") });
  runtime.registerAdapter({ pluginId: "game-plugin", service: "factorio", adapter: adapter("factorio") });
  await runtime.connect("minecraft");
  await runtime.connect("factorio");

  assert.deepEqual(await runtime.removePlugin("game-plugin"), { adapters: 2, disconnected: 2, disposed: 2 });
  assert.equal(runtime.get("minecraft").status, "external-runtime-required");
  assert.equal(runtime.get("factorio").status, "external-runtime-required");
  assert.deepEqual(calls, [
    "minecraft:connect",
    "factorio:connect",
    "minecraft:disconnect",
    "minecraft:dispose",
    "factorio:disconnect",
    "factorio:dispose",
  ]);

  runtime.registerAdapter({ pluginId: "new-plugin", service: "minecraft", adapter: adapter("minecraft-2") });
  await runtime.connect("minecraft");
  await runtime.close();
  await runtime.close();
  assert.equal(calls.filter((call) => call === "minecraft-2:dispose").length, 1);
  assert.throws(
    () => runtime.registerAdapter({ pluginId: "late-plugin", service: "discord", adapter: adapter("late") }),
    { code: "CONNECTION_RUNTIME_CLOSED", statusCode: 409 },
  );
});

test("plugin removal stays bounded when adapter disposal ignores cancellation", async () => {
  const runtime = createAiriConnectionRuntime({ timeoutMs: 20 });
  runtime.configure("telegram", { botToken: "token" });
  runtime.registerAdapter({
    pluginId: "stuck-plugin",
    service: "telegram",
    adapter: {
      async test() { return { ok: true }; },
      async connect() { return { connected: true }; },
      async disconnect() { return { disconnected: true }; },
      dispose() { return new Promise(() => {}); },
    },
  });

  const removed = await runtime.removePlugin("stuck-plugin");
  assert.deepEqual(removed, { adapters: 1, disconnected: 0, disposed: 0 });
  assert.equal(runtime.get("telegram").status, "external-runtime-required");
  assert.equal(runtime.history({ service: "telegram" }).at(-2).type, "adapter-dispose-failed");
  assert.equal(runtime.history({ service: "telegram" }).at(-2).code, "CONNECTION_TIMEOUT");
});
