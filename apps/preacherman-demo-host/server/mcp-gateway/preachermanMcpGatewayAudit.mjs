const SENSITIVE_KEY = /(?:authorization|cookie|credential|password|secret|token|api[-_]?key|objective|prompt|instruction|content|body|full[-_]?text)/i;
function redactString(value) {
  return value.slice(0, 2_000)
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[REDACTED]")
    .replace(/\b(?:eyJ[A-Za-z0-9_-]{8,})\.(?:[A-Za-z0-9_-]{8,})\.(?:[A-Za-z0-9_-]{8,})\b/g, "[REDACTED]")
    .replace(/([?&](?:access_token|api_key|key|token)=)[^&\s]+/gi, "$1[REDACTED]");
}

export function redactMcpGatewayAuditValue(value, seen = new WeakSet()) {
  if (typeof value === "string") return redactString(value);
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);
  if (Array.isArray(value)) return value.slice(0, 100).map((entry) => redactMcpGatewayAuditValue(entry, seen));
  const redacted = {};
  for (const [key, entry] of Object.entries(value).slice(0, 100)) {
    redacted[key] = SENSITIVE_KEY.test(key) ? "[REDACTED]" : redactMcpGatewayAuditValue(entry, seen);
  }
  return redacted;
}

export function createPreachermanMcpGatewayAudit({
  write,
  now = () => new Date().toISOString(),
  maxRecords = 500,
} = {}) {
  const records = [];

  async function record(event) {
    const safe = redactMcpGatewayAuditValue({
      eventId: event.eventId,
      at: event.at ?? now(),
      principalId: event.principalId,
      sessionId: event.sessionId,
      clientName: event.clientName,
      transport: event.transport,
      toolName: event.toolName,
      outcome: event.outcome,
      errorCode: event.errorCode,
      durationMs: event.durationMs,
      inputBytes: event.inputBytes,
      inputKeys: event.inputKeys,
      outputBytes: event.outputBytes,
      metadata: event.metadata,
    });
    records.unshift(safe);
    records.splice(maxRecords);
    await write?.(structuredClone(safe));
    return structuredClone(safe);
  }

  function list({ principalId, sessionId, limit = 100 } = {}) {
    const bounded = Math.max(1, Math.min(maxRecords, Number.isInteger(limit) ? limit : 100));
    return structuredClone(records.filter((entry) => (
      (!principalId || entry.principalId === principalId)
      && (!sessionId || entry.sessionId === sessionId)
    )).slice(0, bounded));
  }

  return { record, list };
}
