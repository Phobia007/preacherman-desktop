import { useLayoutEffect } from "react";
import { useThree } from "@react-three/fiber";
import { PMREMGenerator } from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/** A low-intensity reflection source reveals authored PBR detail in the dark stage.
 * It never becomes the visible background and owns no network resources. */
export function StudioReflections({ intensity }: { readonly intensity: number }) {
  const { gl, scene, invalidate } = useThree();
  useLayoutEffect(() => {
    if (intensity <= 0) return;
    const previous = scene.environment;
    const previousIntensity = scene.environmentIntensity;
    const generator = new PMREMGenerator(gl);
    const room = new RoomEnvironment();
    let reflection;
    try {
      reflection = generator.fromScene(room, 0.04);
    } finally {
      room.dispose();
      generator.dispose();
    }
    scene.environment = reflection.texture;
    scene.environmentIntensity = intensity;
    invalidate();
    return () => {
      scene.environment = previous;
      scene.environmentIntensity = previousIntensity;
      reflection.dispose();
      invalidate();
    };
  }, [gl, scene, intensity, invalidate]);
  return null;
}
