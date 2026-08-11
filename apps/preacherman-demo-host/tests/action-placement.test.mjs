import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const packageRoot = join(import.meta.dirname, "..");

test("task actions have one commercial surface owner and optional shortcuts", async () => {
  const source = await readFile(join(packageRoot, "src", "app-shell", "actionPlacement.ts"), "utf8");
  for (const action of ["task.confirm", "task.steer", "task.resume", "task.approve", "task.reject", "task.cancel", "task.retry"]) {
    assert.match(source, new RegExp(`"${action.replace(".", "\\.")}": \\{ owner: "workspace"`));
  }
  assert.match(source, /"task\.create": \{ owner: "home"/);
  assert.match(source, /"task\.events": \{ owner: "ledger"/);
  assert.match(source, /"task\.artifacts": \{ owner: "ledger"/);
  assert.match(source, /"execution\.homerail": \{ owner: "settings"/);
  assert.match(source, /"execution\.acceptance": \{ owner: "test"/);
  assert.match(source, /"execution\.trace": \{ owner: "test"/);
  assert.match(source, /"execution\.console": \{ owner: "settings"/);
});

test("Home and Work share one provider while Home contains no execution controls", async () => {
  const [app, consoleSource] = await Promise.all([
    readFile(join(packageRoot, "src", "App.tsx"), "utf8"),
    readFile(join(packageRoot, "src", "ab", "ABTaskConsole.tsx"), "utf8"),
  ]);
  assert.match(app, /<TaskWorkspaceProvider/);
  assert.match(app, /<ABTaskConsole locale=\{preferences\.locale\} mode="home"/);
  assert.match(app, /<ABTaskConsole locale=\{preferences\.locale\} mode="work"/);
  assert.match(consoleSource, /mode === "work"/);
  assert.match(consoleSource, /data-airi-control="task\.approve"/);
  assert.match(consoleSource, /"task\.resume" : "task\.steer"/);
});
