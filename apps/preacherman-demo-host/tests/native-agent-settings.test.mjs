import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const packageRoot = join(import.meta.dirname, "..");
const componentPath = join(packageRoot, "src", "settings", "NativeAgentSettings.tsx");
const stylePath = join(packageRoot, "src", "settings", "native-agent-settings.css");

test("Native settings normalize the frozen status and preferences contracts", async () => {
  const source = await readFile(componentPath, "utf8");
  assert.match(source, /export function parseNativeAgentStatus\(payload: unknown\): NativeAgentStatus/);
  assert.match(source, /export function parseNativeAgentDefaults\(payload: unknown\): NativeAgentDefaults/);
  assert.match(source, /id: "preacherman-native"/);
  assert.match(source, /providers: parseProviders\(auth\.providers\)/);
  assert.match(source, /models: parseModels\(provider\.models\)/);
  assert.match(source, /permissionPolicies\.map\(\(value\) => text\(value\)\)\.filter\(Boolean\)/);
  assert.match(source, /license: "MIT"/);
});

test("settings use only the injected service contract and exact write envelope", async () => {
  const source = await readFile(componentPath, "utf8");
  assert.match(source, /export function nativeDefaultsRequest\(defaults: NativeAgentDefaults\): RequestInit \{\s*return \{ method: "PUT", body: JSON\.stringify\(\{ defaults \}\) \};/);
  for (const endpoint of ["/api/execution/native/status", "/api/execution/native/health", "/api/execution/native/preferences"]) assert.match(source, new RegExp(endpoint));
  assert.doesNotMatch(source, /\bfetch\(|type="password"|executable|command|args|env|diagnosticPath|harnessPath|D:\\\\|C:\\\\/i);
  assert.match(source, /serviceRequest<unknown>\("\/api\/execution\/native\/health", \{ method: "POST", body: "\{\}" \}\)/);
  assert.match(source, /Powered by DeepSeek Harness/);
  assert.match(source, /MIT License/);
});

test("catalog controls cannot invent Provider, Model, or policy values", async () => {
  const source = await readFile(componentPath, "utf8");
  assert.match(source, /native\?\.auth\.providers/);
  assert.match(source, /selectedProvider\?\.models/);
  assert.match(source, /native\?\.capabilities\.permissionPolicies/);
  assert.match(source, /provider\.state !== "ready"/);
  assert.match(source, /model\.state !== "ready"/);
  assert.doesNotMatch(source, /<input/);
});

test("standalone styles honor semantic light and dark tokens and responsive states", async () => {
  const styles = await readFile(stylePath, "utf8");
  for (const token of ["text", "muted", "border", "border-strong", "surface", "surface-elevated", "focus", "loading", "error", "control-hover-bg"]) assert.match(styles, new RegExp(`var\\(--demo-theme-${token}\\)`));
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /@media \(max-width:/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i);
});
