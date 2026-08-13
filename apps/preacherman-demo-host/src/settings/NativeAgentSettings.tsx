import { useCallback, useEffect, useMemo, useState } from "react";
import type { Locale } from "../preferences";
import "./native-agent-settings.css";

export type NativeAgentServiceRequest = <T>(path: string, init?: RequestInit) => Promise<T>;

type NativeState = "configuration-required" | "error" | "external-runtime-required" | "loading" | "ready";

interface NativeModelOption {
  readonly id: string;
  readonly label: string;
  readonly state: Exclude<NativeState, "loading">;
}

interface NativeProviderOption {
  readonly id: string;
  readonly label: string;
  readonly state: Exclude<NativeState, "loading">;
  readonly models: readonly NativeModelOption[];
}

export interface NativeAgentStatus {
  readonly id: "preacherman-native";
  readonly label: string;
  readonly status: Exclude<NativeState, "loading">;
  readonly installed: boolean;
  readonly version: string | null;
  readonly auth: {
    readonly state: Exclude<NativeState, "loading">;
    readonly providerId?: string;
    readonly modelId?: string;
    readonly providers: readonly NativeProviderOption[];
  };
  readonly health: {
    readonly state: Exclude<NativeState, "loading">;
    readonly message?: string;
    readonly checkedAt?: string;
  };
  readonly capabilities: {
    readonly permissionPolicies: readonly string[];
    readonly [key: string]: unknown;
  };
  readonly harness: {
    readonly compatibilityVersion: string;
    readonly license: "MIT";
    readonly attribution: "Powered by DeepSeek Harness";
  };
  readonly gateway: { readonly state: Exclude<NativeState, "loading"> };
}

export interface NativeAgentDefaults {
  readonly agentId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly policy: string;
}

interface NativeAgentSettingsProps {
  readonly locale: Locale;
  readonly serviceRequest: NativeAgentServiceRequest;
}

const KNOWN_STATES = new Set<Exclude<NativeState, "loading">>([
  "ready", "configuration-required", "external-runtime-required", "error",
]);

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function state(value: unknown, fallback: Exclude<NativeState, "loading"> = "configuration-required"): Exclude<NativeState, "loading"> {
  return typeof value === "string" && KNOWN_STATES.has(value as Exclude<NativeState, "loading">)
    ? value as Exclude<NativeState, "loading">
    : fallback;
}

function parseModels(value: unknown): readonly NativeModelOption[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    const model = record(candidate);
    const id = text(model.id);
    if (!id) return [];
    return [{ id, label: text(model.label, id), state: state(model.state) }];
  });
}

function parseProviders(value: unknown): readonly NativeProviderOption[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    const provider = record(candidate);
    const id = text(provider.id);
    if (!id) return [];
    return [{ id, label: text(provider.label, id), state: state(provider.state), models: parseModels(provider.models) }];
  });
}

/** Normalizes only documented, display-safe fields from the Native status response. */
export function parseNativeAgentStatus(payload: unknown): NativeAgentStatus {
  const native = record(record(payload).native);
  const auth = record(native.auth);
  const health = record(native.health);
  const capabilities = record(native.capabilities);
  const harness = record(native.harness);
  const gateway = record(native.gateway);
  const permissionPolicies = Array.isArray(capabilities.permissionPolicies)
    ? capabilities.permissionPolicies.map((value) => text(value)).filter(Boolean)
    : [];
  return {
    id: "preacherman-native",
    label: text(native.label, "Preacherman Native"),
    status: state(native.status, native.installed === false ? "external-runtime-required" : "configuration-required"),
    installed: native.installed === true,
    version: text(native.version) || null,
    auth: {
      state: state(auth.state),
      providerId: text(auth.providerId) || undefined,
      modelId: text(auth.modelId) || undefined,
      providers: parseProviders(auth.providers),
    },
    health: {
      state: state(health.state),
      message: text(health.message) || undefined,
      checkedAt: text(health.checkedAt) || undefined,
    },
    capabilities: { ...capabilities, permissionPolicies },
    harness: {
      compatibilityVersion: text(harness.compatibilityVersion, "—"),
      license: "MIT",
      attribution: "Powered by DeepSeek Harness",
    },
    gateway: { state: state(gateway.state) },
  };
}

