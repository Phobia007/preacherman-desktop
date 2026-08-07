import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import ts from "typescript";

const packageRoot = join(import.meta.dirname, "..");

async function loadOrchestrator() {
  const source = await readFile(join(packageRoot, "src", "ab", "ABOrchestrator.ts"), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

function frontAgent() {
  return {
    capabilities: capabilities("front_agent"),
    createTask(input) {
      return {
        protocol_version: 1,
        task_id: input.taskId,
        conversation_id: input.conversationId,
        idempotency_key: `idem:${input.taskId}`,
        created_at: input.createdAt,
        created_by: { role: "front_agent", actor_id: "agent:a-test" },
        raw_user_input: { text: input.userInput, language: input.locale },
        objective: input.userInput,
        success_criteria: ["Complete the task"],
        constraints: [],
        allowed_actions: ["document.create_draft", "communication.send"],
        approval_policy: { mode: "risk_based", required_for: ["external_communication"] },
        prsp_contract_ref: { kind: "prsp_contract", id: "prsp:test", revision: "abi-1" },
      };
    },
    presentResult(result) {
      return `A Agent: ${result.summary}`;
    },
  };
}

function capabilities(role) {
  return {
    protocol_version: 1,
    adapter_id: `adapter:test-${role}`,
    adapter_version: "1.0.0",
    role,
    provider: "test",
    api_family: "deterministic",
    supported_protocol_versions: [1],
    input_modalities: ["text"],
    output_modalities: ["text"],
    features: {
      async_execution: true,
      cancellation: true,
      human_approval: true,
      resume: true,
      steering: false,
      streaming: true,
      tool_calling: true,
    },
    supported_actions: [],
  };
}

function result(taskId, status, summary) {
  return {
    protocol_version: 1,
    result_id: "result:test",
    task_id: taskId,
    status,
    summary,
    facts: [],
    artifacts: [],
    side_effects: [],
    unresolved_items: [],
    completed_at: "2026-08-02T09:00:00.000Z",
  };
}

function deterministicOptions(executorAgent) {
  let id = 0;
  return {
    frontAgent: frontAgent(),
    executorAgent,
    locale: "zh-CN",
    now: () => "2026-08-02T09:00:00.000Z",
    createId: (kind) => `${kind}:test-${++id}`,
  };
}

async function flush() {
  await new Promise((resolve) => setImmediate(resolve));
}

test("orchestrator runs the A to B approval path with ordered events", async () => {
  const { ABOrchestrator } = await loadOrchestrator();
  const executorAgent = {
    capabilities: capabilities("executor_agent"),
    async execute(task, context) {
      context.emitProgress(0.5, "Draft ready");
      const decision = await context.requestApproval({
        action: "communication.send",
        summary: "Send draft",
        risk_level: "medium",
      });
      assert.equal(decision, "approved");
      context.emitProgress(1, "Send completed");
      return result(task.task_id, "succeeded", "Mock execution completed.");
    },
  };
  const orchestrator = new ABOrchestrator(deterministicOptions(executorAgent));

  orchestrator.submit("请生成合同草稿并在发送前让我确认");
  const waiting = orchestrator.getSnapshot();
  assert.equal(waiting.state, "waiting_for_approval");
  assert.equal(waiting.task.raw_user_input.text, "请生成合同草稿并在发送前让我确认");
  assert.equal(waiting.pending_approval.action, "communication.send");
  assert.equal(orchestrator.approve(), true);
  await flush();

  const completed = orchestrator.getSnapshot();
  assert.equal(completed.state, "completed");
  assert.equal(completed.last_command.type, "approve");
  assert.equal(completed.conversational_result, "A Agent: Mock execution completed.");
  assert.deepEqual(
    completed.events.map((event) => event.type),
    ["accepted", "started", "progress", "approval_required", "resumed", "progress", "completed"],
  );
  assert.deepEqual(completed.events.map((event) => event.sequence), [1, 2, 3, 4, 5, 6, 7]);
});

test("rejected approval terminates without performing the guarded action", async () => {
  const { ABOrchestrator } = await loadOrchestrator();
  let guardedActionRan = false;
  const executorAgent = {
    capabilities: capabilities("executor_agent"),
    async execute(task, context) {
      const decision = await context.requestApproval({
        action: "communication.send",
        summary: "Send draft",
        risk_level: "medium",
      });
      if (decision === "approved") guardedActionRan = true;
      return result(task.task_id, "cancelled", "The external action was not approved.");
    },
  };
  const orchestrator = new ABOrchestrator(deterministicOptions(executorAgent));

  orchestrator.submit("Prepare and send a draft");
  assert.equal(orchestrator.reject(), true);
  await flush();

  const snapshot = orchestrator.getSnapshot();
  assert.equal(snapshot.state, "cancelled");
  assert.equal(snapshot.last_command.type, "reject");
  assert.equal(guardedActionRan, false);
  assert.match(snapshot.conversational_result, /not approved/);
  assert.equal(snapshot.events.at(-1).type, "cancelled");
});

test("orchestrator rejects an executor adapter without AB v1 approval capability", async () => {
  const { ABOrchestrator } = await loadOrchestrator();
  const executorAgent = {
    capabilities: {
      ...capabilities("executor_agent"),
      supported_protocol_versions: [2],
    },
    async execute() {
      throw new Error("must not run");
    },
  };

  assert.throws(
    () => new ABOrchestrator(deterministicOptions(executorAgent)),
    /AB_CAPABILITY_UNAVAILABLE/,
  );
});

test("AB console uses the existing semantic theme and is mounted beside voice", async () => {
  const [app, component, styles] = await Promise.all([
    readFile(join(packageRoot, "src", "App.tsx"), "utf8"),
    readFile(join(packageRoot, "src", "ab", "ABTaskConsole.tsx"), "utf8"),
    readFile(join(packageRoot, "src", "ab", "ab-task-console.css"), "utf8"),
  ]);

  assert.match(app, /<VoiceSessionControl locale=\{preferences\.locale\} \/>[\s\S]*<ABTaskConsole locale=\{preferences\.locale\} \/>/);
  assert.match(component, /\/api\/agent\/turn/);
  assert.match(component, /\/api\/agent\/proposals\//);
  assert.match(component, /preacherman:voice-transcript/);
  for (const token of ["text", "muted", "border", "border-strong", "focus", "loading", "error", "activate-fill"]) {
    assert.match(styles, new RegExp(`var\\(--demo-theme-${token}`));
  }
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}\b/i);
});
