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
model = None
loaded_path = None
configured_threads = False
def handle(data):
    global model, loaded_path, configured_threads
    model_path = data["model"]
    if not os.path.isfile(model_path) or any(importlib.util.find_spec(name) is None for name in ["whisper", "torch", "numpy"]):
        return {"available": False}
    if data["action"] == "status":
        return {"available": True, "engine": "whisper", "model": "base"}
    import io, wave, base64, math
    import numpy as np
    import torch, whisper
    if not configured_threads:
        torch.set_num_threads(4)
        torch.set_num_interop_threads(1)
        configured_threads = True
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
        if model is None or loaded_path != model_path:
            model = whisper.load_model(model_path, device="cpu")
            loaded_path = model_path
        decoded = model.transcribe(audio, language=data["language"], fp16=False, verbose=None,
            temperature=0, beam_size=5, condition_on_previous_text=False)
        segments = [s for s in decoded["segments"] if s["compression_ratio"] <= 2.4 and
            not (s["no_speech_prob"] > 0.6 and s["avg_logprob"] < -1.0)]
        text = "".join(s["text"] for s in segments).strip()
        if text and segments:
            result.update(text=text, accepted=True, confidence=round(math.exp(sum(s["avg_logprob"] for s in segments) / len(segments)), 4))
    return result

# No socket or files: this worker belongs to the sidecar's stdin pipe and exits at EOF.
for line in sys.stdin:
    data = None
    try:
        data = json.loads(line)
        response = {"id": data["id"], "result": handle(data)}
    except Exception:
        response = {"id": data.get("id") if isinstance(data, dict) else None, "error": True}
    print(json.dumps(response, ensure_ascii=True), flush=True)
    # Keep only the model between turns, not microphone recordings or transcripts.
    data = response = None
    line = ""
`;

// One owned Python worker, no listening port. It reuses the CPU model across turns;
// close(), a failed/cancelled request, or 90 seconds idle stop this exact child.
export function createLocalSpeechRecognition({ spawnImpl = spawn, python = "python.exe", modelPath = join(homedir(), ".cache", "whisper", "base.pt"), timeoutMs = 35000, idleMs = 90000 } = {}) {
  let closed = false, available = false, worker = null, sequence = 0;
  function stop(current, error) {
    if (current.stopping) return;
    current.stopping = true;
    clearTimeout(current.idleTimer);
    current.pending?.finish(error || fail("Speech recognition closed.", 499));
    current.child.kill();
  }
  function startWorker() {
    const child = spawnImpl(python, ["-X", "utf8", "-c", program], {
      windowsHide: true, shell: false, stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, OMP_NUM_THREADS: "4", MKL_NUM_THREADS: "4", PYTHONIOENCODING: "utf-8" },
    });
    const current = { child, pending: null, buffer: "", stopping: false, idleTimer: undefined };
    worker = current;
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", chunk => {
      if (current.stopping) return;
      current.buffer += chunk;
      if (current.buffer.length > 65536) return stop(current, fail("Speech recognition exceeded its response limit."));
      let newline;
      while ((newline = current.buffer.indexOf("\n")) !== -1) {
        const line = current.buffer.slice(0, newline); current.buffer = current.buffer.slice(newline + 1);
        let response;
        try { response = JSON.parse(line); } catch { return stop(current, fail("Speech recognition returned an invalid response.")); }
        if (!current.pending || response.id !== current.pending.id || response.error || !response.result || typeof response.result !== "object") {
          return stop(current, fail("Local speech recognition could not run. Check the Whisper installation."));
        }
        current.pending.finish(null, response.result);
        current.idleTimer = setTimeout(() => stop(current), idleMs);
        current.idleTimer.unref?.();
      }
    });
    child.stderr.on("data", () => {});
    child.stdin.on("error", () => stop(current, fail("Speech recognition connection closed.")));
    child.on("error", () => stop(current, fail("Local speech recognition requires Python and Whisper with the base model installed.")));
    child.on("close", () => {
      clearTimeout(current.idleTimer);
      current.stopping = true;
      current.pending?.finish(fail("Local speech recognition could not run. Check the Whisper installation."));
      if (worker === current) worker = null;
    });
    return current;
  }
  async function run(input, signal) {
    if (closed || worker?.pending || worker?.stopping) throw fail("Speech recognition is busy.", 409);
    signal?.throwIfAborted();
    const current = worker || startWorker();
    clearTimeout(current.idleTimer);
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const abort = () => stop(current, fail("Speech cancelled.", 499));
      const timer = setTimeout(() => stop(current, fail("Speech recognition timed out. Please try again.", 504)), timeoutMs);
      const finish = (error, result) => {
        if (current.pending?.id !== id) return;
        current.pending = null;
        clearTimeout(timer); signal?.removeEventListener("abort", abort);
        if (error) reject(error); else resolve(result);
      };
      current.pending = { id, finish };
      signal?.addEventListener("abort", abort, { once: true });
      try { current.child.stdin.write(JSON.stringify({ ...input, model: modelPath, id }) + "\n"); }
      catch { stop(current, fail("Speech recognition connection closed.")); }
      if (signal?.aborted) abort();
    });
  }
  return {
    async status(signal) {
      if (closed) throw fail("Speech recognition closed.", 499);
      signal?.throwIfAborted();
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
    close() { closed = true; if (worker) stop(worker); },
  };
}
