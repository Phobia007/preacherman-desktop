import { speechMotionRuntime } from "./SpeechMotionRuntime";
import { motionStrength, type CharacterMotionSettings } from "./characterMotion";

let epoch = 0;

/** Resample the exact decoded playback buffer once, before chunking. */
export function facePcm(buffer: AudioBuffer): Int16Array {
  const samples = new Int16Array(Math.floor(buffer.length * 16000 / buffer.sampleRate));
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  for (let i = 0; i < samples.length; i++) {
    const position = i * buffer.sampleRate / 16000, left = Math.floor(position), right = Math.min(buffer.length - 1, left + 1);
    let value = 0;
    for (const channel of channels) value += channel[left] + (channel[right] - channel[left]) * (position - left);
    samples[i] = Math.round(Math.max(-1, Math.min(1, value / channels.length)) * 32767);
  }
  return samples;
}
/** One sentence, one audio clock. A late or unavailable motion service never holds speech. */
export class SpokenMotionPlayback {
  private readonly epoch = ++epoch;
  private startedAt: number | null = null;
  private readonly cancellation = new AbortController();
  private readonly abort = () => this.stop();
  constructor(private readonly clock: () => number, private readonly signal: AbortSignal) {
    signal.addEventListener("abort", this.abort, { once: true });
  }
  async prepare(text: string, duration: number, sessionId: string, config: CharacterMotionSettings, audio?: AudioBuffer) {
    if (this.signal.aborted || this.cancellation.signal.aborted) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const playbackTime = () => this.startedAt === null ? null : Math.max(0, this.clock() - this.startedAt);
      const pending: Promise<boolean>[] = [];
      if (config.enabled && config.supported) pending.push(speechMotionRuntime.start({ text, duration, sessionId, characterId: config.characterId,
          interactionEpoch: this.epoch, signal: this.cancellation.signal, strength: motionStrength[config.style],
          playbackTime,
        }));
      // Face animation is independent of the selected body motion style.
      if (config.characterId === "cortana" && audio) {
        const face = speechMotionRuntime.startFaceStream({ sampleRate: 16000, profile: "preacherman-arkit",
          characterId: config.characterId, interactionEpoch: this.epoch, signal: this.cancellation.signal, playbackTime });
        const pcm = facePcm(audio);
        for (let i = 0; i < pcm.length; i += 8000) face.append(pcm.subarray(i, i + 8000));
        face.finish();
        pending.push(face.firstFrame);
      }
      await Promise.race([
        Promise.all(pending),
        new Promise<void>(resolve => { timer = setTimeout(resolve, 160); }),
      ]);
    } catch { /* Motion is optional; voice remains available. */ }
    finally { clearTimeout(timer); }
  }
  prepareStream(text: string, sessionId: string, config: CharacterMotionSettings) {
    const playbackTime = () => this.startedAt === null ? null : Math.max(0, this.clock() - this.startedAt);
    // PCM has no final duration yet. Estimate only the body gesture span; audio controls
    // the actual end and release envelope. Face animation always uses the real samples.
    const duration = Math.max(1, Math.min(45, text.match(/[\u3400-\u9fff]/u) ? text.length / 4 : text.trim().split(/\s+/u).length / 2.6));
    if (config.enabled && config.supported) void speechMotionRuntime.start({ text, duration, sessionId,
      characterId: config.characterId, interactionEpoch: this.epoch, signal: this.cancellation.signal,
      strength: motionStrength[config.style], playbackTime }).catch(() => {});
    const face = config.characterId === "cortana" ? speechMotionRuntime.startFaceStream({ sampleRate: 16000,
      profile: "preacherman-arkit", characterId: config.characterId, interactionEpoch: this.epoch,
      signal: this.cancellation.signal, playbackTime }) : null;
    // Every three 24 kHz samples produce two 16 kHz samples. Carry incomplete groups
    // between network chunks so the face clock never accumulates resampling drift.
    let tail: number[] = [];
    return {
      append: (pcm: Float32Array) => {
        if (!face || this.cancellation.signal.aborted) return;
        const input = new Float32Array(tail.length + pcm.length); input.set(tail); input.set(pcm, tail.length);
        const groups = Math.floor(input.length / 3), output = new Int16Array(groups * 2);
        for (let i = 0; i < groups; i++) {
          output[i * 2] = Math.round(input[i * 3] * 32767);
          output[i * 2 + 1] = Math.round((input[i * 3 + 1] + input[i * 3 + 2]) * .5 * 32767);
        }
        tail = Array.from(input.subarray(groups * 3));
        for (let i = 0; i < output.length; i += 8000) face.append(output.subarray(i, i + 8000));
      },
      finish: () => { if (face && tail.length > 1) face.append(new Int16Array([Math.round(tail[0] * 32767)])); face?.finish(); },
    };
  }
  start() { this.startedAt = this.clock(); }
  stop(reason = "audio-stopped") {
    this.signal.removeEventListener("abort", this.abort);
    speechMotionRuntime.cancel(this.epoch, reason);
    this.cancellation.abort();
  }
}
