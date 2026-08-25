import {
  type AnimationEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { runtimeAssetUrl } from "../../runtimeAssets";

import "./gallery-surface.css";

type GalleryAppearance = "light" | "dark";

type GalleryThemeMessage = {
  type: "gallery-theme";
  appearance: GalleryAppearance;
  text: string;
  focus: string;
  compositeKey: string;
};

const gallerySourcePath = runtimeAssetUrl("/gallery-v3/portfolio/index.html");
const gallerySourceOrigin = new URL(gallerySourcePath, window.location.href).origin;
type GalleryRevealState =
  | "loading"
  | "scanning"
  | "waiting"
  | "opening"
  | "complete";

function getAppearance(): GalleryAppearance {
  return document.documentElement.dataset.appearance === "dark" ? "dark" : "light";
}

export function GallerySurface() {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const revealFrameRef = useRef<number | null>(null);
  const reduceMotionRef = useRef(
    window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [sourceReady, setSourceReady] = useState(false);
  const [scanComplete, setScanComplete] = useState(false);
  const [revealState, setRevealState] = useState<GalleryRevealState>("loading");

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
    };
    frameWindow.postMessage(message, gallerySourceOrigin);
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent<unknown>) => {
      if (event.source !== frameRef.current?.contentWindow) {
        return;
      }

      if (event.origin !== gallerySourceOrigin) {
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
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [sendThemeToFrame]);

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
      data-reveal-state={revealState}
    >
      <div className="gallery-surface__mask">
        <iframe
          className="gallery-surface__frame"
          onAnimationEnd={handleRevealEnd}
          onLoad={sendThemeToFrame}
          ref={frameRef}
          src={gallerySourcePath}
          title="Gallery portfolio"
        />
        {!sourceReady ? (
          <p aria-live="polite" className="gallery-surface__status" role="status">
            Loading gallery
          </p>
        ) : null}
      </div>
      <span
        aria-hidden="true"
        className="gallery-surface__reveal-line"
        onAnimationEnd={handleScanEnd}
      />
      <span aria-hidden="true" className="gallery-surface__interaction-guard" />
    </section>
  );
}
