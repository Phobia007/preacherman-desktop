import { OrbitControls, PresentationControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { AvatarModel } from "./AvatarModel";
import { HologramLights } from "./HologramLights";
import { AvatarError, type AvatarPerformanceSnapshot, type AvatarPose } from "./types";
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
}

function CameraRig({
  resetKey,
}: Pick<InteractiveAvatarSceneProps, "resetKey">) {
  const { camera, invalidate } = useThree();
  const controls = useRef<OrbitControlsImpl>(null);

  useEffect(() => {
    camera.position.set(0, 0.86, 3.35);
    camera.near = 0.01;
    camera.far = 100;
    camera.updateProjectionMatrix();
    controls.current?.target.set(0, 0.86, 0);
    controls.current?.update();
    invalidate();
  }, [camera, invalidate, resetKey]);

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
}: InteractiveAvatarSceneProps) {
  return (
    <>
      <HologramLights />
      <PresentationControls
        azimuth={[-Infinity, Infinity]}
        config={{ mass: 1, tension: 220, friction: 30 }}
        cursor
        global
        polar={[-0.12, 0.12]}
        speed={1.7}
      >
        <AvatarModel
          actionId={actionId}
          actionRequestKey={actionRequestKey}
          assetBaseUrl={assetBaseUrl}
          onActionsReady={onActionsReady}
          onAnimationDebug={onAnimationDebug}
          onAnimationError={onAnimationError}
          onFirstFrame={onFirstFrame}
          pose={pose}
        />
      </PresentationControls>
      <CameraRig resetKey={resetKey} />
      <ContextLossListener onContextLost={onContextLost} />
    </>
  );
}
