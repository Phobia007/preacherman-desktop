import { AdditiveBlending, DoubleSide } from "three";

/**
 * A real, deliberately under-lit 3D room for the persistent companion stage.
 * The geometry stays restrained so Cortana remains the only visual subject.
 */
export function CinematicEnvironment() {
  return (
    <>
      <color attach="background" args={["#010409"]} />
      <fog attach="fog" args={["#010409", 3.8, 9.5]} />

      <mesh position={[0, -0.025, -0.4]} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[14, 14]} />
        <meshStandardMaterial color="#050b12" metalness={0.22} roughness={0.72} />
      </mesh>

      <mesh position={[0, 2.15, -2.35]} receiveShadow>
        <planeGeometry args={[11, 5.4]} />
        <meshStandardMaterial color="#02070d" metalness={0.08} roughness={0.92} />
      </mesh>

      <mesh position={[-2.25, 1.45, -1.15]} rotation={[0, 0.12, 0]}>
        <boxGeometry args={[0.08, 3.3, 1.35]} />
        <meshStandardMaterial color="#07111b" metalness={0.58} roughness={0.34} />
      </mesh>
      <mesh position={[2.25, 1.45, -1.15]} rotation={[0, -0.12, 0]}>
        <boxGeometry args={[0.08, 3.3, 1.35]} />
        <meshStandardMaterial color="#07111b" metalness={0.58} roughness={0.34} />
      </mesh>

      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.58, 0.61, 96]} />
        <meshBasicMaterial
          blending={AdditiveBlending}
          color="#4bb8e8"
          depthWrite={false}
          opacity={0.09}
          side={DoubleSide}
          transparent
        />
      </mesh>

      <mesh position={[-2.2, 1.45, -1.08]}>
        <planeGeometry args={[0.018, 2.5]} />
        <meshBasicMaterial
          blending={AdditiveBlending}
          color="#8ed7ff"
          depthWrite={false}
          opacity={0.22}
          side={DoubleSide}
          transparent
        />
      </mesh>
      <mesh position={[2.2, 1.45, -1.08]}>
        <planeGeometry args={[0.018, 2.5]} />
        <meshBasicMaterial
          blending={AdditiveBlending}
          color="#176fda"
          depthWrite={false}
          opacity={0.16}
          side={DoubleSide}
          transparent
        />
      </mesh>
    </>
  );
}
