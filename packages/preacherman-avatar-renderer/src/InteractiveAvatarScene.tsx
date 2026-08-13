import { OrbitControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { AvatarModel } from "./AvatarModel";
import { CinematicEnvironment } from "./CinematicEnvironment";
import { CinematicHologramLights, HologramLights } from "./HologramLights";
import { AvatarError, type AvatarPerformanceSnapshot, type AvatarPose, type AvatarSceneEnvironment } from "./types";
import type {
  AvatarActionDescriptor,
  AvatarAnimationDebugSnapshot,
  AvatarAnimationError,
} from "./avatar/types/avatarAnimation";

interface InteractiveAvatarSceneProps {
  readonly actionId?: string;
  readonly actionRequestKey?: number;
  readonly assetBaseUrl: string;
  readonly onActionsReady?: (actions: readonly AvatarActionDescriptor[]) => void;
  readonly onAnimationDebug?: (
    snapshot: AvatarAnimationDebugSnapshot,
  ) => void;
  readonly onAnimationError: (error: AvatarAnimationError) => void;
  readonly onContextLost: (error: AvatarError) => void;
  readonly onFirstFrame: (snapshot: AvatarPerformanceSnapshot) => void;
  readonly pose: AvatarPose;
  readonly resetKey: number;
  readonly jawOpen: number;
  readonly environment: AvatarSceneEnvironment;
}

function CameraRig({
  environment,
  resetKey,
}: Pick<InteractiveAvatarSceneProps, "environment" | "resetKey">) {
  const { camera, invalidate } = useThree();
  const controls = useRef<OrbitControlsImpl>(null);

  useEffect(() => {
    camera.position.set(0, 0.86, 3.35);
    if (environment === "cinematic") camera.position.set(0, 0.94, 4.35);
    camera.near = 0.01;
    camera.far = 100;
    camera.updateProjectionMatrix();
    controls.current?.target.set(0, 0.86, 0);
    if (environment === "cinematic") controls.current?.target.set(0, 0.92, 0);
    controls.current?.update();
    invalidate();
  }, [camera, environment, invalidate, resetKey]);

  return (
    <OrbitControls
      enableDamping
      enablePan={false}
      enableRotate={false}
      enableZoom={false}
      maxDistance={4.2}
      maxPolarAngle={Math.PI * 0.68}
      minDistance={2.75}
      minPolarAngle={Math.PI * 0.32}
      ref={controls}
      zoomSpeed={0.5}
    />
  );
}

function ContextLossListener({
  onContextLost,
}: Pick<InteractiveAvatarSceneProps, "onContextLost">) {
  const { gl } = useThree();

  useEffect(() => {
    const canvas = gl.domElement;
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      onContextLost(
        new AvatarError("CONTEXT_LOST", "The avatar WebGL context was lost."),
      );
    };
    canvas.addEventListener("webglcontextlost", handleContextLost);
    return () => canvas.removeEventListener("webglcontextlost", handleContextLost);
  }, [gl, onContextLost]);

  return null;
}

export function InteractiveAvatarScene({
  actionId,
  actionRequestKey,
  assetBaseUrl,
  onActionsReady,
  onAnimationDebug,
  onAnimationError,
  onContextLost,
  onFirstFrame,
  pose,
  resetKey,
  jawOpen,
  environment,
}: InteractiveAvatarSceneProps) {
  return (
    <>
      {environment === "cinematic" ? <CinematicEnvironment /> : null}
      {environment === "cinematic" ? <CinematicHologramLights /> : <HologramLights />}
      <AvatarModel
        actionId={actionId}
        actionRequestKey={actionRequestKey}
        assetBaseUrl={assetBaseUrl}
        onActionsReady={onActionsReady}
        onAnimationDebug={onAnimationDebug}
        onAnimationError={onAnimationError}
        onFirstFrame={onFirstFrame}
        pose={pose}
        jawOpen={jawOpen}
      />
      <CameraRig environment={environment} resetKey={resetKey} />
      <ContextLossListener onContextLost={onContextLost} />
    </>
  );
}
