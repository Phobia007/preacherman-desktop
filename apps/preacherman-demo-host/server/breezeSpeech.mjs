import { access, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { describeBreezeVoice } from "./voiceIdentity.mjs";
import { createVoicePreviewCache } from "./voicePreviewCache.mjs";

export const BREEZE_URL = "http://127.0.0.1:18760";
const fail = (message, statusCode = 503) => Object.assign(new Error(message), { statusCode });

// The installed service owns its model and lifetime. Never accept executable paths or URLs from the browser.
export function createBreezeSpeech({ request = fetch, platform = process.platform, spawnImpl = spawn, previewDirectory, previewTimeoutMs = 15000 } = {}) {
  let starting = null;
  const children = new Set();
  const previews = createVoicePreviewCache({ directory: previewDirectory });
  async function call(path, options = {}, timeout = 2000) {
    const signal = AbortSignal.any([options.signal || new AbortController().signal, AbortSignal.timeout(timeout)]);
    try {
      const response = await request(BREEZE_URL + path, { ...options, signal, redirect: "error" });
      if (!response.ok) {
        await response.body?.cancel();
        throw fail(response.status === 409 ? "Breeze is busy. Wait for the current generation to finish." : response.status === 404 ? "This Breeze voice is no longer available. Refresh the voice collection." : `Breeze request failed (${response.status}).`, response.status === 404 ? 404 : 503);
      }
      return response;
    } catch (error) {
      options.signal?.throwIfAborted();
      if (error.statusCode) throw error;
      throw fail("Breeze is unavailable. Start Breeze TTS 2 on this computer, then refresh voices.");
    }
  }
  async function voices(signal) {
    const list = await (await call("/v1/voices", { signal })).json();
    if (!Array.isArray(list)) throw fail("Breeze returned an invalid voice library.");
    return Promise.all(list.filter(v => v.saved && typeof v.id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v.id)).map(async v => ({
      id: `breeze:${v.id}`, voiceId: v.id, name: v.id, description: typeof v.description === "string" ? v.description : "",
      ...describeBreezeVoice(v),
      revision: createHash("sha256").update(JSON.stringify([v.frames, v.ref_text, v.metadata,
        platform === "win32" ? await stat(join("D:\\AI\\Breeze-TTS-2\\voices", v.id + ".breeze")).then(s => [s.size, s.mtimeMs]).catch(() => null) : null])).digest("hex"),
      provider: "breeze", model: "Breeze-TTS-2", hasPreview: true, source: "breeze",
    })));
  }
  async function synthesize({ text, voiceId, maxNewTokens }, signal) {
    if (typeof text !== "string" || !text.trim() || text.length > 6000) throw fail("Enter between 1 and 6000 characters to speak.", 400);
    if (typeof voiceId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(voiceId)) throw fail("Select a saved Breeze voice first.", 400);
    const response = await call("/v1/audio/speech", { method: "POST", signal, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: text, voice: voiceId, instructions: "", response_format: "wav", seed: 42,
        ...(maxNewTokens ? { max_new_tokens: maxNewTokens } : {}) }) }, 90000);
    const chunks = []; let length = 0;
    try {
      for await (const chunk of response.body) {
        signal?.throwIfAborted(); length += chunk.length;
        if (length > 12 * 1024 * 1024) throw fail("Breeze audio is too long. Ask for a shorter reply.", 502);
        chunks.push(Buffer.from(chunk));
      }
    } catch (error) { signal?.throwIfAborted(); throw error; }
    const audio = Buffer.concat(chunks);
    if (audio.length < 46 || audio.toString("ascii", 0, 4) !== "RIFF" || audio.toString("ascii", 8, 12) !== "WAVE" || audio.toString("ascii", 36, 40) !== "data" || audio.readUInt32LE(24) !== 24000 || (audio.length - 44) % 2) throw fail("Breeze returned invalid WAV audio.", 502);
    // The streaming API uses unknown-length WAV headers; browsers need the completed length for decoding.
    audio.writeUInt32LE(audio.length - 8, 4); audio.writeUInt32LE(audio.length - 44, 40);
    return { audio: audio.toString("base64"), provider: "breeze", voiceId };
  }
  return {
    voices, synthesize,
    async preview(voice, signal) {
      const text = "Hello, it's nice to meet you. This is my voice. I'm ready to chat whenever you are.";
      return previews.get(JSON.stringify([voice.voiceId, voice.revision, text]), async cancellation => {
        const deadline = AbortSignal.timeout(previewTimeoutMs);
        const combined = AbortSignal.any([cancellation, deadline]);
        try { return await synthesize({ text, voiceId: voice.voiceId, maxNewTokens: 125 }, combined); }
        catch (error) {
          cancellation.throwIfAborted();
          if (deadline.aborted) throw fail("Voice preview timed out. Try again after the current generation finishes.", 504);
          throw error;
        }
      }, signal);
    },
    async connect(signal) {
      try { return await voices(signal); } catch (error) { signal?.throwIfAborted(); if (error.statusCode !== 503) throw error; }
      if (platform !== "win32") throw fail("Start Breeze TTS 2 before connecting.");
      if (!starting) starting = (async () => {
        const launcher = "D:\\AI\\Breeze-TTS-2\\Start-Breeze.ps1";
        await access(launcher).catch(() => { throw fail("Breeze is not installed at D:\\AI\\Breeze-TTS-2."); });
        await new Promise((resolve, reject) => {
          const child = spawnImpl("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", launcher, "-NoBrowser"], { windowsHide: true, shell: false, stdio: "ignore" });
          children.add(child);
          const timer = setTimeout(() => { child.kill(); }, 190000);
          child.once("error", error => { clearTimeout(timer); children.delete(child); reject(error); });
          child.once("close", code => { clearTimeout(timer); children.delete(child); code === 0 ? resolve() : reject(fail("Breeze could not start. Open its desktop shortcut to check the installation.")); });
        });
      })().finally(() => { starting = null; });
      await starting; signal?.throwIfAborted(); return voices(signal);
    },
    close() { for (const child of children) child.kill(); children.clear(); return previews.close(); },
  };
}
