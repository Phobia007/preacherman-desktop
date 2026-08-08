import { useEffect, useState, type ReactNode } from "react";
import type { Locale } from "../preferences";
import "./AiriWidgetGallery.css";

export type AiriWidgetServiceRequest = <T>(path: string, init?: RequestInit) => Promise<T>;

type WidgetTone = "primary" | "muted" | "accent" | "success" | "warning" | "error";

export type AiriWidgetNode =
  | { readonly type: "container"; readonly orientation: "vertical" | "horizontal"; readonly gap: number; readonly children: readonly AiriWidgetNode[] }
  | { readonly type: "text"; readonly text: string; readonly variant: "heading" | "body" | "caption"; readonly tone: WidgetTone }
  | { readonly type: "metric"; readonly label: string; readonly value: string | number; readonly tone: WidgetTone }
  | { readonly type: "progress"; readonly label: string; readonly value: number }
  | { readonly type: "button"; readonly label: string; readonly action: { readonly type: "emit"; readonly event: string }; readonly disabled?: boolean };

export interface AiriWidgetRecord {
  readonly id: string;
  readonly pluginId: string;
  readonly revision: number;
  readonly phase: string;
  readonly manifest: {
    readonly title: string;
    readonly description?: string;
    readonly placement: "home" | "work" | "ledger" | "lab" | "gallery";
    readonly version: string;
  };
  readonly schema: AiriWidgetNode;
}

export interface AiriWidgetGalleryProps {
  readonly locale: Locale;
  readonly serviceRequest: AiriWidgetServiceRequest;
}

interface WidgetRendererProps {
  readonly node: AiriWidgetNode;
  readonly onEmit: (event: string) => void;
}

const placements = new Set(["home", "work", "ledger", "lab", "gallery"]);
const tones = new Set(["primary", "muted", "accent", "success", "warning", "error"]);
const variants = new Set(["heading", "body", "caption"]);

const copy = {
  en: {
    eyebrow: "AIRI Widgets",
    title: "Widget gallery",
    description: "Safe, declarative plugin surfaces rendered with Preacherman components.",
    loading: "Loading widgets…",
    empty: "No AIRI widgets are registered yet.",
    error: "Widgets could not be loaded.",
    retry: "Try again",
    count: (count: number) => `${count} widgets`,
    by: "Plugin",
    revision: "Revision",
    emitted: (event: string) => `Local preview received “${event}”. No plugin action was executed.`,
    placements: { home: "Home", work: "Work", ledger: "Ledger", lab: "Lab", gallery: "Gallery" },
  },
  "zh-CN": {
    eyebrow: "AIRI 小组件",
    title: "组件展廊",
    description: "使用 Preacherman 组件安全渲染插件提供的声明式界面。",
    loading: "正在加载小组件…",
    empty: "目前还没有注册 AIRI 小组件。",
    error: "无法加载小组件。",
    retry: "重试",
    count: (count: number) => `${count} 个小组件`,
    by: "插件",
    revision: "版本修订",
    emitted: (event: string) => `本地预览已收到“${event}”事件；没有执行任何插件操作。`,
    placements: { home: "主页", work: "工作", ledger: "账本", lab: "实验室", gallery: "展廊" },
  },
} as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value: unknown, label: string, maximum = 2_000): string {
  if (typeof value !== "string" || !value || value.length > maximum) throw new Error(`${label} is invalid.`);
  return value;
}

function parseNode(value: unknown, depth = 0, context = { nodes: 0 }): AiriWidgetNode {
  context.nodes += 1;
  if (depth > 8 || context.nodes > 200 || !isObject(value)) throw new Error("Widget schema is invalid.");
  if (value.type === "container") {
    if ((value.orientation !== "vertical" && value.orientation !== "horizontal") || !Number.isInteger(value.gap) || (value.gap as number) < 0 || (value.gap as number) > 48 || !Array.isArray(value.children) || value.children.length > 50) {
      throw new Error("Widget container is invalid.");
    }
    return {
      type: "container",
      orientation: value.orientation,
      gap: value.gap as number,
      children: value.children.map((child) => parseNode(child, depth + 1, context)),
    };
  }
  if (value.type === "text") {
    if (!variants.has(value.variant as never) || !tones.has(value.tone as never)) throw new Error("Widget text is invalid.");
    return { type: "text", text: requiredString(value.text, "Widget text", 2_000), variant: value.variant as "heading" | "body" | "caption", tone: value.tone as WidgetTone };
  }
  if (value.type === "metric") {
    if ((typeof value.value !== "string" && typeof value.value !== "number") || (typeof value.value === "number" && !Number.isFinite(value.value)) || String(value.value).length > 120 || !tones.has(value.tone as never)) throw new Error("Widget metric is invalid.");
    return { type: "metric", label: requiredString(value.label, "Widget metric label", 120), value: value.value, tone: value.tone as WidgetTone };
  }
  if (value.type === "progress") {
    if (typeof value.value !== "number" || !Number.isFinite(value.value) || value.value < 0 || value.value > 1) throw new Error("Widget progress is invalid.");
    return { type: "progress", label: requiredString(value.label, "Widget progress label", 120), value: value.value };
  }
  if (value.type === "button") {
    if (!isObject(value.action) || value.action.type !== "emit") throw new Error("Widget button action is invalid.");
    if (value.disabled !== undefined && typeof value.disabled !== "boolean") throw new Error("Widget button state is invalid.");
    return {
      type: "button",
      label: requiredString(value.label, "Widget button label", 120),
      action: { type: "emit", event: requiredString(value.action.event, "Widget button event", 80) },
      ...(value.disabled === undefined ? {} : { disabled: value.disabled }),
    };
  }
  throw new Error(`Unsupported widget node: ${String(value.type)}.`);
}

