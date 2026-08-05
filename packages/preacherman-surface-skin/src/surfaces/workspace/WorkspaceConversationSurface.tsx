import type { SurfaceViewProps } from "../../adapter/types";
import { HomeVisualScene } from "../homeVisual/HomeVisualScene";
import "./workspace.css";

export function WorkspaceConversationSurface({
  manifest,
  tokenStyle,
}: SurfaceViewProps) {
  return (
    <section
      aria-label="Preacherman conversation workspace"
      className="pm-surface-skin pm-workspace"
      data-figma-frame="281:538"
      data-surface-type={manifest.surfaceType}
      style={tokenStyle}
    >
      <HomeVisualScene />
    </section>
  );
}
