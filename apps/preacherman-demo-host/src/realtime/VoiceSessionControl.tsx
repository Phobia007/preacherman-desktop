import { useEffect, useRef, useState } from "react";
import type { SpeechRequest } from "../live/LiveCoordinator";
import { useAvatarInteractionController, useLiveCoordinator, type AvatarInteractionState } from "../live/LiveCoordinatorContext";
import type { Locale } from "../preferences";
import { localServiceWebSocketUrl } from "../serviceConfig";
import { speechMotionRuntime, type AudioFaceInputStream } from "../motion/SpeechMotionRuntime";
import { captureCortanaVoiceTiming, type CortanaVoiceMilestone } from "../telemetry/cortanaVoiceTiming";
import "./voice-session.css";

type VoiceState = "idle" | "listening" | "finalizing" | "error";
type CaptureMode = "pushToTalk" | "handsFree";
const VOICE_MODE_STORAGE_KEY = "preacherman.voice-capture-mode";

interface VoiceTimingTrace {
  readonly traceId: string;
  readonly startedAt: number;
  readonly conversationEpoch: number;
  readonly captureMode: CaptureMode;
  readonly trigger: "wake_control" | "voice_control" | "hands_free_restart";
  readonly recorded: Set<CortanaVoiceMilestone>;
}

function reportWakeState(active: boolean) {
  window.dispatchEvent(new CustomEvent("preacherman:voice-wake-state", {
    detail: { active },
  }));
}

function eventId(): string { return `event_${crypto.randomUUID()}`; }

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function pcm16(samples: Float32Array): Uint8Array {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  samples.forEach((sample, index) => view.setInt16(index * 2, Math.max(-1, Math.min(1, sample)) * 0x7fff, true));
  return bytes;
}

function fromBase64(value: string): Int16Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Int16Array(bytes.buffer);
}

function audioEnergy(samples: Int16Array): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (const sample of samples) sum += (sample / 0x8000) ** 2;
  return Math.min(1, Math.sqrt(sum / samples.length) * 3.2);
}

function estimatedSpeechDuration(text: string, locale: Locale): number {
  const units = locale === "zh-CN"
    ? text.replace(/[\s\p{P}\p{S}]/gu, "").length
    : text.trim().split(/\s+/).filter(Boolean).length;
  return Math.min(30, Math.max(1, units / (locale === "zh-CN" ? 5.2 : 2.7)));
}

function isMeaningfulTranscript(value: string): boolean {
  const content = value.replace(/[\s\p{P}\p{S}]/gu, "");
  return content.length >= 2;
}

function copy(locale: Locale) {
  return locale === "zh-CN"
    ? { idle: "按住说话", listening: "松开后发送", finalizing: "正在确认语音", pushToTalk: "按住", handsFree: "自由说话", handsFreeStart: "开始聆听", handsFreeStop: "结束聆听", stopSpeaking: "停止说话" }
    : { idle: "Hold to talk", listening: "Release to send", finalizing: "Finalizing speech", pushToTalk: "Hold", handsFree: "Hands-free", handsFreeStart: "Start listening", handsFreeStop: "Stop listening", stopSpeaking: "Stop speaking" };
}

