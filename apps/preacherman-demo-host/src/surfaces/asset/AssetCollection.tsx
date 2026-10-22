import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { InteractiveAvatarViewport, avatarDefaultActionId, isAvatarModelId } from "@preacherman/avatar-renderer";
import { localAvatarAssetBaseUrl } from "../../avatar/avatarAssets";
import { zoomCompanion } from "../../gallery/homeCompanionControls";
import { useThree } from "@react-three/fiber";
import type { Appearance, ModelId } from "../../preferences";
import characters from "./characters.json";
import "./asset-collection.css";

type Character = typeof characters[number];
function ArrowLeft() {
  return <svg viewBox="0 0 40 20" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M37 10H3m6-6-6 6 6 6" /></svg>;
}

export function AssetCollection({ appearance, renderActive, onDetailChange }: {
  appearance: Appearance;
  renderActive: boolean;
  onDetailChange: (open: boolean) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const returnButton = useRef<HTMLButtonElement | null>(null);
  useLayoutEffect(() => { onDetailChange(selected !== null); }, [selected, onDetailChange]);
  useLayoutEffect(() => () => onDetailChange(false), [onDetailChange]);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { (entry.target as HTMLElement).dataset.entered = "true"; observer.unobserve(entry.target); }
    }), { root: grid.current, threshold: 0, rootMargin: "0px 0px -6%" });
    grid.current?.querySelectorAll(".asset-card").forEach(card => observer.observe(card));
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => { if (!selected) returnButton.current?.focus({ preventScroll: true }); }, [selected]);
  return <section className="asset-collection" aria-label="Asset collection" data-view={selected ? "detail" : "collection"}>
    <div className="asset-collection__scroll" ref={grid} hidden={selected !== null}>
      <div className="asset-collection__grid">
        {characters.map(character => <button key={character.id} type="button" className="asset-card" data-character={character.id}
          aria-label={`View ${character.label}`} onClick={event => { returnButton.current = event.currentTarget; setSelected(character.id); }}>
          <span className="asset-card__image"><span><img src={character.cardImage} width={character.cardImageWidth} height={character.cardImageHeight} alt="" decoding="async" loading="lazy" /></span></span>
          <span className="asset-card__name"><span>{character.label}</span></span>
          <span className="asset-card__frame" aria-hidden="true" />
        </button>)}
      </div>
    </div>
    {selected && <CharacterDetails initialId={selected} appearance={appearance} renderActive={renderActive} onBack={() => setSelected(null)} />}
  </section>;
}

function CharacterHeading({ character }: { character: Character }) {
  return <header className="asset-detail__heading">
    <h1 className="asset-detail__name" data-long={character.name.length > 8}>{character.name}</h1>
    {character.designation && <p className="asset-detail__formal">{character.designation}</p>}
    <div className="asset-detail__rule" aria-hidden="true"><i /><i /><i /></div>
  </header>;
}

function CharacterCapture() {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    const capture = () => gl.render(scene, camera);
    gl.domElement.addEventListener("preacherman:capture-frame", capture);
    return () => gl.domElement.removeEventListener("preacherman:capture-frame", capture);
  }, [gl, scene, camera]);
  return null;
}

