import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { IdleSuiteController, SUITE_CLIPS } from './idle-suite-controller.mjs';
import {
  TIFA_AVATAR_ID, TIFA_RIG_ID, tifaActionKeys,
  tifaAnimationManifest, tifaMotionStateMap,
} from './profile.mjs';

/** Structurally compatible with the renderer's exported AvatarAnimationError. */
export class TifaAnimationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'AvatarAnimationError';
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

function disposeScenes(scenes) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  const skeletons = new Set(), images = new Set();
  for (const scene of new Set(scenes.filter(Boolean))) {
    scene.removeFromParent();
    scene.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.skeleton) skeletons.add(object.skeleton);
      const list = object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : [];
      for (const material of list) materials.add(material);
    });
  }
  for (const material of materials) {
    for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    for (const uniform of Object.values(material.uniforms ?? {})) if (uniform?.value?.isTexture) textures.add(uniform.value);
  }
  for (const texture of textures) {
    const image = texture.source?.data;
    for (const item of Array.isArray(image) ? image : [image]) if (item && typeof item.close === 'function') images.add(item);
    texture.dispose();
  }
  for (const skeleton of skeletons) skeleton.dispose();
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const image of images) image.close();
}

// GLTFLoader parsing is not abortable. Dispose a late successful parse instead
// of allowing a route change or timeout to leave its resources alive.
function withSignal(promise, signal, releaseLateResult) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const abort = () => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', abort);
      reject(signal.reason ?? new Error('Loading cancelled.'));
    };
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(value => {
      if (settled) { releaseLateResult?.(value); return; }
      settled = true;
      signal.removeEventListener('abort', abort);
      resolve(value);
    }, error => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', abort);
      reject(error);
    });
  });
}

function checkedTransition(value, name = 'transitionSeconds') {
  if (!Number.isFinite(value) || value < 1.2 || value > 1.8) {
    throw new RangeError(`${name} must be between 1.2 and 1.8 seconds.`);
  }
  return value;
}

function checkedPlayOptions(options = {}) {
  if (!options || typeof options !== 'object') throw new TypeError('Play options must be an object.');
  if (options.timeScale !== undefined && ![0.5, 0.75, 1].includes(options.timeScale)) {
    throw new RangeError('timeScale must be 0.5, 0.75 or 1. It controls the whole suite playback clock.');
  }
  for (const name of ['fadeIn', 'fadeOut']) if (options[name] !== undefined) checkedTransition(options[name], name);
  if (options.fadeIn !== undefined && options.fadeOut !== undefined && options.fadeIn !== options.fadeOut) {
    throw new RangeError('This suite uses symmetric fades; fadeIn and fadeOut must be equal.');
  }
  if (options.restart !== undefined && typeof options.restart !== 'boolean') throw new TypeError('restart must be boolean.');
  return options;
}

export class TifaAnimationAdapter {
  constructor(options) {
    if (!options || typeof options.modelUrl !== 'string' || !options.modelUrl.trim()) throw new TypeError('modelUrl is required.');
    this.options = { ...options };
    this.transitionSeconds = checkedTransition(options.transitionSeconds ?? 1.5);
    this.loadTimeoutMs = options.loadTimeoutMs ?? 45000;
    if (!Number.isFinite(this.loadTimeoutMs) || this.loadTimeoutMs <= 0) throw new RangeError('loadTimeoutMs must be positive.');
    this.loader = new GLTFLoader();
    this.root = null;
    this.scenes = [];
    this.clips = [];
    this.controller = null;
    this.loadPromise = null;
    this.loadAbort = null;
    this.disposed = false;
    this.stopped = false;
    this.renderActive = true;
    this.motionState = 'idle';
    this.error = false;
    this.boneCount = 0;
    this.missingClipErrors = [];
    this.debugListeners = new Set();
  }

