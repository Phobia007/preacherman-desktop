import { useEffect, useRef, useState } from "react";
import "./task-surface.css";

const TASK_RUNTIME_REVISION = "20260829-article-details";
const TASK_RUNTIME_URL = `/task-lookback-v3/index.html?revision=${TASK_RUNTIME_REVISION}`;
const TASK_READY_MESSAGE = "task-lookback-v3-ready";
const TASK_ERROR_MESSAGE = "task-lookback-v3-error";
const TASK_READY_TIMEOUT_MS = 15_000;

type TaskLoadState = "loading" | "ready" | "error";

interface TaskRuntimeMessage {
  readonly detail?: unknown;
  readonly message?: unknown;
  readonly type?: unknown;
}

function messageType(data: unknown): unknown {
  return typeof data === "string" ? data : (data as TaskRuntimeMessage | null)?.type;
}

function runtimeErrorMessage(data: unknown): string {
  if (typeof data !== "object" || data === null) return "The timeline reported an error.";
  const runtimeMessage = data as TaskRuntimeMessage;
  const message = runtimeMessage.message ?? runtimeMessage.detail;
  return typeof message === "string" && message.trim()
    ? message
    : "The timeline reported an error.";
}

export function TaskSurface() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [loadState, setLoadState] = useState<TaskLoadState>("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const handleRuntimeMessage = (event: MessageEvent<unknown>) => {
      if (event.origin !== window.location.origin) return;
      if (event.source !== iframeRef.current?.contentWindow) return;

      const type = messageType(event.data);
      if (type === TASK_READY_MESSAGE) {
        setErrorMessage("");
        setLoadState("ready");
      } else if (type === TASK_ERROR_MESSAGE) {
        setErrorMessage(runtimeErrorMessage(event.data));
        setLoadState("error");
      }
    };

    window.addEventListener("message", handleRuntimeMessage);
    return () => window.removeEventListener("message", handleRuntimeMessage);
  }, [attempt]);

  useEffect(() => {
    if (loadState !== "loading") return;
    const timeout = window.setTimeout(() => {
      setErrorMessage("The timeline did not finish loading within 15 seconds.");
      setLoadState("error");
    }, TASK_READY_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [attempt, loadState]);

  const retry = () => {
    setErrorMessage("");
    setLoadState("loading");
    setAttempt((current) => current + 1);
  };

  return (
    <main
      aria-busy={loadState === "loading"}
      aria-label="The Lookback Timeline task"
      className="task-surface"
      data-state={loadState}
    >
      <div
        className="task-surface__aperture"
        data-state={loadState}
        key={attempt}
      >
        <iframe
          aria-hidden={loadState !== "ready"}
          className="task-surface__frame"
          ref={iframeRef}
          sandbox="allow-forms allow-pointer-lock allow-same-origin allow-scripts"
          src={TASK_RUNTIME_URL}
          tabIndex={loadState === "ready" ? 0 : -1}
          title="The Lookback Timeline"
        />
      </div>

      {loadState === "ready" ? (
        <div aria-hidden="true" className="task-surface__scan-line" key={`scan-${attempt}`} />
      ) : null}

      {loadState === "error" ? (
        <div className="task-surface__status task-surface__status--error" role="alert">
          <p>{errorMessage}</p>
          <button aria-label="Retry loading The Lookback Timeline" onClick={retry} type="button">
            Retry
          </button>
        </div>
      ) : null}
    </main>
  );
}
