import { useState } from "react";
import type { SurfaceViewProps } from "../../adapter/types";
import handCursor from "../../assets/figma/home-batch-1/281-374--annotation-hand-cursor-click-to-chat.svg";
import { screenCommand } from "../workspace/commands";
import { ConversationScene } from "./ConversationScene";
import { HomeVessel } from "./HomeVessel";
import { StateFocusDetail } from "./StateFocusDetail";
import "./home.css";

const frameBySurfaceId: Readonly<Record<string, string>> = {
  "figma-287-637": "287:637",
  "figma-287-714": "287:714",
  "figma-219-3": "219:3",
  "figma-281-374": "281:374",
  "figma-32-2": "32:2",
  "figma-412-728": "412:728",
};

export function HomeFlowSurface({
  avatarSlot,
  dispatch,
  manifest,
  tokenStyle,
}: SurfaceViewProps) {
  const surfaceId = manifest.surfaceId ?? "figma-287-637";
  const [hoverHint, setHoverHint] = useState(false);
  const forceHint = surfaceId === "figma-281-374";
  const isConversation = surfaceId === "figma-32-2" || surfaceId === "figma-412-728";
  const isStateDetail = surfaceId === "figma-219-3";
  const showCurrentState = !isConversation && !isStateDetail;

  return (
    <section
      aria-label={manifest.title ?? "Preacherman Home flow"}
      className="pm-surface-skin pm-workspace pm-home-flow"
      data-figma-frame={frameBySurfaceId[surfaceId] ?? "287:637"}
      data-surface-type={manifest.surfaceType}
      style={tokenStyle}
    >
      <div className="pm-home-flow__scene">
        {showCurrentState ? (
        <button
          className="pm-home-flow__current-state"
          onClick={() => void dispatch(screenCommand("figma-219-3"))}
          type="button"
        >
          current state: v 1.0.0
        </button>
        ) : null}

        {surfaceId === "figma-287-637" ? (
        <>
          <HomeVessel avatarSlot={avatarSlot} />
          <section className="pm-home-flow__trace" aria-label="State trace">
            <h2>STATE TRACE</h2>
            <ul>
              <li>Session started</li>
              <li>Intent detected</li>
              <li>Skill engaged: Research Scout</li>
              <li>Memory write: 2 items</li>
              <li>Output pending</li>
            </ul>
          </section>
        </>
        ) : null}

        {surfaceId === "figma-287-714" || forceHint ? (
        <>
          <HomeVessel avatarSlot={avatarSlot} />
          {surfaceId === "figma-287-714" ? <img alt="Click Current State" className="pm-home-flow__current-cursor" src={handCursor} /> : null}
          <button
            aria-label="Talk to this State"
            className="pm-home-flow__chat-target"
            onBlur={() => setHoverHint(false)}
            onClick={() => void dispatch(screenCommand("figma-32-2"))}
            onFocus={() => setHoverHint(true)}
            onMouseEnter={() => setHoverHint(true)}
            onMouseLeave={() => setHoverHint(false)}
            type="button"
          />
          {forceHint || hoverHint ? (
            <div className="pm-home-flow__chat-hint" role="tooltip">
              <img alt="" aria-hidden="true" src={handCursor} />
              <span>click to chat with her.</span>
            </div>
          ) : null}
        </>
        ) : null}

        {isStateDetail ? <StateFocusDetail dispatch={dispatch} /> : null}
        {isConversation ? (
          <ConversationScene
            avatarSlot={avatarSlot}
            dispatch={dispatch}
            replyVisible={surfaceId === "figma-412-728"}
          />
        ) : null}
      </div>

    </section>
  );
}
