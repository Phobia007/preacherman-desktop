import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  AnimationAction,
  AnimationClip,
  AnimationMixer,
  Bone,
  Group,
  LoopOnce,
  LoopRepeat,
} from "three";
import { loadAvatarModelFile } from "../../avatarModelCache";
import { disposeAvatarSceneResources } from "../../resourceLifecycle";
import type { AvatarAnimationPort } from "../contracts/AvatarAnimationPort";
import type {
  AvatarActionDescriptor,
  AvatarAnimationDebugSnapshot,
  AvatarMotionState,
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
  readonly onError?: (error: AvatarAnimationError) => void;
}

interface CurrentAction {
  readonly id: string;
  readonly descriptor: AvatarActionDescriptor;
  readonly action: AnimationAction;
}

type DebugListener = (snapshot: AvatarAnimationDebugSnapshot) => void;

export class ThreeAvatarAnimationAdapter implements AvatarAnimationPort {
  private readonly descriptors: Map<string, AvatarActionDescriptor>;
  private readonly loader = new GLTFLoader();
  private readonly clipByName = new Map<string, AnimationClip>();
  private readonly actionById = new Map<string, AnimationAction>();
  private readonly debugListeners = new Set<DebugListener>();
  private readonly missingClipErrors: string[] = [];
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
  }

  load(): Promise<void> {
    if (this.disposed) {
      return Promise.reject(this.fail(
        new AvatarAnimationError(
          "NOT_LOADED",
          "The avatar animation adapter has been disposed.",
        ),
      ));
    }
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = this.loadModel();
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
          `No avatar clip is registered for motion state "${state}".`,
          { state },
        ),
      );
    }
    await this.play(actionId);
  }

  update(deltaSeconds: number): void {
    if (!this.disposed) {
      this.mixer?.update(deltaSeconds);
    }
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
    this.current = null;
    this.root = null;
    this.mixer = null;
    this.mixerState = "disposed";
    this.emitDebug();
    this.debugListeners.clear();
  }

  private async loadModel(): Promise<void> {
    let gltf: GLTF;
    try {
      const url = this.options.modelUrl;
      const source = await loadAvatarModelFile(url);
      gltf = await this.loader.parseAsync(source, url.slice(0, url.lastIndexOf("/") + 1));
    } catch (cause) {
      throw this.fail(
        new AvatarAnimationError(
          "MODEL_LOAD_FAILED",
          `Failed to load avatar model from ${this.options.modelUrl}.`,
          { modelUrl: this.options.modelUrl, cause: String(cause) },
        ),
      );
    }

    if (this.disposed) {
      disposeAvatarSceneResources(gltf.scene);
      throw this.fail(
        new AvatarAnimationError(
          "NOT_LOADED",
          "The avatar animation adapter was disposed during model loading.",
        ),
      );
    }

    this.root = gltf.scene;
    this.boneCount = 0;
    this.root.traverse((object) => {
      if (!(object instanceof Bone)) return;
      this.boneCount += 1;
    });
    for (const clip of gltf.animations) {
      this.clipByName.set(clip.name, clip);
    }

    for (const descriptor of this.descriptors.values()) {
      if (!this.clipByName.has(descriptor.clipName)) {
        this.missingClipErrors.push(descriptor.clipName);
      }
    }
    if (this.missingClipErrors.length > 0) {
      throw this.fail(
        new AvatarAnimationError(
          "CLIP_MISSING",
          `Avatar model is missing required clip(s): ${this.missingClipErrors.join(", ")}.`,
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

  private resolveAction(id: string): CurrentAction {
    const descriptor = this.descriptors.get(id);
    if (!descriptor) {
      throw this.fail(
        new AvatarAnimationError(
          "ACTION_UNKNOWN",
          `Avatar action "${id}" is not registered.`,
          { actionId: id },
        ),
      );
    }
    const clip = this.clipByName.get(descriptor.clipName);
    if (!clip || !this.mixer) {
      throw this.fail(
        new AvatarAnimationError(
          "CLIP_MISSING",
          `Avatar clip "${descriptor.clipName}" is unavailable.`,
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
