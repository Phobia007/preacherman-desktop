const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const PLUGIN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;

export const AIRI_COMPUTER_VISION_CATALOG = Object.freeze([
  {
    id: "screenshot",
    name: "Screenshot",
    description: "Capture a display through an installed desktop adapter.",
    inputKind: "capture-request",
    resultKind: "image",
  },
  {
    id: "camera-window",
    name: "Camera / Window",
    description: "Capture a selected camera or application window through an installed adapter.",
    inputKind: "source-capture-request",
    resultKind: "image",
  },
  {
    id: "cursor-monitor",
    name: "Cursor Monitor",
    description: "Observe bounded cursor samples through an installed desktop adapter.",
    inputKind: "cursor-monitor-request",
    resultKind: "cursor-events",
  },
  {
    id: "vision-analysis",
    name: "Vision Analysis",
    description: "Analyze a supplied image through an installed vision adapter.",
    inputKind: "image-analysis-request",
    resultKind: "vision-analysis",
  },
]);

function runtimeError(code, message, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function expectObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw runtimeError("INVALID_COMPUTER_VISION_INPUT", `${label} must be an object.`);
  }
  return value;
}

function assertKeys(value, allowed, label) {
  const unexpected = Object.keys(value).find((key) => !allowed.includes(key));
  if (unexpected) throw runtimeError("INVALID_COMPUTER_VISION_INPUT", `${label} contains an unsupported field.`);
}

function optionalString(value, label, maximum = 256) {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0 || value.length > maximum) {
    throw runtimeError("INVALID_COMPUTER_VISION_INPUT", `${label} must be a non-empty string of at most ${maximum} characters.`);
  }
  return value;
}

function requiredString(value, label, maximum = 256) {
  const result = optionalString(value, label, maximum);
  if (result === undefined) throw runtimeError("INVALID_COMPUTER_VISION_INPUT", `${label} is required.`);
  return result;
}

function optionalInteger(value, label, minimum, maximum) {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw runtimeError("INVALID_COMPUTER_VISION_INPUT", `${label} must be an integer between ${minimum} and ${maximum}.`);
  }
  return value;
}

function jsonSize(value, label) {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    throw runtimeError("INVALID_COMPUTER_VISION_INPUT", `${label} must be JSON-serializable.`);
  }
}

function decodedBase64Size(value, maximum, label) {
  if (typeof value !== "string" || value.length === 0 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw runtimeError("INVALID_COMPUTER_VISION_INPUT", `${label} must be padded Base64 data.`);
  }
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  const size = (value.length / 4) * 3 - padding;
  if (size > maximum) {
    throw runtimeError("COMPUTER_VISION_INPUT_TOO_LARGE", `${label} exceeds the ${maximum}-byte decoded limit.`, 413);
  }
  return size;
}

function normalizeCaptureInput(input, withSource) {
  const value = expectObject(input, "Capture input");
  const allowed = ["displayId", "format", "maxWidth", "maxHeight"];
  if (withSource) allowed.push("source", "sourceId");
  assertKeys(value, allowed, "Capture input");
  const result = {};
  if (withSource) {
    if (value.source !== "camera" && value.source !== "window") {
      throw runtimeError("INVALID_COMPUTER_VISION_INPUT", "camera-window source must be camera or window.");
    }
    result.source = value.source;
    const sourceId = optionalString(value.sourceId, "sourceId");
    if (sourceId !== undefined) result.sourceId = sourceId;
  } else {
    const displayId = optionalString(value.displayId, "displayId");
    if (displayId !== undefined) result.displayId = displayId;
  }
  if (value.format !== undefined && !["png", "jpeg", "webp"].includes(value.format)) {
    throw runtimeError("INVALID_COMPUTER_VISION_INPUT", "Capture format must be png, jpeg, or webp.");
  }
  if (value.format !== undefined) result.format = value.format;
  const maxWidth = optionalInteger(value.maxWidth, "maxWidth", 1, 16_384);
  const maxHeight = optionalInteger(value.maxHeight, "maxHeight", 1, 16_384);
  if (maxWidth !== undefined) result.maxWidth = maxWidth;
  if (maxHeight !== undefined) result.maxHeight = maxHeight;
  return result;
}

function normalizeCursorInput(input) {
  const value = expectObject(input, "Cursor monitor input");
  assertKeys(value, ["durationMs", "sampleIntervalMs"], "Cursor monitor input");
  const result = {};
  const durationMs = optionalInteger(value.durationMs, "durationMs", 100, 30_000);
  const sampleIntervalMs = optionalInteger(value.sampleIntervalMs, "sampleIntervalMs", 16, 1_000);
  if (durationMs !== undefined) result.durationMs = durationMs;
  if (sampleIntervalMs !== undefined) result.sampleIntervalMs = sampleIntervalMs;
  return result;
}

