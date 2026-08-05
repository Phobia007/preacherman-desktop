import { addAfterEffect, useFrame, useThree } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Group,
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
import { ThreeAvatarAnimationAdapter } from "./avatar/adapters/ThreeAvatarAnimationAdapter";
import { CortanaAnimationController } from "./avatar/controllers/CortanaAnimationController";
import {
  CORTANA_AVATAR_ID,
  CORTANA_DEFAULT_ACTION_ID,
  CORTANA_RIG_ID,
  cortanaAnimationManifest,
  cortanaMotionStateMap,
} from "./avatar/manifests/cortanaAnimationManifest";
import type {
  AvatarActionDescriptor,
  AvatarAnimationDebugSnapshot,
  AvatarAnimationError,
} from "./avatar/types/avatarAnimation";
import {
  createHologramMaterial,
  updateHologramResolution,
} from "./hologramMaterial";
import type { AvatarPerformanceSnapshot } from "./types";
import type { AvatarPose } from "./types";

const MODEL_FILE = "cortana-runtime.glb";
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
  readonly motionLibrary: {
    readonly manifestUrl: string;
    readonly indexUrl: string;
    readonly packsBaseUrl: string;
  };
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
  readonly actionId?: string;
  readonly actionRequestKey?: number;
  readonly assetBaseUrl: string;
  readonly onActionsReady?: (actions: readonly AvatarActionDescriptor[]) => void;
  readonly onAnimationDebug?: (
    snapshot: AvatarAnimationDebugSnapshot,
  ) => void;
  readonly onAnimationError: (error: AvatarAnimationError) => void;
  readonly onFirstFrame: (snapshot: AvatarPerformanceSnapshot) => void;
  readonly pose?: AvatarPose;
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
    motionLibrary: {
      manifestUrl: `${base}motion-library/motions.json`,
      indexUrl: `${base}motion-library/index.json`,
      packsBaseUrl: `${base}motion-library/packs/`,
    },
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
  actionId,
  actionRequestKey,
  assetBaseUrl,
  onActionsReady,
  onAnimationDebug,
  onAnimationError,
  onFirstFrame,
}: AvatarModelProps) {
  const urls = useMemo(() => createAvatarAssetUrls(assetBaseUrl), [assetBaseUrl]);
  const [
    scanlineMap,
    irisNormalMap,
    bodyControlMap,
    faceControlMap,
    hairControlMap,
    eyeControlMap,
  ] = useTexture([...urls.textures]);
  const adapter = useMemo(
    () => new ThreeAvatarAnimationAdapter({
      avatarId: CORTANA_AVATAR_ID,
      rigId: CORTANA_RIG_ID,
      modelUrl: urls.model,
      actions: cortanaAnimationManifest,
      defaultActionId: CORTANA_DEFAULT_ACTION_ID,
      stateMap: cortanaMotionStateMap,
      motionLibrary: urls.motionLibrary,
      onError: onAnimationError,
    }),
    [onAnimationError, urls.model],
  );
  const controller = useMemo(
    () => new CortanaAnimationController(adapter),
    [adapter],
  );
  const [root, setRoot] = useState<Group | null>(null);
  const { gl, invalidate, size } = useThree();
  const drawingBufferSize = useRef(new Vector2());
  const reported = useRef(false);
  const disposeTimer = useRef<ReturnType<typeof setTimeout>>();
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
    () => root
      ? buildMaterialBindings(root, scanlineMap, irisNormalMap, controlMaps)
      : null,
    [controlMaps, irisNormalMap, root, scanlineMap],
  );

  useEffect(() => {
    let active = true;
    const unsubscribe = onAnimationDebug
      ? adapter.subscribeDebug(onAnimationDebug)
      : undefined;
    void controller.load()
      .then(async () => {
        if (!active) return;
        await controller.setState("idle");
        if (!active) return;
        setRoot(adapter.getRoot());
        onActionsReady?.(controller.listActions());
        invalidate();
      })
      .catch(() => undefined);
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [adapter, controller, invalidate, onActionsReady, onAnimationDebug]);

  useEffect(() => {
    if (!root || !actionId) return;
    void controller.play(actionId, { restart: true })
      .then(() => invalidate())
      .catch(() => undefined);
  }, [actionId, actionRequestKey, controller, invalidate, root]);

  useFrame((_, deltaSeconds) => {
    adapter.update(deltaSeconds);
  });

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

    bodyControlMap.wrapS = RepeatWrapping;
    bodyControlMap.wrapT = RepeatWrapping;
    bodyControlMap.colorSpace = SRGBColorSpace;
    bodyControlMap.flipY = false;
    bodyControlMap.minFilter = LinearMipmapLinearFilter;
    bodyControlMap.magFilter = LinearFilter;
    bodyControlMap.anisotropy = gl.capabilities.getMaxAnisotropy();
    bodyControlMap.needsUpdate = true;

    faceControlMap.wrapS = RepeatWrapping;
    faceControlMap.wrapT = RepeatWrapping;
    faceControlMap.colorSpace = SRGBColorSpace;
    faceControlMap.flipY = false;
    faceControlMap.minFilter = LinearMipmapLinearFilter;
    faceControlMap.magFilter = LinearFilter;
    faceControlMap.anisotropy = gl.capabilities.getMaxAnisotropy();
    faceControlMap.needsUpdate = true;

    for (const controlMap of new Set([
      hairControlMap,
      eyeControlMap,
    ])) {
      controlMap.wrapS = RepeatWrapping;
      controlMap.wrapT = RepeatWrapping;
      controlMap.colorSpace = NoColorSpace;
      controlMap.flipY = false;
      controlMap.minFilter = LinearMipmapLinearFilter;
      controlMap.magFilter = LinearFilter;
      controlMap.anisotropy = gl.capabilities.getMaxAnisotropy();
      controlMap.needsUpdate = true;
    }
  }, [
    bodyControlMap,
    eyeControlMap,
    faceControlMap,
    gl,
    hairControlMap,
    irisNormalMap,
    scanlineMap,
  ]);

  useEffect(() => {
    if (!bindings) return;
    for (const [mesh, material] of bindings.holograms) mesh.material = material;
    invalidate();
    return () => {
      for (const [mesh, material] of bindings.originals) mesh.material = material;
      for (const material of bindings.clonedMaterials) material.dispose();
    };
  }, [bindings, invalidate]);

  useEffect(() => {
    if (!bindings) return;
    gl.getDrawingBufferSize(drawingBufferSize.current);
    for (const material of bindings.clonedMaterials) {
      updateHologramResolution(
        material,
        drawingBufferSize.current.x,
        drawingBufferSize.current.y,
      );
    }
    invalidate();
  }, [bindings, gl, invalidate, size.height, size.width]);

  useEffect(() => {
    if (!root) return;
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
  }, [gl, invalidate, onFirstFrame, root]);

  useEffect(
    () => () => {
      scanlineMap.dispose();
      irisNormalMap.dispose();
      for (const controlMap of new Set(Object.values(controlMaps))) {
        controlMap.dispose();
      }
      for (const url of urls.textures) useTexture.clear(url);
    },
    [
      controlMaps,
      irisNormalMap,
      scanlineMap,
      urls.textures,
    ],
  );

  useEffect(() => {
    if (disposeTimer.current !== undefined) {
      clearTimeout(disposeTimer.current);
      disposeTimer.current = undefined;
    }
    return () => {
      // React StrictMode immediately replays effects in development. Deferring
      // disposal lets that replay keep the in-flight GLB load, while a genuine
      // unmount still releases the controller on the next task.
      disposeTimer.current = setTimeout(() => controller.dispose(), 0);
    };
  }, [controller]);

  return root ? <primitive object={root} dispose={null} /> : null;
}
