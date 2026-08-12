import { useCallback, useEffect, useState } from "react";
import type { Locale } from "../preferences";
import "./preacherman-observability-panel.css";

export type PreachermanObservabilityServiceRequest = <T>(path: string, init?: RequestInit) => Promise<T>;

interface InspectorPlugin {
  readonly id: string;
  readonly name: string;
  readonly manifest: Readonly<Record<string, unknown>>;
  readonly phase: string;
  readonly revision: number;
  readonly kits: readonly string[];
  readonly bindings: readonly string[];
  readonly tools: readonly { readonly name: string; readonly description: string; readonly requiresApproval: boolean }[];
  readonly error: string | null;
}

interface IoTrace {
  readonly id: string;
  readonly recordedAt: string;
  readonly caller: string;
  readonly target: string;
  readonly durationMs: number;
  readonly status: "succeeded" | "failed";
  readonly input: unknown;
  readonly result: unknown;
  readonly error: unknown;
}

interface PluginActivity {
  readonly id: string;
  readonly recordedAt: string;
  readonly pluginId: string;
  readonly phase: string;
  readonly revision: number;
  readonly message: string;
  readonly error: unknown;
}

export interface PreachermanObservabilitySnapshot {
  readonly plugins: readonly InspectorPlugin[];
  readonly traces: readonly IoTrace[];
  readonly activity: readonly PluginActivity[];
  readonly diagnostics: {
    readonly traceCount: number;
    readonly failureCount: number;
    readonly averageDurationMs: number;
    readonly pluginErrorCount: number;
    readonly recentFailures: readonly unknown[];
  };
}

function parseSnapshot(value: unknown): PreachermanObservabilitySnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Observability service returned an invalid response.");
  const candidate = value as Partial<PreachermanObservabilitySnapshot>;
  if (!Array.isArray(candidate.plugins) || !Array.isArray(candidate.traces) || !Array.isArray(candidate.activity)) {
    throw new Error("Observability service response is missing history collections.");
  }
  if (!candidate.diagnostics || typeof candidate.diagnostics !== "object" || Array.isArray(candidate.diagnostics)) {
    throw new Error("Observability service response is missing diagnostics.");
  }
  return candidate as PreachermanObservabilitySnapshot;
}

export async function loadPreachermanObservability(serviceRequest: PreachermanObservabilityServiceRequest) {
  return parseSnapshot(await serviceRequest<unknown>("/api/observability"));
}

const copy = {
  en: {
    eyebrow: "Preacherman observability",
    title: "Runtime inspector",
    description: "Inspect plugin contracts, sanitized IO traces, failures, and real lifecycle activity.",
    refresh: "Refresh",
    refreshing: "Refreshing…",
    loading: "Loading runtime history…",
    plugins: "Plugin Inspector",
    traces: "IO Trace",
    activity: "Plugin activity",
    noPlugins: "No plugin sessions reported.",
    noTraces: "No calls have been traced yet.",
    noActivity: "No lifecycle activity recorded yet.",
    calls: "calls",
    failures: "failures",
    average: "average",
    pluginErrors: "plugin errors",
    manifest: "Manifest",
    kits: "Kits",
    bindings: "Bindings",
    tools: "Tools",
    none: "None",
    approval: "approval",
    details: "Sanitized details",
    errorPrefix: "Observability error",
  },
  "zh-CN": {
    eyebrow: "Preacherman 可观测性",
    title: "运行时检查器",
    description: "检查插件契约、已脱敏的 IO 调用、失败诊断与真实生命周期活动。",
    refresh: "刷新",
    refreshing: "正在刷新…",
    loading: "正在加载运行历史…",
    plugins: "插件检查器",
    traces: "IO 追踪",
    activity: "插件活动",
    noPlugins: "当前没有插件会话。",
    noTraces: "尚未记录工具调用。",
    noActivity: "尚未记录生命周期活动。",
    calls: "次调用",
    failures: "次失败",
    average: "平均耗时",
    pluginErrors: "个插件错误",
    manifest: "清单",
    kits: "能力包",
    bindings: "绑定",
    tools: "工具",
    none: "无",
    approval: "需审批",
    details: "已脱敏详情",
    errorPrefix: "可观测性错误",
  },
} as const;

function formatTime(value: string, locale: Locale) {
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? value : timestamp.toLocaleString(locale);
}

function formatDetails(value: unknown) {
  return JSON.stringify(value, null, 2) ?? "null";
}

