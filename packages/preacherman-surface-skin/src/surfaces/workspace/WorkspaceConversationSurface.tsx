import type { SurfaceViewProps } from "../../adapter/types";
import { BottomNavigation } from "./BottomNavigation";
import { StateVessel } from "./StateVessel";
import { TopLiveStatus } from "./TopLiveStatus";
import { UserIdentity } from "./UserIdentity";
import { WindowChrome } from "./WindowChrome";
import "./workspace.css";

export function WorkspaceConversationSurface({ dispatch, manifest, tokenStyle }: SurfaceViewProps) {
  return (
    <section
      aria-label="Preacherman conversation workspace"
      className="pm-surface-skin pm-workspace"
      data-figma-frame="281:538"
      data-surface-type={manifest.surfaceType}
      style={tokenStyle}
    >
      <WindowChrome dispatch={dispatch} />
      <TopLiveStatus />
      <UserIdentity dispatch={dispatch} />
      <StateVessel />
      <BottomNavigation dispatch={dispatch} />
    </section>
  );
}
