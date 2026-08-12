import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const packageRoot = join(import.meta.dirname, "..");

test("Work owns every Preacherman Execution task mutation across the canonical UI states", async () => {
  const source = await readFile(join(packageRoot, "src", "ab", "ABTaskConsole.tsx"), "utf8");
  assert.match(source, /type TaskStatus = "queued" \| "running" \| "waiting_for_input" \| "waiting_for_approval" \| "succeeded" \| "failed" \| "cancelled"/);
  assert.match(source, /data-preacherman-control="task\.confirm"[^]*workspace\.confirm/);
  assert.match(source, /data-preacherman-control="task\.approve"[^]*workspace\.command\("approve"\)/);
  assert.match(source, /data-preacherman-control="task\.reject"[^]*workspace\.command\("reject"\)/);
  assert.match(source, /waiting_for_input[^]*"task\.resume" : "task\.steer"/);
  assert.match(source, /\["queued", "running", "waiting_for_input", "waiting_for_approval"\][^]*data-preacherman-control="task\.cancel"/);
  assert.match(source, /\["failed", "cancelled"\][^]*data-preacherman-control="task\.retry"/);
  assert.match(source, /openLocalSurface\("ledger"\)/);
});

test("Ledger, Settings, and Test keep artifact, configuration, acceptance, and trace actions separate", async () => {
  const [ledger, settings, fusion, placement] = await Promise.all([
    readFile(join(packageRoot, "src", "conversation", "ConversationLedgerScreen.tsx"), "utf8"),
    readFile(join(packageRoot, "src", "settings", "PreachermanExecutionCard.tsx"), "utf8"),
    readFile(join(packageRoot, "src", "preacherman-execution", "PreachermanExecutionFusionPanel.tsx"), "utf8"),
    readFile(join(packageRoot, "src", "app-shell", "actionPlacement.ts"), "utf8"),
  ]);
  assert.match(ledger, /data-preacherman-control="task\.artifacts"/);
  assert.doesNotMatch(ledger, /workspace\.command\("(?:approve|reject|cancel|retry)"\)/);
  assert.doesNotMatch(settings, /execution\.console|advanced console|高级控制台/);
  assert.match(settings, /api\/execution\/providers\/preacherman-execution\/workflows/);
  assert.match(fusion, /data-preacherman-control="execution\.acceptance"/);
  assert.match(fusion, /execution\.trace runtime\.task-attempt-run/);
  assert.match(placement, /"execution\.acceptance": \{ owner: "test"/);
  assert.match(placement, /"execution\.trace": \{ owner: "test"/);
  assert.doesNotMatch(placement, /"execution\.console"/);
});

test("primary navigation never exposes Preacherman Execution implementation concepts", async () => {
  const navigation = await readFile(join(packageRoot, "..", "..", "packages", "preacherman-surface-skin", "src", "surfaces", "workspace", "BottomNavigation.tsx"), "utf8");
  for (const forbidden of ["Preacherman Execution", "Runs", "DAG", "Workers", "Agents"]) assert.doesNotMatch(navigation, new RegExp(`label: [\"']${forbidden}[\"']`, "i"));
  for (const expected of ["Home", "Work", "Gallery", "Lab", "Ledger", "Settings", "Test"]) assert.match(navigation, new RegExp(`label: [\"']${expected}[\"']`));
});
