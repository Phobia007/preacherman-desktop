import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  AnimationAction,
  AnimationClip,
  AnimationMixer,
  Bone,
  FileLoader,
  Group,
  LoopOnce,
  LoopRepeat,
} from "three";
import { disposeAvatarSceneResources } from "../../resourceLifecycle";
import type { AvatarAnimationPort } from "../contracts/AvatarAnimationPort";
import type {
  AvatarActionDescriptor,
  AvatarAnimationDebugSnapshot,
  AvatarMotionState,
  AvatarMotionLibraryOptions,
  PlayActionOptions,
} from "../types/avatarAnimation";
import { AvatarAnimationError } from "../types/avatarAnimation";

interface ThreeAvatarAnimationAdapterOptions {
  readonly avatarId: string;
  readonly rigId: string;
  readonly modelUrl: string;
  readonly actions: readonly AvatarActionDescriptor[];
  readonly defaultActionId: string;
  readonly stateMap: Readonly<Partial<Record<AvatarMotionState, string>>>;
  readonly motionLibrary?: AvatarMotionLibraryOptions;
  readonly onError?: (error: AvatarAnimationError) => void;
}

interface CurrentAction {
  readonly id: string;
  readonly descriptor: AvatarActionDescriptor;
  readonly action: AnimationAction;
}

type DebugListener = (snapshot: AvatarAnimationDebugSnapshot) => void;

interface MotionManifestEntry {
  readonly id: string;
  readonly action: string;
  readonly category: string;
  readonly loop: boolean;
  readonly pack_export: string;
}

interface MotionLibraryManifest {
  readonly motion_count: number;
  readonly motions: readonly MotionManifestEntry[];
}

interface MotionPackIndex {
  readonly total_actions: number;
  readonly packs: ReadonlyArray<{
    readonly id: string;
    readonly file: string;
    readonly animations: readonly string[];
  }>;
}

interface AnimationPackPayload {
  readonly animations: readonly AnimationClip[];
  readonly boneTranslations: ReadonlyMap<string, readonly [number, number, number]>;
}

const animationPackCache = new Map<string, Promise<AnimationPackPayload>>();

function withTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function fileName(value: string): string {
  return value.replaceAll("\\", "/").split("/").at(-1) ?? "";
}

function loadAnimationPack(
  loader: GLTFLoader,
  url: string,
): Promise<AnimationPackPayload> {
  const cached = animationPackCache.get(url);
  if (cached) return cached;
  const pending = loader.loadAsync(url)
    .then((gltf) => {
      const animations = Object.freeze([...gltf.animations]);
      const boneTranslations = new Map<string, readonly [number, number, number]>();
      gltf.scene.traverse((object) => {
        if (!(object instanceof Bone)) return;
        boneTranslations.set(object.name, [
          object.position.x,
          object.position.y,
          object.position.z,
        ]);
      });
      disposeAvatarSceneResources(gltf.scene);
      return { animations, boneTranslations };
    })
    .catch((error) => {
      animationPackCache.delete(url);
      throw error;
    });
  animationPackCache.set(url, pending);
  return pending;
}

function deriveTranslationScale(
  targetTranslations: ReadonlyMap<string, readonly [number, number, number]>,
  sourceTranslations: ReadonlyMap<string, readonly [number, number, number]>,
): number {
  const ratios: number[] = [];
  for (const [name, target] of targetTranslations) {
    const source = sourceTranslations.get(name);
    if (!source) continue;
    const sourceLength = Math.hypot(...source);
    const targetLength = Math.hypot(...target);
    if (sourceLength > 1e-5 && targetLength > 1e-5) {
      ratios.push(targetLength / sourceLength);
    }
  }
  if (ratios.length === 0) return 1;
  ratios.sort((left, right) => left - right);
  return ratios[Math.floor(ratios.length / 2)];
}

