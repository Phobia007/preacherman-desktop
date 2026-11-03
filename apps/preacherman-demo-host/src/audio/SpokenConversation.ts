import { MicrophoneMeter, selectOutput, voiceFrame, type MicrophoneState, type OutputContext } from "./microphoneMeter";
import { ConversationPhrase, speechWav, spokenSentences } from "./spokenAudio";
import { SileroVad } from "./SileroVad";
import { preachermanServiceRequest } from "../preacherman/capabilityClient";
import { SpokenMotionPlayback } from "../motion/SpokenMotionPlayback";
import { defaultCharacterMotion, type CharacterMotionSettings } from "../motion/characterMotion";

export type ConversationVoiceState = MicrophoneState | "thinking" | "speaking";
type Devices = { input: string; output: string };
type VoiceLanguage = "en" | "zh" | "unknown";

/** Audio-only controller. Transcripts and replies never enter React state or the DOM. */
export class SpokenConversation {
  private meter: MicrophoneMeter;
  private cancellation: AbortController | null = null;
  private turn: AbortController | null = null;
  private previousPlayback: { replyId: string; heardCharacters: number; interrupted: boolean } | undefined;
  private playback: OutputContext | null = null;
  private animation = 0;
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  private sessionId = "";
  private characterId: string | null = null;
  private language = "";
  private voiceLanguage: VoiceLanguage = "unknown";
  private disposed = false;
  private hearing = false;
  private missedPhrases = 0;
  private motion = defaultCharacterMotion("");
  constructor(
    private onFrame: (frame: ReturnType<typeof voiceFrame>) => void,
    private onState: (state: ConversationVoiceState) => void,
    private character: () => string | null,
    private devices: () => Devices,
    private avatar: (state: "idle" | "listening" | "thinking" | "speaking") => void,
  ) {
    this.meter = new MicrophoneMeter(frame => { if (this.hearing) onFrame(frame); }, (state, error) => {
      if (!this.cancellation || this.disposed) return;
      if (state === "error") { void this.failed(error || "Could not open the microphone."); return; }
      if (this.hearing) { this.onState(state); this.avatar(state === "listening" ? "listening" : "idle"); }
    }, (source, context) => this.capture(source, context));
  }
  get active() { return this.cancellation !== null; }
  setMotion(config: CharacterMotionSettings) { if (config.characterId === this.characterId) this.motion = config; }
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
      this.characterId = id;
      const [config, status] = await Promise.all([
        this.request<{ active: unknown; motion?: CharacterMotionSettings }>(`/api/characters/${id}/execution`, undefined, cancellation.signal),
        this.request<{ language: string | null; voiceLanguage?: VoiceLanguage }>(`/api/voice/local/status?characterId=${encodeURIComponent(id)}`, undefined, cancellation.signal),
      ]);
      if (!config.active) throw new Error("Choose Execution Mode in your character's Settings before starting a conversation.");
      if (!status.language) throw new Error("Local speech recognition is unavailable. Check the speech model installation.");
      cancellation.signal.throwIfAborted(); this.language = status.language;
      this.voiceLanguage = status.voiceLanguage || "unknown";
      this.motion = config.motion ?? defaultCharacterMotion(id);
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
    const signal = this.cancellation!.signal;
    const phrase = new ConversationPhrase(() => this.interrupt(), blocks => {
      if (!signal.aborted) void this.reply(blocks, signal);
    });
    const detector = new SileroVad((block, probability) => {
      if (!signal.aborted) phrase.push(block, probability);
    }, message => { if (!signal.aborted) void this.failed(message); });
    let node: AudioWorkletNode | undefined, mute: GainNode | undefined;
    const release = () => {
      detector.close();
      if (node) { node.port.onmessage = null; node.port.close(); node.disconnect(); }
      mute?.disconnect();
    };
    try {
      await detector.start(signal);
      await context.audioWorklet.addModule(new URL("./voiceCapture.worklet.js?no-inline", import.meta.url));
      signal.throwIfAborted();
      node = new AudioWorkletNode(context, "preacherman-voice-capture");
      mute = context.createGain(); mute.gain.value = 0;
      source.connect(node); node.connect(mute); mute.connect(context.destination);
      node.port.onmessage = (event: MessageEvent<Float32Array>) => detector.push(event.data);
      return release;
    } catch (error) { release(); throw error; }
  }
  private interrupt() {
    if (!this.cancellation || this.cancellation.signal.aborted) return;
    clearTimeout(this.idleTimer);
    if (this.turn && this.previousPlayback) this.previousPlayback.interrupted = true;
    this.turn?.abort(); this.turn = null;
    // Abort listeners stop the current audio source synchronously. Capture stays live.
    this.hearing = true; this.onState("listening"); this.avatar("listening");
    window.dispatchEvent(new CustomEvent("preacherman:avatar-jaw", { detail: 0 }));
  }
  private async reply(blocks: Float32Array[], sessionSignal: AbortSignal) {
    this.turn?.abort();
    const turn = new AbortController(); this.turn = turn;
    const signal = AbortSignal.any([sessionSignal, turn.signal]);
    const id = this.characterId;
    this.hearing = false; clearTimeout(this.idleTimer);
    this.onState("thinking"); this.avatar("thinking");
    try {
      signal.throwIfAborted();
      if (!id) throw new Error("Select a character before speaking.");
      if (blocks.length) {
        const recognized = await this.request<{ text: string; accepted: boolean }>("/api/voice/local/recognize", { audio: speechWav(blocks), language: this.language }, signal);
        signal.throwIfAborted();
        if (recognized.accepted && recognized.text.trim()) {
          this.missedPhrases = 0;
          const previousPlayback = this.previousPlayback;
          const playback = { replyId: crypto.randomUUID(), heardCharacters: 0, interrupted: true };
          this.previousPlayback = playback;
          const result = await this.request<{ text: string; voiceLanguage?: VoiceLanguage; voiceId?: string | null }>(`/api/characters/${id}/conversation`, { text: recognized.text, sessionId: this.sessionId, replyId: playback.replyId, playback: previousPlayback }, signal, 130000);
          signal.throwIfAborted();
          if (result.voiceLanguage) this.voiceLanguage = result.voiceLanguage;
          await this.speak(result.text, signal, id, result.voiceId, playback);
        } else {
          this.missedPhrases++;
          if (this.missedPhrases >= 2) {
            await this.failed(this.language === "zh-CN"
              ? "连续两次没能识别清楚。请在右下角的三个点里检查麦克风，再点语音按钮重试。"
              : "I couldn't recognize the last two attempts. Check the microphone in the audio menu, then start voice conversation again.");
            return;
          }
          const chineseVoice = this.voiceLanguage === "zh" || (this.voiceLanguage === "unknown" && this.language === "zh-CN");
          await this.speak(chineseVoice ? "我没有听清楚，请再说一遍。" : "I didn't catch that. Please say it again.", signal, id);
        }
      }
      signal.throwIfAborted();
      this.hearing = true; this.onState("listening"); this.avatar("listening");
      this.idleTimer = setTimeout(() => this.stop(), 45000);
    } catch (error) { if (!signal.aborted) await this.failed(error instanceof Error ? error.message : "The conversation failed. Please try again."); }
    finally { if (this.turn === turn) this.turn = null; }
  }
  private async speak(text: string, signal: AbortSignal, id: string, voiceId?: string | null, playback?: { heardCharacters: number; interrupted: boolean }) {
    signal.throwIfAborted();
    const sentences = spokenSentences(text, this.voiceLanguage);
    if (!sentences.length) return;
    const cancellation = new AbortController();
    const speaking = AbortSignal.any([signal, cancellation.signal]);
    // Store rejected prefetches as values until consumed, so a failure during playback
    // cannot become an unhandled rejection. Only one following request is in flight.
    const synthesize = (sentence: string) => this.request<{ audio: string }>(
      `/api/characters/${encodeURIComponent(id)}/voice/synthesize`, { text: sentence, ...(voiceId ? { voiceId } : {}) }, speaking, 95000,
    ).then(result => ({ result, error: undefined }), error => ({ result: undefined, error }));
    let pending = synthesize(sentences[0]);
    let context: OutputContext | undefined;
    try {
      context = new AudioContext(); this.playback = context;
      await selectOutput(context, this.devices().output); await context.resume();
      for (let index = 0; index < sentences.length; index++) {
        const { result, error } = await pending;
        speaking.throwIfAborted();
        if (!result) throw error;
        if (index + 1 < sentences.length) pending = synthesize(sentences[index + 1]);
        await this.playAudio(result.audio, context, speaking, sentences[index]);
        // Conservatively acknowledge completed sentences; never guess where a word was cut.
        if (playback) playback.heardCharacters = text.indexOf(sentences[index], playback.heardCharacters) + sentences[index].length;
      }
      if (playback) { playback.heardCharacters = text.length; playback.interrupted = false; }
    } finally {
      cancellation.abort();
      if (context && context.state !== "closed") await context.close().catch(() => {});
      if (this.playback === context) this.playback = null;
    }
  }
  private async playAudio(audio: string, context: OutputContext, signal: AbortSignal, text: string) {
    let animation = 0;
    const motion = new SpokenMotionPlayback(() => context.currentTime, signal);
    try {
      const bytes = Uint8Array.from(atob(audio), char => char.charCodeAt(0));
      const buffer = await context.decodeAudioData(bytes.buffer); signal.throwIfAborted();
      await motion.prepare(text, buffer.duration, this.sessionId, this.motion);
      signal.throwIfAborted();
      const source = context.createBufferSource(), analyser = context.createAnalyser(); analyser.fftSize = 512;
      source.buffer = buffer; source.connect(analyser); analyser.connect(context.destination);
      this.onState("speaking"); this.avatar("speaking");
      const samples = new Float32Array(analyser.fftSize);
      const animate = () => {
        if (signal.aborted) return;
        analyser.getFloatTimeDomainData(samples); this.onFrame(voiceFrame(samples, performance.now()));
        let power = 0; for (const sample of samples) power += sample * sample;
        window.dispatchEvent(new CustomEvent("preacherman:avatar-jaw", { detail: Math.min(1, Math.sqrt(power / samples.length) * 3.2) }));
        animation = requestAnimationFrame(animate); this.animation = animation;
      };
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const finish = (error?: unknown) => {
          if (settled) return;
          settled = true; clearTimeout(timer); signal.removeEventListener("abort", abort); source.onended = null;
          if (error) { try { source.stop(); } catch { /* Not started. */ } }
          source.disconnect(); analyser.disconnect();
          if (error) reject(error); else resolve();
        };
        const abort = () => finish(signal.reason || new Error("Audio playback cancelled."));
        const timer = setTimeout(() => finish(new Error("Audio playback timed out.")), Math.min(90000, buffer.duration * 1000 + 4000));
        signal.addEventListener("abort", abort, { once: true });
        source.onended = () => finish();
        if (signal.aborted) abort();
        else { try { motion.start(); source.start(); animate(); } catch (error) { finish(error); } }
      });
    } finally {
      motion.stop();
      cancelAnimationFrame(animation);
      if (this.animation === animation) this.animation = 0;
      if (this.playback === context) window.dispatchEvent(new CustomEvent("preacherman:avatar-jaw", { detail: 0 }));
    }
  }
  private async failed(_message: string) {
    const signal = this.cancellation?.signal;
    this.hearing = false; this.meter.stop(); clearTimeout(this.idleTimer);
    // Do not send a second synthesis request to a possibly failing speech service.
    if (signal?.aborted) return;
    this.stop(); if (!this.disposed) this.onState("error");
  }
  stop() {
    this.cancellation?.abort(); this.cancellation = null; this.hearing = false; this.characterId = null;
    this.turn?.abort(); this.turn = null; this.previousPlayback = undefined;
    clearTimeout(this.idleTimer); this.meter.stop(); cancelAnimationFrame(this.animation);
    void this.playback?.close().catch(() => {}); this.playback = null;
    this.avatar("idle"); window.dispatchEvent(new CustomEvent("preacherman:avatar-jaw", { detail: 0 }));
    if (!this.disposed) this.onState("idle");
  }
  setVisible(visible: boolean) { this.meter.setVisible(visible); }
  dispose() { this.stop(); this.disposed = true; this.meter.dispose(); }
}
