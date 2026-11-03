import { Object3D, Quaternion, Vector3 } from "three";

const clamp = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

/** Cortana has no facial morph targets. Preserve her skin and use only authored joints. */
export class CortanaFaceDriver {
  private readonly jaw: Object3D | undefined;
  private readonly eyes: { bone: Object3D; yawAxis: Vector3; pitchAxis: Vector3 }[] = [];
  private readonly base = new Map<Object3D, Quaternion>();
  private opening = 0;
  private yaw = 0;
  private pitch = 0;

  constructor(root: Object3D) {
    this.jaw = root.getObjectByName("b_jaw");
    root.updateMatrixWorld(true);
    const rootRotation = root.getWorldQuaternion(new Quaternion());
    for (const name of ["b_l_eye", "b_r_eye"]) {
      const bone = root.getObjectByName(name);
      if (!bone) continue;
      const inverse = bone.getWorldQuaternion(new Quaternion()).invert().multiply(rootRotation);
      // Her left and right eyeballs have different authored local axes.
      this.eyes.push({ bone, yawAxis: new Vector3(0, 1, 0).applyQuaternion(inverse),
        pitchAxis: new Vector3(0, 0, 1).applyQuaternion(inverse) });
    }
  }

  beginFrame(): void {
    for (const [bone, rotation] of this.base) bone.quaternion.copy(rotation);
    this.base.clear();
  }

  update(channels: ReadonlyMap<string, number>, weight: number, energy: number, delta: number): void {
    const value = (name: string) => clamp(channels.get(name) ?? 0);
    const blend = clamp(weight);
    const opening = clamp(value("jawopen") * (1 - value("mouthclose"))) * blend + clamp(energy) * (1 - blend);
    const yaw = (value("eyelookoutleft") - value("eyelookinleft") + value("eyelookinright") - value("eyelookoutright")) * 0.5 * blend;
    const pitch = (value("eyelookupleft") - value("eyelookdownleft") + value("eyelookupright") - value("eyelookdownright")) * 0.5 * blend;
    const smoothing = 1 - Math.exp(-Math.max(0, delta) / 0.035);
    this.opening += (opening - this.opening) * smoothing;
    this.yaw += (yaw - this.yaw) * smoothing;
    this.pitch += (pitch - this.pitch) * smoothing;
    if (this.jaw) this.rotate(this.jaw, new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), this.opening * 0.24));
    for (const eye of this.eyes) this.rotate(eye.bone,
      new Quaternion().setFromAxisAngle(eye.yawAxis, this.yaw * 0.10)
        .multiply(new Quaternion().setFromAxisAngle(eye.pitchAxis, this.pitch * 0.08)));
  }

  private rotate(bone: Object3D, rotation: Quaternion): void {
    this.base.set(bone, bone.quaternion.clone());
    bone.quaternion.multiply(rotation);
  }
}