function scaleClipTranslations(clip: AnimationClip, scale: number): AnimationClip {
  if (Math.abs(scale - 1) < 1e-6) return clip;
  const normalized = clip.clone();
  for (const track of normalized.tracks) {
    if (!track.name.endsWith(".position")) continue;
    for (let index = 0; index < track.values.length; index += 1) {
      track.values[index] *= scale;
    }
  }
  return normalized;
}

export class ThreeAvatarAnimationAdapter implements AvatarAnimationPort {
  private readonly descriptors: Map<string, AvatarActionDescriptor>;
  private readonly loader = new GLTFLoader();
  private readonly fileLoader = new FileLoader();
  private readonly clipByName = new Map<string, AnimationClip>();
  private readonly actionById = new Map<string, AnimationAction>();
  private readonly debugListeners = new Set<DebugListener>();
  private readonly missingClipErrors: string[] = [];
  private readonly modelBoneTranslations = new Map<string, readonly [number, number, number]>();
  private readonly staticDescriptorIds: Set<string>;
  private readonly loadedPacks = new Set<string>();
  private root: Group | null = null;
  private mixer: AnimationMixer | null = null;
  private current: CurrentAction | null = null;
  private loadPromise: Promise<void> | null = null;
  private disposed = false;
  private mixerState: AvatarAnimationDebugSnapshot["mixerState"] = "idle";
  private boneCount = 0;

  constructor(private readonly options: ThreeAvatarAnimationAdapterOptions) {
    this.descriptors = new Map(
      options.actions.map((descriptor) => [descriptor.id, descriptor]),
    );
    this.staticDescriptorIds = new Set(this.descriptors.keys());
  }

  load(): Promise<void> {
    if (this.disposed) {
      return Promise.reject(this.fail(
        new AvatarAnimationError(
          "NOT_LOADED",
          "The Cortana animation adapter has been disposed.",
        ),
      ));
    }
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = this.loadAssets();
    return this.loadPromise;
  }

  listActions(): AvatarActionDescriptor[] {
    return [...this.descriptors.values()].map((descriptor) => ({
      ...descriptor,
    }));
  }

  hasAction(id: string): boolean {
    return this.descriptors.has(id);
  }

  async play(
    id: string,
    options: PlayActionOptions = {},
  ): Promise<void> {
    await this.load();
    await this.ensureActionClip(id);
    const next = this.resolveAction(id);
    if (
      this.current?.id === id
      && this.current.action.isRunning()
      && !options.restart
    ) {
      return;
    }
    if (
      this.current
      && !this.current.descriptor.interruptible
      && next.descriptor.priority < this.current.descriptor.priority
    ) {
      return;
    }

    const fadeIn = options.fadeIn ?? next.descriptor.fadeIn;
    const previous = this.current;
    this.prepareAction(next, options);
    next.action.reset().play();
    if (fadeIn > 0) next.action.fadeIn(fadeIn);
    if (previous && previous.action !== next.action) {
      previous.action.fadeOut(options.fadeOut ?? previous.descriptor.fadeOut);
    }
    this.current = next;
    this.mixerState = "playing";
    this.emitDebug();
  }

  async crossFadeTo(id: string, duration = 0.35): Promise<void> {
    await this.load();
    await this.ensureActionClip(id);
    const next = this.resolveAction(id);
    if (this.current?.id === id && this.current.action.isRunning()) return;

    const previous = this.current;
    this.prepareAction(next);
    next.action.reset().play();
    if (previous && previous.action !== next.action) {
      previous.action.crossFadeTo(next.action, duration, true);
    } else if (duration > 0) {
      next.action.fadeIn(duration);
    }
    this.current = next;
    this.mixerState = "playing";
    this.emitDebug();
  }

