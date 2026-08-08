import { useState } from "react";
import type { Locale } from "../preferences";
import { invokeAiriCapability, type AiriBackendState } from "./capabilityClient";
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
  const selected = placement.features.find((candidate) => candidate.id === selectedId);
  const chinese = locale === "zh-CN";
  const connectedCount = placement.features.filter((candidate) => candidate.status === "live").length;

  const activateFeature = (candidate: (typeof placement.features)[number]) => {
    setSelectedId(candidate.id);
    const activated = onActivate(candidate.id);
    setActivationState(activated ? "focused" : candidate.status === "live" ? "unavailable" : "idle");
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
        return (
          <button
            aria-pressed={candidate.id === selected?.id}
            className="demo-airi-panel__feature"
            data-priority={priority}
            data-status={candidate.status}
            data-tone={["presentation.stop", "task.cancel"].includes(candidate.id) ? "danger" : "default"}
            key={candidate.id}
            onClick={() => activateFeature(candidate)}
            type="button"
          >
            <span aria-hidden="true" className="demo-airi-panel__status" />
            <span>{candidate.label[locale]}</span>
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
          <span data-status={selected.status}>
            {selected.status === "live"
              ? activationState === "executed"
                ? (chinese ? "已通过连接的后端执行" : "Executed by the connected backend")
                : activationState === "focused"
                  ? (chinese ? "已定位到对应控件" : "Control focused")
                  : activationState === "unavailable"
                    ? (chinese ? "已接入 · 当前状态下暂不可用" : "Connected · unavailable in the current state")
                    : (chinese ? "已接入当前 Demo" : "Connected in this demo")
              : activationState === "focused"
                ? (chinese ? "已跳转到相关页面或控件" : "Opened the related surface or control")
                : (chinese ? "入口已集成 · 等待运行时或 Provider" : "Entry integrated · runtime or provider required")}
          </span>
          <span data-backend-state={backendState}>
            {backendMessage || (chinese ? "点击后检查后端状态" : "Click to inspect backend state")}
          </span>
        </footer>
      ) : null}
    </aside>
  );
}