function normalizeVisionInput(input, maxImageBytes) {
  const value = expectObject(input, "Vision analysis input");
  assertKeys(value, ["image", "prompt"], "Vision analysis input");
  const image = expectObject(value.image, "Vision image");
  assertKeys(image, ["mimeType", "data"], "Vision image");
  if (!IMAGE_MIME_TYPES.has(image.mimeType)) {
    throw runtimeError("INVALID_COMPUTER_VISION_INPUT", "Vision image MIME type must be image/png, image/jpeg, or image/webp.");
  }
  decodedBase64Size(image.data, maxImageBytes, "Vision image");
  const result = { image: { mimeType: image.mimeType, data: image.data } };
  const prompt = optionalString(value.prompt, "Vision prompt", 4_000);
  if (prompt !== undefined) result.prompt = prompt;
  return result;
}

function normalizeInput(capability, input, { maxImageBytes, maxInputBytes }) {
  if (jsonSize(input, "Computer/Vision input") > maxInputBytes) {
    throw runtimeError("COMPUTER_VISION_INPUT_TOO_LARGE", `Computer/Vision input exceeds the ${maxInputBytes}-byte limit.`, 413);
  }
  if (capability === "screenshot") return normalizeCaptureInput(input, false);
  if (capability === "camera-window") return normalizeCaptureInput(input, true);
  if (capability === "cursor-monitor") return normalizeCursorInput(input);
  return normalizeVisionInput(input, maxImageBytes);
}

function normalizeImageResult(value, maxImageBytes) {
  const result = expectObject(value, "Image result");
  assertKeys(result, ["image", "capturedAt"], "Image result");
  const image = expectObject(result.image, "Image result payload");
  assertKeys(image, ["mimeType", "data", "width", "height"], "Image result payload");
  if (!IMAGE_MIME_TYPES.has(image.mimeType)) throw runtimeError("INVALID_ADAPTER_RESULT", "Adapter returned an invalid image MIME type.", 502);
  decodedBase64Size(image.data, maxImageBytes, "Adapter image");
  if (!Number.isInteger(image.width) || image.width < 1 || image.width > 16_384
    || !Number.isInteger(image.height) || image.height < 1 || image.height > 16_384) {
    throw runtimeError("INVALID_ADAPTER_RESULT", "Adapter returned invalid image dimensions.", 502);
  }
  const normalized = { image: { mimeType: image.mimeType, data: image.data, width: image.width, height: image.height } };
  if (result.capturedAt !== undefined) normalized.capturedAt = optionalString(result.capturedAt, "capturedAt", 100);
  return normalized;
}

function normalizeCursorResult(value) {
  const result = expectObject(value, "Cursor result");
  assertKeys(result, ["events", "durationMs"], "Cursor result");
  if (!Array.isArray(result.events) || result.events.length > 10_000) {
    throw runtimeError("INVALID_ADAPTER_RESULT", "Adapter cursor result must contain at most 10000 events.", 502);
  }
  const events = result.events.map((event) => {
    expectObject(event, "Cursor event");
    assertKeys(event, ["x", "y", "at"], "Cursor event");
    if (!Number.isFinite(event.x) || !Number.isFinite(event.y) || Math.abs(event.x) > 1_000_000 || Math.abs(event.y) > 1_000_000) {
      throw runtimeError("INVALID_ADAPTER_RESULT", "Adapter returned invalid cursor coordinates.", 502);
    }
    return { x: event.x, y: event.y, at: requiredString(event.at, "Cursor event time", 100) };
  });
  if (!Number.isInteger(result.durationMs) || result.durationMs < 0 || result.durationMs > 30_000) {
    throw runtimeError("INVALID_ADAPTER_RESULT", "Adapter returned an invalid cursor duration.", 502);
  }
  return { events, durationMs: result.durationMs };
}

function normalizeVisionResult(value) {
  const result = expectObject(value, "Vision result");
  assertKeys(result, ["summary", "detections"], "Vision result");
  const summary = requiredString(result.summary, "Vision summary", 10_000);
  const detections = result.detections ?? [];
  if (!Array.isArray(detections) || detections.length > 1_000) {
    throw runtimeError("INVALID_ADAPTER_RESULT", "Adapter vision result must contain at most 1000 detections.", 502);
  }
  return {
    summary,
    detections: detections.map((detection) => {
      expectObject(detection, "Vision detection");
      assertKeys(detection, ["label", "confidence"], "Vision detection");
      const label = requiredString(detection.label, "Detection label", 256);
      if (!Number.isFinite(detection.confidence) || detection.confidence < 0 || detection.confidence > 1) {
        throw runtimeError("INVALID_ADAPTER_RESULT", "Adapter returned an invalid detection confidence.", 502);
      }
      return { label, confidence: detection.confidence };
    }),
  };
}

