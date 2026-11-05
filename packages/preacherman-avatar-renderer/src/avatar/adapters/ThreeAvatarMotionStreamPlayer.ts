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
import { CortanaFaceDriver } from "./CortanaFaceDriver";

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
  private anchorBasePosition: Vector3 | null = null;
  private readonly groundPoints: Object3D[] = [];
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
  private faceCancelled = false;
  private faceClock?: () => number | null;
  private readonly faceDriver?: CortanaFaceDriver;
  private readonly morphBase = new Map<MorphTargetState, number>();
  private readonly displayedBodyPose = new Map<Bone, Quaternion>();
  private bodyStreamId: string | null = null;
  private bodyBlend: { from: Map<Bone, Quaternion>; elapsed: number; duration: number } | null = null;
  private bodyReleaseSeconds = 0;

  constructor(
    private readonly root: Object3D,
    private readonly binding: AvatarMotionRigBinding,
  ) {
    if (binding.faceRig === "cortana-jaw-eyes") this.faceDriver = new CortanaFaceDriver(root);
    this.sourceToAvatar = binding.calibration
      ? new Quaternion().fromArray(binding.calibration.sourceToAvatar).multiply(BLENDER_TO_GLTF)
      : BLENDER_TO_GLTF.clone();
    root.updateMatrixWorld(true);
    const inverseRootWorld = root.matrixWorld.clone().invert();
    root.traverse((object) => {
      if (binding.grounding?.feet.some(name => PropertyBinding.sanitizeNodeName(name) === object.name)) this.groundPoints.push(object);
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
      if (event.characterId && event.characterId !== this.binding.characterId) return;
      this.faceStreamId = event.streamId;
      this.faceNames = event.blendshapeNames;
      this.faceValues = new Float32Array();
      this.faceElapsed = 0;
      this.faceFrameRate = event.frameRate;
      this.faceEnded = false;
      this.faceCancelled = false;
      this.faceClock = event.playbackTime;
      this.faceFade = 1;
      return;
    }
    if (event.type === "face-frames" && event.streamId === this.faceStreamId && !this.faceEnded) {
      if (!this.faceNames.length || event.values.length % this.faceNames.length || !event.values.every(Number.isFinite)) return;
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
      if (event.type !== "face-ended") this.faceCancelled = true;
      return;
    }
    if (event.type === "started") {
      if (event.metadata.characterId && this.binding.characterId !== event.metadata.characterId) return;
      this.metadata = event.metadata;
      this.values = new Float32Array();
      this.elapsed = Math.max(0, -event.metadata.timelineStartFrame / event.metadata.frameRate);
      this.ended = false;
      this.cancelled = false;
      this.bodyReleaseSeconds = this.binding.motionTransitions?.release ?? 0;
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
      this.bodyReleaseSeconds = event.type === "cancelled" && event.reason === "audio-ended"
        ? this.binding.motionTransitions?.release ?? 0
        : this.binding.motionTransitions?.interrupt ?? 0;
      this.fade = Math.min(this.fade, 0.999);
    }
  }

  update(deltaSeconds: number, jawEnergy = 0): void {
    // Sample the current authored idle after its mixer, before adding speech.
    const metadata = this.metadata;
    const support = metadata || this.bodyBlend || this.bodyStreamId
      ? this.groundPoints.map(point => this.root.worldToLocal(point.getWorldPosition(new Vector3()))) : [];
    const applied = metadata && this.fade > 0 ? this.updateBody(metadata, deltaSeconds) : false;
    if (this.binding.motionTransitions) this.blendBody(applied ? metadata!.streamId : null, deltaSeconds);
    if (applied || this.bodyBlend || this.bodyStreamId) this.groundBody(support);
    this.updateFace(deltaSeconds, jawEnergy);
  }

  /** Restore the authored pose before the idle mixer runs, including unkeyed joints. */
  beginFrame(): void {
    if (this.anchorBasePosition && this.targetAnchor) this.targetAnchor.bone.position.copy(this.anchorBasePosition);
    this.anchorBasePosition = null;
    this.faceDriver?.beginFrame();
    for (const [target, value] of this.morphBase) target.influences[target.index] = value;
    this.morphBase.clear();
    for (const [bone, rotation] of this.basePose) bone.quaternion.copy(rotation);
    this.basePose.clear();
  }

  private updateBody(metadata: AvatarMotionStreamMetadata, deltaSeconds: number): boolean {
    const valuesPerFrame = metadata.jointNames.length * 9 + 6 + metadata.blendshapeNames.length;
    const frameCount = Math.floor(this.values.length / valuesPerFrame);
    if (frameCount === 0) { if (this.cancelled) this.metadata = null; return false; }

    const audioTime = metadata.playbackTime?.();
    if (!this.cancelled) {
      if (metadata.playbackTime && audioTime === null) return false;
      this.elapsed = metadata.playbackTime
        ? Math.max(0, (audioTime ?? 0) - metadata.timelineStartFrame / metadata.frameRate)
        : this.elapsed + Math.max(0, deltaSeconds);
    }
    const requestedFrame = Math.floor(this.elapsed * metadata.frameRate);
    const frame = Math.min(requestedFrame, frameCount - 1);
    if (this.binding.motionTransitions && (this.cancelled || (this.ended && requestedFrame >= frameCount))) {
      // Return from the last displayed pose, never an unheard buffered frame.
      this.metadata = null;
      return false;
    }
    if (this.cancelled || (this.ended && requestedFrame >= frameCount)) {
      this.fade = Math.max(0, this.fade - deltaSeconds / (this.cancelled ? 0.16 : 0.28));
    }
    const fadeIn = metadata.playbackTime ? Math.min(1, Math.max(0, audioTime ?? 0) / 0.18) : 1;
    const strength = Math.max(0, Math.min(1, metadata.strength ?? 1));
    const fraction = this.binding.calibration && !this.cancelled
      ? this.elapsed * metadata.frameRate - requestedFrame : 0;
    this.applyFrame(frame, valuesPerFrame, this.binding.motionTransitions ? strength : this.fade * fadeIn * strength, fraction);
    this.lastFrame = frame;
    if (this.fade === 0) this.metadata = null;
    return true;
  }

  private blendBody(streamId: string | null, deltaSeconds: number): void {
    if (streamId !== this.bodyStreamId) {
      const from = new Map<Bone, Quaternion>();
      for (const { bone } of this.targetBones.values()) {
        // Capture the visible pose, including an unfinished return or previous sentence.
        from.set(bone, (this.displayedBodyPose.get(bone) ?? this.basePose.get(bone) ?? bone.quaternion).clone());
      }
      this.bodyBlend = { from, elapsed: 0,
        duration: streamId ? this.binding.motionTransitions!.enter : this.bodyReleaseSeconds };
      this.bodyStreamId = streamId;
    }
    const blend = this.bodyBlend;
    if (!streamId && !blend) return;
    if (blend) blend.elapsed += Math.max(0, deltaSeconds);
    const t = blend ? Math.min(1, blend.elapsed / Math.max(0.001, blend.duration)) : 1;
    // Zero velocity and acceleration at both ends avoids the old linear snap.
    const weight = t * t * t * (t * (t * 6 - 15) + 10);
    for (const { bone } of this.targetBones.values()) {
      if (!this.basePose.has(bone)) this.basePose.set(bone, bone.quaternion.clone());
      if (blend) {
        const target = bone.quaternion.clone();
        bone.quaternion.copy(blend.from.get(bone)!).slerp(target, weight);
      }
      this.displayedBodyPose.set(bone, bone.quaternion.clone());
    }
    if (t === 1) {
      this.bodyBlend = null;
      if (!streamId) this.displayedBodyPose.clear();
    }
  }

  dispose(): void {
    this.beginFrame();
    this.metadata = null;
    this.values = new Float32Array();
    this.targetBones.clear();
    this.morphTargets.clear();
    this.faceValues = new Float32Array();
    this.faceStreamId = null;
    this.displayedBodyPose.clear();
    this.bodyBlend = null;
    this.bodyStreamId = null;
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
    for (const [sourceName, target] of ordered) {
      if (!jointIndex.has(sourceName)) continue;
      const sourcePose = resolveSourceGlobal(sourceName);
      const sourceRest = this.sourceRest.get(sourceName);
      if (!sourceRest) continue;
      const isAnchor = sourceName === anchorName;
      // A mapped pelvis gets its local tilt/turn, bounded by the character limit.
      // Strip source Root travel/turns; descendants then follow the *applied* pelvis.
      const anchorParent = isAnchor && sourceRest.parent ? this.sourceRest.get(sourceRest.parent) : undefined;
      const correction = isAnchor
        ? anchorParent ? new Quaternion().setFromRotationMatrix(matrix4(anchorParent.matrix))
          .multiply(new Quaternion().setFromRotationMatrix(resolveSourceGlobal(anchorParent.name)).invert()) : new Quaternion()
        : sourceAnchorCorrection;
      const delta = new Quaternion().setFromRotationMatrix(sourcePose)
        .premultiply(correction)
        .multiply(new Quaternion().setFromRotationMatrix(matrix4(sourceRest.matrix)).invert());
      delta.premultiply(this.sourceToAvatar).multiply(this.sourceToAvatar.clone().invert());
      const desiredRoot = delta.multiply((this.referenceRotations.get(sourceName) ?? target.restRootQuaternion).clone())
        .premultiply(!isAnchor && this.targetAnchor
          ? this.rootRelativeQuaternion(this.targetAnchor.bone).multiply(this.targetAnchor.rest.clone().invert())
          : new Quaternion());
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

  private groundBody(support: Vector3[]): void {
    const config = this.binding.grounding, anchor = this.targetAnchor?.bone;
    if (!config || !anchor?.parent || !support.length) return;
    this.root.updateMatrixWorld(true);
    const current = this.groundPoints.map(point => this.root.worldToLocal(point.getWorldPosition(new Vector3())));
    const lift = current.map((point, index) => point.y - support[index].y);
    const lowest = Math.min(...lift);
    // Low points carry the weight; a lifted foot is free to articulate. Smooth
    // support weights avoid snapping from one foot to the other during a shift.
    const offset = new Vector3(); let total = 0;
    current.forEach((point, index) => {
      const weight = Math.exp(-(lift[index] - lowest) / 0.02);
      offset.addScaledVector(support[index].clone().sub(point), weight); total += weight;
    });
    offset.divideScalar(total); offset.y = 0; offset.clampLength(0, config.maxHorizontal);
    offset.y = Math.max(-config.maxVertical, Math.min(config.maxVertical, -lowest));
    this.anchorBasePosition = anchor.position.clone();
    const position = this.root.worldToLocal(anchor.getWorldPosition(new Vector3())).add(offset);
    anchor.position.copy(anchor.parent.worldToLocal(this.root.localToWorld(position)));
    this.root.updateMatrixWorld(true);
  }

  private updateFace(deltaSeconds: number, jawEnergy: number): void {
    const channels = new Map<string, number>();
    let weight = 0;
    const frameCount = Math.floor(this.faceValues.length / this.faceNames.length);
    if (this.faceStreamId && this.faceFade > 0 && frameCount > 0) {
      const audioTime = this.faceClock?.();
      if (!this.faceCancelled && (!this.faceClock || audioTime !== null)) {
        this.faceElapsed = this.faceClock ? Math.max(0, audioTime ?? 0) : this.faceElapsed + Math.max(0, deltaSeconds);
      }
      const requestedFrame = Math.floor(this.faceElapsed * this.faceFrameRate);
      const frame = Math.min(requestedFrame, frameCount - 1);
      if (this.faceCancelled || (this.faceEnded && requestedFrame >= frameCount)) {
        this.faceFade = Math.max(0, this.faceFade - deltaSeconds / 0.10);
      }
      const fadeIn = this.faceClock ? Math.min(1, this.faceElapsed / 0.06) : 1;
      // Never animate before audio starts or freeze a stale mouth while inference catches up.
      const fresh = this.faceClock ? Math.max(0, 1 - Math.max(0, this.faceElapsed - frameCount / this.faceFrameRate) / 0.12) : 1;
      weight = this.faceClock && audioTime === null ? 0 : this.faceFade * fadeIn * fresh;
      const fraction = this.faceClock ? this.faceElapsed * this.faceFrameRate - requestedFrame : 0;
      const next = Math.min(frame + 1, frameCount - 1);
      const values = new Float32Array(this.faceNames.length);
      this.faceNames.forEach((name, index) => {
        const a = this.faceValues[frame * this.faceNames.length + index];
        const b = this.faceValues[next * this.faceNames.length + index];
        values[index] = a + (b - a) * fraction;
        channels.set(normalizedChannel(name), values[index]);
      });
      this.applyFaceValues(
        this.faceNames,
        values,
        0,
        weight,
      );
      if (this.faceFade === 0) this.faceStreamId = null;
    }
    this.faceDriver?.update(channels, weight, jawEnergy, deltaSeconds);
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
        if (!this.morphBase.has(target)) this.morphBase.set(target, target.influences[target.index]);
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
