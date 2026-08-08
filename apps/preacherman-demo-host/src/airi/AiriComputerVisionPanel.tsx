import { useCallback, useEffect, useId, useState } from "react";
import type { Locale } from "../preferences";
import "./airi-computer-vision-panel.css";

const CAPABILITY_IDS = ["screenshot", "camera-window", "cursor-monitor", "vision-analysis"] as const;

type ComputerVisionCapabilityId = typeof CAPABILITY_IDS[number];
type ComputerVisionPhase = "external-runtime-required" | "ready" | "testing" | "running" | "error";
type ComputerVisionServiceRequest = <T>(path: string, init?: RequestInit) => Promise<T>;

interface ComputerVisionCapability {
  readonly id: ComputerVisionCapabilityId;
  readonly name: string;
  readonly description: string;
  readonly phase: ComputerVisionPhase;
  readonly adapter: { readonly pluginId: string } | null;
  readonly lastTest: { readonly ok: boolean; readonly at: string } | null;
  readonly lastError: { readonly code?: string; readonly message?: string; readonly at?: string } | null;
}

interface ComputerVisionTestResult {
  readonly status: "succeeded" | "failed" | "external-runtime-required";
  readonly capability: string;
  readonly error?: { readonly message?: string };
}

type VisionInvocationStatus = "succeeded" | "failed" | "configuration-required" | "external-runtime-required";
type VisionInvocationPhase = "idle" | "running" | VisionInvocationStatus;

interface VisionDetection {
  readonly label: string;
  readonly confidence: number;
}

interface VisionInvocationResult {
  readonly status: VisionInvocationStatus;
  readonly capability: "vision-analysis";
  readonly result: { readonly summary: string; readonly detections: readonly VisionDetection[] } | null;
  readonly error?: { readonly code?: string; readonly message?: string };
}

interface VisionInvocationState {
  readonly phase: VisionInvocationPhase;
  readonly result?: VisionInvocationResult["result"];
}

interface ComputerUseTarget {
  readonly kind: "desktop" | "window" | "web";
  readonly id: string;
}

interface ComputerUseStatus {
  readonly phase: ComputerVisionPhase;
  readonly adapter: { readonly pluginId: string } | null;
  readonly targets: readonly ComputerUseTarget[];
  readonly pendingApprovals: number;
  readonly lastError: { readonly message?: string } | null;
}

interface ComputerUseApproval {
  readonly id: string;
  readonly status: string;
  readonly callerPluginId: string;
  readonly target: ComputerUseTarget;
  readonly action: { readonly type: string; readonly selector?: string; readonly textLength?: number };
  readonly expiresAt: string;
}

interface ComputerUseLogEntry {
  readonly id: string;
  readonly type: string;
  readonly callerPluginId: string;
  readonly status: string;
  readonly durationMs: number;
}

interface ComputerVisionDashboard {
  readonly capabilities: readonly ComputerVisionCapability[];
  readonly computerUse: ComputerUseStatus;
  readonly approvals: readonly ComputerUseApproval[];
  readonly operations: readonly ComputerUseLogEntry[];
}

export interface AiriComputerVisionPanelProps {
  readonly locale: Locale;
  readonly serviceRequest: ComputerVisionServiceRequest;
}

