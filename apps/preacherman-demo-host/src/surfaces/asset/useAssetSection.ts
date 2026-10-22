import { useEffect, useRef, useState } from "react";

export const assetSections = ["Overview", "Appearance", "Skills", "Settings", "Info Map"] as const;
export type AssetSection = typeof assetSections[number];
export const sectionHasModel = (section: AssetSection) => section === "Overview" || section === "Appearance" || section === "Settings";
export const sectionId = (section: AssetSection) => `asset-${section.toLowerCase().replaceAll(" ", "-")}-tab`;

/** One outgoing pane, then the latest requested pane. Timers also work without CSS animation. */
export function useAssetSection() {
  const [requested, select] = useState<AssetSection>("Overview");
  const [displayed, setDisplayed] = useState<AssetSection>("Overview");
  const [phase, setPhase] = useState<"idle" | "leaving" | "entering">("idle");
  const displayedRef = useRef(displayed);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      displayedRef.current = requested; setDisplayed(requested); setPhase("idle"); return;
    }
    let arrival: ReturnType<typeof setTimeout> | undefined;
    if (requested === displayedRef.current) { setPhase("idle"); return; }
    setPhase("leaving");
    const departure = setTimeout(() => {
      displayedRef.current = requested; setDisplayed(requested); setPhase("entering");
      arrival = setTimeout(() => setPhase("idle"), 560);
    }, sectionHasModel(requested) ? 300 : 520);
    return () => { clearTimeout(departure); clearTimeout(arrival); };
  }, [requested]);
  return { requested, displayed, phase, select };
}