  load() {
    if (this.disposed) return Promise.reject(this._disposedError());
    if (this.loadPromise) return this.loadPromise;
    if (this.controller) return Promise.resolve();
    this.error = false;
    const promise = this._loadModel();
    this.loadPromise = promise;
    // Retain no rejected promise: a failed request may be retried with load().
    void promise.finally(() => { if (this.loadPromise === promise) this.loadPromise = null; }).catch(() => {});
    return promise;
  }

  async _loadModel() {
    const abort = new AbortController();
    this.loadAbort = abort;
    this.missingClipErrors = [];
    let gltf = null;
    const timeout = setTimeout(() => abort.abort(new Error(`Model loading exceeded ${this.loadTimeoutMs} ms.`)), this.loadTimeoutMs);
    try {
      const read = this.options.loadModelFile ?? (async (url, { signal }) => {
        const response = await fetch(url, { signal });
        if (!response.ok) throw new Error(`Model request returned HTTP ${response.status}.`);
        return response.arrayBuffer();
      });
      const source = await withSignal(read(this.options.modelUrl, { signal: abort.signal }), abort.signal);
      if (!(source instanceof ArrayBuffer)) throw new TypeError('loadModelFile must resolve to an ArrayBuffer.');
      const base = this.options.modelUrl.slice(0, this.options.modelUrl.lastIndexOf('/') + 1);
      gltf = await withSignal(this.loader.parseAsync(source, base), abort.signal,
        value => disposeScenes([value.scene, ...(value.scenes ?? [])]));
      if (this.disposed) throw this._disposedError();
      this.missingClipErrors = Object.values(SUITE_CLIPS).filter(name => !gltf.animations.some(clip => clip.name === name && clip.duration > 0 && clip.tracks.length > 0));
      if (this.missingClipErrors.length) {
        throw new TifaAnimationError('CLIP_MISSING', 'Tifa GLB is missing required animation clips.', {
          missingClips: [...this.missingClipErrors], loadedClips: gltf.animations.map(clip => clip.name),
        });
      }
      this.root = gltf.scene;
      this.scenes = [gltf.scene, ...(gltf.scenes ?? [])];
      this.clips = [...gltf.animations];
      this.boneCount = 0;
      this.root.traverse(object => { if (object.isBone) this.boneCount++; });
      this.controller = new IdleSuiteController(THREE, this.root, this.clips, {
        random: this.options.random,
        transitionSeconds: this.transitionSeconds,
        onStateChange: () => this._emitDebug(),
      });
      this._syncPause();
      this._emitDebug();
    } catch (cause) {
      this.controller?.dispose();
      this.controller = null;
      if (gltf) disposeScenes([gltf.scene, ...(gltf.scenes ?? [])]);
      this.root = null;
      this.scenes = [];
      this.clips = [];
      this.boneCount = 0;
      if (this.disposed) throw this._disposedError();
      const error = cause instanceof TifaAnimationError ? cause : new TifaAnimationError('MODEL_LOAD_FAILED', 'Failed to load the Tifa animation model.', {
        modelUrl: this.options.modelUrl, cause: String(cause),
      });
      throw this._fail(error);
    } finally {
      clearTimeout(timeout);
      if (this.loadAbort === abort) this.loadAbort = null;
    }
  }

  listActions() { return tifaAnimationManifest.map(descriptor => ({ ...descriptor })); }
  hasAction(id) { return Object.hasOwn(tifaActionKeys, id); }

  async play(id, options = {}) {
    if (this.disposed) throw this._disposedError();
    if (!this.hasAction(id)) throw this._fail(new TifaAnimationError('ACTION_UNKNOWN', `Tifa action "${id}" is not registered.`, { actionId: id }));
    checkedPlayOptions(options);
    await this.load();
    if (this.disposed) throw this._disposedError();
    const controller = this.controller;
    this.error = false;
    this.stopped = false;
    if (options.timeScale !== undefined) controller.setSpeed(options.timeScale);
    const fade = options.fadeIn ?? options.fadeOut;
    if (fade !== undefined) controller.transitionSeconds = fade;
    this._syncPause();
    const key = tifaActionKeys[id];
    const snapshot = controller.getSnapshot();
    if (snapshot.currentKey !== key) controller.request(key);
    else if (options.restart) controller.replay();
    this._emitDebug();
  }

