import { useEffect, useRef, useState } from "react";
import type { Locale } from "../preferences";
import "./preacherman-gamelet-panel.css";

export type PreachermanGameletServiceRequest = <T>(path: string, init?: RequestInit) => Promise<T>;

export interface PreachermanGameletDefinition {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly version: string;
}

export interface PreachermanGameletSession {
  readonly id: string;
  readonly gameletId: string;
  readonly status: "active" | "paused" | "completed" | "stopped" | "destroyed";
  readonly state: {
    readonly board: readonly ("X" | "O" | null)[];
    readonly currentPlayer: "X" | "O" | null;
    readonly moves: number;
    readonly outcome: "playing" | "won" | "draw";
    readonly winner: "X" | "O" | null;
  };
}

export interface PreachermanGameletPanelProps {
  readonly locale: Locale;
  readonly serviceRequest: PreachermanGameletServiceRequest;
}

const GAMELET_ID = "tic-tac-toe";

const copy = {
  en: {
    eyebrow: "Preacherman Gamelet",
    title: "Tic-tac-toe",
    description: "A local, server-authoritative game session. Take turns as X and O.",
    loading: "Loading Gamelets…",
    unavailable: "Tic-tac-toe is not available from the local service.",
    ready: "Ready for a new game",
    start: "Start game",
    restart: "Play again",
    pause: "Pause",
    resume: "Resume",
    stop: "Stop game",
    destroy: "Destroy",
    starting: "Starting…",
    moving: "Sending move…",
    pausing: "Pausing…",
    resuming: "Resuming…",
    stopping: "Stopping…",
    destroying: "Destroying…",
    turn: (player: string) => `${player}'s turn`,
    won: (player: string) => `${player} wins`,
    draw: "Draw game",
    stopped: "Game stopped",
    paused: "Game paused",
    destroyed: "Session destroyed",
    board: "Tic-tac-toe board",
    emptyCell: (cell: number) => `Empty cell ${cell + 1}`,
    markedCell: (cell: number, mark: string) => `Cell ${cell + 1}, ${mark}`,
    errorPrefix: "Gamelet error",
  },
  "zh-CN": {
    eyebrow: "Preacherman 游戏组件",
    title: "井字棋",
    description: "由本地服务端裁定的真实棋局。X 与 O 轮流落子。",
    loading: "正在加载游戏组件…",
    unavailable: "本地服务暂未提供井字棋。",
    ready: "可以开始新棋局",
    start: "开始游戏",
    restart: "再来一局",
    pause: "暂停",
    resume: "继续",
    stop: "停止棋局",
    destroy: "销毁会话",
    starting: "正在开始…",
    moving: "正在提交落子…",
    pausing: "正在暂停…",
    resuming: "正在继续…",
    stopping: "正在停止…",
    destroying: "正在销毁…",
    turn: (player: string) => `轮到 ${player} 落子`,
    won: (player: string) => `${player} 获胜`,
    draw: "本局平局",
    stopped: "棋局已停止",
    paused: "棋局已暂停",
    destroyed: "会话已销毁",
    board: "井字棋棋盘",
    emptyCell: (cell: number) => `空棋格 ${cell + 1}`,
    markedCell: (cell: number, mark: string) => `棋格 ${cell + 1}，${mark}`,
    errorPrefix: "游戏组件错误",
  },
} as const;

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} returned an invalid response.`);
  return value as Record<string, unknown>;
}

function parseGamelets(value: unknown): readonly PreachermanGameletDefinition[] {
  const payload = asObject(value, "Gamelet catalog");
  if (!Array.isArray(payload.gamelets)) throw new Error("Gamelet catalog is missing gamelets.");
  return payload.gamelets.map((candidate) => {
    const gamelet = asObject(candidate, "Gamelet");
    if ([gamelet.id, gamelet.title, gamelet.description, gamelet.version].some((field) => typeof field !== "string")) {
      throw new Error("Gamelet catalog contains an invalid definition.");
    }
    return gamelet as unknown as PreachermanGameletDefinition;
  });
}

function parseSession(value: unknown): PreachermanGameletSession {
  const payload = asObject(value, "Gamelet session");
  const session = asObject(payload.session, "Gamelet session");
  const state = asObject(session.state, "Gamelet state");
  if (typeof session.id !== "string" || session.gameletId !== GAMELET_ID) throw new Error("Gamelet session identity is invalid.");
  if (!(["active", "paused", "completed", "stopped", "destroyed"] as const).includes(session.status as PreachermanGameletSession["status"])) {
    throw new Error("Gamelet session status is invalid.");
  }
  if (!Array.isArray(state.board) || state.board.length !== 9 || state.board.some((cell) => cell !== null && cell !== "X" && cell !== "O")) {
    throw new Error("Gamelet board is invalid.");
  }
  if (state.currentPlayer !== null && state.currentPlayer !== "X" && state.currentPlayer !== "O") {
    throw new Error("Gamelet current player is invalid.");
  }
  if (!Number.isInteger(state.moves) || !["playing", "won", "draw"].includes(String(state.outcome))) {
    throw new Error("Gamelet state is invalid.");
  }
  if (state.winner !== null && state.winner !== "X" && state.winner !== "O") throw new Error("Gamelet winner is invalid.");
  return session as unknown as PreachermanGameletSession;
}

export async function loadPreachermanGamelets(serviceRequest: PreachermanGameletServiceRequest) {
  return parseGamelets(await serviceRequest<unknown>("/api/gamelets"));
}

export async function createPreachermanGameletSession(serviceRequest: PreachermanGameletServiceRequest) {
  return parseSession(await serviceRequest<unknown>("/api/gamelets/sessions", {
    method: "POST",
    body: JSON.stringify({ gameletId: GAMELET_ID }),
  }));
}

export async function sendPreachermanGameletAction(
  serviceRequest: PreachermanGameletServiceRequest,
  sessionId: string,
  cell: number,
) {
  return parseSession(await serviceRequest<unknown>(
    `/api/gamelets/sessions/${encodeURIComponent(sessionId)}/actions`,
    { method: "POST", body: JSON.stringify({ action: { type: "place", cell } }) },
  ));
}

export async function stopPreachermanGameletSession(
  serviceRequest: PreachermanGameletServiceRequest,
  sessionId: string,
) {
  return parseSession(await serviceRequest<unknown>(
    `/api/gamelets/sessions/${encodeURIComponent(sessionId)}/stop`,
    { method: "POST", body: JSON.stringify({ reason: "user-requested" }) },
  ));
}

export async function pausePreachermanGameletSession(
  serviceRequest: PreachermanGameletServiceRequest,
  sessionId: string,
) {
  return parseSession(await serviceRequest<unknown>(
    `/api/gamelets/sessions/${encodeURIComponent(sessionId)}/pause`,
    { method: "POST", body: JSON.stringify({}) },
  ));
}

export async function resumePreachermanGameletSession(
  serviceRequest: PreachermanGameletServiceRequest,
  sessionId: string,
) {
  return parseSession(await serviceRequest<unknown>(
    `/api/gamelets/sessions/${encodeURIComponent(sessionId)}/resume`,
    { method: "POST", body: JSON.stringify({}) },
  ));
}

export async function destroyPreachermanGameletSession(
  serviceRequest: PreachermanGameletServiceRequest,
  sessionId: string,
) {
  return parseSession(await serviceRequest<unknown>(
    `/api/gamelets/sessions/${encodeURIComponent(sessionId)}`,
    { method: "DELETE" },
  ));
}

function statusText(session: PreachermanGameletSession | null, locale: Locale) {
  const text = copy[locale];
  if (!session) return text.ready;
  if (session.status === "paused") return text.paused;
  if (session.status === "stopped") return text.stopped;
  if (session.status === "destroyed") return text.destroyed;
  if (session.status === "completed") {
    if (session.state.outcome === "won" && session.state.winner) return text.won(session.state.winner);
    if (session.state.outcome === "draw") return text.draw;
  }
  return session.state.currentPlayer ? text.turn(session.state.currentPlayer) : text.stopped;
}

export function PreachermanGameletPanel({ locale, serviceRequest }: PreachermanGameletPanelProps) {
  const text = copy[locale];
  const [catalogState, setCatalogState] = useState<"loading" | "ready" | "unavailable">("loading");
  const [session, setSession] = useState<PreachermanGameletSession | null>(null);
  const [pending, setPending] = useState<"start" | "move" | "pause" | "resume" | "stop" | "destroy" | null>(null);
  const [error, setError] = useState("");
  const cells = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    let active = true;
    void loadPreachermanGamelets(serviceRequest).then((gamelets) => {
      if (active) setCatalogState(gamelets.some((gamelet) => gamelet.id === GAMELET_ID) ? "ready" : "unavailable");
    }).catch((reason) => {
      if (active) {
        setCatalogState("unavailable");
        setError(reason instanceof Error ? reason.message : String(reason));
      }
    });
    return () => { active = false; };
  }, [serviceRequest]);

  useEffect(() => {
    if (session?.status !== "active" || pending) return;
    const firstOpenCell = session.state.board.findIndex((cell) => cell === null);
    if (firstOpenCell >= 0) cells.current[firstOpenCell]?.focus({ preventScroll: true });
  }, [pending, session]);

  const start = async () => {
    if (pending || catalogState !== "ready") return;
    setPending("start");
    setError("");
    try {
      setSession(await createPreachermanGameletSession(serviceRequest));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setPending(null);
    }
  };

  const place = async (cell: number) => {
    if (!session || session.status !== "active" || session.state.board[cell] !== null || pending) return;
    setPending("move");
    setError("");
    try {
      setSession(await sendPreachermanGameletAction(serviceRequest, session.id, cell));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setPending(null);
    }
  };

  const stop = async () => {
    if (!session || (session.status !== "active" && session.status !== "paused") || pending) return;
    setPending("stop");
    setError("");
    try {
      setSession(await stopPreachermanGameletSession(serviceRequest, session.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setPending(null);
    }
  };

  const pause = async () => {
    if (!session || session.status !== "active" || pending) return;
    setPending("pause");
    setError("");
    try {
      setSession(await pausePreachermanGameletSession(serviceRequest, session.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setPending(null);
    }
  };

  const resume = async () => {
    if (!session || session.status !== "paused" || pending) return;
    setPending("resume");
    setError("");
    try {
      setSession(await resumePreachermanGameletSession(serviceRequest, session.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setPending(null);
    }
  };

  const destroy = async () => {
    if (!session || session.status === "destroyed" || pending) return;
    setPending("destroy");
    setError("");
    try {
      setSession(await destroyPreachermanGameletSession(serviceRequest, session.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setPending(null);
    }
  };

  const status = catalogState === "loading"
    ? text.loading
    : catalogState === "unavailable"
      ? text.unavailable
      : pending === "start"
        ? text.starting
        : pending === "move"
          ? text.moving
          : pending === "stop"
            ? text.stopping
            : pending === "pause"
              ? text.pausing
              : pending === "resume"
                ? text.resuming
                : pending === "destroy"
                  ? text.destroying
                  : statusText(session, locale);

  return <section className="demo-preacherman-gamelet" data-preacherman-control="plugin.gamelets" aria-labelledby="preacherman-gamelet-title">
    <header className="demo-preacherman-gamelet__header">
      <div>
        <span className="demo-preacherman-gamelet__eyebrow">{text.eyebrow}</span>
        <h2 id="preacherman-gamelet-title">{text.title}</h2>
        <p>{text.description}</p>
      </div>
      <div className="demo-preacherman-gamelet__actions">
        {session?.status === "active" ? <button
          className="demo-preacherman-gamelet__pause"
          disabled={pending !== null}
          onClick={() => void pause()}
          type="button"
        >
          {pending === "pause" ? text.pausing : text.pause}
        </button> : null}
        {session?.status === "paused" ? <button
          className="demo-preacherman-gamelet__resume"
          disabled={pending !== null}
          onClick={() => void resume()}
          type="button"
        >
          {pending === "resume" ? text.resuming : text.resume}
        </button> : null}
        {session?.status === "active" || session?.status === "paused" ? <button
          className="demo-preacherman-gamelet__stop"
          disabled={pending !== null}
          onClick={() => void stop()}
          type="button"
        >
          {pending === "stop" ? text.stopping : text.stop}
        </button> : null}
        {!session || session.status === "completed" || session.status === "stopped" || session.status === "destroyed" ? <button
          className="demo-preacherman-gamelet__start"
          disabled={catalogState !== "ready" || pending !== null}
          onClick={() => void start()}
          type="button"
        >
          {pending === "start" ? text.starting : session ? text.restart : text.start}
        </button> : null}
        {session && session.status !== "destroyed" ? <button
          className="demo-preacherman-gamelet__destroy"
          disabled={pending !== null}
          onClick={() => void destroy()}
          type="button"
        >
          {pending === "destroy" ? text.destroying : text.destroy}
        </button> : null}
      </div>
    </header>

    <div className="demo-preacherman-gamelet__status" data-status={error ? "error" : session?.status ?? catalogState} aria-live="polite" aria-busy={pending !== null}>
      <span aria-hidden="true" />
      <strong>{status}</strong>
    </div>

    <div className="demo-preacherman-gamelet__board" role="group" aria-label={text.board}>
      {Array.from({ length: 9 }, (_, cell) => {
        const mark = session?.state.board[cell] ?? null;
        return <button
          aria-label={mark ? text.markedCell(cell, mark) : text.emptyCell(cell)}
          className="demo-preacherman-gamelet__cell"
          data-mark={mark ?? "empty"}
          disabled={!session || session.status !== "active" || mark !== null || pending !== null}
          key={cell}
          onClick={() => void place(cell)}
          ref={(element) => { cells.current[cell] = element; }}
          type="button"
        >
          {mark}
        </button>;
      })}
    </div>

    {error ? <p className="demo-preacherman-gamelet__error" role="alert">
      <strong>{text.errorPrefix}:</strong> {error}
    </p> : null}
  </section>;
}
