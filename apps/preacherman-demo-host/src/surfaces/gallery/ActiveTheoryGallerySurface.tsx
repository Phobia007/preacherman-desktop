import { useState } from "react";
import { CortanaModelStage } from "../../gallery/CortanaModelStage";

import "./active-theory-gallery-surface.css";

const gallerySource = "/active-theory-gallery/gallery/work.html";

export function ActiveTheoryGallerySurface() {
  const [loaded, setLoaded] = useState(false);

  return (
    <section
      aria-busy={!loaded}
      aria-label="Gallery"
      className="active-theory-gallery-surface"
      data-loaded={loaded ? "true" : "false"}
    >
      <iframe
        className="active-theory-gallery-surface__frame"
        onLoad={() => setLoaded(true)}
        src={gallerySource}
        title="Preacherman Gallery"
      />
      <div aria-hidden="true" className="active-theory-gallery-surface__cortana">
        <CortanaModelStage
          ariaLabel="Fixed Cortana gallery anchor"
          cameraFraming="portrait"
          environment="cinematic"
          renderActive={false}
        />
      </div>
      {!loaded ? (
        <p aria-live="polite" className="active-theory-gallery-surface__status" role="status">
          Loading gallery
        </p>
      ) : null}
    </section>
  );
}
