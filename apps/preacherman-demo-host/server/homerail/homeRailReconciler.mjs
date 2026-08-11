const NON_TERMINAL = new Set(["queued", "running", "waiting_for_input", "waiting_for_approval"]);

export function createHomeRailReconciler({
  client,
  taskService,
  eventProjector,
  artifactAdapter,
  ledgerProjector,
  intervalMs = 2_000,
  maxBackoffMs = 30_000,
  maxConsecutiveFailures = 6,
  clock = () => Date.now(),
}) {
  let timer;
  let running;
  let stopped = true;
  let trailingSignal = false;
  const streams = new Map();
  const failures = new Map();
  const ledger = ledgerProjector ?? {
    projectHistory: (taskId, externalRunId, history) => eventProjector.projectHistory(taskId, externalRunId, history),
    projectArtifacts: (taskId) => artifactAdapter?.sync(taskId) ?? Promise.resolve({ gate: "ready", artifacts: [] }),
  };

  function stopStream(externalRunId) {
    const stream = streams.get(externalRunId);
    if (!stream) return;
    streams.delete(externalRunId);
    stream.controller.abort(new Error("HomeRail Attempt is no longer active."));
  }

  function signalReconcile() {
    if (stopped) return;
    trailingSignal = true;
    void reconcileAll();
  }

  function ensureStream(task) {
    const attempt = task.attempts.at(-1);
    if (typeof client.watchRunEvents !== "function" || !attempt?.externalRunId || streams.has(attempt.externalRunId)) return;
    const controller = new AbortController();
    const entry = { controller };
    streams.set(attempt.externalRunId, entry);
    entry.promise = client.watchRunEvents(attempt.externalRunId, {
      signal: controller.signal,
      // SSE is only a low-latency wake-up. The authoritative payload is always
      // fetched from the bounded history endpoint by reconcileTask.
      onSignal: signalReconcile,
    }).catch(() => undefined).finally(() => {
      if (streams.get(attempt.externalRunId) === entry) streams.delete(attempt.externalRunId);
    });
  }

  async function reconcileTask(task) {
    const attempt = task.attempts.at(-1);
    if (attempt?.provider !== "homerail" || !attempt.externalRunId) return task;
    const failure = failures.get(attempt.externalRunId);
    if (failure && clock() < failure.nextAt) return taskService.get(task.taskId);
    try {
      const [status, events] = await Promise.all([
        client.runStatus(attempt.externalRunId),
        client.runEvents(attempt.externalRunId),
      ]);
      await ledger.projectHistory(task.taskId, attempt.externalRunId, events);
      if (status.status === "completed" && (artifactAdapter || ledgerProjector)) {
        const artifacts = await ledger.projectArtifacts(task.taskId);
        if (artifacts.gate === "pending") {
          await taskService.appendEvent(task.taskId, { type: "artifacts_pending", stage: "artifacts", message: "Execution finished; required artifacts are still being prepared." }, { sourceId: `${attempt.externalRunId}:artifacts:pending` });
          return taskService.get(task.taskId);
        }
        if (artifacts.gate === "failed") {
          return taskService.transition(task.taskId, "failed", {
            error: { code: "HOMERAIL_REQUIRED_ARTIFACT_FAILED", message: "A required HomeRail artifact failed.", retryable: true },
            event: { type: "failed", stage: "terminal", message: "A required task artifact failed." },
          });
        }
      }
      const reconciled = await eventProjector.projectStatus(task.taskId, status);
      failures.delete(attempt.externalRunId);
      if (["completed", "failed", "cancelled"].includes(status.status)) stopStream(attempt.externalRunId);
      else ensureStream(reconciled);
      if (reconciled.recoveryPending) {
        return taskService.update(task.taskId, (current) => { current.recoveryPending = false; });
      }
      return reconciled;
    } catch (error) {
      const previous = failures.get(attempt.externalRunId);
      const consecutiveFailures = Math.min((previous?.consecutiveFailures ?? 0) + 1, maxConsecutiveFailures);
      const retryAfterMs = Math.min(maxBackoffMs, intervalMs * (2 ** (consecutiveFailures - 1)));
      failures.set(attempt.externalRunId, { taskId: task.taskId, consecutiveFailures, retryAfterMs, nextAt: clock() + retryAfterMs });
      await taskService.appendEvent(task.taskId, {
        type: "reconcile_deferred",
        stage: "recovery",
        message: "External execution could not be reconciled yet.",
        evidence: { provider: "homerail", externalRunId: attempt.externalRunId, errorCode: error.code ?? "HOMERAIL_RECONCILE_FAILED", consecutiveFailures, retryAfterMs },
      }, { sourceId: `${attempt.externalRunId}:reconcile:${error.code ?? "failed"}` });
      return taskService.get(task.taskId);
    }
  }

  async function reconcileAll() {
    if (running) return running;
    trailingSignal = false;
    running = (async () => {
      const tasks = await taskService.list(50);
      return Promise.all(tasks.filter((task) => task.execution?.kind === "homerail-dag" && NON_TERMINAL.has(task.status)).map(reconcileTask));
    })();
    try { return await running; } finally {
      running = null;
      if (trailingSignal && !stopped) queueMicrotask(() => { void reconcileAll(); });
    }
  }

  function start() {
    if (timer) return;
    stopped = false;
    void reconcileAll();
    timer = setInterval(() => { void reconcileAll(); }, intervalMs);
    timer.unref?.();
  }

  function stop() {
    stopped = true;
    trailingSignal = false;
    if (timer) clearInterval(timer);
    timer = undefined;
    for (const externalRunId of [...streams.keys()]) stopStream(externalRunId);
  }

  function recoveryState() {
    return [...failures.entries()].map(([externalRunId, state]) => ({ externalRunId, ...state }));
  }

  return { reconcileTask, reconcileAll, recoveryState, start, stop };
}
