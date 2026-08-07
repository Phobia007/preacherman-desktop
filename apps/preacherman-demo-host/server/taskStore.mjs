import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const ACTIVE_STATUSES = new Set(["queued", "running"]);

function clone(value) {
  return structuredClone(value);
}

async function writePrivateJson(target, value) {
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
  await rename(temporary, target);
  // Windows protects this file through the user's data-directory ACL. POSIX
  // platforms additionally enforce the intended owner-only mode.
  if (process.platform !== "win32") await chmod(target, 0o600);
}

export function createTaskStore({ file, now = () => new Date().toISOString() }) {
  let state;
  let mutationQueue = Promise.resolve();

  async function load() {
    if (state) return state;
    try {
      const parsed = JSON.parse(await readFile(file, "utf8"));
      state = {
        version: 1,
        tasks: Array.isArray(parsed?.tasks) ? parsed.tasks : [],
      };
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      state = { version: 1, tasks: [] };
    }

    let changed = false;
    for (const task of state.tasks) {
      if (!ACTIVE_STATUSES.has(task.status)) continue;
      task.status = "failed";
      task.retryable = true;
      task.error = "Task execution was interrupted by a service restart.";
      task.updatedAt = now();
      task.events.push({
        sequence: task.events.length + 1,
        revision: task.revision,
        type: "interrupted",
        stage: "terminal",
        message: task.error,
        at: task.updatedAt,
      });
      changed = true;
    }
    if (changed) await writePrivateJson(file, state);
    return state;
  }

  function mutate(operation) {
    const result = mutationQueue.then(async () => {
      const current = await load();
      const value = operation(current);
      await writePrivateJson(file, current);
      return clone(value);
    });
    mutationQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  return {
    async create(task) {
      return mutate((current) => {
        current.tasks.push(clone(task));
        return task;
      });
    },

    async get(taskId) {
      await mutationQueue;
      const current = await load();
      const task = current.tasks.find((candidate) => candidate.taskId === taskId);
      return task ? clone(task) : null;
    },

    async update(taskId, update) {
      return mutate((current) => {
        const task = current.tasks.find((candidate) => candidate.taskId === taskId);
        if (!task) return null;
        update(task);
        task.updatedAt = now();
        return task;
      });
    },
  };
}

export function appendTaskEvent(task, event, at = new Date().toISOString()) {
  task.events.push({
    sequence: task.events.length + 1,
    revision: task.revision,
    at,
    ...event,
  });
}