  stop(id?: string): void {
    if (!id) {
      this.mixer?.stopAllAction();
      this.current = null;
      this.mixerState = this.disposed ? "disposed" : "idle";
      this.emitDebug();
      return;
    }
    const action = this.actionById.get(id);
    action?.stop();
    if (this.current?.id === id) {
      this.current = null;
      this.mixerState = "idle";
      this.emitDebug();
    }
  }

  async setState(state: AvatarMotionState): Promise<void> {
    const actionId = this.options.stateMap[state];
    if (!actionId) {
      throw this.fail(
        new AvatarAnimationError(
          "STATE_UNMAPPED",
          `No Cortana clip is registered for motion state "${state}".`,
          { state },
        ),
      );
    }
    await this.play(actionId);
  }

  update(deltaSeconds: number): void {
    if (!this.disposed) this.mixer?.update(deltaSeconds);
  }

  getRoot(): Group | null {
    return this.root;
  }

  getDebugSnapshot(): AvatarAnimationDebugSnapshot {
    return {
      avatarId: this.options.avatarId,
      rigId: this.options.rigId,
      loadedClips: [...this.clipByName.keys()].sort(),
      currentAction: this.current?.id ?? null,
      currentDuration: this.current?.action.getClip().duration ?? null,
      mixerState: this.mixerState,
      boneCount: this.boneCount,
      missingClipErrors: [...this.missingClipErrors],
      loadedPacks: [...this.loadedPacks].sort(),
      registeredActions: this.descriptors.size,
    };
  }

  subscribeDebug(listener: DebugListener): () => void {
    this.debugListeners.add(listener);
    listener(this.getDebugSnapshot());
    return () => this.debugListeners.delete(listener);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.mixer?.removeEventListener("finished", this.handleFinished);
    this.mixer?.stopAllAction();
    if (this.mixer && this.root) {
      for (const clip of this.clipByName.values()) {
        this.mixer.uncacheClip(clip);
      }
      this.mixer.uncacheRoot(this.root);
    }
    if (this.root) {
      this.root.removeFromParent();
      disposeAvatarSceneResources(this.root);
    }
    this.actionById.clear();
    this.clipByName.clear();
    this.modelBoneTranslations.clear();
    this.current = null;
    this.root = null;
    this.mixer = null;
    this.mixerState = "disposed";
    this.emitDebug();
    this.debugListeners.clear();
  }

  private async loadAssets(): Promise<void> {
    await Promise.all([
      this.loadModel(),
      this.options.motionLibrary ? this.loadMotionLibrary(this.options.motionLibrary) : undefined,
    ]);
  }

  private async loadModel(): Promise<void> {
    let gltf: GLTF;
    try {
      gltf = await this.loader.loadAsync(this.options.modelUrl);
    } catch (cause) {
      throw this.fail(
        new AvatarAnimationError(
          "MODEL_LOAD_FAILED",
          `Failed to load Cortana model from ${this.options.modelUrl}.`,
          { modelUrl: this.options.modelUrl, cause: String(cause) },
        ),
      );
    }

    if (this.disposed) {
      disposeAvatarSceneResources(gltf.scene);
      throw this.fail(
        new AvatarAnimationError(
          "NOT_LOADED",
          "The Cortana animation adapter was disposed during model loading.",
        ),
      );
    }

    this.root = gltf.scene;
    this.boneCount = 0;
    this.root.traverse((object) => {
      if (!(object instanceof Bone)) return;
      this.boneCount += 1;
      this.modelBoneTranslations.set(object.name, [
        object.position.x,
        object.position.y,
        object.position.z,
      ]);
    });
    for (const clip of gltf.animations) {
      this.clipByName.set(clip.name, clip);
    }

    for (const id of this.staticDescriptorIds) {
      const descriptor = this.descriptors.get(id);
      if (!descriptor) continue;
      if (!this.clipByName.has(descriptor.clipName)) {
        this.missingClipErrors.push(descriptor.clipName);
      }
    }
    if (this.missingClipErrors.length > 0) {
      throw this.fail(
        new AvatarAnimationError(
          "CLIP_MISSING",
          `Cortana model is missing required clip(s): ${this.missingClipErrors.join(", ")}.`,
          {
            modelUrl: this.options.modelUrl,
            missingClips: [...this.missingClipErrors],
            loadedClips: [...this.clipByName.keys()],
          },
        ),
      );
    }

    this.mixer = new AnimationMixer(this.root);
    this.mixer.addEventListener("finished", this.handleFinished);
    this.emitDebug();
  }

