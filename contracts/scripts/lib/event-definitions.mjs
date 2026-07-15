const text = { type: "string", minLength: 1 };
const nullableText = { type: ["string", "null"] };
const identifier = { type: "string", pattern: "^[a-zA-Z][a-zA-Z0-9_-]*$" };
const nonNegativeInteger = { type: "integer", minimum: 0 };
const positiveInteger = { type: "integer", minimum: 1 };
const ratio = { type: "number", minimum: 0, maximum: 1 };
const timestamp = { type: "string", format: "date-time" };
const url = { type: "string", format: "uri-reference" };

const errorObject = {
  type: "object",
  required: ["code", "message", "retryable"],
  properties: {
    code: { type: "string", pattern: "^[A-Z][A-Z0-9_]+$" },
    message: text,
    retryable: { type: "boolean" },
    failed_stage: nullableText,
    details: { type: "object" },
  },
  additionalProperties: false,
};

const payload = (required, properties, sample, envelope = {}) => ({
  payloadSchema: {
    type: "object",
    required,
    properties,
    additionalProperties: false,
  },
  sample,
  envelope,
});

const operationFailure = (code, message) => ({
  error: { code, message, retryable: true, failed_stage: "validate", details: {} },
});

const stageStarted = (stage, label) => payload(
  ["stage", "stage_label"],
  { stage: text, stage_label: text },
  { stage, stage_label: label },
  { stage, progress: 0.2 },
);

const stageCompleted = (stage) => payload(
  ["stage", "duration_ms"],
  { stage: text, duration_ms: nonNegativeInteger },
  { stage, duration_ms: 64120 },
  { stage, progress: 0.45 },
);

