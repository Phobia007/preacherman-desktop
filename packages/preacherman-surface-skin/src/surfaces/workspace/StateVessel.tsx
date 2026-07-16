import humanAsset from "../../assets/figma/281-538/human.png";
import type { SurfaceViewProps } from "../../adapter/types";
import { OrbitLayer } from "./OrbitLayer";

type StateVesselProps = Pick<SurfaceViewProps, "dispatch">;

export function StateVessel({ dispatch }: StateVesselProps) {
  return (
    <div className="pm-workspace__state-vessel">
      <OrbitLayer dispatch={dispatch} />
      <div aria-hidden="true" className="pm-workspace__human-stack">
        <svg className="pm-workspace__human-occluder" viewBox="0 0 592 1342">
          <defs>
            <filter colorInterpolationFilters="sRGB" id="pm-workspace-human-occluder-filter">
              <feComponentTransfer in="SourceGraphic">
                <feFuncR intercept="0.9686" slope="0" type="linear" />
                <feFuncG intercept="0.9608" slope="0" type="linear" />
                <feFuncB intercept="0.9451" slope="0" type="linear" />
                <feFuncA slope="16" type="linear" />
              </feComponentTransfer>
            </filter>
          </defs>
          <image
            filter="url(#pm-workspace-human-occluder-filter)"
            height="1342"
            href={humanAsset}
            width="592"
          />
        </svg>
        <img alt="" className="pm-workspace__human" src={humanAsset} />
      </div>
    </div>
  );
}
