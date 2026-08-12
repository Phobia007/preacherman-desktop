import { randomUUID } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve } from "node:path";

const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const PLUGIN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;

export const PREACHERMAN_COMPUTER_VISION_CATALOG = Object.freeze([
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

function isInside(root, target) {
  const result = relative(root, target);
  return result === "" || (!result.startsWith("..") && !isAbsolute(result));
}

async function readScopedLocalImage(localPath, localImageRoots, maxImageBytes) {
  if (typeof localPath !== "string" || localPath.length === 0 || localPath.length > 4_096) {
    throw runtimeError("INVALID_COMPUTER_VISION_INPUT", "Local image path is invalid.");
  }
  if (localImageRoots.length === 0) {
    throw runtimeError("LOCAL_IMAGE_SCOPE_REQUIRED", "No trusted local image directory is configured.", 403);
  }
  let target;
  try {
    target = await realpath(resolve(localPath));
  } catch {
    throw runtimeError("LOCAL_IMAGE_NOT_FOUND", "The selected local image is unavailable.", 404);
  }
  const trustedRoots = await Promise.all(localImageRoots.map(async (root) => {
    try { return await realpath(root); } catch { return null; }
  }));
  if (!trustedRoots.some((root) => root && isInside(root, target))) {
    throw runtimeError("LOCAL_IMAGE_OUT_OF_SCOPE", "The selected image is outside the trusted local scope.", 403);
  }
  const details = await stat(target);
  if (!details.isFile()) throw runtimeError("LOCAL_IMAGE_NOT_FOUND", "The selected local image is not a file.", 404);
  if (details.size > maxImageBytes) {
    throw runtimeError("COMPUTER_VISION_INPUT_TOO_LARGE", `Local image exceeds the ${maxImageBytes}-byte limit.`, 413);
  }
  const mimeType = ({ ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" })[extname(target).toLowerCase()];
  if (!mimeType) throw runtimeError("INVALID_COMPUTER_VISION_INPUT", "Local image must be PNG, JPEG, or WebP.");
  return { mimeType, data: (await readFile(target)).toString("base64") };
}

async function normalizeVisionInput(input, maxImageBytes, localImageRoots) {
  const value = expectObject(input, "Vision analysis input");
  assertKeys(value, ["image", "prompt"], "Vision analysis input");
  const image = expectObject(value.image, "Vision image");
  assertKeys(image, ["mimeType", "data", "source", "localPath"], "Vision image");
  let normalizedImage;
  if (image.localPath !== undefined) {
    if (image.mimeType !== undefined || image.data !== undefined || image.source !== undefined) {
      throw runtimeError("INVALID_COMPUTER_VISION_INPUT", "Local image input cannot include inline image fields.");
    }
    normalizedImage = await readScopedLocalImage(image.localPath, localImageRoots, maxImageBytes);
  } else {
    if (!IMAGE_MIME_TYPES.has(image.mimeType)) {
      throw runtimeError("INVALID_COMPUTER_VISION_INPUT", "Vision image MIME type must be image/png, image/jpeg, or image/webp.");
    }
    if (image.source !== undefined && image.source !== "inline" && image.source !== "screenshot") {
      throw runtimeError("INVALID_COMPUTER_VISION_INPUT", "Vision image source must be inline or screenshot.");
    }
    decodedBase64Size(image.data, maxImageBytes, "Vision image");
    normalizedImage = { mimeType: image.mimeType, data: image.data, ...(image.source ? { source: image.source } : {}) };
  }
  const result = { image: normalizedImage };
  const prompt = optionalString(value.prompt, "Vision prompt", 4_000);
  if (prompt !== undefined) result.prompt = prompt;
  return result;
}

async function normalizeInput(capability, input, { maxImageBytes, maxInputBytes, localImageRoots }) {
  if (jsonSize(input, "Computer/Vision input") > maxInputBytes) {
    throw runtimeError("COMPUTER_VISION_INPUT_TOO_LARGE", `Computer/Vision input exceeds the ${maxInputBytes}-byte limit.`, 413);
  }
  if (capability === "screenshot") return normalizeCaptureInput(input, false);
  if (capability === "camera-window") return normalizeCaptureInput(input, true);
  if (capability === "cursor-monitor") return normalizeCursorInput(input);
  return normalizeVisionInput(input, maxImageBytes, localImageRoots);
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

function normalizeComputerTarget(value) {
  const target = expectObject(value, "Computer Use target");
  assertKeys(target, ["kind", "id"], "Computer Use target");
  if (!['desktop', 'window', 'web'].includes(target.kind)) {
    throw runtimeError("INVALID_COMPUTER_USE_TARGET", "Computer Use target kind must be desktop, window, or web.");
  }
  const id = requiredString(target.id, "Computer Use target id", 1_000);
  if (target.kind === "web") {
    let url;
    try { url = new URL(id); } catch { throw runtimeError("INVALID_COMPUTER_USE_TARGET", "Web targets require an absolute HTTP(S) origin."); }
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw runtimeError("INVALID_COMPUTER_USE_TARGET", "Web targets require an HTTP(S) origin.");
    }
    if (url.username || url.password) throw runtimeError("INVALID_COMPUTER_USE_TARGET", "Web targets cannot contain credentials.");
    url.hash = "";
    return { kind: "web", id: url.href };
  }
  return { kind: target.kind, id };
}

function targetKey(target) {
  return `${target.kind}:${target.id}`;
}

function normalizeComputerAction(value) {
  const action = expectObject(value, "Computer Use action");
  if (action.type === "click") {
    assertKeys(action, ["type", "selector", "x", "y"], "Click action");
    const selector = optionalString(action.selector, "Click selector", 512);
    const hasCoordinates = Number.isFinite(action.x) && Number.isFinite(action.y);
    if (!selector && !hasCoordinates) throw runtimeError("INVALID_COMPUTER_USE_ACTION", "Click requires a selector or coordinates.");
    if (hasCoordinates && (Math.abs(action.x) > 1_000_000 || Math.abs(action.y) > 1_000_000)) {
      throw runtimeError("INVALID_COMPUTER_USE_ACTION", "Click coordinates are outside the supported range.");
    }
    return { type: "click", ...(selector ? { selector } : {}), ...(hasCoordinates ? { x: action.x, y: action.y } : {}) };
  }
  if (action.type === "type") {
    assertKeys(action, ["type", "selector", "text"], "Type action");
    return {
      type: "type",
      selector: requiredString(action.selector, "Type selector", 512),
      text: requiredString(action.text, "Type text", 10_000),
    };
  }
  if (action.type === "key") {
    assertKeys(action, ["type", "key"], "Key action");
    const key = requiredString(action.key, "Key", 32);
    if (!["Enter", "Escape", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(key)) {
      throw runtimeError("INVALID_COMPUTER_USE_ACTION", "Key action is not allowed.");
    }
    return { type: "key", key };
  }
  if (action.type === "scroll") {
    assertKeys(action, ["type", "deltaX", "deltaY"], "Scroll action");
    if (!Number.isFinite(action.deltaX) || !Number.isFinite(action.deltaY)
      || Math.abs(action.deltaX) > 100_000 || Math.abs(action.deltaY) > 100_000) {
      throw runtimeError("INVALID_COMPUTER_USE_ACTION", "Scroll delta is outside the supported range.");
    }
    return { type: "scroll", deltaX: action.deltaX, deltaY: action.deltaY };
  }
  throw runtimeError("INVALID_COMPUTER_USE_ACTION", "Computer Use action type is not allowed.");
}

function summarizeAction(action) {
  if (action.type === "type") return { type: "type", selector: action.selector, textLength: action.text.length };
  return structuredClone(action);
}

function normalizeObservationResult(value, maxImageBytes) {
  const result = expectObject(value, "Computer observation result");
  assertKeys(result, ["summary", "image"], "Computer observation result");
  const normalized = { summary: requiredString(result.summary, "Observation summary", 10_000) };
  if (result.image !== undefined) {
    normalized.image = normalizeImageResult({ image: result.image }, maxImageBytes).image;
  }
  return normalized;
}

function normalizeDomResult(value) {
  const result = expectObject(value, "DOM inspection result");
  assertKeys(result, ["url", "title", "nodes", "truncated"], "DOM inspection result");
  if (!Array.isArray(result.nodes) || result.nodes.length > 2_000 || typeof result.truncated !== "boolean") {
    throw runtimeError("INVALID_ADAPTER_RESULT", "DOM inspection result is invalid.", 502);
  }
  return {
    ...(result.url === undefined ? {} : { url: requiredString(result.url, "DOM URL", 2_000) }),
    ...(result.title === undefined ? {} : { title: requiredString(result.title, "DOM title", 1_000) }),
    nodes: result.nodes.map((item) => {
      const node = expectObject(item, "DOM node");
      assertKeys(node, ["tag", "role", "name", "text", "selector"], "DOM node");
      return {
        tag: requiredString(node.tag, "DOM tag", 64),
        ...(node.role === undefined ? {} : { role: requiredString(node.role, "DOM role", 128) }),
        ...(node.name === undefined ? {} : { name: requiredString(node.name, "DOM name", 512) }),
        ...(node.text === undefined ? {} : { text: requiredString(node.text, "DOM text", 2_000) }),
        ...(node.selector === undefined ? {} : { selector: requiredString(node.selector, "DOM selector", 512) }),
      };
    }),
    truncated: result.truncated,
  };
}

function normalizeActionResult(value) {
  const result = expectObject(value, "Computer action result");
  assertKeys(result, ["performed", "summary"], "Computer action result");
  if (result.performed !== true) throw runtimeError("INVALID_ADAPTER_RESULT", "Computer adapter did not confirm the action.", 502);
  requiredString(result.summary, "Computer action summary", 2_000);
  return { performed: true };
}

function validateComputerUseAdapter(adapter) {
  if (!adapter || typeof adapter !== "object" || Array.isArray(adapter)) {
    throw runtimeError("INVALID_COMPUTER_USE_ADAPTER", "Computer Use adapter must be an object.");
  }
  for (const operation of ["test", "observe", "inspectDom", "perform"]) {
    if (typeof adapter[operation] !== "function") {
      throw runtimeError("INVALID_COMPUTER_USE_ADAPTER", `Computer Use adapter requires ${operation}().`);
    }
  }
  if (adapter.dispose !== undefined && typeof adapter.dispose !== "function") {
    throw runtimeError("INVALID_COMPUTER_USE_ADAPTER", "Computer Use adapter dispose must be a function.");
  }
  return adapter;
}

export function createPreachermanComputerVisionRuntime({
  timeoutMs = 10_000,
  maxImageBytes = 8 * 1024 * 1024,
  maxInputBytes = 12 * 1024 * 1024,
  maxResultBytes = 12 * 1024 * 1024,
  localImageRoots = [],
  approvalVerifier,
  approvalTtlMs = 60_000,
  operationLogLimit = 500,
  clock = () => Date.now(),
  now = () => new Date().toISOString(),
} = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 120_000) {
    throw new TypeError("Computer/Vision timeout must be an integer between 10 and 120000 milliseconds.");
  }
  for (const [name, value] of Object.entries({ maxImageBytes, maxInputBytes, maxResultBytes })) {
    if (!Number.isInteger(value) || value < 1) throw new TypeError(`${name} must be a positive integer.`);
  }

  if (!Array.isArray(localImageRoots) || localImageRoots.some((root) => typeof root !== "string" || root.length === 0)) {
    throw new TypeError("localImageRoots must be an array of trusted directory paths.");
  }
  if (approvalVerifier !== undefined && typeof approvalVerifier !== "function") {
    throw new TypeError("approvalVerifier must be a function.");
  }
  if (!Number.isInteger(approvalTtlMs) || approvalTtlMs < 1_000 || approvalTtlMs > 300_000) {
    throw new TypeError("approvalTtlMs must be an integer between 1000 and 300000 milliseconds.");
  }
  if (!Number.isInteger(operationLogLimit) || operationLogLimit < 1 || operationLogLimit > 10_000) {
    throw new TypeError("operationLogLimit must be an integer between 1 and 10000.");
  }
  const limits = { maxImageBytes, maxInputBytes, maxResultBytes, localImageRoots: localImageRoots.map((root) => resolve(root)) };
  const records = new Map(PREACHERMAN_COMPUTER_VISION_CATALOG.map((capability) => [capability.id, {
    capability: structuredClone(capability),
    registration: null,
    phase: "external-runtime-required",
    lastTest: null,
    lastInvocation: null,
    lastError: null,
    updatedAt: now(),
    pending: Promise.resolve(),
  }]));
  const approvals = new Map();
  const operationLog = [];
  let computerRegistration = null;
  let computerPhase = "external-runtime-required";
  let computerLastTest = null;
  let computerLastError = null;
  let computerPending = Promise.resolve();
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

  function queueComputer(operation) {
    const result = computerPending.then(operation, operation);
    computerPending = result.then(() => undefined, () => undefined);
    return result;
  }

  function addOperation({ type, callerPluginId = "preacherman-host", target, status: operationStatus, durationMs = 0, error }) {
    const entry = {
      id: randomUUID(),
      type,
      callerPluginId,
      ...(target ? { target: structuredClone(target) } : {}),
      status: operationStatus,
      durationMs,
      at: now(),
      ...(error ? { error: structuredClone(error) } : {}),
    };
    operationLog.push(entry);
    if (operationLog.length > operationLogLimit) operationLog.splice(0, operationLog.length - operationLogLimit);
    return entry;
  }

  function safeComputerError(operation, error) {
    const timeout = error?.code === "COMPUTER_VISION_TIMEOUT";
    const invalidResult = error?.code === "INVALID_ADAPTER_RESULT";
    return {
      code: timeout ? "COMPUTER_USE_TIMEOUT" : invalidResult ? "INVALID_ADAPTER_RESULT" : "COMPUTER_USE_ADAPTER_FAILED",
      message: timeout
        ? `Computer Use ${operation} timed out.`
        : invalidResult ? "Computer Use adapter returned an invalid result." : `Computer Use adapter ${operation} failed.`,
      statusCode: timeout ? 504 : 502,
      at: now(),
    };
  }

  function requireCaller(pluginId) {
    if (typeof pluginId !== "string" || !PLUGIN_ID_PATTERN.test(pluginId)) {
      throw runtimeError("INVALID_COMPUTER_USE_CALLER", "Computer Use caller plugin id is invalid.");
    }
    return pluginId;
  }

  function scopedTarget(value) {
    const target = normalizeComputerTarget(value);
    if (!computerRegistration?.targetKeys.has(targetKey(target))) {
      throw runtimeError("COMPUTER_USE_TARGET_OUT_OF_SCOPE", "Computer Use target is outside the registered adapter scope.", 403);
    }
    return target;
  }

  function computerUseStatus() {
    expireApprovals();
    return structuredClone({
      phase: computerPhase,
      adapter: computerRegistration ? { pluginId: computerRegistration.pluginId } : null,
      targets: computerRegistration ? computerRegistration.targets : [],
      lastTest: computerLastTest,
      lastError: computerLastError,
      pendingApprovals: [...approvals.values()].filter((approval) => approval.status === "pending").length,
    });
  }

  function registerComputerUseAdapter({ pluginId, targets, adapter }) {
    requireOpen();
    requireCaller(pluginId);
    if (computerRegistration) throw runtimeError("COMPUTER_USE_ADAPTER_EXISTS", "Computer Use already has an adapter.", 409);
    if (!Array.isArray(targets) || targets.length === 0 || targets.length > 64) {
      throw runtimeError("INVALID_COMPUTER_USE_TARGET", "Computer Use adapter requires between 1 and 64 targets.");
    }
    const normalizedTargets = targets.map(normalizeComputerTarget);
    const keys = new Set(normalizedTargets.map(targetKey));
    if (keys.size !== normalizedTargets.length) throw runtimeError("INVALID_COMPUTER_USE_TARGET", "Computer Use targets must be unique.");
    computerRegistration = {
      pluginId,
      targets: normalizedTargets,
      targetKeys: keys,
      adapter: validateComputerUseAdapter(adapter),
    };
    computerPhase = "ready";
    computerLastError = null;
    return computerUseStatus();
  }

  async function testComputerUse() {
    requireOpen();
    return queueComputer(async () => {
      if (!computerRegistration) return { status: "external-runtime-required", capability: "computer-use" };
      computerPhase = "testing";
      try {
        const result = await withTimeout(
          (signal) => computerRegistration.adapter.test({ capability: "computer-use", signal }),
          "Computer Use test",
        );
        if (!result || result.ok !== true) throw runtimeError("COMPUTER_USE_TEST_REJECTED", "Adapter did not confirm readiness.", 502);
        computerLastTest = { ok: true, at: now() };
        computerLastError = null;
        computerPhase = "ready";
        return { status: "succeeded", capability: "computer-use", checkedAt: computerLastTest.at };
      } catch (error) {
        computerLastTest = { ok: false, at: now() };
        computerLastError = safeComputerError("test", error);
        computerPhase = "error";
        return { status: "failed", capability: "computer-use", error: computerLastError };
      }
    });
  }

  async function runComputerRead(type, request) {
    requireOpen();
    const callerPluginId = requireCaller(request?.callerPluginId);
    if (!computerRegistration) return { status: "external-runtime-required", operation: type, result: null };
    const target = scopedTarget(request?.target);
    const selector = type === "inspect-dom" ? optionalString(request?.selector, "DOM selector", 512) : undefined;
    const maxDepth = type === "inspect-dom" ? optionalInteger(request?.maxDepth, "DOM maxDepth", 1, 20) : undefined;
    return queueComputer(async () => {
      const startedAt = clock();
      computerPhase = "running";
      try {
        const rawResult = await withTimeout(
          (signal) => type === "observe"
            ? computerRegistration.adapter.observe({ callerPluginId, target, signal })
            : computerRegistration.adapter.inspectDom({ callerPluginId, target, selector, maxDepth, signal }),
          `Computer Use ${type}`,
        );
        const result = type === "observe"
          ? normalizeObservationResult(rawResult, maxImageBytes)
          : normalizeDomResult(rawResult);
        computerLastError = null;
        computerPhase = "ready";
        addOperation({ type, callerPluginId, target, status: "succeeded", durationMs: Math.max(0, clock() - startedAt) });
        return { status: "succeeded", operation: type, result };
      } catch (error) {
        computerLastError = safeComputerError(type, error);
        computerPhase = "error";
        addOperation({ type, callerPluginId, target, status: "failed", durationMs: Math.max(0, clock() - startedAt), error: computerLastError });
        return { status: "failed", operation: type, result: null, error: computerLastError };
      }
    });
  }

  function observe(request) {
    return runComputerRead("observe", request);
  }

  function inspectDom(request) {
    return runComputerRead("inspect-dom", request);
  }

  function publicApproval(approval) {
    return structuredClone({
      id: approval.id,
      status: approval.status,
      callerPluginId: approval.callerPluginId,
      target: approval.target,
      action: approval.actionSummary,
      createdAt: approval.createdAt,
      expiresAt: approval.expiresAt,
      ...(approval.completedAt ? { completedAt: approval.completedAt } : {}),
      ...(approval.result ? { result: approval.result } : {}),
      ...(approval.error ? { error: approval.error } : {}),
    });
  }

  function expireApprovals() {
    for (const approval of approvals.values()) {
      if (approval.status === "pending" && clock() > approval.expiresAtMs) {
        approval.status = "expired";
        approval.completedAt = now();
        addOperation({ type: "action-expired", callerPluginId: approval.callerPluginId, target: approval.target, status: "expired" });
      }
    }
  }

  function requestAction(request) {
    requireOpen();
    const callerPluginId = requireCaller(request?.callerPluginId);
    if (!computerRegistration) return { status: "external-runtime-required", approval: null };
    const target = scopedTarget(request?.target);
    const action = normalizeComputerAction(request?.action);
    const createdAtMs = clock();
    const approval = {
      id: randomUUID(),
      status: "pending",
      callerPluginId,
      target,
      action,
      actionSummary: summarizeAction(action),
      createdAt: now(),
      createdAtMs,
      expiresAt: new Date(createdAtMs + approvalTtlMs).toISOString(),
      expiresAtMs: createdAtMs + approvalTtlMs,
    };
    approvals.set(approval.id, approval);
    addOperation({ type: "action-requested", callerPluginId, target, status: "pending" });
    return { status: "approval-required", approval: publicApproval(approval) };
  }

  function listApprovals({ status: approvalStatus } = {}) {
    expireApprovals();
    return [...approvals.values()]
      .filter((approval) => !approvalStatus || approval.status === approvalStatus)
      .map(publicApproval);
  }

  async function approveAction({ approvalId, decision, evidence }) {
    requireOpen();
    expireApprovals();
    const approval = approvals.get(approvalId);
    if (!approval) throw runtimeError("COMPUTER_USE_APPROVAL_NOT_FOUND", "Computer Use approval was not found.", 404);
    if (approval.status !== "pending") throw runtimeError("COMPUTER_USE_APPROVAL_CONSUMED", "Computer Use approval is no longer pending.", 409);
    if (decision !== "approve" && decision !== "deny") throw runtimeError("INVALID_COMPUTER_USE_APPROVAL", "Approval decision must be approve or deny.");
    if (!approvalVerifier) throw runtimeError("COMPUTER_USE_APPROVAL_AUTHORITY_REQUIRED", "Host approval authority is not configured.", 503);
    let verified;
    try {
      verified = await withTimeout(
        (signal) => approvalVerifier({
          approvalId,
          decision,
          evidence,
          request: publicApproval(approval),
          signal,
        }),
        "Computer Use approval verification",
      );
    } catch (error) {
      if (error?.code === "COMPUTER_VISION_TIMEOUT") {
        throw runtimeError("COMPUTER_USE_APPROVAL_TIMEOUT", "Host approval verification timed out.", 504);
      }
      throw runtimeError("COMPUTER_USE_APPROVAL_REJECTED", "Host approval evidence was rejected.", 403);
    }
    if (verified !== true) throw runtimeError("COMPUTER_USE_APPROVAL_REJECTED", "Host approval evidence was rejected.", 403);
    expireApprovals();
    if (approval.status !== "pending") throw runtimeError("COMPUTER_USE_APPROVAL_CONSUMED", "Computer Use approval is no longer pending.", 409);
    if (decision === "deny") {
      approval.status = "denied";
      approval.completedAt = now();
      addOperation({ type: "action-denied", callerPluginId: approval.callerPluginId, target: approval.target, status: "denied" });
      return { status: "denied", approval: publicApproval(approval) };
    }
    approval.status = "executing";
    return queueComputer(async () => {
      const startedAt = clock();
      computerPhase = "running";
      try {
        if (!computerRegistration?.targetKeys.has(targetKey(approval.target))) {
          throw runtimeError("COMPUTER_USE_TARGET_OUT_OF_SCOPE", "Approved target is no longer registered.", 403);
        }
        const rawResult = await withTimeout(
          (signal) => computerRegistration.adapter.perform({
            callerPluginId: approval.callerPluginId,
            target: approval.target,
            action: structuredClone(approval.action),
            approvalId: approval.id,
            signal,
          }),
          "Computer Use approved action",
        );
        approval.result = normalizeActionResult(rawResult);
        approval.status = "succeeded";
        approval.completedAt = now();
        computerLastError = null;
        computerPhase = "ready";
        addOperation({ type: `action-${approval.action.type}`, callerPluginId: approval.callerPluginId, target: approval.target, status: "succeeded", durationMs: Math.max(0, clock() - startedAt) });
        return { status: "succeeded", approval: publicApproval(approval) };
      } catch (error) {
        approval.error = safeComputerError("action", error);
        approval.status = "failed";
        approval.completedAt = now();
        computerLastError = approval.error;
        computerPhase = "error";
        addOperation({ type: `action-${approval.action.type}`, callerPluginId: approval.callerPluginId, target: approval.target, status: "failed", durationMs: Math.max(0, clock() - startedAt), error: approval.error });
        return { status: "failed", approval: publicApproval(approval) };
      }
    });
  }

  function logs({ limit = 50, callerPluginId } = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > operationLogLimit) {
      throw runtimeError("INVALID_COMPUTER_USE_LOG_QUERY", `Operation log limit must be between 1 and ${operationLogLimit}.`);
    }
    return structuredClone(operationLog
      .filter((entry) => !callerPluginId || entry.callerPluginId === callerPluginId)
      .slice(-limit));
  }

  async function disposeComputerRegistration() {
    await computerPending;
    const registration = computerRegistration;
    if (!registration) return false;
    if (typeof registration.adapter.dispose === "function") {
      try {
        await withTimeout(
          (signal) => registration.adapter.dispose({ capability: "computer-use", signal }),
          "Computer Use adapter disposal",
        );
      } catch {
        // Removal stays bounded even when an external runtime ignores cancellation.
      }
    }
    computerRegistration = null;
    computerPhase = "external-runtime-required";
    computerLastError = null;
    for (const approval of approvals.values()) {
      if (approval.status === "pending") {
        approval.status = "cancelled";
        approval.completedAt = now();
      }
    }
    return true;
  }

  async function unregisterComputerUseAdapter(pluginId) {
    requireOpen();
    requireCaller(pluginId);
    if (!computerRegistration) return computerUseStatus();
    if (computerRegistration.pluginId !== pluginId) {
      throw runtimeError("COMPUTER_USE_ADAPTER_OWNER_MISMATCH", `${pluginId} does not own the Computer Use adapter.`, 403);
    }
    await disposeComputerRegistration();
    return computerUseStatus();
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
    const normalizedInput = await normalizeInput(capability, input, limits);
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
    const computerUseAdapters = computerRegistration?.pluginId === pluginId && await disposeComputerRegistration() ? 1 : 0;
    let removedApprovals = 0;
    for (const approval of approvals.values()) {
      if (approval.callerPluginId === pluginId && approval.status === "pending") {
        approval.status = "cancelled";
        approval.completedAt = now();
        removedApprovals += 1;
      }
    }
    return {
      adapters: owned.length,
      ...(computerUseAdapters ? { computerUseAdapters } : {}),
      ...(removedApprovals ? { approvals: removedApprovals } : {}),
    };
  }

  async function close() {
    if (closed) return;
    for (const record of records.values()) await disposeRegistration(record);
    await disposeComputerRegistration();
    closed = true;
  }

  return {
    approveAction,
    catalog,
    close,
    computerUseStatus,
    inspectDom,
    invoke,
    list,
    listApprovals,
    logs,
    observe,
    registerAdapter,
    registerComputerUseAdapter,
    removePlugin,
    requestAction,
    status,
    test: testAdapter,
    testComputerUse,
    unregisterAdapter,
    unregisterComputerUseAdapter,
  };
}