  private async loadMotionLibrary(options: AvatarMotionLibraryOptions): Promise<void> {
    let manifest: MotionLibraryManifest;
    let index: MotionPackIndex;
    try {
      const [manifestSource, indexSource] = await Promise.all([
        this.fileLoader.loadAsync(options.manifestUrl),
        this.fileLoader.loadAsync(options.indexUrl),
      ]);
      manifest = JSON.parse(String(manifestSource)) as MotionLibraryManifest;
      index = JSON.parse(String(indexSource)) as MotionPackIndex;
    } catch (cause) {
      throw this.fail(new AvatarAnimationError(
        "MANIFEST_LOAD_FAILED",
        "Failed to load the Cortana motion library manifest or pack index.",
        { cause: String(cause) },
      ));
    }

    if (
      manifest.motion_count !== 412
      || manifest.motions?.length !== 412
      || index.total_actions !== 412
      || index.packs?.length !== 9
    ) {
      throw this.fail(new AvatarAnimationError(
        "MANIFEST_LOAD_FAILED",
        "The Cortana motion library must contain 412 motions across 9 packs.",
      ));
    }

    const packsByFile = new Map(index.packs.map((pack) => [pack.file, pack]));
    const nextDescriptors: AvatarActionDescriptor[] = [];
    const ids = new Set<string>();
    const clipNames = new Set<string>();
    for (const motion of manifest.motions) {
      const pack = packsByFile.get(motion.pack_export);
      if (
        !motion.id
        || !motion.action
        || ids.has(motion.id)
        || clipNames.has(motion.action)
        || !pack?.animations.includes(motion.action)
      ) {
        throw this.fail(new AvatarAnimationError(
          "MANIFEST_LOAD_FAILED",
          `Invalid Cortana motion entry: ${motion.id || motion.action || "unknown"}.`,
        ));
      }
      ids.add(motion.id);
      clipNames.add(motion.action);
      nextDescriptors.push({
        id: motion.id,
        clipName: motion.action,
        category: motion.category,
        loop: motion.loop ? "repeat" : "once",
        fadeIn: 0.25,
        fadeOut: 0.25,
        timeScale: 1,
        priority: 20,
        interruptible: true,
        ...(!motion.loop ? { fallback: this.options.defaultActionId } : {}),
        packUrl: `${withTrailingSlash(options.packsBaseUrl)}${fileName(motion.pack_export)}`,
      });
    }

    for (const descriptor of nextDescriptors) {
      if (this.descriptors.has(descriptor.id)) {
        throw this.fail(new AvatarAnimationError(
          "MANIFEST_LOAD_FAILED",
          `Cortana motion id collides with an existing action: ${descriptor.id}.`,
        ));
      }
      this.descriptors.set(descriptor.id, descriptor);
    }
    this.emitDebug();
  }