export function parseNativeAgentDefaults(payload: unknown): NativeAgentDefaults {
  const defaults = record(record(payload).defaults);
  return {
    agentId: text(defaults.agentId, "preacherman-native"),
    providerId: text(defaults.providerId),
    modelId: text(defaults.modelId),
    policy: text(defaults.policy),
  };
}

export function nativeDefaultsRequest(defaults: NativeAgentDefaults): RequestInit {
  return { method: "PUT", body: JSON.stringify({ defaults }) };
}

const copy = {
  en: {
    title: "Preacherman Native",
    intro: "The built-in agent for planned, approved work. Its execution engine stays replaceable and under Preacherman control.",
    installed: "Installation", version: "Installed version", compatibility: "Pinned compatibility", health: "Health",
    provider: "Provider", model: "Model", gateway: "MCP Gateway", defaults: "Default execution",
    defaultAgent: "Default Agent", permission: "Permission policy", refresh: "Check health", checking: "Checking…",
    save: "Save defaults", saving: "Saving…", ready: "Ready", notInstalled: "Not installed", configured: "Configured",
    notConfigured: "Configuration required", unavailable: "External runtime required", error: "Error", loading: "Reading Native status…",
    loadError: "Native status could not be loaded. Check the local service, then retry.",
    saved: "Native defaults saved.", noOptions: "No compatible option reported", currentOnly: "Current server default",
    attribution: "Powered by DeepSeek Harness", license: "DeepSeek Harness is provided under the MIT License.",
    notices: "Third-party notices", engineBoundary: "Harness provides the Agent loop; Preacherman owns approval, TaskRun, Ledger, and artifacts.",
    healthNever: "Not checked", retry: "Retry",
  },
  "zh-CN": {
    title: "Preacherman Native",
    intro: "用于规划、审批与执行工作的内置 Agent。执行内核可替换，并始终受 Preacherman 控制。",
    installed: "安装状态", version: "已安装版本", compatibility: "固定兼容版本", health: "健康状态",
    provider: "Provider", model: "模型", gateway: "MCP Gateway", defaults: "默认执行配置",
    defaultAgent: "默认 Agent", permission: "权限策略", refresh: "检查健康", checking: "检查中…",
    save: "保存默认项", saving: "保存中…", ready: "可用", notInstalled: "未安装", configured: "已配置",
    notConfigured: "需要配置", unavailable: "需要外部运行时", error: "异常", loading: "正在读取 Native 状态…",
    loadError: "无法读取 Native 状态。请检查本地服务后重试。",
    saved: "Native 默认项已保存。", noOptions: "服务端未报告兼容选项", currentOnly: "当前服务端默认项",
    attribution: "Powered by DeepSeek Harness", license: "DeepSeek Harness 根据 MIT License 提供。",
    notices: "第三方声明", engineBoundary: "Harness 提供 Agent 循环；审批、TaskRun、Ledger 与产物由 Preacherman 管理。",
    healthNever: "尚未检查", retry: "重试",
  },
} as const;

function stateLabel(value: Exclude<NativeState, "loading">, labels: typeof copy.en | typeof copy["zh-CN"]): string {
  if (value === "ready") return labels.ready;
  if (value === "external-runtime-required") return labels.unavailable;
  if (value === "error") return labels.error;
  return labels.notConfigured;
}

function optionsWithCurrent<T extends { readonly id: string; readonly label: string; readonly state?: string }>(options: readonly T[], current: string, fallback: string, createFallback: (id: string, label: string) => T): readonly T[] {
  if (!current || options.some((option) => option.id === current)) return options;
  return [createFallback(current, `${current} · ${fallback}`), ...options];
}

