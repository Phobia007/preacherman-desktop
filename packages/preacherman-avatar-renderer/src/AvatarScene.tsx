import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { AvatarError, type AvatarPerformanceSnapshot } from "./types";
import { AvatarModel } from "./AvatarModel";
import { HologramLights } from "./HologramLights";
import type {
  AvatarAnimationDebugSnapshot,
  AvatarAnimationError,
} from "./avatar/types/avatarAnimation";

interface AvatarSceneProps {
  readonly assetBaseUrl: string;
  readonly onAnimationDebug?: (
    snapshot: AvatarAnimationDebugSnapshot,
  ) => void;
  readonly onAnimationError: (error: AvatarAnimationError) => void;
  readonly onContextLost: (error: AvatarError) => void;
  readonly onFirstFrame: (snapshot: AvatarPerformanceSnapshot) => void;
}

function FixedCamera() {
  const { camera, invalidate } = useThree();

  useEffect(() => {
    camera.position.set(0, 0.85, 3.4);
    camera.near = 0.01;
    camera.far = 100;
    camera.lookAt(0, 0.85, 0);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, invalidate]);

  return null;
}

function ContextLossListener({
  onContextLost,
}: Pick<AvatarSceneProps, "onContextLost">) {
  const { gl } = useThree();

  useEffect(() => {
    const canvas = gl.domElement;
    const handleContextLost = () => {
      onContextLost(
        new AvatarError(
          "CONTEXT_LOST",
          "The avatar WebGL context was lost.",
        ),
      );
    };
    canvas.addEventListener("webglcontextlost", handleContextLost);
    return () => {
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      gl.renderLists.dispose();
    };
  }, [gl, onContextLost]);

  return null;
}

export function AvatarScene({
  assetBaseUrl,
  onAnimationDebug,
  onAnimationError,
  onContextLost,
  onFirstFrame,
}: AvatarSceneProps) {
  return (
    <>
      <HologramLights />
      <AvatarModel
        assetBaseUrl={assetBaseUrl}
        modelId="cortana"
        onAnimationDebug={onAnimationDebug}
        onAnimationError={onAnimationError}
        onFirstFrame={onFirstFrame}
      />
      <FixedCamera />
      <ContextLossListener onContextLost={onContextLost} />
    </>
  );
}
