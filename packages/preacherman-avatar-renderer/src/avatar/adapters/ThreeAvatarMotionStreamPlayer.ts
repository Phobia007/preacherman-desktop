import {
  Bone,
  Matrix4,
  Mesh,
  Object3D,
  Quaternion,
  PropertyBinding,
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
const IDENTITY_MATRIX = new Matrix4();

interface TargetBoneState {
  readonly bone: Bone;
  readonly depth: number;
  readonly restRootQuaternion: Quaternion;
  readonly restLocalQuaternion: Quaternion;
  readonly restRootPosition: Vector3;
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
  private cancelled = false;
  private readonly basePose = new Map<Bone, Quaternion>();
  private sourceRest = new Map<string, AvatarMotionRestJoint>();
  private referenceRotations = new Map<string, Quaternion>();
  private readonly restPositions = new Map<string, Vector3>();
  private readonly sourceToAvatar: Quaternion;
  private targetAnchor: { bone: Bone; rest: Quaternion } | null = null;
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
    this.sourceToAvatar = binding.calibration
      ? new Quaternion().fromArray(binding.calibration.sourceToAvatar).multiply(BLENDER_TO_GLTF)
      : BLENDER_TO_GLTF.clone();
    root.updateMatrixWorld(true);
    const inverseRootWorld = root.matrixWorld.clone().invert();
    root.traverse((object) => {
      if (object instanceof Bone) {
        const restRoot = inverseRootWorld.clone().multiply(object.matrixWorld);
        this.restPositions.set(object.name, new Vector3().setFromMatrixPosition(restRoot));
        if (object.name === PropertyBinding.sanitizeNodeName(binding.calibration?.anchor.target ?? "")) {
          this.targetAnchor = { bone: object, rest: new Quaternion().setFromRotationMatrix(new Matrix4().extractRotation(restRoot)).normalize() };
        }
        const target = [...Object.entries(binding.bones)]
          .find(([, targetName]) => PropertyBinding.sanitizeNodeName(targetName) === object.name || targetName === object.name);
        if (target) {
          this.targetBones.set(target[0], {
            bone: object,
            depth: boneDepth(object),
            restRootQuaternion: new Quaternion().setFromRotationMatrix(new Matrix4().extractRotation(restRoot)).normalize(),
            restLocalQuaternion: object.quaternion.clone(),
            restRootPosition: new Vector3().setFromMatrixPosition(restRoot),
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
      if (event.metadata.characterId && this.binding.characterId !== event.metadata.characterId) return;
      this.metadata = event.metadata;
      this.values = new Float32Array();
      this.elapsed = Math.max(0, -event.metadata.timelineStartFrame / event.metadata.frameRate);
      this.ended = false;
      this.cancelled = false;
      this.fade = 1;
      this.lastFrame = -1;
      this.sourceRest = new Map(event.metadata.restJoints.map((joint) => [joint.name, joint]));
      this.calibrateReferencePose();
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
      this.cancelled = true;
      this.fade = Math.min(this.fade, 0.999);
    }
  }

  update(deltaSeconds: number): void {
    const metadata = this.metadata;
    if (metadata && this.fade > 0) this.updateBody(metadata, deltaSeconds);
    this.updateFace(deltaSeconds);
  }

  /** Restore the authored pose before the idle mixer runs, including unkeyed joints. */
  beginFrame(): void {
    for (const [bone, rotation] of this.basePose) bone.quaternion.copy(rotation);
    this.basePose.clear();
  }

  private updateBody(metadata: AvatarMotionStreamMetadata, deltaSeconds: number): void {
    const valuesPerFrame = metadata.jointNames.length * 9 + 6 + metadata.blendshapeNames.length;
    const frameCount = Math.floor(this.values.length / valuesPerFrame);
    if (frameCount === 0) { if (this.cancelled) this.metadata = null; return; }

    const audioTime = metadata.playbackTime?.();
    if (!this.cancelled) {
      if (metadata.playbackTime && audioTime === null) return;
      this.elapsed = metadata.playbackTime
        ? Math.max(0, (audioTime ?? 0) - metadata.timelineStartFrame / metadata.frameRate)
        : this.elapsed + Math.max(0, deltaSeconds);
    }
    const requestedFrame = Math.floor(this.elapsed * metadata.frameRate);
    const frame = Math.min(requestedFrame, frameCount - 1);
    if (this.cancelled || (this.ended && requestedFrame >= frameCount)) {
      this.fade = Math.max(0, this.fade - deltaSeconds / (this.cancelled ? 0.16 : 0.28));
    }
    const fadeIn = metadata.playbackTime ? Math.min(1, Math.max(0, audioTime ?? 0) / 0.18) : 1;
    const strength = Math.max(0, Math.min(1, metadata.strength ?? 1));
    const fraction = this.binding.calibration && !this.cancelled
      ? this.elapsed * metadata.frameRate - requestedFrame : 0;
    this.applyFrame(frame, valuesPerFrame, this.fade * fadeIn * strength, fraction);
    this.lastFrame = frame;
    if (this.fade === 0) this.metadata = null;
  }

  dispose(): void {
    this.beginFrame();
    this.metadata = null;
    this.values = new Float32Array();
    this.targetBones.clear();
    this.morphTargets.clear();
    this.faceValues = new Float32Array();
    this.faceStreamId = null;
  }

  private calibrateReferencePose(): void {
    this.referenceRotations.clear();
    for (const [name, target] of this.targetBones) {
      const reference = target.restRootQuaternion.clone();
      const aim = this.binding.calibration?.aimChildren[name];
      const source = this.sourceRest.get(name), child = aim && this.sourceRest.get(aim.source);
      const targetChild = aim && this.restPositions.get(PropertyBinding.sanitizeNodeName(aim.target));
      if (source && child && targetChild) {
        const from = targetChild.clone().sub(target.restRootPosition).normalize();
        const to = new Vector3().setFromMatrixPosition(matrix4(child.matrix))
          .sub(new Vector3().setFromMatrixPosition(matrix4(source.matrix)))
          .applyQuaternion(this.sourceToAvatar).normalize();
        reference.premultiply(new Quaternion().setFromUnitVectors(from, to));
      }
      this.referenceRotations.set(name, reference);
    }
  }

  private applyFrame(frame: number, valuesPerFrame: number, weight: number, fraction = 0): void {
    const metadata = this.metadata;
    if (!metadata) return;
    const frameOffset = frame * valuesPerFrame;
    const nextOffset = Math.min(frame + 1, Math.floor(this.values.length / valuesPerFrame) - 1) * valuesPerFrame;
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
      if (index !== undefined && fraction > 0 && nextOffset !== frameOffset) {
        const from = new Quaternion().setFromRotationMatrix(basis).normalize();
        const to = new Quaternion().setFromRotationMatrix(rotationMatrix(this.values, nextOffset + index * 9)).normalize();
        basis.makeRotationFromQuaternion(from.slerp(to, fraction));
      }
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

    const ordered = [...this.targetBones.entries()].sort((left, right) => left[1].depth - right[1].depth);
    const anchorName = this.binding.calibration?.anchor.source;
    const anchorRest = anchorName && this.sourceRest.get(anchorName);
    const sourceAnchorCorrection = anchorRest && anchorName
      ? new Quaternion().setFromRotationMatrix(matrix4(anchorRest.matrix))
        .multiply(new Quaternion().setFromRotationMatrix(resolveSourceGlobal(anchorName)).invert())
      : new Quaternion();
    const targetAnchorDelta = this.targetAnchor
      ? this.rootRelativeQuaternion(this.targetAnchor.bone).multiply(this.targetAnchor.rest.clone().invert())
      : new Quaternion();
    for (const [sourceName, target] of ordered) {
      if (!jointIndex.has(sourceName)) continue;
      const sourcePose = resolveSourceGlobal(sourceName);
      const sourceRest = this.sourceRest.get(sourceName);
      if (!sourceRest) continue;
      const delta = new Quaternion().setFromRotationMatrix(sourcePose)
        .premultiply(sourceAnchorCorrection)
        .multiply(new Quaternion().setFromRotationMatrix(matrix4(sourceRest.matrix)).invert());
      delta.premultiply(this.sourceToAvatar).multiply(this.sourceToAvatar.clone().invert());
      const desiredRoot = delta.multiply((this.referenceRotations.get(sourceName) ?? target.restRootQuaternion).clone())
        .premultiply(targetAnchorDelta);
      const parentRoot = this.rootRelativeQuaternion(target.bone.parent);
      const desiredLocal = parentRoot.clone().invert().multiply(desiredRoot);
      const limit = this.binding.calibration?.jointLimits[sourceName];
      if (limit !== undefined) {
        const angle = target.restLocalQuaternion.angleTo(desiredLocal);
        if (angle > limit) desiredLocal.copy(target.restLocalQuaternion.clone().slerp(desiredLocal, limit / angle));
      }
      this.basePose.set(target.bone, target.bone.quaternion.clone());
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
