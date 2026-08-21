import type { ReactNode, SyntheticEvent } from "react";
import type { Appearance, Locale } from "../preferences";

const settingsHeaderStyleId = "preacherman-settings-clear-header";
const settingsTemplateVersion = "20260819-no-gl-v2";
const settingsTemplateUrl = `/settings-template/?preacherman-settings=${settingsTemplateVersion}`;

function clearReferenceHeader(event: SyntheticEvent<HTMLIFrameElement>) {
  const frame = event.currentTarget;
  const document = frame.contentDocument;
  if (!document) return;
  const embeddedVersion = document
    .querySelector('meta[name="preacherman-settings-version"]')
    ?.getAttribute("content");
  if (embeddedVersion !== settingsTemplateVersion) {
    const recoveryUrl = new URL(settingsTemplateUrl, window.location.href);
    recoveryUrl.searchParams.set("cache-recovery", settingsTemplateVersion);
    if (frame.src !== recoveryUrl.href) {
      frame.src = recoveryUrl.href;
      return;
    }
  }
  document.documentElement.classList.remove("has-gl");
  if (document.getElementById(settingsHeaderStyleId)) return;
  const style = document.createElement("style");
  style.id = settingsHeaderStyleId;
  style.textContent = [
    ".js-sh { visibility: hidden !important; pointer-events: none !important; }",
    "[data-od-id=\"loading-state\"] { display: none !important; }",
    "#__nuxt .fixed.inset-0.bg-black.z-99.flex.items-center.justify-center { display: none !important; opacity: 0 !important; visibility: hidden !important; }",
    "html { scrollbar-color: transparent #000 !important; }",
    "::-webkit-scrollbar { width: 15px !important; background: #000 !important; }",
    "::-webkit-scrollbar-thumb { background: transparent !important; }",
  ].join("\n");
  document.head.append(style);
}

interface SettingsScreenProps {
  readonly appearance: Appearance;
  readonly locale: Locale;
  readonly onAppearanceChange: (appearance: Appearance) => void;
  readonly onLocaleChange: (locale: Locale) => void;
  readonly requestedControl?: string | null;
  readonly widgets?: ReactNode;
}

export function SettingsScreen({ locale }: SettingsScreenProps) {
  return <main aria-label={locale === "zh-CN" ? "设置" : "Settings"} className="demo-host demo-settings">
    <iframe
      className="demo-settings__reference"
      onLoad={clearReferenceHeader}
      src={settingsTemplateUrl}
      title={locale === "zh-CN" ? "设置视觉模板" : "Settings visual reference"}
    />
  </main>;
}
