import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPreachermanServer } from "../server/preachermanServer.mjs";

test("first service start creates private local ecosystem state without developer setup", async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), "preacherman-first-start-"));
  const service = createPreachermanServer({ env: { PREACHERMAN_DATA_DIR: dataDir } });
  await service.listen(0);
  t.after(async () => {
    await service.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  for (const name of ["airi-plugins.v1.json", "airi-memory-persona.v1.json", "airi-observability.v1.json"]) {
    await access(join(dataDir, name));
    assert.doesNotMatch(await readFile(join(dataDir, name), "utf8"), /api[_-]?key|bearer\s+|password/i);
  }
  await access(join(dataDir, "vision-inputs"));
  await access(join(dataDir, "plugins"));
  const plugins = JSON.parse(await readFile(join(dataDir, "airi-plugins.v1.json"), "utf8"));
  assert.equal(plugins.builtinEnabled, true);
  assert.deepEqual(plugins.sources, []);
});
