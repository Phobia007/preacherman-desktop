import { useRef, useState } from "react";
import { useExecutionFrameBridge } from "../../execution/useExecutionFrameBridge";

import "./active-theory-gallery-surface.css";

const gallerySource = "/active-theory-gallery/gallery/work.html";

export function ActiveTheoryGallerySurface() {
  const frameRef = useRef<HTMLIFrameElement>(null);
  useExecutionFrameBridge(frameRef);
  const [loaded, setLoaded] = useState(false);

  return (
    <section
      aria-busy={!loaded}
      aria-label="Gallery"
      className="active-theory-gallery-surface"
      data-loaded={loaded ? "true" : "false"}
    >
      <iframe
        ref={frameRef}
        className="active-theory-gallery-surface__frame"
        onLoad={() => setLoaded(true)}
        src={gallerySource}
        title="Preacherman Gallery"
      />
      {!loaded ? (
        <p aria-live="polite" className="active-theory-gallery-surface__status" role="status">
          Loading gallery
        </p>
      ) : null}
    </section>
  );
}
