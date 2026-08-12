import { useCallback, useEffect, useState } from "react";
import type { Locale } from "../preferences";
import "./preacherman-execution-card.css";

type ProviderState = "configuration-required" | "disabled" | "error" | "ready" | "unreachable";

interface PreachermanExecutionProvider {
  readonly id: "preacherman-execution";
  readonly state: ProviderState;
  readonly message: string;
  readonly runtime?: { readonly phase?: string; readonly connectedWorkers?: number; readonly connectedNodes?: number };
  readonly workflow?: { readonly id?: string; readonly revision?: number; readonly canonicalHash?: string };
  readonly profile?: string;
  readonly connection?: { readonly managerAddress?: string; readonly lastConnectedAt?: string; readonly lastError?: { readonly code?: string; readonly at?: string } };
}

interface PreachermanExecutionWorkflowCatalog {
  readonly workflowId: string;
  readonly expectedRevision: number;
  readonly expectedCanonicalHash: string;
  readonly workflows: readonly { readonly id: string; readonly revision: number; readonly canonicalHash: string; readonly pinned: boolean }[];
}

export function PreachermanExecutionCard({ locale, serviceRequest }: {
  readonly locale: Locale;
  readonly serviceRequest: <T>(path: string, init?: RequestInit) => Promise<T>;
}) {
  const chinese = locale === "zh-CN";
  const [provider, setProvider] = useState<PreachermanExecutionProvider | null>(null);
  const [catalog, setCatalog] = useState<PreachermanExecutionWorkflowCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const response = await serviceRequest<{ providers: readonly PreachermanExecutionProvider[] }>("/api/execution/providers/status");
      const next = response.providers.find((candidate) => candidate.id === "preacherman-execution");
      if (!next) throw new Error("Preacherman execution status is missing.");
      setProvider(next);
      if (!new Set<ProviderState>(["unreachable", "disabled", "error"]).has(next.state)) {
        setCatalog(await serviceRequest<PreachermanExecutionWorkflowCatalog>("/api/execution/providers/preacherman-execution/workflows"));
      } else setCatalog(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to inspect Preacherman execution.");
    } finally { setLoading(false); }
  }, [serviceRequest]);
  useEffect(() => { void refresh(); }, [refresh]);

  const stateLabel: Record<ProviderState, string> = chinese
    ? { ready: "可执行", "configuration-required": "需要配置", unreachable: "无法连接", disabled: "已停用", error: "异常" }
    : { ready: "Ready", "configuration-required": "Configuration required", unreachable: "Unreachable", disabled: "Disabled", error: "Error" };

  return <section className="preacherman-execution-card" data-preacherman-control="execution.preacherman-execution" tabIndex={-1}>
    <header>
      <div><span>{chinese ? "复杂任务执行服务" : "Complex task execution"}</span><h3>Preacherman Execution</h3></div>
      <span className="preacherman-execution-card__state" data-state={provider?.state ?? (error ? "error" : "loading")}>{loading ? (chinese ? "检查中" : "Checking") : provider ? stateLabel[provider.state] : (chinese ? "不可用" : "Unavailable")}</span>
    </header>
    <p>{provider?.message ?? error ?? (chinese ? "正在读取执行服务状态。" : "Reading execution service status.")}</p>
    {provider ? <dl>
      <div><dt>{chinese ? "执行节点" : "Nodes"}</dt><dd>{provider.runtime?.connectedNodes ?? 0}</dd></div>
      <div><dt>{chinese ? "活动 Worker" : "Active workers"}</dt><dd>{provider.runtime?.connectedWorkers ?? 0}</dd></div>
      <div><dt>{chinese ? "运行阶段" : "Runtime phase"}</dt><dd>{provider.runtime?.phase ?? "—"}</dd></div>
      <div><dt>{chinese ? "工作流" : "Workflow"}</dt><dd>{provider.workflow?.id ?? "—"}</dd></div>
      <div><dt>{chinese ? "版本" : "Revision"}</dt><dd>{provider.workflow?.revision ?? "—"}</dd></div>
      <div><dt>{chinese ? "固定哈希" : "Pinned hash"}</dt><dd title={provider.workflow?.canonicalHash}>{provider.workflow?.canonicalHash?.slice(0, 12) ?? "—"}</dd></div>
      <div><dt>{chinese ? "目录校验" : "Catalog check"}</dt><dd>{catalog?.workflows.some((workflow) => workflow.pinned) ? (chinese ? "已固定" : "Pinned") : (chinese ? "不匹配" : "Mismatch")}</dd></div>
      <div><dt>{chinese ? "运行配置" : "Runtime profile"}</dt><dd>{provider.profile ?? (chinese ? "未配置" : "Not configured")}</dd></div>
      <div><dt>{chinese ? "本地执行服务" : "Local execution service"}</dt><dd>{provider.connection?.managerAddress ?? "—"}</dd></div>
      <div><dt>{chinese ? "最近连接" : "Last connected"}</dt><dd>{provider.connection?.lastConnectedAt ? new Date(provider.connection.lastConnectedAt).toLocaleString(locale) : "—"}</dd></div>
      {provider.connection?.lastError ? <div><dt>{chinese ? "最近错误" : "Last error"}</dt><dd>{provider.connection.lastError.code ?? "—"}</dd></div> : null}
    </dl> : null}
    <footer>
      <button disabled={loading} onClick={() => void refresh()} type="button">{chinese ? "测试连接并刷新" : "Test connection & refresh"}</button>
    </footer>
    <small>{chinese ? "空闲时 0 个 Worker 属于正常状态；在线执行节点、固定工作流和运行配置共同决定是否可执行。" : "Zero workers while idle is normal. Readiness requires an online node, the pinned workflow, and a runtime profile."}</small>
  </section>;
}