  crossFadeTo(id, duration = 1.5) {
    checkedTransition(duration, 'duration');
    return this.play(id, { fadeIn: duration, fadeOut: duration });
  }

  // Stop freezes the displayed pose. play()/setState() resumes the same mixer.
  stop(id) {
    if (this.disposed) return;
    if (id !== undefined && (!this.hasAction(id) || tifaActionKeys[id] !== this.controller?.getSnapshot().currentKey)) return;
    this.stopped = true;
    this._syncPause();
    this._emitDebug();
  }

  async setState(state) {
    if (this.disposed) throw this._disposedError();
    if (!Object.hasOwn(tifaMotionStateMap, state)) throw this._fail(new TifaAnimationError('STATE_UNMAPPED', `No Tifa state mapping exists for "${state}".`, { state }));
    await this.load();
    if (this.disposed) throw this._disposedError();
    if (this.motionState === state && !this.stopped) return;
    this.motionState = state;
    this.controller.setAutoRandom(state === 'idle');
    await this.play(tifaMotionStateMap[state]);
  }

  setRenderActive(active) {
    if (this.disposed) return;
    this.renderActive = Boolean(active);
    this._syncPause();
  }

  _syncPause() { this.controller?.setPaused(this.stopped || !this.renderActive); }

  update(deltaSeconds) {
    if (this.disposed || this.stopped || !this.renderActive || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    // Match AvatarModel's existing frame cap; do not catch up hidden-tab time.
    this.controller?.update(Math.min(deltaSeconds, 0.1));
  }

  getRoot() { return this.root; }
  getPlaybackSnapshot() { return this.controller?.getSnapshot() ?? null; }
  getDebugSnapshot() {
    const snapshot = this.getPlaybackSnapshot();
    return {
      avatarId: TIFA_AVATAR_ID,
      rigId: TIFA_RIG_ID,
      loadedClips: this.clips.map(clip => clip.name).sort(),
      currentAction: snapshot ? Object.keys(tifaActionKeys).find(id => tifaActionKeys[id] === snapshot.currentKey) ?? null : null,
      currentDuration: snapshot?.duration ?? null,
      mixerState: this.disposed ? 'disposed' : this.error ? 'error' : !this.controller || this.stopped ? 'idle' : 'playing',
      boneCount: this.boneCount,
      missingClipErrors: [...this.missingClipErrors],
      registeredActions: tifaAnimationManifest.length,
    };
  }

  subscribeDebug(listener) {
    if (typeof listener !== 'function') throw new TypeError('Debug listener must be a function.');
    if (!this.disposed) this.debugListeners.add(listener);
    try { listener(this.getDebugSnapshot()); } catch { /* Observer errors must not break playback. */ }
    return () => this.debugListeners.delete(listener);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.loadAbort?.abort(this._disposedError());
    this.controller?.dispose();
    this.controller = null;
    disposeScenes(this.scenes);
    this.scenes = [];
    this.root = null;
    this.clips = [];
    this.boneCount = 0;
    this._emitDebug();
    this.debugListeners.clear();
  }

  _disposedError() { return new TifaAnimationError('NOT_LOADED', 'The Tifa animation adapter has been disposed.'); }
  _fail(error) {
    if (this.disposed) return error;
    this.error = true;
    try { this.options.onError?.(error); } catch { /* Do not replace the original error. */ }
    this._emitDebug();
    return error;
  }
  _emitDebug() {
    const snapshot = this.getDebugSnapshot();
    for (const listener of this.debugListeners) {
      try { listener(snapshot); } catch { /* Isolate a faulty observer. */ }
    }
  }
}
