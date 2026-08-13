import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const packageRoot = resolve(import.meta.dirname, "..");
const repoRoot = resolve(packageRoot, "../..");
const profileRoot = join(repoRoot, "config", "deepseek-harness", "preacherman-native");
const fixturePath = join(packageRoot, "tests", "fixtures", "deepseek-harness-launch-values.json");

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const sha256 = async (path) => createHash("sha256").update(await readFile(path)).digest("hex");

function resolveHarnessRoot(pin) {
  const candidates = [process.env.DEEPSEEK_HARNESS_ROOT, pin.developmentSourceRoot].filter(Boolean);
  const root = candidates.map((candidate) => resolve(candidate)).find((candidate) =>
    existsSync(join(candidate, "packages", "mcp", "mcp-client", "package.json")));
  assert.ok(root, "Set DEEPSEEK_HARNESS_ROOT to the pinned DeepSeek Harness source checkout.");
  return root;
}

function replaceTokens(value, values) {
  if (typeof value === "string") {
    return value.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, name) => {
      assert.ok(name in values, `launch template token ${name} has no fixture value`);
      return values[name];
    });
  }
  if (Array.isArray(value)) return value.map((item) => replaceTokens(item, values));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceTokens(item, values)]));
  }
  return value;
}

function validateSimpleSchema(value, schema, path = "$") {
  if ("const" in schema) assert.deepEqual(value, schema.const, `${path} must equal its schema const`);
  if (schema.type === "object") {
    assert.ok(value && typeof value === "object" && !Array.isArray(value), `${path} must be an object`);
    for (const key of schema.required ?? []) assert.ok(key in value, `${path}.${key} is required`);
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) assert.ok(key in schema.properties, `${path}.${key} is not allowed`);
    }
    for (const [key, child] of Object.entries(schema.properties ?? {})) {
      if (key in value) validateSimpleSchema(value[key], child, `${path}.${key}`);
    }
  }
  if (schema.type === "array") {
    assert.ok(Array.isArray(value), `${path} must be an array`);
    assert.ok(value.length >= (schema.minItems ?? 0), `${path} has too few items`);
    value.forEach((item, index) => validateSimpleSchema(item, schema.items, `${path}[${index}]`));
  }
  if (schema.type === "string") {
    assert.equal(typeof value, "string", `${path} must be a string`);
    assert.ok(value.length >= (schema.minLength ?? 0), `${path} is too short`);
  }
}

test("Preacherman Native profile pins one Harness release and no Web bundle", async () => {
  const [manifest, pin, patch] = await Promise.all([
    readJson(join(profileRoot, "package.json")),
    readJson(join(profileRoot, "harness-pin.json")),
    readFile(join(profileRoot, "cordis.patch.yml"), "utf8"),
  ]);

  assert.equal(pin.version, "0.1.0-rc.5");
  assert.deepEqual(manifest.dsh.profile.bundles, ["@deepseek-ai/dsh-base"]);
  assert.equal(manifest.dependencies["@deepseek-ai/dsh-acp"], pin.version);
  assert.equal(manifest.dependencies["@deepseek-ai/dsh-mcp-client"], pin.version);
  assert.doesNotMatch(JSON.stringify(manifest), /[~^*]|latest/);
  assert.doesNotMatch(patch, /dsh-web-app|webserver|127\.0\.0\.1:3080/i);
  assert.match(patch, /name: '@deepseek-ai\/dsh-acp'/);
  assert.match(patch, /id: session-telemetry-otel\s+disabled: true/);
});

