import type { MouseEvent } from "react";
import type { SurfaceHostBridge } from "@preacherman/surface-skin";

interface WindowResizeHandlesProps {
  readonly dispatch: SurfaceHostBridge["execute"];
}

const resizeHandles = [
  { direction: "North", position: "north" },
  { direction: "NorthEast", position: "north-east" },
  { direction: "East", position: "east" },
  { direction: "SouthEast", position: "south-east" },
  { direction: "South", position: "south" },
  { direction: "SouthWest", position: "south-west" },
  { direction: "West", position: "west" },
  { direction: "NorthWest", position: "north-west" },
] as const;

export function WindowResizeHandles({ dispatch }: WindowResizeHandlesProps) {
  const startResize = (event: MouseEvent<HTMLDivElement>, direction: string) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    void dispatch({
      type: "demo.window.start-resize-dragging",
      payload: { direction },
    });
  };

  return (
    <div aria-hidden="true" className="demo-window-resize-handles">
      {resizeHandles.map((handle) => (
        <div
          className={`demo-window-resize-handle demo-window-resize-handle--${handle.position}`}
          key={handle.direction}
          onMouseDown={(event) => startResize(event, handle.direction)}
        />
      ))}
    </div>
  );
}
