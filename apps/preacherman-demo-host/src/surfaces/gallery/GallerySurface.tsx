import {
  type AnimationEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { preachermanServiceRequest } from "../../preacherman/capabilityClient";
import "./gallery-surface.css";

type GalleryAppearance = "light" | "dark";

type GalleryThemeMessage = {
  type: "gallery-theme";
  appearance: GalleryAppearance;
  text: string;
  focus: string;
  compositeKey: string;
  hideProjectCards: boolean;
  hideFeaturedControl: boolean;
};

type GalleryProviderModel = {
  id: string;
  label: string;
};

type GalleryProvider = {
  id: string;
  label: string;
  models: GalleryProviderModel[];
};

interface GallerySurfaceProps {
  hideProjectCards?: boolean;
}

const gallerySourcePath = "/gallery-v3/portfolio/index.html";
const galleryFullSourcePath = "/gallery-v3/portfolio/full/index.html";
type GalleryRevealState =
  | "loading"
  | "scanning"
  | "waiting"
  | "opening"
  | "complete";

function getAppearance(): GalleryAppearance {
  return document.documentElement.dataset.appearance === "dark" ? "dark" : "light";
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : null;
}

async function requestJson(path: string): Promise<Record<string, unknown>> {
  const payload = record(await preachermanServiceRequest<unknown>(path, { signal: AbortSignal.timeout(15000) }));
  if (!payload) throw new Error("Local service returned an invalid response.");
  return payload;
}

async function loadChatProviders(): Promise<GalleryProvider[]> {
  const catalog = await requestJson("/api/providers/catalog");
  const providers = Array.isArray(catalog.providers) ? catalog.providers : [];
  const readyProviders = providers.flatMap((value) => {
    const provider = record(value);
    const capabilities = record(provider?.capabilities);
    const chat = record(capabilities?.chat);
    return provider && typeof provider.id === "string" && typeof provider.label === "string" && chat?.state === "ready"
      ? [{ id: provider.id, label: provider.label }]
      : [];
  });

  const results = await Promise.all(readyProviders.map(async (provider) => {
    try {
      const payload = await requestJson(`/api/providers/${encodeURIComponent(provider.id)}/models`);
      const result = record(payload.result) ?? payload;
      const models = Array.isArray(result.models) ? result.models.flatMap((value) => {
        const model = record(value);
        return model && typeof model.id === "string" && typeof model.label === "string" && model.capability === "chat"
          ? [{ id: model.id, label: model.label }]
          : [];
      }) : [];
      return models.length ? { ...provider, models } : null;
    } catch {
      return null;
    }
  }));

  return results.filter((provider): provider is GalleryProvider => provider !== null);
}

export function GallerySurface({ hideProjectCards = false }: GallerySurfaceProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const revealFrameRef = useRef<number | null>(null);
  const reduceMotionRef = useRef(
    window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [sourceReady, setSourceReady] = useState(false);
  const [scanComplete, setScanComplete] = useState(false);
  const [revealState, setRevealState] = useState<GalleryRevealState>("loading");
  const [galleryView, setGalleryView] = useState<"featured" | "full">("featured");
  const [profileOpen, setProfileOpen] = useState(false);
  const showEmptyFeatured = hideProjectCards && galleryView === "featured";

  const sendThemeToFrame = useCallback(() => {
    const frameWindow = frameRef.current?.contentWindow;

    if (!frameWindow) {
      return;
    }

    const root = document.documentElement;
    const themeSource = document.querySelector<HTMLElement>(".demo-app-shell") ?? root;
    const rootStyles = getComputedStyle(themeSource);
    const message: GalleryThemeMessage = {
      type: "gallery-theme",
      appearance: getAppearance(),
      text: rootStyles
        .getPropertyValue("--demo-theme-gallery-control-hover")
        .trim(),
      focus: rootStyles.getPropertyValue("--demo-theme-focus").trim(),
      compositeKey: rootStyles
        .getPropertyValue("--demo-theme-gallery-composite-key")
        .trim(),
      hideProjectCards: showEmptyFeatured,
      hideFeaturedControl: hideProjectCards,
    };
    const targetOrigin = window.location.origin === "null" ? "*" : window.location.origin;

    frameWindow.postMessage(message, targetOrigin);
  }, [hideProjectCards, showEmptyFeatured]);

  const sendProviderCatalogToFrame = useCallback(async () => {
    const requestedFrame = frameRef.current?.contentWindow;
    if (!requestedFrame) return;
    const targetOrigin = window.location.origin === "null" ? "*" : window.location.origin;
    try {
      const execution = await requestJson("/api/settings/execution");
      const connections = Array.isArray(execution.connections) ? execution.connections : [];
      const providers: GalleryProvider[] = connections.flatMap(value => {
        const connection = record(value);
        return connection && typeof connection.id === "string" && typeof connection.name === "string" && typeof connection.model === "string" && connection.keySaved
          ? [{ id: connection.id, label: connection.name, models: Array.isArray(connection.models) && connection.models.length
            ? connection.models as GalleryProviderModel[] : [{ id: connection.model, label: connection.model }] }] : [];
      });
      const active = record(execution.active);
      const local = record(execution.local);
      if (typeof local?.agentId === "string") providers.push({ id: local.agentId, label: "Local CLI · approval required", models: [{ id: "default", label: String(local.label || local.agentId) + " · default" }] });
      const legacy = await loadChatProviders().catch(() => []);
      providers.push(...legacy.filter(item => item.id !== "deepseek" || !providers.some(candidate => candidate.id === "legacy-deepseek")));
      if (frameRef.current?.contentWindow === requestedFrame) {
        requestedFrame.postMessage({ type: "gallery-provider-catalog", providers, active }, targetOrigin);
      }
    } catch {
      if (frameRef.current?.contentWindow === requestedFrame) {
        requestedFrame.postMessage({ type: "gallery-provider-catalog", providers: [], error: true }, targetOrigin);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const dispatch = async (data: Record<string, unknown>, target: Window) => {
      const requestId = data.requestId;
      if (typeof requestId !== "string" || requestId.length > 100) return;
      const call = (path: string, body?: unknown) => preachermanServiceRequest<Record<string, unknown>>(path, {
        ...(body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(70000)]),
      });
      try {
        let result;
        if (data.action === "chat") {
          const selection = record(data.selection);
          const messages = Array.isArray(data.messages) ? data.messages : [];
          const settings = await call("/api/settings/execution");
          const active = record(settings.local);
          if (active && selection?.providerId === active.agentId) {
            const last = record(messages[messages.length - 1]);
            result = await call("/api/execution/local-turn", { agentId: active.agentId, workspaceId: active.workspaceId, objective: last?.content });
          } else {
            result = await call("/api/execution/chat", { connectionId: selection?.providerId === "deepseek" ? "legacy-deepseek" : selection?.providerId, model: selection?.modelId, messages });
          }
        } else if (["status", "approve", "reject", "cancel"].includes(String(data.action)) && typeof data.taskId === "string" && /^[A-Za-z0-9_-]{1,120}$/.test(data.taskId)) {
          result = await call("/api/tasks/" + encodeURIComponent(data.taskId) + (data.action === "status" ? "" : "/commands"),
            data.action === "status" ? undefined : { type: data.action, approvalId: data.approvalId });
        } else throw new Error("Unsupported task operation.");
        if (!controller.signal.aborted) target.postMessage({ type: "gallery-execution-result", requestId, result }, window.location.origin === "null" ? "*" : window.location.origin);
      } catch (error) {
        if (!controller.signal.aborted) target.postMessage({ type: "gallery-execution-result", requestId, error: error instanceof Error ? error.message : "Request failed." }, window.location.origin === "null" ? "*" : window.location.origin);
      }
    };
    const handleMessage = (event: MessageEvent<unknown>) => {
      if (event.source !== frameRef.current?.contentWindow) {
        return;
      }

      if (window.location.origin !== "null" && event.origin !== window.location.origin) {
        return;
      }

      if (
        typeof event.data === "object" &&
        event.data !== null &&
        "type" in event.data &&
        event.data.type === "gallery-source-ready"
      ) {
        setSourceReady(true);
        sendThemeToFrame();
      } else if (
        typeof event.data === "object" &&
        event.data !== null &&
        "type" in event.data &&
        event.data.type === "gallery-provider-request"
      ) {
        void sendProviderCatalogToFrame();
      } else if (record(event.data)?.type === "gallery-execution-request") {
        void dispatch(event.data as Record<string, unknown>, frameRef.current!.contentWindow!);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => { window.removeEventListener("message", handleMessage); controller.abort(); };
  }, [sendProviderCatalogToFrame, sendThemeToFrame]);

  useEffect(() => {
    if (reduceMotionRef.current) {
      return;
    }

    revealFrameRef.current = window.requestAnimationFrame(() => {
      revealFrameRef.current = window.requestAnimationFrame(() => {
        setRevealState("scanning");
        revealFrameRef.current = null;
      });
    });
  }, []);

  useEffect(() => {
    if (!sourceReady) {
      return;
    }

    if (reduceMotionRef.current) {
      setRevealState("complete");
      return;
    }

    if (scanComplete) {
      setRevealState("opening");
    }
  }, [scanComplete, sourceReady]);

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(sendThemeToFrame);

    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-appearance"],
    });

    return () => observer.disconnect();
  }, [sendThemeToFrame]);

  useEffect(
    () => () => {
      if (revealFrameRef.current !== null) {
        window.cancelAnimationFrame(revealFrameRef.current);
      }
    },
    [],
  );

  const handleRevealEnd = useCallback((event: AnimationEvent<HTMLIFrameElement>) => {
    if (
      event.currentTarget === event.target &&
      event.animationName === "gallery-surface-open"
    ) {
      setRevealState("complete");
    }
  }, []);

  const handleScanEnd = useCallback((event: AnimationEvent<HTMLSpanElement>) => {
    if (
      event.currentTarget === event.target &&
      event.animationName === "gallery-surface-scan-line"
    ) {
      setScanComplete(true);
      setRevealState("waiting");
    }
  }, []);

  return (
    <section
      aria-busy={!sourceReady}
      aria-label="Gallery"
      className="gallery-surface"
      data-featured-empty={showEmptyFeatured ? "true" : "false"}
      data-reveal-state={revealState}
    >
      <div className="gallery-surface__mask">
        <iframe
          className="gallery-surface__frame"
          onAnimationEnd={handleRevealEnd}
          onLoad={sendThemeToFrame}
          ref={frameRef}
          src={galleryView === "full" ? galleryFullSourcePath : gallerySourcePath}
          title="Gallery portfolio"
        />
        {!sourceReady ? (
          <p aria-live="polite" className="gallery-surface__status" role="status">
            Loading gallery
          </p>
        ) : null}
      </div>
      {showEmptyFeatured ? (
        <div className="gallery-surface__empty-chrome">
          <button
            aria-expanded={profileOpen}
            className="gallery-surface__profile-toggle"
            onClick={() => setProfileOpen((open) => !open)}
            type="button"
          >
            Preacherman
          </button>
          {profileOpen ? (
            <div className="gallery-surface__profile" role="region" aria-label="Preacherman profile">
              <p>
                <span>一个智能容器</span>
                <span>Preacherman 统一管理虚拟人物资产，兼容通用引擎、真实工具完成任务。</span>
                <span>在这里管理一位能持续学习、可部署、真正做事的人工智能。</span>
                <span>信任你在虚拟世界里的第二身份</span>
              </p>
              <ul aria-label="Preacherman links">
                <li><a href="https://www.instagram.com/jesperlandberg222/" rel="noopener" target="_blank">Instagram</a></li>
                <li><a href="https://www.linkedin.com/in/jesper-landberg-ba2984256/" rel="noopener" target="_blank">LinkedIn</a></li>
                <li><a href="mailto:jesper@alpacka.studio">邮件</a></li>
              </ul>
            </div>
          ) : null}
          <button
            className="gallery-surface__full-link"
            onClick={() => {
              setProfileOpen(false);
              setGalleryView("full");
            }}
            type="button"
          >
            全部
          </button>
        </div>
      ) : null}
      <span
        aria-hidden="true"
        className="gallery-surface__reveal-line"
        onAnimationEnd={handleScanEnd}
      />
      <span aria-hidden="true" className="gallery-surface__interaction-guard" />
    </section>
  );
}
