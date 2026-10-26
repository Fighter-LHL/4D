// Short synthesized cues driven by model events; no background loop.
// The slice tone maps height to pitch so S can be heard as well as seen.
const ROLE_NOTE = { visitor: 659.25, wall: 293.66, goal: 880 };

export class FlatlandAudio {
  constructor() { this.enabled = true; this.context = null; this.master = null; this.lastSlice = 0; this.peekWanted = false; this.peekVoice = null; this.voices = new Set(); }

  async unlock() {
    if (!this.enabled) return false;
    try {
      if (!this.context) {
        const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AudioContext) return false;
        this.context = new AudioContext({ latencyHint: 'interactive' });
        this.master = this.context.createGain();
        this.master.gain.value = .6;
        this.master.connect(this.context.destination);
      }
      if (this.context.state !== 'running') await this.context.resume();
      if (this.peekWanted) this._startPeek();
      return this.context.state === 'running';
    } catch { return false; }
  }
  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (this.master) this.master.gain.setValueAtTime(this.enabled ? .6 : 0, this.context.currentTime);
    if (!this.enabled) this._stopPeek(); else if (this.peekWanted) this._startPeek();
  }
  dispose() { this.peekWanted = false; this._stopPeek(); this._stopTones(); void this.context?.close?.(); this.context = null; this.master = null; }

  _stopTones() {
    for (const { osc, amp } of this.voices) { amp.gain.cancelScheduledValues(this.context.currentTime); amp.gain.setValueAtTime(0, this.context.currentTime); osc.stop(this.context.currentTime); }
    this.voices.clear();
  }

  _startPeek() {
    if (this.peekVoice || !this.enabled || this.context?.state !== 'running') return;
    const osc = this.context.createOscillator(), amp = this.context.createGain(), now = this.context.currentTime;
    osc.type = 'sine'; osc.frequency.setValueAtTime(82.4, now);
    amp.gain.setValueAtTime(0, now); amp.gain.linearRampToValueAtTime(.045, now + .12);
    osc.connect(amp).connect(this.master); osc.onended = () => { osc.disconnect(); amp.disconnect(); }; osc.start(now);
    this.peekVoice = { osc, amp };
  }
  _stopPeek() {
    if (!this.peekVoice) return;
    const { osc, amp } = this.peekVoice, now = this.context.currentTime;
    amp.gain.cancelScheduledValues(now); amp.gain.setValueAtTime(amp.gain.value, now); amp.gain.linearRampToValueAtTime(0, now + .05);
    osc.stop(now + .06); this.peekVoice = null;
  }

  _tone(freq, { type = 'sine', at = 0, duration = .25, gain = .1, slide = null } = {}) {
    if (!this.enabled || this.context?.state !== 'running') return;
    const ctx = this.context, start = ctx.currentTime + at, osc = ctx.createOscillator(), amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (slide) osc.frequency.exponentialRampToValueAtTime(slide, start + duration);
    amp.gain.setValueAtTime(0, start);
    amp.gain.linearRampToValueAtTime(gain, start + .012);
    amp.gain.exponentialRampToValueAtTime(.0001, start + duration);
    osc.connect(amp).connect(this.master);
    const voice = { osc, amp }; this.voices.add(voice);
    osc.onended = () => { this.voices.delete(voice); osc.disconnect(); amp.disconnect(); };
    osc.start(start); osc.stop(start + duration + .02);
  }

  // Height maps to pitch; when a target exists, closeness brightens the tick
  // so the player can hear "warmer / colder" while scrubbing.
  slice(s, max, closeness = null) {
    const now = performance.now();
    if (now - this.lastSlice < 70) return;
    this.lastSlice = now;
    if (closeness === null) this._tone(196 * 2 ** (s / max * 2), { duration: .09, gain: .03 });
    else this._tone(220 * 2 ** (closeness * 2), { type: closeness > .9 ? 'triangle' : 'sine', duration: .1, gain: .025 + closeness * .03 });
  }

  handle(events) {
    for (const event of events) {
      if (['pause', 'load'].includes(event.type)) this._stopTones();
      if (event.type === 'peek_start') { this.peekWanted = true; this._startPeek(); }
      if (['peek_end', 'guard_alert', 'complete', 'load', 'death', 'hurt', 'pause'].includes(event.type)) { this.peekWanted = false; this._stopPeek(); }
      if (event.type === 'graze') [880, 1320].forEach((note, i) => this._tone(note, { type: 'triangle', at: i * .055, duration: .18, gain: .045 }));
      if (event.type === 'friend_hop') [659, 988].forEach((note, i) => this._tone(note, { at: i * .08, duration: .16, gain: .05, slide: note * 1.15 }));
      if (event.type === 'friend_wake') this._tone(220, { duration: .65, gain: .045, slide: 660 });
      if (event.type === 'visitor_poke') this._tone(180, { type: 'triangle', duration: .35, gain: .07, slide: 620 });
      if (event.type === 'friend_found') [523, 659, 784, 1047].forEach((note, i) => this._tone(note, { type: 'triangle', at: i * .09, duration: .4, gain: .06 }));
      if (event.type === 'friend_play') {
        const note = event.id === 'sprout' ? 660 : event.id === 'lantern' ? 440 : 880;
        [1, 1.25, 1.5].forEach((ratio, i) => this._tone(note * ratio, { at: i * .1, duration: .15, gain: .04 }));
      }
      if (event.type === 'explore_clear') [392, 587].forEach((note, i) => this._tone(note, { at: i * .12, duration: .35, gain: .04 }));
      if (event.type === 'shard') {
        const base = 880 * 2 ** (Math.min(event.combo - 1, 8) / 12 * 2);
        (event.golden ? [1, 1.25, 1.5, 2] : [1, 1.5]).forEach((ratio, i) => this._tone(base * ratio, { type: 'triangle', at: i * .05, duration: .22, gain: .06 }));
      }
      if (event.type === 'score' && event.kind === 'time') [659.25, 880].forEach((note, i) => this._tone(note, { at: .3 + i * .08, duration: .2, gain: .04 }));
      if (event.type === 'ring_spawn' || event.type === 'lock_spawn') this._tone(330, { duration: .25, gain: .04, slide: 495 });
      if (event.type === 'ring_hit') {
        const lift = 2 ** (Math.min(event.combo - 1, 6) / 12 * 2);
        [523.25, 659.25, 783.99].forEach((note, i) => this._tone(note * lift, { type: 'triangle', at: i * .045, duration: .4, gain: .065 }));
      }
      if (event.type === 'ring_miss') this._tone(196, { type: 'triangle', duration: .3, gain: .08, slide: 130 });
      if (event.type === 'lock_open') [392, 523.25, 659.25, 1046.5].forEach((note, i) => this._tone(note, { type: 'triangle', at: i * .06, duration: .4, gain: .065 }));
      if (event.type === 'reveal') this._tone(146.83, { duration: .5, gain: .06, slide: 220 });
      if (event.type === 'death' || event.type === 'hurt') { this._tone(330, { type: 'sawtooth', duration: .35, gain: .07, slide: 70 }); this._tone(98, { type: 'triangle', duration: .4, gain: .14, slide: 49 }); }
      if (event.type === 'respawn') this._tone(392, { duration: .18, gain: .04, slide: 587.33 });
      if (event.type === 'combo_break') this._tone(440, { duration: .2, gain: .03, slide: 330 });
      if (event.type === 'storm_level') [440, 554.37, 440, 554.37].forEach((note, i) => this._tone(note, { type: 'square', at: i * .12, duration: .1, gain: .025 }));
      if (event.type === 'guard_alert') [220, 164.81].forEach((note, i) => this._tone(note, { type: 'triangle', at: i * .1, duration: .18, gain: .1 }));
      if (event.type === 'key_rotate') this._tone(392, { duration: .12, gain: .04 });
      if (event.type === 'dimension_start') [293.66, 440, 587.33].forEach((note, i) => this._tone(note, { at: i * .13, duration: .8, gain: .06 }));
      if (event.type === 'dimension_ready') [440, 659.25, 880].forEach((note, i) => this._tone(note, { at: i * .08, duration: .7, gain: .06 }));
      if (event.type === 'dimension_escape') this._tone(880, { duration: .4, gain: .06 });
      if (event.type === 'lock_reject') this._tone(147, { type: 'triangle', duration: .23, gain: .09, slide: 110 });
      if (event.type === 'flip_start') {
        this._tone(196, { type: 'sine', duration: .7, gain: .07, slide: 587.33 });
        this._tone(293.66, { type: 'triangle', duration: .7, gain: .025, slide: 880 });
      }
      if (event.type === 'flip_end') [440, 659.25, 880].forEach((note, i) => this._tone(note, { at: i * .07, duration: .35, gain: .06 }));
      if (event.type === 'pickup' || event.type === 'unlock') [523.25, 783.99, 1046.5].forEach((note, i) => this._tone(note, { at: i * .07, duration: .25, gain: .065 }));
      if (event.type === 'section_enter' && ROLE_NOTE[event.role]) this._tone(ROLE_NOTE[event.role], { type: 'triangle', duration: .3, gain: .05, slide: ROLE_NOTE[event.role] * 1.5 });
      if (event.type === 'section_exit' && ROLE_NOTE[event.role]) this._tone(ROLE_NOTE[event.role] * .75, { type: 'triangle', duration: .22, gain: .035, slide: ROLE_NOTE[event.role] * .5 });
      if (event.type === 'blocked') { this._tone(110, { type: 'triangle', duration: .24, gain: .2, slide: 55 }); this._tone(82, { duration: .3, gain: .1 }); }
      if (event.type === 'goal_done') [587.33, 739.99, 880].forEach((note, i) => this._tone(note, { type: 'triangle', at: i * .06, duration: .5, gain: .07 }));
      if (event.type === 'hint') this._tone(1174.66, { duration: .18, gain: .025 });
      if (event.type === 'complete') (event.cleared ? [293.66, 440, 587.33, 739.99, 880, 1174.66] : [392, 349.23, 293.66]).forEach((note, i) => this._tone(note, { type: 'triangle', at: i * .09, duration: .9, gain: .06 }));
    }
  }
}
