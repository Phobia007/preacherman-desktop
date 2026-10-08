import {smootherstep} from './idle-talk-player.mjs';

export class HeadGestureLayer {
  constructor({THREE, mixer, player, sourceClips, referenceClip, allowedNodeNames,
    labels = {}, random = Math.random, neutralIndex = 1, eligibleIndices = [player.continuousIndex, neutralIndex], minimumDelay = 18, maximumDelay = 35,
    playbackRate = .55, minimumDuration = 2, enterFade = 1, exitFade = 1, quietSeconds = 8, onChange = () => {}}) {
    if (![playbackRate, minimumDuration, enterFade, exitFade].every(value => Number.isFinite(value) && value > 0) || playbackRate > 1)
      throw new Error('Invalid gesture playback timing.');
    if (![minimumDelay, maximumDelay, quietSeconds].every(value => Number.isFinite(value) && value >= 0) || maximumDelay < minimumDelay)
      throw new Error('Invalid gesture random interval.');
    this.playbackRate = playbackRate; this.minimumDuration = minimumDuration;
    this.THREE = THREE; this.mixer = mixer; this.player = player; this.random = random;
    this.neutralIndex = neutralIndex; this.eligibleIndices = [...new Set(eligibleIndices)]; this.minimumDelay = minimumDelay; this.maximumDelay = maximumDelay;
    this.enterFade = enterFade; this.exitFade = exitFade; this.quietSeconds = quietSeconds; this.onChange = onChange;
    this.enabled = true; this.destroyed = false; this.active = null; this.pending = null;
    this.cooldown = 0; this.lastName = null; this.count = 0; this.lastReason = null; this.previousTalkBusy = false;
    const allowed = new Set(allowedNodeNames);
    this.gestures = sourceClips.map(source => {
      const clip = source.clone();
      clip.name = `${source.name}.runtime_additive`;
      clip.tracks = clip.tracks.filter(track => {
        const binding = THREE.PropertyBinding.parseTrackName(track.name);
        return binding.propertyName === 'quaternion' && allowed.has(binding.nodeName);
      });
      if (clip.tracks.length !== 3) throw new Error(`Gesture needs exactly three head/neck rotation tracks: ${source.name}`);
      if (!(clip.duration > 0)) throw new Error(`Gesture has no duration: ${source.name}`);
      for (const track of clip.tracks) if (!referenceClip.tracks.some(reference => reference.name === track.name && reference.ValueTypeName === 'quaternion'))
        throw new Error(`Neutral reference track missing: ${track.name}`);
      THREE.AnimationUtils.makeClipAdditive(clip, 0, referenceClip, 60);
      const timeScale = Math.min(playbackRate, source.duration / minimumDuration);
      return {name: source.name, label: labels[source.name] || source.name.replace(/^kitana\.gesture\./, '').replace(/\.v\d+$/, '').replaceAll('_', ' '),
        source, clip, action: mixer.clipAction(clip), sourceDuration: source.duration, timeScale, duration: source.duration / timeScale};
    });
    if (!this.gestures.length) throw new Error('No imported gesture clips found.');
    this.remaining = this.nextInterval();
    player.beforeStep = delta => this.beforeStep(delta);
    player.afterStep = () => this.afterStep();
    player.allowTalkClock = () => !this.active;
    player.allowTalkStart = () => !this.active && this.cooldown <= 1e-9;
  }

  nextInterval() {return this.minimumDelay + (this.maximumDelay - this.minimumDelay) * this.random();}
  get talkBusy() {return ['entering_talk', 'talking', 'returning_idle'].includes(this.player.mode);}
  get eligible() {return this.eligibleIndices.includes(this.player.manualIndex) && !this.talkBusy;}
  get canRequest() {return !this.destroyed && this.eligible && !this.active && this.pending === null;}
  get activeAction() {return this.active?.gesture.action;}
  // Public/UI time and seek values are playback seconds; the Three action uses source seconds.
  get activeTime() {return this.active ? this.active.gesture.action.time / this.active.gesture.timeScale : null;}
  get activeDuration() {return this.active?.gesture.duration ?? null;}