const copy = {
  en: {
    eyebrow: "AIRI perception",
    title: "Computer & vision",
    description: "Adapter readiness from the local service. This panel never requests browser capture or camera permissions.",
    refresh: "Refresh status",
    refreshing: "Refreshing…",
    loading: "Loading Computer/Vision status…",
    loadError: "Could not load Computer/Vision status.",
    test: "Test adapter",
    testing: "Testing…",
    adapter: "Adapter",
    external: "External",
    noAdapter: "No external adapter registered",
    neverTested: "Not tested yet",
    lastTestPassed: "Last test passed",
    lastTestFailed: "Last test failed",
    localVisionTitle: "Analyze a trusted local image",
    localVisionHint: "Enter a PNG, JPEG, or WebP path inside a trusted local image directory. The browser sends only the path to the local service; it never reads the file.",
    localImagePath: "Local image path",
    localImagePlaceholder: "D:\\trusted-images\\sample.png",
    analysisPrompt: "Analysis prompt",
    analysisPromptPlaceholder: "Describe the objects and visual structure.",
    analyze: "Analyze image",
    analyzing: "Analyzing…",
    analysisResult: "Analysis result",
    detections: "Detections",
    noDetections: "No detections returned.",
    visionStates: {
      idle: "Ready for a local image",
      running: "Analysis running",
      succeeded: "Analysis succeeded",
      failed: "Analysis failed",
      "configuration-required": "Configuration required",
      "external-runtime-required": "External runtime required",
    },
    computerUse: "Computer Use",
    computerUseHint: "Read-only observation is direct. Every click, key, scroll, or text action needs a separate host approval.",
    targets: "Approved targets",
    observe: "Observe",
    inspectDom: "Inspect DOM",
    approvals: "Pending approvals",
    noApprovals: "No write actions awaiting approval.",
    approve: "Approve once",
    deny: "Deny",
    requestedBy: "Requested by",
    expires: "Expires",
    operations: "Operation log",
    noOperations: "No Computer Use operations recorded.",
    states: {
      "external-runtime-required": "External runtime required",
      ready: "Ready",
      testing: "Testing",
      running: "Running",
      error: "Error",
    },
    fallbackNames: {
      screenshot: "Screenshot",
      "camera-window": "Camera / Window",
      "cursor-monitor": "Cursor Monitor",
      "vision-analysis": "Vision Analysis",
    },
  },
  "zh-CN": {
    eyebrow: "AIRI 感知能力",
    title: "计算机与视觉",
    description: "状态来自本地服务的真实适配器；此面板不会请求浏览器截图、摄像头或桌面权限。",
    refresh: "刷新状态",
    refreshing: "正在刷新…",
    loading: "正在加载计算机与视觉状态…",
    loadError: "无法加载计算机与视觉状态。",
    test: "测试适配器",
    testing: "正在测试…",
    adapter: "适配器",
    external: "外部能力",
    noAdapter: "尚未注册外部适配器",
    neverTested: "尚未测试",
    lastTestPassed: "上次测试通过",
    lastTestFailed: "上次测试失败",
    localVisionTitle: "分析可信本地图片",
    localVisionHint: "请输入可信本地图片目录内的 PNG、JPEG 或 WebP 路径。浏览器只把路径交给本地服务，不会读取文件内容。",
    localImagePath: "本地图片路径",
    localImagePlaceholder: "D:\\trusted-images\\sample.png",
    analysisPrompt: "分析提示词",
    analysisPromptPlaceholder: "描述画面中的对象与视觉结构。",
    analyze: "分析图片",
    analyzing: "正在分析…",
    analysisResult: "分析结果",
    detections: "识别对象",
    noDetections: "未返回识别对象。",
    visionStates: {
      idle: "可以分析本地图片",
      running: "正在执行分析",
      succeeded: "分析成功",
      failed: "分析失败",
      "configuration-required": "需要配置",
      "external-runtime-required": "需要外部运行时",
    },
    computerUse: "计算机操作",
    computerUseHint: "只读观察可直接执行；每一次点击、按键、滚动或文本输入都必须由宿主单独批准。",
    targets: "允许的目标",
    observe: "只读观察",
    inspectDom: "检查 DOM",
    approvals: "待批准操作",
    noApprovals: "当前没有等待批准的写操作。",
    approve: "仅批准本次",
    deny: "拒绝",
    requestedBy: "请求插件",
    expires: "到期时间",
    operations: "操作日志",
    noOperations: "尚无计算机操作记录。",
    states: {
      "external-runtime-required": "需要外部运行时",
      ready: "就绪",
      testing: "测试中",
      running: "运行中",
      error: "错误",
    },
    fallbackNames: {
      screenshot: "屏幕截图",
      "camera-window": "摄像头 / 窗口",
      "cursor-monitor": "光标监测",
      "vision-analysis": "视觉分析",
    },
  },
} as const;

