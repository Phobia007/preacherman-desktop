import type { SurfaceViewProps } from "../adapter/types";

export function SurfaceFallback({ manifest, tokenStyle }: SurfaceViewProps) {
  return (
    <section className="pm-surface-skin pm-surface-skin--fallback" style={tokenStyle} data-surface-type={manifest.surfaceType}>
      <div className="pm-surface-skin__error" role="status">
        This surface version is not available in the current skin.
      </div>
    </section>
  );
}