export function PreachermanObservabilityPanel({
  locale,
  serviceRequest,
}: {
  readonly locale: Locale;
  readonly serviceRequest: PreachermanObservabilityServiceRequest;
}) {
  const text = copy[locale];
  const [snapshot, setSnapshot] = useState<PreachermanObservabilitySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setSnapshot(await loadPreachermanObservability(serviceRequest));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, [serviceRequest]);

  useEffect(() => { void refresh(); }, [refresh]);

  return <section className="demo-preacherman-observability" data-preacherman-control="runtime.plugin-inspector runtime.io-tracer plugin.activity" aria-labelledby="preacherman-observability-title">
    <header className="demo-preacherman-observability__header">
      <div>
        <span>{text.eyebrow}</span>
        <h2 id="preacherman-observability-title">{text.title}</h2>
        <p>{text.description}</p>
      </div>
      <button disabled={loading} onClick={() => void refresh()} type="button">{loading ? text.refreshing : text.refresh}</button>
    </header>

    {snapshot ? <dl className="demo-preacherman-observability__summary">
      <div><dt>{text.calls}</dt><dd>{snapshot.diagnostics.traceCount}</dd></div>
      <div data-error={snapshot.diagnostics.failureCount > 0}><dt>{text.failures}</dt><dd>{snapshot.diagnostics.failureCount}</dd></div>
      <div><dt>{text.average}</dt><dd>{snapshot.diagnostics.averageDurationMs} ms</dd></div>
      <div data-error={snapshot.diagnostics.pluginErrorCount > 0}><dt>{text.pluginErrors}</dt><dd>{snapshot.diagnostics.pluginErrorCount}</dd></div>
    </dl> : null}

    {loading && !snapshot ? <p className="demo-preacherman-observability__empty" aria-live="polite">{text.loading}</p> : null}
    {error ? <p className="demo-preacherman-observability__error" role="alert"><strong>{text.errorPrefix}:</strong> {error}</p> : null}

    {snapshot ? <div className="demo-preacherman-observability__columns">
      <section className="demo-preacherman-observability__section" aria-labelledby="preacherman-plugin-inspector-title">
        <h3 id="preacherman-plugin-inspector-title">{text.plugins}</h3>
        {snapshot.plugins.length === 0 ? <p className="demo-preacherman-observability__empty">{text.noPlugins}</p> : <div className="demo-preacherman-observability__plugins">
          {snapshot.plugins.map((plugin) => <article key={plugin.id} data-state={plugin.error ? "error" : plugin.phase}>
            <header><strong>{plugin.name}</strong><span>{plugin.phase} · r{plugin.revision}</span></header>
            <dl>
              <div><dt>{text.kits}</dt><dd>{plugin.kits.join(" · ") || text.none}</dd></div>
              <div><dt>{text.bindings}</dt><dd>{plugin.bindings.join(" · ") || text.none}</dd></div>
              <div><dt>{text.tools}</dt><dd>{plugin.tools.map((tool) => `${tool.name}${tool.requiresApproval ? ` (${text.approval})` : ""}`).join(" · ") || text.none}</dd></div>
            </dl>
            {plugin.error ? <p className="demo-preacherman-observability__plugin-error" role="alert">{plugin.error}</p> : null}
            <details><summary>{text.manifest}</summary><pre>{formatDetails(plugin.manifest)}</pre></details>
          </article>)}
        </div>}
      </section>

      <section className="demo-preacherman-observability__section" aria-labelledby="preacherman-io-trace-title">
        <h3 id="preacherman-io-trace-title">{text.traces}</h3>
        {snapshot.traces.length === 0 ? <p className="demo-preacherman-observability__empty">{text.noTraces}</p> : <ol className="demo-preacherman-observability__timeline">
          {snapshot.traces.map((trace) => <li key={trace.id} data-status={trace.status}>
            <header><strong>{trace.caller} → {trace.target}</strong><span>{trace.durationMs} ms</span></header>
            <time dateTime={trace.recordedAt}>{formatTime(trace.recordedAt, locale)}</time>
            <details><summary>{text.details}</summary><pre>{formatDetails({ input: trace.input, result: trace.result, error: trace.error })}</pre></details>
          </li>)}
        </ol>}
      </section>

      <section className="demo-preacherman-observability__section" aria-labelledby="preacherman-plugin-activity-title">
        <h3 id="preacherman-plugin-activity-title">{text.activity}</h3>
        {snapshot.activity.length === 0 ? <p className="demo-preacherman-observability__empty">{text.noActivity}</p> : <ol className="demo-preacherman-observability__timeline">
          {snapshot.activity.map((entry) => <li key={entry.id} data-status={entry.error ? "failed" : "succeeded"}>
            <header><strong>{entry.pluginId}</strong><span>{entry.phase} · r{entry.revision}</span></header>
            <time dateTime={entry.recordedAt}>{formatTime(entry.recordedAt, locale)}</time>
            <p>{entry.message}</p>
            {entry.error ? <pre>{formatDetails(entry.error)}</pre> : null}
          </li>)}
        </ol>}
      </section>
    </div> : null}
  </section>;
}
