import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

async function persist(file, state) {
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(state), { mode: 0o600 });
  await rename(temporary, file);
  if (process.platform !== "win32") await chmod(file, 0o600);
}

export function createPreachermanExecutionLinkStore({ file }) {
  let state;
  let queue = Promise.resolve();

  async function load() {
    if (state) return state;
    try {
      const parsed = JSON.parse(await readFile(file, "utf8"));
      state = { version: 1, links: Array.isArray(parsed?.links) ? parsed.links : [] };
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      state = { version: 1, links: [] };
    }
    return state;
  }

  function mutate(operation) {
    const result = queue.then(async () => {
      const current = await load();
      const value = operation(current);
      await persist(file, current);
      return structuredClone(value);
    });
    queue = result.then(() => undefined, () => undefined);
    return result;
  }

  return {
    async getByTask(taskId) {
      await queue;
      return structuredClone((await load()).links.filter((link) => link.taskId === taskId));
    },
    async getByIdempotencyKey(idempotencyKey) {
      await queue;
      return structuredClone((await load()).links.find((link) => link.idempotencyKey === idempotencyKey) ?? null);
    },
    async save(link) {
      return mutate((current) => {
        const duplicate = current.links.find((candidate) => candidate.idempotencyKey === link.idempotencyKey);
        if (duplicate) {
          if (duplicate.taskId !== link.taskId || duplicate.externalRunId !== link.externalRunId) {
            const error = new Error("Preacherman Execution idempotency key is already linked to another run.");
            error.code = "PREACHERMAN_EXECUTION_LINK_CONFLICT";
            error.statusCode = 409;
            throw error;
          }
          return duplicate;
        }
        current.links.push(structuredClone(link));
        return link;
      });
    },
  };
}
