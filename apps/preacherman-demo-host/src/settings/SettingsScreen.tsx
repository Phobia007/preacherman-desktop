import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { Appearance, Locale } from "../preferences";
import "./settings-v3.css";

const localPortfolioUrl = "/settings-v3-local/index.html";
const localPortfolioBaseUrl = "/settings-v3-local/";
const portfolioRootFontPixels = 12;

interface SettingsDirectoryEntry {
  readonly label: Record<Locale, string>;
  readonly state: Record<Locale, string>;
}

interface SettingsDirectoryGroup {
  readonly id: string;
  readonly label: Record<Locale, string>;
  readonly description: Record<Locale, string>;
  readonly entries: readonly SettingsDirectoryEntry[];
}

interface SettingsSelection {
  readonly entryIndex: number;
  readonly groupId: string;
  readonly imageAlt: string;
  readonly imageSrc: string | null;
  readonly opener: HTMLElement;
}

const settingsDirectory: readonly SettingsDirectoryGroup[] = [
  {
    id: "ai-models",
    label: { en: "AI & Models", "zh-CN": "AI 与模型" },
    description: { en: "Review model providers, capability routing, and connection readiness.", "zh-CN": "查看模型服务商、能力路由与连接状态。" },
    entries: [
      { label: { en: "Provider overview", "zh-CN": "服务商总览" }, state: { en: "2 connected", "zh-CN": "2 项已连接" } },
      { label: { en: "DeepSeek Chat", "zh-CN": "DeepSeek 对话" }, state: { en: "Ready", "zh-CN": "可用" } },
      { label: { en: "DashScope Vision", "zh-CN": "百炼视觉" }, state: { en: "Needs setup", "zh-CN": "需要配置" } },
      { label: { en: "Models & connection tests", "zh-CN": "模型与连接测试" }, state: { en: "Local service", "zh-CN": "本地服务" } },
    ],
  },
  {
    id: "voice-audio",
    label: { en: "Voice & Audio", "zh-CN": "语音与音频" },
    description: { en: "Manage recognition, synthesis, voice defaults, and audio input behavior.", "zh-CN": "管理语音识别、语音合成、默认声音与音频输入行为。" },
    entries: [
      { label: { en: "Voice overview", "zh-CN": "语音总览" }, state: { en: "2 channels", "zh-CN": "2 条通道" } },
      { label: { en: "DashScope ASR", "zh-CN": "百炼语音识别" }, state: { en: "Needs setup", "zh-CN": "需要配置" } },
      { label: { en: "DashScope TTS", "zh-CN": "百炼语音合成" }, state: { en: "Needs setup", "zh-CN": "需要配置" } },
      { label: { en: "Default voice", "zh-CN": "默认声音" }, state: { en: "Client setting", "zh-CN": "客户端设置" } },
      { label: { en: "Audio input & VAD", "zh-CN": "音频输入与 VAD" }, state: { en: "Client setting", "zh-CN": "客户端设置" } },
    ],
  },
  {
    id: "native-agent",
    label: { en: "Native Agent", "zh-CN": "本地 Agent" },
    description: { en: "Inspect the local Agent runtime, model defaults, health, and permission policy.", "zh-CN": "查看本地 Agent 运行时、模型默认项、健康状态与权限策略。" },
    entries: [
      { label: { en: "Native overview", "zh-CN": "Native 总览" }, state: { en: "Local runtime", "zh-CN": "本地运行时" } },
      { label: { en: "Installation & health", "zh-CN": "安装与健康状态" }, state: { en: "Status", "zh-CN": "状态" } },
      { label: { en: "Provider & model", "zh-CN": "服务商与模型" }, state: { en: "Defaults", "zh-CN": "默认项" } },
      { label: { en: "Permission policy", "zh-CN": "权限策略" }, state: { en: "Auto · Ask · Strict", "zh-CN": "自动 · 询问 · 严格" } },
    ],
  },
  {
    id: "agent-access",
    label: { en: "Agent Access", "zh-CN": "Agent 接入" },
    description: { en: "Connect external Agent clients and manage their local gateway sessions.", "zh-CN": "连接外部 Agent 客户端并管理本地网关会话。" },
    entries: [
      { label: { en: "Access overview", "zh-CN": "接入总览" }, state: { en: "MCP Gateway", "zh-CN": "MCP 网关" } },
      { label: { en: "MCP client setup", "zh-CN": "MCP 客户端配置" }, state: { en: "4 clients", "zh-CN": "4 种客户端" } },
      { label: { en: "Connected sessions", "zh-CN": "已连接会话" }, state: { en: "Session control", "zh-CN": "会话控制" } },
      { label: { en: "Local Agents", "zh-CN": "本地 Agents" }, state: { en: "Native · Codex CLI", "zh-CN": "Native · Codex CLI" } },
    ],
  },
  {
    id: "mcp",
    label: { en: "MCP", "zh-CN": "MCP" },
    description: { en: "Configure MCP servers, inspect runtime processes, and test exposed tools.", "zh-CN": "配置 MCP 服务、查看运行进程并测试已开放的工具。" },
    entries: [
      { label: { en: "MCP overview", "zh-CN": "MCP 总览" }, state: { en: "Local service", "zh-CN": "本地服务" } },
      { label: { en: "Server configuration", "zh-CN": "服务器配置" }, state: { en: "mcp.json", "zh-CN": "mcp.json" } },
      { label: { en: "Save & restart", "zh-CN": "保存并重启" }, state: { en: "Runtime action", "zh-CN": "运行时操作" } },
      { label: { en: "Runtime status", "zh-CN": "运行状态" }, state: { en: "Servers & processes", "zh-CN": "服务与进程" } },
      { label: { en: "Tools & test", "zh-CN": "工具与测试" }, state: { en: "Inspect · Invoke", "zh-CN": "查看 · 调用" } },
    ],
  },
  {
    id: "plugins",
    label: { en: "Plugins", "zh-CN": "插件" },
    description: { en: "Install, inspect, and manage trusted local extensions and their permissions.", "zh-CN": "安装、查看并管理可信本地扩展及其权限。" },
    entries: [
      { label: { en: "Plugin overview", "zh-CN": "插件总览" }, state: { en: "Local extensions", "zh-CN": "本地扩展" } },
      { label: { en: "Install & manage", "zh-CN": "安装与管理" }, state: { en: "Trusted directories", "zh-CN": "可信目录" } },
      { label: { en: "Lifecycle & hot reload", "zh-CN": "生命周期与热重载" }, state: { en: "Enable · Reload", "zh-CN": "启用 · 重载" } },
      { label: { en: "Permissions, Kits & tools", "zh-CN": "权限、Kits 与工具" }, state: { en: "Approval required", "zh-CN": "需要审批" } },
    ],
  },
  {
    id: "connections",
    label: { en: "Connections", "zh-CN": "外部连接" },
    description: { en: "Review service adapters and the state of each external connection.", "zh-CN": "查看服务适配器与每一项外部连接的状态。" },
    entries: [
      { label: { en: "Connection overview", "zh-CN": "连接总览" }, state: { en: "5 services", "zh-CN": "5 项服务" } },
      { label: { en: "Discord", "zh-CN": "Discord" }, state: { en: "Adapter required", "zh-CN": "需要适配器" } },
      { label: { en: "Telegram", "zh-CN": "Telegram" }, state: { en: "Adapter required", "zh-CN": "需要适配器" } },
      { label: { en: "YouTube Live Chat", "zh-CN": "YouTube 直播聊天" }, state: { en: "Adapter required", "zh-CN": "需要适配器" } },
      { label: { en: "Minecraft", "zh-CN": "Minecraft" }, state: { en: "RCON adapter", "zh-CN": "RCON 适配器" } },
      { label: { en: "Factorio", "zh-CN": "Factorio" }, state: { en: "RCON adapter", "zh-CN": "RCON 适配器" } },
    ],
  },
  {
    id: "preferences",
    label: { en: "Preferences", "zh-CN": "偏好设置" },
    description: { en: "Control the local appearance, language, and companion defaults.", "zh-CN": "控制本机外观、语言与伙伴默认项。" },
    entries: [
      { label: { en: "Preferences overview", "zh-CN": "偏好设置总览" }, state: { en: "Saved locally", "zh-CN": "保存在本地" } },
      { label: { en: "Appearance", "zh-CN": "外观" }, state: { en: "Light · Dark", "zh-CN": "浅色 · 深色" } },
      { label: { en: "Language", "zh-CN": "语言" }, state: { en: "English · 中文", "zh-CN": "English · 中文" } },
      { label: { en: "Companion model", "zh-CN": "伙伴模型" }, state: { en: "Cortana · Zima", "zh-CN": "Cortana · Zima" } },
    ],
  },
] as const;