function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} response is invalid.`);
  return value as Record<string, unknown>;
}

function parsePhase(value: unknown): ComputerVisionPhase {
  if (["external-runtime-required", "ready", "testing", "running", "error"].includes(String(value))) {
    return value as ComputerVisionPhase;
  }
  return "error";
}

function parseCapability(value: unknown): ComputerVisionCapability {
  const item = requireObject(value, "Computer/Vision capability");
  if (!CAPABILITY_IDS.includes(item.id as ComputerVisionCapabilityId)) throw new Error("Computer/Vision capability id is invalid.");
  const adapterValue = item.adapter === null ? null : requireObject(item.adapter, "Computer/Vision adapter");
  const lastTestValue = item.lastTest === null || item.lastTest === undefined ? null : requireObject(item.lastTest, "Computer/Vision test");
  const lastErrorValue = item.lastError === null || item.lastError === undefined ? null : requireObject(item.lastError, "Computer/Vision error");
  return {
    id: item.id as ComputerVisionCapabilityId,
    name: typeof item.name === "string" ? item.name : String(item.id),
    description: typeof item.description === "string" ? item.description : "",
    phase: parsePhase(item.phase),
    adapter: adapterValue && typeof adapterValue.pluginId === "string" ? { pluginId: adapterValue.pluginId } : null,
    lastTest: lastTestValue && typeof lastTestValue.ok === "boolean" && typeof lastTestValue.at === "string"
      ? { ok: lastTestValue.ok, at: lastTestValue.at }
      : null,
    lastError: lastErrorValue ? {
      code: typeof lastErrorValue.code === "string" ? lastErrorValue.code : undefined,
      message: typeof lastErrorValue.message === "string" ? lastErrorValue.message : undefined,
      at: typeof lastErrorValue.at === "string" ? lastErrorValue.at : undefined,
    } : null,
  };
}

export async function loadAiriComputerVision(serviceRequest: ComputerVisionServiceRequest): Promise<readonly ComputerVisionCapability[]> {
  const response = requireObject(await serviceRequest<unknown>("/api/computer-vision"), "Computer/Vision");
  if (!Array.isArray(response.capabilities)) throw new Error("Computer/Vision capability list is invalid.");
  return response.capabilities.map(parseCapability);
}

function parseComputerTarget(value: unknown): ComputerUseTarget {
  const target = requireObject(value, "Computer Use target");
  if (!["desktop", "window", "web"].includes(String(target.kind)) || typeof target.id !== "string") {
    throw new Error("Computer Use target is invalid.");
  }
  return { kind: target.kind as ComputerUseTarget["kind"], id: target.id };
}

function parseComputerUseStatus(value: unknown): ComputerUseStatus {
  if (value === undefined) {
    return { phase: "external-runtime-required", adapter: null, targets: [], pendingApprovals: 0, lastError: null };
  }
  const status = requireObject(value, "Computer Use status");
  const adapter = status.adapter === null ? null : requireObject(status.adapter, "Computer Use adapter");
  const lastError = status.lastError === null || status.lastError === undefined
    ? null
    : requireObject(status.lastError, "Computer Use error");
  return {
    phase: parsePhase(status.phase),
    adapter: adapter && typeof adapter.pluginId === "string" ? { pluginId: adapter.pluginId } : null,
    targets: Array.isArray(status.targets) ? status.targets.map(parseComputerTarget) : [],
    pendingApprovals: Number.isInteger(status.pendingApprovals) ? status.pendingApprovals as number : 0,
    lastError: lastError ? { message: typeof lastError.message === "string" ? lastError.message : undefined } : null,
  };
}

function parseApproval(value: unknown): ComputerUseApproval {
  const approval = requireObject(value, "Computer Use approval");
  const action = requireObject(approval.action, "Computer Use approval action");
  if (typeof approval.id !== "string" || typeof approval.callerPluginId !== "string" || typeof action.type !== "string") {
    throw new Error("Computer Use approval is invalid.");
  }
  return {
    id: approval.id,
    status: typeof approval.status === "string" ? approval.status : "error",
    callerPluginId: approval.callerPluginId,
    target: parseComputerTarget(approval.target),
    action: {
      type: action.type,
      selector: typeof action.selector === "string" ? action.selector : undefined,
      textLength: Number.isInteger(action.textLength) ? action.textLength as number : undefined,
    },
    expiresAt: typeof approval.expiresAt === "string" ? approval.expiresAt : "",
  };
}

function parseOperation(value: unknown): ComputerUseLogEntry {
  const operation = requireObject(value, "Computer Use operation");
  if (typeof operation.id !== "string" || typeof operation.type !== "string" || typeof operation.callerPluginId !== "string") {
    throw new Error("Computer Use operation is invalid.");
  }
  return {
    id: operation.id,
    type: operation.type,
    callerPluginId: operation.callerPluginId,
    status: typeof operation.status === "string" ? operation.status : "error",
    durationMs: typeof operation.durationMs === "number" ? operation.durationMs : 0,
  };
}

export async function loadAiriComputerVisionDashboard(serviceRequest: ComputerVisionServiceRequest): Promise<ComputerVisionDashboard> {
  const response = requireObject(await serviceRequest<unknown>("/api/computer-vision"), "Computer/Vision");
  if (!Array.isArray(response.capabilities)) throw new Error("Computer/Vision capability list is invalid.");
  return {
    capabilities: response.capabilities.map(parseCapability),
    computerUse: parseComputerUseStatus(response.computerUse),
    approvals: Array.isArray(response.approvals) ? response.approvals.map(parseApproval) : [],
    operations: Array.isArray(response.operations) ? response.operations.map(parseOperation) : [],
  };
}

export async function runAiriComputerUseRead(
  serviceRequest: ComputerVisionServiceRequest,
  operation: "observe" | "inspect-dom",
  target: ComputerUseTarget,
): Promise<unknown> {
  return serviceRequest(`/api/computer-vision/computer-use/${operation}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target }),
  });
}

