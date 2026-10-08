export function createSeededRandom(seed) {
  let state = Number(seed) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export const smootherstep = value => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * t * (t * (t * 6 - 15) + 10);
};

export class IdleTalkPlayer {
  constructor({THREE, mixer, clips, continuousIndex = 0, talkIndex,
    random = Math.random, minimumDelay = 45, maximumDelay = 90,
    enterFade = 1.8, exitFade = 1.8, returnPhase = 0, safeWindows = [[0, 4], [33, 36]],
    onChange = () => {}}) {
    this.THREE = THREE;
    this.mixer = mixer;
    this.clips = clips;
    this.continuousIndex = continuousIndex;
    this.talkIndex = talkIndex;
    this.random = random;
    this.minimumDelay = minimumDelay;
    this.maximumDelay = maximumDelay;
    this.enterFade = enterFade;
    this.exitFade = exitFade;
    this.safeWindows = safeWindows;
    this.onChange = onChange;
    this.playing = true;
    this.speed = 1;
    this.randomEnabled = true;
    this.manualIndex = continuousIndex;
    this.currentIndex = continuousIndex;
    this.mode = 'idle';
    this.blend = null;
    this.remaining = null;
    this.talkCount = 0;
    this.activePlaybackSeconds = 0;
    this.lastTriggerPhase = null;
    this.lastTriggerReason = null;
    this.oneShotPending = false;
    this.returnPhase = returnPhase;
    this.destroyed = false;
    this.actions = clips.map(clip => mixer.clipAction(clip));
    this.beforeStep = () => {};
    this.afterStep = () => {};
    this.allowTalkClock = () => true;
    this.allowTalkStart = () => true;
    if (!clips[talkIndex] || clips[talkIndex].duration <= enterFade + exitFade)
      throw new Error('Compatible talk clip is missing or too short for entry/exit blending.');
    if (!(minimumDelay >= 0 && maximumDelay >= minimumDelay)) throw new Error('Invalid random interval.');
    const baseDuration = clips[continuousIndex]?.duration;
    if (!(baseDuration > 0) || !Number.isFinite(returnPhase) || returnPhase < 0 || returnPhase >= baseDuration)
      throw new Error('Invalid return phase.');
    if (![enterFade, exitFade].every(value => Number.isFinite(value) && value > 0)) throw new Error('Invalid blend duration.');
    if (!Array.isArray(safeWindows) || !safeWindows.length || safeWindows.some(window => !Array.isArray(window) || window.length !== 2 || !window.every(Number.isFinite) || window[0] < 0 || window[1] <= window[0] || window[1] > baseDuration))
      throw new Error('Invalid safe talk windows.');
  }

  get activeAction() { return this.actions[this.currentIndex]; }

  get canRequestOneShot() {
    return !this.destroyed && this.manualIndex === this.continuousIndex && this.mode === 'idle' && !this.oneShotPending;
  }

  requestOneShot() {
    if (!this.canRequestOneShot) return false;
    this.oneShotPending = true;
    this.onChange();
    return true;
  }

  nextInterval() {
    const value = Math.max(0, Math.min(1 - Number.EPSILON, this.random()));
    return this.minimumDelay + (this.maximumDelay - this.minimumDelay) * value;
  }

  resetInterval() {
    this.remaining = this.randomEnabled ? this.nextInterval() : null;
  }

  setRandomSource(random) {
    this.random = random;
    if (this.mode === 'idle') this.resetInterval();
  }

  setRandomEnabled(enabled) {
    this.randomEnabled = Boolean(enabled);
    // An in-flight talk finishes and returns smoothly even if future insertions are disabled.
    if (this.mode === 'idle' || this.mode === 'manual') this.resetInterval();
    this.onChange();
  }

  setPlaying(playing) { this.playing = Boolean(playing); }

  setSpeed(speed) {
    if (!Number.isFinite(speed) || speed <= 0 || speed > 4) throw new Error('Invalid playback speed.');
    this.speed = speed;
  }

  configureAction(index, {once = false, time = 0} = {}) {
    const action = this.actions[index];
    action.stopFading().stopWarping().reset().setEffectiveTimeScale(1);
    action.clampWhenFinished = once;
    action.setLoop(once ? this.THREE.LoopOnce : this.THREE.LoopRepeat, once ? 1 : Infinity);
    action.time = time;
    action.play();
    return action;
  }

  transitionTo(index, {time = 0, duration = 0.55, once = false, kind = 'manual', immediate = false} = {}) {
    const target = this.actions[index];
    const sourceWeights = this.actions.map(action => ({action, weight: action.enabled ? action.getEffectiveWeight() : 0}))
      .filter(item => item.action !== target && item.weight > 1e-8 && item.action.isScheduled());
    const targetStart = target.isScheduled() && target.enabled ? target.getEffectiveWeight() : 0;
    this.configureAction(index, {once, time});
    this.currentIndex = index;
    if (immediate || !this.playing || sourceWeights.length === 0) {
      this.mixer.stopAllAction();
      this.configureAction(index, {once, time}).setEffectiveWeight(1);
      this.blend = null;
    } else {
      const total = sourceWeights.reduce((sum, item) => sum + item.weight, 0) + targetStart;
      for (const item of sourceWeights) item.weight /= total;
      const initialTargetWeight = targetStart / total;
      target.setEffectiveWeight(initialTargetWeight);
      this.blend = {sources: sourceWeights, target, targetStart: initialTargetWeight, duration, elapsed: 0, kind};
    }
    this.mixer.update(0);
    this.onChange();
  }