function semanticThemeValue(host: HTMLElement, property: string, fallback: string): string {
  const shell = host.ownerDocument.querySelector<HTMLElement>(".demo-app-shell");
  return shell ? getComputedStyle(shell).getPropertyValue(property).trim() || fallback : fallback;
}

function rebaseCssUrls(css: string): string {
  return css.replace(/url\((['"]?)([^)'"\s]+)\1\)/g, (match, quote: string, value: string) => {
    if (/^(?:data:|blob:|https?:)/i.test(value)) return match;
    const rebased = value.startsWith("/_nuxt/")
      ? `${localPortfolioBaseUrl}${value.slice(1)}`
      : new URL(value, new URL(localPortfolioBaseUrl, window.location.href)).href;
    return `url(${quote}${rebased}${quote})`;
  });
}

function rebaseMediaUrls(root: ParentNode) {
  root.querySelectorAll<HTMLElement>("[src], [poster]").forEach((element) => {
    (["src", "poster"] as const).forEach((attribute) => {
      const value = element.getAttribute(attribute);
      if (value && !/^(?:data:|blob:|https?:)/i.test(value)) {
        element.setAttribute(attribute, new URL(value, new URL(localPortfolioBaseUrl, window.location.href)).href);
      }
    });
  });
  root.querySelectorAll<HTMLElement>("[srcset]").forEach((element) => {
    const value = element.getAttribute("srcset");
    if (!value) return;
    element.setAttribute("srcset", value.split(",").map((candidate) => {
      const [url, descriptor] = candidate.trim().split(/\s+/, 2);
      const rebased = /^(?:data:|blob:|https?:)/i.test(url)
        ? url
        : new URL(url, new URL(localPortfolioBaseUrl, window.location.href)).href;
      return descriptor ? `${rebased} ${descriptor}` : rebased;
    }).join(", "));
  });
}

function mountLocalPortfolio(
  host: HTMLDivElement,
  source: string,
  locale: Locale,
  appearance: Appearance,
  onSelect: (selection: SettingsSelection) => void,
) {
  const parsed = new DOMParser().parseFromString(source, "text/html");
  const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  shadow.replaceChildren();

  host.dataset.appearance = appearance;
  host.style.setProperty("--preacherman-settings-text", semanticThemeValue(host, "--demo-theme-settings-text", "#ffffff"));
  host.style.setProperty("--preacherman-settings-muted", semanticThemeValue(host, "--demo-theme-settings-muted", "rgb(255 255 255 / 52%)"));
  host.style.setProperty("--preacherman-settings-focus", semanticThemeValue(host, "--demo-theme-settings-focus", "#ffffff"));

  const style = host.ownerDocument.createElement("style");
  const clonedCss = Array.from(parsed.querySelectorAll("style"))
    .map((node) => node.textContent ?? "")
    .join("\n")
    .replace(/(-?\d*\.?\d+)rem/g, (_match, value: string) => `${Number(value) * portfolioRootFontPixels}px`);
  style.textContent = `${rebaseCssUrls(clonedCss)}
      :host {
        display: block;
        min-height: 100%;
        color: var(--preacherman-settings-text);
        font-family: sans, sans-serif;
        font-size: 20.4px;
        font-weight: 500;
        line-height: 1.11;
      }
      header,
      .fixed.inset-0.bg-black.z-99.flex.items-center.justify-center,
      .js-t-mask { display: none !important; }
      .projects { padding-top: 500px !important; }
      .media__picture.is-animated,
      .media__video.is-animated { opacity: 1 !important; }
      [data-od-id="project-grid"] article[hidden] { display: none !important; }
      [data-od-id="project-grid"] article[data-settings-entry] {
        color: var(--preacherman-settings-text);
        opacity: 1;
        transition: opacity 260ms ease;
      }
      [data-od-id="project-grid"][data-settings-grid-active] article[data-settings-entry]:not([data-settings-group-active]) {
        opacity: .18;
      }
      .settings-v3-card-heading {
        display: flex !important;
        min-height: 46px;
        margin-bottom: 6px !important;
        color: var(--preacherman-settings-text);
        font-size: 14px;
        line-height: 1.08;
      }
      .settings-v3-card-heading__group {
        font-size: 42px;
        letter-spacing: -.03em;
        line-height: 1.08;
        white-space: nowrap;
      }
      .settings-v3-card-heading__number { margin-left: auto; font-variant-numeric: tabular-nums; }
      .settings-v3-card-copy {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 4px 12px;
        align-items: baseline;
        margin-top: 8px;
        color: var(--preacherman-settings-text);
        line-height: 1.08;
      }
      .settings-v3-card-copy__label { min-width: 0; font-size: 14px; font-weight: 500; }
      .settings-v3-card-copy__state { color: var(--preacherman-settings-muted); font-size: 11px; }
      .settings-v3-card-copy__state { text-align: right; }
      [data-od-id="project-grid"] article[data-settings-entry]:focus-visible {
        outline: 1px solid var(--preacherman-settings-focus);
        outline-offset: 4px;
      }
      @media (max-width: 649px) {
        .settings-v3-card-copy { gap: 2px 8px; margin-top: 6px; }
        .settings-v3-card-heading { min-height: 39px; font-size: 12px; }
        .settings-v3-card-heading__group { font-size: 36px; }
        .settings-v3-card-copy__label { font-size: 12px; }
        .settings-v3-card-copy__state { font-size: 10px; }
      }
    `;
  shadow.append(style);

  const content = host.ownerDocument.createElement("div");
  content.className = "settings-v3-local-document";
  Array.from(parsed.body.children).forEach((child) => content.append(child.cloneNode(true)));
  rebaseMediaUrls(content);
  shadow.append(content);

  const entries = settingsDirectory.flatMap((group) => group.entries.map((entry, entryIndex) => ({
    entry,
    entryIndex,
    group,
    number: entryIndex + 1,
  })));
  const grid = shadow.querySelector<HTMLElement>('[data-od-id="project-grid"]');
  const cards = Array.from(shadow.querySelectorAll<HTMLElement>('[data-od-id^="project-card-"]'));

  const setActiveGroup = (groupId: string | null) => {
    grid?.toggleAttribute("data-settings-grid-active", Boolean(groupId));
    cards.forEach((candidate) => candidate.toggleAttribute(
      "data-settings-group-active",
      Boolean(groupId && candidate.dataset.settingsGroup === groupId),
    ));
  };

  cards.forEach((card, index) => {
    const item = entries[index];
    if (!item) {
      card.querySelector(".settings-v3-card-copy")?.remove();
      card.hidden = true;
      card.removeAttribute("data-settings-entry");
      card.removeAttribute("data-settings-group");
      return;
    }

    card.hidden = false;
    card.dataset.settingsEntry = item.entry.label.en;
    card.dataset.settingsGroup = item.group.id;
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-haspopup", "dialog");
    card.setAttribute("aria-label", `${item.group.label[locale]} — ${item.entry.label[locale]} — ${item.entry.state[locale]}`);

    const heading = card.querySelector<HTMLElement>("h2");
    if (heading) {
      heading.replaceChildren();
      heading.className = "settings-v3-card-heading";
      const groupLabel = host.ownerDocument.createElement("span");
      groupLabel.className = "settings-v3-card-heading__group";
      groupLabel.textContent = item.entryIndex === 0 ? item.group.label[locale] : "";
      const number = host.ownerDocument.createElement("span");
      number.className = "settings-v3-card-heading__number";
      number.textContent = String(item.number);
      heading.append(groupLabel, number);
    }

    const openDetail = () => {
      const image = card.querySelector<HTMLImageElement>("img");
      onSelect({
        entryIndex: item.entryIndex,
        groupId: item.group.id,
        imageAlt: image?.alt || item.entry.label[locale],
        imageSrc: image?.currentSrc || image?.src || null,
        opener: card,
      });
    };
    card.addEventListener("click", openDetail);
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openDetail();
    });
    card.addEventListener("pointerenter", () => setActiveGroup(item.group.id));
    card.addEventListener("pointerleave", (event) => {
      const nextCard = event.relatedTarget instanceof Element
        ? event.relatedTarget.closest<HTMLElement>('[data-settings-group]')
        : null;
      if (nextCard?.dataset.settingsGroup !== item.group.id) setActiveGroup(null);
    });
    card.addEventListener("focus", () => setActiveGroup(item.group.id));
    card.addEventListener("blur", (event) => {
      const nextCard = event.relatedTarget instanceof Element
        ? event.relatedTarget.closest<HTMLElement>('[data-settings-group]')
        : null;
      if (nextCard?.dataset.settingsGroup !== item.group.id) setActiveGroup(null);
    });

    let copy = card.querySelector<HTMLElement>(".settings-v3-card-copy");
    if (!copy) {
      copy = host.ownerDocument.createElement("div");
      copy.className = "settings-v3-card-copy";
      copy.innerHTML = `
        <span class="settings-v3-card-copy__label"></span>
        <span class="settings-v3-card-copy__state"></span>
      `;
      card.append(copy);
    }
    copy.querySelector<HTMLElement>(".settings-v3-card-copy__label")!.textContent = item.entry.label[locale];
    copy.querySelector<HTMLElement>(".settings-v3-card-copy__state")!.textContent = item.entry.state[locale];
  });
  host.dataset.settingsDirectoryReady = "true";
}

