import statusDotAsset from "../../assets/figma/281-538/status-dot.svg";

export function TopLiveStatus() {
  return (
    <div className="pm-workspace__live-status" role="status">
      <img alt="" aria-hidden="true" src={statusDotAsset} />
      <span>Status：live</span>
    </div>
  );
}