function normalizeResult(capability, result, limits) {
  try {
    const normalized = capability === "screenshot" || capability === "camera-window"
      ? normalizeImageResult(result, limits.maxImageBytes)
      : capability === "cursor-monitor" ? normalizeCursorResult(result) : normalizeVisionResult(result);
    if (jsonSize(normalized, "Computer/Vision result") > limits.maxResultBytes) {
      throw runtimeError("COMPUTER_VISION_RESULT_TOO_LARGE", `Computer/Vision result exceeds the ${limits.maxResultBytes}-byte limit.`, 502);
    }
    return normalized;
  } catch (error) {
    if (error?.code === "COMPUTER_VISION_RESULT_TOO_LARGE") throw error;
    throw runtimeError("INVALID_ADAPTER_RESULT", "Computer/Vision adapter returned an invalid result.", 502);
  }
}

function validateAdapter(adapter) {
  if (!adapter || typeof adapter !== "object" || Array.isArray(adapter)
    || typeof adapter.test !== "function" || typeof adapter.invoke !== "function") {
    throw runtimeError("INVALID_COMPUTER_VISION_ADAPTER", "Computer/Vision adapter requires test() and invoke().");
  }
  if (adapter.dispose !== undefined && typeof adapter.dispose !== "function") {
    throw runtimeError("INVALID_COMPUTER_VISION_ADAPTER", "Computer/Vision adapter dispose must be a function.");
  }
  return adapter;
}