  setEnabled(enabled) {this.enabled = Boolean(enabled); if (!this.active) this.remaining = this.nextInterval(); this.onChange();}
  setRandomSource(random) {this.random = random; if (!this.active) this.remaining = this.nextInterval();}
  request(name = 'random') {
    if (!this.canRequest) return false;
    if (name !== 'random' && !this.gestures.some(gesture => gesture.name === name)) throw new Error('Unknown imported gesture.');
    this.pending = name; this.onChange(); return true;
  }
  safeStart() {
    return this.eligibleIndices.includes(this.player.manualIndex);
  }
  pick(name) {
    if (name && name !== 'random') return this.gestures.find(gesture => gesture.name === name);
    const choices = this.gestures.length > 1 ? this.gestures.filter(gesture => gesture.name !== this.lastName) : this.gestures;
    return choices[Math.min(choices.length - 1, Math.floor(this.random() * choices.length))];
  }
  envelope(time, duration) {
    return smootherstep(time / Math.min(this.enterFade, duration / 3)) *
      smootherstep((duration - time) / Math.min(this.exitFade, duration / 3));
  }
  start() {
    const gesture = this.pick(this.pending);
    this.lastReason = this.pending !== null ? 'requested' : 'random';
    this.pending = null; this.lastName = gesture.name; this.count++;
    gesture.action.reset().setLoop(this.THREE.LoopOnce, 1).setEffectiveTimeScale(gesture.timeScale).setEffectiveWeight(0).play();
    gesture.action.clampWhenFinished = true;
    this.active = {gesture, startBaseIndex: this.player.manualIndex, startBasePhase: this.player.activeAction.time};
    this.onChange();
  }
  finish() {
    this.active.gesture.action.setEffectiveWeight(0).stop();
    this.active = null; this.cooldown = this.quietSeconds; this.remaining = this.nextInterval(); this.onChange();
  }
  beforeStep(delta) {
    if (this.destroyed) return;
    if (this.active) {
      if (this.talkBusy) throw new Error('Talk and head gesture overlap.');
      const {gesture} = this.active;
      gesture.action.setEffectiveWeight(this.envelope(Math.min(gesture.duration, gesture.action.time / gesture.timeScale + delta), gesture.duration));
      return;
    }
    if (!this.eligible || this.talkBusy || this.player.blend) return;
    this.cooldown = Math.max(0, this.cooldown - delta);
    if (this.enabled) this.remaining = Math.max(0, this.remaining - delta);
    const talkDue = this.player.manualIndex === this.player.continuousIndex &&
      (this.player.oneShotPending || (this.player.randomEnabled && this.player.remaining !== null && this.player.remaining <= delta));
    const gestureDue = this.pending !== null || (this.enabled && this.remaining <= 0);
    if (gestureDue && !talkDue && this.cooldown <= 1e-9 && this.safeStart()) {
      this.start();
      this.active.gesture.action.setEffectiveWeight(this.envelope(delta, this.active.gesture.duration));
    }
  }
  afterStep() {
    if (this.destroyed) return;
    if (this.active && this.active.gesture.action.time >= this.active.gesture.sourceDuration - 1e-9) this.finish();
    const busy = this.talkBusy;
    if (this.previousTalkBusy && !busy) {this.cooldown = this.quietSeconds; this.onChange();}
    this.previousTalkBusy = busy;
  }
  seek(seconds) {
    if (!this.active || !Number.isFinite(Number(seconds))) return false;
    const {gesture} = this.active;
    gesture.action.paused = false;
    const displayedTime = Math.max(0, Math.min(Number(seconds), gesture.duration));
    gesture.action.time = Math.min(gesture.sourceDuration, displayedTime * gesture.timeScale);
    gesture.action.setEffectiveTimeScale(gesture.timeScale);
    gesture.action.setEffectiveWeight(this.envelope(displayedTime, gesture.duration));
    this.mixer.update(0);
    if (displayedTime >= gesture.duration) this.finish();
    else this.onChange();
    return true;
  }
  cancelForManualSelection() {
    if (this.active) this.active.gesture.action.setEffectiveWeight(0).stop();
    this.active = null; this.pending = null; this.cooldown = 0; this.previousTalkBusy = false;
    this.remaining = this.nextInterval(); this.onChange();
  }
  resetForBaseSeek() {this.pending = null; this.remaining = this.nextInterval();}
  getState() {
    return {enabled: this.enabled, destroyed: this.destroyed, countdownSeconds: this.remaining,
      cooldownSeconds: this.cooldown, active: this.active ? {name: this.active.gesture.name, label: this.active.gesture.label,
        time: this.activeTime, duration: this.activeDuration, sourceTime: this.active.gesture.action.time, sourceDuration: this.active.gesture.sourceDuration, timeScale: this.active.gesture.timeScale, weight: this.active.gesture.action.getEffectiveWeight(),
        baseIndex: this.active.startBaseIndex, startBasePhase: this.active.startBasePhase} : null,
      pending: this.pending, lastName: this.lastName, lastReason: this.lastReason, count: this.count, canRequest: this.canRequest,
      gestures: this.gestures.map(gesture => ({name: gesture.name, label: gesture.label, duration: gesture.duration, sourceDuration: gesture.sourceDuration, timeScale: gesture.timeScale, trackNames: gesture.clip.tracks.map(track => track.name)}))};
  }
  destroy() {
    if (this.destroyed) return;
    if (this.active) this.active.gesture.action.setEffectiveWeight(0).stop();
    this.active = null; this.pending = null; this.destroyed = true; this.onChange = () => {};
    this.player.beforeStep = () => {};
    this.player.afterStep = () => {};
    this.player.allowTalkClock = () => true;
    this.player.allowTalkStart = () => true;
  }
}
