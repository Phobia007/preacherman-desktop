import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { Appearance, Locale } from "../preferences";
import "./settings-menu.css";

interface SettingsScreenProps {
  readonly appearance: Appearance;
  readonly locale: Locale;
  readonly onAppearanceChange: (appearance: Appearance) => void;
  readonly onLocaleChange: (locale: Locale) => void;
  readonly requestedControl?: string | null;
  readonly widgets?: ReactNode;
}

// Extend the existing directory language: portrait first, then one descending
// wave of text to the model's right. Selection is local; detail views come later.
export const settingsMenuItems = [
  "执行模式", "指令 / 规则", "记忆", "媒体生成提供商", "外部 MCP", "连接器",
  "MCP 服务器", "界面语言", "外观", "设计评审团", "通知", "宠物",
  "设计系统", "项目位置", "隐私", "关于",
] as const;

export function SettingsScreen({ locale }: SettingsScreenProps) {
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const timer = window.setTimeout(() => setReady(true), reducedMotion.matches ? 0 : 650);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <main
      aria-label={locale === "zh-CN" ? "设置" : "Settings"}
      className="demo-host settings-menu"
      data-settings-state={ready ? "ready" : "framing"}
    >
      <nav aria-label="设置首选项" className="settings-menu__list" lang="zh-CN">
        {settingsMenuItems.map((label, index) => (
          <div className="settings-menu__row" key={label} style={{ "--settings-order": index } as CSSProperties}>
            <button
              aria-pressed={selected === label}
              className="settings-menu__item"
              disabled={!ready}
              onClick={() => setSelected(label)}
              type="button"
            >
              {label}
            </button>
          </div>
        ))}
      </nav>
    </main>
  );
}
