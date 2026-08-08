import { useEffect, useState } from "react";
import type { Locale } from "../preferences";
import {
  invokeAiriCapability,
  loadAiriCapabilityStatuses,
  type AiriBackendState,
  type AiriCapabilityStatus,
} from "./capabilityClient";
import {
  featurePlacementForSurface,
  type DemoSurfaceType,
} from "./featurePlacement";
import "./airi-feature-panel.css";

const surfaceTitles: Record<DemoSurfaceType, { readonly en: string; readonly "zh-CN": string }> = {
  home: { en: "Companion", "zh-CN": "数字伙伴" },
  workspace: { en: "Agent work", "zh-CN": "智能体工作" },
  lab: { en: "Voice & body", "zh-CN": "声音与身体" },
  market: { en: "Identity", "zh-CN": "角色身份" },
  test: { en: "Diagnostics", "zh-CN": "功能诊断" },
  ledger: { en: "Memory & history", "zh-CN": "记忆与历史" },
  settings: { en: "Connections", "zh-CN": "连接设置" },
};

export function AiriFeaturePanel({
  locale,
  onActivate,
  surface,
}: {
  readonly locale: Locale;
  readonly onActivate: (featureId: string) => boolean;
  readonly surface: DemoSurfaceType;
}) {
  const placement = featurePlacementForSurface(surface);
  const [selectedId, setSelectedId] = useState("");
  const [activationState, setActivationState] = useState<"idle" | "focused" | "executed" | "unavailable">("idle");
  const [backendState, setBackendState] = useState<AiriBackendState | "checking" | "error" | "idle">("idle");
  const [backendMessage, setBackendMessage] = useState("");
  const [capabilityStatuses, setCapabilityStatuses] = useState<Readonly<Record<string, AiriCapabilityStatus>>>({});
  const selected = placement.features.find((candidate) => candidate.id === selectedId);
  const chinese = locale === "zh-CN";
  const selectedRuntimeState = selected ? capabilityStatuses[selected.id]?.state : undefined;
  const connectedCount = placement.features.filter((candidate) => {
    const state = capabilityStatuses[candidate.id]?.state;
    return state === "available" || state === "client-runtime";
  }).length;

  useEffect(() => {
    let current = true;
    setCapabilityStatuses({});
    void loadAiriCapabilityStatuses(placement.features.map((feature) => feature.id), locale)
      .then((statuses) => {
        if (!current) return;
        setCapabilityStatuses(Object.fromEntries(statuses.map((status) => [status.capabilityId, status])));
      })
      .catch(() => {
        if (current) setCapabilityStatuses({});
      });
    return () => { current = false; };
  }, [locale, placement]);

  const activateFeature = (candidate: (typeof placement.features)[number]) => {
    setSelectedId(candidate.id);
    const activated = onActivate(candidate.id);
    const state = capabilityStatuses[candidate.id]?.state;
    const connected = state === "available" || state === "client-runtime";
    setActivationState(activated ? "focused" : connected ? "unavailable" : "idle");
    setBackendState("checking");
    setBackendMessage(chinese ? "正在检查后端适配器…" : "Checking backend adapter…");
    void invokeAiriCapability(candidate.id, surface, locale).then((event) => {
      setBackendState(event.execution?.status === "failed" ? "error" : event.state);
      if (event.execution?.status === "succeeded") setActivationState("executed");
      setBackendMessage(event.message);
    }).catch((reason: Error) => {
      setBackendState("error");
      setBackendMessage(reason.message);
    });
  };

  const featureButtons = (featureIds: readonly string[], priority: "primary" | "normal") => (
    <div className="demo-airi-panel__grid">
      {featureIds.map((featureId) => {
        const candidate = placement.features.find((feature) => feature.id === featureId);
        if (!candidate) return null;
        const runtimeStatus = capabilityStatuses[candidate.id]?.state ?? "checking";
        const runtimeLabel = runtimeStatus === "available"
          ? (chinese ? "可用" : "Live")
          : runtimeStatus === "client-runtime"
            ? (chinese ? "前端" : "Client")
            : runtimeStatus === "configuration-required"
              ? (chinese ? "配置" : "Setup")
              : runtimeStatus === "external-runtime-required"
                ? (chinese ? "外部" : "External")
                : (chinese ? "检查" : "Check");
        return (
          <button
            aria-pressed={candidate.id === selected?.id}
            className="demo-airi-panel__feature"
            data-priority={priority}
            data-status={runtimeStatus}
            data-tone={["presentation.stop", "task.cancel"].includes(candidate.id) ? "danger" : "default"}
            key={candidate.id}
            onClick={() => activateFeature(candidate)}
            type="button"
          >
            <span aria-hidden="true" className="demo-airi-panel__status" />
            <span>{candidate.label[locale]}</span>
            <small className="demo-airi-panel__runtime-label">{runtimeLabel}</small>
          </button>
        );
      })}
    </div>
  );

  return (
    <aside
      aria-label={chinese ? "AIRI 功能" : "AIRI features"}
      className="demo-airi-panel"
      data-surface={surface}
    >
      <header className="demo-airi-panel__header">
        <span>AIRI · PREACHERMAN</span>
        <h2>{surfaceTitles[surface][locale]}</h2>
        <p>{chinese ? "完整能力入口已归入当前页面；可先测试，再按需删减。" : "The complete capability set is here for testing and later pruning."}</p>
        <div className="demo-airi-panel__summary">
          <strong>{connectedCount}</strong> {chinese ? "项已连接" : "connected"}
          <span aria-hidden="true">·</span>
          <strong>{placement.features.length}</strong> {chinese ? "项能力" : "capabilities"}
        </div>
      </header>
      <div aria-label={chinese ? `${surfaceTitles[surface][locale]}功能` : `${surfaceTitles[surface][locale]} capabilities`} className="demo-airi-panel__body">
        {placement.sections.map((candidateSection) => {
          const isDisclosure = candidateSection.kind === "extension" || candidateSection.kind === "system";
          const sectionHeader = (
            <span className="demo-airi-panel__section-title">
              <span>{candidateSection.title[locale]}</span>
              <small>{candidateSection.featureIds.length}</small>
            </span>
          );
          if (isDisclosure) {
            return (
              <details className="demo-airi-panel__section demo-airi-panel__section--disclosure" data-kind={candidateSection.kind} key={candidateSection.id}>
                <summary>{sectionHeader}</summary>
                {featureButtons(candidateSection.featureIds, "normal")}
              </details>
            );
          }
          return (
            <section className="demo-airi-panel__section" data-kind={candidateSection.kind} key={candidateSection.id}>
              <header>{sectionHeader}</header>
              {featureButtons(candidateSection.featureIds, candidateSection.kind === "primary" ? "primary" : "normal")}
            </section>
          );
        })}
      </div>
      {selected ? (
        <footer className="demo-airi-panel__detail" aria-live="polite">
          <strong>{selected.label[locale]}</strong>
          <code>{selected.id}</code>
          <span data-status={selectedRuntimeState ?? "checking"}>
            {activationState === "executed"
              ? (chinese ? "已通过连接的后端执行" : "Executed by the connected backend")
              : activationState === "focused"
                ? (chinese ? "已定位到对应页面或控件" : "Opened the related surface or control")
                : selectedRuntimeState === "available"
                  ? (chinese ? "后端已连接" : "Backend available")
                  : selectedRuntimeState === "client-runtime"
                    ? (chinese ? "由前端运行时执行" : "Handled by the client runtime")
                    : selectedRuntimeState === "configuration-required"
                      ? (chinese ? "需要完成配置" : "Configuration required")
                      : selectedRuntimeState === "external-runtime-required"
                        ? (chinese ? "需要外部运行时" : "External runtime required")
                        : (chinese ? "正在检查实际状态" : "Checking runtime status")}
          </span>
          <span data-backend-state={backendState}>
            {backendMessage || (chinese ? "点击后检查后端状态" : "Click to inspect backend state")}
          </span>
        </footer>
      ) : null}
    </aside>
  );
}
