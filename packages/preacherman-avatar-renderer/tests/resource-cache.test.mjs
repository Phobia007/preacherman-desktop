import assert from "node:assert/strict";
import test from "node:test";
import { transformSync } from "esbuild";
import { readFileSync } from "node:fs";
const code = transformSync(readFileSync(new URL("../src/AsyncResourceCache.ts", import.meta.url), "utf8"), { loader: "ts", format: "esm" }).code;
const { AsyncResourceCache } = await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));

test("LRU obeys count and byte limits, coalesces work and never retains an oversized resource", async () => {
  const cache = new AsyncResourceCache(2, 10, value => value.length);
  let calls = 0;
  const load = () => { calls++; return Promise.resolve("1234"); };
  await Promise.all([cache.get("a", load), cache.get("a", load)]);
  assert.equal(calls, 1);
  await cache.get("b", load); await cache.get("a", load); await cache.get("c", load);
  await cache.get("a", load); assert.equal(calls, 3);
  await cache.get("b", load); assert.equal(calls, 4);
  await cache.get("large", async () => "12345678901");
  assert.equal(cache.snapshot.bytes, 8);
  await cache.get("six", async () => "123456");
  assert.ok(cache.snapshot.entries <= 2); assert.ok(cache.snapshot.bytes <= 10);
});

test("failed requests can retry, and different resources are decoded sequentially", async () => {
  const cache = new AsyncResourceCache(2, 10, () => 1);
  await assert.rejects(cache.get("a", async () => { throw new Error("offline"); }), /offline/);
  assert.equal(cache.snapshot.pending, 0);
  assert.equal(await cache.get("a", async () => "recovered"), "recovered");
  let finish, secondStarted = false;
  const first = cache.get("one", () => new Promise(resolve => { finish = resolve; }));
  const second = cache.get("two", async () => { secondStarted = true; return "two"; });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(secondStarted, false);
  finish("one"); await Promise.all([first, second]);
  assert.equal(secondStarted, true); assert.equal(cache.snapshot.pending, 0);
});
