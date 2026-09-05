import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { Appearance, Locale } from "../preferences";
import "./settings-menu.css";
import { ExecutionModeSettings } from "./ExecutionModeSettings";

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
  const [selected, setSelected] = useState<{ label: string; x: number; y: number; width: number; height: number } | null>(null);
  const surfaceRef = useRef<HTMLElement>(null);
  const focusedButtonRef = useRef<HTMLButtonElement>(null);
  const returnButtonRef = useRef<HTMLButtonElement | null>(null);

  const closeFocus = () => {
    setSelected(null);
  };

  const focusItem = (label: string, button: HTMLButtonElement) => {
    const surface = surfaceRef.current!;
    const frame = surface.getBoundingClientRect();
    const scale = frame.width / surface.offsetWidth;
    const rect = button.getBoundingClientRect();
    const width = button.offsetWidth;
    const height = button.offsetHeight;
    returnButtonRef.current = button;
    setSelected({
      label,
      x: Math.max(40, Math.min((rect.left - frame.left) / scale, surface.offsetWidth - width * 2 - 40)),
      y: Math.max(120, Math.min((rect.top - frame.top) / scale, surface.offsetHeight - height * 2 - 40)),
      width,
      height,
    });
  };

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const timer = window.setTimeout(() => setReady(true), reducedMotion.matches ? 0 : 650);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!selected) {
      returnButtonRef.current?.focus({ preventScroll: true });
      return;
    }
    focusedButtonRef.current?.focus({ preventScroll: true });
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeFocus();
      }
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [selected]);

  return (
    <main
      aria-label={locale === "zh-CN" ? "设置" : "Settings"}
      className="demo-host settings-menu"
      data-settings-state={ready ? "ready" : "framing"}
      data-settings-focused={Boolean(selected)}
      ref={surfaceRef}
    >
      <nav aria-hidden={Boolean(selected)} aria-label="Settings preferences" className="settings-menu__list" lang="en">
        {settingsMenuItems.map((label, index) => (
          <div className="settings-menu__row" data-focused={selected?.label === label} key={label} style={{ "--settings-order": index } as CSSProperties}>
            <button
              aria-pressed={selected?.label === label}
              className="settings-menu__item"
              disabled={!ready}
              onClick={(event) => focusItem(label, event.currentTarget)}
              tabIndex={selected ? -1 : 0}
              type="button"
            >
              {label}
            </button>
          </div>
        ))}
      </nav>
      <button
        aria-hidden="true"
        className="settings-menu__frost"
        onClick={closeFocus}
        tabIndex={-1}
        type="button"
      />
      {selected ? (
        <button
          aria-pressed="true"
          className="settings-menu__item settings-menu__focused-item"
          onClick={closeFocus}
          ref={focusedButtonRef}
          style={{ left: selected.x, top: selected.y, width: selected.width, height: selected.height }}
          title="Back to settings · Esc"
          type="button"
        >
          {selected.label}
        </button>
      ) : null}
      {selected?.label === "Execution Mode" ? <ExecutionModeSettings /> : null}
    </main>
  );
}
