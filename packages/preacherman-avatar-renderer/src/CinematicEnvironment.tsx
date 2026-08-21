import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import {
  AdditiveBlending,
  DoubleSide,
  MathUtils,
  type MeshBasicMaterial,
  type ShaderMaterial,
} from "three";

const BREATH_CYCLE_SECONDS = 5.6;
const ENERGY_VERTEX_SHADER = `
  varying vec2 vEnergyUv;

  void main() {
    vEnergyUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const ENERGY_FRAGMENT_SHADER = `
  uniform float uActivation;
  uniform float uBreath;
  uniform float uTime;
  varying vec2 vEnergyUv;

  void main() {
    vec2 centered = vEnergyUv - 0.5;
    float radial = length(centered) * 2.0;
    float phase = fract(atan(centered.y, centered.x) / 6.28318530718 + 0.5);
    float sweepCenter = fract(uTime * 0.035);
    float sweepDistance = abs(phase - sweepCenter);
    sweepDistance = min(sweepDistance, 1.0 - sweepDistance);
    float sweep = pow(max(0.0, 1.0 - sweepDistance / 0.075), 4.0);
    float counterDistance = abs(phase - fract(sweepCenter + 0.5));
    counterDistance = min(counterDistance, 1.0 - counterDistance);
    float counterSweep = pow(max(0.0, 1.0 - counterDistance / 0.045), 6.0);
    float precisionSegments = smoothstep(-0.42, 0.72, sin(phase * 201.06192983));
    float animatedGrain = 0.96 + 0.04 * sin(phase * 565.48667765 - uTime * 0.42);
    float fineGrain = mix(animatedGrain, 1.0, uActivation);
    float bandProfile = smoothstep(0.968, 0.978, radial)
      * (1.0 - smoothstep(0.994, 1.0, radial));
    float restingEnergy = 0.06 + uBreath * 0.31;
    float steadyEnergy = mix(restingEnergy, 0.95, uActivation);
    float movingEnergy = (1.0 - uActivation) * (0.48 * sweep + 0.10 * counterSweep);
    float calibratedTrack = mix(0.58, 1.0, precisionSegments);
    float alpha = clamp(
      (steadyEnergy * calibratedTrack + movingEnergy) * fineGrain * bandProfile,
      0.0,
      0.92
    );
    gl_FragColor = vec4(vec3(1.0), alpha);
  }
`;

function BreathingPlatformLight({ awakened }: { readonly awakened: boolean }) {
  const haloMaterial = useRef<MeshBasicMaterial>(null);
  const bodyMaterial = useRef<MeshBasicMaterial>(null);
  const seamMaterial = useRef<MeshBasicMaterial>(null);
  const energyMaterial = useRef<ShaderMaterial>(null);
  const activationProgress = useRef(awakened ? 1 : 0);
  const energyUniforms = useMemo(() => ({
    uActivation: { value: awakened ? 1 : 0 },
    uBreath: { value: 0.42 },
    uTime: { value: 0 },
  }), []);
  const reduceMotion = useRef(
    typeof window !== "undefined"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useFrame(({ clock, gl }, delta) => {
    if (document.hidden || gl.domElement.closest('[aria-hidden="true"]')) return;

    const target = awakened ? 1 : 0;
    activationProgress.current = reduceMotion.current
      ? target
      : MathUtils.damp(activationProgress.current, target, 8, delta);

    const wave = 0.5 - 0.5 * Math.cos(
      (clock.getElapsedTime() * Math.PI * 2) / BREATH_CYCLE_SECONDS,
    );
    const breath = reduceMotion.current ? 0.42 : wave * wave * (3 - 2 * wave);
    const progress = activationProgress.current;

    if (haloMaterial.current) {
      haloMaterial.current.opacity = MathUtils.lerp(0.004 + breath * 0.055, 0.2, progress);
    }
    if (bodyMaterial.current) {
      bodyMaterial.current.opacity = MathUtils.lerp(0.012 + breath * 0.115, 0.42, progress);
    }
    if (seamMaterial.current) {
      seamMaterial.current.opacity = MathUtils.lerp(0.07 + breath * 0.25, 0.94, progress);
    }
    if (energyMaterial.current) {
      energyMaterial.current.uniforms.uActivation.value = progress;
      energyMaterial.current.uniforms.uBreath.value = breath;
      energyMaterial.current.uniforms.uTime.value = reduceMotion.current
        ? 0
        : clock.getElapsedTime();
    }
  });

  return (
    <>
      <mesh position={[0, 0.011, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.565, 0.625, 128]} />
        <meshBasicMaterial
          blending={AdditiveBlending}
          color="#ffffff"
          depthWrite={false}
          opacity={0.04}
          ref={haloMaterial}
          side={DoubleSide}
          toneMapped={false}
          transparent
        />
      </mesh>
      <mesh position={[0, 0.013, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.578, 0.614, 192]} />
        <meshBasicMaterial
          blending={AdditiveBlending}
          color="#ffffff"
          depthWrite={false}
          opacity={0.1}
          ref={bodyMaterial}
          side={DoubleSide}
          toneMapped={false}
          transparent
        />
      </mesh>
      <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.587, 0.605, 192]} />
        <shaderMaterial
          blending={AdditiveBlending}
          depthWrite={false}
          fragmentShader={ENERGY_FRAGMENT_SHADER}
          ref={energyMaterial}
          side={DoubleSide}
          toneMapped={false}
          transparent
          uniforms={energyUniforms}
          vertexShader={ENERGY_VERTEX_SHADER}
        />
      </mesh>
      <mesh position={[0, 0.016, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.572, 0.576, 192]} />
        <meshBasicMaterial
          blending={AdditiveBlending}
          color="#ffffff"
          depthWrite={false}
          opacity={0.22}
          ref={seamMaterial}
          side={DoubleSide}
          toneMapped={false}
          transparent
        />
      </mesh>
      <group>
        <mesh position={[0, -0.035, 0]} receiveShadow>
          <cylinderGeometry args={[0.555, 0.555, 0.08, 128, 1, true]} />
          <meshStandardMaterial
            color="#000000"
            emissive="#000000"
            emissiveIntensity={0}
            metalness={0.88}
            roughness={0.24}
            side={DoubleSide}
          />
        </mesh>
        <mesh position={[0, 0.006, 0]} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.555, 128]} />
          <meshBasicMaterial color="#000000" side={DoubleSide} toneMapped={false} />
        </mesh>
      </group>
    </>
  );
}

/**
 * A real, deliberately under-lit 3D room for the persistent companion stage.
 * The geometry stays restrained so Cortana remains the only visual subject.
 */
export function CinematicEnvironment({ awakened = false }: { readonly awakened?: boolean }) {
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

      <BreathingPlatformLight awakened={awakened} />
    </>
  );
}
