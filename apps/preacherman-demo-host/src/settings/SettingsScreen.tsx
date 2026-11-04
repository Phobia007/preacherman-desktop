import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { Appearance, Locale } from "../preferences";
import "./settings-menu.css";
import { ExecutionModeSettings } from "./ExecutionModeSettings";
import { MotionServiceSettings } from "./MotionServiceSettings";
import { VoiceServiceSettings } from "./VoiceServiceSettings";
import { CharacterMemorySettings } from "../character-state/CharacterMemorySettings";
import { CharacterRulesSettings } from "../character-state/CharacterRulesSettings";
import { activeCharacterId } from "../character-state/activeCharacter";

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

interface SettingsMenuProps {
  readonly characterId?: string;
  readonly locale: Locale;
  readonly items?: readonly (typeof settingsMenuItems[number] | "Voice Service" | "Motion Service")[];
  readonly layout?: "desktop" | "asset";
  readonly onFocusChange?: (focused: boolean) => void;
  readonly children?: ReactNode;
  readonly requestedItem?: string | null;
  readonly onOpenVoice?: () => void;
  readonly onOpenAction?: () => void;
}

// Both destinations share the menu, focus lifecycle and real configuration view.
export function SettingsMenu({ locale, items = settingsMenuItems, layout = "desktop", onFocusChange, children, characterId, requestedItem, onOpenVoice, onOpenAction }: SettingsMenuProps) {
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<{ label: string; x: number; y: number; width: number; height: number } | null>(null);
  const surfaceRef = useRef<HTMLElement>(null);
  const focusedButtonRef = useRef<HTMLButtonElement>(null);
  const returnButtonRef = useRef<HTMLButtonElement | null>(null);
  const Root = layout === "asset" ? "section" : "main";
  const stateCharacterId = characterId ?? activeCharacterId();

  useEffect(() => {
    onFocusChange?.(Boolean(selected));
    return () => onFocusChange?.(false);
  }, [Boolean(selected), onFocusChange]);

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
      x: Math.max(layout === "asset" ? 0 : 40, Math.min((rect.left - frame.left) / scale, surface.offsetWidth - width * 2 - 40)),
      y: Math.max(layout === "asset" ? 0 : 120, Math.min((rect.top - frame.top) / scale, surface.offsetHeight - height * 2 - 40)),
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
    if (!ready || !requestedItem) return;
    const button = Array.from(surfaceRef.current?.querySelectorAll<HTMLButtonElement>(".settings-menu__list button") || []).find(item => item.textContent === requestedItem);
    if (button) focusItem(requestedItem, button);
  }, [ready, requestedItem]);

  useEffect(() => {
    if (!selected) {
      returnButtonRef.current?.focus({ preventScroll: true });
      return;
    }
    focusedButtonRef.current?.focus({ preventScroll: true });
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeFocus();
      }
    };
    // Close the focused preference before an enclosing character page handles Esc.
    window.addEventListener("keydown", onEscape, true);
    return () => window.removeEventListener("keydown", onEscape, true);
  }, [selected]);

  return (
    <Root
      aria-label={locale === "zh-CN" ? "设置" : "Settings"}
      className={layout === "asset" ? "settings-menu asset-settings" : "demo-host settings-menu"}
      data-settings-state={ready ? "ready" : "framing"}
      data-settings-focused={Boolean(selected)}
      data-settings-selection={selected?.label}
      ref={surfaceRef}
    >
      {children}
      <nav aria-hidden={Boolean(selected)} aria-label="Settings preferences" className="settings-menu__list" lang="en">
        {items.map((label, index) => (
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
      {selected?.label === "Execution Mode" ? <ExecutionModeSettings key={characterId || "global"} characterId={characterId} /> : null}
      {selected?.label === "Motion Service" && characterId ? <MotionServiceSettings key={characterId} characterId={characterId} onOpenAction={onOpenAction} /> : null}
      {selected?.label === "Voice Service" && characterId ? <VoiceServiceSettings key={characterId} characterId={characterId} onOpenVoice={onOpenVoice} /> : null}
      {selected?.label === "Memory" && stateCharacterId ? <CharacterMemorySettings key={stateCharacterId} characterId={stateCharacterId} /> : null}
      {selected?.label === "Instructions / Rules" && stateCharacterId ? <CharacterRulesSettings key={stateCharacterId} characterId={stateCharacterId} /> : null}
      {!stateCharacterId && ["Memory", "Instructions / Rules"].includes(selected?.label ?? "") && <section className="execution-mode"><p>Activate a character in Asset to manage its memory and rules.</p></section>}
    </Root>
  );
}

export function SettingsScreen({ locale, appearance, onAppearanceChange }: SettingsScreenProps) {
  return <SettingsMenu locale={locale}>
    <button
      className="settings-menu__appearance"
      aria-label={locale === "zh-CN" ? "切换白天模式" : "Light appearance"}
      aria-pressed={appearance === "light"}
      title={appearance === "dark" ? "Light appearance" : "Dark appearance"}
      onClick={() => onAppearanceChange(appearance === "dark" ? "light" : "dark")}
      type="button"
    >
      <svg aria-hidden="true" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
        {appearance === "light" ? <><circle cx="16" cy="16" r="5" /><path d="M16 3v3m0 20v3M3 16h3m20 0h3M6.8 6.8l2.1 2.1m14.2 14.2 2.1 2.1M6.8 25.2l2.1-2.1M23.1 8.9l2.1-2.1" /></> : <path d="M21.2 5.5a10.5 10.5 0 1 1-14.7 14.7A9.1 9.1 0 0 0 21.2 5.5Z" />}
      </svg>
    </button>
  </SettingsMenu>;
}
