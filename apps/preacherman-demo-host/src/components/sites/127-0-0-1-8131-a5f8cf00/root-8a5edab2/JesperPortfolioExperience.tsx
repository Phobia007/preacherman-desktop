import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import type { Appearance, ModelId } from "../../../../preferences";
import "./jesper-portfolio-experience.css";

const PORTFOLIO_SOURCE =
  "/sites/127-0-0-1-8131-a5f8cf00/root-8a5edab2/index.html?revision=gallery-runtime-v12";
const BACKGROUND_PRELOAD_DELAY_MS = 12_000;

const DETAIL_ACTION_THEME_TOKENS = [
  "rest-bg",
  "rest-border",
  "rest-text",
  "fill",
  "fill-text",
  "shadow",
  "hover-shadow",
  "flash",
  "focus",
] as const;

type PortfolioState = "loading" | "ready" | "error";

interface JesperPortfolioExperienceProps {
  readonly active: boolean;
  readonly activeModelId: ModelId | null;
  readonly appearance: Appearance;
  readonly onDetailModelVisibilityChange: (modelId: ModelId, visible: boolean) => void;
  readonly onActiveModelChange: (modelId: ModelId | null) => void;
}

export function JesperPortfolioExperience({
  active,
  activeModelId,
  appearance,
  onDetailModelVisibilityChange,
  onActiveModelChange,
}: JesperPortfolioExperienceProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [frameKey, setFrameKey] = useState(0);
  const [runtimePrepared, setRuntimePrepared] = useState(false);
  const [shouldLoad, setShouldLoad] = useState(active);
  const [state, setState] = useState<PortfolioState>("loading");

  useEffect(() => {
    if (active) {
      setShouldLoad(true);
      return;
    }
    if (shouldLoad) return;

    const preloadTimer = window.setTimeout(
      () => setShouldLoad(true),
      BACKGROUND_PRELOAD_DELAY_MS,
    );
    return () => window.clearTimeout(preloadTimer);
  }, [active, shouldLoad]);

  useEffect(() => {
    if (state !== "ready" || runtimePrepared) return;
    let prepareTimer = 0;
    const waitForRuntime = () => {
      if (frameRef.current?.contentDocument?.readyState === "complete") {
        setRuntimePrepared(true);
        return;
      }
      prepareTimer = window.setTimeout(waitForRuntime, 100);
    };
    waitForRuntime();
    return () => window.clearTimeout(prepareTimer);
  }, [runtimePrepared, state]);

  useEffect(() => {
    if (!shouldLoad) return;
    frameRef.current?.contentWindow?.postMessage(
      { type: "preacherman-gallery-visibility", active },
      window.location.origin,
    );
  }, [active, runtimePrepared, shouldLoad]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frameRef.current?.contentWindow) return;
      if (event.data?.type === "preacherman-gallery-character-detail") {
        const modelId = event.data?.modelId;
        if (modelId !== "cortana" && modelId !== "zima") return;
        const path = typeof event.data?.path === "string"
          ? event.data.path.replace(/\/index\.html$/, "").replace(/\/$/, "")
          : "";
        const expectedPath = modelId === "cortana"
          ? "/projects/the-lookback"
          : "/projects/book-of-happiness";
        onDetailModelVisibilityChange(
          modelId,
          event.data?.visible === true && path.endsWith(expectedPath),
        );
        return;
      }
      if (event.data?.type === "preacherman-gallery-model-ready") {
        const modelId = event.data?.modelId;
        if (modelId !== "cortana" && modelId !== "zima") return;
        frameRef.current?.contentWindow?.postMessage(
          {
            type: "preacherman-gallery-model-state",
            modelId,
            active: activeModelId === modelId,
          },
          window.location.origin,
        );
        return;
      }
      if (event.data?.type !== "preacherman-gallery-model-toggle") return;
      const modelId = event.data?.modelId;
      if (modelId !== "cortana" && modelId !== "zima") return;
      onActiveModelChange(activeModelId === modelId ? null : modelId);
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [activeModelId, onActiveModelChange, onDetailModelVisibilityChange]);

  useEffect(() => {
    if (state !== "ready") return;
    const frame = frameRef.current;
    if (!frame) return;
    const hostStyles = getComputedStyle(frame);
    for (const token of DETAIL_ACTION_THEME_TOKENS) {
      const value = hostStyles
        .getPropertyValue(`--demo-theme-gallery-detail-action-${token}`)
        .trim();
      if (value) {
        frame.contentDocument?.documentElement.style.setProperty(
          `--preacherman-gallery-detail-action-${token}`,
          value,
        );
      }
    }
    for (const modelId of ["cortana", "zima"] as const) {
      frame.contentWindow?.postMessage(
        {
          type: "preacherman-gallery-model-state",
          modelId,
          active: activeModelId === modelId,
        },
        window.location.origin,
      );
    }
  }, [activeModelId, appearance, state]);

  const retry = () => {
    setRuntimePrepared(false);
    setState("loading");
    setFrameKey((currentKey) => currentKey + 1);
  };

  const handleLoad = (event: SyntheticEvent<HTMLIFrameElement>) => {
    const frame = event.currentTarget;
    const frameDocument = frame.contentDocument;
    frameDocument?.body.classList.add("preview-ready");
    frameDocument?.body.setAttribute("aria-busy", "false");
    frameDocument?.querySelectorAll<HTMLElement>(
      '[data-od-id="loading-state"], #__nuxt > .bg-black > .fixed.inset-0.z-99.bg-black',
    ).forEach((loadingLayer) => {
      loadingLayer.hidden = true;
      loadingLayer.style.display = "none";
    });
    const legacyError = frameDocument?.querySelector<HTMLElement>('[data-od-id="error-state"]');
    if (legacyError) legacyError.hidden = true;
    if (frameDocument && !frameDocument.documentElement.dataset.preachermanGalleryNavigationBound) {
      frameDocument.documentElement.dataset.preachermanGalleryNavigationBound = "true";
      frameDocument.addEventListener("click", (clickEvent) => {
        const clickedElement = clickEvent.composedPath().find(
          (entry): entry is Element => typeof (entry as Element).closest === "function",
        );
        const target = clickedElement?.closest<HTMLElement>(
          '[data-od-id^="project-card-"][data-id]',
        );
        const projectId = target?.dataset.id;
        if (!projectId) return;
        clickEvent.preventDefault();
        clickEvent.stopImmediatePropagation();
        const projectUrl = new URL(
          `/sites/127-0-0-1-8131-a5f8cf00/root-8a5edab2/projects/${projectId}/index.html`,
          window.location.origin,
        );
        projectUrl.searchParams.set("revision", "gallery-runtime-v12");
        frame.contentWindow?.location.assign(projectUrl.href);
      }, true);
    }
    if (frameDocument && !frameDocument.querySelector('link[href*="preacherman-cortana-detail.css"]')) {
      const stylesheet = frameDocument.createElement("link");
      stylesheet.dataset.preachermanCortanaDetail = "style";
      stylesheet.rel = "stylesheet";
      stylesheet.href = "/sites/127-0-0-1-8131-a5f8cf00/root-8a5edab2/assets/preacherman-cortana-detail.css?revision=gallery-runtime-v12";
      frameDocument.head.append(stylesheet);
    }
    if (frameDocument && !frameDocument.querySelector('script[src*="preacherman-cortana-detail.js"]')) {
      const script = frameDocument.createElement("script");
      script.dataset.preachermanCortanaDetail = "script";
      script.src = "/sites/127-0-0-1-8131-a5f8cf00/root-8a5edab2/assets/preacherman-cortana-detail.js?revision=gallery-runtime-v12";
      frameDocument.head.append(script);
    }
    const revealModelUnderlay = () => {
      frameDocument?.documentElement.style.setProperty(
        "--preacherman-gallery-canvas",
        "rgba(0, 0, 0, 0)",
      );
      if (frameDocument) frameDocument.documentElement.style.colorScheme = "dark";
      const canvas = frameDocument?.querySelector("canvas");
      const context = canvas?.getContext("webgl2") ?? canvas?.getContext("webgl");
      context?.clearColor(0, 0, 0, 0);
    };
    revealModelUnderlay();
    let transparencyFrames = 0;
    const holdTransparentClear = () => {
      revealModelUnderlay();
      transparencyFrames += 1;
      if (transparencyFrames < 12) frame.contentWindow?.requestAnimationFrame(holdTransparentClear);
    };
    frame.contentWindow?.requestAnimationFrame(holdTransparentClear);
    const hostStyles = getComputedStyle(frame);
    for (const token of DETAIL_ACTION_THEME_TOKENS) {
      const value = hostStyles
        .getPropertyValue(`--demo-theme-gallery-detail-action-${token}`)
        .trim();
      if (value) {
        frameDocument?.documentElement.style.setProperty(
          `--preacherman-gallery-detail-action-${token}`,
          value,
        );
      }
    }
    for (const modelId of ["cortana", "zima"] as const) {
      frame.contentWindow?.postMessage(
        {
          type: "preacherman-gallery-model-state",
          modelId,
          active: activeModelId === modelId,
        },
        window.location.origin,
      );
    }
    frame.contentWindow?.postMessage(
      { type: "preacherman-gallery-visibility", active },
      window.location.origin,
    );
    frame.contentWindow?.setTimeout(() => {
      frame.contentWindow?.postMessage(
        { type: "preacherman-gallery-visibility", active },
        window.location.origin,
      );
    }, 0);
    setRuntimePrepared(true);
    setState("ready");
  };

  return (
    <section
      aria-label="Jesper Landberg portfolio"
      className="jesper-portfolio-experience"
    >
      {shouldLoad ? (
        <iframe
          key={frameKey}
          allow="autoplay; fullscreen"
          className="jesper-portfolio-experience__frame"
          onError={() => setState("error")}
          onLoad={handleLoad}
          ref={frameRef}
          src={PORTFOLIO_SOURCE}
          title="Jesper Landberg portfolio"
        />
      ) : null}

      {state === "loading" ? (
        <div
          aria-live="polite"
          className="jesper-portfolio-experience__loading"
          role="status"
        >
          <span aria-hidden="true" />
          <p>Loading Jesper Landberg portfolio…</p>
        </div>
      ) : null}

      {state === "error" ? (
        <div
          aria-live="assertive"
          className="jesper-portfolio-experience__error"
          role="alert"
        >
          <div className="jesper-portfolio-experience__error-panel">
            <strong>Portfolio unavailable</strong>
            <p>The local experience could not be loaded.</p>
            <button type="button" onClick={retry}>
              Try again
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
