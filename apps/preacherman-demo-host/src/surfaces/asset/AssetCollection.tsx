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
          <span className="asset-card__image"><span><img src={character.cardImage} width="532" height="460" alt="" decoding="async" /></span></span>
          <span className="asset-card__name"><span><img src={character.cardName} width="402" height="38" alt={character.cardAlt} /></span></span>
          <span className="asset-card__frame" aria-hidden="true" />
        </button>)}
      </div>
    </div>
    {selected && <CharacterDetails initialId={selected} onBack={() => setSelected(null)} />}
  </section>;
}

function Summary({ character, secondary = false }: { character: Character | NonNullable<Character["second"]>; secondary?: boolean }) {
  return <div className="asset-detail__summary" data-secondary={secondary}>
    <h2 className="asset-detail__name" data-long={character.name.length > 8}>{character.name}</h2>
    <p className="asset-detail__formal">{character.designation}</p>
    <div className="asset-detail__rule" aria-hidden="true"><i /><i /><i /></div>
    {"tagline" in character && character.tagline && <p className="asset-detail__quote">{character.tagline}</p>}
    <div className="asset-detail__description">{character.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}</div>
    <p className="asset-detail__voice">Voice: {character.voice}</p>
  </div>;
}

function CharacterDetails({ initialId, onBack }: { initialId: string; onBack: () => void }) {
  const viewport = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  const [current, setCurrent] = useState(initialId);
  const chosen = useRef(initialId);
  const switchingUntil = useRef(0);
  const choose = (id: string, smooth = true) => {
    const root = viewport.current;
    const target = root?.querySelector<HTMLElement>(`[data-detail="${id}"]`);
    if (!root || !target) return;
    chosen.current = id; setCurrent(id); switchingUntil.current = performance.now() + (smooth ? 1100 : 0);
    const scale = root.getBoundingClientRect().height / root.clientHeight;
    const top = id === characters[0].id ? 0 : root.scrollTop + (target.getBoundingClientRect().top - root.getBoundingClientRect().top) / scale - 24;
    root.scrollTo({ top, behavior: smooth && !matchMedia("(prefers-reduced-motion: reduce)").matches ? "smooth" : "instant" });
  };
  useLayoutEffect(() => {
    let active = true;
    choose(initialId, false); back.current?.focus({ preventScroll: true });
    void document.fonts.ready.then(() => { if (active && chosen.current === initialId) choose(initialId, false); });
    return () => { active = false; };
  }, [initialId]);
  useEffect(() => {
    const root = viewport.current!;
    const sections = [...root.querySelectorAll<HTMLElement>("[data-detail]")];
    let frame = 0;
    const update = () => {
      frame = 0;
      const box = root.getBoundingClientRect(), scale = box.height / root.clientHeight;
      let active = sections[0].dataset.detail!;
      for (const section of sections) {
        if (section.getBoundingClientRect().top <= box.top + box.height * .4) active = section.dataset.detail!;
        const figure = section.querySelector<HTMLElement>(".asset-detail__image")!;
        const imageBox = figure.getBoundingClientRect();
        if (matchMedia("(prefers-reduced-motion: reduce)").matches || imageBox.bottom < box.top || imageBox.top > box.bottom) continue;
        const old = Number(figure.dataset.shift || 0) * scale;
        const progress = Math.max(0, Math.min(1, (box.bottom - imageBox.top + old) / (imageBox.height + box.height)));
        const shift = imageBox.height / scale * .35 * (progress - .5);
        figure.dataset.shift = String(shift); figure.style.transform = `translateY(${shift}px)`;
      }
      if (performance.now() > switchingUntil.current) setCurrent(active);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    root.addEventListener("scroll", schedule, { passive: true });
    const observer = new ResizeObserver(schedule); observer.observe(root); schedule();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); root.removeEventListener("scroll", schedule); };
  }, []);
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
          {characters.map(character => <article className="asset-detail" data-detail={character.id} key={character.id} aria-label={character.label}>
            <div className="asset-detail__inner">
              <div className="asset-detail__column">
                <div className="asset-detail__text"><Summary character={character} />{character.second && <Summary character={character.second} secondary />}</div>
                <div className="asset-detail__art"><figure className="asset-detail__image"><img src={character.image} alt={`${character.label} — character artwork`} width={character.imageWidth} height={character.imageHeight} decoding="async" loading={character.id === initialId ? "eager" : "lazy"} /></figure></div>
              </div>
              <img className="asset-detail__background" src={character.background} alt="" aria-hidden="true" loading="lazy" />
            </div>
          </article>)}
        </div>
      </div>
    </div>
    <nav className="asset-details__index" aria-label="Select a character">
      {characters.map(character => <button type="button" key={character.id} data-character={character.id} aria-label={`View ${character.label}`}
        aria-current={current === character.id ? "true" : undefined} title={character.label} onClick={() => choose(character.id)}>
        <span className="asset-details__thumb"><img src={character.thumbnail} alt="" width="130" height="130" /></span>
        <span className="asset-details__thumb-frame" aria-hidden="true" /><span className="asset-details__corners" aria-hidden="true"><i /><i /><i /><i /></span>
      </button>)}
    </nav>
  </div>;
}
