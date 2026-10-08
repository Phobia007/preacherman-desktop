import { createCharacterKit, PathfinderAnimationAdapter, ThreeKitanaAnimationAdapter } from "./avatar/kits/characterKits";
import { importedAvatarProfiles, avatarUsesHologram } from "./avatarCatalog";
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
import { ThreeAvatarMotionStreamPlayer } from "./avatar/adapters/ThreeAvatarMotionStreamPlayer";
import type { AvatarMotionRigBinding, AvatarMotionStreamSource } from "./avatar/contracts/AvatarMotionStream";
import { CortanaAnimationController } from "./avatar/controllers/CortanaAnimationController";
import {
  CORTANA_AVATAR_ID,
  CORTANA_DEFAULT_ACTION_ID,
  CORTANA_RIG_ID,
  cortanaAnimationManifest,
  cortanaMotionStateMap,
} from "./avatar/manifests/cortanaAnimationManifest";
import {
  ZIMA_AVATAR_ID,
  ZIMA_DEFAULT_ACTION_ID,
  ZIMA_RIG_ID,
  zimaAnimationManifest,
  zimaMotionStateMap,
} from "./avatar/manifests/zimaAnimationManifest";
import { AvatarAnimationError as AnimationLoadError } from "./avatar/types/avatarAnimation";
import type {
  AvatarMotionState,
  AvatarActionDescriptor,
  AvatarAnimationDebugSnapshot,
  AvatarAnimationError,
} from "./avatar/types/avatarAnimation";
import {
  createHologramMaterial,
  updateHologramResolution,
} from "./hologramMaterial";
import type { AvatarModelId, AvatarPerformanceSnapshot } from "./types";
import type { AvatarPose } from "./types";

const SHADER_FILES = [
  "storm_cortana_scanlines_diff.png",
  "storm_cortana_default_eye_iris_normal.png",
  "storm_cortana_default_body_control.png",
  "storm_cortana_default_head_control.png",
  "storm_cortana_default_hair_control.png",
  "storm_cortana_default_eye_control.png",
] as const;

const AVATAR_PROFILES = {
  ...importedAvatarProfiles,
  cortana: {
    avatarId: CORTANA_AVATAR_ID,
    defaultActionId: CORTANA_DEFAULT_ACTION_ID,
    actions: cortanaAnimationManifest,
    jawBone: "b_jaw",
    modelFile: "cortana-runtime.glb",
    rigId: CORTANA_RIG_ID,
    stateMap: cortanaMotionStateMap,
    transform: {
      rotationY: -Math.PI / 2,
      scale: 1,
      verticalOffset: 0,
    },
  },
  zima: {
    avatarId: ZIMA_AVATAR_ID,
    defaultActionId: ZIMA_DEFAULT_ACTION_ID,
    actions: zimaAnimationManifest,
    jawBone: null,
    modelFile: "zima-runtime.glb",
    rigId: ZIMA_RIG_ID,
    stateMap: zimaMotionStateMap,
    transform: {
      rotationY: 0,
      scale: 0.9,
      verticalOffset: 0,
    },
  },
} as const;

interface AvatarAssetUrls {
  readonly model: string;
  readonly textures: readonly string[];
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
  readonly jawOpen?: number;
  readonly motionState?: AvatarMotionState;
  readonly motionSource?: AvatarMotionStreamSource;
  readonly motionRigBinding?: AvatarMotionRigBinding;
  readonly modelId: AvatarModelId;
  readonly rotationOffsetY?: number;
}

interface MaterialBindings {
  readonly originals: Map<Mesh, Material | Material[]>;
  readonly holograms: Map<Mesh, Material | Material[]>;
  readonly clonedMaterials: Set<MeshStandardMaterial>;
}

function withTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

export function createAvatarAssetUrls(
  assetBaseUrl: string,
  modelId: AvatarModelId = "cortana",
): AvatarAssetUrls {
  const base = withTrailingSlash(assetBaseUrl);
  const profile = AVATAR_PROFILES[modelId];
  const shaderUrl = (file: (typeof SHADER_FILES)[number]) =>
    `${base}shader/${file}`;
  return {
    model: `${base}${profile.modelFile}`,
    textures: avatarUsesHologram(modelId) ? [
      shaderUrl(SHADER_FILES[0]),
      shaderUrl(SHADER_FILES[1]),
      shaderUrl(SHADER_FILES[2]),
      shaderUrl(SHADER_FILES[3]),
      shaderUrl(SHADER_FILES[4]),
      shaderUrl(SHADER_FILES[5]),
    ] : [],
  };
}

