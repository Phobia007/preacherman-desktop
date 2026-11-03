import { speechMotionRuntime } from "./SpeechMotionRuntime";
import { motionStrength, type CharacterMotionSettings } from "./characterMotion";

let epoch = 0;
/** One sentence, one audio clock. A late or unavailable motion service never holds speech. */
export class SpokenMotionPlayback {
  private readonly epoch = ++epoch;
  private startedAt: number | null = null;
  private readonly cancellation = new AbortController();
  private readonly abort = () => this.stop();
  constructor(private readonly clock: () => number, private readonly signal: AbortSignal) {
    signal.addEventListener("abort", this.abort, { once: true });
  }
  async prepare(text: string, duration: number, sessionId: string, config: CharacterMotionSettings) {
    if (this.signal.aborted || !config.enabled || !config.supported) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        speechMotionRuntime.start({ text, duration, sessionId, characterId: config.characterId,
          interactionEpoch: this.epoch, signal: this.cancellation.signal, strength: motionStrength[config.style],
          playbackTime: () => this.startedAt === null ? null : Math.max(0, this.clock() - this.startedAt),
        }),
        new Promise<void>(resolve => { timer = setTimeout(resolve, 160); }),
      ]);
    } catch { /* Motion is optional; voice remains available. */ }
    finally { clearTimeout(timer); }
  }
  start() { this.startedAt = this.clock(); }
  stop() {
    this.signal.removeEventListener("abort", this.abort);
    this.cancellation.abort();
    speechMotionRuntime.cancel(this.epoch, "audio-stopped");
  }
}
