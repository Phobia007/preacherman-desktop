import {
  type AnimationEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { useExecutionFrameBridge } from "../../execution/useExecutionFrameBridge";
import { useTaskWorkspaceBridge } from "./useTaskWorkspaceBridge";
import "../gallery/gallery-surface.css";

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

interface TaskExperienceSurfaceProps {
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

export function TaskExperienceSurface({ hideProjectCards = false }: TaskExperienceSurfaceProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  useExecutionFrameBridge(frameRef);
  useTaskWorkspaceBridge(frameRef);
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

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow || (window.location.origin !== "null" && event.origin !== window.location.origin)) return;
      if (event.data?.type === "gallery-source-ready") { setSourceReady(true); sendThemeToFrame(); }
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
                <span>An intelligent home.</span>
                <span>One place for your virtual characters, engines, and tools.</span>
                <span>AI that keeps learning, goes with you, and gets things done.</span>
                <span>Your second identity in the virtual world.</span>
              </p>
              <ul aria-label="Preacherman links">
                <li><a href="https://www.instagram.com/jesperlandberg222/" rel="noopener" target="_blank">Instagram</a></li>
                <li><a href="https://www.linkedin.com/in/jesper-landberg-ba2984256/" rel="noopener" target="_blank">LinkedIn</a></li>
                <li><a href="mailto:jesper@alpacka.studio">Email</a></li>
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
