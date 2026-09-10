import { useThree } from "@react-three/fiber";
import { useLayoutEffect } from "react";
import { PMREMGenerator } from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/** Neutral, locally generated studio reflections for the original colored materials. */
export function AuthoredAvatarLights() {
  const { gl, scene, invalidate } = useThree();
  useLayoutEffect(() => {
    const previous = scene.environment;
    const room = new RoomEnvironment();
    const generator = new PMREMGenerator(gl);
    const environment = generator.fromScene(room, 0.04);
    room.dispose();
    generator.dispose();
    scene.environment = environment.texture;
    invalidate();
    return () => {
      scene.environment = previous;
      environment.dispose();
    };
  }, [gl, scene, invalidate]);
  return <>
    <ambientLight intensity={0.35} />
    <directionalLight color="#ffffff" intensity={2} position={[2, 3, 4]} />
    <directionalLight color="#ffffff" intensity={0.6} position={[-2, 1, 2]} />
  </>;
}
