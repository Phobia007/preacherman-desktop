import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("disposing an asynchronously loading Avatar is treated as cancellation, not a console error", async () => {
  const source = await readFile(new URL("../../../packages/preacherman-avatar-renderer/src/avatar/adapters/ThreeAvatarAnimationAdapter.ts", import.meta.url), "utf8");
  const cancellation = source.indexOf('if (this.disposed && error.code === "NOT_LOADED") return error;');
  const consoleError = source.indexOf('console.error("[preacherman.avatar-animation]"');
  assert.ok(cancellation >= 0 && cancellation < consoleError);
});
