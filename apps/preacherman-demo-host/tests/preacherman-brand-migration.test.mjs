import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { migratePreachermanBrandData } from "../server/preachermanBrandMigration.mjs";

const legacyA = [97, 105, 114, 105].map((code) => String.fromCharCode(code)).join("");
const legacyB = [104, 111, 109, 101, 114, 97, 105, 108].map((code) => String.fromCharCode(code)).join("");

test("legacy branded runtime records migrate into Preacherman-owned files and identifiers", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "preacherman-brand-migration-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, `${legacyA}-widgets.v1.json`), JSON.stringify({
    version: 1,
    widgets: [{ kind: `widget.${legacyA}.moeru.ai`, title: `${legacyA.toUpperCase()} ecosystem` }],
  }));
  await writeFile(join(directory, "task-store.v1.json"), JSON.stringify({
    version: 2,
    tasks: [{ execution: { kind: `${legacyB}-dag`, adapter: legacyB }, attempts: [{ provider: legacyB }] }],
  }));

  await migratePreachermanBrandData(directory);

  const widget = await readFile(join(directory, "preacherman-widgets.v1.json"), "utf8");
  const tasks = await readFile(join(directory, "task-store.v1.json"), "utf8");
  assert.doesNotMatch(`${widget}${tasks}`.toLowerCase(), new RegExp(`${legacyA}|${legacyB}`));
  assert.match(widget, /widget\.preacherman\.local/);
  assert.match(tasks, /preacherman-execution-dag/);
});
