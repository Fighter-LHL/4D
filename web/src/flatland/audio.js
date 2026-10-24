// Short synthesized cues driven by model events; no background loop.
// The slice tone maps height to pitch so S can be heard as well as seen.
const ROLE_NOTE = { visitor: 659.25, wall: 293.66, goal: 880 };

export class FlatlandAudio {
  constructor() { this.enabled = true; this.context = null; this.master = null; this.lastSlice = 0; this.peekWanted = false; this.peekVoice = null; }

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
  dispose() { this.peekWanted = false; this._stopPeek(); void this.context?.close?.(); this.context = null; this.master = null; }

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
    osc.start(start); osc.stop(start + duration + .02);
  }

  slice(s, max) {
    const now = performance.now();
    if (now - this.lastSlice < 70) return;
    this.lastSlice = now;
    this._tone(196 * 2 ** (s / max * 2), { duration: .09, gain: .03 });
  }

  handle(events) {
    for (const event of events) {
      if (event.type === 'peek_start') { this.peekWanted = true; this._startPeek(); }
      if (['peek_end', 'guard_alert', 'complete', 'load'].includes(event.type)) { this.peekWanted = false; this._stopPeek(); }
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
      if (event.type === 'section_enter') this._tone(ROLE_NOTE[event.role] || 440, { type: 'triangle', duration: .3, gain: .07, slide: (ROLE_NOTE[event.role] || 440) * 1.5 });
      if (event.type === 'section_exit') this._tone((ROLE_NOTE[event.role] || 440) * .75, { type: 'triangle', duration: .22, gain: .045, slide: (ROLE_NOTE[event.role] || 440) * .5 });
      if (event.type === 'blocked') { this._tone(110, { type: 'triangle', duration: .24, gain: .22, slide: 55 }); this._tone(82, { duration: .3, gain: .12 }); }
      if (event.type === 'goal_done' || event.type === 'goal_side') [587.33, 739.99, 880].forEach((note, i) => this._tone(note, { type: 'triangle', at: i * .06, duration: .5, gain: .07 }));
      if (event.type === 'quiz_answer') (event.correct ? [659.25, 987.77] : [392, 329.63]).forEach((note, i) => this._tone(note, { at: i * .12, duration: .3, gain: .08 }));
      if (event.type === 'observation') this._tone(523.25, { duration: .16, gain: .05 });
      if (event.type === 'round_verified') [523.25, 659.25, 783.99].forEach((note, i) => this._tone(note, { at: i * .06, duration: .3, gain: .05 }));
      if (event.type === 'hint') this._tone(1174.66, { duration: .18, gain: .03 });
      if (event.type === 'complete') [293.66, 440, 587.33, 739.99, 880, 1174.66].forEach((note, i) => this._tone(note, { type: 'triangle', at: i * .09, duration: .9, gain: .06 }));
    }
  }
}
