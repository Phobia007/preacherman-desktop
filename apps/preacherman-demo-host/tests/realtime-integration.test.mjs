import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { createPreachermanServer } from "../server/preachermanServer.mjs";

const packageRoot = join(import.meta.dirname, "..");

async function source(path) {
  return readFile(join(packageRoot, path), "utf8");
}

async function withServer(options, callback) {
  const service = createPreachermanServer(options);
  const address = await service.listen(0);
  try {
    await callback(`http://127.0.0.1:${address.port}`, service);
  } finally {
    await service.close();
  }
}

test("live voice stays behind the activated Cortana state and keeps API keys server-side", async () => {
  const [app, client, styles, theme, ignore] = await Promise.all([
    source("src/App.tsx"),
    source("src/realtime/RealtimeVoiceClient.ts"),
    source("src/realtime/voice-session.css"),
    source("src/styles.css"),
    source(".gitignore"),
  ]);

  assert.match(app, /isCortanaActive[\s\S]*VoiceSessionControl/);
  assert.doesNotMatch(client, /OPENAI_API_KEY|CODEX_API_KEY/);
  assert.match(client, /\/api\/realtime\/client-secret/);
  assert.match(client, /start_codex_task/);
  assert.match(client, /steer_codex_task/);
  assert.match(client, /cancel_codex_task/);
  assert.match(ignore, /^\.env\.local$/m);

  for (const token of [
    "--demo-theme-text",
    "--demo-theme-muted",
    "--demo-theme-border",
    "--demo-theme-focus",
    "--demo-theme-error",
    "--demo-theme-activate-rest-bg",
    "--demo-theme-activate-fill",
  ]) {
    assert.match(styles, new RegExp(`var\\(${token}`));
    assert.match(theme, new RegExp(`${token}:`));
  }
  assert.match(theme, /\.demo-app-shell\[data-appearance="dark"\][\s\S]*--demo-theme-activate-fill:/);
});

test("local service mints Realtime secrets without exposing the standard key", async () => {
  let upstreamAuthorization = "";
  await withServer({
    env: {
      OPENAI_API_KEY: "server-only-key",
      PREACHERMAN_WORKSPACE_ROOT: packageRoot,
    },
    fetchImpl: async (_url, init) => {
      upstreamAuthorization = init.headers.Authorization;
      return new Response(JSON.stringify({ value: "ephemeral-client-secret" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/realtime/client-secret`, {
      method: "POST",
      headers: { Origin: "http://127.0.0.1:1420" },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { value: "ephemeral-client-secret" });
    assert.equal(upstreamAuthorization, "Bearer server-only-key");
  });
});

test("local service runs one streamed Codex task inside the configured workspace", async () => {
  let receivedThreadOptions;
  const fakeCodex = {
    startThread(options) {
      receivedThreadOptions = options;
      return {
        async runStreamed() {
          async function* events() {
            yield { type: "thread.started", thread_id: "thread_demo" };
            yield {
              type: "item.completed",
              item: { id: "message_1", type: "agent_message", text: "Demo task complete." },
            };
            yield {
              type: "turn.completed",
              usage: {
                input_tokens: 1,
                cached_input_tokens: 0,
                cache_write_input_tokens: 0,
                output_tokens: 1,
                reasoning_output_tokens: 0,
              },
            };
          }
          return { events: events() };
        },
      };
    },
  };

  await withServer({
    env: {
      CODEX_API_KEY: "codex-test-key",
      PREACHERMAN_WORKSPACE_ROOT: packageRoot,
    },
    createCodex: async () => fakeCodex,
  }, async (baseUrl) => {
    const started = await fetch(`${baseUrl}/api/codex/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://127.0.0.1:1420",
      },
      body: JSON.stringify({ instruction: "Make the requested demo change." }),
    });
    assert.equal(started.status, 202);
    const { task } = await started.json();

    let snapshot;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const response = await fetch(`${baseUrl}/api/codex/tasks/${task.id}`, {
        headers: { Origin: "http://127.0.0.1:1420" },
      });
      snapshot = (await response.json()).task;
      if (snapshot.status === "completed") break;
      await new Promise((resolveWait) => setTimeout(resolveWait, 5));
    }

    assert.equal(snapshot.status, "completed");
    assert.equal(snapshot.summary, "Demo task complete.");
    assert.equal(snapshot.threadId, "thread_demo");
    assert.equal(receivedThreadOptions.workingDirectory, packageRoot);
    assert.equal(receivedThreadOptions.sandboxMode, "workspace-write");
    assert.equal(receivedThreadOptions.approvalPolicy, "never");
    assert.equal(receivedThreadOptions.networkAccessEnabled, true);
  });
});
