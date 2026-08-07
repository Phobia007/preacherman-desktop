import { useState } from "react";
import type { Locale } from "../preferences";
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
  const [selectedId, setSelectedId] = useState(placement.features[0]?.id ?? "");
  const [activationState, setActivationState] = useState<"idle" | "focused" | "unavailable">("idle");
  const selected = placement.features.find((candidate) => candidate.id === selectedId) ?? placement.features[0];
  const chinese = locale === "zh-CN";

  return (
    <aside
      aria-label={chinese ? "AIRI 功能" : "AIRI features"}
      className="demo-airi-panel"
      data-surface={surface}
    >
      <header className="demo-airi-panel__header">
        <span>AIRI · PREACHERMAN</span>
        <h2>{surfaceTitles[surface][locale]}</h2>
        <p>{chinese ? "功能入口已经归入当前页面。" : "AIRI capabilities assigned to this surface."}</p>
      </header>
      <div className="demo-airi-panel__grid" role="group">
        {placement.features.map((candidate) => (
          <button
            aria-pressed={candidate.id === selected?.id}
            className="demo-airi-panel__feature"
            data-status={candidate.status}
            key={candidate.id}
            onClick={() => {
              setSelectedId(candidate.id);
              setActivationState(candidate.status === "live"
                ? (onActivate(candidate.id) ? "focused" : "unavailable")
                : "idle");
            }}
            type="button"
          >
            <span aria-hidden="true" className="demo-airi-panel__status" />
            <span>{candidate.label[locale]}</span>
          </button>
        ))}
      </div>
      {selected ? (
        <footer className="demo-airi-panel__detail" aria-live="polite">
          <strong>{selected.label[locale]}</strong>
          <span data-status={selected.status}>
            {selected.status === "live"
              ? activationState === "focused"
                ? (chinese ? "已定位到对应控件" : "Control focused")
                : activationState === "unavailable"
                  ? (chinese ? "已接入 · 当前状态下暂不可用" : "Connected · unavailable in the current state")
                  : (chinese ? "已接入当前 Demo" : "Connected in this demo")
              : (chinese ? "界面已就绪 · 等待运行时接线" : "UI ready · runtime connection follows")}
          </span>
        </footer>
      ) : null}
    </aside>
  );
}