interface SettingsScreenProps {
  readonly appearance: Appearance;
  readonly locale: Locale;
  readonly onAppearanceChange: (appearance: Appearance) => void;
  readonly onLocaleChange: (locale: Locale) => void;
  readonly requestedControl?: string | null;
  readonly widgets?: ReactNode;
}

export function SettingsScreen({ appearance, locale }: SettingsScreenProps) {
  const referenceRef = useRef<HTMLDivElement>(null);
  const [portfolioSource, setPortfolioSource] = useState<string | null>(null);
  const [selection, setSelection] = useState<SettingsSelection | null>(null);

  const closeDetail = useCallback(() => {
    const opener = selection?.opener;
    setSelection(null);
    if (opener) requestAnimationFrame(() => opener.focus());
  }, [selection]);

  useEffect(() => {
    if (!selection) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDetail();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [closeDetail, selection]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(localPortfolioUrl, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Settings reference failed with ${response.status}`);
        return response.text();
      })
      .then(setPortfolioSource)
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) console.error(error);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (referenceRef.current && portfolioSource) {
      mountLocalPortfolio(referenceRef.current, portfolioSource, locale, appearance, setSelection);
    }
  }, [appearance, locale, portfolioSource]);

  const selectedGroup = selection ? settingsDirectory.find((group) => group.id === selection.groupId) : null;
  const selectedEntry = selectedGroup && selection ? selectedGroup.entries[selection.entryIndex] : null;

  return (
    <main
      aria-label={locale === "zh-CN" ? "设置" : "Settings"}
      className="demo-host demo-settings settings-v3"
      data-settings-milestone="v3-2"
    >
      <span aria-hidden="true" className="settings-v3__reveal-line" />
      <section aria-hidden={selection ? "true" : undefined} className="settings-v3__reveal-mask" data-detail-open={Boolean(selection)}>
        <div
          aria-label={locale === "zh-CN" ? "Settings Gil Huybrecht 本地复刻" : "Settings Gil Huybrecht local clone"}
          className="settings-v3__reference"
          ref={referenceRef}
          role="document"
        />
      </section>
      {selection && selectedGroup && selectedEntry ? (
        <section
          aria-label={`${selectedGroup.label[locale]} — ${selectedEntry.label[locale]}`}
          aria-modal="true"
          className="settings-v3__detail"
          data-settings-entry={selectedEntry.label.en}
          data-settings-group={selectedGroup.id}
          role="dialog"
        >
          <aside className="settings-v3__detail-summary">
            <header>
              <h1>{selectedEntry.label[locale]}</h1>
              <span>{selectedEntry.state[locale]}</span>
            </header>
            <p>{selectedGroup.description[locale]}</p>
            <dl>
              <div><dt>1</dt><dd><span>{locale === "zh-CN" ? "分类" : "Category"}</span><strong>{selectedGroup.label[locale]}</strong></dd></div>
              <div><dt>2</dt><dd><span>{locale === "zh-CN" ? "项目" : "Control"}</span><strong>{selectedEntry.label[locale]}</strong></dd></div>
              <div><dt>3</dt><dd><span>{locale === "zh-CN" ? "状态" : "Status"}</span><strong>{selectedEntry.state[locale]}</strong></dd></div>
              <div><dt>4</dt><dd><span>{locale === "zh-CN" ? "范围" : "Scope"}</span><strong>{locale === "zh-CN" ? "本机" : "Local device"}</strong></dd></div>
            </dl>
            <button className="settings-v3__back" onClick={closeDetail} type="button">
              {locale === "zh-CN" ? "返回" : "Back"}
            </button>
          </aside>
          <div className="settings-v3__detail-content" data-settings-control-slot={selectedEntry.label.en}>
            {selection.imageSrc ? (
              <figure>
                <img alt={selection.imageAlt} src={selection.imageSrc} />
              </figure>
            ) : null}
            <section>
              <span>{selectedGroup.label[locale]}</span>
              <h2>{selectedEntry.label[locale]}</h2>
              <p>
                {locale === "zh-CN"
                  ? `这里用于查看并配置“${selectedEntry.label[locale]}”。后续操作按钮会按照这一项的功能部署在此内容区。`
                  : `Review and configure ${selectedEntry.label[locale]} here. Its actions will be placed in this content area.`}
              </p>
            </section>
          </div>
        </section>
      ) : null}
    </main>
  );
}
