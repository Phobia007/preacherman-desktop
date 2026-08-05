import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { hostname } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TERMINAL_TASK_STATES = new Set(["completed", "failed", "cancelled"]);
const MAX_BODY_BYTES = 32 * 1024;
const DEFAULT_PORT = 8787;

function json(response, status, body, origin) {
  response.writeHead(status, {
    "Access-Control-Allow-Origin": origin,
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Origin",
  });
  response.end(JSON.stringify(body));
}

function publicTask(task) {
  return {
    id: task.id,
    status: task.status,
    instruction: task.instruction,
    phase: task.phase,
    summary: task.summary,
    error: task.error,
    threadId: task.threadId,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

function readJson(request) {
  return new Promise((resolveBody, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
        reject(new Error("Request body is too large."));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolveBody(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Request body must be valid JSON."));
      }
    });
    request.on("error", reject);
  });
}

function defaultWorkspaceRoot() {
  return fileURLToPath(new URL("../../..", import.meta.url));
}

function normalizeCodexEvent(event) {
  if (event.type === "item.started" || event.type === "item.completed") {
    const item = event.item;
    if (item.type === "command_execution") {
      return {
        type: event.type === "item.started" ? "command.started" : "command.completed",
        phase: "Running project commands",
        data: {
          command: item.command,
          exitCode: item.exit_code ?? null,
          status: item.status,
        },
      };
    }
    if (item.type === "file_change") {
      return {
        type: "file.changed",
        phase: "Editing files",
        data: { changes: item.changes, status: item.status },
      };
    }
    if (item.type === "agent_message") {
      return {
        type: "message",
        phase: "Reviewing changes",
        data: { text: item.text },
      };
    }
    if (item.type === "reasoning") {
      return {
        type: "phase.changed",
        phase: "Inspecting the workspace",
        data: {},
      };
    }
    if (item.type === "error") {
      return {
        type: "task.warning",
        phase: "Checking an issue",
        data: { message: item.message },
      };
    }
  }
  return null;
}

