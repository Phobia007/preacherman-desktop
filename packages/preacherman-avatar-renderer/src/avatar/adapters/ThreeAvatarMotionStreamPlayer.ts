import {
  Bone,
  Matrix4,
  Mesh,
  Object3D,
  Quaternion,
  Vector3,
} from "three";
import type {
  AvatarMotionRestJoint,
  AvatarMotionRigBinding,
  AvatarMotionStreamEvent,
  AvatarMotionStreamMetadata,
} from "../contracts/AvatarMotionStream";

const BLENDER_TO_GLTF = new Quaternion().setFromAxisAngle(
  new Vector3(1, 0, 0),
  -Math.PI / 2,
);
const BLENDER_TO_GLTF_INVERSE = BLENDER_TO_GLTF.clone().invert();
const IDENTITY_MATRIX = new Matrix4();

interface TargetBoneState {
  readonly bone: Bone;
  readonly depth: number;
  readonly restRootQuaternion: Quaternion;
}

interface MorphTargetState {
  readonly influences: number[];
  readonly index: number;
}

function matrix4(values: readonly number[]): Matrix4 {
  if (values.length !== 16) throw new Error("Motion rest matrices must contain 16 values.");
  return new Matrix4().set(
    values[0], values[1], values[2], values[3],
    values[4], values[5], values[6], values[7],
    values[8], values[9], values[10], values[11],
    values[12], values[13], values[14], values[15],
  );
}

function rotationMatrix(values: Float32Array, offset: number): Matrix4 {
  return new Matrix4().set(
    values[offset], values[offset + 1], values[offset + 2], 0,
    values[offset + 3], values[offset + 4], values[offset + 5], 0,
    values[offset + 6], values[offset + 7], values[offset + 8], 0,
    0, 0, 0, 1,
  );
}

function boneDepth(bone: Bone): number {
  let depth = 0;
  let parent: Object3D | null = bone.parent;
  while (parent) {
    depth += 1;
    parent = parent.parent;
  }
  return depth;
}

