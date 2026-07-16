import statusDotAsset from "../../assets/figma/281-538/status-dot.svg";
import type { SurfaceViewProps } from "../../adapter/types";
import { screenCommand } from "./commands";

type TopLiveStatusProps = Partial<Pick<SurfaceViewProps, "dispatch">>;

export function TopLiveStatus({ dispatch }: TopLiveStatusProps = {}) {
  const content = (
    <>
      <img alt="" aria-hidden="true" src={statusDotAsset} />
      <span>Status：live</span>
    </>
  );

  if (dispatch) {
    return (
      <button
        aria-label="Open live status"
        className="pm-workspace__live-status"
        onClick={() => void dispatch(screenCommand("figma-287-637"))}
        type="button"
      >
        {content}
      </button>
    );
  }

  return (
    <div className="pm-workspace__live-status" role="status">
      {content}
    </div>
  );
}
