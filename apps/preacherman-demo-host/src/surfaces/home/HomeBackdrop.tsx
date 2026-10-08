import "./home-backdrop.css";

/** Shared default backdrop: original lettering, deboss filter and PM behind every surface. */
export function HomeBackdrop() {
  return <div className="home-backdrop" aria-hidden="true">
    <svg className="home-backdrop__statement" viewBox="0 0 1800 280" focusable="false">
      <defs>
        <filter id="home-statement-deboss" x="-1%" y="-1%" width="102%" height="102%" colorInterpolationFilters="sRGB">
          <feFlood className="home-backdrop__floor" result="cavity-floor-color" />
          <feComposite in="cavity-floor-color" in2="SourceAlpha" operator="in" result="cavity-floor" />
          <feGaussianBlur in="SourceAlpha" stdDeviation="0.75" result="soft-alpha" />
          <feOffset in="soft-alpha" dx="2" dy="2" result="dark-shift" />
          <feComposite in="SourceAlpha" in2="dark-shift" operator="out" result="dark-inner-alpha" />
          <feFlood className="home-backdrop__dark-wall" result="dark-inner-color" />
          <feComposite in="dark-inner-color" in2="dark-inner-alpha" operator="in" result="dark-inner-wall" />
          <feGaussianBlur in="SourceAlpha" stdDeviation="0.5" result="light-soft-alpha" />
          <feOffset in="light-soft-alpha" dx="-1.3" dy="-1.3" result="light-shift" />
          <feComposite in="SourceAlpha" in2="light-shift" operator="out" result="light-inner-alpha" />
          <feFlood className="home-backdrop__light-wall" result="light-inner-color" />
          <feComposite in="light-inner-color" in2="light-inner-alpha" operator="in" result="light-inner-wall" />
          <feOffset in="SourceAlpha" dx="0.7" dy="0.7" result="occlusion-shift" />
          <feComposite in="SourceAlpha" in2="occlusion-shift" operator="out" result="occlusion-alpha" />
          <feGaussianBlur in="occlusion-alpha" stdDeviation="0.35" result="soft-occlusion-alpha" />
          <feComposite in="soft-occlusion-alpha" in2="SourceAlpha" operator="in" result="clipped-occlusion-alpha" />
          <feFlood className="home-backdrop__occlusion" result="occlusion-color" />
          <feComposite in="occlusion-color" in2="clipped-occlusion-alpha" operator="in" result="inner-occlusion" />
          <feMerge>
            <feMergeNode in="cavity-floor" /><feMergeNode in="dark-inner-wall" />
            <feMergeNode in="light-inner-wall" /><feMergeNode in="inner-occlusion" />
          </feMerge>
        </filter>
      </defs>
      <g className="home-backdrop__glyphs"><text x="50%" y="0.82em" textAnchor="middle">We Bring a New.</text></g>
    </svg>
    <span className="home-backdrop__mark" />
  </div>;
}
