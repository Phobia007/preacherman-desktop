import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { validateSpeechAudio } from "./windowsSpeech.mjs";

const fail = (message, statusCode = 503) => Object.assign(new Error(message), { statusCode });

// An installed, offline capability, like the local CLI. Never download a model or save microphone audio.
// The program is bundled in the sidecar; all input is JSON on stdin, never executable code.
const program = String.raw`
import sys, json, os, importlib.util
sys.stdout.reconfigure(encoding="utf-8")
data = json.load(sys.stdin)
model_path = data["model"]
if not os.path.isfile(model_path) or any(importlib.util.find_spec(name) is None for name in ["whisper", "torch", "numpy"]):
    print(json.dumps({"available": False})); sys.exit(0)
if data["action"] == "status":
    print(json.dumps({"available": True, "engine": "whisper", "model": "base"})); sys.exit(0)
import io, wave, base64, math
import numpy as np
import torch, whisper
torch.set_num_threads(4)
torch.set_num_interop_threads(1)
with wave.open(io.BytesIO(base64.b64decode(data["audio"])), "rb") as wav:
    audio = np.frombuffer(wav.readframes(wav.getnframes()), dtype="<i2").astype(np.float32) / 32768.0
audio -= np.mean(audio)
rms = float(np.sqrt(np.mean(audio * audio)))
peak = float(np.max(np.abs(audio)))
metrics = {"durationMs": round(len(audio) / 16), "rms": round(rms, 6), "peak": round(peak, 6)}
result = {"engine": "whisper", "text": "", "accepted": False, "confidence": 0, "audio": metrics}
if rms >= 0.002 and peak >= 0.01:
    # Bring quiet recordings into range without clipping or amplifying noise without bound.
    audio *= min(8.0, 0.8 / peak)
    model = whisper.load_model(model_path, device="cpu")
    decoded = model.transcribe(audio, language=data["language"], fp16=False, verbose=None,
        temperature=0, beam_size=5, condition_on_previous_text=False)
    segments = [s for s in decoded["segments"] if s["compression_ratio"] <= 2.4 and
        not (s["no_speech_prob"] > 0.6 and s["avg_logprob"] < -1.0)]
    text = "".join(s["text"] for s in segments).strip()
    if text and segments:
        result.update(text=text, accepted=True, confidence=round(math.exp(sum(s["avg_logprob"] for s in segments) / len(segments)), 4))
print(json.dumps(result, ensure_ascii=True))
`;

export function createLocalSpeechRecognition({ spawnImpl = spawn, python = "python.exe", modelPath = join(homedir(), ".cache", "whisper", "base.pt"), timeoutMs = 35000 } = {}) {
  const active = new Set();
  let closed = false, available = false;
  async function run(input, signal) {
    if (closed || active.size >= 1) throw fail("Speech recognition is busy.", 409);
    signal?.throwIfAborted();
    return new Promise((resolve, reject) => {
      let output = "", failure;
      const child = spawnImpl(python, ["-X", "utf8", "-c", program], {
        windowsHide: true, shell: false, stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, OMP_NUM_THREADS: "4", MKL_NUM_THREADS: "4", PYTHONIOENCODING: "utf-8" },
      });
      active.add(child);
      const stop = error => { failure = error; child.kill(); };
      const abort = () => stop(fail("Speech cancelled.", 499));
      const timer = setTimeout(() => stop(fail("Speech recognition timed out. Please try again.", 504)), timeoutMs);
      signal?.addEventListener("abort", abort, { once: true });
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", chunk => {
        output += chunk;
        if (output.length > 65536) stop(fail("Speech recognition exceeded its response limit."));
      });
      child.stderr.on("data", () => {});
      child.stdin.on("error", () => {});
      child.on("error", () => { failure = fail("Local speech recognition requires Python and Whisper with the base model installed."); });
      child.on("close", code => {
        clearTimeout(timer); signal?.removeEventListener("abort", abort); active.delete(child);
        if (failure || code !== 0) return reject(failure || fail("Local speech recognition could not run. Check the Whisper installation."));
        try { resolve(JSON.parse(output.trim())); } catch { reject(fail("Speech recognition returned an invalid response.")); }
      });
      child.stdin.end(JSON.stringify({ ...input, model: modelPath }));
      if (signal?.aborted) abort();
    });
  }
  return {
    async status(signal) {
      if (!available) {
        const status = await run({ action: "status" }, signal);
        if (!status.available) throw fail("Local speech recognition requires Python and Whisper with the base model installed.");
        available = true;
      }
      return { engine: "whisper", model: "base", language: "zh-CN", languages: ["zh-CN", "en-US"] };
    },
    async recognize({ audio, language = "zh-CN" }, signal) {
      validateSpeechAudio(audio);
      if (!["zh-CN", "en-US"].includes(language)) throw fail("Unsupported speech language.", 400);
      await this.status(signal);
      const result = await run({ action: "recognize", audio, language: language === "zh-CN" ? "zh" : "en" }, signal);
      if (result.available === false) { available = false; throw fail("The local speech model is no longer available."); }
      return result;
    },
    close() { closed = true; for (const child of active) child.kill(); },
  };
}
