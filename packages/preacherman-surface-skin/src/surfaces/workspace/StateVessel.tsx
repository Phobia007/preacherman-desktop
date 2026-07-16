import humanAsset from "../../assets/figma/281-538/human.png";
import type { SurfaceViewProps } from "../../adapter/types";
import { OrbitLayer } from "./OrbitLayer";

type StateVesselProps = Pick<SurfaceViewProps, "dispatch">;

export function StateVessel({ dispatch }: StateVesselProps) {
  return (
    <div className="pm-workspace__state-vessel">
      <OrbitLayer dispatch={dispatch} />
      <img alt="" aria-hidden="true" className="pm-workspace__human" src={humanAsset} />
    </div>
  );
}