test("launch template drives the ACP bin with a materialized composition and no inline secret", async () => {
  const [template, overlayTemplate, schema, values] = await Promise.all([
    readJson(join(profileRoot, "launch-template.json")),
    readJson(join(profileRoot, "acp-overlay-template.json")),
    readJson(join(profileRoot, "launch-template.schema.json")),
    readJson(fixturePath),
  ]);
  validateSimpleSchema(template, schema);
  const materialized = replaceTokens(template, values);
  const composition = replaceTokens(overlayTemplate, values);
  assert.equal(materialized.transport, "stdio");
  assert.equal(materialized.webUi, false);
  assert.deepEqual(materialized.args, [values.HARNESS_ACP_BIN, "--config", values.PREACHERMAN_HARNESS_COMPOSITION]);
  assert.equal(materialized.compositionOutput, values.PREACHERMAN_HARNESS_COMPOSITION);
  assert.ok(materialized.requiredFiles.includes(values.PREACHERMAN_MCP_BOOTSTRAP_FILE));
  assert.equal("PREACHERMAN_MCP_BOOTSTRAP_CREDENTIAL" in materialized.env, false);
  assert.doesNotMatch(JSON.stringify([template, overlayTemplate]), /bearer\s+|sk-[a-z0-9]{8,}|bootstrap_credential\s*[:=]/i);
  assert.doesNotMatch(JSON.stringify([materialized, composition]), /\{\{[A-Z0-9_]+\}\}/);

  const include = composition[0];
  assert.match(include.name, /^file:\/\//);
  assert.match(include.config.path, /^file:\/\//);
  const acp = include.config.patches.find((patch) => patch.id === "acp-agent");
  const mcp = include.config.patches.flatMap((patch) => patch.insert ?? []).find((entry) => entry.id === "preacherman-mcp");
  assert.equal(acp.config.provider, values.PROVIDER_ID);
  assert.equal(acp.config.model, values.MODEL_ID);
  assert.equal(mcp.config.command, values.HARNESS_NODE_EXECUTABLE);
  assert.match(mcp.config.env.PREACHERMAN_MCP_GATEWAY_URL, /^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?(?:\/|$)/);
  assert.equal(mcp.config.env.PREACHERMAN_MCP_BOOTSTRAP_FILE, values.PREACHERMAN_MCP_BOOTSTRAP_FILE);
  assert.equal("PREACHERMAN_MCP_BOOTSTRAP_CREDENTIAL" in mcp.config.env, false);
});

test("Cordis patch parses and its MCP row satisfies the pinned Harness schema", async () => {
  const pin = await readJson(join(profileRoot, "harness-pin.json"));
  const harnessRoot = resolveHarnessRoot(pin);
  const harnessManifest = await readJson(join(harnessRoot, "packages", "mcp", "mcp-client", "package.json"));
  assert.equal(harnessManifest.version, pin.version);

  for (const [relativePath, expected] of Object.entries(pin.upstreamContracts)) {
    assert.equal(await sha256(join(harnessRoot, relativePath)), expected, `${relativePath} drifted from the reviewed pin`);
  }

  const appBoot = await import(pathToFileURL(join(harnessRoot, "packages", "boot", "app-boot", "lib", "index.js")));
  const patches = appBoot.loadOverlayPatches("preacherman-native-contract", join(profileRoot, "cordis.patch.yml"));
  assert.ok(Array.isArray(patches));

  const inserted = patches.flatMap((patch) => patch.insert ?? []);
  const mcp = inserted.find((entry) => entry.id === "preacherman-mcp");
  assert.equal(mcp.name, "@deepseek-ai/dsh-mcp-client");
  assert.equal(mcp.config.transport, "stdio");
  assert.equal(mcp.config.serverName, "preacherman");
  assert.equal(mcp.config.failOnStartupError, true);
  assert.equal("PREACHERMAN_MCP_BOOTSTRAP_CREDENTIAL" in mcp.config.env, false);

  const schemaModule = await import(pathToFileURL(join(harnessRoot, "packages", "mcp", "mcp-client", "lib", "index.js")));
  const resolvedConfig = schemaModule.Config({
    ...mcp.config,
    command: process.execPath,
    args: [join(repoRoot, "apps", "preacherman-demo-host", "scripts", "preacherman-mcp-gateway.mjs")],
    env: {
      PREACHERMAN_MCP_GATEWAY_URL: "http://127.0.0.1:8789",
      PREACHERMAN_MCP_BOOTSTRAP_FILE: join(repoRoot, ".runtime-tmp", "mcp-gateway.bootstrap"),
    },
    cwd: repoRoot,
  });
  assert.equal(resolvedConfig.serverName, "preacherman");
  assert.equal(resolvedConfig.reconnect.maxAttempts, 5);
});

test("materialized ACP overlay composes the shipped ACP config and validates the inserted MCP row", async () => {
  const [pin, overlayTemplate, values] = await Promise.all([
    readJson(join(profileRoot, "harness-pin.json")),
    readJson(join(profileRoot, "acp-overlay-template.json")),
    readJson(fixturePath),
  ]);
  const harnessRoot = resolveHarnessRoot(pin);
  const appBoot = await import(pathToFileURL(join(harnessRoot, "packages", "boot", "app-boot", "lib", "index.js")));
  const include = await import(pathToFileURL(join(harnessRoot, "vendor", "include", "lib", "index.js")));
  const schemaModule = await import(pathToFileURL(join(harnessRoot, "packages", "mcp", "mcp-client", "lib", "index.js")));
  const requireFromHarness = createRequire(join(harnessRoot, "package.json"));
  const yaml = await import(pathToFileURL(requireFromHarness.resolve("js-yaml")));
  const materialized = replaceTokens(overlayTemplate, values);
  const root = materialized[0];
  const baseConfigPath = join(harnessRoot, "examples", "acp-agent", "cordis.yml");
  const renderedBase = appBoot.renderConfigDump("preacherman-native-contract", baseConfigPath, []);
  const baseRows = yaml.load(renderedBase, { schema: include.entryListSchema });
  const warnings = [];
  const composed = include.applyEntryPatches(baseRows, root.config.patches, (message) => warnings.push(message));
  assert.match(root.config.path, /examples\/acp-agent\/cordis\.yml$/);
  assert.deepEqual(warnings, []);
  assert.equal(composed.find((entry) => entry.id === "acp-agent").config.provider, values.PROVIDER_ID);

  const mcp = composed.find((entry) => entry.id === "preacherman-mcp");
  const validated = schemaModule.Config(mcp.config);
  assert.equal(validated.serverName, "preacherman");
  assert.equal(validated.failOnStartupError, true);
  assert.equal(typeof include.applyEntryPatches, "function");
});
