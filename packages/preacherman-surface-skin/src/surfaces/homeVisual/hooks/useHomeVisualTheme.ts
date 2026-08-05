import { useEffect, useState } from "react";
import {
  resolveHomeVisualTheme,
  type HomeVisualTheme,
} from "../config/sceneTheme";

function readTheme(): HomeVisualTheme {
  if (typeof document === "undefined") {
    return "light";
  }
  return resolveHomeVisualTheme(document.documentElement.dataset.appearance);
}

export function useHomeVisualTheme(): HomeVisualTheme {
  const [theme, setTheme] = useState(readTheme);

  useEffect(() => {
    const root = document.documentElement;
    const syncTheme = () => {
      setTheme(resolveHomeVisualTheme(root.dataset.appearance));
    };
    const observer = new MutationObserver(syncTheme);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-appearance"],
    });
    syncTheme();
    return () => observer.disconnect();
  }, []);

  return theme;
}