export function NativeAgentSettings({ locale, serviceRequest }: NativeAgentSettingsProps) {
  const labels = copy[locale];
  const [native, setNative] = useState<NativeAgentStatus | null>(null);
  const [defaults, setDefaults] = useState<NativeAgentDefaults | null>(null);
  const [draft, setDraft] = useState<NativeAgentDefaults | null>(null);
  const [loading, setLoading] = useState(true);
  const [operation, setOperation] = useState<"health" | "save" | "">("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError(""); setNotice("");
    try {
      const [statusPayload, defaultsPayload] = await Promise.all([
        serviceRequest<unknown>("/api/execution/native/status"),
        serviceRequest<unknown>("/api/execution/native/preferences"),
      ]);
      const nextDefaults = parseNativeAgentDefaults(defaultsPayload);
      setNative(parseNativeAgentStatus(statusPayload));
      setDefaults(nextDefaults); setDraft(nextDefaults);
    } catch (reason) {
      setError(reason instanceof Error && reason.message ? reason.message : labels.loadError);
    } finally { setLoading(false); }
  }, [labels.loadError, serviceRequest]);

  useEffect(() => { void load(); }, [load]);

  const providers = useMemo(() => optionsWithCurrent<NativeProviderOption>(native?.auth.providers ?? [], draft?.providerId ?? "", labels.currentOnly, (id, label) => ({ id, label, state: "configuration-required", models: [] })), [draft?.providerId, labels.currentOnly, native?.auth.providers]);
  const selectedProvider = providers.find((provider) => provider.id === draft?.providerId);
  const models = useMemo(() => optionsWithCurrent<NativeModelOption>(selectedProvider?.models ?? [], draft?.modelId ?? "", labels.currentOnly, (id, label) => ({ id, label, state: "configuration-required" })), [draft?.modelId, labels.currentOnly, selectedProvider]);
  const policies = useMemo(() => optionsWithCurrent(
    (native?.capabilities.permissionPolicies ?? []).map((id) => ({ id, label: id })),
    draft?.policy ?? "",
    labels.currentOnly,
    (id, label) => ({ id, label }),
  ), [draft?.policy, labels.currentOnly, native?.capabilities.permissionPolicies]);

  const checkHealth = async () => {
    setOperation("health"); setError(""); setNotice("");
    try {
      const response = await serviceRequest<unknown>("/api/execution/native/health", { method: "POST", body: "{}" });
      setNative(parseNativeAgentStatus(response));
    } catch (reason) { setError(reason instanceof Error ? reason.message : labels.loadError); }
    finally { setOperation(""); }
  };

  const save = async () => {
    if (!draft) return;
    setOperation("save"); setError(""); setNotice("");
    try {
      const response = await serviceRequest<unknown>("/api/execution/native/preferences", nativeDefaultsRequest(draft));
      const next = parseNativeAgentDefaults(response);
      setDefaults(next); setDraft(next); setNotice(labels.saved);
    } catch (reason) { setError(reason instanceof Error ? reason.message : labels.loadError); }
    finally { setOperation(""); }
  };

  if (loading) return <section aria-busy="true" aria-live="polite" className="native-agent-settings native-agent-settings--loading" data-state="loading"><span className="native-agent-settings__spinner" />{labels.loading}</section>;
  if (!native || !draft) return <section className="native-agent-settings native-agent-settings--error" data-state="error" role="alert"><strong>{labels.loadError}</strong>{error ? <p>{error}</p> : null}<button onClick={() => void load()} type="button">{labels.retry}</button></section>;

  const dirty = JSON.stringify(defaults) !== JSON.stringify(draft);
  const installedState = native.installed ? native.status : "external-runtime-required";
  const healthTime = native.health.checkedAt ? new Date(native.health.checkedAt).toLocaleString(locale) : labels.healthNever;

  return <section aria-labelledby="native-agent-settings-title" className="native-agent-settings" data-preacherman-control="execution.preacherman-native" data-state={native.status} tabIndex={-1}>
    <header className="native-agent-settings__hero">
      <div className="native-agent-settings__identity">
        <span aria-hidden="true" className="native-agent-settings__mark"><i /><i /><i /></span>
        <div><h2 id="native-agent-settings-title">{labels.title}</h2><p>{labels.intro}</p></div>
      </div>
      <span className="native-agent-settings__state" data-state={native.status}>{stateLabel(native.status, labels)}</span>
    </header>

    <div className="native-agent-settings__runtime" aria-label={locale === "zh-CN" ? "运行状态" : "Runtime status"}>
      <dl>
        <div><dt>{labels.installed}</dt><dd data-state={installedState}>{native.installed ? labels.ready : labels.notInstalled}</dd></div>
        <div><dt>{labels.version}</dt><dd>{native.version ?? "—"}</dd></div>
        <div><dt>{labels.compatibility}</dt><dd>{native.harness.compatibilityVersion}</dd></div>
        <div><dt>{labels.health}</dt><dd data-state={native.health.state}>{stateLabel(native.health.state, labels)}<small>{healthTime}</small></dd></div>
        <div><dt>{labels.provider}</dt><dd data-state={native.auth.state}>{native.auth.providerId || draft.providerId || labels.notConfigured}</dd></div>
        <div><dt>{labels.model}</dt><dd data-state={native.auth.state}>{native.auth.modelId || draft.modelId || labels.notConfigured}</dd></div>
        <div><dt>{labels.gateway}</dt><dd data-state={native.gateway.state}>{stateLabel(native.gateway.state, labels)}</dd></div>
      </dl>
      {native.health.message ? <p className="native-agent-settings__health-message">{native.health.message}</p> : null}
      <button className="native-agent-settings__secondary" disabled={operation !== ""} onClick={() => void checkHealth()} type="button">{operation === "health" ? labels.checking : labels.refresh}</button>
    </div>

    <form className="native-agent-settings__defaults" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <h3>{labels.defaults}</h3>
      <div className="native-agent-settings__fields">
        <label><span>{labels.defaultAgent}</span><select disabled value={draft.agentId}><option value="preacherman-native">Preacherman Native</option></select></label>
        <label><span>{labels.provider}</span><select disabled={!providers.length || operation !== ""} onChange={(event) => {
          const provider = providers.find((candidate) => candidate.id === event.target.value);
          const nextModel = provider?.models.find((model) => model.state === "ready")?.id ?? provider?.models[0]?.id ?? "";
          setDraft({ ...draft, providerId: event.target.value, modelId: nextModel });
        }} value={draft.providerId}>{providers.length ? providers.map((provider) => <option disabled={provider.state !== "ready" && provider.id !== draft.providerId} key={provider.id} value={provider.id}>{provider.label}</option>) : <option value="">{labels.noOptions}</option>}</select></label>
        <label><span>{labels.model}</span><select disabled={!models.length || operation !== ""} onChange={(event) => setDraft({ ...draft, modelId: event.target.value })} value={draft.modelId}>{models.length ? models.map((model) => <option disabled={model.state !== "ready" && model.id !== draft.modelId} key={model.id} value={model.id}>{model.label}</option>) : <option value="">{labels.noOptions}</option>}</select></label>
        <label><span>{labels.permission}</span><select disabled={!policies.length || operation !== ""} onChange={(event) => setDraft({ ...draft, policy: event.target.value })} value={draft.policy}>{policies.length ? policies.map((policy) => <option key={policy.id} value={policy.id}>{policy.label}</option>) : <option value="">{labels.noOptions}</option>}</select></label>
      </div>
      <button className="native-agent-settings__primary" disabled={!dirty || operation !== ""} type="submit">{operation === "save" ? labels.saving : labels.save}</button>
    </form>

    {error ? <p className="native-agent-settings__feedback" data-kind="error" role="alert">{error}</p> : null}
    {notice ? <p className="native-agent-settings__feedback" data-kind="status" role="status">{notice}</p> : null}

    <footer className="native-agent-settings__license">
      <div><strong>{labels.attribution}</strong><p>{labels.engineBoundary}</p><small>{labels.license} <span title="docs/third-party/deepseek-harness.md">{labels.notices}</span></small></div>
      <span>MIT</span>
    </footer>
  </section>;
}
