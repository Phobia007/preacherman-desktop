import type { AvatarAnimationDebugSnapshot } from "./avatar/types/avatarAnimation";

interface AvatarAnimationDebugPanelProps {
  readonly snapshot: AvatarAnimationDebugSnapshot | null;
}

export function AvatarAnimationDebugPanel({
  snapshot,
}: AvatarAnimationDebugPanelProps) {
  if (!snapshot) return null;
  return (
    <aside
      aria-label="Cortana animation diagnostics"
      className="preacherman-avatar-debug"
    >
      <dl>
        <div><dt>Avatar</dt><dd>{snapshot.avatarId}</dd></div>
        <div><dt>Rig</dt><dd>{snapshot.rigId}</dd></div>
        <div>
          <dt>Clips</dt>
          <dd>{snapshot.loadedClips.join(", ") || "—"}</dd>
        </div>
        <div><dt>Action</dt><dd>{snapshot.currentAction ?? "—"}</dd></div>
        <div>
          <dt>Duration</dt>
          <dd>
            {snapshot.currentDuration === null
              ? "—"
              : `${snapshot.currentDuration.toFixed(3)} s`}
          </dd>
        </div>
        <div><dt>Mixer</dt><dd>{snapshot.mixerState}</dd></div>
        <div><dt>Bones</dt><dd>{snapshot.boneCount}</dd></div>
        <div>
          <dt>Missing</dt>
          <dd>{snapshot.missingClipErrors.join(", ") || "none"}</dd>
        </div>
      </dl>
    </aside>
  );
}
