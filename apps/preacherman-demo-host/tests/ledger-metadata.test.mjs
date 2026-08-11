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
  assert.match(types, /readonly actor\?: string/);
  assert.match(types, /readonly proposalHash: string/);
  assert.match(screen, /task\.approvalHistory\.at\(-1\)\?\.actor/);
  assert.match(screen, /task\.approvalHistory\.at\(-1\)\?\.decidedAt/);
});

test("Ledger Chinese copy is valid UTF-8 and its metadata uses semantic theme tokens", async () => {
  const [screenBuffer, styles] = await Promise.all([
    readFile(join(packageRoot, "src", "conversation", "ConversationLedgerScreen.tsx")),
    readFile(join(packageRoot, "src", "styles.css"), "utf8"),
  ]);
  const screen = new TextDecoder("utf-8", { fatal: true }).decode(screenBuffer);
  for (const label of ["任务与会话账本", "可审阅的任务记录", "任务与尝试", "参数摘要", "任务生成产物后，会在这里留下可审阅引用。"])
    assert.match(screen, new RegExp(label));
  assert.doesNotMatch(screen, /\uFFFD|娴兼俺鐦絴鐠佹澘绻倈娴溠呭⒖|閻愮懓鍤?/);
  assert.match(styles, /\.demo-ledger__metadata[\s\S]*var\(--demo-theme-muted\)[\s\S]*var\(--demo-theme-text\)/);
  assert.match(styles, /\.demo-ledger\s*\{[\s\S]*grid-template-rows:[\s\S]*padding:\s*162px 260px 108px;/);
  assert.match(screen, /demo-ledger__mode-tabs/);
});
