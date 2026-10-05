import { SurfaceBrandHeader } from "./SurfaceBrandHeader";
import { AssetCollection } from "./asset/AssetCollection";

/** Both destinations retain the same continuous glass over the Home scene. */
export function FrostedSurface({ name }: { readonly name: "Asset" | "Extension" }) {
  return <main className="demo-frosted-surface" aria-label={name}>
    <SurfaceBrandHeader />
    {name === "Asset" ? <AssetCollection /> : null}
  </main>;
}