  select(index, immediate = false) {
    if (this.destroyed) throw new Error('Player has been destroyed.');
    if (!Number.isInteger(index) || index < 0 || index >= this.clips.length) throw new Error('Unknown motion.');
    this.manualIndex = index;
    this.oneShotPending = false;
    this.mode = index === this.continuousIndex ? 'idle' : 'manual';
    this.resetInterval();
    this.transitionTo(index, {immediate});
  }

  seek(seconds) {
    if (this.destroyed) throw new Error('Player has been destroyed.');
    if (!Number.isFinite(Number(seconds))) throw new Error('Invalid seek time.');
    const wasAutomaticTalk = this.mode === 'entering_talk' || this.mode === 'talking';
    const index = this.currentIndex;
    this.mixer.stopAllAction();
    this.blend = null;
    const time = Math.max(0, Math.min(Number(seconds), this.clips[index].duration));
    this.configureAction(index, {time, once: wasAutomaticTalk}).setEffectiveWeight(1);
    if (wasAutomaticTalk) this.mode = 'talking';
    else this.mode = index === this.continuousIndex ? 'idle' : 'manual';
    this.resetInterval();
    this.mixer.update(0);
    this.onChange();
  }

  isSafePhase(time) {
    const duration = this.clips[this.continuousIndex].duration;
    const phase = ((time % duration) + duration) % duration;
    return this.safeWindows.some(([start, end]) => phase >= start && phase < end);
  }

  beginTalk() {
    this.lastTriggerPhase = this.actions[this.continuousIndex].time;
    this.lastTriggerReason = this.oneShotPending ? 'requested' : 'random';
    this.oneShotPending = false;
    this.mode = 'entering_talk';
    this.talkCount++;
    this.transitionTo(this.talkIndex, {duration: this.enterFade, once: true, kind: 'entering_talk'});
  }

  beginReturn() {
    this.mode = 'returning_idle';
    this.transitionTo(this.continuousIndex, {time: this.returnPhase, duration: this.exitFade, kind: 'returning_idle'});
  }

  update(wallSeconds) {
    if (this.destroyed || !this.playing || !Number.isFinite(wallSeconds) || wallSeconds <= 0) return;
    let remainingStep = wallSeconds * this.speed;
    // Bounded steps keep safe-window detection and loop/finish boundaries correct for injected time.
    while (remainingStep > 1e-9) {
      const delta = Math.min(remainingStep, 1 / 30);
      remainingStep -= delta;
      this.activePlaybackSeconds += delta;
      this.beforeStep(delta);
      if (this.mode === 'idle' && !this.blend && this.manualIndex === this.continuousIndex) {
        if (this.randomEnabled && this.allowTalkClock()) this.remaining = Math.max(0, (this.remaining ?? this.nextInterval()) - delta);
        const due = this.oneShotPending || (this.randomEnabled && this.remaining <= 0);
        if (due && this.allowTalkStart() && this.isSafePhase(this.activeAction.time)) this.beginTalk();
      }
      if (this.mode === 'talking' && this.activeAction.time >= this.clips[this.talkIndex].duration - this.exitFade)
        this.beginReturn();
      let completedKind = null;
      if (this.blend) {
        const blend = this.blend;
        blend.elapsed = Math.min(blend.duration, blend.elapsed + delta);
        const weight = smootherstep(blend.elapsed / blend.duration);
        for (const item of blend.sources) item.action.setEffectiveWeight(item.weight * (1 - weight));
        blend.target.setEffectiveWeight(blend.targetStart + (1 - blend.targetStart) * weight);
        if (blend.elapsed >= blend.duration - 1e-9) completedKind = blend.kind;
      }
      this.mixer.update(delta);
      if (completedKind) {
        for (const item of this.blend.sources) item.action.stop();
        this.blend.target.setEffectiveWeight(1);
        this.blend = null;
        if (completedKind === 'entering_talk') this.mode = 'talking';
        if (completedKind === 'returning_idle') {this.mode = 'idle'; this.resetInterval();}
        this.onChange();
      }
      this.afterStep(delta);
    }
  }

  getState() {
    return {destroyed: this.destroyed, mode: this.mode, currentIndex: this.currentIndex, manualIndex: this.manualIndex,
      randomEnabled: this.randomEnabled, playing: this.playing, speed: this.speed,
      countdownSeconds: this.remaining, waitingForSafeWindow: this.mode === 'idle' && this.remaining === 0,
      activePlaybackSeconds: this.activePlaybackSeconds, talkCount: this.talkCount,
      lastTriggerPhase: this.lastTriggerPhase, lastTriggerReason: this.lastTriggerReason,
      oneShotPending: this.oneShotPending, canRequestOneShot: this.canRequestOneShot, returnPhase: this.returnPhase,
      time: this.activeAction.time, duration: this.clips[this.currentIndex].duration,
      blending: this.blend ? {kind: this.blend.kind, elapsed: this.blend.elapsed, duration: this.blend.duration} : null,
      weights: this.actions.map((action, index) => ({name: this.clips[index].name, time: action.time,
        scheduled: action.isScheduled(), weight: action.isScheduled() && action.enabled ? action.getEffectiveWeight() : 0})),
    };
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.playing = false;
    this.remaining = null;
    this.oneShotPending = false;
    this.blend = null;
    this.mixer.stopAllAction();
    this.onChange = () => {};
  }
}
