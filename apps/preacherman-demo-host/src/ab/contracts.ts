import type { Locale } from "../preferences";

export type ABTaskState =
  | "idle"
  | "accepted"
  | "running"
  | "waiting_for_approval"
  | "completed"
  | "failed"
  | "cancelled";

export interface ABActorRef {
  readonly actor_id: string;
  readonly role: "front_agent" | "orchestrator" | "executor_agent";
}

export interface ABLogicalRef {
  readonly kind: "artifact" | "external_resource" | "prsp_contract";
  readonly id: string;
  readonly revision?: string;
}

export interface ABTaskEnvelope {
  readonly protocol_version: 1;
  readonly task_id: string;
  readonly conversation_id: string;
  readonly idempotency_key: string;
  readonly created_at: string;
  readonly created_by: ABActorRef;
  readonly raw_user_input: {
    readonly text: string;
    readonly language: Locale;
  };
  readonly objective: string;
  readonly success_criteria: readonly string[];
  readonly constraints: ReadonlyArray<{
    readonly kind: "must" | "must_not" | "preference";
    readonly statement: string;
    readonly source_quote?: string;
  }>;
  readonly allowed_actions: readonly string[];
  readonly approval_policy: {
    readonly mode: "risk_based";
    readonly required_for: readonly ["external_communication"];
  };
  readonly prsp_contract_ref: ABLogicalRef;
}

export type ABTaskEventType =
  | "accepted"
  | "approval_required"
  | "cancelled"
  | "completed"
  | "failed"
  | "progress"
  | "resumed"
  | "started";

export interface ABTaskEvent {
  readonly protocol_version: 1;
  readonly event_id: string;
  readonly task_id: string;
  readonly sequence: number;
  readonly type: ABTaskEventType;
  readonly occurred_at: string;
  readonly emitted_by: ABActorRef;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface ABTaskResult {
  readonly protocol_version: 1;
  readonly result_id: string;
  readonly task_id: string;
  readonly status: "succeeded" | "failed" | "cancelled";
  readonly summary: string;
  readonly facts: ReadonlyArray<{
    readonly statement: string;
    readonly source_refs: readonly ABLogicalRef[];
  }>;
  readonly artifacts: ReadonlyArray<{
    readonly artifact_ref: ABLogicalRef;
    readonly name: string;
    readonly media_type: string;
  }>;
  readonly side_effects: ReadonlyArray<{
    readonly action: string;
    readonly status: "attempted" | "succeeded" | "failed" | "reverted";
    readonly target_ref?: ABLogicalRef;
    readonly summary?: string;
  }>;
  readonly unresolved_items: readonly string[];
  readonly completed_at: string;
}

export interface ABApprovalRequest {
  readonly approval_id: string;
  readonly action: string;
  readonly summary: string;
  readonly risk_level: "low" | "medium" | "high";
}

export interface ABControlCommand {
  readonly protocol_version: 1;
  readonly command_id: string;
  readonly task_id: string;
  readonly idempotency_key: string;
  readonly type: "approve" | "cancel" | "reject";
  readonly issued_at: string;
  readonly issued_by: ABActorRef;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface ABTaskSnapshot {
  readonly state: ABTaskState;
  readonly task: ABTaskEnvelope | null;
  readonly events: readonly ABTaskEvent[];
  readonly result: ABTaskResult | null;
  readonly conversational_result: string;
  readonly pending_approval: ABApprovalRequest | null;
  readonly last_command: ABControlCommand | null;
  readonly error: string | null;
}

export interface ABAdapterCapabilityManifest {
  readonly protocol_version: 1;
  readonly adapter_id: string;
  readonly adapter_version: string;
  readonly role: "front_agent" | "executor_agent";
  readonly provider: string;
  readonly api_family: string;
  readonly supported_protocol_versions: readonly number[];
  readonly input_modalities: readonly ("audio" | "image" | "text" | "video")[];
  readonly output_modalities: readonly ("audio" | "image" | "text" | "video")[];
  readonly features: {
    readonly async_execution: boolean;
    readonly cancellation: boolean;
    readonly human_approval: boolean;
    readonly resume: boolean;
    readonly steering: boolean;
    readonly streaming: boolean;
    readonly tool_calling: boolean;
  };
  readonly supported_actions: readonly string[];
}

export interface FrontAgentAdapter {
  readonly capabilities: ABAdapterCapabilityManifest;
  createTask(input: {
    readonly taskId: string;
    readonly conversationId: string;
    readonly createdAt: string;
    readonly userInput: string;
    readonly locale: Locale;
  }): ABTaskEnvelope;
  presentResult(result: ABTaskResult, locale: Locale): string;
}

export interface ActionOutcome {
  readonly summary: string;
  readonly artifact_ref?: ABLogicalRef;
  readonly target_ref?: ABLogicalRef;
}

export interface ActionAdapter {
  invoke(
    action: string,
    input: Readonly<Record<string, unknown>>,
    signal: AbortSignal,
  ): Promise<ActionOutcome>;
}

export interface ExecutorContext {
  readonly signal: AbortSignal;
  readonly now: () => string;
  readonly createId: (kind: string) => string;
  emitProgress(progress: number, message: string): void;
  requestApproval(request: Omit<ABApprovalRequest, "approval_id">): Promise<"approved" | "rejected" | "cancelled">;
}

export interface ExecutorAgentAdapter {
  readonly capabilities: ABAdapterCapabilityManifest;
  execute(task: ABTaskEnvelope, context: ExecutorContext): Promise<ABTaskResult>;
}
