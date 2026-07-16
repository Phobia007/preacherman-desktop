import preachermanMark from "../../assets/brand/preacherman-mark.png";

export function WindowChrome() {
  return (
    <div className="pm-workspace__window-chrome" data-tauri-drag-region>
      <img
        alt="Preacherman"
        className="pm-workspace__brand-mark"
        data-tauri-drag-region
        draggable="false"
        src={preachermanMark}
      />
    </div>
  );
}
