import { spawn } from "node:child_process";
import { join } from "node:path";

const fail = (message, statusCode = 503) => Object.assign(new Error(message), { statusCode });
// Fixed program; speech and audio enter through JSON stdin, never PowerShell code.
const program = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
try {
  Add-Type -AssemblyName System.Speech
  $inputData = [Console]::In.ReadToEnd() | ConvertFrom-Json
  if ($inputData.action -eq 'status') {
    $recognizers = @([System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers() | ForEach-Object { $_.Culture.Name })
    $speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
    try { $voices = @($speaker.GetInstalledVoices() | Where-Object Enabled | ForEach-Object { $_.VoiceInfo.Culture.Name }) } finally { $speaker.Dispose() }
    @{ languages = $recognizers; voices = $voices } | ConvertTo-Json -Compress
  } elseif ($inputData.action -eq 'recognize') {
    $engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine([System.Globalization.CultureInfo]::GetCultureInfo($inputData.language))
    $audio = New-Object System.IO.MemoryStream(,[Convert]::FromBase64String($inputData.audio))
    try {
      $engine.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
      $engine.SetInputToWaveStream($audio)
      $result = $engine.Recognize([TimeSpan]::FromSeconds(25))
      if ($null -eq $result) { @{ text = ''; confidence = 0 } | ConvertTo-Json -Compress }
      else { @{ text = $result.Text; confidence = $result.Confidence } | ConvertTo-Json -Compress }
    } finally { $engine.Dispose(); $audio.Dispose() }
  } elseif ($inputData.action -eq 'synthesize') {
    $speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
    $audio = New-Object System.IO.MemoryStream
    try {
      $voice = $speaker.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -eq $inputData.language } | Select-Object -First 1
      if ($null -eq $voice) { throw 'Voice unavailable' }
      $speaker.SelectVoice($voice.VoiceInfo.Name)
      $speaker.SetOutputToWaveStream($audio)
      $speaker.Speak($inputData.text)
      $speaker.SetOutputToNull()
      @{ audio = [Convert]::ToBase64String($audio.ToArray()); language = $inputData.language } | ConvertTo-Json -Compress
    } finally { $speaker.Dispose(); $audio.Dispose() }
  } else { throw 'Unsupported operation' }
} catch { [Console]::Error.WriteLine('Windows speech operation failed.'); exit 1 }
`;

export function validateSpeechAudio(audio) {
  if (typeof audio !== "string" || audio.length > 1400000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(audio)) throw fail("Invalid speech audio.", 400);
  const wav = Buffer.from(audio, "base64");
  if (wav.length < 46 || wav.length > 1000000 || wav.toString("ascii", 0, 4) !== "RIFF" || wav.toString("ascii", 8, 16) !== "WAVEfmt " ||
    wav.readUInt32LE(16) !== 16 || wav.readUInt16LE(20) !== 1 || wav.readUInt16LE(22) !== 1 || wav.readUInt32LE(24) !== 16000 ||
    wav.readUInt16LE(34) !== 16 || wav.toString("ascii", 36, 40) !== "data" || wav.readUInt32LE(40) !== wav.length - 44 || wav.length % 2) {
    throw fail("Speech requires mono 16 kHz PCM WAV audio.", 400);
  }
  return audio;
}

export function createWindowsSpeech({ spawnImpl = spawn, platform = process.platform, timeoutMs = 35000 } = {}) {
  const active = new Set();
  let cached, closed = false;
  async function run(input, signal) {
    if (platform !== "win32") throw fail("Windows speech is unavailable on this system.");
    if (closed || active.size >= 2) throw fail("Speech service is busy.", 409);
    signal?.throwIfAborted();
    return new Promise((resolve, reject) => {
      let output = "", size = 0, failure;
      const child = spawnImpl(join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
        ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(program, "utf16le").toString("base64")],
        { windowsHide: true, shell: false, stdio: ["pipe", "pipe", "pipe"] });
      active.add(child);
      const stop = error => { failure = error; child.kill(); };
      const abort = () => stop(fail("Speech cancelled.", 499));
      const timer = setTimeout(() => stop(fail("Speech timed out. Please try again.", 504)), timeoutMs);
      signal?.addEventListener("abort", abort, { once: true });
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", chunk => { size += chunk.length; if (size > 12 * 1024 * 1024) stop(fail("Speech exceeded its audio limit.")); else output += chunk; });
      child.stderr.on("data", () => {});
      child.stdin.on("error", () => {});
      child.on("error", () => { failure = fail("Windows speech could not start."); });
      child.on("close", code => {
        clearTimeout(timer); signal?.removeEventListener("abort", abort); active.delete(child);
        if (failure || code !== 0) return reject(failure || fail("Windows speech is unavailable. Check the installed speech language."));
        try { resolve(JSON.parse(output.replace(/^\uFEFF/, "").trim())); } catch { reject(fail("Windows speech returned an invalid response.")); }
      });
      child.stdin.end(JSON.stringify(input));
      if (signal?.aborted) abort();
    });
  }
  return {
    async status(signal) {
      if (!cached) cached = await run({ action: "status" }, signal);
      return { ...cached, language: cached.languages.includes("zh-CN") ? "zh-CN" : cached.languages[0] || null };
    },
    async recognize({ audio, language }, signal) {
      validateSpeechAudio(audio);
      const status = await this.status(signal);
      language ||= status.language;
      if (!status.languages.includes(language)) throw fail("Install this Windows speech recognition language first.");
      return run({ action: "recognize", audio, language }, signal);
    },
    async synthesize({ text }, signal) {
      if (typeof text !== "string" || !text.trim() || text.length > 6000) throw fail("Speech text must contain 1–6000 characters.", 400);
      const language = /[\u3400-\u9fff]/.test(text) ? "zh-CN" : "en-US";
      return run({ action: "synthesize", text, language }, signal);
    },
    close() { closed = true; for (const child of active) child.kill(); },
  };
}
