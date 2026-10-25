import { useEffect, useRef, useState } from "react";
import type { ModelId } from "../../preferences";
import { characterVoiceRequest, type CharacterVoiceOption, type CharacterVoiceSettings } from "../../audio/characterVoice";
import { selectOutput, type OutputContext } from "../../audio/microphoneMeter";
import { AssetActivateButton } from "./AssetActivateButton";
import "./asset-voice.css";

type Character = { id: string; name: string };
const voiceLanguages = {
  zh: { label: "ZH", description: "Chinese reference voice" },
  en: { label: "EN", description: "English reference voice" },
  unknown: { label: "?", description: "Voice language unknown" },
};
function VoiceMark() {
  return <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 20v8m8-15v22m8-29v36m8-29v22m8-15v8" /></svg>;
}
function Plus() { return <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 12v24M12 24h24" /></svg>; }

export function AssetVoice({ character, enabled, onOpenService }: { character: Character; enabled: boolean; onOpenService: () => void }) {
  const [snapshot, setSnapshot] = useState<CharacterVoiceSettings | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [busy, setBusy] = useState("load");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [voiceId, setVoiceId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const life = useRef(new AbortController());
  const playback = useRef<OutputContext | null>(null);
  const preview = useRef<AbortController | null>(null);
  const selectedVoice = snapshot?.voices.find(voice => voice.id === selected);
  const applied = Boolean(selected && snapshot?.selectedVoiceId === selected);
  const stop = () => { preview.current?.abort(); preview.current = null; void playback.current?.close().catch(() => {}); playback.current = null; setPlaying(null); };
  const load = async () => {
    const signal = life.current.signal;
    setBusy("load"); setError("");
    try {
      const state = await characterVoiceRequest<CharacterVoiceSettings>(character.id, "", undefined, signal);
      if (!signal.aborted) { setSnapshot(state); setSelected(previous => state.voices.some(v => v.id === previous) ? previous : state.selectedVoiceId || state.voices[0]?.id || null); }
    } catch (reason) { if (!signal.aborted) setError(reason instanceof Error ? reason.message : "Could not load voices. Try again."); }
    finally { if (!signal.aborted) setBusy(""); }
  };
  useEffect(() => {
    setSnapshot(null); setSelected(null);
    life.current = new AbortController(); void load();
    const refresh = () => { if (!preview.current) void load(); };
    window.addEventListener("focus", refresh);
    return () => { window.removeEventListener("focus", refresh); life.current.abort(); preview.current?.abort(); void playback.current?.close().catch(() => {}); };
  }, [character.id]);
  const listen = async (voice: CharacterVoiceOption) => {
    const wasPlaying = playing === voice.id;
    stop(); setSelected(voice.id); setError(""); setNotice("");
    if (wasPlaying) return;
    const cancellation = new AbortController(); preview.current = cancellation;
    const signal = AbortSignal.any([life.current.signal, cancellation.signal]);
    setPlaying(voice.id);
    const context: OutputContext = new AudioContext(); playback.current = context;
    try {
      await context.resume();
      let output = ""; try { output = JSON.parse(localStorage.getItem("preacherman.audio-devices") || "{}").output || ""; } catch { /* Use default. */ }
      await selectOutput(context, output);
      const { audio } = await characterVoiceRequest<{ audio: string }>(character.id, `/preview?id=${encodeURIComponent(voice.id)}`, undefined, signal);
      const bytes = Uint8Array.from(atob(audio.slice(audio.indexOf(",") + 1)), char => char.charCodeAt(0));
      const buffer = await context.decodeAudioData(bytes.buffer); signal.throwIfAborted();
      const source = context.createBufferSource(); source.buffer = buffer; source.connect(context.destination);
      source.onended = () => { if (preview.current === cancellation) stop(); };
      source.start(0, 0, Math.min(buffer.duration, 30));
    } catch (reason) {
      if (!signal.aborted) { setError(reason instanceof Error ? reason.message : "This preview could not be played."); stop(); }
    } finally { if (signal.aborted && context.state !== "closed") void context.close().catch(() => {}); }
  };
  const apply = async () => {
    if (!selected || busy) return false;
    setBusy("apply"); setError(""); stop();
    try {
      const state = await characterVoiceRequest<CharacterVoiceSettings>(character.id, "/apply", { id: selected }, life.current.signal);
      if (life.current.signal.aborted) return false;
      setSnapshot(state); setNotice(selectedVoice?.provider === "breeze" ? "Breeze voice applied. This character will use it in voice conversations." : "Voice saved for this character. Live voice connection is pending."); return true;
    } catch (reason) { if (!life.current.signal.aborted) setError(reason instanceof Error ? reason.message : "Could not apply this voice."); return false; }
    finally { if (!life.current.signal.aborted) setBusy(""); }
  };
  const add = async () => {
    if (!file || !name.trim() || busy) return;
    setBusy("add"); setError("");
    let context: AudioContext | null = null;
    try {
      if (file.size > 3 * 1024 * 1024) throw new Error("Choose a preview under 3 MB.");
      const bytes = await file.arrayBuffer(); context = new AudioContext();
      const decoded = await context.decodeAudioData(bytes.slice(0));
      if (!decoded.duration || decoded.duration > 30) throw new Error("Choose a voice preview up to 30 seconds long.");
      await context.close(); context = null; life.current.signal.throwIfAborted();
      const extension = file.name.split(".").pop()?.toLowerCase();
      const mime = extension === "mp3" ? "audio/mpeg" : extension === "m4a" ? "audio/mp4" : extension === "ogg" ? "audio/ogg" : "audio/wav";
      let binary = ""; const data = new Uint8Array(bytes);
      for (let index = 0; index < data.length; index += 8192) binary += String.fromCharCode(...data.subarray(index, index + 8192));
      const state = await characterVoiceRequest<CharacterVoiceSettings>(character.id, "/options", { name, voiceId, preview: `data:${mime};base64,${btoa(binary)}` }, life.current.signal);
      if (life.current.signal.aborted) return;
      setSnapshot(state); setSelected(state.voices.find(voice => voice.source !== "breeze" && !snapshot?.voices.some(previous => previous.id === voice.id))?.id || null); setAdding(false); setName(""); setVoiceId(""); setFile(null);
      setNotice("Preview added. Click its tile to listen, then hold Apply.");
    } catch (reason) { if (!life.current.signal.aborted) setError(reason instanceof Error ? reason.message : "Could not add this voice preview."); }
    finally { if (context && context.state !== "closed") void context.close(); if (!life.current.signal.aborted) setBusy(""); }
  };
  const remove = async () => {
    if (!selected || busy) return;
    stop(); setBusy("remove"); setError(""); setNotice("");
    try {
      const state = await characterVoiceRequest<CharacterVoiceSettings>(character.id, `/options?id=${encodeURIComponent(selected)}`, undefined, life.current.signal, "DELETE");
      if (!life.current.signal.aborted) { setSnapshot(state); setSelected(state.selectedVoiceId || state.voices[0]?.id || null); }
    } catch (reason) { if (!life.current.signal.aborted) setError(reason instanceof Error ? reason.message : "Could not remove this voice."); }
    finally { if (!life.current.signal.aborted) setBusy(""); }
  };
  const voices = snapshot?.voices || [];
  const importedCount = voices.filter(voice => voice.source !== "breeze").length;
  return <section className="asset-pack-browser asset-voice" aria-label={`${character.name} voices`} aria-busy={Boolean(busy)} lang="en">
    <div className="asset-pack-browser__scroll">
      {adding ? <form className="asset-voice__form" onSubmit={event => { event.preventDefault(); void add(); }}>
        <h3>Add a voice preview</h3><p>Import a finished audio preview below. Saved Breeze voices appear automatically in this collection.</p>
        <label>Name<input autoFocus value={name} onChange={event => setName(event.target.value)} maxLength={60} required disabled={Boolean(busy)} placeholder="Your voice name" /></label>
        <label>Voice ID <span className="asset-voice__optional">Optional</span><input value={voiceId} onChange={event => setVoiceId(event.target.value)} maxLength={256} disabled={Boolean(busy)} placeholder="From your voice provider" spellCheck={false} autoComplete="off" /></label>
        <label className="asset-voice__file">Audio preview<input type="file" accept=".wav,.mp3,.ogg,.m4a" disabled={Boolean(busy)} onChange={event => setFile(event.target.files?.[0] || null)} /><small>Up to 30 seconds · 3 MB · Stored on this device</small></label>
        <div className="asset-voice__form-actions"><button type="button" disabled={Boolean(busy)} onClick={() => { setAdding(false); setError(""); }}>Cancel</button><button type="submit" disabled={Boolean(busy) || !file || !name.trim()}>{busy === "add" ? "Adding…" : "Add preview"}</button></div>
      </form> : <>
        <div className="asset-pack-grid" aria-label="Voice previews">
          {voices.map(voice => <button key={voice.id} type="button" className="asset-pack-tile" aria-label={`Preview ${voice.name} · ${voiceLanguages[voice.language || "unknown"].description}`} aria-pressed={selected === voice.id} data-playing={playing === voice.id} disabled={!enabled || Boolean(busy)} onClick={() => void listen(voice)}>
            <span className="asset-pack-tile__content"><VoiceMark /><span className="asset-pack-tile__name">{voice.name}</span></span>
            <span className="asset-voice__language" title={voiceLanguages[voice.language || "unknown"].description} aria-label={voiceLanguages[voice.language || "unknown"].description}>{voiceLanguages[voice.language || "unknown"].label}</span>
          </button>)}
          {snapshot && importedCount < 12 && <button type="button" className="asset-pack-tile asset-pack-tile--add" aria-label="Add voice preview" disabled={!enabled || Boolean(busy)} onClick={() => { stop(); setAdding(true); setError(""); setNotice(""); }}><span className="asset-pack-tile__content"><Plus /><span className="asset-pack-tile__name">Add voice</span></span></button>}
          {Array.from({ length: Math.max(0, 12 - voices.length - (snapshot && importedCount < 12 ? 1 : 0)) }, (_, index) => <span className="asset-pack-tile asset-pack-tile--empty" aria-hidden="true" key={`empty-${index}`} />)}
        </div>
        <div className="asset-pack-browser__description">
          {busy === "load" ? <p role="status">Loading voices…</p> : !snapshot ? <button type="button" className="asset-voice__text-button" onClick={() => void load()}>Try again</button> :
            selectedVoice ? <>
              <div className="asset-voice__apply"><AssetActivateButton key={selectedVoice.id} modelId={character.id as ModelId} labelName={selectedVoice.name} variant="apply" activated={applied} enabled={enabled && !busy} commit={apply} onActivate={() => {}} />
                {selectedVoice.source !== "breeze" && <button type="button" className="asset-voice__text-button" disabled={Boolean(busy)} onClick={() => void remove()}>Remove preview</button>}</div>
            </> : null}
        </div>
      </>}
      {notice && <p className="asset-voice__notice" role="status">{notice}</p>}
      {error && <><p className="asset-voice__error" role="alert">{error}</p><button type="button" className="asset-voice__text-button" onClick={() => { stop(); onOpenService(); }}>Voice Service settings</button></>}
    </div>
  </section>;
}

export function AssetAccessories({ character }: { character: Character }) {
  return <section className="asset-pack-browser asset-accessories" aria-label={`${character.name} accessories`} lang="en">
    <div className="asset-pack-browser__scroll"><div className="asset-pack-browser__heading"><h2>Accessories</h2><span>0 items</span></div>
      <p className="asset-pack-browser__group">{character.name}<span>Accessory collection</span></p>
      <div className="asset-pack-grid" aria-hidden="true">{Array.from({ length: 12 }, (_, index) => <span className="asset-pack-tile asset-pack-tile--empty" key={index} />)}</div>
      <div className="asset-pack-browser__description"><h3>No accessories yet</h3><p>Accessories for this character will appear here.</p></div>
    </div>
  </section>;
}
