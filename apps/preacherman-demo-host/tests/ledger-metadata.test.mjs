import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const packageRoot = new URL("..", import.meta.url).pathname.replace(/^\/(?:([A-Za-z]:))/, "$1");

test("Ledger exposes plugin tool identity and the non-sensitive parameter summary", async () => {
  const [types, screen] = await Promise.all([
    readFile(join(packageRoot, "src", "conversationLedger.ts"), "utf8"),
    readFile(join(packageRoot, "src", "conversation", "ConversationLedgerScreen.tsx"), "utf8"),
  ]);

  for (const field of ["pluginId", "providerPluginId", "toolCall", "qualifiedName", "parameterSummary", "byteLength"]) {
    assert.match(types, new RegExp(`\\b${field}\\b`));
  }
  assert.match(screen, /task\.providerPluginId \?\? task\.pluginId/);
  assert.match(screen, /task\.toolCall\.qualifiedName \?\? task\.toolCall\.name/);
  assert.match(screen, /task\.toolCall\.parameterSummary\?\.keys/);
});

test("Ledger Chinese copy is valid UTF-8 and its metadata uses semantic theme tokens", async () => {
  const [screenBuffer, styles] = await Promise.all([
    readFile(join(packageRoot, "src", "conversation", "ConversationLedgerScreen.tsx")),
    readFile(join(packageRoot, "src", "styles.css"), "utf8"),
  ]);
  const screen = new TextDecoder("utf-8", { fatal: true }).decode(screenBuffer);

  for (const label of ["会话账本", "记忆与执行记录", "任务事件", "参数摘要", "任务完成后，产物会出现在这里。"])
    assert.match(screen, new RegExp(label));
  assert.doesNotMatch(screen, /\uFFFD|浼氳瘽|璁板繂|浜х墿|鐐瑰嚮/);
  assert.match(styles, /\.demo-ledger__metadata[\s\S]*var\(--demo-theme-muted\)[\s\S]*var\(--demo-theme-text\)/);
  assert.match(styles, /\.demo-ledger\s*\{[\s\S]*padding-left:\s*448px;[\s\S]*padding-right:\s*72px;/);
});
