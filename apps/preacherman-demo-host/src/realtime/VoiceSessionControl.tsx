import { useEffect, useRef, useState } from "react";
import type { Locale } from "../preferences";
import {
  RealtimeVoiceClient,
  type CodexTaskSnapshot,
  type VoiceInteractionState,
} from "./RealtimeVoiceClient";
import "./voice-session.css";

const copy = {
  en: {
    idle: "Start voice",
    connecting: "Connecting",
    listening: "Listening",
    thinking: "Thinking",
    speaking: "Speaking",
    error: "Try again",
    stop: "Stop voice",
    voice: "Voice",
    task: "Codex task",
    cancel: "Cancel task",
  },
  "zh-CN": {
    idle: "开始语音",
    connecting: "正在连接",
    listening: "正在聆听",
    thinking: "正在思考",
    speaking: "正在回答",
    error: "重新连接",
    stop: "结束语音",
    voice: "语音",
    task: "Codex 任务",
    cancel: "取消任务",
  },
} as const;

export function VoiceSessionControl({ locale }: { readonly locale: Locale }) {
  const labels = copy[locale];
  const clientRef = useRef<RealtimeVoiceClient | null>(null);
  const [state, setState] = useState<VoiceInteractionState>("idle");
  const [task, setTask] = useState<CodexTaskSnapshot | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const client = new RealtimeVoiceClient({
      onStateChange: setState,
      onTaskChange: setTask,
      onError: setError,
    });
    clientRef.current = client;
    return () => {
      client.dispose();
      clientRef.current = null;
    };
  }, []);

  const active = !["idle", "error"].includes(state);
  const buttonLabel = active ? labels.stop : labels[state];
  const toggleVoice = () => {
    if (active) clientRef.current?.disconnect();
    else void clientRef.current?.connect();
  };
  const taskIsRunning = task && ["starting", "running"].includes(task.status);

  return (
    <aside
      aria-label="Preacherman live voice"
      className="preacherman-live"
      data-state={state}
    >
      {(error || active) ? (
        <div aria-live="polite" className="preacherman-live__status">
          <span>{labels.voice}</span>
          <strong>{error || labels[state]}</strong>
        </div>
      ) : null}

      {task ? (
        <section aria-live="polite" className="preacherman-live__task" data-status={task.status}>
          <span className="preacherman-live__eyebrow">{labels.task}</span>
          <strong>{task.phase}</strong>
          <p>{task.summary || task.instruction}</p>
          {taskIsRunning ? (
            <button
              className="preacherman-live__cancel"
              onClick={() => void clientRef.current?.cancelCurrentTask()}
              type="button"
            >
              {labels.cancel}
            </button>
          ) : null}
        </section>
      ) : null}

      <button
        aria-label={buttonLabel}
        aria-pressed={active}
        className="preacherman-live__button"
        data-state={state}
        disabled={state === "connecting"}
        onClick={toggleVoice}
        type="button"
      >
        <span aria-hidden="true" className="preacherman-live__signal">
          <i />
          <i />
          <i />
        </span>
        <span>{buttonLabel}</span>
      </button>
    </aside>
  );
}
