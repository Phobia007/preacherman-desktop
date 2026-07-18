import type { Appearance, Locale } from "../preferences";

interface SettingsScreenProps {
  readonly appearance: Appearance;
  readonly locale: Locale;
  readonly onAppearanceChange: (appearance: Appearance) => void;
  readonly onLocaleChange: (locale: Locale) => void;
}

export function SettingsScreen({
  appearance,
  locale,
  onAppearanceChange,
  onLocaleChange,
}: SettingsScreenProps) {
  const isChinese = locale === "zh-CN";
  const appearanceValue = appearance === "light"
    ? (isChinese ? "浅色" : "Light")
    : (isChinese ? "深色" : "Dark");
  const languageValue = isChinese ? "简体中文" : "English";

  return (
    <main
      aria-label={isChinese ? "设置" : "Settings"}
      className="demo-host demo-settings"
    >
      <div className="demo-settings__controls">
        <button
          aria-pressed={appearance === "dark"}
          className="demo-settings__button"
          onClick={() => onAppearanceChange(appearance === "light" ? "dark" : "light")}
          type="button"
        >
          <span>{isChinese ? "外观" : "Appearance"}</span>
          <span aria-hidden="true">·</span>
          <strong>{appearanceValue}</strong>
        </button>
        <button
          aria-pressed={locale === "zh-CN"}
          className="demo-settings__button"
          onClick={() => onLocaleChange(locale === "en" ? "zh-CN" : "en")}
          type="button"
        >
          <span>{isChinese ? "语言" : "Language"}</span>
          <span aria-hidden="true">·</span>
          <strong>{languageValue}</strong>
        </button>
      </div>
    </main>
  );
}