function buildMaterialBindings(
  root: Object3D,
  scanlineMap: Texture,
  irisNormalMap: Texture,
  controlMaps: Readonly<Record<string, Texture>>,
  avatarGain: number,
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
          avatarGain,
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
  jawOpen = 0,
  motionState = "idle",
  motionSource,
  motionRigBinding,
  modelId,
  rotationOffsetY = 0,
}: AvatarModelProps) {
  const holographic = avatarUsesHologram(modelId);
  const profile = AVATAR_PROFILES[modelId];
  const urls = useMemo(
    () => createAvatarAssetUrls(assetBaseUrl, modelId),
    [assetBaseUrl, modelId],
  );
  const [
    scanlineMap,
    irisNormalMap,
    bodyControlMap,
    faceControlMap,
    hairControlMap,
    eyeControlMap,
  ] = useTexture([...urls.textures]);
  const animationErrorHandler = useRef(onAnimationError);
  animationErrorHandler.current = onAnimationError;
  const adapter = useMemo(
    () => createCharacterKit(profile.avatarId, urls.model, error => animationErrorHandler.current(error)) ?? new ThreeAvatarAnimationAdapter({
      avatarId: profile.avatarId,
      rigId: profile.rigId,
      modelUrl: urls.model,
      actions: profile.actions,
      defaultActionId: profile.defaultActionId,
      stateMap: profile.stateMap,
      onError: error => animationErrorHandler.current(error),
    }),
    [profile, urls.model],
  );
  const controller = useMemo(
    () => new CortanaAnimationController(adapter),
    [adapter],
  );
  const [root, setRoot] = useState<Group | null>(null);
  const motionPlayer = useMemo(
    () => root && motionRigBinding
      ? new ThreeAvatarMotionStreamPlayer(root, motionRigBinding)
      : null,
    [motionRigBinding, root],
  );
  const { gl, camera, scene, invalidate, size } = useThree();
  const [preparedRoot, setPreparedRoot] = useState<Group | null>(null);
  const compilation = useRef<Promise<unknown>>();
  // Shader compilation cannot be cancelled inside Three. Keep its resources
  // alive until it settles, even if the user selects another character.
  const afterCompilation = (cleanup: () => void) => {
    void Promise.resolve(compilation.current).catch(() => undefined).then(cleanup);
  };
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
    () => root && holographic
      ? buildMaterialBindings(
        root,
        scanlineMap,
        irisNormalMap,
        controlMaps,
        modelId === "zima" ? 2.25 : 1,
      )
      : null,
    [controlMaps, holographic, irisNormalMap, modelId, root, scanlineMap],
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

  useEffect(() => {
    if (!root || !(adapter instanceof PathfinderAnimationAdapter || adapter instanceof ThreeKitanaAnimationAdapter)) return;
    const transition = adapter instanceof ThreeKitanaAnimationAdapter
      ? adapter.setState(motionState, motionState === "listening" ? { expressionId: "attentive", intensity: 0.35 }
        : motionState === "thinking" ? { expressionId: "curious_question", intensity: 0.3 } : undefined)
      : adapter.setState(motionState);
    void transition.then(async () => {
      if (motionState === "thinking" && adapter instanceof ThreeKitanaAnimationAdapter) {
        await adapter.playExpression("curious_question", 0.3);
      }
      invalidate();
    }).catch(() => undefined);
  }, [adapter, invalidate, motionState, root]);

  useEffect(() => {
    if (!root) return;
    const energy = Number.isFinite(jawOpen) ? Math.max(0, Math.min(1, jawOpen)) : 0;
    if (adapter instanceof ThreeKitanaAnimationAdapter) adapter.audioEnergy(energy);
    if (adapter instanceof PathfinderAnimationAdapter) void adapter.setSpeechLevel(energy).catch(() => undefined);
  }, [adapter, jawOpen, root]);

  useFrame((_, deltaSeconds) => {
    const animationDelta = Math.min(deltaSeconds, 0.1);
    adapter.update(animationDelta);
    motionPlayer?.update(animationDelta);
    if (!root || jawOpen <= 0 || adapter instanceof ThreeKitanaAnimationAdapter) return;
    const jaw = profile.jawBone ? root.getObjectByName(profile.jawBone) : null;
    if (jaw) jaw.rotation.x += Math.min(1, jawOpen) * 0.22;
  });

  useEffect(() => {
    if (!motionSource || !motionPlayer) return;
    return motionSource.subscribe((event) => motionPlayer.receive(event));
  }, [motionPlayer, motionSource]);

  useEffect(() => () => motionPlayer?.dispose(), [motionPlayer]);

  useEffect(() => {
    if (!holographic) return;
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
    holographic,
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
      afterCompilation(() => { for (const material of bindings.clonedMaterials) material.dispose(); });
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
    let current = true;
    // Compile the final authored materials against the live lights, while the
    // model is detached. The first visible frame must not block on shader linking.
    const pending = Promise.resolve().then(() => current ? gl.compileAsync(root, camera, scene) : undefined);
    compilation.current = pending;
    void pending.then(() => {
      if (current) { setPreparedRoot(root); invalidate(); }
    }).catch(error => {
      if (current) animationErrorHandler.current(new AnimationLoadError("MODEL_LOAD_FAILED", "Unable to prepare the character materials.", { cause: String(error) }));
    });
    return () => { current = false; };
  }, [bindings, camera, gl, invalidate, root, scene]);

  useEffect(() => {
    if (!root || preparedRoot !== root) return;
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
  }, [gl, invalidate, onFirstFrame, preparedRoot, root]);

  useEffect(
    () => () => {
      if (!holographic) return;
      afterCompilation(() => {
        scanlineMap.dispose();
        irisNormalMap.dispose();
        for (const controlMap of new Set(Object.values(controlMaps))) controlMap.dispose();
      });
      useTexture.clear([...urls.textures]);
    },
    [
      controlMaps,
      holographic,
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
      disposeTimer.current = setTimeout(() => afterCompilation(() => controller.dispose()), 0);
    };
  }, [controller]);

  return root && preparedRoot === root ? (
    <group
      position={[0, profile.transform.verticalOffset, 0]}
      rotation={[0, profile.transform.rotationY + rotationOffsetY, 0]}
      scale={profile.transform.scale}
    >
      <primitive object={root} dispose={null} />
    </group>
  ) : null;
}
