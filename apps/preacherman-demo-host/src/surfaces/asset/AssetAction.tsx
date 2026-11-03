import { useEffect, useRef, useState } from "react";
import type { ModelId } from "../../preferences";
import { characterMotionRequest, motionStrength, type CharacterMotionSettings, type MotionStyle } from "../../motion/characterMotion";
import { speechMotionRuntime } from "../../motion/SpeechMotionRuntime";
import { AssetActivateButton } from "./AssetActivateButton";
import "./asset-action.css";

const options = [
  { id: "idle", label: "Signature idle", description: "Keep the character’s authored idle while speaking." },
  { id: "subtle", label: "Subtle", description: "Quiet gestures. A restrained, composed presence." },
  { id: "natural", label: "Natural", description: "Easy, conversational gestures that follow each reply." },
  { id: "expressive", label: "Expressive", description: "More visible gestures for a lively conversation." },
] as const;
type Choice = typeof options[number]["id"];
let previewEpoch = -1;
export function AssetAction({ character, enabled, onOpenService }: { character: { id: string; name: string }; enabled: boolean; onOpenService: () => void }) {
  const [snapshot, setSnapshot] = useState<CharacterMotionSettings | null>(null);
  const [selected, setSelected] = useState<Choice>("idle"), [playing, setPlaying] = useState<Choice | null>(null);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const life = useRef(new AbortController()), preview = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const load = async () => {
    try {
      const config = await characterMotionRequest(character.id, life.current.signal);
      if (!life.current.signal.aborted) { setSnapshot(config); setSelected(config.enabled ? config.style : "idle"); setError(""); }
    } catch (reason) { if (!life.current.signal.aborted) setError(reason instanceof Error ? reason.message : "Could not read motion settings."); }
  };
  useEffect(() => {
    life.current = new AbortController(); void load();
    return () => { life.current.abort(); preview.current?.abort(); clearTimeout(timer.current); };
  }, [character.id]);
  const choose = async (choice: Choice) => {
    const wasPlaying = playing === choice;
    preview.current?.abort(); clearTimeout(timer.current); setPlaying(null); setSelected(choice); setError("");
    if (choice === "idle" || wasPlaying) return;
    const cancellation = new AbortController(); preview.current = cancellation;
    const epoch = --previewEpoch;
    cancellation.signal.addEventListener("abort", () => speechMotionRuntime.cancel(epoch, "preview-stopped"), { once: true });
    let startedAt: number | null = null;
    setPlaying(choice);
    try {
      const ready = await speechMotionRuntime.start({ text: "你好，很高兴见到你。我们一起开始吧。", duration: 5,
        characterId: character.id, sessionId: `preview:${crypto.randomUUID()}`, interactionEpoch: epoch,
        signal: cancellation.signal, strength: motionStrength[choice],
        playbackTime: () => startedAt === null ? null : (performance.now() - startedAt) / 1000,
      });
      if (cancellation.signal.aborted) return;
      if (!ready) throw new Error("Motion preview is unavailable. Reconnect in Motion Service.");
      startedAt = performance.now();
      timer.current = setTimeout(() => { cancellation.abort(); setPlaying(null); }, 5000);
    } catch (reason) {
      if (!cancellation.signal.aborted) { setError(reason instanceof Error ? reason.message : "Preview unavailable."); setPlaying(null); }
      cancellation.abort();
    }
  };
  const option = options.find(item => item.id === selected)!;
  const applied = snapshot && (snapshot.enabled ? snapshot.style : "idle") === selected;
  return <div className="asset-appearance asset-action" data-category="Action" lang="en">
    <div className="asset-appearance__collection">
      <p className="asset-appearance__count">{snapshot ? "4 / 4" : "…"}</p>
      <div className="asset-appearance__tiles" aria-label="Character motion styles">
        {options.map((item, index) => <button key={item.id} type="button" className="asset-appearance__tile" aria-pressed={selected === item.id}
          aria-label={`Preview ${item.label}`} disabled={!snapshot || busy || (item.id !== "idle" && !snapshot.supported)} onClick={() => void choose(item.id)}>
          <span className="asset-action__mark" aria-hidden="true"><svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1"><circle cx="32" cy="14" r="5" /><path d={`M32 22v20m0 0-9 14m9-14 9 14M32 27 ${index === 0 ? "L22 38m10-11 10 11" : index === 1 ? "L19 33m13-6 13 6" : index === 2 ? "L13 24m19 3 17-8" : "L11 14m21 13 21-13"}`} /></svg></span>
          <span className="asset-appearance__tile-label">{item.label}</span>
        </button>)}
      </div>
      <div className="asset-action__notes"><p role="status">{playing ? "Previewing… Click again to stop." : "Click a style to preview. Hold Apply to save."}</p>
        <button type="button" className="asset-action__link" onClick={onOpenService}>Motion Service</button>
        {!snapshot && error && <button type="button" onClick={() => void load()}>Try again</button>}
        {error && <p className="asset-action__error" role="alert">{error}</p>}</div>
    </div>
    <aside className="asset-appearance__selection" aria-label="Selected motion">
      <div className="asset-appearance__caption"><h2>{option.label}</h2><p>{option.description}</p><div className="asset-detail__rule" aria-hidden="true" /></div>
      <div className="asset-appearance__apply"><AssetActivateButton modelId={character.id as ModelId} variant="apply" activated={Boolean(applied)}
        enabled={enabled && Boolean(snapshot) && !busy} onActivate={() => {}} commit={async () => {
          setBusy(true); setError("");
          try {
            const config = await characterMotionRequest(character.id, life.current.signal, { enabled: selected !== "idle", style: selected === "idle" ? snapshot?.style ?? "natural" : selected as MotionStyle });
            if (life.current.signal.aborted) return false;
            setSnapshot(config); window.dispatchEvent(new CustomEvent("preacherman-motion-changed", { detail: config })); return true;
          } catch (reason) { if (!life.current.signal.aborted) setError(reason instanceof Error ? reason.message : "Could not apply motion."); return false; }
          finally { if (!life.current.signal.aborted) setBusy(false); }
        }} /></div>
    </aside>
  </div>;
}
