import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

const validAudio = value => value && typeof value.audio === "string" && value.audio.length > 0 && value.audio.length <= 16 * 1024 * 1024 && typeof value.provider === "string" && typeof value.voiceId === "string";
const cancelled = () => new DOMException("Voice preview cancelled.", "AbortError");

export function createVoicePreviewCache({ directory, maxEntries = 32 } = {}) {
  if ((directory !== undefined && (typeof directory !== "string" || !directory)) || !Number.isInteger(maxEntries) || maxEntries < 1) throw new TypeError("Use a valid optional cache directory and positive entry limit.");
  const memory = new Map(), pending = new Map();
  let closed = false, diskQueue = Promise.resolve();
  const disk = operation => {
    const result = diskQueue.then(operation);
    diskQueue = result.catch(() => {});
    return result;
  };
  function remember(key, audio) {
    memory.delete(key); memory.set(key, audio);
    while (memory.size > maxEntries) memory.delete(memory.keys().next().value);
    return audio;
  }
  async function prune() {
    const files = await readdir(directory, { withFileTypes: true });
    const entries = await Promise.all(files.filter(file => file.isFile() && /^[a-f0-9]{64}\.json$/.test(file.name)).map(async file => {
      const path = join(directory, file.name);
      return { path, time: (await stat(path)).mtimeMs };
    }));
    entries.sort((a, b) => b.time - a.time || a.path.localeCompare(b.path));
    await Promise.all(entries.slice(maxEntries).map(file => unlink(file.path)));
  }
  async function persist(key, audio, signal) {
    const temporary = join(directory, `${key}.${randomUUID()}.tmp`);
    const path = join(directory, `${key}.json`);
    await disk(async () => {
      signal.throwIfAborted();
      await mkdir(directory, { recursive: true });
      try {
        await writeFile(temporary, JSON.stringify(audio), { flag: "wx", signal });
        signal.throwIfAborted();
        await rename(temporary, path);
        if (signal.aborted) { await unlink(path).catch(() => {}); signal.throwIfAborted(); }
        await prune();
        if (signal.aborted) { await unlink(path).catch(() => {}); signal.throwIfAborted(); }
      } finally { await unlink(temporary).catch(() => {}); }
    });
  }
  async function generate(create, signal) {
    signal.throwIfAborted();
    let stop;
    const aborted = new Promise((_, reject) => {
      stop = () => reject(signal.reason);
      signal.addEventListener("abort", stop, { once: true });
    });
    try { return await Promise.race([Promise.resolve().then(() => { signal.throwIfAborted(); return create(signal); }), aborted]); }
    finally { signal.removeEventListener("abort", stop); }
  }
  async function load(key, create, signal) {
    signal.throwIfAborted();
    let audio;
    try {
      if (directory) {
        const path = join(directory, `${key}.json`);
        if ((await stat(path)).size <= 17 * 1024 * 1024) audio = JSON.parse(await readFile(path, { encoding: "utf8", signal }));
      }
    } catch { /* Missing or invalid cached data is regenerated. */ }
    signal.throwIfAborted();
    if (validAudio(audio)) {
      if (directory) await disk(prune).catch(() => {});
    } else {
      audio = await generate(create, signal);
      signal.throwIfAborted();
      if (!validAudio(audio)) throw new Error("Voice preview generation returned invalid audio.");
      // A cache write failure must not prevent successful speech from being heard.
      if (directory) await persist(key, audio, signal).catch(() => { signal.throwIfAborted(); });
    }
    signal.throwIfAborted();
    return remember(key, audio);
  }
  return {
    async get(key, create, signal) {
      signal?.throwIfAborted();
      if (closed) throw cancelled();
      const hash = createHash("sha256").update(key).digest("hex");
      if (memory.has(hash)) return remember(hash, memory.get(hash));
      let entry = pending.get(hash);
      if (!entry) {
        entry = { controller: new AbortController(), waiters: new Set(), done: false };
        pending.set(hash, entry);
        entry.promise = Promise.resolve().then(() => load(hash, create, entry.controller.signal)).finally(() => {
          entry.done = true;
          if (pending.get(hash) === entry) pending.delete(hash);
        });
      }
      return new Promise((resolve, reject) => {
        const waiter = {};
        let settled = false;
        entry.waiters.add(waiter);
        const finish = (value, failed) => {
          if (settled) return;
          settled = true;
          signal?.removeEventListener("abort", abort);
          entry.waiters.delete(waiter);
          if (!entry.done && entry.waiters.size === 0) {
            entry.controller.abort(cancelled());
            if (pending.get(hash) === entry) pending.delete(hash);
          }
          failed ? reject(value) : resolve(value);
        };
        const abort = () => finish(signal.reason, true);
        signal?.addEventListener("abort", abort, { once: true });
        entry.promise.then(value => finish(value, false), error => finish(error, true));
        if (signal?.aborted) abort();
      });
    },
    async close() {
      closed = true; memory.clear();
      const active = [...pending.values()];
      for (const entry of active) entry.controller.abort(cancelled());
      await Promise.allSettled(active.map(entry => entry.promise));
      await diskQueue;
    },
  };
}