export function createAiriComputerVisionRuntime({
  timeoutMs = 10_000,
  maxImageBytes = 8 * 1024 * 1024,
  maxInputBytes = 12 * 1024 * 1024,
  maxResultBytes = 12 * 1024 * 1024,
  now = () => new Date().toISOString(),
} = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 120_000) {
    throw new TypeError("Computer/Vision timeout must be an integer between 10 and 120000 milliseconds.");
  }
  for (const [name, value] of Object.entries({ maxImageBytes, maxInputBytes, maxResultBytes })) {
    if (!Number.isInteger(value) || value < 1) throw new TypeError(`${name} must be a positive integer.`);
  }

  const limits = { maxImageBytes, maxInputBytes, maxResultBytes };
  const records = new Map(AIRI_COMPUTER_VISION_CATALOG.map((capability) => [capability.id, {
    capability: structuredClone(capability),
    registration: null,
    phase: "external-runtime-required",
    lastTest: null,
    lastInvocation: null,
    lastError: null,
    updatedAt: now(),
    pending: Promise.resolve(),
  }]));
  let closed = false;

  function requireOpen() {
    if (closed) throw runtimeError("COMPUTER_VISION_RUNTIME_CLOSED", "Computer/Vision runtime is closed.", 409);
  }

  function getRecord(id) {
    const record = records.get(id);
    if (!record) throw runtimeError("COMPUTER_VISION_NOT_FOUND", `Unknown Computer/Vision capability: ${id}.`, 404);
    return record;
  }

  function snapshot(record) {
    return structuredClone({
      id: record.capability.id,
      name: record.capability.name,
      description: record.capability.description,
      phase: record.phase,
      adapter: record.registration ? { pluginId: record.registration.pluginId } : null,
      lastTest: record.lastTest,
      lastInvocation: record.lastInvocation,
      lastError: record.lastError,
      updatedAt: record.updatedAt,
    });
  }

  function setPhase(record, phase) {
    record.phase = phase;
    record.updatedAt = now();
  }

  function queue(record, operation) {
    const result = record.pending.then(operation, operation);
    record.pending = result.then(() => undefined, () => undefined);
    return result;
  }

  async function withTimeout(operation, label) {
    const controller = new AbortController();
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(runtimeError("COMPUTER_VISION_TIMEOUT", `${label} timed out after ${timeoutMs} ms.`, 504));
      }, timeoutMs);
    });
    try {
      return await Promise.race([Promise.resolve().then(() => operation(controller.signal)), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  function safeFailure(record, operation, error) {
    const timeout = error?.code === "COMPUTER_VISION_TIMEOUT";
    const invalidResult = error?.code === "INVALID_ADAPTER_RESULT" || error?.code === "COMPUTER_VISION_RESULT_TOO_LARGE";
    record.lastError = {
      code: timeout ? "COMPUTER_VISION_TIMEOUT" : invalidResult ? "INVALID_ADAPTER_RESULT" : "COMPUTER_VISION_ADAPTER_FAILED",
      message: timeout
        ? `${record.capability.name} ${operation} timed out.`
        : invalidResult ? `${record.capability.name} adapter returned an invalid result.` : `${record.capability.name} adapter ${operation} failed.`,
      statusCode: timeout ? 504 : 502,
      at: now(),
    };
    setPhase(record, "error");
    return record.lastError;
  }

  function catalog() {
    return [...records.values()].map((record) => structuredClone(record.capability));
  }

  function list() {
    return [...records.values()].map(snapshot);
  }

  function status(id) {
    return snapshot(getRecord(id));
  }

  function registerAdapter({ pluginId, capability, adapter }) {
    requireOpen();
    if (typeof pluginId !== "string" || !PLUGIN_ID_PATTERN.test(pluginId)) {
      throw runtimeError("INVALID_COMPUTER_VISION_ADAPTER", "Plugin id is invalid.");
    }
    const record = getRecord(capability);
    if (record.registration) throw runtimeError("COMPUTER_VISION_ADAPTER_EXISTS", `${capability} already has an adapter.`, 409);
    record.registration = { pluginId, adapter: validateAdapter(adapter) };
    record.lastError = null;
    setPhase(record, "ready");
    return snapshot(record);
  }

  async function testAdapter(capability) {
    requireOpen();
    const record = getRecord(capability);
    return queue(record, async () => {
      if (!record.registration) return { status: "external-runtime-required", capability };
      setPhase(record, "testing");
      try {
        const result = await withTimeout(
          (signal) => record.registration.adapter.test({ capability, signal }),
          `${record.capability.name} test`,
        );
        if (!result || result.ok !== true) throw runtimeError("COMPUTER_VISION_TEST_REJECTED", "Adapter did not confirm readiness.", 502);
        record.lastTest = { ok: true, at: now() };
        record.lastError = null;
        setPhase(record, "ready");
        return { status: "succeeded", capability, checkedAt: record.lastTest.at };
      } catch (error) {
        record.lastTest = { ok: false, at: now() };
        return { status: "failed", capability, error: safeFailure(record, "test", error) };
      }
    });
  }

  async function invoke(capability, input = {}) {
    requireOpen();
    const record = getRecord(capability);
    const normalizedInput = normalizeInput(capability, input, limits);
    return queue(record, async () => {
      if (!record.registration) return { status: "external-runtime-required", capability, result: null };
      setPhase(record, "running");
      try {
        const rawResult = await withTimeout(
          (signal) => record.registration.adapter.invoke({ capability, input: normalizedInput, signal }),
          `${record.capability.name} invocation`,
        );
        const result = normalizeResult(capability, rawResult, limits);
        record.lastInvocation = { status: "succeeded", at: now() };
        record.lastError = null;
        setPhase(record, "ready");
        return { status: "succeeded", capability, result };
      } catch (error) {
        record.lastInvocation = { status: "failed", at: now() };
        return { status: "failed", capability, result: null, error: safeFailure(record, "invocation", error) };
      }
    });
  }

  async function disposeRegistration(record) {
    await record.pending;
    const registration = record.registration;
    if (!registration) return false;
    if (typeof registration.adapter.dispose === "function") {
      try {
        await withTimeout(
          (signal) => registration.adapter.dispose({ capability: record.capability.id, signal }),
          `${record.capability.name} adapter disposal`,
        );
      } catch {
        // The adapter is removed even when its best-effort cleanup fails or times out.
      }
    }
    record.registration = null;
    record.lastError = null;
    setPhase(record, "external-runtime-required");
    return true;
  }

  async function unregisterAdapter(capability, pluginId) {
    requireOpen();
    const record = getRecord(capability);
    if (!record.registration) return snapshot(record);
    if (typeof pluginId !== "string" || !PLUGIN_ID_PATTERN.test(pluginId)) {
      throw runtimeError("INVALID_COMPUTER_VISION_ADAPTER", "Plugin id is required to unregister an adapter.");
    }
    if (record.registration.pluginId !== pluginId) {
      throw runtimeError("COMPUTER_VISION_ADAPTER_OWNER_MISMATCH", `${pluginId} does not own the ${capability} adapter.`, 403);
    }
    await disposeRegistration(record);
    return snapshot(record);
  }

  async function removePlugin(pluginId) {
    requireOpen();
    if (typeof pluginId !== "string" || !PLUGIN_ID_PATTERN.test(pluginId)) {
      throw runtimeError("INVALID_COMPUTER_VISION_ADAPTER", "Plugin id is invalid.");
    }
    const owned = [...records.values()].filter((record) => record.registration?.pluginId === pluginId);
    for (const record of owned) await disposeRegistration(record);
    return { adapters: owned.length };
  }

  async function close() {
    if (closed) return;
    for (const record of records.values()) await disposeRegistration(record);
    closed = true;
  }

  return { catalog, close, invoke, list, registerAdapter, removePlugin, status, test: testAdapter, unregisterAdapter };
}
