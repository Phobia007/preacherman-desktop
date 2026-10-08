import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useThree } from "@react-three/fiber";
import { InteractiveAvatarViewport, avatarDefaultActionId, avatarModelName } from "@preacherman/avatar-renderer";
import { localAvatarAssetBaseUrl } from "../../avatar/avatarAssets";
import type { ModelId } from "../../preferences";
import { revealMarketDetails, type MarketDetailsPhase } from "./marketEntrance";
import { createMarketSelection, marketSelectionTotal } from "./marketSelection";
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
export function MarketDetails({ modelId, appearance, panelRef, lensActive, onClose, phase, onRevealComplete }: {
  modelId: ModelId;
  appearance: "light" | "dark";
  panelRef: RefObject<HTMLElement>;
  lensActive: boolean;
  onClose: () => void;
  phase: MarketDetailsPhase;
  onRevealComplete: () => void;
}) {
  const [view, setView] = useState<MarketView>("Front");
  const [rotation, setRotation] = useState(0);
  const rotationRef = useRef(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const [selection] = useState(() => createMarketSelection(modelId));
  const total = marketSelectionTotal(selection);
  const purchaseDialog = useRef<HTMLDialogElement>(null);
  const ready = useCallback(() => setStatus("ready"), []);
  const failed = useCallback(() => setStatus("error"), []);

  useEffect(() => {
    if (!panelRef.current || !["model", "content", "hide-content", "hide-model"].includes(phase)) return;
    if (phase === "model" && status === "loading") return;
    let disposed = false;
    const part = phase === "content" || phase === "hide-content" ? "content" : "model";
    const motion = revealMarketDetails(panelRef.current, part, matchMedia("(prefers-reduced-motion: reduce)").matches, phase.startsWith("hide-") ? "out" : "in");
    void motion.finished.then(() => {
      if (!disposed) onRevealComplete();
    }).catch(() => { /* Interrupted entrance must never reveal a stale product. */ });
    return () => { disposed = true; motion.cancel(); };
  }, [phase, status, panelRef, onRevealComplete]);

  useEffect(() => { panelRef.current?.focus({ preventScroll: true }); }, [panelRef]);
  useEffect(() => {
    panelRef.current?.toggleAttribute("inert", lensActive || phase !== "complete");
    if (!lensActive && phase === "complete") panelRef.current?.focus({ preventScroll: true });
  }, [lensActive, phase, panelRef]);
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
      if (event.key === "Escape" && !lensActive && !purchaseDialog.current?.open) { event.preventDefault(); onClose(); }
    };
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("keydown", close);
    };
  }, [onClose, lensActive]);

  return (
    <section ref={panelRef} className="market-details" aria-label={`${avatarModelName(modelId)} details`}
      tabIndex={-1} data-model-id={modelId} data-view={view} data-status={status} data-reveal={phase} aria-busy={phase !== "complete"}>
      <nav className="market-details__views" aria-label="Model views">
        {MARKET_VIEWS.map(label => <button key={label} aria-label={label}
          type="button" aria-pressed={view === label} onClick={() => setView(label)}>{label}</button>)}
      </nav>
      <button type="button" className="market-details__back" aria-label="Back to Market" onClick={onClose}>
        <svg width="68" height="24" viewBox="0 0 68 24" fill="none" aria-hidden="true"><path d="M66 12H3M12 3L3 12L12 21" stroke="currentColor" strokeWidth="1.25" /></svg>
      </button>
      <div className="market-details__model">
        {!["exiting", "unfrost", "returning"].includes(phase) && <InteractiveAvatarViewport key={attempt} modelId={modelId} assetBaseUrl={localAvatarAssetBaseUrl(modelId)}
          actionId={avatarDefaultActionId(modelId)} quality="high" pose="standby" environment="cinematic" isolateCompanion
          appearance={appearance} platformStyle="ring"
          cameraFraming={view === "Zoom In" ? "portrait" : "full-body"} rotationOffsetY={rotation}
          renderActive={!lensActive} onReady={ready} onError={failed} sceneContent={<DetailsSceneCapture />} />}
        {status === "loading" && <div className="market-details__status" role="status">Loading {avatarModelName(modelId)}…</div>}
        {status === "error" && <div className="market-details__status" role="alert"><p>The model could not be loaded.</p>
          <button type="button" onClick={() => { setStatus("loading"); setAttempt(value => value + 1); }}>Try again</button></div>}
      </div>
      <div className="market-details__options">
        <p className="market-details__price">Your current selection: <output aria-live="polite">{total.toLocaleString("en-US")}</output></p>
        <button type="button" className="market-details__purchase" onClick={() => purchaseDialog.current?.showModal()}>Purchase</button>
      </div>
      <dialog ref={purchaseDialog} className="market-details__purchase-dialog" aria-labelledby="market-purchase-title">
        <h2 id="market-purchase-title">Purchase</h2>
        <p>{avatarModelName(selection.modelId)}</p>
        <p>Your current selection: <output>{total.toLocaleString("en-US")}</output></p>
        <p className="market-details__purchase-note">Checkout is not available yet.</p>
        <form method="dialog"><button className="market-details__purchase" autoFocus>Close</button></form>
      </dialog>
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
  // Keep the live frosted desktop visible through the lens; capture only foreground content.
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
  const footer = panel.querySelector<HTMLElement>(".market-details__options")!;
  paintText(footer, document);
  const purchase = footer.querySelector("button")!.getBoundingClientRect();
  ctx.strokeStyle = style.getPropertyValue("--demo-theme-market-border").trim();
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect((purchase.left - bounds.left) * sx, (purchase.top - bounds.top) * sy, purchase.width * sx, purchase.height * sy, purchase.height * sy / 2);
  ctx.stroke();
  const back = panel.querySelector(".market-details__back")!.getBoundingClientRect();
  ctx.strokeStyle = style.getPropertyValue("--demo-theme-market-text").trim(); ctx.lineWidth = 1.25;
  const x = (back.left - bounds.left) * sx, y = (back.top - bounds.top) * sy + 22;
  ctx.beginPath(); ctx.moveTo(x + 66, y); ctx.lineTo(x + 3, y); ctx.lineTo(x + 12, y - 9);
  ctx.moveTo(x + 3, y); ctx.lineTo(x + 12, y + 9); ctx.stroke();
  return canvas;
}