function parseWidget(value: unknown): AiriWidgetRecord {
  if (!isObject(value) || !isObject(value.manifest)) throw new Error("Widget record is invalid.");
  const placement = requiredString(value.manifest.placement, "Widget placement");
  if (!placements.has(placement)) throw new Error("Widget placement is invalid.");
  if (!Number.isInteger(value.revision) || (value.revision as number) < 1) throw new Error("Widget revision is invalid.");
  const description = value.manifest.description;
  if (description !== undefined && typeof description !== "string") throw new Error("Widget description is invalid.");
  return {
    id: requiredString(value.id, "Widget id"),
    pluginId: requiredString(value.pluginId, "Widget plugin"),
    revision: value.revision as number,
    phase: requiredString(value.phase, "Widget phase"),
    manifest: {
      title: requiredString(value.manifest.title, "Widget title", 120),
      ...(description === undefined ? {} : { description }),
      placement: placement as AiriWidgetRecord["manifest"]["placement"],
      version: requiredString(value.manifest.version, "Widget version"),
    },
    schema: parseNode(value.schema),
  };
}

export async function loadAiriWidgets(serviceRequest: AiriWidgetServiceRequest): Promise<readonly AiriWidgetRecord[]> {
  const response = await serviceRequest<unknown>("/api/widgets", { method: "GET" });
  if (!isObject(response) || !Array.isArray(response.widgets)) throw new Error("Widget service returned an invalid response.");
  return response.widgets.map(parseWidget).sort((left, right) => left.id.localeCompare(right.id));
}

export function AiriWidgetSchemaRenderer({ node, onEmit }: WidgetRendererProps): ReactNode {
  if (node.type === "container") {
    return <div className="demo-airi-widget__container" data-orientation={node.orientation} style={{ gap: `${node.gap}px` }}>
      {node.children.map((child, index) => <AiriWidgetSchemaRenderer key={`${child.type}-${index}`} node={child} onEmit={onEmit} />)}
    </div>;
  }
  if (node.type === "text") {
    return <p className="demo-airi-widget__text" data-tone={node.tone} data-variant={node.variant}>{node.text}</p>;
  }
  if (node.type === "metric") {
    return <dl className="demo-airi-widget__metric" data-tone={node.tone}><div><dt>{node.label}</dt><dd>{node.value}</dd></div></dl>;
  }
  if (node.type === "progress") {
    return <label className="demo-airi-widget__progress"><span>{node.label}</span><progress max={1} value={node.value}>{Math.round(node.value * 100)}%</progress></label>;
  }
  return <button className="demo-airi-widget__button" disabled={node.disabled} onClick={() => onEmit(node.action.event)} type="button">{node.label}</button>;
}

function AiriWidgetCard({ locale, widget }: { readonly locale: Locale; readonly widget: AiriWidgetRecord }) {
  const text = copy[locale];
  const [emitted, setEmitted] = useState("");
  return <article className="demo-airi-widget" data-placement={widget.manifest.placement} data-phase={widget.phase}>
    <header className="demo-airi-widget__header">
      <div><span>{text.placements[widget.manifest.placement]}</span><h3>{widget.manifest.title}</h3></div>
      <small>v{widget.manifest.version}</small>
    </header>
    {widget.manifest.description ? <p className="demo-airi-widget__description">{widget.manifest.description}</p> : null}
    <div className="demo-airi-widget__surface">
      <AiriWidgetSchemaRenderer node={widget.schema} onEmit={setEmitted} />
    </div>
    <footer className="demo-airi-widget__footer"><span>{text.by}: {widget.pluginId}</span><span>{text.revision}: {widget.revision}</span></footer>
    {emitted ? <p className="demo-airi-widget__event" data-event={emitted} role="status">{text.emitted(emitted)}</p> : null}
  </article>;
}

export function AiriWidgetGallery({ locale, serviceRequest }: AiriWidgetGalleryProps) {
  const text = copy[locale];
  const [widgets, setWidgets] = useState<readonly AiriWidgetRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [requestRevision, setRequestRevision] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void loadAiriWidgets(serviceRequest).then((next) => {
      if (active) setWidgets(next);
    }).catch((reason: unknown) => {
      if (active) {
        setWidgets([]);
        setError(reason instanceof Error ? reason.message : String(reason));
      }
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [requestRevision, serviceRequest]);

  return <section className="demo-airi-widget-gallery" aria-labelledby="airi-widget-gallery-title">
    <header className="demo-airi-widget-gallery__header">
      <div><span>{text.eyebrow}</span><h2 id="airi-widget-gallery-title">{text.title}</h2><p>{text.description}</p></div>
      <span className="demo-airi-widget-gallery__count" aria-label={text.count(widgets.length)}>{widgets.length}</span>
    </header>
    <div className="demo-airi-widget-gallery__content" aria-busy={loading} aria-live="polite">
      {loading ? <p className="demo-airi-widget-gallery__state" data-state="loading">{text.loading}</p> : null}
      {!loading && error ? <div className="demo-airi-widget-gallery__state" data-state="error" role="alert"><strong>{text.error}</strong><small>{error}</small><button onClick={() => setRequestRevision((current) => current + 1)} type="button">{text.retry}</button></div> : null}
      {!loading && !error && widgets.length === 0 ? <p className="demo-airi-widget-gallery__state" data-state="empty">{text.empty}</p> : null}
      {!loading && !error && widgets.length > 0 ? <div className="demo-airi-widget-gallery__grid">{widgets.map((widget) => <AiriWidgetCard key={`${widget.pluginId}:${widget.id}`} locale={locale} widget={widget} />)}</div> : null}
    </div>
  </section>;
}
