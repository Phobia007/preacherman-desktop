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
  const [loading, setLoading] = useState(true);
  const [testingId, setTestingId] = useState<ComputerVisionCapabilityId | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setCapabilities(await loadAiriComputerVision(serviceRequest));
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

  return <section className="demo-airi-computer-vision" data-airi-control="computer-vision.status computer-vision.test" aria-labelledby={titleId}>
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
  </section>;
}
