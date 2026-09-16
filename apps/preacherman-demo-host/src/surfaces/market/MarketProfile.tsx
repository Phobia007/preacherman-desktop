import { useEffect, useRef, useState, type RefObject } from "react";
import { captureMarketFrame } from "./captureMarketFrame";
import { TaskProfileLens } from "./TaskProfileLens";
import "./market-profile.css";

/** Task's original spatial lens, with Market's current image/text viewport as its source. */
export function MarketProfile({ disabled = false, open, onOpenChange, frameRef, captureSource, onLensActiveChange }: {
  disabled?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  frameRef: RefObject<HTMLIFrameElement>;
  captureSource?: (signal: AbortSignal) => Promise<HTMLCanvasElement>;
  onLensActiveChange: (active: boolean) => void;
}) {
  const toggleRef = useRef<HTMLButtonElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const lensRef = useRef<TaskProfileLens | null>(null);
  const [phase, setPhase] = useState("closed");
  const [error, setError] = useState("");

  useEffect(() => {
    if (lensRef.current) {
      setPhase(open ? "opening" : "closing");
      lensRef.current.setOpen(open);
      return;
    }
    if (!open) { setPhase("closed"); return; }
    const abort = new AbortController();
    const frame = frameRef.current;
    if (!frame) return;
    setPhase("preparing");
    setError("");
    (captureSource ? captureSource(abort.signal) : captureMarketFrame(frame, abort.signal)).then(source => {
      if (abort.signal.aborted || !hostRef.current) return;
      const lens = new TaskProfileLens(hostRef.current, source, (progress, settled) => {
        profileRef.current?.style.setProperty("--market-lens-progress", String(progress));
        if (hostRef.current) hostRef.current.dataset.progress = progress.toFixed(4);
        if (settled && progress === 0) {
          lensRef.current?.dispose();
          lensRef.current = null;
          onLensActiveChange(false);
          setPhase("closed");
        } else if (settled) setPhase("open");
      });
      lensRef.current = lens;
      onLensActiveChange(true);
      setPhase("opening");
      lens.setOpen(true);
    }).catch(reason => {
      if (abort.signal.aborted) return;
      setError("The spatial effect could not start. Close and try again.");
      setPhase("error");
      onLensActiveChange(false);
      console.error("Market profile lens:", reason);
    });
    return () => abort.abort();
  }, [open, frameRef, captureSource, onLensActiveChange]);

  useEffect(() => () => lensRef.current?.dispose(), []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
        toggleRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  return (
    <div ref={profileRef} className="market-profile" data-open={open} data-phase={phase}>
      <button ref={toggleRef} disabled={disabled} type="button" className="market-profile__toggle" aria-expanded={open}
        aria-controls="market-profile-content" onClick={() => onOpenChange(!open)}>
        {open ? "Close" : "Preacherman"}
      </button>
      <div className="market-profile__backdrop" hidden={phase === "closed" || phase === "preparing"} onClick={event => {
        const bounds = event.currentTarget.getBoundingClientRect();
        const distance = Math.hypot(event.clientX - bounds.left - bounds.width / 2, event.clientY - bounds.top - bounds.height / 2);
        if (distance > bounds.width * 0.2) {
          onOpenChange(false);
          toggleRef.current?.focus();
        }
      }}>
        <div ref={hostRef} className="market-profile__lens" aria-hidden="true" />
        <section id="market-profile-content" className="market-profile__content" role="region"
          aria-label="Preacherman profile" onClick={event => event.stopPropagation()}>
          {error && <p className="market-profile__error" role="alert">{error}</p>}
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
        </section>
      </div>
    </div>
  );
}
