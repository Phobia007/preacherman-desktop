import { SurfaceBrandHeader } from "./SurfaceBrandHeader";
import { AssetCollection } from "./asset/AssetCollection";
import { ExtensionMarketplace } from "./extension/ExtensionMarketplace";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { Appearance } from "../preferences";
import { registerSurfaceMotion } from "../app-shell/surfaceMotion";
import { AccountGate } from "./account/AccountGate";

/** Both destinations retain the same continuous glass over the Home scene. */
export function FrostedSurface({ name, appearance, renderActive, onAssetDetailChange, accountRequired = false, onSignIn }: {
  readonly name: "Asset" | "Extension"; readonly appearance: Appearance; readonly renderActive: boolean;
  readonly onAssetDetailChange: (open: boolean) => void; readonly accountRequired?: boolean; readonly onSignIn: () => void;
}) {
  const surfaceRef = useRef<HTMLElement>(null);
  const [lensActive, setLensActive] = useState(false);
  const [assetDetailOpen, setAssetDetailOpen] = useState(false);
  const detailChanged = useCallback((open: boolean) => {
    setAssetDetailOpen(open);
    onAssetDetailChange(open);
  }, [onAssetDetailChange]);
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
  return <main ref={surfaceRef} className="demo-frosted-surface" aria-label={name} data-lens-active={lensActive} data-asset-detail={assetDetailOpen}>
    <SurfaceBrandHeader surfaceRef={surfaceRef} onLensActiveChange={setLensActive} />
    <div className="demo-frosted-surface__content" ref={element => element?.toggleAttribute("inert", lensActive)}>
      {accountRequired ? <AccountGate embedded onSignIn={onSignIn} /> : name === "Asset" ? <AssetCollection appearance={appearance} renderActive={renderActive && !lensActive} onDetailChange={detailChanged} /> : <ExtensionMarketplace />}
    </div>
  </main>;
}
