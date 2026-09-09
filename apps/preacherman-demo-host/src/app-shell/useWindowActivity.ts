import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";

/** WebView2 can keep document.hidden false while its native window is minimized. */
export function useWindowActivity(): boolean {
  const [active, setActive] = useState(() => !document.hidden);
  useEffect(() => {
    let disposed = false, revision = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unlisten: Array<() => void> = [];
    const nativeWindow = isTauri() ? getCurrentWindow() : null;
    const sync = async () => {
      const request = ++revision;
      try {
        const minimized = nativeWindow ? await nativeWindow.isMinimized() : false;
        if (!disposed && revision === request) setActive(!document.hidden && !minimized);
      } catch (error) {
        if (!disposed) console.error("[preacherman.window-activity]", error);
      }
    };
    const schedule = () => {
      clearTimeout(timer);
      // Native focus can arrive just before Windows updates its minimized flag.
      timer = setTimeout(() => { void sync(); }, 100);
    };
    document.addEventListener("visibilitychange", schedule);
    if (nativeWindow) {
      for (const subscription of [nativeWindow.onResized(schedule), nativeWindow.onFocusChanged(schedule)]) {
        void subscription.then(stop => { disposed ? stop() : unlisten.push(stop); })
          .catch(error => { if (!disposed) console.error("[preacherman.window-activity]", error); });
      }
    }
    void sync();
    return () => {
      disposed = true;
      revision++;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", schedule);
      unlisten.forEach(stop => stop());
    };
  }, []);
  return active;
}
