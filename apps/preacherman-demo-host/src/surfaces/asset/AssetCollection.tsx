import { useEffect, useLayoutEffect, useRef, useState } from "react";
import characters from "./characters.json";
import "./asset-collection.css";

type Character = typeof characters[number];
function ArrowLeft() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 12H4m7-7-7 7 7 7" /></svg>;
}

export function AssetCollection() {
  const [selected, setSelected] = useState<string | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const returnButton = useRef<HTMLButtonElement | null>(null);
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
    {selected && <CharacterDetails initialId={selected} onBack={() => setSelected(null)} />}
  </section>;
}

function Summary({ character }: { character: Character }) {
  return <div className="asset-detail__summary">
    <h2 className="asset-detail__name" data-long={character.name.length > 8}>{character.name}</h2>
    {character.designation && <p className="asset-detail__formal">{character.designation}</p>}
    <div className="asset-detail__rule" aria-hidden="true"><i /><i /><i /></div>
    <div className="asset-detail__description">{character.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}</div>
  </div>;
}

function CharacterDetails({ initialId, onBack }: { initialId: string; onBack: () => void }) {
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
    <div className="asset-details__scroll" ref={viewport}>
      <div className="asset-details__inner">
        <h1 className="asset-details__title">CHARACTER</h1>
        <div className="asset-details__list">
          <article className="asset-detail" data-detail={character.id} data-framing={character.detailFraming} key={character.id} aria-label={character.label}>
            <div className="asset-detail__inner">
              <div className="asset-detail__column">
                <div className="asset-detail__text"><Summary character={character} /></div>
                <div className="asset-detail__art"><figure className="asset-detail__image"><img src={character.image} alt={`${character.label} — character artwork`} width={character.imageWidth} height={character.imageHeight} decoding="async" loading={character.id === initialId ? "eager" : "lazy"} /></figure></div>
              </div>
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