export async function decideAiriComputerUseApproval(
  serviceRequest: ComputerVisionServiceRequest,
  approvalId: string,
  decision: "approve" | "deny",
): Promise<unknown> {
  return serviceRequest(`/api/computer-vision/computer-use/approvals/${encodeURIComponent(approvalId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision }),
  });
}

export async function testAiriComputerVisionCapability(
  serviceRequest: ComputerVisionServiceRequest,
  capability: ComputerVisionCapabilityId,
): Promise<ComputerVisionTestResult> {
  const response = requireObject(await serviceRequest<unknown>(
    `/api/computer-vision/${encodeURIComponent(capability)}/test`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
  ), "Computer/Vision test");
  const result = requireObject(response.result, "Computer/Vision test result");
  if (!["succeeded", "failed", "external-runtime-required"].includes(String(result.status))) {
    throw new Error("Computer/Vision test status is invalid.");
  }
  const error = result.error && typeof result.error === "object" && !Array.isArray(result.error)
    ? result.error as Record<string, unknown>
    : undefined;
  return {
    status: result.status as ComputerVisionTestResult["status"],
    capability: typeof result.capability === "string" ? result.capability : capability,
    error: error ? { message: typeof error.message === "string" ? error.message : undefined } : undefined,
  };
}

function parseVisionDetection(value: unknown): VisionDetection {
  const detection = requireObject(value, "Vision analysis detection");
  if (typeof detection.label !== "string" || detection.label.length === 0
    || typeof detection.confidence !== "number" || !Number.isFinite(detection.confidence)
    || detection.confidence < 0 || detection.confidence > 1) {
    throw new Error("Vision analysis detection is invalid.");
  }
  return { label: detection.label, confidence: detection.confidence };
}

function parseVisionInvocationResult(value: unknown): VisionInvocationResult {
  const response = requireObject(value, "Vision analysis");
  const result = requireObject(response.result, "Vision analysis result");
  const statuses: readonly VisionInvocationStatus[] = ["succeeded", "failed", "configuration-required", "external-runtime-required"];
  if (!statuses.includes(result.status as VisionInvocationStatus) || result.capability !== "vision-analysis") {
    throw new Error("Vision analysis status is invalid.");
  }
  const status = result.status as VisionInvocationStatus;
  const error = result.error === undefined ? undefined : requireObject(result.error, "Vision analysis error");
  if (status !== "succeeded") {
    if (result.result !== null) throw new Error("Vision analysis failure result is invalid.");
    if (status === "external-runtime-required" && error !== undefined) {
      throw new Error("Vision analysis external-runtime response is invalid.");
    }
    if ((status === "failed" || status === "configuration-required")
      && (!error || typeof error.message !== "string" || error.message.length === 0)) {
      throw new Error("Vision analysis error is invalid.");
    }
    return {
      status,
      capability: "vision-analysis",
      result: null,
      error: error ? {
        code: typeof error.code === "string" ? error.code : undefined,
        message: typeof error.message === "string" ? error.message : undefined,
      } : undefined,
    };
  }
  if (error !== undefined) throw new Error("Vision analysis success response is invalid.");
  const output = requireObject(result.result, "Vision analysis output");
  if (typeof output.summary !== "string" || !Array.isArray(output.detections)) {
    throw new Error("Vision analysis output is invalid.");
  }
  return {
    status,
    capability: "vision-analysis",
    result: { summary: output.summary, detections: output.detections.map(parseVisionDetection) },
    error: undefined,
  };
}

export async function invokeAiriLocalVisionAnalysis(
  serviceRequest: ComputerVisionServiceRequest,
  localPath: string,
  prompt?: string,
): Promise<VisionInvocationResult> {
  const input = { image: { localPath }, ...(prompt ? { prompt } : {}) };
  return parseVisionInvocationResult(await serviceRequest<unknown>("/api/computer-vision/vision-analysis/invoke", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input }),
  }));
}

function classifyVisionRequestFailure(reason: unknown): VisionInvocationStatus {
  const message = reason instanceof Error ? reason.message : "";
  if (/external runtime|adapter.+required/i.test(message)) return "external-runtime-required";
  return /trusted|scope|configured|configuration/i.test(message) ? "configuration-required" : "failed";
}

function fallbackCapability(id: ComputerVisionCapabilityId, name: string): ComputerVisionCapability {
  return {
    id,
    name,
    description: "",
    phase: "error",
    adapter: null,
    lastTest: null,
    lastError: { message: "Capability was not reported by the local service." },
  };
}

export function AiriComputerVisionPanel({ locale, serviceRequest }: AiriComputerVisionPanelProps) {
  const text = copy[locale];
  const titleId = useId();
  const [capabilities, setCapabilities] = useState<readonly ComputerVisionCapability[]>([]);
  const [computerUse, setComputerUse] = useState<ComputerUseStatus>(() => parseComputerUseStatus(undefined));
  const [approvals, setApprovals] = useState<readonly ComputerUseApproval[]>([]);
  const [operations, setOperations] = useState<readonly ComputerUseLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingId, setTestingId] = useState<ComputerVisionCapabilityId | null>(null);
  const [computerBusy, setComputerBusy] = useState("");
  const [localImagePath, setLocalImagePath] = useState("");
  const [visionPrompt, setVisionPrompt] = useState("");
  const [visionInvocation, setVisionInvocation] = useState<VisionInvocationState>({ phase: "external-runtime-required" });
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const dashboard = await loadAiriComputerVisionDashboard(serviceRequest);
      setCapabilities(dashboard.capabilities);
      setComputerUse(dashboard.computerUse);
      setApprovals(dashboard.approvals);
      setOperations(dashboard.operations);
      const vision = dashboard.capabilities.find((capability) => capability.id === "vision-analysis");
      setVisionInvocation({
        phase: !vision?.adapter
          ? "external-runtime-required"
          : vision.phase === "ready" ? "idle" : "configuration-required",
      });
    } catch {
      setError(text.loadError);
    } finally {
      setLoading(false);
    }
  }, [serviceRequest, text.loadError]);

  useEffect(() => { void load(); }, [load]);

  const testCapability = async (capability: ComputerVisionCapability) => {
    if (!capability.adapter || capability.phase !== "ready" || testingId) return;
    setTestingId(capability.id);
    setError("");
    try {
      const result = await testAiriComputerVisionCapability(serviceRequest, capability.id);
      if (result.status === "failed") setError(result.error?.message || text.loadError);
      await load();
    } catch {
      setError(text.loadError);
    } finally {
      setTestingId(null);
    }
  };

  const runRead = async (operation: "observe" | "inspect-dom", target: ComputerUseTarget) => {
    if (!computerUse.adapter || computerUse.phase !== "ready" || computerBusy) return;
    setComputerBusy(operation);
    setError("");
    try {
      await runAiriComputerUseRead(serviceRequest, operation, target);
      await load();
    } catch {
      setError(text.loadError);
    } finally {
      setComputerBusy("");
    }
  };

  const decideApproval = async (approvalId: string, decision: "approve" | "deny") => {
    if (computerBusy) return;
    setComputerBusy(approvalId);
    setError("");
    try {
      await decideAiriComputerUseApproval(serviceRequest, approvalId, decision);
      await load();
    } catch {
      setError(text.loadError);
    } finally {
      setComputerBusy("");
    }
  };

  const visionCapability = capabilities.find((capability) => capability.id === "vision-analysis");
  const canAnalyzeLocalImage = Boolean(
    visionCapability?.adapter && visionCapability.phase === "ready"
      && localImagePath.trim() && visionInvocation.phase !== "running",
  );

  const analyzeLocalImage = async () => {
    if (!canAnalyzeLocalImage) return;
    setVisionInvocation({ phase: "running" });
    try {
      const result = await invokeAiriLocalVisionAnalysis(serviceRequest, localImagePath.trim(), visionPrompt.trim() || undefined);
      setVisionInvocation({ phase: result.status, result: result.result });
    } catch (reason) {
      setVisionInvocation({ phase: classifyVisionRequestFailure(reason), result: null });
    }
  };

  return <section className="demo-airi-computer-vision" data-airi-control="computer-vision.status computer-vision.test computer-vision.vision-analysis computer-use.observe computer-use.inspect-dom computer-use.approve" aria-labelledby={titleId}>
    <header className="demo-airi-computer-vision__header">
      <div>
        <span className="demo-airi-computer-vision__eyebrow">{text.eyebrow}</span>
        <h2 id={titleId}>{text.title}</h2>
        <p>{text.description}</p>
      </div>
      <button aria-busy={loading} disabled={loading || testingId !== null} onClick={() => void load()} type="button">
        {loading ? text.refreshing : text.refresh}
      </button>
    </header>

    {loading && capabilities.length === 0
      ? <p className="demo-airi-computer-vision__notice" role="status" aria-live="polite">{text.loading}</p>
      : null}
    {error ? <p className="demo-airi-computer-vision__error" role="alert">{error}</p> : null}

    {!loading || capabilities.length > 0 ? <div className="demo-airi-computer-vision__grid" aria-live="polite" aria-busy={loading || testingId !== null}>
      {CAPABILITY_IDS.map((id) => {
        const capability = capabilities.find((item) => item.id === id)
          ?? fallbackCapability(id, text.fallbackNames[id]);
        const isTesting = testingId === id;
        const canTest = capability.adapter !== null && capability.phase === "ready" && testingId === null;
        const phaseLabel = text.states[capability.phase];
        const testLabel = capability.lastTest
          ? capability.lastTest.ok ? text.lastTestPassed : text.lastTestFailed
          : text.neverTested;
        return <article className="demo-airi-computer-vision__card" data-phase={capability.phase} key={id} aria-labelledby={`${titleId}-${id}`}>
          <div className="demo-airi-computer-vision__card-heading">
            <div><h3 id={`${titleId}-${id}`}>{capability.name || text.fallbackNames[id]}</h3><code>{id}</code></div>
            <span className="demo-airi-computer-vision__phase" data-phase={capability.phase} role="status">
              <span aria-hidden="true" />{phaseLabel}
            </span>
          </div>
          <p>{capability.description}</p>
          <dl>
            <div><dt>{text.adapter}</dt><dd>{capability.adapter?.pluginId || text.external}</dd></div>
            <div><dt>{text.test}</dt><dd>{testLabel}</dd></div>
          </dl>
          {capability.lastError?.message ? <p className="demo-airi-computer-vision__card-error" role="alert">{capability.lastError.message}</p> : null}
          {!capability.adapter ? <p className="demo-airi-computer-vision__external">{text.noAdapter}</p> : null}
          <button
            aria-label={`${text.test}: ${capability.name || text.fallbackNames[id]}`}
            disabled={!canTest}
            onClick={() => void testCapability(capability)}
            type="button"
          >{isTesting ? text.testing : text.test}</button>
        </article>;
      })}
    </div> : null}

    <section className="demo-airi-computer-vision__local-vision" aria-labelledby={`${titleId}-local-vision`}>
      <div className="demo-airi-computer-vision__section-heading">
        <div>
          <h3 id={`${titleId}-local-vision`}>{text.localVisionTitle}</h3>
          <p id={`${titleId}-local-vision-hint`}>{text.localVisionHint}</p>
        </div>
        <span className="demo-airi-computer-vision__vision-state" data-state={visionInvocation.phase} role="status" aria-live="polite">
          {text.visionStates[visionInvocation.phase]}
        </span>
      </div>
      <form onSubmit={(event) => { event.preventDefault(); void analyzeLocalImage(); }}>
        <label>
          <span>{text.localImagePath}</span>
          <input
            aria-describedby={`${titleId}-local-vision-hint`}
            autoComplete="off"
            maxLength={4096}
            onChange={(event) => setLocalImagePath(event.target.value)}
            placeholder={text.localImagePlaceholder}
            spellCheck={false}
            type="text"
            value={localImagePath}
          />
        </label>
        <label>
          <span>{text.analysisPrompt}</span>
          <textarea
            maxLength={4000}
            onChange={(event) => setVisionPrompt(event.target.value)}
            placeholder={text.analysisPromptPlaceholder}
            value={visionPrompt}
          />
        </label>
        <button aria-busy={visionInvocation.phase === "running"} disabled={!canAnalyzeLocalImage} type="submit">
          {visionInvocation.phase === "running" ? text.analyzing : text.analyze}
        </button>
      </form>
      {visionInvocation.phase === "succeeded" && visionInvocation.result ? <section className="demo-airi-computer-vision__vision-result" aria-labelledby={`${titleId}-local-vision-result`}>
        <h4 id={`${titleId}-local-vision-result`}>{text.analysisResult}</h4>
        <p>{visionInvocation.result.summary}</p>
        <strong>{text.detections}</strong>
        {visionInvocation.result.detections.length > 0 ? <ul>
          {visionInvocation.result.detections.map((detection, index) => <li key={`${detection.label}:${index}`}>
            <span>{detection.label}</span><span>{Math.round(detection.confidence * 100)}%</span>
          </li>)}
        </ul> : <p>{text.noDetections}</p>}
      </section> : null}
    </section>

    <section className="demo-airi-computer-vision__computer-use" aria-labelledby={`${titleId}-computer-use`}>
      <div className="demo-airi-computer-vision__section-heading">
        <div>
          <h3 id={`${titleId}-computer-use`}>{text.computerUse}</h3>
          <p>{text.computerUseHint}</p>
        </div>
        <span className="demo-airi-computer-vision__phase" data-phase={computerUse.phase} role="status">
          <span aria-hidden="true" />{text.states[computerUse.phase]}
        </span>
      </div>
      <dl className="demo-airi-computer-vision__computer-meta">
        <div><dt>{text.adapter}</dt><dd>{computerUse.adapter?.pluginId || text.external}</dd></div>
        <div><dt>{text.targets}</dt><dd>{computerUse.targets.length}</dd></div>
        <div><dt>{text.approvals}</dt><dd>{computerUse.pendingApprovals}</dd></div>
      </dl>
      {computerUse.lastError?.message ? <p className="demo-airi-computer-vision__card-error" role="alert">{computerUse.lastError.message}</p> : null}
      <ul className="demo-airi-computer-vision__targets" aria-label={text.targets}>
        {computerUse.targets.map((target) => <li key={`${target.kind}:${target.id}`}>
          <div><strong>{target.kind}</strong><code>{target.id}</code></div>
          <div>
            <button disabled={!computerUse.adapter || computerUse.phase !== "ready" || computerBusy !== ""} onClick={() => void runRead("observe", target)} type="button">
              {computerBusy === "observe" ? text.testing : text.observe}
            </button>
            <button disabled={!computerUse.adapter || computerUse.phase !== "ready" || computerBusy !== ""} onClick={() => void runRead("inspect-dom", target)} type="button">
              {computerBusy === "inspect-dom" ? text.testing : text.inspectDom}
            </button>
          </div>
        </li>)}
      </ul>

      <div className="demo-airi-computer-vision__approval-log">
        <section aria-labelledby={`${titleId}-approvals`}>
          <h4 id={`${titleId}-approvals`}>{text.approvals}</h4>
          {approvals.length === 0 ? <p>{text.noApprovals}</p> : <ul className="demo-airi-computer-vision__approvals" aria-live="polite">
            {approvals.map((approval) => <li key={approval.id}>
              <div>
                <strong>{approval.action.type}</strong>
                <small>{text.requestedBy}: {approval.callerPluginId}</small>
                <small>{approval.target.kind}: {approval.target.id}</small>
                <small>{text.expires}: {approval.expiresAt}</small>
              </div>
              <div>
                <button disabled={computerBusy !== ""} onClick={() => void decideApproval(approval.id, "approve")} type="button">{text.approve}</button>
                <button disabled={computerBusy !== ""} onClick={() => void decideApproval(approval.id, "deny")} type="button">{text.deny}</button>
              </div>
            </li>)}
          </ul>}
        </section>
        <section aria-labelledby={`${titleId}-operations`}>
          <h4 id={`${titleId}-operations`}>{text.operations}</h4>
          {operations.length === 0 ? <p>{text.noOperations}</p> : <ol className="demo-airi-computer-vision__operations">
            {operations.slice(-8).reverse().map((operation) => <li key={operation.id} data-status={operation.status}>
              <strong>{operation.type}</strong><span>{operation.status}</span><small>{operation.callerPluginId} · {operation.durationMs} ms</small>
            </li>)}
          </ol>}
        </section>
      </div>
    </section>
  </section>;
}
