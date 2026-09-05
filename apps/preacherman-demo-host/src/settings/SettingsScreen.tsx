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
  "Execution Mode", "Instructions / Rules", "Memory", "Media Providers", "External MCP", "Connectors",
  "MCP Servers", "Language", "Appearance", "Design Council", "Notifications", "Pets",
  "Design System", "Project Location", "Privacy", "About",
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
      <nav aria-label="Settings preferences" className="settings-menu__list" lang="en">
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
