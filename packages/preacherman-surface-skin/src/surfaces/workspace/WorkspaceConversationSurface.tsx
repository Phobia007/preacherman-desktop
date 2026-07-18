import { Component, useState, type ReactNode } from "react";
import type { SurfaceViewProps } from "../../adapter/types";
import "./workspace.css";

interface WorkspaceAvatarBoundaryProps {
  readonly children: ReactNode;
  readonly onError: () => void;
}

interface WorkspaceAvatarBoundaryState {
  readonly failed: boolean;
}

class WorkspaceAvatarBoundary extends Component<
  WorkspaceAvatarBoundaryProps,
  WorkspaceAvatarBoundaryState
> {
  state: WorkspaceAvatarBoundaryState = { failed: false };

  static getDerivedStateFromError(): WorkspaceAvatarBoundaryState {
    return { failed: true };
  }

  componentDidCatch(): void {
    this.props.onError();
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

export function WorkspaceConversationSurface({
  avatarSlot: AvatarSlotComponent,
  manifest,
  tokenStyle,
}: SurfaceViewProps) {
  const [avatarState, setAvatarState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const handleAvatarError = () => setAvatarState("error");

  return (
    <section
      aria-label="Preacherman conversation workspace"
      className="pm-surface-skin pm-workspace"
      data-figma-frame="281:538"
      data-surface-type={manifest.surfaceType}
      style={tokenStyle}
    >
      {AvatarSlotComponent && avatarState !== "error" ? (
        <div
          aria-hidden="true"
          className="pm-workspace__avatar-stage"
          data-avatar-state={avatarState}
        >
          <WorkspaceAvatarBoundary onError={handleAvatarError}>
            <AvatarSlotComponent
              className="pm-workspace__avatar-viewport"
              onError={handleAvatarError}
              onReady={() => setAvatarState("ready")}
            />
          </WorkspaceAvatarBoundary>
        </div>
      ) : null}
    </section>
  );
}
