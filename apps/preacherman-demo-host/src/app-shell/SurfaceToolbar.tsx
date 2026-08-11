import type { Locale } from "../preferences";

export interface SurfaceToolbarTab {
  readonly id: string;
  readonly label: { readonly en: string; readonly "zh-CN": string };
}

interface SurfaceToolbarProps {
  readonly activeTab?: string;
  readonly description: { readonly en: string; readonly "zh-CN": string };
  readonly locale: Locale;
  readonly onTabChange?: (tabId: string) => void;
  readonly surface: string;
  readonly tabs?: readonly SurfaceToolbarTab[];
  readonly title: { readonly en: string; readonly "zh-CN": string };
}

export function SurfaceToolbar({
  activeTab,
  description,
  locale,
  onTabChange,
  surface,
  tabs = [],
  title,
}: SurfaceToolbarProps) {
  return (
    <header className="demo-surface-toolbar" data-surface={surface}>
      <div className="demo-surface-toolbar__copy">
        <h1>{title[locale]}</h1>
        <p>{description[locale]}</p>
      </div>
      {tabs.length > 0 ? (
        <nav aria-label={locale === "zh-CN" ? `${title[locale]}视图` : `${title[locale]} views`} className="demo-surface-toolbar__tabs">
          {tabs.map((tab) => (
            <button
              aria-pressed={activeTab === tab.id}
              key={tab.id}
              onClick={() => onTabChange?.(tab.id)}
              type="button"
            >
              {tab.label[locale]}
            </button>
          ))}
        </nav>
      ) : null}
    </header>
  );
}
