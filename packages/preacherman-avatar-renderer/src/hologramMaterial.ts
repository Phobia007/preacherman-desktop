import {
  Color,
  DoubleSide,
  FrontSide,
  MeshStandardMaterial,
  Texture,
  Vector2,
} from "three";

type MaterialFamily = "body" | "face" | "hair" | "eyes" | "eyelashes";
type RampStop = readonly [
  position: number,
  red: number,
  green: number,
  blue: number,
];

export const HOLOGRAM_REFERENCE_GRADE = {
  contrastExponent: 1,
  outputGain: 1,
  saturation: 1,
} as const;

export interface HologramProfile {
  readonly sourceMaterial: string;
  readonly family: MaterialFamily;
  readonly scanlineScale: number;
  readonly scanlineBrightness: number;
  readonly scanlineContrast: number;
  readonly diffuseGamma: number;
  readonly controlAlphaAdd: number;
  readonly controlGreenTint: readonly [number, number, number];
  readonly usesControlMap: boolean;
  readonly controlSemanticStatus: "unresolved";
  readonly controlChannels: readonly ("red" | "green" | "blue" | "alpha")[];
  readonly surfaceMode: "blended" | "dithered";
  readonly backfaceCulling: boolean;
  readonly lightingFloor: number;
  readonly lightingExponent: number;
  readonly scanlineFloor: number;
  readonly outputGain: number;
  readonly neckBlendStart: number;
  readonly neckBlendEnd: number;
  readonly ramp: readonly RampStop[];
}
const BODY_RAMP = [
  [0.09999999403953552, 0.006937533151358366, 0.020557476207613945, 0.05968404561281204],
  [0.4818185269832611, 0.11759507656097412, 0.407758891582489, 1],
  [1, 0.7747818231582642, 0.9115685820579529, 1],
] as const;

const BODY_PROFILE: HologramProfile = {
  sourceMaterial: "cortana_body",
  family: "body",
  scanlineScale: 200,
  scanlineBrightness: -0.1,
  scanlineContrast: 0,
  diffuseGamma: 0.5,
  controlAlphaAdd: 0.35,
  controlGreenTint: [0.1065388023853302, 0.17199930548667908, 0.3185468018054962],
  usesControlMap: true,
  controlSemanticStatus: "unresolved",
  controlChannels: ["green", "alpha"],
  surfaceMode: "blended",
  backfaceCulling: true,
  lightingFloor: 0,
  lightingExponent: 1,
  scanlineFloor: 0.38,
  outputGain: 1.35,
  neckBlendStart: 0,
  neckBlendEnd: 0,
  ramp: BODY_RAMP,
};

const PROFILES: Record<string, HologramProfile> = {
  rt_body: BODY_PROFILE,
  rt_face: {
    ...BODY_PROFILE,
    sourceMaterial: "cortana_face",
    family: "face",
  },
  rt_hair: {
    sourceMaterial: "cortana_hair",
    family: "hair",
    scanlineScale: 200,
    scanlineBrightness: -0.125,
    scanlineContrast: 1,
    diffuseGamma: 1,
    controlAlphaAdd: 0,
    controlGreenTint: [0.16826944053173065, 0.47353148460388184, 1],
    usesControlMap: true,
    controlSemanticStatus: "unresolved",
    controlChannels: ["alpha"],
    surfaceMode: "dithered",
    backfaceCulling: false,
    lightingFloor: 0.1,
    lightingExponent: 0.82,
    scanlineFloor: 0.12,
    outputGain: 1,
    neckBlendStart: 0,
    neckBlendEnd: 0,
    ramp: [
      [0, 0.007262125611305237, 0.0056997849605977535, 0.016609154641628265],
      [0.4090913236141205, 0.12661869823932648, 0.07671059668064117, 0.32726380228996277],
      [0.7181820869445801, 0.6244446635246277, 0.6015909314155579, 1],
      [0.8454542756080627, 0.46453872323036194, 0.38725581789016724, 0.6381291151046753],
    ],
  },
  rt_eyes: {
    sourceMaterial: "cortana_eyes",
    family: "eyes",
    scanlineScale: 0,
    scanlineBrightness: 0,
    scanlineContrast: 0,
    diffuseGamma: 0.5,
    controlAlphaAdd: 0,
    controlGreenTint: [0.16826944053173065, 0.47353148460388184, 1],
    usesControlMap: true,
    controlSemanticStatus: "unresolved",
    controlChannels: ["red", "blue"],
    surfaceMode: "blended",
    backfaceCulling: true,
    lightingFloor: 0.16,
    lightingExponent: 1,
    scanlineFloor: 1,
    outputGain: 1,
    neckBlendStart: 0,
    neckBlendEnd: 0,
    ramp: [
      [0, 0.09127940982580185, 0.10935702919960022, 0.16090673208236694],
      [0.3045457601547241, 0.17078818380832672, 0.23740816116333008, 0.43432554602622986],
      [1, 0.91889488697052, 0.967037558555603, 1],
    ],
  },
  rt_eyelashes: {
    sourceMaterial: "Material.004",
    family: "eyelashes",
    scanlineScale: 0,
    scanlineBrightness: 0,
    scanlineContrast: 0,
    diffuseGamma: 1,
    controlAlphaAdd: 0.1,
    controlGreenTint: [0.16826944053173065, 0.47353148460388184, 1],
    usesControlMap: true,
    controlSemanticStatus: "unresolved",
    controlChannels: ["green", "alpha"],
    surfaceMode: "blended",
    backfaceCulling: true,
    lightingFloor: 0,
    lightingExponent: 1,
    scanlineFloor: 1,
    outputGain: 1,
    neckBlendStart: 0,
    neckBlendEnd: 0,
    ramp: [
      [0, 0.011147348210569859, 0.03534596413373947, 0.10795275866985321],
      [0.413636714220047, 0.043432578444480896, 0.11298204958438873, 0.4343254268169403],
      [1, 0.47015008330345154, 0.5545790791511536, 0.6092132925987244],
    ],
  },
};

