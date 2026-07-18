import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { AvatarError, type AvatarPerformanceSnapshot } from "./types";
import { AvatarModel } from "./AvatarModel";

interface AvatarSceneProps {
  readonly assetBaseUrl: string;
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
  onContextLost,
  onFirstFrame,
}: AvatarSceneProps) {
  return (
    <>
      <ambientLight intensity={0} />
      <directionalLight name="Key" position={[-4, 0.55, 1.2]} intensity={3.2} />
      <directionalLight name="Fill" position={[3, 0.5, 2.5]} intensity={0.02} />
      <directionalLight name="Rim" position={[1, 2, -4]} intensity={0.03} />
      <directionalLight name="Under" position={[0, -3, 0]} intensity={0.05} />
      <AvatarModel assetBaseUrl={assetBaseUrl} onFirstFrame={onFirstFrame} />
      <FixedCamera />
      <ContextLossListener onContextLost={onContextLost} />
    </>
  );
}
