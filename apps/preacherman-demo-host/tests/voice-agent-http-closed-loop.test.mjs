import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";
import { createPreachermanServer } from "../server/preachermanServer.mjs";

const packageRoot = join(import.meta.dirname, "..");
const origin = "http://127.0.0.1:1420";

async function loadCoordinator(t) {
  const source = await readFile(join(packageRoot, "src", "live", "LiveCoordinator.ts"), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const temporaryDirectory = await mkdtemp(join(packageRoot, ".tmp-voice-http-"));
  const modulePath = join(temporaryDirectory, "LiveCoordinator.mjs");
  await writeFile(modulePath, output, "utf8");
  t.after(() => rm(temporaryDirectory, { recursive: true, force: true }));
  return import(`${pathToFileURL(modulePath).href}?${Date.now()}`);
}

async function request(baseUrl, path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { Origin: origin, "Content-Type": "application/json", ...init.headers },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return { response, body };
}

test("a microphone-free final transcript completes the real HTTP plugin TaskRun flow before requesting TTS", async (t) => {
  const dataDirectory = await mkdtemp(join(tmpdir(), "preacherman-voice-http-"));
  const service = createPreachermanServer({ env: { PREACHERMAN_DATA_DIR: dataDirectory } });
  const address = await service.listen(0);
  const port = typeof address === "object" && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;
  t.after(async () => {
    await service.close();
    await rm(dataDirectory, { recursive: true, force: true });
  });

  const { LiveCoordinator } = await loadCoordinator(t);
  const coordinator = new LiveCoordinator();
  const ttsRequests = [];
  coordinator.connectPresentationAdapter({
    speak: async (speechRequest) => { ttsRequests.push(speechRequest); },
    stopSpeech: () => undefined,
  });

  const flow = new Promise((resolve, reject) => {
    coordinator.onFinalTranscript((transcript) => {
      void (async () => {
        const turn = await request(baseUrl, "/api/agent/turn", {
          method: "POST",
          body: JSON.stringify({ input: transcript, locale: "en", history: [] }),
        });
        assert.equal(turn.body.proposal.kind, "plugin-tool");
        assert.equal(turn.body.proposal.allowedTools[0], "preacherman-runtime::task_summary");

        const approved = await request(baseUrl, `/api/agent/proposals/${turn.body.proposal.proposalId}/confirm`, {
          method: "POST",
          body: JSON.stringify({ objective: turn.body.proposal.objective }),
        });
        assert.equal(approved.response.status, 202);

        const persisted = await request(baseUrl, `/api/tasks/${approved.body.run.taskId}`);
        assert.equal(persisted.body.task.status, "succeeded");
        assert.equal(persisted.body.task.toolCall.name, "task_summary");
        assert.equal((await request(baseUrl, `/api/tasks/${approved.body.run.taskId}/artifact`)).response.status, 200);

        const summary = `Plugin tool ${persisted.body.task.toolCall.name} completed.`;
        assert.equal(coordinator.requestSpeech(summary, "en", persisted.body.task.taskId), true);
        resolve({ proposal: turn.body.proposal, task: persisted.body.task, summary });
      })().catch(reject);
    });
  });

  const transcriptEpoch = coordinator.getConversationEpoch();
  assert.equal(coordinator.deliverFinalTranscript("Run the AIRI plugin status summary", transcriptEpoch), true);
  const result = await flow;
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(result.proposal.kind, "plugin-tool");
  assert.equal(ttsRequests.length, 1);
  assert.equal(ttsRequests[0].taskId, result.task.taskId);
  assert.equal(ttsRequests[0].text, result.summary);
  assert.equal(ttsRequests[0].interactionEpoch > transcriptEpoch, true);
});
