import { useLayoutEffect, useRef } from "react";
import {
  NoToneMapping,
  RectAreaLight,
  SRGBColorSpace,
  type WebGLRenderer,
} from "three";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";

RectAreaLightUniformsLib.init();

export const HOLOGRAM_TONE_MAPPING_EXPOSURE = 1;

export function configureHologramRenderer(renderer: WebGLRenderer): void {
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  renderer.toneMappingExposure = HOLOGRAM_TONE_MAPPING_EXPOSURE;
}

export const HOLOGRAM_LIGHTS = {
  ambient: 0,
  areaRight: {
    position: [-0.606, 1.385, 0.523],
    target: [0.119, 1.397, -0.166],
    intensity: 9.2,
    width: 0.375,
    height: 0.375,
  },
  areaBackLeft: {
    position: [0.332, 1.461, -0.419],
    target: [-0.488, 1.443, 0.153],
    intensity: 4.92,
    width: 0.385,
    height: 0.385,
  },
  areaFront: {
    position: [-0.072, 1.388, 0.651],
    target: [-0.061, 1.414, -0.349],
    intensity: 2.98,
    width: 0.385,
    height: 0.385,
  },
  areaUnder: {
    position: [0.008, -0.18, -0.023],
    target: [0.008, 0.82, -0.005],
    intensity: 0.84,
    width: 2.931,
    height: 2.931,
  },
} as const;

type SourceAreaDefinition =
  | typeof HOLOGRAM_LIGHTS.areaRight
  | typeof HOLOGRAM_LIGHTS.areaBackLeft
  | typeof HOLOGRAM_LIGHTS.areaFront
  | typeof HOLOGRAM_LIGHTS.areaUnder;

interface SourceAreaLightProps {
  readonly definition: SourceAreaDefinition;
  readonly name: string;
}

function SourceAreaLight({ definition, name }: SourceAreaLightProps) {
  const light = useRef<RectAreaLight>(null);

  useLayoutEffect(() => {
    light.current?.lookAt(
      definition.target[0],
      definition.target[1],
      definition.target[2],
    );
  }, [definition]);

  return (
    <rectAreaLight
      ref={light}
      name={name}
      position={definition.position}
      intensity={definition.intensity}
      width={definition.width}
      height={definition.height}
    />
  );
}

export function HologramLights() {
  return (
    <>
      <ambientLight intensity={HOLOGRAM_LIGHTS.ambient} />
      <SourceAreaLight
        name="Area"
        definition={HOLOGRAM_LIGHTS.areaRight}
      />
      <SourceAreaLight
        name="Area.001"
        definition={HOLOGRAM_LIGHTS.areaBackLeft}
      />
      <SourceAreaLight
        name="Area.002"
        definition={HOLOGRAM_LIGHTS.areaFront}
      />
      <SourceAreaLight
        name="Area.003"
        definition={HOLOGRAM_LIGHTS.areaUnder}
      />
    </>
  );
}
