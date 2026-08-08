import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const packageRoot = join(import.meta.dirname, "..");
const componentFile = join(packageRoot, "src", "airi", "AiriProviderConnectionsPanel.tsx");
const stylesFile = join(packageRoot, "src", "airi", "airi-provider-connections-panel.css");

test("provider connection loader reads the live catalog, connection, and settings endpoints", async () => {
  const component = await readFile(componentFile, "utf8");
  assert.match(component, /Promise\.all\(\[/);
  assert.match(component, /serviceRequest<[^>]+>\("\/api\/providers\/catalog"\)/);
  assert.match(component, /serviceRequest<[^>]+>\("\/api\/connections"\)/);
  assert.match(component, /serviceRequest<ProviderSettingsStatus>\("\/api\/settings\/providers"\)/);
  assert.match(component, /providers: asArray<ProviderSnapshot>/);
  assert.match(component, /connections: asArray<ConnectionSnapshot>/);
});

test("panel keeps incomplete and unknown connection states visibly blocked", async () => {
  const component = await readFile(componentFile, "utf8");
  assert.match(component, /function normalizeConnectionState[\s\S]*?return "error";/);
  assert.match(component, /\["ready", "configuration-required", "external-runtime-required", "adapter-required", "error"\]\.includes\(status\)/);
  assert.match(component, /\["connected", "disconnected", "testing", "connecting", "disconnecting"\]\.includes\(status\)/);
  assert.match(component, /function normalizeProviderState[\s\S]*?return "error";/);
  assert.match(component, /const state = connection \? normalizeConnectionState\(connection\.status\) : "error"/);
  assert.match(component, /const state = normalizeProviderState\(status\?\.state \|\| "error"\)/);
});

test("panel groups the complete commercial catalog with bilingual and accessible states", async () => {
  const [component, styles] = await Promise.all([readFile(componentFile, "utf8"), readFile(stylesFile, "utf8")]);
  for (const capability of ["chat", "asr", "tts", "vision", "image"]) assert.match(component, new RegExp(`"${capability}"`));
  for (const connection of ["discord", "telegram", "youtube", "minecraft", "factorio"]) assert.match(component, new RegExp(`"${connection}"`));
  for (const state of ["ready", "configuration-required", "external-runtime-required", "adapter-required", "error"]) {
    assert.match(component, new RegExp(state));
    assert.match(styles, new RegExp(`data-state=\\"${state}\\"`));
  }
  assert.match(component, /服务商与外部连接/);
  assert.match(component, /Providers & connections/);
  assert.match(component, /aria-labelledby=\{titleId\}/);
  assert.match(component, /aria-live="polite"/);
  assert.match(component, /role="alert"/);
  assert.match(component, /aria-busy=\{loading\}/);
  assert.match(component, /disabled=\{loading\}/);
  assert.doesNotMatch(component, /method:\s*"DELETE"/);
});

test("ready provider tests require explicit server confirmation and stay disabled otherwise", async () => {
  const [component, styles] = await Promise.all([readFile(componentFile, "utf8"), readFile(stylesFile, "utf8")]);
  assert.match(component, /`\/api\/providers\/\$\{encodeURIComponent\(provider\.id\)\}\/test`/);
  assert.match(component, /method: "POST", body: JSON\.stringify\(\{ capability \}\)/);
  assert.match(component, /response\.result\?\.state !== "ready" \|\| response\.result\.ok !== true/);
  assert.match(component, /disabled=\{state !== "ready" \|\| testStatus\?\.phase === "testing"\}/);
  assert.match(component, /role=\{testStatus\.phase === "failed" \? "alert" : "status"\}/);
  assert.match(component, /Provider test passed/);
  assert.match(component, /服务商测试通过/);
  assert.match(styles, /__test-button/);
  assert.match(styles, /__test-result\[data-state="succeeded"\]/);
  assert.match(styles, /__test-result\[data-state="failed"\]/);
});

test("connection actions follow live status and accept only confirmed response states", async () => {
  const [component, styles] = await Promise.all([readFile(componentFile, "utf8"), readFile(stylesFile, "utf8")]);
  assert.match(component, /action === "disconnect"\) return status === "connected"/);
  assert.match(component, /return status === "disconnected"/);
  assert.match(component, /`\/api\/connections\/\$\{encodeURIComponent\(connection\.id\)\}\/\$\{action\}`/);
  assert.match(component, /method: "POST", body: JSON\.stringify\(\{\}\)/);
  assert.match(component, /const expectedStatus = action === "connect" \? "connected" : "disconnected"/);
  assert.match(component, /updated\.status !== expectedStatus/);
  assert.match(component, /connections: current\.connections\.map/);
  assert.match(component, /\{ operation: action, phase: "running", message: runningMessage \}/);
  assert.match(component, /aria-busy=\{actionBusy && actionStatus\?\.operation === "test"\}/);
  assert.match(component, /aria-busy=\{actionBusy && actionStatus\?\.operation === "connect"\}/);
  assert.match(component, /connection\?\.status === "connected" \? <button/);
  assert.match(component, /disabled=\{!canRunConnectionAction\(connection\?\.status, "test"\) \|\| busy\}/);
  assert.match(component, /disabled=\{!canRunConnectionAction\(connection\?\.status, "connect"\) \|\| busy\}/);
  assert.match(component, /请先在设置中补齐必需配置/);
  assert.match(component, /Register the external runtime adapter/);
  assert.match(component, /role=\{actionStatus\.phase === "failed" \? "alert" : "status"\}/);
  assert.match(styles, /__connection-action-button/);
  assert.match(styles, /__connection-action-result\[data-state="failed"\]/);
});

test("provider settings never rehydrate secrets and run existing real connection tests", async () => {
  const [component, styles] = await Promise.all([readFile(componentFile, "utf8"), readFile(stylesFile, "utf8")]);
  assert.match(component, /type="password"/);
  assert.match(component, /deepseekConfigured: boolean/);
  assert.match(component, /ttsConfigured: boolean/);
  assert.match(component, /method: "PUT", body: JSON\.stringify\(next\)/);
  assert.match(component, /serviceRequest<ProviderSettingsTestResult>\("\/api\/settings\/test", \{ method: "POST"/);
  assert.match(component, /setDeepseekKey\(""\)/);
  assert.match(component, /setDashscopeKey\(""\)/);
  assert.match(component, /setWorkspaceId\(""\)/);
  assert.doesNotMatch(component, /setDeepseekKey\([^)]*(?:response|settings)/);
  assert.doesNotMatch(component, /setDashscopeKey\([^)]*(?:response|settings)/);
  assert.match(component, /密钥内容不会返回，也不会再次显示/);
  assert.match(styles, /__configuration-body input:focus-visible/);
  assert.match(styles, /__configuration-body dd\[data-state="failed"\]/);
});

test("each external connection has a secret-safe configuration form", async () => {
  const [component, styles] = await Promise.all([readFile(componentFile, "utf8"), readFile(stylesFile, "utf8")]);
  assert.match(component, /discord: \[\{ name: "botToken", type: "password" \}\]/);
  assert.match(component, /youtube: \[\{ name: "videoId", type: "text" \}, \{ name: "accessToken", type: "password" \}\]/);
  assert.match(component, /minecraft: \[\{ name: "host", type: "text" \}, \{ name: "port", type: "number" \}, \{ name: "password", type: "password" \}\]/);
  assert.match(component, /`\/api\/connections\/\$\{encodeURIComponent\(connection\.id\)\}\/configure`/);
  assert.match(component, /body: JSON\.stringify\(\{ configuration \}\)/);
  assert.match(component, /connection\.configuration\.secrets\[field\.name\] === true/);
  assert.match(component, /value=\{draft\[field\.name\] \|\| ""\}/);
  assert.match(component, /autoComplete=\{field\.type === "password" \? "new-password" : "off"\}/);
  assert.match(component, /setConnectionDrafts\(\{\}\)/);
  assert.doesNotMatch(component, /value=\{connection\.configuration/);
  assert.match(component, /setConnectionDrafts\(\(current\) => \(\{ \.\.\.current, \[connection\.id\]: \{\} \}\)\)/);
  assert.match(component, /status === "external-runtime-required"[\s\S]*?text\.connectionNeedsRuntime/);
  assert.match(component, /密钥只发送到本地运行时，之后不会返回/);
  assert.match(styles, /__connection-configuration input:focus-visible/);
  assert.match(styles, /__connection-configuration p\[data-state="failed"\]/);
});

test("provider cards distinguish declared models from provider-verified models", async () => {
  const [component, styles] = await Promise.all([readFile(componentFile, "utf8"), readFile(stylesFile, "utf8")]);
  assert.match(component, /readonly source: "declared" \| "provider"/);
  assert.match(component, /Array\.isArray\(response\.result\.models\)/);
  assert.match(component, /models: response\.result\?\.models/);
  assert.match(component, /model\.source === "provider" \? text\.providerModel : text\.declaredModel/);
  assert.match(component, /服务商已验证/);
  assert.match(component, /Declared/);
  assert.match(styles, /__models > summary:focus-visible/);
  assert.match(styles, /__models code/);
});

test("standalone panel styles use the shared light and dark theme contract", async () => {
  const styles = await readFile(stylesFile, "utf8");
  for (const token of ["text", "muted", "border", "surface", "surface-elevated", "focus", "loading", "error", "control-hover-bg"]) {
    assert.match(styles, new RegExp(`var\\(--demo-theme-${token}\\)`));
  }
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /@media \(max-width:/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}\b/i);
});
