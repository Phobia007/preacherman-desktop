import { useEffect, useState } from "react";
import { preachermanServiceRequest } from "../preacherman/capabilityClient";

export function TaskReference({ taskId, characterId }: { taskId: string; characterId: string }) {
  const [task, setTask] = useState<{ taskId: string; characterId?: string; objective: string; status: string; toolCall?: { structuredResult?: unknown }; result?: unknown; error?: unknown } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController(); setTask(null); setError("");
    void preachermanServiceRequest<{ task: NonNullable<typeof task> }>(`/api/tasks/${encodeURIComponent(taskId)}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) })
      .then(result => { if (!controller.signal.aborted) { if (result.task.characterId !== characterId) throw new Error("This task belongs to another character."); setTask(result.task); } })
      .catch(reason => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, [taskId, characterId]);
  const result = task?.result || task?.toolCall?.structuredResult || task?.error;
  return <div className="character-task-reference" aria-label="Task record">
    {error ? <p role="alert" className="character-profile__error">{error}</p> : task ? <><h3>{task.objective}</h3><p>{task.status} · {task.taskId}</p>{result ? <details><summary>View result</summary><pre>{typeof result === "string" ? result : JSON.stringify(result, null, 2)}</pre></details> : <p>The task has no result yet.</p>}</> : <p role="status">Loading task…</p>}
  </div>;
}