export function hologramProfileFor(materialName: string): HologramProfile {
  return PROFILES[materialName] ?? BODY_PROFILE;
}

function familyCode(family: MaterialFamily): number {
  return { body: 0, face: 1, hair: 2, eyes: 3, eyelashes: 4 }[family];
}

function rampUniforms(profile: HologramProfile) {
  const stops = [...profile.ramp];
  while (stops.length < 4) stops.push(stops[stops.length - 1]);
  return {
    positions: stops.map((stop) => stop[0]),
    colors: stops.map((stop) => new Color(stop[1], stop[2], stop[3])),
  };
}

export function createHologramMaterial(
  source: MeshStandardMaterial,
  scanlineMap: Texture,
  irisNormalMap?: Texture,
  controlMap?: Texture,
  avatarGain = 1,
): MeshStandardMaterial {
  const profile = hologramProfileFor(source.name);
  const ramp = rampUniforms(profile);
  const material = source.clone();
  material.name = `viewer_hologram:${source.name}`;
  material.metalness = 0;
  material.roughness = 1;
  const isDitheredSurface = profile.surfaceMode === "dithered";
  material.alphaHash = false;
  material.alphaToCoverage = isDitheredSurface;
  material.alphaTest = isDitheredSurface ? 0.05 : 0;
  material.transparent = !isDitheredSurface;
  // Alpha-blended eyelashes sit immediately in front of the eyeballs. Letting
  // them write depth (or drawing their back faces) makes overlapping lash
  // cards occlude one another as the head turns, which shows up as black,
  // string-like rings around the eyes.
  material.depthWrite = profile.family !== "eyelashes";
  material.side = profile.backfaceCulling ? FrontSide : DoubleSide;
  material.toneMapped = true;
  const sourceCorneaNormalMap = source.name === "rt_eyes" ? source.normalMap : null;
  const resolvedIrisNormalConnected = source.name === "rt_eyes" && irisNormalMap !== undefined;
  if (resolvedIrisNormalConnected) material.normalMap = irisNormalMap;
  material.userData = {
    ...source.userData,
    sourceDiagnosticMaterial: source.name,
    sourceBlenderMaterial: profile.sourceMaterial,
    reconstructionMode: "source-node-chain",
    controlSemanticStatus: profile.controlSemanticStatus,
    sourceRoutedControlConnected: controlMap !== undefined,
    sourceRoutedControlChannels: controlMap ? [...profile.controlChannels] : [],
    guessedPbrSemantics: [],
    hologramProfile: profile,
    sourceCorneaNormalMap,
    sourceCorneaNormalConnected: sourceCorneaNormalMap !== null,
    resolvedIrisNormalConnected,
  };
  material.customProgramCacheKey = () =>
    `preacherman-source-node-chain-v22:${source.name}:${avatarGain}`;
  material.onBeforeCompile = (shader, renderer) => {
    shader.uniforms.uHoloScanlineMap = { value: scanlineMap };
    shader.uniforms.uHoloScanlineScale = { value: profile.scanlineScale };
    shader.uniforms.uHoloScanlineBrightness = { value: profile.scanlineBrightness };
    shader.uniforms.uHoloScanlineContrast = { value: profile.scanlineContrast };
    shader.uniforms.uHoloResolution = {
      value: renderer.getDrawingBufferSize(new Vector2()),
    };
    shader.uniforms.uHoloFamily = { value: familyCode(profile.family) };
    shader.uniforms.uHoloIsFace = { value: source.name === "rt_face" ? 1 : 0 };
    shader.uniforms.uHoloDiffuseGamma = { value: profile.diffuseGamma };
    shader.uniforms.uHoloLightingFloor = { value: profile.lightingFloor };
    shader.uniforms.uHoloLightingExponent = { value: profile.lightingExponent };
    shader.uniforms.uHoloScanlineFloor = { value: profile.scanlineFloor };
    shader.uniforms.uHoloOutputGain = { value: profile.outputGain };
    shader.uniforms.uHoloNeckBlendStart = { value: profile.neckBlendStart };
    shader.uniforms.uHoloNeckBlendEnd = { value: profile.neckBlendEnd };
    shader.uniforms.uHoloControlAlphaAdd = { value: profile.controlAlphaAdd };
    shader.uniforms.uHoloControlGreenTint = {
      value: new Color(...profile.controlGreenTint),
    };
    shader.uniforms.uHoloRampPositions = { value: ramp.positions };
    shader.uniforms.uHoloRampColors = { value: ramp.colors };
    shader.uniforms.uHoloRampCount = { value: profile.ramp.length };
    shader.uniforms.uHoloControlMap = { value: controlMap ?? scanlineMap };
    shader.uniforms.uHoloControlEnabled = { value: controlMap ? 1 : 0 };
    shader.uniforms.uHoloCorneaNormalMap = {
      value: sourceCorneaNormalMap ?? scanlineMap,
    };
    shader.uniforms.uHoloCorneaEnabled = { value: sourceCorneaNormalMap ? 1 : 0 };
    shader.uniforms.uHoloReferenceContrastExponent = {
      value: HOLOGRAM_REFERENCE_GRADE.contrastExponent,
    };
    shader.uniforms.uHoloReferenceOutputGain = {
      value: HOLOGRAM_REFERENCE_GRADE.outputGain,
    };
    shader.uniforms.uHoloReferenceSaturation = {
      value: HOLOGRAM_REFERENCE_GRADE.saturation,
    };
    shader.uniforms.uHoloAvatarGain = { value: avatarGain };
    material.userData.hologramShader = shader;
    shader.vertexShader = `
varying float vHoloModelY;
${shader.vertexShader}`.replace(
      "#include <skinning_vertex>",
      `#include <skinning_vertex>
vHoloModelY = transformed.y;`,
    );
    shader.fragmentShader = `
uniform sampler2D uHoloScanlineMap;
uniform float uHoloScanlineScale;
uniform float uHoloScanlineBrightness;
uniform float uHoloScanlineContrast;
uniform vec2 uHoloResolution;
uniform int uHoloFamily;
uniform float uHoloIsFace;
uniform float uHoloDiffuseGamma;
uniform float uHoloLightingFloor;
uniform float uHoloLightingExponent;
uniform float uHoloScanlineFloor;
uniform float uHoloOutputGain;
uniform float uHoloNeckBlendStart;
uniform float uHoloNeckBlendEnd;
uniform float uHoloControlAlphaAdd;
uniform vec3 uHoloControlGreenTint;
uniform float uHoloRampPositions[4];
uniform vec3 uHoloRampColors[4];
uniform int uHoloRampCount;
uniform sampler2D uHoloControlMap;
uniform float uHoloControlEnabled;
uniform sampler2D uHoloCorneaNormalMap;
uniform float uHoloCorneaEnabled;
uniform float uHoloReferenceContrastExponent;
uniform float uHoloReferenceOutputGain;
uniform float uHoloReferenceSaturation;
uniform float uHoloAvatarGain;
varying float vHoloModelY;

float holoLuma(vec3 value) {
  return dot(value, vec3(0.2126, 0.7152, 0.0722));
}

vec3 holoRamp(float value) {
  float x = clamp(value, 0.0, 1.0);
  if (x <= uHoloRampPositions[0]) return uHoloRampColors[0];
  for (int index = 0; index < 3; index++) {
    if (index >= uHoloRampCount - 1) break;
    float left = uHoloRampPositions[index];
    float right = max(uHoloRampPositions[index + 1], left + 0.00001);
    if (x <= right) {
      float factor = smoothstep(0.0, 1.0, clamp((x - left) / (right - left), 0.0, 1.0));
      return mix(uHoloRampColors[index], uHoloRampColors[index + 1], factor);
    }
  }
  return uHoloRampColors[max(uHoloRampCount - 1, 0)];
}

float holoBrightContrast(float value, float brightness, float contrast) {
  return clamp((value - 0.5) * (contrast + 1.0) + 0.5 + brightness, 0.0, 1.0);
}
${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <opaque_fragment>",
      `
vec4 holoControl = vec4(0.0);
#ifdef USE_MAP
if (uHoloControlEnabled > 0.5) holoControl = texture2D(uHoloControlMap, vMapUv);
#endif

vec3 holoBase = pow(max(diffuseColor.rgb, vec3(0.0)), vec3(uHoloDiffuseGamma));
vec3 holoSafeDiffuse = max(diffuseColor.rgb, vec3(0.035));
vec3 holoLightRatio = outgoingLight / holoSafeDiffuse;
float holoLight = clamp(holoLuma(holoLightRatio), 0.0, 1.0);
float holoProfileLight = max(
  uHoloLightingFloor,
  pow(max(holoLight, 0.00001), uHoloLightingExponent)
);
vec3 holoLightRamp = holoRamp(holoProfileLight);

float holoScan = 1.0;
if (uHoloScanlineScale > 0.5) {
  vec2 holoWindow = gl_FragCoord.xy / max(uHoloResolution, vec2(1.0));
  float holoScanRaw = texture2D(
    uHoloScanlineMap,
    vec2(holoWindow.x, holoWindow.y * uHoloScanlineScale)
  ).r;
  holoScan = holoBrightContrast(holoScanRaw, uHoloScanlineBrightness, uHoloScanlineContrast);
}

vec3 holoColor;
float holoOpacity;
if (uHoloFamily == 0 || uHoloFamily == 1) {
  vec3 composite = holoBase + vec3(holoControl.a * uHoloControlAlphaAdd);
  vec3 ramped = composite * holoLightRamp;
  holoColor = mix(ramped, ramped * uHoloControlGreenTint, clamp(holoControl.g, 0.0, 1.0));
  float sourceTransparency = clamp((holoControl.g - holoLight) * holoLight * holoLight, 0.0, 1.0);
  holoOpacity = clamp(
    (1.0 - sourceTransparency) * (1.0 - holoScan),
    0.0,
    1.0
  );
  holoColor *= holoOpacity;
  if (uHoloIsFace > 0.5) {
    holoColor *= 1.55;
  }
  holoOpacity = 1.0;
} else if (uHoloFamily == 2) {
  holoColor = holoBase * holoLightRamp * mix(uHoloScanlineFloor, 1.0, holoScan);
  holoColor += uHoloControlGreenTint * diffuseColor.a * 0.005;
  holoOpacity = diffuseColor.a;
} else if (uHoloFamily == 3) {
  float controlRed = clamp(holoControl.r, 0.0, 1.0);
  float irisDisk = smoothstep(0.08, 0.82, clamp(holoControl.b, 0.0, 1.0));
  float irisFibers = smoothstep(0.035, 0.68, controlRed);
  float pupilDepth = irisDisk
    * (1.0 - smoothstep(0.018, 0.11, controlRed));
  vec3 eyeBase = holoBase * holoLightRamp * 0.42;
  vec3 irisColor = mix(
    vec3(0.002, 0.012, 0.05),
    vec3(0.025, 0.22, 0.82),
    irisFibers
  );
  vec3 eyeEmission = irisColor * mix(0.28, 0.92, irisFibers);
  vec3 eyeOuterEmission = (1.0 - irisDisk) * uHoloControlGreenTint * 0.025;
  float cornea = 0.0;
  #ifdef USE_MAP
  if (uHoloCorneaEnabled > 0.5) {
    vec3 corneaNormal = texture2D(uHoloCorneaNormalMap, vMapUv).xyz * 2.0 - 1.0;
    float corneaShape = clamp(corneaNormal.z * 0.5 + 0.5, 0.0, 1.0);
    cornea = pow(corneaShape, 18.0) * 0.018 * irisDisk;
  }
  #endif
  holoColor = mix(eyeBase + eyeOuterEmission, eyeEmission, irisDisk);
  holoColor += vec3(cornea);
  holoColor *= 1.0 - pupilDepth * 0.985;
  holoOpacity = 1.0;
} else {
  vec3 composite = holoBase + vec3(holoControl.a * uHoloControlAlphaAdd);
  vec3 ramped = composite * holoLightRamp;
  holoColor = mix(ramped, holoBase * 0.45, clamp(holoControl.g, 0.0, 1.0));
  holoOpacity = diffuseColor.a;
}

holoColor *= 1.189207115 * uHoloAvatarGain;
holoColor = uHoloReferenceOutputGain * pow(
  max(holoColor, vec3(0.0)),
  vec3(uHoloReferenceContrastExponent)
);
float holoReferenceLuma = holoLuma(holoColor);
holoColor = mix(
  vec3(holoReferenceLuma),
  holoColor,
  uHoloReferenceSaturation
);
gl_FragColor = vec4(max(holoColor, vec3(0.0)), clamp(holoOpacity, 0.0, 1.0));
`,
    );
  };
  material.needsUpdate = true;
  return material;
}

export function updateHologramResolution(
  material: MeshStandardMaterial,
  width: number,
  height: number,
): void {
  const shader = material.userData.hologramShader;
  const resolution = shader?.uniforms?.uHoloResolution?.value;
  if (resolution instanceof Vector2) resolution.set(width, height);
}
