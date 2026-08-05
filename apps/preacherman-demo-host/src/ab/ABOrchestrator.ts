import type { Locale } from "../preferences";
import type {
  ABApprovalRequest,
  ABControlCommand,
  ABTaskEvent,
  ABTaskEventType,
  ABTaskResult,
  ABTaskSnapshot,
  ABTaskState,
  ExecutorAgentAdapter,
  FrontAgentAdapter,
} from "./contracts";

type ApprovalDecision = "approved" | "rejected" | "cancelled";
type SnapshotListener = (snapshot: ABTaskSnapshot) => void;

interface ABOrchestratorOptions {
  readonly frontAgent: FrontAgentAdapter;
  readonly executorAgent: ExecutorAgentAdapter;
  readonly locale: Locale;
  readonly now?: () => string;
  readonly createId?: (kind: string) => string;
}

const activeStates = new Set<ABTaskState>([
  "accepted",
  "running",
  "waiting_for_approval",
]);

function defaultCreateId(kind: string): string {
  return `${kind}:${crypto.randomUUID()}`;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export class ABOrchestrator {
  private readonly frontAgent: FrontAgentAdapter;
  private readonly executorAgent: ExecutorAgentAdapter;
  private readonly locale: Locale;
  private readonly now: () => string;
  private readonly createId: (kind: string) => string;
  private readonly listeners = new Set<SnapshotListener>();
  private state: ABTaskState = "idle";
  private task: ABTaskSnapshot["task"] = null;
  private events: ABTaskEvent[] = [];
  private result: ABTaskResult | null = null;
  private conversationalResult = "";
  private pendingApproval: ABApprovalRequest | null = null;
  private approvalResolver: ((decision: ApprovalDecision) => void) | null = null;
  private lastCommand: ABControlCommand | null = null;
  private error: string | null = null;
  private sequence = 0;
  private progress = 0;
  private abortController: AbortController | null = null;

  constructor(options: ABOrchestratorOptions) {
    if (
      options.frontAgent.capabilities.role !== "front_agent"
      || !options.frontAgent.capabilities.supported_protocol_versions.includes(1)
    ) {
      throw new Error("AB_CAPABILITY_UNAVAILABLE: front adapter does not support AB v1");
    }
    if (
      options.executorAgent.capabilities.role !== "executor_agent"
      || !options.executorAgent.capabilities.supported_protocol_versions.includes(1)
      || !options.executorAgent.capabilities.features.human_approval
    ) {
      throw new Error("AB_CAPABILITY_UNAVAILABLE: executor adapter does not support AB v1 approval flow");
    }
    this.frontAgent = options.frontAgent;
    this.executorAgent = options.executorAgent;
    this.locale = options.locale;
    this.now = options.now ?? (() => new Date().toISOString());
    this.createId = options.createId ?? defaultCreateId;
  }

  subscribe(listener: SnapshotListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): ABTaskSnapshot {
    return {
      state: this.state,
      task: this.task,
      events: [...this.events],
      result: this.result,
      conversational_result: this.conversationalResult,
      pending_approval: this.pendingApproval,
      last_command: this.lastCommand,
      error: this.error,
    };
  }

  submit(userInput: string): string {
    const normalizedInput = userInput.trim();
    if (!normalizedInput) throw new Error("AB_PROTOCOL_INVALID_MESSAGE: objective is empty");
    if (activeStates.has(this.state)) throw new Error("AB_TASK_STATE_CONFLICT: a task is already active");

    this.resetState();
    const taskId = this.createId("task");
    this.task = this.frontAgent.createTask({
      taskId,
      conversationId: "conversation:local-ab-demo",
      createdAt: this.now(),
      userInput: normalizedInput,
      locale: this.locale,
    });
    this.abortController = new AbortController();
    this.state = "accepted";
    this.emit("accepted", "orchestrator", { message: "Task accepted" });
    void this.run();
    return taskId;
  }

  approve(): boolean {
    if (this.state !== "waiting_for_approval" || !this.pendingApproval || !this.approvalResolver) {
      return false;
    }
    const approval = this.pendingApproval;
    const resolve = this.approvalResolver;
    this.recordCommand("approve", { approval_id: approval.approval_id });
    this.pendingApproval = null;
    this.approvalResolver = null;
    this.state = "running";
    this.emit("resumed", "orchestrator", { reason: "User approval received" });
    resolve("approved");
    return true;
  }

  reject(): boolean {
    if (this.state !== "waiting_for_approval" || !this.pendingApproval || !this.approvalResolver) {
      return false;
    }
    const approval = this.pendingApproval;
    const resolve = this.approvalResolver;
    this.recordCommand("reject", {
      approval_id: approval.approval_id,
      reason: "User rejected the action",
    });
    this.pendingApproval = null;
    this.approvalResolver = null;
    resolve("rejected");
    return true;
  }

  cancel(): boolean {
    if (!activeStates.has(this.state) || !this.task) return false;
    this.recordCommand("cancel", { reason: "User cancelled the task" });
    this.abortController?.abort();
    const resolve = this.approvalResolver;
    this.approvalResolver = null;
    this.pendingApproval = null;
    this.state = "cancelled";
    this.emit("cancelled", "orchestrator", { reason: "User cancelled the task" });
    resolve?.("cancelled");
    return true;
  }

  private resetState(): void {
    this.abortController?.abort();
    this.state = "idle";
    this.task = null;
    this.events = [];
    this.result = null;
    this.conversationalResult = "";
    this.pendingApproval = null;
    this.approvalResolver = null;
    this.lastCommand = null;
    this.error = null;
    this.sequence = 0;
    this.progress = 0;
    this.abortController = null;
  }

  private async run(): Promise<void> {
    if (!this.task || !this.abortController) return;
    const task = this.task;
    const signal = this.abortController.signal;
    this.state = "running";
    this.emit("started", "executor_agent", { message: "B Agent started" });

    try {
      const result = await this.executorAgent.execute(task, {
        signal,
        now: this.now,
        createId: this.createId,
        emitProgress: (progress, message) => this.emitProgress(progress, message),
        requestApproval: (request) => this.requestApproval(request),
      });
      if (this.isCancelled()) return;
      this.result = result;
      this.conversationalResult = this.frontAgent.presentResult(result, this.locale);
      if (result.status === "cancelled") {
        this.state = "cancelled";
        this.emit("cancelled", "executor_agent", { reason: result.summary });
      } else if (result.status === "failed") {
        this.state = "failed";
        this.error = result.summary;
        this.emit("failed", "executor_agent", {
          error: {
            protocol_version: 1,
            task_id: task.task_id,
            code: "AB_EXECUTION_FAILED",
            category: "execution",
            message: result.summary,
            retryable: false,
          },
        });
      } else {
        this.state = "completed";
        this.emit("completed", "executor_agent", {
          result_id: result.result_id,
          summary: result.summary,
        });
      }
    } catch (error) {
      if (this.state === "cancelled") return;
      if (isAbortError(error)) {
        this.state = "cancelled";
        this.emit("cancelled", "orchestrator", { reason: "Task cancelled" });
        return;
      }
      const message = error instanceof Error ? error.message : "Execution failed";
      this.state = "failed";
      this.error = message;
      this.emit("failed", "executor_agent", {
        error: {
          protocol_version: 1,
          task_id: task.task_id,
          code: "AB_EXECUTION_FAILED",
          category: "execution",
          message,
          retryable: false,
        },
      });
    }
  }

  private emitProgress(progress: number, message: string): void {
    if (this.state !== "running") throw new Error("AB_TASK_STATE_CONFLICT: task is not running");
    if (progress < this.progress || progress < 0 || progress > 1) {
      throw new Error("AB_EVENT_SEQUENCE_CONFLICT: progress must be monotonic");
    }
    this.progress = progress;
    this.emit("progress", "executor_agent", { progress, message });
  }

  private requestApproval(request: Omit<ABApprovalRequest, "approval_id">): Promise<ApprovalDecision> {
    if (this.state !== "running" || !this.task || !this.abortController) {
      return Promise.reject(new Error("AB_TASK_STATE_CONFLICT: task is not running"));
    }
    const approval: ABApprovalRequest = {
      approval_id: this.createId("approval"),
      ...request,
    };
    this.pendingApproval = approval;
    this.state = "waiting_for_approval";
    this.emit("approval_required", "executor_agent", { ...approval });
    return new Promise((resolve) => {
      this.approvalResolver = resolve;
      if (this.abortController?.signal.aborted) {
        this.approvalResolver = null;
        resolve("cancelled");
      }
    });
  }

  private recordCommand(type: ABControlCommand["type"], payload: Readonly<Record<string, unknown>>): void {
    if (!this.task) return;
    const commandId = this.createId("command");
    this.lastCommand = {
      protocol_version: 1,
      command_id: commandId,
      task_id: this.task.task_id,
      idempotency_key: `idem:${commandId}`,
      type,
      issued_at: this.now(),
      issued_by: { role: "front_agent", actor_id: "agent:a-mock" },
      payload,
    };
  }

  private isCancelled(): boolean {
    return this.state === "cancelled";
  }

  private emit(
    type: ABTaskEventType,
    role: ABTaskEvent["emitted_by"]["role"],
    payload: Readonly<Record<string, unknown>>,
  ): void {
    if (!this.task) return;
    this.sequence += 1;
    this.events.push({
      protocol_version: 1,
      event_id: this.createId("event"),
      task_id: this.task.task_id,
      sequence: this.sequence,
      type,
      occurred_at: this.now(),
      emitted_by: { role, actor_id: `agent:${role}` },
      payload,
    });
    const snapshot = this.getSnapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}
