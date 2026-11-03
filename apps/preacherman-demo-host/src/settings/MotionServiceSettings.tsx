import { useEffect, useRef, useState } from "react";
import { preachermanServiceRequest } from "../preacherman/capabilityClient";
import { characterMotionRequest, type CharacterMotionSettings } from "../motion/characterMotion";
import "./execution-mode.css";
import "./voice-service.css";

interface Status { state: string; starting: boolean; message?: string }
export function MotionServiceSettings({ characterId, onOpenAction }: { characterId: string; onOpenAction?: () => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [config, setConfig] = useState<CharacterMotionSettings | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const life = useRef(new AbortController());
  const refresh = async (start = false) => {
    setBusy(true); setError("");
    const signal = life.current.signal;
    try {
      const [next, motion] = await Promise.all([
        preachermanServiceRequest<Status>(start ? "/api/motion/connect" : "/api/motion/health", {
          method: start ? "POST" : "GET", signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]),
        }), characterMotionRequest(characterId, signal),
      ]);
      if (!signal.aborted) { setStatus(next); setConfig(motion); }
    } catch (reason) { if (!signal.aborted) setError(reason instanceof Error ? reason.message : "Could not connect to motion service."); }
    finally { if (!signal.aborted) setBusy(false); }
  };
  useEffect(() => { life.current = new AbortController(); void refresh(); return () => life.current.abort(); }, [characterId]);
  useEffect(() => {
    if (!status?.starting || busy) return;
    const timer = setTimeout(() => void refresh(), 2000); return () => clearTimeout(timer);
  }, [status, busy]);
  return <section className="execution-mode voice-service" aria-label="Motion Service configuration" aria-busy={busy} lang="en">
    <div className="voice-service__heading"><h3>Speech2Motion</h3><span className="voice-service__status" role="status">{status?.state === "ready" ? "Connected" : status?.starting ? "Starting…" : status ? "Offline" : "Checking…"}</span></div>
    <p className="execution-mode__intro">Your character moves with each spoken reply. Head, shoulder and hand gestures follow the voice and settle when you interrupt.</p>
    <div className="voice-service__library">
      <h3>Local motion</h3><p className="execution-mode__hint">Starts with Preacherman. If motion is unavailable, your character keeps its signature idle and the conversation continues.</p>
      <div className="execution-mode__actions"><button type="button" disabled={busy || status?.starting} onClick={() => void refresh(true)}>{status?.state === "ready" ? "Refresh connection" : "Reconnect"}</button></div>
    </div>
    {status?.message && status.state !== "ready" && <p role="status" className="execution-mode__hint">{status.message}</p>}
    {error && <p role="alert" className="execution-mode__error">{error}</p>}
    <div className="voice-service__next"><div><h3>Character motion</h3><p className="execution-mode__hint">{config ? config.enabled ? `${config.style[0].toUpperCase()}${config.style.slice(1)} gestures applied` : "Signature idle applied" : "Choose a movement style in Appearance."}</p></div><button type="button" onClick={onOpenAction}>Open Action</button></div>
  </section>;
}
