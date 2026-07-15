import humanAsset from "../../assets/figma/281-538/human.png";
import { OrbitLayer } from "./OrbitLayer";
import { SkillHalo } from "./SkillHalo";

export function StateVessel() {
  return (
    <div className="pm-workspace__state-vessel" aria-hidden="true">
      <OrbitLayer />
      <img alt="" className="pm-workspace__human" src={humanAsset} />
      <SkillHalo kind="memory" left={398} top={387} />
      <SkillHalo kind="skill" left={545} top={563} />
      <SkillHalo kind="skill" left={812} top={284} />
      <SkillHalo kind="skill" left={826} top={487} />
    </div>
  );
}
