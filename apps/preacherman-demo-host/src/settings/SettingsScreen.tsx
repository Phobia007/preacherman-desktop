import type { ReactNode } from "react";
import type { Appearance, Locale } from "../preferences";

interface SettingsScreenProps {
  readonly appearance: Appearance;
  readonly locale: Locale;
  readonly onAppearanceChange: (appearance: Appearance) => void;
  readonly onLocaleChange: (locale: Locale) => void;
  readonly requestedControl?: string | null;
  readonly widgets?: ReactNode;
}

// Intentionally empty while Settings is redesigned. The shared shell owns
// the companion, navigation and window controls; saved configuration is untouched.
export function SettingsScreen({ locale }: SettingsScreenProps) {
  return (
    <main
      aria-label={locale === "zh-CN" ? "设置" : "Settings"}
      className="demo-host demo-host--empty"
      data-settings-state="cleared"
    />
  );
}
