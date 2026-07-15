import haloMemoryAsset from "../../assets/figma/281-538/halo-memory.svg";
import haloSkillAsset from "../../assets/figma/281-538/halo-skill.svg";

interface SkillHaloProps {
  readonly kind: "memory" | "skill";
  readonly left: number;
  readonly top: number;
}

export function SkillHalo({ kind, left, top }: SkillHaloProps) {
  return (
    <img
      alt=""
      aria-hidden="true"
      className="pm-workspace__skill-halo"
      src={kind === "memory" ? haloMemoryAsset : haloSkillAsset}
      style={{ left, top }}
    />
  );
}
