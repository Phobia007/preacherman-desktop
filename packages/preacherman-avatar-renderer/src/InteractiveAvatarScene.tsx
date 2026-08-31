import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
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
  readonly awakened: boolean;
  readonly motionSource?: AvatarMotionStreamSource;
  readonly motionRigBinding?: AvatarMotionRigBinding;
  readonly modelId: AvatarModelId;
  readonly cameraFraming: AvatarCameraFraming;
  readonly rotationOffsetY: number;
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
  environment,
  resetKey,
}: Pick<InteractiveAvatarSceneProps, "cameraFraming" | "environment" | "resetKey">) {
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
    const cameraFrame = portrait ? PORTRAIT_CAMERA : FULL_BODY_CAMERA;
    const controlsTarget = portrait ? PORTRAIT_TARGET : FULL_BODY_TARGET;
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
  awakened,
  motionSource,
  motionRigBinding,
  modelId,
  cameraFraming,
  rotationOffsetY,
}: InteractiveAvatarSceneProps) {
  return (
    <>
      {environment === "cinematic" ? <CinematicEnvironment awakened={awakened} /> : null}
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
        motionSource={motionSource}
        motionRigBinding={motionRigBinding}
        modelId={modelId}
        rotationOffsetY={rotationOffsetY}
      />
      <CameraRig cameraFraming={cameraFraming} environment={environment} resetKey={resetKey} />
      <ContextLossListener onContextLost={onContextLost} />
    </>
  );
}
