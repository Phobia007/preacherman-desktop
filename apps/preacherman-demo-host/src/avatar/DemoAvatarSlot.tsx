import {
  AvatarViewport,
  type AvatarError,
  type AvatarLoadState,
  type AvatarPerformanceSnapshot,
  type AvatarReadyDetail,
} from "@preacherman/avatar-renderer";
import "@preacherman/avatar-renderer/styles.css";
import type { AvatarSlotProps } from "@preacherman/surface-skin";
import { useEffect } from "react";
import { localAvatarAssetBaseUrl } from "./avatarAssets";

export interface DemoAvatarDiagnostics {
  readonly state: AvatarLoadState | "idle";
  readonly drawCalls: number;
  readonly triangles: number;
  readonly error: string | null;
}
declare global {
  interface Window {
    __PREACHERMAN_AVATAR_DIAGNOSTICS__?: DemoAvatarDiagnostics;
  }
}

const EMPTY_DIAGNOSTICS: DemoAvatarDiagnostics = {
  state: "idle",
  drawCalls: 0,
  triangles: 0,
  error: null,
};

function publishDiagnostics(
  patch: Partial<DemoAvatarDiagnostics>,
): DemoAvatarDiagnostics {
  const current = window.__PREACHERMAN_AVATAR_DIAGNOSTICS__
    ?? EMPTY_DIAGNOSTICS;
  const next = { ...current, ...patch };
  window.__PREACHERMAN_AVATAR_DIAGNOSTICS__ = next;
  return next;
}

export function DemoAvatarSlot({
  className,
  onReady,
  onError,
}: AvatarSlotProps) {
  useEffect(() => {
    publishDiagnostics(EMPTY_DIAGNOSTICS);
    publishDiagnostics({ state: "loading" });
  }, []);

  const recordPerformance = (snapshot: AvatarPerformanceSnapshot) => {
    publishDiagnostics(snapshot);
  };

  const handleReady = (detail: AvatarReadyDetail) => {
    publishDiagnostics({
      state: "ready",
      drawCalls: detail.drawCalls,
      triangles: detail.triangles,
      error: null,
    });
    onReady?.();
  };

  const handleError = (error: AvatarError) => {
    publishDiagnostics({ state: "error", error: error.message });
    onError?.(error);
  };

  const handleContextLost = (error: AvatarError) => {
    publishDiagnostics({ state: "context-lost", error: error.message });
  };

  const reducedMotion = window.matchMedia?.(
    "(prefers-reduced-motion: reduce)",
  ).matches ?? false;

  return (
    <AvatarViewport
      assetBaseUrl={localAvatarAssetBaseUrl()}
      className={className}
      onContextLost={handleContextLost}
      onError={handleError}
      onPerformance={recordPerformance}
      onReady={handleReady}
      quality="high"
      reducedMotion={reducedMotion}
    />
  );
}