export const EVENT_DEFINITIONS = {
  "operation.queued": payload(
    [],
    { queue_position: nonNegativeInteger, estimated_start_at: timestamp },
    { queue_position: 2, estimated_start_at: "2026-07-15T10:21:35Z" },
    { operation_status: "queued", stage: "queued", progress: 0 },
  ),
  "operation.started": payload(
    [],
    { worker_region: text },
    { worker_region: "local" },
    { operation_status: "running", stage: "init", progress: 0.02 },
  ),
  "operation.stage_changed": payload(
    ["previous_stage", "stage", "stage_label"],
    { previous_stage: nullableText, stage: text, stage_label: text },
    { previous_stage: "init", stage: "research", stage_label: "Research" },
    { operation_status: "running", stage: "research", progress: 0.3 },
  ),
  "operation.progress": payload(
    [],
    { message: text, completed_units: nonNegativeInteger, total_units: positiveInteger },
    { message: "Analyzing sources", completed_units: 63, total_units: 100 },
    { operation_status: "running", stage: "research", progress: 0.63 },
  ),
  "operation.log": payload(
    ["level", "message"],
    { level: { enum: ["debug", "info", "warning", "error"] }, message: text, code: text },
    { level: "info", message: "Source analysis completed", code: "SOURCE_ANALYZED" },
    { operation_status: "running", stage: "research", progress: 0.66 },
  ),
  "artifact.created": payload(
    ["artifact_id", "artifact_type", "name"],
    { artifact_id: identifier, artifact_type: text, name: text, mime_type: text },
    { artifact_id: "artifact_01", artifact_type: "document", name: "Board Brief", mime_type: "text/markdown" },
    { operation_status: "running", stage: "output", progress: 0.94 },
  ),
  "operation.succeeded": payload(
    ["result_url"],
    { result_url: url, summary: text },
    { result_url: "/api/v1/task-runs/task_run_01/result", summary: "Operation completed" },
    { operation_status: "succeeded", stage: "completed", progress: 1 },
  ),
  "operation.failed": payload(
    ["error"],
    { error: errorObject },
    operationFailure("RUN_FAILED", "The operation could not be completed."),
    { operation_status: "failed", stage: "validate", progress: 0.72 },
  ),
  "operation.cancelled": payload(
    ["cancelled_by"],
    { cancelled_by: { enum: ["user", "system"] }, reason: text },
    { cancelled_by: "user", reason: "Cancelled from the task view" },
    { operation_status: "cancelled", stage: "research", progress: 0.41 },
  ),
  "operation.timed_out": payload(
    ["timeout_seconds", "retryable"],
    { timeout_seconds: positiveInteger, retryable: { type: "boolean" } },
    { timeout_seconds: 900, retryable: true },
    { operation_status: "timed_out", stage: "research", progress: 0.7 },
  ),

  "task.stage_started": stageStarted("research", "Research"),
  "task.stage_completed": stageCompleted("research"),
  "task.stage_skipped": payload(
    ["stage", "reason"],
    { stage: text, reason: text },
    { stage: "refine", reason: "Draft already met the quality target" },
    { stage: "refine", progress: 0.72 },
  ),
  "task.checkpoint_saved": payload(
    ["checkpoint_id", "stage"],
    { checkpoint_id: identifier, stage: text },
    { checkpoint_id: "checkpoint_01", stage: "draft" },
    { stage: "draft", progress: 0.58 },
  ),
  "task.metric_updated": payload(
    ["elapsed_ms"],
    { token_usage: nonNegativeInteger, elapsed_ms: nonNegativeInteger },
    { token_usage: 28420, elapsed_ms: 182000 },
    { stage: "research", progress: 0.62 },
  ),

  "test.stage_started": stageStarted("understand", "Understand"),
  "test.stage_completed": stageCompleted("understand"),
  "test.metric_updated": payload(
    ["metric", "value", "max_value"],
    { metric: text, value: { type: "number" }, max_value: { type: "number", exclusiveMinimum: 0 } },
    { metric: "accuracy", value: 96, max_value: 100 },
    { stage: "validate", progress: 0.82 },
  ),
  "test.takeaway_created": payload(
    ["takeaway_id", "title"],
    { takeaway_id: identifier, title: text },
    { takeaway_id: "takeaway_01", title: "Market demand is strong" },
    { stage: "synthesize", progress: 0.68 },
  ),
  "test.result_created": payload(
    ["test_result_id", "overall_score"],
    { test_result_id: identifier, overall_score: { type: "number", minimum: 0, maximum: 100 } },
    { test_result_id: "test_result_01", overall_score: 96 },
    { stage: "output", progress: 0.96 },
  ),

  "validation.test_started": payload(
    ["test_case_id", "test_set_id"],
    { test_case_id: identifier, test_set_id: identifier },
    { test_case_id: "test_case_01", test_set_id: "test_set_market" },
    { stage: "run_tests", progress: 0.16 },
  ),
  "validation.test_completed": payload(
    ["test_case_id", "result", "duration_ms"],
    { test_case_id: identifier, result: { enum: ["pass", "review", "fail"] }, duration_ms: nonNegativeInteger },
    { test_case_id: "test_case_01", result: "pass", duration_ms: 840 },
    { stage: "run_tests", progress: 0.3 },
  ),
  "validation.counters_updated": payload(
    ["tests_count", "pass_count", "review_count", "fail_count"],
    {
      tests_count: nonNegativeInteger,
      pass_count: nonNegativeInteger,
      review_count: nonNegativeInteger,
      fail_count: nonNegativeInteger,
    },
    { tests_count: 50, pass_count: 48, review_count: 2, fail_count: 0 },
    { stage: "aggregate", progress: 0.84 },
  ),
  "validation.metric_updated": payload(
    ["metric", "draft_value"],
    { metric: text, base_value: { type: "number" }, draft_value: { type: "number" }, change: { type: "number" } },
    { metric: "accuracy", base_value: 72, draft_value: 91, change: 19 },
    { stage: "aggregate", progress: 0.86 },
  ),
  "validation.review_item_created": payload(
    ["review_item_id", "category", "severity", "title"],
    {
      review_item_id: identifier,
      category: text,
      severity: { enum: ["info", "warning", "blocking"] },
      title: text,
    },
    { review_item_id: "review_item_01", category: "citation_quality", severity: "warning", title: "Add stronger references" },
    { stage: "review", progress: 0.91 },
  ),
  "validation.summary_created": payload(
    ["readiness", "blocking_count"],
    { readiness: { enum: ["ready", "needs_review", "blocked"] }, blocking_count: nonNegativeInteger },
    { readiness: "ready", blocking_count: 0 },
    { stage: "review", progress: 0.98 },
  ),

  "import.source_read": payload(
    ["source_type"],
    { source_type: { enum: ["github", "file"] }, file_count: nonNegativeInteger, branch: text },
    { source_type: "github", file_count: 12, branch: "main" },
    { stage: "reading", progress: 0.14 },
  ),
  "import.check_started": payload(
    ["check_id", "check_type"],
    { check_id: identifier, check_type: text },
    { check_id: "check_schema", check_type: "schema_structure" },
    { stage: "checking_schema", progress: 0.28 },
  ),
  "import.check_completed": payload(
    ["check_id", "result", "summary"],
    {
      check_id: identifier,
      result: { enum: ["passed", "review", "failed"] },
      summary: text,
      review_item_id: identifier,
    },
    { check_id: "check_schema", result: "passed", summary: "Schema and structure are valid" },
    { stage: "checking_schema", progress: 0.42 },
  ),
  "import.capability_detected": payload(
    ["capability_code", "name", "confidence"],
    { capability_code: identifier, name: text, confidence: ratio },
    { capability_code: "cite_sources", name: "Cite Sources", confidence: 0.96 },
    { stage: "checking_dependencies", progress: 0.62 },
  ),
  "import.readiness_updated": payload(
    ["score", "blocking_count"],
    { score: { type: "number", minimum: 0, maximum: 100 }, blocking_count: nonNegativeInteger },
    { score: 86, blocking_count: 0 },
    { stage: "checking_dependencies", progress: 0.82 },
  ),
  "import.ready": payload(
    ["convert_to_draft_url"],
    { convert_to_draft_url: url },
    { convert_to_draft_url: "/api/v1/import-jobs/import_job_01/skill-draft" },
    { operation_status: "succeeded", domain_status: "ready", stage: "ready", progress: 1 },
  ),
  "import.needs_review": payload(
    ["review_count", "review_url"],
    { review_count: positiveInteger, review_url: url },
    { review_count: 1, review_url: "/api/v1/import-jobs/import_job_01/review" },
    { operation_status: "succeeded", domain_status: "needs_review", stage: "review", progress: 1 },
  ),

  "export.render_started": payload(
    ["format"],
    { format: text },
    { format: "pdf" },
    { stage: "rendering", progress: 0.15 },
  ),
  "export.file_processed": payload(
    ["filename", "index", "total"],
    { filename: text, index: positiveInteger, total: positiveInteger },
    { filename: "board-brief.pdf", index: 1, total: 2 },
    { stage: "rendering", progress: 0.5 },
  ),
  "export.package_created": payload(
    ["filename", "size_bytes"],
    { filename: text, size_bytes: nonNegativeInteger },
    { filename: "board-brief-package.zip", size_bytes: 2457600 },
    { stage: "packaging", progress: 0.78 },
  ),
  "export.file_ready": payload(
    ["download_url", "expires_at", "checksum"],
    { download_url: url, expires_at: timestamp, checksum: text },
    { download_url: "/api/v1/artifacts/artifact_export_01/download", expires_at: "2026-07-15T11:21:32Z", checksum: "sha256:example" },
    { operation_status: "succeeded", domain_status: "completed", stage: "completed", progress: 1 },
  ),
  "export.failed": payload(
    ["error"],
    { error: errorObject },
    operationFailure("EXPORT_FAILED", "The export could not be completed."),
    { operation_status: "failed", domain_status: "failed", stage: "rendering", progress: 0.44 },
  ),

  "reply.started": payload(
    ["response_run_id", "assistant_message_id"],
    { response_run_id: identifier, assistant_message_id: identifier },
    { response_run_id: "response_run_01", assistant_message_id: "message_assistant_01" },
    { stage: "response", progress: null },
  ),
  "reply.delta": payload(
    ["assistant_message_id", "delta", "content_index"],
    { assistant_message_id: identifier, delta: text, content_index: nonNegativeInteger },
    { assistant_message_id: "message_assistant_01", delta: "The strongest opportunity is", content_index: 7 },
    { stage: "response", progress: null },
  ),
  "reply.citation_added": payload(
    ["assistant_message_id", "citation"],
    {
      assistant_message_id: identifier,
      citation: {
        type: "object",
        required: ["source_id", "title"],
        properties: { source_id: identifier, title: text, url },
        additionalProperties: false,
      },
    },
    { assistant_message_id: "message_assistant_01", citation: { source_id: "source_01", title: "Q2 Field Notes", url: "/api/v1/sources/source_01" } },
    { stage: "response", progress: null },
  ),
  "reply.tool_status": payload(
    ["tool_name", "status", "label"],
    { tool_name: text, status: { enum: ["started", "running", "completed", "failed"] }, label: text },
    { tool_name: "research", status: "running", label: "Reviewing sources" },
    { stage: "response", progress: null },
  ),
  "reply.completed": payload(
    ["assistant_message_id", "finish_reason", "usage_summary"],
    {
      assistant_message_id: identifier,
      finish_reason: { enum: ["stop", "length", "cancelled"] },
      usage_summary: {
        type: "object",
        required: ["input_tokens", "output_tokens"],
        properties: { input_tokens: nonNegativeInteger, output_tokens: nonNegativeInteger },
        additionalProperties: false,
      },
    },
    { assistant_message_id: "message_assistant_01", finish_reason: "stop", usage_summary: { input_tokens: 812, output_tokens: 286 } },
    { operation_status: "succeeded", stage: "completed", progress: 1 },
  ),
  "reply.failed": payload(
    ["assistant_message_id", "error", "retryable"],
    { assistant_message_id: identifier, error: errorObject, retryable: { type: "boolean" } },
    { assistant_message_id: "message_assistant_01", ...operationFailure("RUN_FAILED", "The response could not be completed."), retryable: true },
    { operation_status: "failed", stage: "response", progress: null },
  ),

  "monitor.snapshot": payload(
    ["health", "usage", "apis", "activity"],
    {
      health: { type: "object", required: ["status"], properties: { status: text }, additionalProperties: false },
      usage: { type: "object", required: ["token_balance", "token_limit"], properties: { token_balance: nonNegativeInteger, token_limit: positiveInteger }, additionalProperties: false },
      apis: { type: "object", required: ["active_count", "limit"], properties: { active_count: nonNegativeInteger, limit: nonNegativeInteger }, additionalProperties: false },
      activity: { type: "array", items: { type: "object" } },
    },
    { health: { status: "excellent" }, usage: { token_balance: 314580, token_limit: 500000 }, apis: { active_count: 3, limit: 5 }, activity: [] },
    { operation_status: null, domain_status: "live", stage: null, progress: null },
  ),
  "monitor.health_changed": payload(
    ["previous_status", "status", "checked_at"],
    { previous_status: text, status: text, checked_at: timestamp },
    { previous_status: "good", status: "excellent", checked_at: "2026-07-15T10:21:32Z" },
    { operation_status: null, domain_status: "live", stage: null, progress: null },
  ),
  "monitor.usage_changed": payload(
    ["token_balance", "token_limit", "window"],
    { token_balance: nonNegativeInteger, token_limit: positiveInteger, window: text },
    { token_balance: 314580, token_limit: 500000, window: "monthly" },
    { operation_status: null, domain_status: "live", stage: null, progress: null },
  ),
  "monitor.api_changed": payload(
    ["active_count", "limit", "apis"],
    { active_count: nonNegativeInteger, limit: nonNegativeInteger, apis: { type: "array", items: text } },
    { active_count: 3, limit: 5, apis: ["web_search", "read_only", "model_inference"] },
    { operation_status: null, domain_status: "live", stage: null, progress: null },
  ),
  "monitor.activity_created": payload(
    ["activity_id", "type", "summary"],
    { activity_id: identifier, type: text, summary: text },
    { activity_id: "activity_01", type: "task_completed", summary: "Board Brief completed" },
    { operation_status: null, domain_status: "live", stage: null, progress: null },
  ),
  "monitor.log": payload(
    ["level", "code", "message", "timestamp"],
    { level: { enum: ["info", "warning", "error"] }, code: text, message: text, timestamp },
    { level: "info", code: "SYSTEM_NORMAL", message: "All systems normal", timestamp: "2026-07-15T10:21:32Z" },
    { operation_status: null, domain_status: "live", stage: null, progress: null },
  ),
  "monitor.connection_state": payload(
    ["state", "checked_at"],
    { state: { enum: ["live", "reconnecting", "offline", "degraded"] }, checked_at: timestamp },
    { state: "live", checked_at: "2026-07-15T10:21:32Z" },
    { operation_status: null, domain_status: "live", stage: null, progress: null },
  ),

  "runtime.connection_changed": payload(
    ["connection_state", "checked_at"],
    { connection_state: { enum: ["live", "reconnecting", "offline"] }, checked_at: timestamp },
    { connection_state: "live", checked_at: "2026-07-15T10:21:32Z" },
    { operation_status: null, domain_status: "live", stage: null, progress: null },
  ),
  "runtime.autosave_started": payload(
    ["resource_type", "resource_id", "revision"],
    { resource_type: text, resource_id: identifier, revision: positiveInteger },
    { resource_type: "state_draft", resource_id: "state_draft_01", revision: 4 },
    { operation_status: null, domain_status: "saving", stage: "autosave", progress: null },
  ),
  "runtime.autosave_succeeded": payload(
    ["resource_type", "resource_id", "revision", "saved_at"],
    { resource_type: text, resource_id: identifier, revision: positiveInteger, saved_at: timestamp },
    { resource_type: "state_draft", resource_id: "state_draft_01", revision: 5, saved_at: "2026-07-15T10:21:32Z" },
    { operation_status: null, domain_status: "saved", stage: "autosave", progress: null },
  ),
  "runtime.autosave_failed": payload(
    ["resource_type", "resource_id", "revision", "error"],
    { resource_type: text, resource_id: identifier, revision: positiveInteger, error: errorObject },
    { resource_type: "state_draft", resource_id: "state_draft_01", revision: 5, ...operationFailure("REVISION_CONFLICT", "The draft changed before autosave completed.") },
    { operation_status: null, domain_status: "save_failed", stage: "autosave", progress: null },
  ),
  "runtime.revision_changed": payload(
    ["resource_type", "resource_id", "revision", "actor_type"],
    { resource_type: text, resource_id: identifier, revision: positiveInteger, actor_type: { enum: ["user", "system"] } },
    { resource_type: "state_draft", resource_id: "state_draft_01", revision: 6, actor_type: "user" },
    { operation_status: null, domain_status: "live", stage: null, progress: null },
  ),
};

export const TERMINAL_EVENT_TYPES = new Set([
  "operation.succeeded",
  "operation.failed",
  "operation.cancelled",
  "operation.timed_out",
  "import.ready",
  "import.needs_review",
  "export.file_ready",
  "export.failed",
  "reply.completed",
  "reply.failed",
]);
