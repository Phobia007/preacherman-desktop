export const REST_HEIGHTS = [12, 18, 14, 10, 22] as const;
export type MicrophoneState = "idle" | "requesting" | "listening" | "error";

/** VoiceMark proportions from the authored video, driven by live microphone RMS. */
export function voiceFrame(samples: Float32Array, milliseconds: number) {
  let mean = 0;
  for (const value of samples) mean += value;
  mean /= samples.length || 1;
  let power = 0;
  for (const value of samples) power += (value - mean) ** 2;
  const rms = Math.sqrt(power / (samples.length || 1));
  const level = rms <= 0.006 ? 0 : Math.min(1, Math.sqrt((rms - 0.006) / 0.11));
  return {
    speaking: level > 0,
    heights: level === 0 ? [...REST_HEIGHTS] : REST_HEIGHTS.map((_, index) =>
      4 + level * (10 + 18 * Math.abs(Math.sin(index * 1.4 + milliseconds * 0.012)))),
  };
}

function microphoneError(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Allow microphone access, then try again.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "Microphone unavailable. Choose another input.";
  if (name === "NotReadableError") return "Microphone is busy. Close the other audio app and try again.";
  return "Could not open the microphone. Check your input device and try again.";
}

type Capture = {
  stream: MediaStream;
  context: AudioContext;
  source: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  samples: Float32Array<ArrayBuffer>;
  ended: () => void;
};

export class MicrophoneMeter {
  private revision = 0;
  private capture: Capture | null = null;
  private animation = 0;
  private lastFrame = -Infinity;
  private visible = true;
  private disposed = false;
  constructor(
    private onFrame: (frame: ReturnType<typeof voiceFrame>) => void,
    private onState: (state: MicrophoneState, error?: string) => void,
  ) {}

  private release() {
    cancelAnimationFrame(this.animation);
    this.animation = 0;
    const capture = this.capture;
    this.capture = null;
    if (!capture) return;
    capture.stream.getTracks().forEach(track => {
      track.removeEventListener("ended", capture.ended);
      track.stop();
    });
    capture.source.disconnect();
    capture.analyser.disconnect();
    void capture.context.close().catch(() => {});
  }

  stop(error?: string) {
    this.revision++;
    this.release();
    if (this.disposed) return;
    this.onFrame({ speaking: false, heights: [...REST_HEIGHTS] });
    this.onState(error ? "error" : "idle", error);
  }

  async start(deviceId = ""): Promise<boolean> {
    if (this.disposed) return false;
    this.stop();
    const revision = this.revision;
    const current = () => !this.disposed && revision === this.revision;
    this.onState("requesting");
    let stream: MediaStream | undefined;
    let context: AudioContext | undefined;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microphone API unavailable");
      stream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true,
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}) },
      });
      if (!current()) { stream.getTracks().forEach(track => track.stop()); return false; }
      context = new AudioContext();
      await context.resume();
      if (!current()) {
        stream.getTracks().forEach(track => track.stop());
        await context.close();
        return false;
      }
      if (!stream.getAudioTracks().some(track => track.readyState === "live")) {
        throw new Error("Microphone disconnected");
      }
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      const source = context.createMediaStreamSource(stream);
      source.connect(analyser); // Analyse only; never echo the microphone to speakers.
      const ended = () => { if (current()) this.stop("Microphone disconnected. Choose an available input."); };
      stream.getAudioTracks().forEach(track => track.addEventListener("ended", ended));
      this.capture = { stream, context, source, analyser, samples: new Float32Array(analyser.fftSize), ended };
      this.lastFrame = -Infinity;
      this.onState("listening");
      this.schedule();
      return true;
    } catch (error) {
      stream?.getTracks().forEach(track => track.stop());
      if (context && context.state !== "closed") void context.close().catch(() => {});
      if (current()) this.stop(microphoneError(error));
      return false;
    }
  }

  setVisible(visible: boolean) {
    this.visible = visible;
    cancelAnimationFrame(this.animation);
    this.animation = 0;
    if (visible) this.schedule();
  }

  private schedule() {
    if (!this.capture || !this.visible || this.animation || this.disposed) return;
    this.animation = requestAnimationFrame(this.tick);
  }

  private tick = (time: number) => {
    this.animation = 0;
    const capture = this.capture;
    if (!capture || !this.visible || this.disposed) return;
    if (time - this.lastFrame >= 1000 / 30) {
      this.lastFrame = time;
      capture.analyser.getFloatTimeDomainData(capture.samples);
      this.onFrame(voiceFrame(capture.samples, time));
    }
    this.schedule();
  };

  dispose() {
    this.disposed = true;
    this.revision++;
    this.release();
  }
}

export type OutputContext = AudioContext & { setSinkId?: (id: string) => Promise<void> };
export async function selectOutput(context: OutputContext, deviceId: string) {
  if (context.setSinkId) await context.setSinkId(deviceId);
  else if (deviceId) throw new Error("Output switching is unavailable. Use the system default.");
}
