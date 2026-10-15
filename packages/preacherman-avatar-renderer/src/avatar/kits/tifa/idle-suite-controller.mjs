// Playback and blending only. No new bone motion is authored here.
// Inject the caller's exact Three instance so this module also runs in Node QA.
export const SUITE_CLIPS = Object.freeze({
  idle: 'tifa.idle.feri.cbnm_id0.v1',
  awaiting: 'tifa.gesture.feri.awaiting.v1',
  glove_check: 'tifa.gesture.feri.glove_check.v1',
  thought: 'tifa.gesture.feri.thought.v1'
});
export const SUITE_LABELS = Object.freeze({ idle: '自然待机', awaiting: '稍作等待', glove_check: '检查手套', thought: '轻轻思考' });

export class IdleSuiteController {
  constructor(THREE, root, clips, options = {}) {
    this.THREE = THREE;
    this.root = root;
    this.random = options.random || Math.random;
    this.onStateChange = options.onStateChange || (() => {});
    this.transitionSeconds = Math.max(1.2, Math.min(1.8, options.transitionSeconds ?? 1.5));
    this.mixer = new THREE.AnimationMixer(root);
    this.actions = new Map();
    this.weights = new Map();
    this.actionKeys = new Map();
    this.paused = false;
    this.speed = 1;
    this.autoRandom = true;
    this.idleLoop = true;
    this.completed = false;
    this.disposed = false;
    this.lastGesture = null;
    this.pending = null;
    this.transition = null;
    this.phase = 'idle';
    this.currentKey = 'idle';
    this.idleElapsed = 0;
    this.waitSeconds = this._nextWait();
    for (const [key, name] of Object.entries(SUITE_CLIPS)) {
      const clip = clips.find(item => item.name === name);
      if (!clip || !Number.isFinite(clip.duration) || clip.duration <= 0 || !clip.tracks.length) throw new Error(`缺少动作：${SUITE_LABELS[key]}`);
      const action = this.mixer.clipAction(clip);
      action.setEffectiveWeight(0);
      action.setLoop(key === 'idle' ? THREE.LoopRepeat : THREE.LoopOnce, key === 'idle' ? Infinity : 1);
      action.clampWhenFinished = key !== 'idle';
      this.actions.set(key, action);
      this.weights.set(action, 0);
      this.actionKeys.set(action, key);
    }
    // A second action for the same source idle lets Replay blend to frame zero.
    // It clones source tracks unchanged and avoids resetting a weighted action.
    const alternate = this.mixer.clipAction(this.actions.get('idle').getClip().clone());
    alternate.setEffectiveWeight(0).setLoop(THREE.LoopRepeat, Infinity);
    this.weights.set(alternate, 0);
    this.actionKeys.set(alternate, 'idle');
    this.idleActions = [this.actions.get('idle'), alternate];
    this.activeIdle = this.idleActions[0];
    this.currentAction = this.activeIdle;
    this.activeIdle.reset().setEffectiveWeight(1).play();
    this.weights.set(this.activeIdle, 1);
    this.mixer.update(0);
  }
  _unitRandom() { const value = Number(this.random()); return Number.isFinite(value) ? Math.max(0, Math.min(.999999999, value)) : .5; }
  _nextWait() { return 10; }
  _notify() { this.onStateChange(this.getSnapshot()); }
  _schedule() { this.idleElapsed = 0; this.waitSeconds = this._nextWait(); }
  _configureIdle(action) {
    action.setLoop(this.idleLoop ? this.THREE.LoopRepeat : this.THREE.LoopOnce, this.idleLoop ? Infinity : 1);
    action.clampWhenFinished = !this.idleLoop;
  }
  _duration(action) { return Math.min(this.transitionSeconds, action.getClip().duration * .45); }
  _beginTransition(action, key, phase) {
    this.completed = false;
    this.currentAction = action;
    this.currentKey = key;
    this.phase = phase;
    this.transition = { elapsed: 0, duration: this._duration(action), target: action, start: new Map(this.weights) };
    this._notify();
  }
  _playGesture(key) {
    const action = this.actions.get(key);
    action.reset().setLoop(this.THREE.LoopOnce, 1).setEffectiveWeight(0).play();
    action.clampWhenFinished = true;
    this.weights.set(action, 0);
    this.lastGesture = key;
    this.idleElapsed = 0;
    this._beginTransition(action, key, 'gesture');
  }
  _returnIdle() {
    const idle = this.activeIdle;
    if (idle.paused || !idle.isScheduled()) idle.reset().setEffectiveWeight(this.weights.get(idle) || 0).play();
    this._configureIdle(idle);
    this._beginTransition(idle, 'idle', 'returning');
  }
  _restartIdle() {
    const idle = this.idleActions.find(item => item !== this.activeIdle);
    this.activeIdle = idle;
    idle.reset().setEffectiveWeight(0).play();
    this._configureIdle(idle);
    this.weights.set(idle, 0);
    this._schedule();
    this._beginTransition(idle, 'idle', 'returning');
  }
  _handlePending() {
    if (!this.pending || this.transition) return;
    const pending = this.pending; this.pending = null;
    if (pending === 'restart-idle') { this._restartIdle(); return; }
    if (pending === 'idle') { if (this.currentKey !== 'idle') this._returnIdle(); return; }
    if (this.currentKey === pending) {
      // Fade out before restarting the same weighted one-shot clip.
      this.pending = pending;
      this._returnIdle();
      return;
    }
    this._playGesture(pending);
  }
  request(key) {
    if (this.disposed || !(key in SUITE_CLIPS)) return;
    this.pending = key;
    this._handlePending();
  }
  replay() {
    if (this.disposed) return;
    this.pending = this.currentKey === 'idle' ? 'restart-idle' : this.currentKey;
    this._handlePending();
  }
  setPaused(value) { this.paused = Boolean(value); this._notify(); }
  setSpeed(value) { if ([.5, .75, 1].includes(Number(value))) this.speed = Number(value); this._notify(); }
  setAutoRandom(value) { this.autoRandom = Boolean(value); this._schedule(); this._notify(); }
  setIdleLoop(value) {
    this.idleLoop = Boolean(value);
    for (const action of this.idleActions) this._configureIdle(action);
    if (this.idleLoop && this.completed) this.replay();
    this._notify();
  }
  seek(fraction) {
    if (this.disposed) return;
    const action = this.currentAction;
    action.enabled = true;
    action.paused = false;
    action.time = Math.max(0, Math.min(1, Number(fraction) || 0)) * action.getClip().duration;
    this.completed = false;
    this.mixer.update(0);
    this._notify();
  }
  update(deltaSeconds) {
    if (this.paused || this.disposed || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0 || this.completed) return;
    let remaining = deltaSeconds * this.speed;
    // Small deterministic steps also make controller tests independent of FPS.
    while (remaining > 1e-9 && !this.completed) {
      const delta = Math.min(remaining, 1 / 30);
      remaining -= delta;
      this._step(delta);
    }
  }
  _step(delta) {
    const wasTransitioning = Boolean(this.transition);
    if (this.transition) {
      this.transition.elapsed = Math.min(this.transition.duration, this.transition.elapsed + delta);
      const fraction = this.transition.elapsed / this.transition.duration;
      const blend = fraction * fraction * (3 - 2 * fraction);
      for (const [action, start] of this.transition.start) {
        const weight = start + ((action === this.transition.target ? 1 : 0) - start) * blend;
        this.weights.set(action, weight);
        action.setEffectiveWeight(weight);
      }
    }
    this.mixer.update(delta);
    if (this.transition && this.transition.elapsed >= this.transition.duration - 1e-9) {
      this.transition = null;
      for (const [action, weight] of this.weights) {
        if (weight < 1e-8 && action !== this.activeIdle) action.stop().setEffectiveWeight(0);
      }
      if (this.phase === 'returning') { this.phase = 'idle'; this._schedule(); }
      this._notify();
      this._handlePending();
    }
    if (!this.transition && this.currentKey !== 'idle') {
      const exitDuration = this._duration(this.activeIdle);
      if (this.currentAction.time >= this.currentAction.getClip().duration - exitDuration) this._returnIdle();
    }
    if (!this.transition && this.currentKey === 'idle') {
      if (!this.idleLoop && this.currentAction.paused) {
        this.completed = true;
        this._notify();
      } else if (this.autoRandom && !wasTransitioning) {
        this.idleElapsed += delta;
        if (this.idleElapsed >= this.waitSeconds - 1e-9) {
          const candidates = ['awaiting', 'glove_check', 'thought'].filter(key => key !== this.lastGesture);
          this._playGesture(candidates[Math.floor(this._unitRandom() * candidates.length)]);
        }
      }
    }
  }
  getSnapshot() {
    const action = this.currentAction;
    return {
      currentKey: this.currentKey, label: SUITE_LABELS[this.currentKey], phase: this.phase,
      time: Math.min(action.time, action.getClip().duration), duration: action.getClip().duration,
      transitioning: Boolean(this.transition), paused: this.paused, speed: this.speed,
      autoRandom: this.autoRandom, idleLoop: this.idleLoop, completed: this.completed,
      nextRandomInSeconds: this.autoRandom && this.currentKey === 'idle' && !this.transition ? Math.max(0, this.waitSeconds - this.idleElapsed) : null,
      weights: [...this.weights].map(([item, weight]) => ({ key: this.actionKeys.get(item), weight }))
    };
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
    this.onStateChange = () => {};
  }
}
