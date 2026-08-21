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
  /** Speech2Motion joint name to target avatar bone name. */
  readonly bones: Readonly<Record<string, string>>;
  readonly rootJoint?: string;
  readonly rootTarget?: string;
  /** Optional Speech2Motion channel name to target morph-target name. */
  readonly faceChannels?: Readonly<Record<string, string>>;
}