function CharacterModel({ modelId, appearance, renderActive }: { modelId: ModelId; appearance: Appearance; renderActive: boolean }) {
  const model = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const ready = useCallback(() => setStatus("ready"), []);
  const failed = useCallback(() => setStatus("error"), []);
  useEffect(() => {
    const target = model.current;
    if (!target || !renderActive) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      setZoom(current => zoomCompanion(current, event.deltaY, event.deltaMode));
    };
    target.addEventListener("wheel", wheel, { passive: false });
    return () => target.removeEventListener("wheel", wheel);
  }, [renderActive]);
  return <div ref={model} className="asset-overview__model" data-model-id={modelId} data-status={status} data-zoom={zoom}
    role="group" tabIndex={0} aria-label="Character preview. Scroll down to view full body; scroll up for a close-up. Up and down arrow keys also zoom."
    aria-busy={status === "loading"} onKeyDown={event => {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown" && event.key !== "Home") return;
      event.preventDefault(); event.stopPropagation();
      if (event.key === "Home") setZoom(1);
      else setZoom(current => zoomCompanion(current, event.key === "ArrowUp" ? -140 : 140));
    }}>
    <InteractiveAvatarViewport key={attempt} modelId={modelId} assetBaseUrl={localAvatarAssetBaseUrl(modelId)}
      actionId={avatarDefaultActionId(modelId)} quality="high" pose="standby" environment="cinematic" isolateCompanion
      appearance={appearance} platformStyle="ring" cameraFraming={zoom === 1 ? "portrait" : "full-body"} cameraZoom={zoom} renderActive={renderActive}
      onReady={ready} onError={failed} sceneContent={<CharacterCapture />} />
    {status === "loading" && <p className="asset-overview__status" role="status">Loading character…</p>}
    {status === "error" && <div className="asset-overview__status" role="alert"><p>The character could not be loaded.</p>
      <button type="button" onClick={() => { setStatus("loading"); setAttempt(value => value + 1); }}>Try again</button></div>}
  </div>;
}

function CharacterDetails({ initialId, appearance, renderActive, onBack }: {
  initialId: string; appearance: Appearance; renderActive: boolean; onBack: () => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  const [current, setCurrent] = useState(initialId);
  const character = characters.find(character => character.id === current)!;
  const choose = (id: string) => setCurrent(id);
  useLayoutEffect(() => { back.current?.focus({ preventScroll: true }); }, []);
  // Only the selected character is mounted; scrolling can never reveal another detail.
  useLayoutEffect(() => { viewport.current?.scrollTo({ top: 0, behavior: "instant" }); }, [current]);
  return <div className="asset-details" data-current={current} onKeyDown={event => {
    if (event.key === "Escape") { event.stopPropagation(); onBack(); }
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault(); const index = characters.findIndex(character => character.id === current);
      choose(characters[Math.max(0, Math.min(characters.length - 1, index + (event.key === "ArrowRight" ? 1 : -1)))].id);
    }
  }}>
    <button ref={back} type="button" className="asset-details__back" aria-label="Back to assets" title="Back to assets" onClick={onBack}><ArrowLeft /></button>
    <div className="asset-details__tabs" role="tablist" aria-label="Character sections">
      {["Overview", "Costume", "Skills", "Settings", "Info Map"].map(label => <button key={label} type="button" role="tab"
        id={label === "Overview" ? "asset-overview-tab" : undefined} aria-selected={label === "Overview"}
        aria-controls={label === "Overview" ? "asset-overview-panel" : undefined} disabled={label !== "Overview"}
        title={label === "Overview" ? undefined : `${label} — Coming soon`}>{label}</button>)}
    </div>
    <div className="asset-details__scroll" ref={viewport}>
      <div className="asset-details__inner">
        <div className="asset-details__list">
          <article className="asset-detail" data-detail={character.id} key={character.id} aria-label={character.label}>
            <div id="asset-overview-panel" role="tabpanel" aria-labelledby="asset-overview-tab" className="asset-overview">
              <div className="asset-overview__copy">
                <CharacterHeading character={character} />
                <div className="asset-detail__text"><div className="asset-detail__description">{character.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}</div></div>
              </div>
              {isAvatarModelId(character.id) && <CharacterModel key={character.id} modelId={character.id} appearance={appearance} renderActive={renderActive} />}
            </div>
          </article>
        </div>
      </div>
    </div>
    <nav className="asset-details__index" aria-label="Select a character">
      {characters.map(character => <button type="button" key={character.id} data-character={character.id} aria-label={`View ${character.label}`}
        aria-current={current === character.id ? "true" : undefined} title={character.label} onClick={() => choose(character.id)}>
        <span className="asset-details__thumb"><img src={character.cardImage} alt="" width="130" height="130" loading="lazy" /></span>
        <span className="asset-details__thumb-frame" aria-hidden="true" /><span className="asset-details__corners" aria-hidden="true"><i /><i /><i /><i /></span>
      </button>)}
    </nav>
  </div>;
}
