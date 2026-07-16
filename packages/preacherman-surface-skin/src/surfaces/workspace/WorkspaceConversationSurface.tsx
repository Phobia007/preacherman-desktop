import { useState } from "react";
import type { SurfaceViewProps } from "../../adapter/types";
import { BottomNavigation } from "./BottomNavigation";
import { StateVessel } from "./StateVessel";
import { TopLiveStatus } from "./TopLiveStatus";
import { UserIdentity } from "./UserIdentity";
import { WindowChrome } from "./WindowChrome";
import { screenCommand } from "./commands";
import "./workspace.css";

export function WorkspaceConversationSurface({ dispatch, manifest, projection, tokenStyle }: SurfaceViewProps) {
  const [showChatHint, setShowChatHint] = useState(false);

  return (
    <section
      aria-label="Preacherman conversation workspace"
      className="pm-surface-skin pm-workspace"
      data-figma-frame="281:538"
      data-surface-type={manifest.surfaceType}
      style={tokenStyle}
    >
      <WindowChrome />
      <TopLiveStatus />
      <UserIdentity dispatch={dispatch} projection={projection} />
      <StateVessel dispatch={dispatch} />
      <button
        aria-label="Talk to this State"
        className="pm-workspace__state-chat-target"
        onBlur={() => setShowChatHint(false)}
        onClick={() => void dispatch(screenCommand("figma-32-2"))}
        onFocus={() => setShowChatHint(true)}
        onMouseEnter={() => setShowChatHint(true)}
        onMouseLeave={() => setShowChatHint(false)}
        type="button"
      />
      {showChatHint ? <span className="pm-workspace__state-chat-hint">click to chat with her.</span> : null}
      <BottomNavigation dispatch={dispatch} />
    </section>
  );
}
