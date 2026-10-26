/** One bounded, single-threaded detector per microphone session. */
export class SileroVad {
  private worker: Worker | undefined;
  private pending = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private rejectReady: ((reason: unknown) => void) | undefined;
  constructor(private result: (block: Float32Array, probability: number) => void, private error: (message: string) => void) {}
  async start(signal: AbortSignal) {
    signal.throwIfAborted();
    const worker = new Worker(new URL("./sileroVad.worker.ts", import.meta.url), { type: "module" });
    this.worker = worker;
    const abort = () => this.close();
    signal.addEventListener("abort", abort, { once: true });
    try {
      await new Promise<void>((resolve, reject) => {
        this.rejectReady = reject;
        const fail = () => {
          const initializing = Boolean(this.rejectReady);
          this.close();
          if (!initializing && !signal.aborted) this.error("Local speech detection is unavailable.");
        };
        this.timer = setTimeout(fail, 15000);
        worker.onerror = fail;
        worker.onmessage = event => {
          if (event.data.error) { fail(); return; }
          if (event.data.ready) { clearTimeout(this.timer); this.rejectReady = undefined; resolve(); return; }
          this.pending--;
          if (!signal.aborted) this.result(event.data.block, event.data.probability);
        };
        worker.postMessage({ root: new URL("/speech/silero/", location.href).href });
      });
      signal.throwIfAborted();
    } finally { signal.removeEventListener("abort", abort); }
  }
  push(block: Float32Array) {
    if (!this.worker) return;
    // Fail closed rather than interrupting with speech that arrived seconds ago.
    if (++this.pending > 24) { this.close(); this.error("Speech detection could not keep up."); return; }
    this.worker.postMessage({ block }, [block.buffer]);
  }
  close() {
    clearTimeout(this.timer);
    this.worker?.terminate(); this.worker = undefined; this.pending = 0;
    this.rejectReady?.(new Error("Speech detection stopped.")); this.rejectReady = undefined;
  }
}
