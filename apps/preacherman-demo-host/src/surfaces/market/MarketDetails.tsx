import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useThree } from "@react-three/fiber";
import { InteractiveAvatarViewport, avatarDefaultActionId, avatarModelName } from "@preacherman/avatar-renderer";
import { localAvatarAssetBaseUrl } from "../../avatar/avatarAssets";
import type { ModelId } from "../../preferences";
import "./market-details.css";

export const MARKET_VIEWS = ["Front", "Side", "Back", "Zoom In"] as const;
type MarketView = typeof MARKET_VIEWS[number];
const CAPTURE_EVENT = "preacherman:market-details-frame";

function DetailsSceneCapture() {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    const capture = (event: Event) => {
      gl.render(scene, camera);
      (event as CustomEvent<(canvas: HTMLCanvasElement) => void>).detail(gl.domElement);
    };
    window.addEventListener(CAPTURE_EVENT, capture);
    return () => window.removeEventListener(CAPTURE_EVENT, capture);
  }, [gl, scene, camera]);
  return null;
}

/** The selected product owns this viewport. It never writes the active companion preference. */
export function MarketDetails({ modelId, panelRef, lensActive, onClose }: {
  modelId: ModelId;
  panelRef: RefObject<HTMLElement>;
  lensActive: boolean;
  onClose: () => void;
}) {
  const [view, setView] = useState<MarketView>("Front");
  const [rotation, setRotation] = useState(0);
  const rotationRef = useRef(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const footer = useRef<HTMLIFrameElement>(null);
  const ready = useCallback(() => setStatus("ready"), []);
  const failed = useCallback(() => setStatus("error"), []);

  useEffect(() => { panelRef.current?.focus({ preventScroll: true }); }, [panelRef]);
  useEffect(() => {
    panelRef.current?.toggleAttribute("inert", lensActive);
  }, [lensActive, panelRef]);
  useEffect(() => {
    const target = view === "Side" ? Math.PI / 2 : view === "Back" ? Math.PI : 0;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      rotationRef.current = target; setRotation(target); return;
    }
    const start = performance.now(), from = rotationRef.current;
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / 520);
      rotationRef.current = from + (target - from) * (1 - (1 - progress) ** 3);
      setRotation(rotationRef.current);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [view]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !lensActive) { event.preventDefault(); onClose(); }
    };
    window.addEventListener("keydown", close);
    const doc = footer.current?.contentDocument;
    doc?.addEventListener("keydown", close);
    const attach = () => footer.current?.contentDocument?.addEventListener("keydown", close);
    const frame = footer.current;
    frame?.addEventListener("load", attach);
    return () => {
      window.removeEventListener("keydown", close);
      doc?.removeEventListener("keydown", close);
      frame?.contentDocument?.removeEventListener("keydown", close);
      frame?.removeEventListener("load", attach);
    };
  }, [onClose, lensActive]);

  return (
    <section ref={panelRef} className="market-details" aria-label={`${avatarModelName(modelId)} details`}
      tabIndex={-1} data-model-id={modelId} data-view={view} data-status={status}>
      <nav className="market-details__views" aria-label="Model views">
        {MARKET_VIEWS.map(label => <button key={label} aria-label={label}
          type="button" aria-pressed={view === label} onClick={() => setView(label)}>{label}</button>)}
      </nav>
      <button type="button" className="market-details__back" aria-label="Back to Market" onClick={onClose}>
        <svg width="68" height="24" viewBox="0 0 68 24" fill="none" aria-hidden="true"><path d="M66 12H3M12 3L3 12L12 21" stroke="currentColor" strokeWidth="1.25" /></svg>
      </button>
      <div className="market-details__model">
        <InteractiveAvatarViewport key={attempt} modelId={modelId} assetBaseUrl={localAvatarAssetBaseUrl(modelId)}
          actionId={avatarDefaultActionId(modelId)} quality="high" pose="standby" environment="cinematic" isolateCompanion
          cameraFraming={view === "Zoom In" ? "portrait" : "full-body"} rotationOffsetY={rotation}
          renderActive={!lensActive} onReady={ready} onError={failed} sceneContent={<DetailsSceneCapture />} />
        {status === "loading" && <div className="market-details__status" role="status">Loading {avatarModelName(modelId)}…</div>}
        {status === "error" && <div className="market-details__status" role="alert"><p>The model could not be loaded.</p>
          <button type="button" onClick={() => { setStatus("loading"); setAttempt(value => value + 1); }}>Try again</button></div>}
      </div>
      <iframe ref={footer} className="market-details__options" src="/market-love/love-configurator.html?footer=1"
        title="Product options" referrerPolicy="no-referrer" />
    </section>
  );
}

/** Capture the actual selected model for the existing Preacherman lens effect. */
export async function captureMarketDetails(panel: HTMLElement, signal: AbortSignal): Promise<HTMLCanvasElement> {
  if (signal.aborted) throw new DOMException("Capture cancelled", "AbortError");
  const bounds = panel.getBoundingClientRect(), style = getComputedStyle(panel);
  const canvas = document.createElement("canvas");
  canvas.width = panel.clientWidth; canvas.height = panel.clientHeight;
  const ctx = canvas.getContext("2d")!;
  const sx = canvas.width / bounds.width, sy = canvas.height / bounds.height;
  ctx.fillStyle = style.getPropertyValue("--demo-theme-market-details-solid").trim();
  ctx.fillRect(0, 100, canvas.width, canvas.height - 100);
  window.dispatchEvent(new CustomEvent(CAPTURE_EVENT, { detail: (frame: HTMLCanvasElement) => {
    const box = frame.getBoundingClientRect();
    ctx.drawImage(frame, (box.left - bounds.left) * sx, (box.top - bounds.top) * sy, box.width * sx, box.height * sy);
  } }));
  const paintText = (root: Node, doc: Document, offsetX = 0, offsetY = 0) => {
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const range = doc.createRange();
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement, text = node.textContent?.trim();
      if (!parent || !text || parent.closest("style,script")) continue;
      const ink = doc.defaultView!.getComputedStyle(parent);
      if (ink.display === "none" || ink.visibility === "hidden" || ink.opacity === "0") continue;
      range.selectNodeContents(node);
      const rect = range.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      ctx.font = `${ink.fontWeight} ${parseFloat(ink.fontSize) * sx}px ${ink.fontFamily}`;
      ctx.fillStyle = ink.color; ctx.textBaseline = "middle";
      ctx.fillText(ink.textTransform === "uppercase" ? text.toUpperCase() : text,
        (rect.left + offsetX - bounds.left) * sx, (rect.top + rect.height / 2 + offsetY - bounds.top) * sy);
    }
  };
  paintText(panel.querySelector("nav")!, document);
  const footer = panel.querySelector("iframe")!, doc = footer.contentDocument;
  const root = doc?.getElementById("configurator")?.shadowRoot;
  if (doc && root) { const box = footer.getBoundingClientRect(); paintText(root, doc, box.left, box.top); }
  const back = panel.querySelector(".market-details__back")!.getBoundingClientRect();
  ctx.strokeStyle = style.getPropertyValue("--demo-theme-market-text").trim(); ctx.lineWidth = 1.25;
  const x = (back.left - bounds.left) * sx, y = (back.top - bounds.top) * sy + 22;
  ctx.beginPath(); ctx.moveTo(x + 66, y); ctx.lineTo(x + 3, y); ctx.lineTo(x + 12, y - 9);
  ctx.moveTo(x + 3, y); ctx.lineTo(x + 12, y + 9); ctx.stroke();
  return canvas;
}
