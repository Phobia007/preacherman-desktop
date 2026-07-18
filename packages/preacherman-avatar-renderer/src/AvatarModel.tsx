import { addAfterEffect, useThree } from "@react-three/fiber";
import { useGLTF, useTexture } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import {
  LinearFilter,
  LinearMipmapLinearFilter,
  Material,
  Mesh,
  MeshStandardMaterial,
  NoColorSpace,
  Object3D,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  Vector2,
} from "three";
import {
  createHologramMaterial,
  updateHologramResolution,
} from "./hologramMaterial";
import { disposeAvatarSceneResources } from "./resourceLifecycle";
import type { AvatarPerformanceSnapshot } from "./types";

const MODEL_FILE = "cortana-runtime-v0.glb";
const SHADER_FILES = [
  "storm_cortana_scanlines_diff.png",
  "storm_cortana_default_eye_iris_normal.png",
  "storm_cortana_default_body_control.png",
  "storm_cortana_default_head_control.png",
  "storm_cortana_default_hair_control.png",
  "storm_cortana_default_eye_control.png",
] as const;

interface AvatarAssetUrls {
  readonly model: string;
  readonly textures: readonly [
    scanline: string,
    irisNormal: string,
    bodyControl: string,
    faceControl: string,
    hairControl: string,
    eyeControl: string,
  ];
}

interface AvatarModelProps {
  readonly assetBaseUrl: string;
  readonly onFirstFrame: (snapshot: AvatarPerformanceSnapshot) => void;
}

interface MaterialBindings {
  readonly originals: Map<Mesh, Material | Material[]>;
  readonly holograms: Map<Mesh, Material | Material[]>;
  readonly clonedMaterials: Set<MeshStandardMaterial>;
}

function withTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

export function createAvatarAssetUrls(assetBaseUrl: string): AvatarAssetUrls {
  const base = withTrailingSlash(assetBaseUrl);
  const shaderUrl = (file: (typeof SHADER_FILES)[number]) =>
    `${base}shader/${file}`;
  return {
    model: `${base}${MODEL_FILE}`,
    textures: [
      shaderUrl(SHADER_FILES[0]),
      shaderUrl(SHADER_FILES[1]),
      shaderUrl(SHADER_FILES[2]),
      shaderUrl(SHADER_FILES[3]),
      shaderUrl(SHADER_FILES[4]),
      shaderUrl(SHADER_FILES[5]),
    ],
  };
}

function buildMaterialBindings(
  root: Object3D,
  scanlineMap: Texture,
  irisNormalMap: Texture,
  controlMaps: Readonly<Record<string, Texture>>,
): MaterialBindings {
  const originals = new Map<Mesh, Material | Material[]>();
  const holograms = new Map<Mesh, Material | Material[]>();
  const clonedMaterials = new Set<MeshStandardMaterial>();
  const cloneBySource = new Map<MeshStandardMaterial, MeshStandardMaterial>();

  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const original = object.material;
    originals.set(object, original);
    const sourceMaterials = Array.isArray(original) ? original : [original];
    const nextMaterials = sourceMaterials.map((material) => {
      if (!(material instanceof MeshStandardMaterial)) return material;
      let clone = cloneBySource.get(material);
      if (!clone) {
        clone = createHologramMaterial(
          material,
          scanlineMap,
          irisNormalMap,
          controlMaps[material.name],
        );
        cloneBySource.set(material, clone);
        clonedMaterials.add(clone);
      }
      return clone;
    });
    holograms.set(object, Array.isArray(original) ? nextMaterials : nextMaterials[0]);
  });

  return { originals, holograms, clonedMaterials };
}

