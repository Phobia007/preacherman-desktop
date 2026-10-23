import { MicrophoneMeter, selectOutput, voiceFrame, type MicrophoneState, type OutputContext } from "./microphoneMeter";
import { SpokenPhrase, speechWav } from "./spokenAudio";
import { preachermanServiceRequest } from "../preacherman/capabilityClient";

export type ConversationVoiceState = MicrophoneState | "thinking" | "speaking";
type Devices = { input: string; output: string };

/** Audio-only controller. Transcripts and replies never enter React state or the DOM. */
export class SpokenConversation {
  private meter: MicrophoneMeter;
  private cancellation: AbortController | null = null;
  private playback: OutputContext | null = null;
  private animation = 0;
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  private sessionId = "";
  private language = "";
  private disposed = false;
  private hearing = false;
  private missedPhrases = 0;
  constructor(
    private onFrame: (frame: ReturnType<typeof voiceFrame>) => void,
    private onState: (state: ConversationVoiceState) => void,
    private character: () => string | null,
    private devices: () => Devices,
    private avatar: (state: "idle" | "listening" | "thinking" | "speaking") => void,
  ) {
    this.meter = new MicrophoneMeter(onFrame, (state, error) => {
      if (!this.cancellation || this.disposed) return;
      if (state === "error") { void this.failed(error || "Could not open the microphone."); return; }
      if (this.hearing) { this.onState(state); this.avatar(state === "listening" ? "listening" : "idle"); }
    }, (source, context) => this.capture(source, context));
  }
  get active() { return this.cancellation !== null; }
  private async request<T>(path: string, body: unknown, signal: AbortSignal, timeout = 40000) {
    return preachermanServiceRequest<T>(path, { method: body === undefined ? "GET" : "POST", body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.any([signal, AbortSignal.timeout(timeout)]) });
  }
  async start() {
    this.stop();
    if (this.disposed) return false;
    const cancellation = new AbortController(); this.cancellation = cancellation;
    this.sessionId = crypto.randomUUID();
    this.missedPhrases = 0;
    this.onState("requesting");
    try {
      const id = this.character();
      if (!id) throw new Error("Activate a character in Asset before starting a conversation.");
      const config = await this.request<{ active: unknown }>(`/api/characters/${id}/execution`, undefined, cancellation.signal);
      if (!config.active) throw new Error("Choose Execution Mode in your character's Settings before starting a conversation.");
      const status = await this.request<{ language: string | null }>("/api/voice/local/status", undefined, cancellation.signal);
      if (!status.language) throw new Error("Local speech recognition is unavailable. Check the speech model installation.");
      cancellation.signal.throwIfAborted(); this.language = status.language;
      return await this.listen(cancellation.signal);
    } catch (error) { if (!cancellation.signal.aborted) await this.failed(error instanceof Error ? error.message : "Voice conversation is unavailable."); return false; }
  }
  private async listen(signal: AbortSignal) {
    signal.throwIfAborted(); this.hearing = true;
    const ready = await this.meter.start(this.devices().input);
    if (ready && !signal.aborted) this.idleTimer = setTimeout(() => this.stop(), 45000);
    return ready;
  }
  private async capture(source: MediaStreamAudioSourceNode, context: AudioContext) {
    await context.audioWorklet.addModule(new URL("./voiceCapture.worklet.js?no-inline", import.meta.url));
    const node = new AudioWorkletNode(context, "preacherman-voice-capture");
    const mute = context.createGain(); mute.gain.value = 0;
    source.connect(node); node.connect(mute); mute.connect(context.destination);
    const phrase = new SpokenPhrase();
    node.port.onmessage = (event: MessageEvent<Float32Array>) => {
      const blocks = phrase.push(event.data);
      if (blocks && this.hearing && this.cancellation) void this.reply(blocks, this.cancellation.signal);
    };
    return () => { node.port.onmessage = null; node.port.close(); node.disconnect(); mute.disconnect(); };
  }
  private async reply(blocks: Float32Array[], signal: AbortSignal) {
    const id = this.character();
    this.hearing = false; clearTimeout(this.idleTimer); this.meter.stop();
    this.onState("thinking"); this.avatar("thinking");
    try {
      if (blocks.length) {
        const recognized = await this.request<{ text: string; accepted: boolean }>("/api/voice/local/recognize", { audio: speechWav(blocks), language: this.language }, signal);
        signal.throwIfAborted();
        if (recognized.accepted && recognized.text.trim()) {
          this.missedPhrases = 0;
          const result = await this.request<{ text: string }>(`/api/characters/${id}/conversation`, { text: recognized.text, sessionId: this.sessionId }, signal, 130000);
          signal.throwIfAborted();
          await this.speak(result.text, signal);
        } else {
          this.missedPhrases++;
          if (this.missedPhrases >= 2) {
            await this.failed(this.language === "zh-CN"
              ? "连续两次没能识别清楚。请在右下角的三个点里检查麦克风，再点语音按钮重试。"
              : "I couldn't recognize the last two attempts. Check the microphone in the audio menu, then start voice conversation again.");
            return;
          }
          await this.speak(this.language === "zh-CN" ? "我没有听清楚，请再说一遍。" : "I didn't catch that. Please say it again.", signal);
        }
      }
      signal.throwIfAborted();
      await this.listen(signal);
    } catch (error) { if (!signal.aborted) await this.failed(error instanceof Error ? error.message : "The conversation failed. Please try again."); }
  }
  private async speak(text: string, signal: AbortSignal) {
    const result = await this.request<{ audio: string }>("/api/voice/local/synthesize", { text }, signal);
    signal.throwIfAborted();
    const context: OutputContext = new AudioContext(); this.playback = context;
    try {
      await selectOutput(context, this.devices().output); await context.resume();
      const bytes = Uint8Array.from(atob(result.audio), char => char.charCodeAt(0));
      const buffer = await context.decodeAudioData(bytes.buffer); signal.throwIfAborted();
      const source = context.createBufferSource(), analyser = context.createAnalyser(); analyser.fftSize = 512;
      source.buffer = buffer; source.connect(analyser); analyser.connect(context.destination);
      this.onState("speaking"); this.avatar("speaking");
      const samples = new Float32Array(analyser.fftSize);
      const animate = () => {
        if (signal.aborted) return;
        analyser.getFloatTimeDomainData(samples); this.onFrame(voiceFrame(samples, performance.now()));
        let power = 0; for (const sample of samples) power += sample * sample;
        window.dispatchEvent(new CustomEvent("preacherman:avatar-jaw", { detail: Math.min(1, Math.sqrt(power / samples.length) * 3.2) }));
        this.animation = requestAnimationFrame(animate);
      };
      await new Promise<void>((resolve, reject) => {
        const abort = () => { try { source.stop(); } catch { /* Not started. */ } reject(signal.reason); };
        signal.addEventListener("abort", abort, { once: true });
        const timer = setTimeout(() => { source.stop(); reject(new Error("Audio playback timed out.")); }, Math.min(90000, buffer.duration * 1000 + 4000));
        source.onended = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); resolve(); };
        source.start(); animate();
      });
    } finally {
      cancelAnimationFrame(this.animation); window.dispatchEvent(new CustomEvent("preacherman:avatar-jaw", { detail: 0 }));
      if (context.state !== "closed") await context.close().catch(() => {});
      if (this.playback === context) this.playback = null;
    }
  }
  private async failed(message: string) {
    const signal = this.cancellation?.signal;
    this.hearing = false; this.meter.stop(); clearTimeout(this.idleTimer);
    if (signal && !signal.aborted) {
      try { await this.speak(message, signal); } catch { /* The error state remains available if audio output itself fails. */ }
    }
    if (signal?.aborted) return;
    this.stop(); if (!this.disposed) this.onState("error");
  }
  stop() {
    this.cancellation?.abort(); this.cancellation = null; this.hearing = false;
    clearTimeout(this.idleTimer); this.meter.stop(); cancelAnimationFrame(this.animation);
    void this.playback?.close().catch(() => {}); this.playback = null;
    this.avatar("idle"); window.dispatchEvent(new CustomEvent("preacherman:avatar-jaw", { detail: 0 }));
    if (!this.disposed) this.onState("idle");
  }
  setVisible(visible: boolean) { this.meter.setVisible(visible); }
  dispose() { this.stop(); this.disposed = true; this.meter.dispose(); }
}
