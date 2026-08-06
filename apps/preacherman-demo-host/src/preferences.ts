export type Appearance = "light" | "dark";
export type Locale = "en" | "zh-CN";
export type ModelId = "cortana";

export interface DemoPreferences {
  readonly activeModelId: ModelId | null;
  readonly appearance: Appearance;
  readonly locale: Locale;
}

export const DEFAULT_PREFERENCES: DemoPreferences = {
  // A fresh installation starts with the companion present. A stored `null`
  // remains meaningful: it represents an explicit user deactivation.
  activeModelId: "cortana",
  appearance: "light",
  locale: "en",
};

const PREFERENCES_STORAGE_KEY = "preacherman.preferences";

export const uiCopy = {
  en: {
    navigationAriaLabel: "Primary",
    navigationLabels: {
      home: "Home",
      workspace: "Work",
      lab: "Lab",
      market: "Gallery",
      test: "Test",
      ledger: "Ledger",
      settings: "Settings",
    },
    emptySurfaceLabels: {
      workspace: "Work",
      lab: "Lab",
      market: "Gallery",
      test: "Test",
      ledger: "Ledger",
      settings: "Settings",
    },
    windowControls: {
      minimize: "Minimize window",
      maximize: "Toggle maximize window",
      close: "Close window",
    },
    introLabel: "Starting Preacherman",
  },
  "zh-CN": {
    navigationAriaLabel: "主导航",
    navigationLabels: {
      home: "首页",
      workspace: "工作区",
      lab: "实验室",
      market: "状态画廊",
      test: "测试区",
      ledger: "状态账本",
      settings: "设置",
    },
    emptySurfaceLabels: {
      workspace: "工作区",
      lab: "实验室",
      market: "状态画廊",
      test: "测试区",
      ledger: "状态账本",
      settings: "设置",
    },
    windowControls: {
      minimize: "最小化窗口",
      maximize: "切换最大化窗口",
      close: "关闭窗口",
    },
    introLabel: "正在启动 Preacherman",
  },
} as const;

function isAppearance(value: unknown): value is Appearance {
  return value === "light" || value === "dark";
}

function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "zh-CN";
}

function isModelId(value: unknown): value is ModelId {
  return value === "cortana";
}

export function readPreferences(): DemoPreferences {
  if (typeof window === "undefined") {
    return DEFAULT_PREFERENCES;
  }
  try {
    const stored = JSON.parse(window.localStorage.getItem(PREFERENCES_STORAGE_KEY) ?? "null") as
      | Partial<DemoPreferences>
      | null;
    return {
      activeModelId: isModelId(stored?.activeModelId)
        ? stored.activeModelId
        : DEFAULT_PREFERENCES.activeModelId,
      appearance: isAppearance(stored?.appearance)
        ? stored.appearance
        : DEFAULT_PREFERENCES.appearance,
      locale: isLocale(stored?.locale) ? stored.locale : DEFAULT_PREFERENCES.locale,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function savePreferences(preferences: DemoPreferences): void {
  try {
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Preferences are still valid for the current session when storage is unavailable.
  }
}

export function applyPreferences(preferences: DemoPreferences): void {
  document.documentElement.dataset.appearance = preferences.appearance;
  document.documentElement.lang = preferences.locale;
  document.documentElement.style.colorScheme = preferences.appearance;
}
