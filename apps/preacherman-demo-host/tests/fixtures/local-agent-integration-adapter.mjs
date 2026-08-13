export function createFixtureLocalAgentAdapter({ now = () => new Date().toISOString() } = {}) {
  const runs = new Map();
  let next = 0;
  return {
    id: "fixture-cli",
    label: "Fixture CLI",
    kind: "local-subscription-agent",
    detect: async () => ({ installed: true, version: "1.0.0", executable: "fixture" }),
    authStatus: async () => ({ status: "ready", reason: "fixture" }),
    capabilities: () => ({ progress: true, cancel: true, resume: false, steer: false, approval: false, artifacts: true, workspaceWrite: true }),
    async start({ taskId }) {
      const runId = `fixture-run-${++next}`;
      runs.set(runId, { runId, taskId, status: "running", cursor: 1, events: [{ cursor: 1, at: now(), type: "lifecycle", status: "running" }], summary: null });
      setTimeout(() => {
        const run = runs.get(runId);
        if (!run || run.status !== "running") return;
        run.status = "succeeded";
        run.summary = "Fixture local Agent completed.";
        run.events.push({ cursor: ++run.cursor, at: now(), type: "message", phase: "completed", text: run.summary });
        run.events.push({ cursor: ++run.cursor, at: now(), type: "action", action: "file-change", files: ["safe.txt"] });
        run.events.push({ cursor: ++run.cursor, at: now(), type: "lifecycle", status: "succeeded" });
      }, 30);
      return { runId, taskId, status: "running", startedAt: now() };
    },
    async events(runId, cursor = 0) {
      const run = runs.get(runId);
      if (!run) throw new Error("Unknown fixture run.");
      return { ...run, events: run.events.filter((event) => event.cursor > cursor), nextCursor: run.cursor, completedAt: run.status === "running" ? null : now(), failure: null };
    },
    async cancel(runId) {
      const run = runs.get(runId);
      if (!run) throw new Error("Unknown fixture run.");
      if (run.status === "running") {
        run.status = "cancelled";
        run.events.push({ cursor: ++run.cursor, at: now(), type: "lifecycle", status: "cancelled" });
      }
      return { runId, status: run.status, cancelled: true };
    },
    close: async () => undefined,
  };
}
