export function createPreachermanExecutionLedgerProjector({ taskService, eventProjector, artifactAdapter }) {
  if (!taskService || !eventProjector) throw new TypeError("Preacherman Execution Ledger Projector requires TaskService and Event Projector.");

  async function projectHistory(taskId, externalRunId, history) {
    return eventProjector.projectHistory(taskId, externalRunId, history);
  }

  async function projectArtifacts(taskId) {
    if (!artifactAdapter) return { gate: "ready", artifacts: [] };
    return artifactAdapter.sync(taskId);
  }

  async function evidence(taskId) {
    const task = await taskService.get(taskId);
    return {
      taskId: task.taskId,
      attempts: task.attempts.map((attempt) => ({
        attempt: attempt.attempt,
        provider: attempt.provider,
        status: attempt.status,
        ...(attempt.externalRunId ? { externalRunId: attempt.externalRunId } : {}),
      })),
      milestones: task.events.filter((event) => event.evidence?.provider === "preacherman-execution").map((event) => ({
        type: event.type,
        stage: event.stage,
        message: event.message,
        at: event.at,
        sourceId: event.sourceId,
        evidence: event.evidence,
      })),
      artifacts: task.artifacts.map((artifact) => ({
        artifactId: artifact.artifactId,
        name: artifact.name,
        mediaType: artifact.mediaType,
        status: artifact.status,
        sha256: artifact.sha256,
        sizeBytes: artifact.sizeBytes,
        primary: artifact.primary,
      })),
    };
  }

  return { projectHistory, projectArtifacts, evidence };
}
