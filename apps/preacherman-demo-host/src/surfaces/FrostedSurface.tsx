import { SurfaceBrandHeader } from "./SurfaceBrandHeader";
import { AssetCollection } from "./asset/AssetCollection";
import { ExtensionMarketplace } from "./extension/ExtensionMarketplace";
import { useRef, useState } from "react";

/** Both destinations retain the same continuous glass over the Home scene. */
export function FrostedSurface({ name }: { readonly name: "Asset" | "Extension" }) {
  const surfaceRef = useRef<HTMLElement>(null);
  const [lensActive, setLensActive] = useState(false);
  return <main ref={surfaceRef} className="demo-frosted-surface" aria-label={name} data-lens-active={lensActive}>
    <SurfaceBrandHeader surfaceRef={surfaceRef} onLensActiveChange={setLensActive} />
    <div className="demo-frosted-surface__content" ref={element => element?.toggleAttribute("inert", lensActive)}>
      {name === "Asset" ? <AssetCollection /> : <ExtensionMarketplace />}
    </div>
  </main>;
}
