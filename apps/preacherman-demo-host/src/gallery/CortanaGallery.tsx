import { HomeVisualScene } from "@preacherman/surface-skin";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type { ModelId } from "../preferences";
import { CortanaModelStage } from "./CortanaModelStage";
import "./cortana-gallery.css";

type GalleryViewState = "gallery" | "detail";

const galleryItems = [
  {
    id: "cortana",
    name: "Cortana",
    portrait: "/gallery/cortana-portrait.png",
  },
] as const;

function ChevronIcon({ left = false }: { readonly left?: boolean }) {
  return (
    <img
      alt=""
      aria-hidden="true"
      className={left ? "is-left" : undefined}
      src="/gallery/chevron-right.svg"
    />
  );
}

function CortanaCard({ onOpen }: { readonly onOpen: () => void }) {
  return (
    <button
      aria-label="Open Cortana model"
      className="cortana-card"
      data-airi-control="avatar.select"
      onClick={onOpen}
      type="button"
    >
      <span className="cortana-card__info">
        <span className="cortana-card__title">Cortana</span>
      </span>
      <span className="cortana-card__portrait" aria-hidden="true">
        <img alt="" src="/gallery/cortana-portrait.png" />
      </span>
    </button>
  );
}

interface CortanaDetailViewProps {
  readonly isActivated: boolean;
  readonly onActivate: () => void;
  readonly onBack: () => void;
}

const ACTIVATE_HOLD_MS = 1500;
const ACTIVATE_FLASH_MS = 240;

function ActivationButton({
  isActivated,
  onToggle,
}: {
  readonly isActivated: boolean;
  readonly onToggle: () => void;
}) {
  const [phase, setPhase] = useState<"idle" | "holding" | "flashing">("idle");
  const holdTimer = useRef<number | null>(null);
  const flashTimer = useRef<number | null>(null);

  const cancelHold = () => {
    if (holdTimer.current === null) return;
    window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
    setPhase("idle");
  };

  const startHold = () => {
    if (phase !== "idle" || holdTimer.current !== null) return;
    setPhase("holding");
    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = null;
      setPhase("flashing");
      flashTimer.current = window.setTimeout(() => {
        flashTimer.current = null;
        onToggle();
        setPhase("idle");
      }, ACTIVATE_FLASH_MS);
    }, ACTIVATE_HOLD_MS);
  };

  useEffect(() => () => {
    if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
  }, []);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if ((event.key === " " || event.key === "Enter") && !event.repeat) {
      event.preventDefault();
      startHold();
    }
  };

  const handleKeyUp = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      cancelHold();
    }
  };

  const label = isActivated ? "Activated" : "Activate";

  return (
    <button
      aria-label={`Hold to ${isActivated ? "deactivate" : "activate"} Cortana`}
      aria-pressed={isActivated}
      className="cortana-detail__activate"
      data-flashing={phase === "flashing" ? "true" : "false"}
      data-holding={phase === "holding" || phase === "flashing" ? "true" : "false"}
      data-state={isActivated ? "activated" : "idle"}
      onBlur={cancelHold}
      onClick={(event) => event.preventDefault()}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onPointerCancel={cancelHold}
      onPointerDown={startHold}
      onPointerLeave={cancelHold}
      onPointerUp={cancelHold}
      type="button"
    >
      <span className="cortana-detail__activate-copy">{label}</span>
      <span aria-hidden="true" className="cortana-detail__activate-copy cortana-detail__activate-copy--filled">
        {label}
      </span>
    </button>
  );
}

function CortanaDetailView({
  isActivated,
  onActivate,
  onBack,
}: CortanaDetailViewProps) {

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onBack();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onBack]);

  return (
    <main className="cortana-detail">
      <HomeVisualScene />
      <header className="cortana-detail__header">
        <button className="cortana-detail__back" onClick={onBack} type="button">
          <ChevronIcon left />
          Back to Gallery
        </button>
      </header>

      <CortanaModelStage ariaLabel="Cortana full model viewer" />
      <ActivationButton isActivated={isActivated} onToggle={onActivate} />
    </main>
  );
}

interface CortanaGalleryProps {
  readonly activeModelId: ModelId | null;
  readonly onActiveModelChange: (modelId: ModelId | null) => void;
}

export function CortanaGallery({
  activeModelId,
  onActiveModelChange,
}: CortanaGalleryProps) {
  const [view, setView] = useState<GalleryViewState>("gallery");
  const [activeIndex, setActiveIndex] = useState(0);
  const activeItem = galleryItems[activeIndex];

  const selectAdjacent = (step: -1 | 1) => {
    setActiveIndex((current) => (
      (current + step + galleryItems.length) % galleryItems.length
    ));
  };

  if (view === "detail") {
    return (
      <CortanaDetailView
        isActivated={activeModelId === activeItem.id}
        onActivate={() => onActiveModelChange(
          activeModelId === activeItem.id ? null : activeItem.id,
        )}
        onBack={() => setView("gallery")}
      />
    );
  }

  return (
    <main className="cortana-gallery">
      <header className="cortana-gallery__header">
        <h1>Gallery</h1>
      </header>
      <section
        aria-label={`${activeItem.name} character card`}
        className="cortana-gallery__collection"
      >
        <CortanaCard onOpen={() => setView("detail")} />
      </section>
      <button
        aria-label="Previous character"
        className="cortana-gallery__arrow cortana-gallery__arrow--left"
        onClick={() => selectAdjacent(-1)}
        type="button"
      >
        <ChevronIcon left />
      </button>
      <button
        aria-label="Next character"
        className="cortana-gallery__arrow cortana-gallery__arrow--right"
        onClick={() => selectAdjacent(1)}
        type="button"
      >
        <ChevronIcon />
      </button>
    </main>
  );
}
