import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { build } from "esbuild";
import test from "node:test";

const packageRoot = join(import.meta.dirname, "..");
const panelPath = join(packageRoot, "src", "preacherman", "PreachermanGameletPanel.tsx");
const stylePath = join(packageRoot, "src", "preacherman", "preacherman-gamelet-panel.css");

async function loadPanelModule() {
  const result = await build({
    bundle: true,
    entryPoints: [panelPath],
    format: "esm",
    platform: "node",
    target: "node22",
    outdir: "out",
    write: false,
  });
  const javascript = result.outputFiles.find((file) => file.path.endsWith(".js"));
  assert.ok(javascript, "panel bundle must include JavaScript");
  return import(`data:text/javascript;base64,${Buffer.from(javascript.text).toString("base64")}`);
}

test("Gamelet request helpers use the real start, action, pause, resume, stop, and destroy endpoints", async () => {
  const {
    loadPreachermanGamelets,
    createPreachermanGameletSession,
    sendPreachermanGameletAction,
    pausePreachermanGameletSession,
    resumePreachermanGameletSession,
    stopPreachermanGameletSession,
    destroyPreachermanGameletSession,
  } = await loadPanelModule();
  const calls = [];
  const active = {
    session: {
      id: "game-1",
      gameletId: "tic-tac-toe",
      status: "active",
      state: { board: Array(9).fill(null), currentPlayer: "X", moves: 0, outcome: "playing", winner: null },
    },
  };
  const completed = {
    session: {
      ...active.session,
      status: "completed",
      state: { board: ["X", "X", "X", "O", "O", null, null, null, null], currentPlayer: null, moves: 5, outcome: "won", winner: "X" },
    },
  };
  const paused = { session: { ...active.session, status: "paused" } };
  const resumed = { session: { ...active.session, status: "active" } };
  const stopped = { session: { ...active.session, status: "stopped" } };
  const destroyed = { session: { ...active.session, status: "destroyed" } };
  const serviceRequest = async (path, init) => {
    calls.push({ path, init });
    if (path === "/api/gamelets") return { gamelets: [{ id: "tic-tac-toe", title: "Tic-tac-toe", description: "Offline", version: "1.0.0" }] };
    if (path === "/api/gamelets/sessions") return active;
    if (path.endsWith("/pause")) return paused;
    if (path.endsWith("/resume")) return resumed;
    if (path.endsWith("/stop")) return stopped;
    if (init?.method === "DELETE") return destroyed;
    return completed;
  };

  assert.deepEqual((await loadPreachermanGamelets(serviceRequest)).map(({ id }) => id), ["tic-tac-toe"]);
  assert.equal((await createPreachermanGameletSession(serviceRequest)).status, "active");
  const finalSession = await sendPreachermanGameletAction(serviceRequest, "game-1", 2);
  assert.equal(finalSession.status, "completed");
  assert.equal(finalSession.state.winner, "X", "winner must come from the service response");
  assert.equal((await pausePreachermanGameletSession(serviceRequest, "game-1")).status, "paused");
  assert.equal((await resumePreachermanGameletSession(serviceRequest, "game-1")).status, "active");
  assert.equal((await stopPreachermanGameletSession(serviceRequest, "game-1")).status, "stopped");
  assert.equal((await destroyPreachermanGameletSession(serviceRequest, "game-1")).status, "destroyed");
  assert.deepEqual(calls.map(({ path }) => path), [
    "/api/gamelets",
    "/api/gamelets/sessions",
    "/api/gamelets/sessions/game-1/actions",
    "/api/gamelets/sessions/game-1/pause",
    "/api/gamelets/sessions/game-1/resume",
    "/api/gamelets/sessions/game-1/stop",
    "/api/gamelets/sessions/game-1",
  ]);
  assert.deepEqual(JSON.parse(calls[2].init.body), { action: { type: "place", cell: 2 } });
  assert.deepEqual(JSON.parse(calls[3].init.body), {});
  assert.deepEqual(JSON.parse(calls[4].init.body), {});
  assert.deepEqual(JSON.parse(calls[5].init.body), { reason: "user-requested" });
  assert.equal(calls[6].init.method, "DELETE");
});

test("panel provides bilingual server-authoritative status, keyboard buttons, and errors", async () => {
  const panel = await readFile(panelPath, "utf8");

  assert.match(panel, /PreachermanGameletPanelProps[\s\S]*locale: Locale[\s\S]*serviceRequest: PreachermanGameletServiceRequest/);
  assert.match(panel, /Preacherman Gamelet/);
  assert.match(panel, /Preacherman 游戏组件/);
  assert.match(panel, /session\.state\.outcome === "won"[\s\S]*session\.state\.winner/);
  assert.doesNotMatch(panel, /winnerFor|winningLines|\[0,\s*1,\s*2\]/);
  assert.match(panel, /aria-live="polite"/);
  assert.match(panel, /role="alert"/);
  assert.match(panel, /aria-label=\{mark \? text\.markedCell/);
  assert.match(panel, /<button[\s\S]*onClick=\{\(\) => void place\(cell\)\}/);
  assert.match(panel, /cells\.current\[firstOpenCell\]\?\.focus/);
  assert.match(panel, /stopPreachermanGameletSession[\s\S]*\/api\/gamelets\/sessions\/\$\{encodeURIComponent\(sessionId\)\}\/stop/);
  assert.match(panel, /pausePreachermanGameletSession[\s\S]*\/pause/);
  assert.match(panel, /resumePreachermanGameletSession[\s\S]*\/resume/);
  assert.match(panel, /destroyPreachermanGameletSession[\s\S]*method: "DELETE"/);
  assert.match(panel, /session\?\.status === "active"[\s\S]*onClick=\{\(\) => void stop\(\)\}/);
  assert.match(panel, /onClick=\{\(\) => void pause\(\)\}/);
  assert.match(panel, /onClick=\{\(\) => void resume\(\)\}/);
  assert.match(panel, /onClick=\{\(\) => void destroy\(\)\}/);
});

test("Gamelet panel consumes semantic tokens supplied by both appearance modes", async () => {
  const [panelStyles, themeStyles] = await Promise.all([
    readFile(stylePath, "utf8"),
    readFile(join(packageRoot, "src", "styles.css"), "utf8"),
  ]);

  for (const token of ["surface", "surface-elevated", "text", "muted", "border", "border-strong", "focus", "loading", "error"]) {
    assert.match(panelStyles, new RegExp(`var\\(--demo-theme-${token}\\)`));
    assert.match(themeStyles, new RegExp(`--demo-theme-${token}:`));
  }
  assert.match(themeStyles, /\.demo-app-shell\[data-appearance="dark"\]\s*\{[\s\S]*--demo-theme-surface:/);
  assert.match(panelStyles, /button:focus-visible[\s\S]*var\(--demo-theme-focus\)/);
  assert.doesNotMatch(panelStyles, /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i);
});
