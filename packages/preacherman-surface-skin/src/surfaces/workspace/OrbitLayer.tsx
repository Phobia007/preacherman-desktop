import orbitSecondaryAsset from "../../assets/figma/281-538/orbit-secondary.svg";
import orbitSlowAsset from "../../assets/figma/281-538/orbit-slow.svg";

export function OrbitLayer() {
  return (
    <div className="pm-workspace__orbits" aria-hidden="true">
      <img alt="" className="pm-workspace__orbit pm-workspace__orbit--slow" src={orbitSlowAsset} />
      <img alt="" className="pm-workspace__orbit pm-workspace__orbit--secondary" src={orbitSecondaryAsset} />
    </div>
  );
}
