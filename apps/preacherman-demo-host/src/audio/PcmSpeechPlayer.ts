/** Bounded 24 kHz mono PCM playback. Network chunks need not end on a sample boundary. */
export class PcmSpeechPlayer {
  private readonly sources = new Map<AudioBufferSourceNode, { start: number; duration: number }>();
  private completedTime = 0;
  private nextTime = 0;
  private started = false;
  constructor(private readonly context: AudioContext, private readonly output: AudioNode) {}
  // Exclude network underruns from the motion clock; future buffers have not been heard yet.
  get time() {
    let time = this.completedTime;
    for (const span of this.sources.values()) time += Math.max(0, Math.min(span.duration, this.context.currentTime - span.start));
    return time;
  }
  async play(body: ReadableStream<Uint8Array>, signal: AbortSignal, hooks: {
    samples: (pcm: Float32Array) => void; start: () => void; inputEnded: () => void;
  }) {
    signal.throwIfAborted();
    const reader = body.getReader();
    let bytes = 0, remainder: number | undefined, pending: number[] = [], ended = false;
    let wake: (() => void) | undefined;
    const stop = () => {
      for (const source of this.sources.keys()) {
        source.onended = null;
        try { source.stop(); } catch { /* Already ended. */ }
        source.disconnect();
      }
      this.sources.clear(); wake?.();
    };
    const abort = () => { stop(); void reader.cancel().catch(() => {}); };
    signal.addEventListener("abort", abort, { once: true });
    const flush = () => {
      if (!pending.length || (!ended && pending.length < (this.started ? 1920 : 7680))) return;
      signal.throwIfAborted();
      const pcm = new Float32Array(pending); pending = [];
      const buffer = this.context.createBuffer(1, pcm.length, 24000);
      buffer.copyToChannel(pcm, 0);
      const source = this.context.createBufferSource(); source.buffer = buffer; source.connect(this.output);
      const start = Math.max(this.nextTime, this.context.currentTime + 0.015);
      const duration = pcm.length / 24000;
      this.sources.set(source, { start, duration }); this.nextTime = start + duration;
      source.onended = () => {
        this.completedTime += duration; this.sources.delete(source); source.disconnect();
        if (ended && !this.sources.size) wake?.();
      };
      source.start(start);
      if (!this.started) { this.started = true; hooks.start(); }
    };
    try {
      while (true) {
        const { value, done } = await reader.read(); signal.throwIfAborted();
        if (done) break;
        bytes += value.length;
        if (bytes > 12 * 1024 * 1024) throw new Error("Speech audio exceeded its playback limit.");
        const decoded: number[] = [];
        let i = 0;
        if (remainder !== undefined && value.length) {
          const sample = remainder | (value[0] << 8); decoded.push((sample >= 32768 ? sample - 65536 : sample) / 32768);
          remainder = undefined; i = 1;
        }
        for (; i + 1 < value.length; i += 2) {
          const sample = value[i] | (value[i + 1] << 8); decoded.push((sample >= 32768 ? sample - 65536 : sample) / 32768);
        }
        if (i < value.length) remainder = value[i];
        if (decoded.length) {
          hooks.samples(new Float32Array(decoded));
          for (const sample of decoded) pending.push(sample);
          flush();
        }
      }
      if (!bytes || remainder !== undefined) throw new Error("Speech audio ended before a complete sample.");
      ended = true; flush(); hooks.inputEnded();
      if (this.sources.size) await new Promise<void>(resolve => { wake = resolve; });
      signal.throwIfAborted();
    } finally {
      signal.removeEventListener("abort", abort); stop();
      await reader.cancel().catch(() => {}); reader.releaseLock();
    }
  }
}
