import { useEffect, useRef, useState } from "react";
import type { Locale } from "../preferences";
import "./airi-gamelet-panel.css";

export type AiriGameletServiceRequest = <T>(path: string, init?: RequestInit) => Promise<T>;

export interface AiriGameletDefinition {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly version: string;
}

export interface AiriGameletSession {
  readonly id: string;
  readonly gameletId: string;
  readonly status: "active" | "completed" | "stopped";
  readonly state: {
    readonly board: readonly ("X" | "O" | null)[];
    readonly currentPlayer: "X" | "O" | null;
    readonly moves: number;
    readonly outcome: "playing" | "won" | "draw";
    readonly winner: "X" | "O" | null;
  };
}

export interface AiriGameletPanelProps {
  readonly locale: Locale;
  readonly serviceRequest: AiriGameletServiceRequest;
}

const GAMELET_ID = "tic-tac-toe";

const copy = {
  en: {
    eyebrow: "AIRI Gamelet",
    title: "Tic-tac-toe",
    description: "A local, server-authoritative game session. Take turns as X and O.",
    loading: "Loading Gamelets…",
    unavailable: "Tic-tac-toe is not available from the local service.",
    ready: "Ready for a new game",
    start: "Start game",
    restart: "Play again",
    starting: "Starting…",
    moving: "Sending move…",
    turn: (player: string) => `${player}'s turn`,
    won: (player: string) => `${player} wins`,
    draw: "Draw game",
    stopped: "Game stopped",
    board: "Tic-tac-toe board",
    emptyCell: (cell: number) => `Empty cell ${cell + 1}`,
    markedCell: (cell: number, mark: string) => `Cell ${cell + 1}, ${mark}`,
    errorPrefix: "Gamelet error",
  },
  "zh-CN": {
    eyebrow: "AIRI 游戏组件",
    title: "井字棋",
    description: "由本地服务端裁定的真实棋局。X 与 O 轮流落子。",
    loading: "正在加载游戏组件…",
    unavailable: "本地服务暂未提供井字棋。",
    ready: "可以开始新棋局",
    start: "开始游戏",
    restart: "再来一局",
    starting: "正在开始…",
    moving: "正在提交落子…",
    turn: (player: string) => `轮到 ${player} 落子`,
    won: (player: string) => `${player} 获胜`,
    draw: "本局平局",
    stopped: "棋局已停止",
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

function parseGamelets(value: unknown): readonly AiriGameletDefinition[] {
  const payload = asObject(value, "Gamelet catalog");
  if (!Array.isArray(payload.gamelets)) throw new Error("Gamelet catalog is missing gamelets.");
  return payload.gamelets.map((candidate) => {
    const gamelet = asObject(candidate, "Gamelet");
    if ([gamelet.id, gamelet.title, gamelet.description, gamelet.version].some((field) => typeof field !== "string")) {
      throw new Error("Gamelet catalog contains an invalid definition.");
    }
    return gamelet as unknown as AiriGameletDefinition;
  });
}

function parseSession(value: unknown): AiriGameletSession {
  const payload = asObject(value, "Gamelet session");
  const session = asObject(payload.session, "Gamelet session");
  const state = asObject(session.state, "Gamelet state");
  if (typeof session.id !== "string" || session.gameletId !== GAMELET_ID) throw new Error("Gamelet session identity is invalid.");
  if (!(["active", "completed", "stopped"] as const).includes(session.status as AiriGameletSession["status"])) {
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
  return session as unknown as AiriGameletSession;
}

export async function loadAiriGamelets(serviceRequest: AiriGameletServiceRequest) {
  return parseGamelets(await serviceRequest<unknown>("/api/gamelets"));
}

export async function createAiriGameletSession(serviceRequest: AiriGameletServiceRequest) {
  return parseSession(await serviceRequest<unknown>("/api/gamelets/sessions", {
    method: "POST",
    body: JSON.stringify({ gameletId: GAMELET_ID }),
  }));
}

export async function sendAiriGameletAction(
  serviceRequest: AiriGameletServiceRequest,
  sessionId: string,
  cell: number,
) {
  return parseSession(await serviceRequest<unknown>(
    `/api/gamelets/sessions/${encodeURIComponent(sessionId)}/actions`,
    { method: "POST", body: JSON.stringify({ action: { type: "place", cell } }) },
  ));
}

function statusText(session: AiriGameletSession | null, locale: Locale) {
  const text = copy[locale];
  if (!session) return text.ready;
  if (session.status === "stopped") return text.stopped;
  if (session.status === "completed") {
    if (session.state.outcome === "won" && session.state.winner) return text.won(session.state.winner);
    if (session.state.outcome === "draw") return text.draw;
  }
  return session.state.currentPlayer ? text.turn(session.state.currentPlayer) : text.stopped;
}

export function AiriGameletPanel({ locale, serviceRequest }: AiriGameletPanelProps) {
  const text = copy[locale];
  const [catalogState, setCatalogState] = useState<"loading" | "ready" | "unavailable">("loading");
  const [session, setSession] = useState<AiriGameletSession | null>(null);
  const [pending, setPending] = useState<"start" | "move" | null>(null);
  const [error, setError] = useState("");
  const cells = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    let active = true;
    void loadAiriGamelets(serviceRequest).then((gamelets) => {
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
      setSession(await createAiriGameletSession(serviceRequest));
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
      setSession(await sendAiriGameletAction(serviceRequest, session.id, cell));
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
          : statusText(session, locale);

  return <section className="demo-airi-gamelet" data-airi-control="plugin.gamelets" aria-labelledby="airi-gamelet-title">
    <header className="demo-airi-gamelet__header">
      <div>
        <span className="demo-airi-gamelet__eyebrow">{text.eyebrow}</span>
        <h2 id="airi-gamelet-title">{text.title}</h2>
        <p>{text.description}</p>
      </div>
      <button
        className="demo-airi-gamelet__start"
        disabled={catalogState !== "ready" || pending !== null}
        onClick={() => void start()}
        type="button"
      >
        {pending === "start" ? text.starting : session ? text.restart : text.start}
      </button>
    </header>

    <div className="demo-airi-gamelet__status" data-status={error ? "error" : session?.status ?? catalogState} aria-live="polite" aria-busy={pending !== null}>
      <span aria-hidden="true" />
      <strong>{status}</strong>
    </div>

    <div className="demo-airi-gamelet__board" role="group" aria-label={text.board}>
      {Array.from({ length: 9 }, (_, cell) => {
        const mark = session?.state.board[cell] ?? null;
        return <button
          aria-label={mark ? text.markedCell(cell, mark) : text.emptyCell(cell)}
          className="demo-airi-gamelet__cell"
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

    {error ? <p className="demo-airi-gamelet__error" role="alert">
      <strong>{text.errorPrefix}:</strong> {error}
    </p> : null}
  </section>;
}