export function createPreachermanServer(options = {}) {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const createCodex = options.createCodex ?? (async (apiKey) => {
    const { Codex } = await import("@openai/codex-sdk");
    return new Codex({ apiKey });
  });
  const workspaceRoot = resolve(
    env.PREACHERMAN_WORKSPACE_ROOT || defaultWorkspaceRoot(),
  );
  const allowedOrigins = new Set([
    "http://127.0.0.1:1420",
    "http://localhost:1420",
    "http://tauri.localhost",
    "https://tauri.localhost",
    "tauri://localhost",
  ]);
  const tasks = new Map();

  function requestOrigin(request) {
    const origin = request.headers.origin;
    if (!origin) return "http://127.0.0.1:1420";
    return allowedOrigins.has(origin) ? origin : null;
  }

  function emit(task, type, data = {}) {
    task.sequence += 1;
    task.updatedAt = new Date().toISOString();
    const event = {
      taskId: task.id,
      sequence: task.sequence,
      type,
      timestamp: task.updatedAt,
      data,
    };
    task.events.push(event);
    if (task.events.length > 100) task.events.shift();
    const payload = `id: ${event.sequence}\nevent: ${type}\ndata: ${JSON.stringify(event)}\n\n`;
    for (const subscriber of task.subscribers) subscriber.write(payload);
  }

  async function createCodexThread(task) {
    const apiKey = env.CODEX_API_KEY || env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("Set OPENAI_API_KEY or CODEX_API_KEY in .env.local.");
    }
    const codex = await createCodex(apiKey);
    const threadOptions = {
      approvalPolicy: "never",
      networkAccessEnabled: true,
      sandboxMode: "workspace-write",
      workingDirectory: workspaceRoot,
    };
    if (env.OPENAI_CODEX_MODEL) {
      threadOptions.model = env.OPENAI_CODEX_MODEL;
    }
    task.thread = codex.startThread(threadOptions);
  }

  async function runTask(task) {
    if (task.runner) return task.runner;
    task.runner = (async () => {
      try {
        if (!task.thread) await createCodexThread(task);
        while (task.instructions.length > 0 && task.status !== "cancelled") {
          const instruction = task.instructions.shift();
          task.status = "running";
          task.phase = "Inspecting the workspace";
          emit(task, "phase.changed", { phase: task.phase });
          task.abortController = new AbortController();
          const { events } = await task.thread.runStreamed(instruction, {
            signal: task.abortController.signal,
          });
          for await (const event of events) {
            if (event.type === "thread.started") task.threadId = event.thread_id;
            const normalized = normalizeCodexEvent(event);
            if (normalized) {
              task.phase = normalized.phase;
              if (normalized.type === "message") {
                task.summary = normalized.data.text;
              }
              emit(task, normalized.type, normalized.data);
            }
            if (event.type === "turn.failed") {
              throw new Error(event.error.message);
            }
          }
        }
        if (task.status !== "cancelled") {
          task.status = "completed";
          task.phase = "Completed";
          emit(task, "task.completed", {
            status: task.status,
            summary: task.summary || "The coding task completed.",
          });
        }
      } catch (error) {
        if (task.status === "cancelled" || error?.name === "AbortError") {
          task.status = "cancelled";
          task.phase = "Cancelled";
          emit(task, "task.cancelled", { status: task.status });
        } else {
          task.status = "failed";
          task.phase = "Failed";
          task.error = error instanceof Error ? error.message : String(error);
          emit(task, "task.failed", { status: task.status, error: task.error });
        }
      } finally {
        task.abortController = null;
        task.runner = null;
      }
    })();
    return task.runner;
  }

  async function mintRealtimeSecret() {
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) {
      const error = new Error("Set OPENAI_API_KEY in .env.local.");
      error.statusCode = 503;
      throw error;
    }
    const safetyIdentifier = createHash("sha256")
      .update(`${hostname()}:preacherman-local-demo`)
      .digest("hex");
    const upstream = await fetchImpl(
      "https://api.openai.com/v1/realtime/client_secrets",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "OpenAI-Safety-Identifier": safetyIdentifier,
        },
        body: JSON.stringify({
          session: {
            type: "realtime",
            model: env.OPENAI_REALTIME_MODEL || "gpt-realtime-2.1",
            audio: {
              output: { voice: env.OPENAI_REALTIME_VOICE || "marin" },
            },
          },
        }),
        signal: AbortSignal.timeout(20_000),
      },
    );
    const payload = await upstream.json();
    if (!upstream.ok) {
      const error = new Error(payload?.error?.message || "Unable to create a Realtime client secret.");
      error.statusCode = upstream.status;
      throw error;
    }
    return payload;
  }

  const server = createServer(async (request, response) => {
    const origin = requestOrigin(request);
    if (!origin) {
      json(response, 403, { error: "Origin is not allowed." }, "null");
      return;
    }
    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Origin": origin,
        Vary: "Origin",
      });
      response.end();
      return;
    }

    try {
      const url = new URL(request.url, "http://127.0.0.1");
      if (request.method === "GET" && url.pathname === "/api/health") {
        json(response, 200, {
          ok: true,
          realtimeConfigured: Boolean(env.OPENAI_API_KEY),
          codexConfigured: Boolean(env.CODEX_API_KEY || env.OPENAI_API_KEY),
          workspaceRoot,
        }, origin);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/realtime/client-secret") {
        json(response, 200, await mintRealtimeSecret(), origin);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/codex/tasks") {
        const activeTask = [...tasks.values()].find((task) => !TERMINAL_TASK_STATES.has(task.status));
        if (activeTask) {
          json(response, 409, { error: "A Codex task is already running.", task: publicTask(activeTask) }, origin);
          return;
        }
        const body = await readJson(request);
        const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
        if (!instruction || instruction.length > 8_000) {
          json(response, 400, { error: "instruction must contain 1 to 8000 characters." }, origin);
          return;
        }
        const now = new Date().toISOString();
        const task = {
          id: `task_${randomUUID()}`,
          status: "starting",
          instruction,
          instructions: [instruction],
          phase: "Starting",
          summary: "",
          error: null,
          threadId: null,
          thread: null,
          runner: null,
          abortController: null,
          sequence: 0,
          events: [],
          subscribers: new Set(),
          createdAt: now,
          updatedAt: now,
        };
        tasks.set(task.id, task);
        emit(task, "task.started", { instruction });
        void runTask(task);
        json(response, 202, { accepted: true, task: publicTask(task) }, origin);
        return;
      }

      const taskMatch = url.pathname.match(/^\/api\/codex\/tasks\/([^/]+)(?:\/(events|steer|cancel))?$/);
      if (taskMatch) {
        const task = tasks.get(decodeURIComponent(taskMatch[1]));
        if (!task) {
          json(response, 404, { error: "Task not found." }, origin);
          return;
        }
        const action = taskMatch[2];
        if (request.method === "GET" && !action) {
          json(response, 200, { task: publicTask(task) }, origin);
          return;
        }
        if (request.method === "GET" && action === "events") {
          response.writeHead(200, {
            "Access-Control-Allow-Origin": origin,
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "Content-Type": "text/event-stream; charset=utf-8",
            Vary: "Origin",
          });
          response.write(": connected\n\n");
          for (const event of task.events) {
            response.write(`id: ${event.sequence}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
          }
          if (TERMINAL_TASK_STATES.has(task.status)) {
            response.end();
          } else {
            task.subscribers.add(response);
            request.on("close", () => task.subscribers.delete(response));
          }
          return;
        }
        if (request.method === "POST" && action === "steer") {
          const body = await readJson(request);
          const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
          if (!instruction || instruction.length > 8_000) {
            json(response, 400, { error: "instruction must contain 1 to 8000 characters." }, origin);
            return;
          }
          if (task.status === "cancelled") {
            json(response, 409, { error: "A cancelled task cannot be continued." }, origin);
            return;
          }
          task.instructions.push(instruction);
          emit(task, "task.steered", { instruction });
          void runTask(task);
          json(response, 202, { accepted: true, task: publicTask(task) }, origin);
          return;
        }
        if (request.method === "POST" && action === "cancel") {
          if (!TERMINAL_TASK_STATES.has(task.status)) {
            task.status = "cancelled";
            task.abortController?.abort();
            if (!task.abortController) emit(task, "task.cancelled", { status: task.status });
          }
          json(response, 200, { task: publicTask(task) }, origin);
          return;
        }
      }
      json(response, 404, { error: "Route not found." }, origin);
    } catch (error) {
      const status = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
      json(response, status, {
        error: error instanceof Error ? error.message : "Unexpected service error.",
      }, origin);
    }
  });

  return {
    server,
    tasks,
    workspaceRoot,
    listen(port = Number(env.PREACHERMAN_SERVICE_PORT) || DEFAULT_PORT) {
      return new Promise((resolveListen, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", () => {
          server.off("error", reject);
          resolveListen(server.address());
        });
      });
    },
    close() {
      for (const task of tasks.values()) task.abortController?.abort();
      return new Promise((resolveClose, reject) => {
        server.close((error) => error ? reject(error) : resolveClose());
      });
    },
  };
}
