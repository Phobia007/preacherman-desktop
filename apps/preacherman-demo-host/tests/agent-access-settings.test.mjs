import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const packageRoot = join(import.meta.dirname, "..");
const componentFile = join(packageRoot, "src", "settings", "AgentAccessSettings.tsx");
const stylesFile = join(packageRoot, "src", "settings", "agent-access-settings.css");

test("Agent Access is a standalone injected-service panel", async () => {
  const component = await readFile(componentFile, "utf8");
  assert.match(component, /interface AgentAccessSettingsProps[\s\S]*readonly locale: Locale;[\s\S]*readonly serviceRequest: AgentAccessServiceRequest;/);
  assert.match(component, /export function AgentAccessSettings\(\{ locale, serviceRequest \}/);
  assert.doesNotMatch(component, /\bfetch\(/);
  assert.match(component, /data-preacherman-control="mcp\.agent-access"/);
});

test("panel consumes authoritative Gateway, template, session, and Local Agent APIs", async () => {
  const component = await readFile(componentFile, "utf8");
  for (const endpoint of ["/api/mcp/gateway", "/api/mcp/gateway/templates", "/api/mcp/gateway/sessions", "/api/execution/local-agents"]) assert.match(component, new RegExp(endpoint));
  assert.match(component, /"\/api\/mcp\/gateway\/test", \{ method: "POST"/);
  assert.match(component, /"\/api\/mcp\/gateway\/credentials\/rotate", \{ method: "POST"/);
  assert.match(component, /`\/api\/mcp\/gateway\/sessions\/\$\{encodeURIComponent\(sessionId\)\}\/revoke`/);
  assert.doesNotMatch(component, /api\/mcp\/config/);
});

test("four server-generated templates switch, copy, and run the real capabilities probe", async () => {
  const component = await readFile(componentFile, "utf8");
  for (const client of ["codex", "claude-code", "gemini-cli", "generic"]) assert.match(component, new RegExp(`id: "${client}"`));
  assert.match(component, /templates\.find\(\(candidate\) => templateId\(candidate\) === client\)/);
  assert.match(component, /navigator\.clipboard\.writeText\(configText\)/);
  assert.match(component, /disabled=\{state !== "ready" \|\| loading \|\| operation !== ""\}/);
  assert.match(component, /MCP capabilities probe completed successfully/);
  assert.match(component, /MCP capabilities 真实探针测试成功/);
  assert.doesNotMatch(component, /C:\\\\Users|D:\\\\preacherman|\.codex-worktrees/);
});

test("panel renders honest states, safe sessions, security guidance, and advanced controls", async () => {
  const component = await readFile(componentFile, "utf8");
  for (const state of ["ready", "blocked", "error", "loading"]) assert.match(component, new RegExp(`"${state}"`));
  assert.match(component, /sessions\.filter\(\(session\) => !session\.revokedAt\)/);
  assert.match(component, /grantedScopes/);
  assert.match(component, /<details className="agent-access-settings__advanced">/);
  assert.match(component, /Dangerous actions still require approval inside Preacherman/);
  assert.match(component, /危险操作仍必须在 Preacherman 内批准/);
  assert.match(component, /Preacherman never collects that account password/);
  assert.doesNotMatch(component, /type="password"|arbitrary args|dangerously-bypass/);
});

test("loading, errors, copy, test, revoke, and rotate are accessible", async () => {
  const component = await readFile(componentFile, "utf8");
  assert.match(component, /aria-busy=\{loading\}/);
  assert.match(component, /aria-labelledby=\{titleId\}/);
  assert.match(component, /role="alert"/);
  assert.match(component, /role=\{notice\.kind\}/);
  assert.match(component, /aria-selected=\{client === candidate\.id\}/);
  assert.match(component, /role="tablist"/);
  assert.match(component, /disabled=\{!configText \|\| loading \|\| operation !== ""\}/);
});

test("standalone CSS follows the semantic light and dark theme contract", async () => {
  const styles = await readFile(stylesFile, "utf8");
  for (const token of ["text", "muted", "border", "border-strong", "surface", "surface-elevated", "canvas", "focus", "loading", "error", "control-hover-bg"]) assert.match(styles, new RegExp(`var\\(--demo-theme-${token}\\)`));
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /@media \(max-width:/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}\b/i);
  assert.doesNotMatch(styles, /(?:color|background|border(?:-color)?):\s*(?:white|black|rgb\(|hsl\()/i);
});
