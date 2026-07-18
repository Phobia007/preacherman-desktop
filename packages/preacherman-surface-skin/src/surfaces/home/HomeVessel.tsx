import { Component, useEffect, useState, type ReactNode } from "react";
import type { AvatarSlot } from "../../adapter/types";
import mainHuman from "../../assets/figma/home-batch-1/281-374--state-vessel-translucent-human-figure.png";
import mainOrbitSlow from "../../assets/figma/home-batch-1/281-374--state-vessel-orbit-line-slow-rotation.svg";
import mainOrbitSecondary from "../../assets/figma/home-batch-1/281-374--state-vessel-secondary-orbit-line.svg";
import mainHaloMemory from "../../assets/figma/home-batch-1/281-374--state-vessel-skill-halo-memory-core.svg";
import mainHaloSkill from "../../assets/figma/home-batch-1/281-374--state-vessel-skill-halo-code-copilot.svg";
import chatHuman from "../../assets/figma/home-batch-1/32-2--state-vessel-translucent-human-figure.png";
import replyHuman from "../../assets/figma/home-batch-1/412-728--state-vessel-translucent-human-figure.png";
import chatOrbitSlow from "../../assets/figma/home-batch-1/32-2--state-vessel-orbit-line-slow-rotation.svg";
import chatOrbitSecondary from "../../assets/figma/home-batch-1/32-2--state-vessel-secondary-orbit-line.svg";
import chatHaloMemory from "../../assets/figma/home-batch-1/32-2--state-vessel-skill-halo-memory-core.svg";
import chatHaloSkill from "../../assets/figma/home-batch-1/32-2--state-vessel-skill-halo-code-copilot.svg";
import replyHaloMemory from "../../assets/figma/home-batch-1/412-728--state-vessel-skill-halo-memory-core.svg";

interface HomeVesselProps {
  readonly avatarSlot?: AvatarSlot;
  readonly layout?: "home" | "chat" | "reply";
}

interface AvatarSlotBoundaryProps {
  readonly children: ReactNode;
  readonly onError: (error: unknown) => void;
}

interface AvatarSlotBoundaryState {
  readonly failed: boolean;
}

class AvatarSlotBoundary extends Component<
  AvatarSlotBoundaryProps,
  AvatarSlotBoundaryState
> {
  state: AvatarSlotBoundaryState = { failed: false };

  static getDerivedStateFromError(): AvatarSlotBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error): void {
    this.props.onError(error);
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

const haloPositions = {
  home: [[478, 334], [620, 510], [874, 265], [891, 434]],
  chat: [[173, 322], [323, 517], [580, 244], [611, 426]],
  reply: [[190, 337], [272, 505], [560, 205], [612, 402]],
} as const;

export function HomeVessel({
  avatarSlot: AvatarSlotComponent,
  layout = "home",
}: HomeVesselProps) {
  const [avatarState, setAvatarState] = useState<"fallback" | "loading" | "ready">(
    AvatarSlotComponent ? "loading" : "fallback",
  );
  const isChat = layout !== "home";
  const human = layout === "reply" ? replyHuman : isChat ? chatHuman : mainHuman;
  const memoryHalo = layout === "reply" ? replyHaloMemory : isChat ? chatHaloMemory : mainHaloMemory;
  const skillHalo = isChat ? chatHaloSkill : mainHaloSkill;
  const positions = haloPositions[layout];

  useEffect(() => {
    setAvatarState(AvatarSlotComponent ? "loading" : "fallback");
  }, [AvatarSlotComponent, layout]);

  const handleAvatarError = () => setAvatarState("fallback");

  return (
    <div
      aria-hidden="true"
      className={`pm-home-vessel pm-home-vessel--${layout}`}
      data-avatar-state={avatarState}
    >
      <img
        alt=""
        className="pm-home-vessel__orbit pm-home-vessel__orbit--slow pm-home-vessel__orbit--rear"
        src={isChat ? chatOrbitSlow : mainOrbitSlow}
      />
      <img alt="" className="pm-home-vessel__human" src={human} />
      {AvatarSlotComponent && avatarState !== "fallback" ? (
        <AvatarSlotBoundary onError={handleAvatarError}>
          <AvatarSlotComponent
            className="pm-home-vessel__avatar"
            onError={handleAvatarError}
            onReady={() => setAvatarState("ready")}
          />
        </AvatarSlotBoundary>
      ) : null}
      <img
        alt=""
        className="pm-home-vessel__orbit pm-home-vessel__orbit--secondary pm-home-vessel__orbit--front"
        src={isChat ? chatOrbitSecondary : mainOrbitSecondary}
      />
      {positions.map(([left, top], index) => (
        <img
          alt=""
          className="pm-home-vessel__halo"
          key={`${left}-${top}`}
          src={index === 0 ? memoryHalo : skillHalo}
          style={{ left, top }}
        />
      ))}
    </div>
  );
}