function normalizedChannel(value: string): string {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

export class ThreeAvatarMotionStreamPlayer {
  private metadata: AvatarMotionStreamMetadata | null = null;
  private values = new Float32Array();
  private elapsed = 0;
  private ended = false;
  private fade = 0;
  private lastFrame = -1;
  private sourceRest = new Map<string, AvatarMotionRestJoint>();
  private targetBones = new Map<string, TargetBoneState>();
  private morphTargets = new Map<string, MorphTargetState[]>();
  private faceStreamId: string | null = null;
  private faceNames: readonly string[] = [];
  private faceValues = new Float32Array();
  private faceElapsed = 0;
  private faceFrameRate = 30;
  private faceEnded = false;
  private faceFade = 0;

  constructor(
    private readonly root: Object3D,
    private readonly binding: AvatarMotionRigBinding,
  ) {
    root.updateMatrixWorld(true);
    const inverseRootWorld = root.matrixWorld.clone().invert();
    root.traverse((object) => {
      if (object instanceof Bone) {
        const target = [...Object.entries(binding.bones)]
          .find(([, targetName]) => targetName === object.name);
        if (target) {
          const restRoot = inverseRootWorld.clone().multiply(object.matrixWorld);
          this.targetBones.set(target[0], {
            bone: object,
            depth: boneDepth(object),
            restRootQuaternion: new Quaternion().setFromRotationMatrix(restRoot),
          });
        }
      }
      if (!(object instanceof Mesh) || !object.morphTargetDictionary || !object.morphTargetInfluences) return;
      for (const [name, index] of Object.entries(object.morphTargetDictionary)) {
        const key = normalizedChannel(name);
        const entries = this.morphTargets.get(key) ?? [];
        entries.push({ influences: object.morphTargetInfluences, index });
        this.morphTargets.set(key, entries);
      }
    });
  }

  receive(event: AvatarMotionStreamEvent): void {
    if (event.type === "face-started") {
      this.faceStreamId = event.streamId;
      this.faceNames = event.blendshapeNames;
      this.faceValues = new Float32Array();
      this.faceElapsed = 0;
      this.faceFrameRate = event.frameRate;
      this.faceEnded = false;
      this.faceFade = 1;
      return;
    }
    if (event.type === "face-frames" && event.streamId === this.faceStreamId) {
      const joined = new Float32Array(this.faceValues.length + event.values.length);
      joined.set(this.faceValues);
      joined.set(event.values, this.faceValues.length);
      this.faceValues = joined;
      return;
    }
    if (
      (event.type === "face-ended" || event.type === "face-cancelled" || event.type === "face-failed")
      && event.streamId === this.faceStreamId
    ) {
      this.faceEnded = true;
      return;
    }
    if (event.type === "started") {
      this.metadata = event.metadata;
      this.values = new Float32Array();
      this.elapsed = Math.max(0, -event.metadata.timelineStartFrame / event.metadata.frameRate);
      this.ended = false;
      this.fade = 1;
      this.lastFrame = -1;
      this.sourceRest = new Map(event.metadata.restJoints.map((joint) => [joint.name, joint]));
      return;
    }
    if (!this.metadata || event.streamId !== this.metadata.streamId) return;
    if (event.type === "frames") {
      const joined = new Float32Array(this.values.length + event.values.length);
      joined.set(this.values);
      joined.set(event.values, this.values.length);
      this.values = joined;
    } else if (event.type === "ended") {
      this.ended = true;
    } else {
      this.ended = true;
      this.fade = Math.min(this.fade, 0.999);
    }
  }

  update(deltaSeconds: number): void {
    const metadata = this.metadata;
    if (metadata && this.fade > 0) this.updateBody(metadata, deltaSeconds);
    this.updateFace(deltaSeconds);
  }

  private updateBody(metadata: AvatarMotionStreamMetadata, deltaSeconds: number): void {
    const valuesPerFrame = metadata.jointNames.length * 9 + 6 + metadata.blendshapeNames.length;
    const frameCount = Math.floor(this.values.length / valuesPerFrame);
    if (frameCount === 0) return;

    this.elapsed += Math.max(0, deltaSeconds);
    const requestedFrame = Math.floor(this.elapsed * metadata.frameRate);
    const frame = Math.min(requestedFrame, frameCount - 1);
    if (this.ended && requestedFrame >= frameCount) {
      this.fade = Math.max(0, this.fade - deltaSeconds / 0.28);
    }
    this.applyFrame(frame, valuesPerFrame, this.fade);
    this.lastFrame = frame;
    if (this.fade === 0) this.metadata = null;
  }

  dispose(): void {
    this.metadata = null;
    this.values = new Float32Array();
    this.targetBones.clear();
    this.morphTargets.clear();
    this.faceValues = new Float32Array();
    this.faceStreamId = null;
  }

  private applyFrame(frame: number, valuesPerFrame: number, weight: number): void {
    const metadata = this.metadata;
    if (!metadata) return;
    const frameOffset = frame * valuesPerFrame;
    const jointIndex = new Map(metadata.jointNames.map((name, index) => [name, index]));
    const sourceGlobal = new Map<string, Matrix4>();

    const resolveSourceGlobal = (name: string): Matrix4 => {
      const existing = sourceGlobal.get(name);
      if (existing) return existing;
      const rest = this.sourceRest.get(name);
      if (!rest) return IDENTITY_MATRIX;
      const index = jointIndex.get(name);
      const basis = index === undefined
        ? IDENTITY_MATRIX
        : rotationMatrix(this.values, frameOffset + index * 9);
      const restMatrix = matrix4(rest.matrix);
      const parentRest = rest.parent ? this.sourceRest.get(rest.parent) : undefined;
      const pose = parentRest
        ? resolveSourceGlobal(parentRest.name).clone()
          .multiply(matrix4(parentRest.matrix).invert().multiply(restMatrix))
          .multiply(basis)
        : restMatrix.multiply(basis);
      sourceGlobal.set(name, pose);
      return pose;
    };

    const desiredByBone = new Map<Bone, Quaternion>();
    const ordered = [...this.targetBones.entries()].sort((left, right) => left[1].depth - right[1].depth);
    for (const [sourceName, target] of ordered) {
      if (!jointIndex.has(sourceName)) continue;
      const sourcePose = resolveSourceGlobal(sourceName);
      const sourceRest = this.sourceRest.get(sourceName);
      if (!sourceRest) continue;
      const delta = new Quaternion().setFromRotationMatrix(sourcePose)
        .multiply(new Quaternion().setFromRotationMatrix(matrix4(sourceRest.matrix)).invert());
      delta.premultiply(BLENDER_TO_GLTF).multiply(BLENDER_TO_GLTF_INVERSE);
      const desiredRoot = delta.multiply(target.restRootQuaternion.clone());
      desiredByBone.set(target.bone, desiredRoot);

      const parentDesired = target.bone.parent instanceof Bone
        ? desiredByBone.get(target.bone.parent)
        : undefined;
      const parentRoot = parentDesired ?? this.rootRelativeQuaternion(target.bone.parent);
      const desiredLocal = parentRoot.clone().invert().multiply(desiredRoot);
      target.bone.quaternion.slerp(desiredLocal, weight);
    }

    const blendshapeOffset = frameOffset + metadata.jointNames.length * 9 + 6;
    this.applyFaceValues(
      metadata.blendshapeNames,
      this.values,
      blendshapeOffset,
      weight,
    );
  }

  private updateFace(deltaSeconds: number): void {
    if (!this.faceStreamId || this.faceFade <= 0 || this.faceNames.length === 0) return;
    const frameCount = Math.floor(this.faceValues.length / this.faceNames.length);
    if (frameCount === 0) return;
    this.faceElapsed += Math.max(0, deltaSeconds);
    const requestedFrame = Math.floor(this.faceElapsed * this.faceFrameRate);
    const frame = Math.min(requestedFrame, frameCount - 1);
    if (this.faceEnded && requestedFrame >= frameCount) {
      this.faceFade = Math.max(0, this.faceFade - deltaSeconds / 0.18);
    }
    this.applyFaceValues(
      this.faceNames,
      this.faceValues,
      frame * this.faceNames.length,
      this.faceFade,
    );
    if (this.faceFade === 0) this.faceStreamId = null;
  }

  private applyFaceValues(
    names: readonly string[],
    values: Float32Array,
    offset: number,
    weight: number,
  ): void {
    names.forEach((sourceName, index) => {
      const targetName = this.binding.faceChannels?.[sourceName] ?? sourceName;
      const targets = this.morphTargets.get(normalizedChannel(targetName));
      if (!targets) return;
      const value = Math.max(0, Math.min(1, values[offset + index] ?? 0));
      for (const target of targets) {
        target.influences[target.index] += (value - target.influences[target.index]) * weight;
      }
    });
  }

  private rootRelativeQuaternion(object: Object3D | null): Quaternion {
    if (!object) return new Quaternion();
    this.root.updateMatrixWorld(true);
    const rootWorld = this.root.getWorldQuaternion(new Quaternion());
    const objectWorld = object.getWorldQuaternion(new Quaternion());
    return rootWorld.invert().multiply(objectWorld);
  }
}
