import type { Locale } from "../preferences";
import type {
  ABTaskEnvelope,
  ABTaskResult,
  ActionAdapter,
  ActionOutcome,
  ExecutorAgentAdapter,
  ExecutorContext,
  FrontAgentAdapter,
} from "./contracts";

function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Task cancelled", "AbortError"));
      return;
    }
    const timeout = window.setTimeout(resolve, milliseconds);
    signal.addEventListener("abort", () => {
      window.clearTimeout(timeout);
      reject(new DOMException("Task cancelled", "AbortError"));
    }, { once: true });
  });
}

export class MockFrontAgentAdapter implements FrontAgentAdapter {
  readonly capabilities = {
    protocol_version: 1,
    adapter_id: "adapter:mock-front-agent",
    adapter_version: "1.0.0",
    role: "front_agent",
    provider: "local-mock",
    api_family: "deterministic",
    supported_protocol_versions: [1],
    input_modalities: ["text"],
    output_modalities: ["text"],
    features: {
      async_execution: false,
      cancellation: true,
      human_approval: true,
      resume: true,
      steering: false,
      streaming: false,
      tool_calling: false,
    },
    supported_actions: [],
  } as const;

  createTask(input: {
    readonly taskId: string;
    readonly conversationId: string;
    readonly createdAt: string;
    readonly userInput: string;
    readonly locale: Locale;
  }): ABTaskEnvelope {
    const approvalText = input.locale === "zh-CN"
      ? "任何外部发送动作都必须先获得用户批准"
      : "Any external send action requires user approval";

    return {
      protocol_version: 1,
      task_id: input.taskId,
      conversation_id: input.conversationId,
      idempotency_key: `idem:${input.taskId}`,
      created_at: input.createdAt,
      created_by: { role: "front_agent", actor_id: "agent:a-mock" },
      raw_user_input: { text: input.userInput, language: input.locale },
      objective: input.userInput,
      success_criteria: [
        input.locale === "zh-CN" ? "生成可供审阅的草稿" : "Create a reviewable draft",
        approvalText,
      ],
      constraints: [{
        kind: "must",
        statement: approvalText,
      }],
      allowed_actions: ["document.create_draft", "communication.send"],
      approval_policy: {
        mode: "risk_based",
        required_for: ["external_communication"],
      },
      prsp_contract_ref: {
        kind: "prsp_contract",
        id: "prsp:state-v1",
        revision: "abi-1",
      },
    };
  }

  presentResult(result: ABTaskResult, locale: Locale): string {
    if (result.status === "cancelled") {
      return locale === "zh-CN" ? "任务已取消，没有执行外部发送。" : "The task was cancelled. Nothing was sent.";
    }
    if (result.status === "failed") {
      return locale === "zh-CN" ? `执行失败：${result.summary}` : `Execution failed: ${result.summary}`;
    }
    return locale === "zh-CN"
      ? `已经处理完成。${result.summary}`
      : `Done. ${result.summary}`;
  }
}

export class MockActionAdapter implements ActionAdapter {
  constructor(private readonly latencyMs = 320) {}

  async invoke(
    action: string,
    _input: Readonly<Record<string, unknown>>,
    signal: AbortSignal,
  ): Promise<ActionOutcome> {
    await wait(this.latencyMs, signal);
    if (action === "document.create_draft") {
      return {
        summary: "A reviewable contract draft was created in memory.",
        artifact_ref: { kind: "artifact", id: "artifact:mock-contract-draft" },
      };
    }
    if (action === "communication.send") {
      return {
        summary: "The approved send action was simulated; no external message was sent.",
        target_ref: { kind: "external_resource", id: "recipient:mock" },
      };
    }
    throw new Error(`AB_ACTION_NOT_ALLOWED: ${action}`);
  }
}

export class MockExecutorAgentAdapter implements ExecutorAgentAdapter {
  readonly capabilities = {
    protocol_version: 1,
    adapter_id: "adapter:mock-executor-agent",
    adapter_version: "1.0.0",
    role: "executor_agent",
    provider: "local-mock",
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
    supported_actions: ["document.create_draft", "communication.send"],
  } as const;

  constructor(private readonly actions: ActionAdapter) {}

  async execute(task: ABTaskEnvelope, context: ExecutorContext): Promise<ABTaskResult> {
    const draftAction = "document.create_draft";
    const sendAction = "communication.send";
    const isChinese = task.raw_user_input.language === "zh-CN";
    for (const action of [draftAction, sendAction]) {
      if (!task.allowed_actions.includes(action)) {
        throw new Error(`AB_ACTION_NOT_ALLOWED: ${action}`);
      }
    }

    context.emitProgress(0.2, isChinese ? "B Agent 正在准备草稿" : "B Agent is preparing the draft");
    const draft = await this.actions.invoke(draftAction, { objective: task.objective }, context.signal);
    context.emitProgress(
      0.55,
      isChinese ? "草稿已生成；发送前需要批准" : "Draft created; approval is required before sending",
    );

    const approval = await context.requestApproval({
      action: sendAction,
      summary: isChinese ? "模拟发送已经准备好的合同草稿" : "Simulate sending the prepared contract draft",
      risk_level: "medium",
    });
    if (approval !== "approved") {
      return {
        protocol_version: 1,
        result_id: context.createId("result"),
        task_id: task.task_id,
        status: "cancelled",
        summary: "The external action was not approved.",
        facts: [],
        artifacts: draft.artifact_ref ? [{
          artifact_ref: draft.artifact_ref,
          name: "mock-contract-draft.md",
          media_type: "text/markdown",
        }] : [],
        side_effects: [],
        unresolved_items: ["External send was not performed"],
        completed_at: context.now(),
      };
    }

    const sent = await this.actions.invoke(sendAction, { artifact_ref: draft.artifact_ref }, context.signal);
    context.emitProgress(1, isChinese ? "已批准的动作执行完成" : "Approved action completed");
    return {
      protocol_version: 1,
      result_id: context.createId("result"),
      task_id: task.task_id,
      status: "succeeded",
      summary: isChinese
        ? "合同草稿已生成；发送步骤仅在 Mock 动作库中完成，没有产生真实外部操作。"
        : "The contract draft was created. The send step ran only in the mock action library, with no real external action.",
      facts: [{
        statement: draft.summary,
        source_refs: draft.artifact_ref ? [draft.artifact_ref] : [],
      }],
      artifacts: draft.artifact_ref ? [{
        artifact_ref: draft.artifact_ref,
        name: "mock-contract-draft.md",
        media_type: "text/markdown",
      }] : [],
      side_effects: [{
        action: sendAction,
        status: "succeeded",
        target_ref: sent.target_ref,
        summary: sent.summary,
      }],
      unresolved_items: [],
      completed_at: context.now(),
    };
  }
}
