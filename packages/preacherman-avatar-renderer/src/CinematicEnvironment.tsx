import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { AdditiveBlending, NormalBlending, Color, DoubleSide } from "three";
import { platformBreath } from "./platformRingMotion";

const ENERGY_VERTEX_SHADER = `
  varying vec2 vPlatformPosition;

  void main() {
    vPlatformPosition = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const ENERGY_FRAGMENT_SHADER = `
  uniform float uBreath;
  uniform float uTime;
  uniform vec3 uColor;
  varying vec2 vPlatformPosition;

  // Pixel-footprint filtering keeps the silver edges continuous at grazing angles.
  float filament(float radius, float center, float width, float footprint) {
    float filteredWidth = sqrt(width * width + footprint * footprint * 0.2);
    float distance = (radius - center) / filteredWidth;
    return exp(-distance * distance) * width / filteredWidth;
  }

  void main() {
    float radius = length(vPlatformPosition);
    float angle = atan(vPlatformPosition.y, vPlatformPosition.x);
    float footprint = max(fwidth(radius), 0.0001);
    float phase = angle - uTime * 0.2617993878;
    // Periodic, broad light falloff has no seam when the highlight crosses zero.
    float head = exp(10.0 * (cos(phase) - 1.0));
    float tail = exp(2.4 * (cos(phase + 0.55) - 1.0));
    float reflection = exp(3.8 * (cos(phase + 3.141592654) - 1.0));
    float flow = 0.55 * head + 0.24 * tail + 0.09 * reflection;
    float breath = 0.62 + 0.38 * uBreath;

    float innerEdge = filament(radius, 0.575, 0.00085, footprint);
    float outerEdge = filament(radius, 0.612, 0.0007, footprint);
    float lightChannel = filament(radius, 0.596, 0.0024, footprint);
    float softShoulder = filament(radius, 0.596, 0.0055, footprint);
    float lightSpill = filament(radius, 0.596, 0.014, footprint);
    float grazingReflection = 0.5 + 0.5 * cos(angle - 0.8);

    float edges = innerEdge * (0.13 + grazingReflection * 0.13 + flow * 0.16)
      + outerEdge * (0.06 + grazingReflection * 0.09 + flow * 0.10);
    float channel = lightChannel * (0.19 + flow * 0.69)
      + softShoulder * (0.022 + flow * 0.075);
    float spill = lightSpill * (0.004 + flow * 0.018);
    float alpha = clamp((edges + channel + spill) * breath * 3.0, 0.0, 0.85);
    gl_FragColor = vec4(uColor, alpha);
  }
`;

function BreathingPlatformLight({ appearance }: { appearance: "light" | "dark" }) {
  const { gl } = useThree();
  const elapsed = useRef(1.4);
  const energyUniforms = useMemo(() => ({
    uBreath: { value: platformBreath(1.4) },
    uTime: { value: 1.4 },
    uColor: { value: new Color(0.92, 0.95, 1.0) },
  }), []);
  useLayoutEffect(() => {
    const value = getComputedStyle(gl.domElement).getPropertyValue("--demo-theme-avatar-ring").trim();
    energyUniforms.uColor.value.set(value || (appearance === "light" ? "#17191c" : "#ebf2ff"));
  }, [appearance, energyUniforms, gl]);
  const reduceMotion = useRef(false);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => { reduceMotion.current = preference.matches; };
    syncPreference();
    preference.addEventListener("change", syncPreference);
    return () => preference.removeEventListener("change", syncPreference);
  }, []);

  useFrame(({ gl }, delta) => {
    if (reduceMotion.current || document.hidden || gl.domElement.closest('[aria-hidden="true"]')) return;
    // Keep the phase on pause/resume instead of jumping to the global scene clock.
    elapsed.current += Math.min(delta, 0.05);
    energyUniforms.uBreath.value = platformBreath(elapsed.current);
    energyUniforms.uTime.value = elapsed.current;
  });

  return (
    <>
      <mesh name="companion-platform-ring" position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.56, 0.63, 384]} />
        <shaderMaterial
          blending={appearance === "light" ? NormalBlending : AdditiveBlending}
          depthWrite={false}
          fragmentShader={ENERGY_FRAGMENT_SHADER}
          side={DoubleSide}
          toneMapped={false}
          transparent
          uniforms={energyUniforms}
          vertexShader={ENERGY_VERTEX_SHADER}
        />
      </mesh>
      <group visible={appearance === "dark"}>
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
export function CinematicEnvironment({ isolateCompanion = false, appearance = "dark" }: {
  readonly isolateCompanion?: boolean;
  readonly appearance?: "light" | "dark";
}) {
  const dark = appearance === "dark";
  return (
    <>
      {!isolateCompanion && dark ? <color attach="background" args={["#010409"]} /> : null}
      {dark ? <fog attach="fog" args={["#010409", 3.8, 9.5]} /> : null}

      <mesh visible={!isolateCompanion && dark} position={[0, -0.025, -0.4]} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[14, 14]} />
        <meshStandardMaterial color="#050b12" metalness={0.22} roughness={0.72} />
      </mesh>

      <mesh visible={!isolateCompanion && dark} position={[0, 2.15, -2.35]} receiveShadow>
        <planeGeometry args={[11, 5.4]} />
        <meshStandardMaterial color="#02070d" metalness={0.08} roughness={0.92} />
      </mesh>

      <BreathingPlatformLight appearance={appearance} />
    </>
  );
}
