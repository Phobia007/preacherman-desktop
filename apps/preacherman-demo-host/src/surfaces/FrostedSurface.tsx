import { SurfaceBrandHeader } from "./SurfaceBrandHeader";
import { AssetCollection } from "./asset/AssetCollection";
import { ExtensionMarketplace } from "./extension/ExtensionMarketplace";
import { useLayoutEffect, useRef, useState } from "react";
import { registerSurfaceMotion } from "../app-shell/surfaceMotion";

/** Both destinations retain the same continuous glass over the Home scene. */
export function FrostedSurface({ name }: { readonly name: "Asset" | "Extension" }) {
  const surfaceRef = useRef<HTMLElement>(null);
  const [lensActive, setLensActive] = useState(false);
  useLayoutEffect(() => {
    if (!surfaceRef.current || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const entrance = surfaceRef.current.animate(
      [{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "translateY(0)" }],
      { duration: 360, easing: "cubic-bezier(.22,.61,.36,1)", fill: "both" },
    );
    const unregister = registerSurfaceMotion(name === "Asset" ? "asset" : "extension", () => {
      entrance.pause();
      entrance.currentTime = Math.min(Number(entrance.currentTime ?? 360), 360);
      return { animations: [entrance] };
    });
    return () => { unregister(); entrance.cancel(); };
  }, [name]);
  return <main ref={surfaceRef} className="demo-frosted-surface" aria-label={name} data-lens-active={lensActive}>
    <SurfaceBrandHeader surfaceRef={surfaceRef} onLensActiveChange={setLensActive} />
    <div className="demo-frosted-surface__content" ref={element => element?.toggleAttribute("inert", lensActive)}>
      {name === "Asset" ? <AssetCollection /> : <ExtensionMarketplace />}
    </div>
  </main>;
}