export function VoiceSessionControl({
  locale,
  headless = false,
}: {
  readonly locale: Locale;
  readonly headless?: boolean;
}) {
  const coordinator = useLiveCoordinator();
  const avatarInteraction = useAvatarInteractionController();
  const [state, setState] = useState<VoiceState>("idle");
  const [speechLifecycle, setSpeechLifecycle] = useState(coordinator.getSpeechLifecycle());
  const [captureMode, setCaptureMode] = useState<CaptureMode>(() => localStorage.getItem(VOICE_MODE_STORAGE_KEY) === "handsFree" ? "handsFree" : "pushToTalk");
  const [transcript, setTranscript] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const stateRef = useRef<VoiceState>("idle");
  const transcriptRef = useRef("");
  const socket = useRef<WebSocket | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const context = useRef<AudioContext | null>(null);
  const processor = useRef<ScriptProcessorNode | null>(null);
  const timer = useRef<number | null>(null);
  const playbackContext = useRef<AudioContext | null>(null);
  const playbackCursor = useRef(0);
  const activeTts = useRef<WebSocket | null>(null);
  const activePlaybackSources = useRef(new Set<AudioBufferSourceNode>());
  const jawTimers = useRef(new Set<number>());
  const playbackCompletionTimer = useRef<number | null>(null);
  const ttsFallbackTimer = useRef<number | null>(null);
  const thinkingFallbackTimer = useRef<number | null>(null);
  const activeSpeechEpoch = useRef<number | null>(null);
  const activeAsrEpoch = useRef<number | null>(null);
  const captureModeRef = useRef<CaptureMode>(captureMode);
  const handsFreeActive = useRef(false);
  const awaitingAssistantReply = useRef(false);
  const expectedSocketClose = useRef(false);
  const voiceTiming = useRef<VoiceTimingTrace | null>(null);
  const labels = copy(locale);

  const beginVoiceTiming = (
    conversationEpoch: number,
    trigger: VoiceTimingTrace["trigger"],
  ) => {
    const trace: VoiceTimingTrace = {
      traceId: `voice_${crypto.randomUUID()}`,
      startedAt: performance.now(),
      conversationEpoch,
      captureMode: captureModeRef.current,
      trigger,
      recorded: new Set(),
    };
    voiceTiming.current = trace;
    trace.recorded.add("wake");
    captureCortanaVoiceTiming("wake", {
      traceId: trace.traceId,
      elapsedMs: 0,
      conversationEpoch,
      captureMode: trace.captureMode,
      trigger,
    });
  };

  const recordVoiceTiming = (
    milestone: CortanaVoiceMilestone,
    details: {
      interactionEpoch?: number;
      driver?: "speech2motion" | "audio2face";
      fallbackReason?: "tts_timeout" | "tts_error" | "tts_empty";
      completion?: "stream" | "speech_synthesis";
    } = {},
  ) => {
    const trace = voiceTiming.current;
    if (!trace || trace.recorded.has(milestone)) return;
    trace.recorded.add(milestone);
    captureCortanaVoiceTiming(milestone, {
      traceId: trace.traceId,
      elapsedMs: performance.now() - trace.startedAt,
      conversationEpoch: trace.conversationEpoch,
      captureMode: trace.captureMode,
      trigger: trace.trigger,
      ...details,
    });
  };

  const setAvatarState = (next: AvatarInteractionState) => {
    avatarInteraction.setState(next);
    window.dispatchEvent(new CustomEvent("preacherman:avatar-state", { detail: next }));
  };

  const clearThinkingFallback = () => {
    if (thinkingFallbackTimer.current) window.clearTimeout(thinkingFallbackTimer.current);
    thinkingFallbackTimer.current = null;
  };

  const beginThinking = () => {
    clearThinkingFallback();
    setAvatarState("thinking");
    thinkingFallbackTimer.current = window.setTimeout(() => {
      if (avatarInteraction.getState() === "thinking") setAvatarState("idle");
      awaitingAssistantReply.current = false;
      thinkingFallbackTimer.current = null;
    }, 20_000);
  };

  const setVoiceError = (message: string) => {
    setErrorMessage(message);
    activeAsrEpoch.current = null;
    stateRef.current = "error";
    setState("error");
    clearThinkingFallback();
    setAvatarState("idle");
    voiceTiming.current = null;
  };

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { transcriptRef.current = transcript; }, [transcript]);
  useEffect(() => { captureModeRef.current = captureMode; localStorage.setItem(VOICE_MODE_STORAGE_KEY, captureMode); }, [captureMode]);
  useEffect(() => coordinator.onSpeechLifecycle(setSpeechLifecycle), [coordinator]);

  const cleanup = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    processor.current?.disconnect(); processor.current = null;
    void context.current?.close(); context.current = null;
    stream.current?.getTracks().forEach((track) => track.stop()); stream.current = null;
  };
  useEffect(() => () => { cleanup(); clearThinkingFallback(); avatarInteraction.setState("idle"); socket.current?.close(); }, [avatarInteraction]);
  useEffect(() => coordinator.onConversationEpoch(() => {
    expectedSocketClose.current = true;
    handsFreeActive.current = false;
    awaitingAssistantReply.current = false;
    activeAsrEpoch.current = null;
    socket.current?.close();
    socket.current = null;
    cleanup();
    clearThinkingFallback();
    transcriptRef.current = "";
    setTranscript("");
    setErrorMessage("");
    stateRef.current = "idle";
    setState("idle");
    setAvatarState("idle");
    voiceTiming.current = null;
  }), [coordinator]);

  useEffect(() => {
    let resolveActivePlayback: (() => void) | null = null;
    let removeAbortListener: (() => void) | null = null;
    const clearPlayback = () => {
      if (playbackCompletionTimer.current) window.clearTimeout(playbackCompletionTimer.current);
      if (ttsFallbackTimer.current) window.clearTimeout(ttsFallbackTimer.current);
      playbackCompletionTimer.current = null;
      ttsFallbackTimer.current = null;
      const ws = activeTts.current;
      activeTts.current = null;
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.close();
      }
      speechSynthesis.cancel();
      for (const source of activePlaybackSources.current) {
        try { source.stop(); } catch { /* source already ended */ }
      }
      activePlaybackSources.current.clear();
      for (const timerId of jawTimers.current) window.clearTimeout(timerId);
      jawTimers.current.clear();
      playbackCursor.current = 0;
      speechMotionRuntime.cancel(activeSpeechEpoch.current ?? undefined, "speech-stopped");
      window.dispatchEvent(new CustomEvent("preacherman:avatar-jaw", { detail: 0 }));
    };
    const finishPlayback = (
      expectedEpoch = activeSpeechEpoch.current,
      completion?: "stream" | "speech_synthesis",
    ) => {
      if (expectedEpoch !== activeSpeechEpoch.current) return;
      if (completion) recordVoiceTiming("complete", { interactionEpoch: expectedEpoch ?? undefined, completion });
      removeAbortListener?.();
      removeAbortListener = null;
      clearPlayback();
      activeSpeechEpoch.current = null;
      clearThinkingFallback();
      setAvatarState("idle");
      coordinator.reportSpeechLifecycle("idle");
      const resolve = resolveActivePlayback;
      resolveActivePlayback = null;
      resolve?.();
      if (completion) voiceTiming.current = null;
    };
    const stopSpeech = (_reason: "user_action" | "new_request") => {
      coordinator.reportSpeechLifecycle("stopping");
      finishPlayback();
    };
    const play = ({ text, locale: speechLocale, interactionEpoch }: SpeechRequest, signal: AbortSignal) => new Promise<void>((resolve) => {
      if (!text) { resolve(); return; }
      clearPlayback();
      activeSpeechEpoch.current = interactionEpoch;
      awaitingAssistantReply.current = false;
      clearThinkingFallback();
      resolveActivePlayback = resolve;
      const handleAbort = () => stopSpeech("new_request");
      signal.addEventListener("abort", handleAbort, { once: true });
      removeAbortListener = () => signal.removeEventListener("abort", handleAbort);
      if (signal.aborted) { handleAbort(); return; }
      coordinator.reportSpeechLifecycle("starting");
      setAvatarState("speaking");
      const ws = new WebSocket(localServiceWebSocketUrl("/api/voice/tts"));
      activeTts.current = ws;
      let receivedAudio = false;
      let usedFallback = false;
      let playbackStarted = false;
      let streamFinalized = false;
      let faceInput: AudioFaceInputStream | null = null;
      const fallback = (reason: "tts_timeout" | "tts_error" | "tts_empty") => {
        if (activeSpeechEpoch.current !== interactionEpoch) return;
        if (usedFallback || receivedAudio) return;
        usedFallback = true;
        recordVoiceTiming("fallback", { interactionEpoch, fallbackReason: reason });
        activeTts.current = null;
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.close();
        speechSynthesis.cancel();
        speechMotionRuntime.cancel(interactionEpoch, "tts-fallback");
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.onstart = () => {
          if (activeSpeechEpoch.current === interactionEpoch) coordinator.reportSpeechLifecycle("playing");
        };
        utterance.onend = () => finishPlayback(interactionEpoch, "speech_synthesis");
        utterance.onerror = () => finishPlayback(interactionEpoch, "speech_synthesis");
        speechSynthesis.speak(utterance);
      };
      const startDrivers = (firstPcm: Int16Array) => {
        const firstMotion = (driver: "speech2motion" | "audio2face") => (ready: boolean) => {
          if (ready && activeSpeechEpoch.current === interactionEpoch && !signal.aborted) {
            recordVoiceTiming("first_motion", { interactionEpoch, driver });
          }
        };
        void speechMotionRuntime.start({
          text,
          duration: estimatedSpeechDuration(text, speechLocale),
          interactionEpoch,
          signal,
        }).then(firstMotion("speech2motion"));
        faceInput = speechMotionRuntime.startFaceStream({
          sampleRate: 24_000,
          interactionEpoch,
          signal,
        });
        void faceInput.firstFrame.then(firstMotion("audio2face"));
        faceInput.append(firstPcm);
      };
      const scheduleAudio = (pcm: Int16Array) => {
        const audio = playbackContext.current || new AudioContext({ sampleRate: 24_000 });
        playbackContext.current = audio;
        const leadTime = playbackStarted ? 0.02 : 0.08;
        const startAt = Math.max(playbackCursor.current, audio.currentTime + leadTime);
        const buffer = audio.createBuffer(1, pcm.length, 24_000);
        const channel = buffer.getChannelData(0);
        for (let index = 0; index < pcm.length; index += 1) channel[index] = pcm[index] / 0x8000;
        const source = audio.createBufferSource();
        source.buffer = buffer;
        source.connect(audio.destination);
        activePlaybackSources.current.add(source);
        source.onended = () => activePlaybackSources.current.delete(source);
        source.start(startAt);
        const jawTimer = window.setTimeout(() => {
          jawTimers.current.delete(jawTimer);
          if (activeSpeechEpoch.current === interactionEpoch) {
            window.dispatchEvent(new CustomEvent("preacherman:avatar-jaw", { detail: audioEnergy(pcm) }));
          }
        }, Math.max(0, (startAt - audio.currentTime) * 1000));
        jawTimers.current.add(jawTimer);
        playbackCursor.current = startAt + pcm.length / 24_000;
        if (!playbackStarted) {
          playbackStarted = true;
          coordinator.reportSpeechLifecycle("playing");
          recordVoiceTiming("first_audio", { interactionEpoch });
        }
      };
      const finishStream = () => {
        if (streamFinalized || activeSpeechEpoch.current !== interactionEpoch) return;
        streamFinalized = true;
        if (ttsFallbackTimer.current) window.clearTimeout(ttsFallbackTimer.current);
        ttsFallbackTimer.current = null;
        if (!receivedAudio) { fallback("tts_empty"); return; }
        faceInput?.finish();
        activeTts.current = null;
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.close();
        const audio = playbackContext.current;
        playbackCompletionTimer.current = window.setTimeout(
          () => finishPlayback(interactionEpoch, "stream"),
          Math.max(0, ((playbackCursor.current || audio?.currentTime || 0) - (audio?.currentTime || 0)) * 1000),
        );
      };
      ttsFallbackTimer.current = window.setTimeout(() => fallback("tts_timeout"), 600);
      ws.onopen = () => {
        if (activeSpeechEpoch.current !== interactionEpoch) return;
        ws.send(JSON.stringify({ event_id: eventId(), type: "session.update", session: { voice: "Serena", response_format: "pcm", sample_rate: 24000, mode: "server_commit", language_type: speechLocale === "zh-CN" ? "Chinese" : "English" } }));
      };
      ws.onmessage = async (message) => {
        if (typeof message.data !== "string") return;
        if (activeSpeechEpoch.current !== interactionEpoch) return;
        const payload = JSON.parse(message.data) as { type?: string; delta?: string; error?: { message?: string }; message?: string };
        if (payload.type === "session.updated") {
          ws.send(JSON.stringify({ event_id: eventId(), type: "input_text_buffer.append", text }));
          ws.send(JSON.stringify({ event_id: eventId(), type: "input_text_buffer.commit" }));
          ws.send(JSON.stringify({ event_id: eventId(), type: "session.finish" }));
          return;
        }
        if (payload.type === "response.audio.delta" && payload.delta) {
          if (ttsFallbackTimer.current) window.clearTimeout(ttsFallbackTimer.current);
          ttsFallbackTimer.current = null;
          const pcm = fromBase64(payload.delta);
          if (!receivedAudio) {
            receivedAudio = true;
            startDrivers(pcm);
          } else {
            faceInput?.append(pcm);
          }
          scheduleAudio(pcm);
        }
        if (payload.type === "response.audio.done" || payload.type === "response.done") {
          finishStream();
        }
        if (payload.type === "error") receivedAudio ? finishStream() : fallback("tts_error");
      };
      ws.onerror = () => {
        if (activeSpeechEpoch.current !== interactionEpoch) return;
        receivedAudio ? finishStream() : fallback("tts_error");
      };
    });
    const disconnect = coordinator.connectPresentationAdapter({ speak: play, stopSpeech });
    return () => {
      disconnect();
      clearPlayback();
      coordinator.reportSpeechLifecycle("idle");
    };
  }, [avatarInteraction, coordinator]);

  const finish = (stopHandsFree = false) => {
    if (stateRef.current !== "listening") return;
    if (stopHandsFree) handsFreeActive.current = false;
    stateRef.current = "finalizing";
    setState("finalizing");
    if (captureModeRef.current === "pushToTalk") socket.current?.send(JSON.stringify({ event_id: eventId(), type: "input_audio_buffer.commit" }));
    socket.current?.send(JSON.stringify({ event_id: eventId(), type: "session.finish" }));
    cleanup();
  };

  const start = async (trigger: VoiceTimingTrace["trigger"] = "voice_control") => {
    if (!["idle", "error"].includes(stateRef.current)) return;
    const conversationEpoch = coordinator.getConversationEpoch();
    beginVoiceTiming(conversationEpoch, trigger);
    activeAsrEpoch.current = conversationEpoch;
    try {
      coordinator.stopSpeech();
      setErrorMessage("");
      clearThinkingFallback();
      setAvatarState("listening");
      setTranscript("");
      const mic = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, sampleRate: 16000 } });
      if (!coordinator.isConversationEpochCurrent(conversationEpoch) || activeAsrEpoch.current !== conversationEpoch) {
        mic.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = mic;
      const ws = new WebSocket(localServiceWebSocketUrl("/api/voice/asr"));
      expectedSocketClose.current = false;
      socket.current = ws;
      const startCapture = () => {
        if (processor.current) return;
        const audio = new AudioContext({ sampleRate: 16000 }); context.current = audio;
        const source = audio.createMediaStreamSource(mic);
        const node = audio.createScriptProcessor(2048, 1, 1); processor.current = node;
        node.onaudioprocess = (audioEvent) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          const data = pcm16(audioEvent.inputBuffer.getChannelData(0));
          ws.send(JSON.stringify({ event_id: eventId(), type: "input_audio_buffer.append", audio: toBase64(data) }));
        };
        source.connect(node); node.connect(audio.destination);
        stateRef.current = "listening";
        setState("listening");
        reportWakeState(true);
        timer.current = window.setTimeout(() => finish(captureModeRef.current === "handsFree"), captureModeRef.current === "handsFree" ? 45_000 : 20_000);
      };
      ws.onmessage = (event) => {
        if (typeof event.data !== "string") return;
        if (!coordinator.isConversationEpochCurrent(conversationEpoch) || activeAsrEpoch.current !== conversationEpoch) return;
        const payload = JSON.parse(event.data) as { type?: string; delta?: string; transcript?: string; text?: string; message?: string; error?: { message?: string } };
        if (payload.type === "preacherman.voice.error" || payload.type === "error") {
          setVoiceError(payload.error?.message || payload.message || (locale === "zh-CN" ? "语音服务拒绝了连接。" : "The voice service rejected the connection."));
          cleanup();
          return;
        }
        if (payload.type === "session.updated") { startCapture(); return; }
        const text = payload.text || payload.transcript || payload.delta;
        if (text) setTranscript((current) => payload.type?.includes("delta") ? `${current}${text}` : text);
        if (payload.type?.includes("completed") && (payload.text || payload.transcript || transcriptRef.current)) {
          const finalText = payload.text || payload.transcript || transcriptRef.current;
          if (!isMeaningfulTranscript(finalText)) {
            setTranscript("");
            return;
          }
          if (!coordinator.deliverFinalTranscript(finalText, conversationEpoch)) return;
          recordVoiceTiming("asr");
          awaitingAssistantReply.current = true;
          beginThinking();
          activeAsrEpoch.current = null;
          if (captureModeRef.current === "handsFree" && handsFreeActive.current) {
            expectedSocketClose.current = true;
            stateRef.current = "finalizing";
            setState("finalizing");
            cleanup();
            ws.close();
            return;
          }
          stateRef.current = "idle";
          setState("idle"); cleanup(); ws.close();
        }
        if (payload.type === "session.finished") {
          stateRef.current = "idle";
          setState("idle");
          if (!awaitingAssistantReply.current) setAvatarState("idle");
          cleanup();
          ws.close();
        }
      };
      ws.onerror = () => {
        if (!coordinator.isConversationEpochCurrent(conversationEpoch) || activeAsrEpoch.current !== conversationEpoch) return;
        setVoiceError(locale === "zh-CN" ? "无法连接语音服务。请检查本地服务和设置。" : "Cannot connect to the voice service. Check the local service and Settings."); cleanup();
      };
      ws.onclose = () => {
        if (!coordinator.isConversationEpochCurrent(conversationEpoch) || activeAsrEpoch.current !== conversationEpoch) return;
        if (expectedSocketClose.current) return;
        if (["listening", "finalizing"].includes(stateRef.current)) {
          setVoiceError(locale === "zh-CN" ? "语音连接意外关闭。请重试。" : "The voice connection closed unexpectedly. Please try again.");
          cleanup();
        }
      };
      ws.onopen = async () => {
        if (!coordinator.isConversationEpochCurrent(conversationEpoch) || activeAsrEpoch.current !== conversationEpoch) {
          ws.close();
          return;
        }
        const turnDetection = captureModeRef.current === "handsFree"
          ? { type: "server_vad", threshold: 0.2, silence_duration_ms: 900 }
          : null;
        ws.send(JSON.stringify({ event_id: eventId(), type: "session.update", session: { modalities: ["text"], input_audio_format: "pcm", sample_rate: 16000, input_audio_transcription: { language: locale === "zh-CN" ? "zh" : "en" }, turn_detection: turnDetection } }));
      };
    } catch (error) {
      if (!coordinator.isConversationEpochCurrent(conversationEpoch) || activeAsrEpoch.current !== conversationEpoch) return;
      const denied = error instanceof DOMException && error.name === "NotAllowedError";
      setVoiceError(denied
        ? (locale === "zh-CN" ? "请在浏览器地址栏允许麦克风权限后重试。" : "Allow microphone access in the browser, then try again.")
        : (locale === "zh-CN" ? "无法打开麦克风。请检查设备权限。" : "Cannot open the microphone. Check device permissions."));
      cleanup();
    }
  };

  useEffect(() => {
    const handleWakeRequest = (event: Event) => {
      const active = Boolean((event as CustomEvent<{ active?: boolean }>).detail?.active);
      if (active) {
        captureModeRef.current = "handsFree";
        setCaptureMode("handsFree");
        handsFreeActive.current = true;
        reportWakeState(true);
        void start("wake_control");
        return;
      }

      handsFreeActive.current = false;
      awaitingAssistantReply.current = false;
      activeAsrEpoch.current = null;
      expectedSocketClose.current = true;
      coordinator.stopSpeech();
      socket.current?.close();
      socket.current = null;
      cleanup();
      clearThinkingFallback();
      stateRef.current = "idle";
      setState("idle");
      setAvatarState("idle");
      voiceTiming.current = null;
      reportWakeState(false);
    };

    window.addEventListener("preacherman:voice-wake-request", handleWakeRequest);
    return () => window.removeEventListener("preacherman:voice-wake-request", handleWakeRequest);
  });

  useEffect(() => coordinator.onSpeechLifecycle((lifecycle) => {
    if (lifecycle === "idle") {
      if (!handsFreeActive.current || !awaitingAssistantReply.current || captureModeRef.current !== "handsFree") return;
      awaitingAssistantReply.current = false;
      stateRef.current = "idle";
      setState("idle");
      window.setTimeout(() => { if (handsFreeActive.current) void start("hands_free_restart"); }, 180);
    }
  }));

  if (headless) return null;

  return (
    <section className="preacherman-live" data-speech-state={speechLifecycle} data-state={speechLifecycle === "playing" ? "speaking" : state}>
      <div className="preacherman-live__status" data-preacherman-control="voice.tts" role="status" tabIndex={-1}>
        <span>{locale === "zh-CN" ? "语音输入" : "Voice input"}</span>
        <strong>{state === "error" ? errorMessage : transcript || labels[state]}</strong>
      </div>
      <div aria-label={locale === "zh-CN" ? "语音输入模式" : "Voice input mode"} className="preacherman-live__mode" data-preacherman-control="voice.capture-mode" role="group" tabIndex={-1}>
        <button aria-pressed={captureMode === "pushToTalk"} disabled={state === "listening" || state === "finalizing"} onClick={() => { handsFreeActive.current = false; setCaptureMode("pushToTalk"); }} type="button">{labels.pushToTalk}</button>
        <button aria-pressed={captureMode === "handsFree"} disabled={state === "listening" || state === "finalizing"} onClick={() => setCaptureMode("handsFree")} type="button">{labels.handsFree}</button>
      </div>
      <div className="preacherman-live__controls">
        <button
          aria-pressed={state === "listening"}
          className="preacherman-live__button"
          data-preacherman-control="voice.quick-input voice.asr"
          disabled={state === "finalizing"}
          onClick={captureMode === "handsFree" ? () => { if (state === "listening") finish(true); else { handsFreeActive.current = true; void start(); } } : undefined}
          onPointerCancel={captureMode === "pushToTalk" ? () => finish() : undefined}
          onPointerDown={captureMode === "pushToTalk" ? (event) => { event.currentTarget.setPointerCapture(event.pointerId); void start(); } : undefined}
          onPointerLeave={captureMode === "pushToTalk" ? () => finish() : undefined}
          onPointerUp={captureMode === "pushToTalk" ? () => finish() : undefined}
          type="button"
        >
          <span aria-hidden="true" className="preacherman-live__signal"><i /><i /><i /></span>
          <span>{state === "error" ? (locale === "zh-CN" ? "点按重试" : "Tap to retry") : captureMode === "handsFree" ? (state === "listening" ? labels.handsFreeStop : labels.handsFreeStart) : labels[state]}</span>
        </button>
        <button className="preacherman-live__cancel" data-preacherman-control="presentation.stop" disabled={speechLifecycle === "idle"} onClick={() => coordinator.stopSpeech()} type="button">{labels.stopSpeaking}</button>
      </div>
    </section>
  );
}
