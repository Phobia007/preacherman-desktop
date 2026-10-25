import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createVoicePreviewCache } from "../server/voicePreviewCache.mjs";

const audio = { audio: Buffer.from("test preview").toString("base64"), provider: "breeze", voiceId: "cortana" };
test("omitting the directory keeps previews in bounded memory without filesystem configuration", async () => {
  const cache = createVoicePreviewCache({ maxEntries: 1 });
  let generated = 0;
  const create = async () => { generated++; return audio; };
  try {
    await Promise.all([cache.get("one", create), cache.get("one", create)]);
    assert.equal(generated, 1);
    await cache.get("two", create);
    await cache.get("one", create);
    assert.equal(generated, 3);
    const defaultCache = createVoicePreviewCache();
    assert.deepEqual(await defaultCache.get("default", create), audio);
    await defaultCache.close();
  } finally { await cache.close(); }
});
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function fixture(t, maxEntries = 32) {
  const directory = await mkdtemp(join(tmpdir(), "voice-preview-cache-"));
  const caches = [];
  const open = () => { const cache = createVoicePreviewCache({ directory, maxEntries }); caches.push(cache); return cache; };
  t.after(async () => { for (const cache of caches) await cache.close(); await rm(directory, { recursive: true, force: true }); });
  return { directory, open, cache: open() };
}

test("preview cache reuses identical audio across requests and service restarts while revision changes regenerate", async t => {
  const { cache, open } = await fixture(t);
  let generated = 0;
  const create = async () => { generated++; return audio; };
  assert.deepEqual(await cache.get("cortana:reference-v1:English introduction", create), audio);
  assert.deepEqual(await cache.get("cortana:reference-v1:English introduction", create), audio);
  await cache.close();
  const restarted = open();
  assert.deepEqual(await restarted.get("cortana:reference-v1:English introduction", create), audio);
  assert.equal(generated, 1);
  await restarted.get("cortana:reference-v2:English introduction", create);
  assert.equal(generated, 2);
});

test("overlapping preview requests share generation and one cancellation does not interrupt another listener", async t => {
  const { cache } = await fixture(t);
  const started = deferred(), result = deferred();
  let generationSignal, generated = 0;
  const create = signal => { generationSignal = signal; generated++; started.resolve(); return result.promise; };
  const first = new AbortController();
  const cancelledRequest = cache.get("shared", create, first.signal);
  const cancelledCheck = assert.rejects(cancelledRequest, { name: "AbortError" });
  const remainingRequest = cache.get("shared", create);
  await started.promise;
  first.abort();
  await cancelledCheck;
  assert.equal(generationSignal.aborted, false);
  result.resolve(audio);
  assert.deepEqual(await remainingRequest, audio);
  assert.equal(generated, 1);
  assert.deepEqual(await cache.get("shared", () => assert.fail("cached preview regenerated")), audio);
});

test("failed and fully cancelled generation never poisons the cache and can be retried", async t => {
  const { cache, directory } = await fixture(t);
  await assert.rejects(cache.get("retry", async () => { throw Error("model busy"); }), /model busy/);
  const started = deferred(), late = deferred();
  let generationSignal;
  const controller = new AbortController();
  const request = cache.get("retry", signal => { generationSignal = signal; started.resolve(); return late.promise; }, controller.signal);
  const abortedCheck = assert.rejects(request, { name: "AbortError" });
  await started.promise;
  controller.abort();
  await abortedCheck;
  assert.equal(generationSignal.aborted, true);
  late.resolve({ ...audio, audio: "cancelled" });
  assert.deepEqual(await cache.get("retry", async () => audio), audio);
  assert.deepEqual(await cache.get("retry", () => assert.fail("retry result was not cached")), audio);
  assert.equal((await readdir(directory)).filter(name => name.endsWith(".json")).length, 1);
});

test("cache retention limits memory and disk, and closing aborts outstanding generation", async t => {
  const { cache, directory } = await fixture(t, 2);
  for (const key of ["one", "two", "three"]) await cache.get(key, async () => audio);
  assert.equal((await readdir(directory)).filter(name => name.endsWith(".json")).length, 2);
  const started = deferred();
  const pending = cache.get("unfinished", signal => { started.resolve(); return new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true })); });
  const rejection = assert.rejects(pending, { name: "AbortError" });
  await started.promise;
  await cache.close(); await rejection;
  await assert.rejects(cache.get("one", async () => audio), { name: "AbortError" });
});
