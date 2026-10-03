import "./market/market-profile.css";
import "./market/market-surface.css";

/** The same signature and ruled glass header used by Market, without its profile action. */
export function SurfaceBrandHeader() {
  return <header className="demo-surface-header">
    <span className="demo-surface-header__signature">Preacherman</span>
  </header>;
}
