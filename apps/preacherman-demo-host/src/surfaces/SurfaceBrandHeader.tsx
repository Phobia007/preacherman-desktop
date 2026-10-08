import { useCallback, useState, type RefObject } from "react";
import { MarketProfile } from "./market/MarketProfile";
import { captureSurfaceContent } from "./captureSurfaceContent";
import "./market/market-surface.css";
import "./surface-brand-header.css";

/** Asset and Extension share Market's reversible spatial signature interaction. */
export function SurfaceBrandHeader({ surfaceRef, onLensActiveChange }: {
  surfaceRef: RefObject<HTMLElement>;
  onLensActiveChange: (active: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const capture = useCallback((signal: AbortSignal) => {
    if (!surfaceRef.current) return Promise.reject(new Error("Surface is not ready."));
    return captureSurfaceContent(surfaceRef.current, signal);
  }, [surfaceRef]);
  return <>
    <header className="demo-surface-header" />
    <MarketProfile open={open} onOpenChange={setOpen} captureSource={capture} onLensActiveChange={onLensActiveChange} />
  </>;
}
