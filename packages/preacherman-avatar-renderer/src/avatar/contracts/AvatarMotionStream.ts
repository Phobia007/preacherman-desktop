export interface AvatarMotionRestJoint {
  readonly name: string;
  readonly parent: string | null;
  /** Row-major 4x4 rest matrix in the source armature coordinate system. */
  readonly matrix: readonly number[];
}

export interface AvatarMotionStreamMetadata {
  readonly streamId: string;
  readonly interactionEpoch: number;
  readonly frameRate: number;
  readonly jointNames: readonly string[];
  readonly blendshapeNames: readonly string[];
  readonly restPoseId: string;
  readonly restJoints: readonly AvatarMotionRestJoint[];
  readonly timelineStartFrame: number;
  /** Audio clock in seconds; null until the matching sentence starts playing. */
  readonly playbackTime?: () => number | null;
  readonly characterId?: string;
  readonly strength?: number;
}

export type AvatarMotionStreamEvent =
  | { readonly type: "started"; readonly metadata: AvatarMotionStreamMetadata }
  | { readonly type: "frames"; readonly streamId: string; readonly values: Float32Array }
  | { readonly type: "ended"; readonly streamId: string }
  | { readonly type: "cancelled"; readonly streamId: string; readonly reason: string }
  | { readonly type: "failed"; readonly streamId: string; readonly error: Error }
  | {
      readonly type: "face-started";
      readonly streamId: string;
      readonly interactionEpoch: number;
      readonly frameRate: number;
      readonly blendshapeNames: readonly string[];
      readonly characterId?: string;
      readonly playbackTime?: () => number | null;
    }
  | { readonly type: "face-frames"; readonly streamId: string; readonly values: Float32Array }
  | { readonly type: "face-ended"; readonly streamId: string }
  | { readonly type: "face-cancelled"; readonly streamId: string; readonly reason: string }
  | { readonly type: "face-failed"; readonly streamId: string; readonly error: Error };

export interface AvatarMotionStreamSource {
  subscribe(listener: (event: AvatarMotionStreamEvent) => void): () => void;
}

export interface AvatarMotionRigBinding {
  readonly id: string;
  readonly characterId?: string;
  /** Speech2Motion joint name to target avatar bone name. */
  readonly bones: Readonly<Record<string, string>>;
  /** Character-specific calibration; authored skin, joint positions and idle stay intact. */
  readonly calibration?: {
    /** Quaternion (x, y, z, w) from glTF-facing source coordinates to avatar coordinates. */
    readonly sourceToAvatar: readonly [number, number, number, number];
    /** Keep upper-body gestures relative to the authored pelvis, not source root turns. */
    readonly anchor: { readonly source: string; readonly target: string };
    /** Aim the reference bone at its anatomical child before applying source motion. */
    readonly aimChildren: Readonly<Record<string, { source: string; target: string }>>;
    /** Maximum local deviation from the character's bind pose, in radians. */
    readonly jointLimits: Readonly<Record<string, number>>;
  };
  readonly rootJoint?: string;
  readonly rootTarget?: string;
  /** Optional Speech2Motion channel name to target morph-target name. */
  readonly faceChannels?: Readonly<Record<string, string>>;
  /** Reduced ARKit mapping for Cortana's existing jaw and eyeball bones. */
  readonly faceRig?: "cortana-jaw-eyes";
}