  private async ensureActionClip(id: string): Promise<void> {
    const descriptor = this.descriptors.get(id);
    if (!descriptor) {
      throw this.fail(new AvatarAnimationError(
        "ACTION_UNKNOWN",
        `Cortana action "${id}" is not registered.`,
        { actionId: id },
      ));
    }
    if (this.clipByName.has(descriptor.clipName)) return;
    if (!descriptor.packUrl) {
      throw this.fail(new AvatarAnimationError(
        "CLIP_MISSING",
        `Cortana clip "${descriptor.clipName}" is unavailable.`,
        { actionId: id, clipName: descriptor.clipName },
      ));
    }

    let pack: AnimationPackPayload;
    try {
      pack = await loadAnimationPack(this.loader, descriptor.packUrl);
    } catch (cause) {
      throw this.fail(new AvatarAnimationError(
        "PACK_LOAD_FAILED",
        `Failed to load Cortana animation pack ${descriptor.packUrl}.`,
        { actionId: id, packUrl: descriptor.packUrl, cause: String(cause) },
      ));
    }
    if (this.disposed) {
      throw this.fail(new AvatarAnimationError(
        "NOT_LOADED",
        "The Cortana animation adapter was disposed during pack loading.",
      ));
    }
    const translationScale = deriveTranslationScale(
      this.modelBoneTranslations,
      pack.boneTranslations,
    );
    for (const clip of pack.animations) {
      const normalizedClip = scaleClipTranslations(clip, translationScale);
      this.clipByName.set(normalizedClip.name, normalizedClip);
    }
    this.loadedPacks.add(descriptor.packUrl);
    if (!this.clipByName.has(descriptor.clipName)) {
      this.missingClipErrors.push(descriptor.clipName);
      throw this.fail(new AvatarAnimationError(
        "CLIP_MISSING",
        `Cortana pack is missing clip "${descriptor.clipName}".`,
        { actionId: id, clipName: descriptor.clipName, packUrl: descriptor.packUrl },
      ));
    }
    this.emitDebug();
  }

  private resolveAction(id: string): CurrentAction {
    const descriptor = this.descriptors.get(id);
    if (!descriptor) {
      throw this.fail(
        new AvatarAnimationError(
          "ACTION_UNKNOWN",
          `Cortana action "${id}" is not registered.`,
          { actionId: id },
        ),
      );
    }
    const clip = this.clipByName.get(descriptor.clipName);
    if (!clip || !this.mixer) {
      throw this.fail(
        new AvatarAnimationError(
          "CLIP_MISSING",
          `Cortana clip "${descriptor.clipName}" is unavailable.`,
          { actionId: id, clipName: descriptor.clipName },
        ),
      );
    }
    let action = this.actionById.get(id);
    if (!action) {
      action = this.mixer.clipAction(clip, this.root ?? undefined);
      this.actionById.set(id, action);
    }
    return { id, descriptor, action };
  }

  private prepareAction(
    current: CurrentAction,
    options: PlayActionOptions = {},
  ): void {
    const { action, descriptor } = current;
    action.enabled = true;
    action.clampWhenFinished = descriptor.loop === "once";
    action.setEffectiveTimeScale(options.timeScale ?? descriptor.timeScale);
    action.setEffectiveWeight(1);
    if (descriptor.loop === "once") {
      action.setLoop(LoopOnce, 1);
    } else {
      action.setLoop(LoopRepeat, Infinity);
    }
  }

  private readonly handleFinished = (
    event: { readonly action: AnimationAction },
  ) => {
    if (event.action !== this.current?.action) return;
    const fallback = this.current.descriptor.fallback
      ?? this.options.defaultActionId;
    void this.crossFadeTo(fallback, this.current.descriptor.fadeOut).catch(
      () => undefined,
    );
  };

  private fail(error: AvatarAnimationError): AvatarAnimationError {
    // A route change can dispose the model while an async GLB request is still
    // completing. That cancellation is an expected lifecycle outcome, not a
    // product error that should pollute the browser console.
    if (this.disposed && error.code === "NOT_LOADED") return error;
    this.mixerState = "error";
    this.options.onError?.(error);
    console.error("[preacherman.avatar-animation]", {
      code: error.code,
      message: error.message,
      details: error.details,
    });
    this.emitDebug();
    return error;
  }

  private emitDebug(): void {
    const snapshot = this.getDebugSnapshot();
    for (const listener of this.debugListeners) listener(snapshot);
  }
}
