import { useEffect, useRef, useState } from "react";

export function TopLiveStatus() {
  const [isOpen, setIsOpen] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !statusRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  return (
    <div className="pm-workspace__status-shell" ref={statusRef}>
      <button
        aria-controls="pm-workspace-status-popover"
        aria-expanded={isOpen}
        aria-label="Open status panel"
        className="pm-workspace__status-trigger"
        onClick={() => setIsOpen((open) => !open)}
        type="button"
      >
        <span aria-hidden="true" className="pm-workspace__status-indicator">Alive</span>
      </button>
      {isOpen ? (
        <div
          aria-label="Status panel"
          className="pm-workspace__status-popover"
          id="pm-workspace-status-popover"
          role="dialog"
        />
      ) : null}
    </div>
  );
}