export function AvatarModel({
  assetBaseUrl,
  onFirstFrame,
}: AvatarModelProps) {
  const urls = useMemo(() => createAvatarAssetUrls(assetBaseUrl), [assetBaseUrl]);
  const gltf = useGLTF(urls.model);
  const [
    scanlineMap,
    irisNormalMap,
    bodyControlMap,
    faceControlMap,
    hairControlMap,
    eyeControlMap,
  ] = useTexture([...urls.textures]);
  const { gl, invalidate, size } = useThree();
  const drawingBufferSize = useRef(new Vector2());
  const reported = useRef(false);
  const controlMaps = useMemo<Readonly<Record<string, Texture>>>(
    () => ({
      rt_body: bodyControlMap,
      rt_face: faceControlMap,
      rt_hair: hairControlMap,
      rt_eyes: eyeControlMap,
      rt_eyelashes: eyeControlMap,
    }),
    [bodyControlMap, eyeControlMap, faceControlMap, hairControlMap],
  );
  const bindings = useMemo(
    () => buildMaterialBindings(gltf.scene, scanlineMap, irisNormalMap, controlMaps),
    [controlMaps, gltf.scene, irisNormalMap, scanlineMap],
  );

  useEffect(() => {
    scanlineMap.wrapS = RepeatWrapping;
    scanlineMap.wrapT = RepeatWrapping;
    scanlineMap.colorSpace = SRGBColorSpace;
    scanlineMap.minFilter = LinearMipmapLinearFilter;
    scanlineMap.magFilter = LinearFilter;
    scanlineMap.needsUpdate = true;

    irisNormalMap.wrapS = RepeatWrapping;
    irisNormalMap.wrapT = RepeatWrapping;
    irisNormalMap.colorSpace = NoColorSpace;
    irisNormalMap.flipY = false;
    irisNormalMap.minFilter = LinearMipmapLinearFilter;
    irisNormalMap.magFilter = LinearFilter;
    irisNormalMap.needsUpdate = true;

    for (const controlMap of new Set(Object.values(controlMaps))) {
      controlMap.wrapS = RepeatWrapping;
      controlMap.wrapT = RepeatWrapping;
      controlMap.colorSpace = SRGBColorSpace;
      controlMap.flipY = false;
      controlMap.minFilter = LinearMipmapLinearFilter;
      controlMap.magFilter = LinearFilter;
      controlMap.anisotropy = gl.capabilities.getMaxAnisotropy();
      controlMap.needsUpdate = true;
    }
  }, [controlMaps, gl, irisNormalMap, scanlineMap]);

  useEffect(() => {
    for (const [mesh, material] of bindings.holograms) mesh.material = material;
    invalidate();
    return () => {
      for (const [mesh, material] of bindings.originals) mesh.material = material;
    };
  }, [bindings, invalidate]);

  useEffect(() => {
    gl.getDrawingBufferSize(drawingBufferSize.current);
    for (const material of bindings.clonedMaterials) {
      updateHologramResolution(
        material,
        drawingBufferSize.current.x,
        drawingBufferSize.current.y,
      );
    }
    invalidate();
  }, [bindings.clonedMaterials, gl, invalidate, size.height, size.width]);

  useEffect(() => {
    const removeAfterEffect = addAfterEffect(() => {
      if (reported.current) return;
      reported.current = true;
      const snapshot = {
        drawCalls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
      };
      onFirstFrame(snapshot);
      removeAfterEffect();
    });
    invalidate();
    return removeAfterEffect;
  }, [gl, invalidate, onFirstFrame]);

  useEffect(
    () => () => {
      for (const [mesh, material] of bindings.originals) mesh.material = material;
      disposeAvatarSceneResources(gltf.scene, {
        materials: bindings.clonedMaterials,
        textures: [
          scanlineMap,
          irisNormalMap,
          ...new Set(Object.values(controlMaps)),
        ],
      });
      for (const url of urls.textures) useTexture.clear(url);
      useGLTF.clear(urls.model);
    },
    [
      bindings,
      controlMaps,
      gltf.scene,
      irisNormalMap,
      scanlineMap,
      urls.model,
      urls.textures,
    ],
  );

  return <primitive object={gltf.scene} dispose={null} />;
}
