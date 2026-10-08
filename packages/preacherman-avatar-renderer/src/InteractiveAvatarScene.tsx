import type { AvatarMotionState } from "./avatar/types/avatarAnimation";
import { AvatarFrameMetrics } from "./AvatarFrameMetrics";
import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useRef } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { AvatarModel } from "./AvatarModel";
import { CinematicEnvironment } from "./CinematicEnvironment";
import { CinematicHologramLights, HologramLights } from "./HologramLights";
import { AvatarError, type AvatarCameraFraming, type AvatarModelId, type AvatarPerformanceSnapshot, type AvatarPose, type AvatarSceneEnvironment } from "./types";
import type {
  AvatarActionDescriptor,
  AvatarAnimationDebugSnapshot,
  AvatarAnimationError,
} from "./avatar/types/avatarAnimation";
import type { AvatarMotionRigBinding, AvatarMotionStreamSource } from "./avatar/contracts/AvatarMotionStream";

interface InteractiveAvatarSceneProps {
  readonly companionVisible?: boolean;
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
  readonly motionState?: AvatarMotionState;
  readonly environment: AvatarSceneEnvironment;
  readonly isolateCompanion?: boolean;
  readonly motionSource?: AvatarMotionStreamSource;
  readonly motionRigBinding?: AvatarMotionRigBinding;
  readonly modelId: AvatarModelId;
  readonly cameraFraming: AvatarCameraFraming;
  readonly rotationOffsetY: number;
  readonly appearance: "light" | "dark";
  readonly cameraZoom: number;
}

const FULL_BODY_CAMERA = { x: 0, y: 0.94, z: 4.35 } as const;
const FULL_BODY_TARGET = { x: 0, y: 0.92, z: 0 } as const;
const PORTRAIT_CAMERA = { x: 0, y: 1.29, z: 2.21 } as const;
const PORTRAIT_TARGET = { x: 0, y: 1.29, z: 0 } as const;

function moveToward(current: number, target: number, smoothing: number, delta: number) {
  if (!Number.isFinite(smoothing)) return target;
  return current + (target - current) * (1 - Math.exp(-smoothing * delta));
}

function CameraRig({
  cameraFraming,
  cameraZoom,
  environment,
  resetKey,
}: Pick<InteractiveAvatarSceneProps, "cameraFraming" | "cameraZoom" | "environment" | "resetKey">) {
  const { camera, invalidate } = useThree();
  const controls = useRef<OrbitControlsImpl>(null);
  const reducedMotion = useRef(false);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => {
      reducedMotion.current = preference.matches;
    };
    syncPreference();
    preference.addEventListener("change", syncPreference);
    return () => preference.removeEventListener("change", syncPreference);
  }, []);

  useEffect(() => {
    const portrait = environment === "cinematic" && cameraFraming === "portrait";
    const cameraFrame = portrait ? PORTRAIT_CAMERA : FULL_BODY_CAMERA;
    const controlsTarget = portrait ? PORTRAIT_TARGET : FULL_BODY_TARGET;
    camera.position.set(cameraFrame.x, cameraFrame.y, cameraFrame.z);
    if (environment !== "cinematic") camera.position.set(0, 0.86, 3.35);
    camera.near = 0.01;
    camera.far = 100;
    camera.updateProjectionMatrix();
    controls.current?.target.set(controlsTarget.x, controlsTarget.y, controlsTarget.z);
    if (environment !== "cinematic") controls.current?.target.set(0, 0.86, 0);
    controls.current?.update();
    invalidate();
  }, [camera, environment, invalidate, resetKey]);

  useFrame((_, delta) => {
    if (environment !== "cinematic") return;
    const portrait = cameraFraming === "portrait";
    const amount = portrait ? 1 : Math.max(0, Math.min(1, cameraZoom));
    const cameraFrame = { x: 0, y: FULL_BODY_CAMERA.y + (PORTRAIT_CAMERA.y - FULL_BODY_CAMERA.y) * amount, z: FULL_BODY_CAMERA.z + (PORTRAIT_CAMERA.z - FULL_BODY_CAMERA.z) * amount };
    const controlsTarget = { x: 0, y: FULL_BODY_TARGET.y + (PORTRAIT_TARGET.y - FULL_BODY_TARGET.y) * amount, z: 0 };
    const smoothing = reducedMotion.current ? Number.POSITIVE_INFINITY : portrait ? 6 : 8.5;
    camera.position.set(
      moveToward(camera.position.x, cameraFrame.x, smoothing, delta),
      moveToward(camera.position.y, cameraFrame.y, smoothing, delta),
      moveToward(camera.position.z, cameraFrame.z, smoothing, delta),
    );
    if (controls.current) {
      controls.current.target.set(
        moveToward(controls.current.target.x, controlsTarget.x, smoothing, delta),
        moveToward(controls.current.target.y, controlsTarget.y, smoothing, delta),
        moveToward(controls.current.target.z, controlsTarget.z, smoothing, delta),
      );
      controls.current.update();
    }
  });

  return (
    <OrbitControls
      enableDamping
      enablePan={false}
      enableRotate={false}
      enableZoom={false}
      maxDistance={4.2}
      maxPolarAngle={Math.PI * 0.68}
      minDistance={2.1}
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
  companionVisible = true,
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
  motionState,
  environment,
  isolateCompanion = false,
  motionSource,
  motionRigBinding,
  modelId,
  cameraFraming,
  rotationOffsetY,
  appearance,
  cameraZoom,
}: InteractiveAvatarSceneProps) {
  const { gl, scene, invalidate } = useThree();
  useLayoutEffect(() => {
    // R3F restores the previous attached Color when <color> is removed. Explicitly
    // clear it for the isolated pass; otherwise Three clears the whole frame opaque.
    if (isolateCompanion || appearance === "light") scene.background = null;
    gl.setClearAlpha(environment === "cinematic" && !isolateCompanion && appearance === "dark" ? 1 : 0);
    invalidate();
  }, [environment, gl, scene, invalidate, isolateCompanion, appearance]);
  return (
    <>
      {environment === "cinematic" ? <CinematicEnvironment isolateCompanion={isolateCompanion} appearance={appearance} /> : null}
      {environment === "cinematic" ? <CinematicHologramLights /> : <HologramLights />}
      {companionVisible ? <AvatarModel
        key={`${modelId}:${assetBaseUrl}`}
        actionId={actionId}
        actionRequestKey={actionRequestKey}
        assetBaseUrl={assetBaseUrl}
        onActionsReady={onActionsReady}
        onAnimationDebug={onAnimationDebug}
        onAnimationError={onAnimationError}
        onFirstFrame={onFirstFrame}
        pose={pose}
        jawOpen={jawOpen}
        motionState={motionState}
        motionSource={motionSource}
        motionRigBinding={motionRigBinding}
        modelId={modelId}
        rotationOffsetY={rotationOffsetY}
      /> : null}
      <CameraRig cameraFraming={cameraFraming} cameraZoom={cameraZoom} environment={environment} resetKey={resetKey} />
      <AvatarFrameMetrics />
      <ContextLossListener onContextLost={onContextLost} />
    </>
  );
}
