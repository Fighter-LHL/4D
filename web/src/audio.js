// Every sound follows a model event or its authoritative wave clock. No ambient loop and
// no deferred replay of events that occurred before the player's first gesture.
const MAX_VOICES = 24;
const NOTE = { D2: 73.42, D3: 146.83, A3: 220, B3: 246.94, D4: 293.66, E4: 329.63, Fs4: 369.99, A4: 440, B4: 493.88, D5: 587.33, E5: 659.25, Fs5: 739.99, A5: 880, B5: 987.77, D6: 1174.66 };
const PAN = { dew: -.6, bell: -.6, relay: -.25, bloom: .35, vault: .6, hub: 0, exit: -.12 };
// The same three sound colors recur on shifts, transfers and received power.
// A layer cue is orientation feedback, deliberately quieter than a reward.
const LAYER = [
  { note: NOTE.D4, kind: 'soft', slide: NOTE.A3, air: 700 },
  { note: NOTE.A4, kind: 'glass', slide: NOTE.E4, air: 1500 },
  { note: NOTE.E5, kind: 'glass', slide: NOTE.A5, air: 2600 },
];
const WARNING_BEATS = {
  single: [0, .26, .5, .71, .85, .94],
  chase: [0, .24, .44, .62, .77, .89, .96],
  lock: [0, .19, .36, .56, .72, .85, .94],
};

export class GameAudio {
  constructor() {
    this.enabled = true;
    this.context = null;
    this.master = null;
    this.compressor = null;
    this.noiseBuffer = null;
    this.voices = new Set();
    this.lastEvent = new Map();
    this.waveCue = null;
    this.paused = false;
    this.disposed = false;
  }

  // Called directly from a click/key handler. Browser autoplay restrictions are
  // never circumvented, and an unavailable/denied audio device is non-fatal.
  async unlock() {
    if (this.disposed || !this.enabled) return false;
    try {
      if (!this.context) {
        const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AudioContext) return false;
        const context = new AudioContext({ latencyHint: 'interactive' });
        this.context = context;
        this.master = context.createGain();
        this.master.gain.value = .65;
        this.compressor = context.createDynamicsCompressor();
        this.compressor.threshold.value = -18;
        this.compressor.knee.value = 18;
        this.compressor.ratio.value = 3;
        this.compressor.attack.value = .003;
        this.compressor.release.value = .18;
        this.master.connect(this.compressor);
        this.compressor.connect(context.destination);
        this.noiseBuffer = context.createBuffer(1, Math.ceil(context.sampleRate * .38), context.sampleRate);
        const samples = this.noiseBuffer.getChannelData(0);
        // A softly correlated noise bed sounds more like air/stone than hiss.
        let previous = 0;
        for (let i = 0; i < samples.length; i++) {
          previous = previous * .62 + (Math.random() * 2 - 1) * .38;
          samples[i] = previous;
        }
      }
      if (this.context.state === 'suspended' || this.context.state === 'interrupted') await this.context.resume();
      return !this.disposed && this.enabled && this.context?.state === 'running';
    } catch {
      // Some browsers expose AudioContext even when device creation is denied.
      return false;
    }
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) this._cancel();
    if (this.master && this.context?.state !== 'closed') {
      this.master.gain.cancelScheduledValues(this.context.currentTime);
      this.master.gain.setValueAtTime(this.enabled ? .65 : 0, this.context.currentTime);
    }
    // Enabling never creates or resumes a context. The UI calls unlock() in the
    // same user gesture so toggling remains compatible with autoplay policies.
  }

  handle(events = []) {
    if (this.disposed || !Array.isArray(events)) return;
    for (const event of events) {
      if (!event || typeof event.type !== 'string') continue;
      if (event.type === 'fail') this._cancel(['power']);
      if (['lose', 'restart', 'room'].includes(event.type)) this._cancel();
      if (['fail', 'lose', 'restart', 'room', 'dodge', 'evade', 'shield'].includes(event.type)) this.waveCue = null;
      if (['warning', 'dodge', 'evade', 'shield'].includes(event.type)) this._cancelGroup('warning');
      if (event.type === 'warning') this.waveCue = null;
      // Stop even a throttled old shift: it must never describe a layer the
      // player has already left. Transfers replace its light orientation cue.
      if (['layer_shift', 'phase_transfer'].includes(event.type)) this._cancelGroup('layer');
      if (this.paused || !this.enabled || this.context?.state !== 'running') continue;
      const now = this.context.currentTime;
      // Selection/movement can repeat under keyboard input; major consequences
      // are never silently dropped by this small input-sound throttle.
      const gap = event.type === 'select' ? .065 : ['move', 'layer_shift', 'phase_transfer'].includes(event.type) ? .08 : 0;
      if (gap && now - (this.lastEvent.get(event.type) ?? -Infinity) < gap) continue;
      this.lastEvent.set(event.type, now);
      const pan = PAN[event.to ?? event.node] ?? 0;
      const tier = Math.min(3, Math.max(1, Number(event.tier) || 1));
      const layer = LAYER[Math.min(2, Math.max(0, Math.round(Number(event.toLayer ?? event.layer) || 0)))];
      switch (event.type) {
        case 'layer_shift':
          this._tone(layer.note, now, .16, .035, pan, layer.kind, layer.slide, 'layer');
          break;
        case 'phase_transfer':
          this._tone(layer.note / 2, now, .24, .055, -pan, 'soft', layer.note, 'layer');
          this._tone(layer.note, now + .035, .27, .05, pan, layer.kind, null, 'layer');
          break;
        case 'power':
          // Only the authoritative arrival event makes this receiving ripple.
          this._tone(layer.note / 2, now, .24, .06, pan, 'soft', layer.note, 'power');
          this._tone(layer.note, now + .07, .37, .07, pan, layer.kind, null, 'power');
          this._air(now, .16, .035, pan, layer.air, 'power');
          break;
        case 'warning':
          // syncWave drives short beats from model time, never wall-clock time.
          break;
        case 'dodge':
          // Passing one wave is useful information, not a finished reward. Keep
          // this short enough for the next stage's first warning to stay clear.
          this._tone(layer.note / 2, now, .14, .045, pan, 'soft', layer.note, 'dodge');
          this._tone(layer.note, now + .025, .16, .03, -pan, 'glass', null, 'dodge');
          break;
        case 'evade':
          // The release of tension is unpitched. The separate reward event is
          // the only success melody, so a single escape never celebrates twice.
          this._air(now, .16, .065, pan, 2400);
          break;
        case 'select':
          this._tone(NOTE.D5, now, .08, .025, pan, 'soft');
          break;
        case 'move':
          this._tone(NOTE.D3, now, .19, .075, pan, 'soft', NOTE.A3);
          this._air(now, .12, .045, pan, 650);
          break;
        case 'risk':
          this._tone(NOTE.A3, now, .29, .075, pan, 'soft', NOTE.B3);
          this._tone(NOTE.E5, now + .055, .2, .04, -pan, 'glass');
          this._air(now, .23, .08, pan, 1550);
          break;
        case 'reward': {
          if (event.risky === false) {
            this._tone(NOTE.D5, now, .32, .065, pan, 'glass');
            this._tone(NOTE.A4, now + .055, .22, .035, -pan, 'soft');
            break;
          }
          this._riskReward(now, tier, pan, event.challenge === 'vault');
          break;
        }
        case 'activate':
          this._tone(NOTE.D3, now, .47, .12, pan, 'soft');
          this._arpeggio([NOTE.A4, NOTE.D5, NOTE.Fs5], now, .07, .085, pan);
          this._air(now, .18, .075, pan, 850);
          break;
        case 'chain': {
          const step = Math.max(0, Math.min(2, Number(event.step ?? event.index ?? ((event.tier ?? 1) - 1)) || 0));
          const note = [NOTE.Fs5, NOTE.A5, NOTE.D6][step];
          this._tone(note, now, .43, .075 + step * .012, pan, 'glass');
          this._tone(note / 2, now, .3, .04, pan, 'soft');
          break;
        }
        case 'unlock':
          this._tone(NOTE.D3, now, .9, .15, 0, 'soft');
          this._arpeggio([NOTE.D4, NOTE.A4, NOTE.D5, NOTE.Fs5, NOTE.A5, NOTE.D6], now, .075, .1, pan);
          this._air(now + .15, .32, .095, 0, 2200);
          break;
        case 'bank':
          // A compact cadence distinguishes securing currency from earning it.
          this._arpeggio([NOTE.A4, NOTE.Fs5, NOTE.D5], now, .09, .095, 0);
          this._tone(NOTE.D3, now + .18, .7, .13, 0, 'soft');
          this._tone(NOTE.A4, now + .18, .55, .055, -.18, 'soft');
          break;
        case 'fail':
          this._tone(NOTE.B3, now, .36, .12, pan, 'soft', NOTE.D3);
          this._air(now, .27, .11, pan, 430);
          break;
        case 'shield':
          // The lower failure cue can be followed by this soft protective ring.
          this._tone(NOTE.D4, now, .6, .11, 0, 'soft');
          this._arpeggio([NOTE.A4, NOTE.D5], now + .04, .08, .08, pan);
          this._air(now, .2, .06, 0, 900);
          break;
        case 'ability':
          if (event.relic === 'shadow') {
            this._tone(NOTE.A4, now, .45, .09, -.45, 'soft');
            this._tone(NOTE.A4, now + .1, .6, .07, .45, 'soft');
            this._tone(NOTE.D5, now + .15, .45, .05, 0, 'glass');
            this._air(now, .22, .065, 0, 1000);
            break;
          }
          this._tone(NOTE.D4, now, .38, .085, pan, 'soft', NOTE.A4);
          this._arpeggio([NOTE.E5, NOTE.A5, NOTE.D6], now + .06, .08, .075, pan);
          this._air(now, .25, .08, pan, 1900);
          break;
        case 'room':
          if (event.completed) {
            this._tone(NOTE.D2, now, .68, .11, 0, 'soft');
            this._arpeggio([NOTE.A4, NOTE.D5, NOTE.Fs5, NOTE.A5], now + .025, .065, .067, 0);
            this._cadence(now + .29, .82, .061, .36);
            this._air(now + .06, .23, .055, 0, 2100);
          } else {
            this._arpeggio([NOTE.D4, NOTE.A4, NOTE.D5], now, .12, .065, 0);
          }
          break;
        case 'win':
          this._cancel();
          this._tone(NOTE.D2, now, .8, .13, 0, 'soft', NOTE.D2 * .75);
          this._tone(NOTE.D3, now, 1.1, .09, 0, 'soft');
          this._arpeggio([NOTE.D4, NOTE.Fs4, NOTE.A4, NOTE.D5, NOTE.Fs5, NOTE.A5, NOTE.D6], now + .035, .08, .075, 0);
          this._cadence(now + .61, 1.2, .075, .55);
          this._tone(NOTE.D6, now + .65, .9, .033, 0, 'glass');
          this._air(now + .18, .34, .075, 0, 2700);
          break;
        case 'lose':
          this._tone(NOTE.D4, now, .7, .105, 0, 'soft', NOTE.D3);
          this._tone(NOTE.A3, now + .12, .65, .075, 0, 'soft', NOTE.D3 / 2);
          this._air(now, .31, .08, 0, 360);
          break;
        case 'restart':
          // Reset is silent; the next room/choice provides its own entry cue.
          break;
        default:
          break;
      }
    }
  }

  // Call once per rendered frame AFTER draining events, including while paused.
  // A blocked game drops all old tails/celebrations; resuming never replays them.
  // Only future thresholds on the model's remaining-time clock can make beats.
  syncWave(wave, blocked = false) {
    if (this.disposed) return;
    const wasPaused = this.paused;
    this.paused = Boolean(blocked);
    if (this.paused && !wasPaused) this._cancel();
    if (!wave || !(wave.remaining > 0) || !(wave.duration > 0)) {
      this._cancelGroup('warning');
      this.waveCue = null;
      return;
    }
    const duration = wave.duration;
    const elapsed = Math.max(0, Math.min(duration, duration - wave.remaining));
    const variant = Object.hasOwn(WARNING_BEATS, wave.variant) ? wave.variant : 'single';
    const step = Math.max(1, Math.round(Number(wave.step) || 1));
    const dangerLayers = [...new Set((Array.isArray(wave.dangerLayers) ? wave.dangerLayers : [wave.layer])
      .filter(layer => Number.isInteger(layer) && layer >= 0 && layer < LAYER.length))].sort();
    const safeLayers = Array.isArray(wave.safeLayers) ? [...new Set(wave.safeLayers)].sort().join(',') : '';
    const signature = `${variant}:${step}:${dangerLayers.join(',')}:${safeLayers}`;
    if (!this.waveCue || this.waveCue.node !== wave.node || this.waveCue.signature !== signature ||
        this.waveCue.duration !== duration || elapsed < this.waveCue.elapsed - 1e-6) {
      this._cancelGroup('warning');
      this.waveCue = { node: wave.node, signature, duration, elapsed, lastBeat: -1 };
    }
    this.waveCue.elapsed = elapsed;
    if (this.paused) return;
    const beat = WARNING_BEATS[variant].reduce((latest, fraction, index) => elapsed + 1e-9 >= duration * fraction ? index : latest, -1);
    if (beat <= this.waveCue.lastBeat) return;
    this.waveCue.lastBeat = beat;
    // If muted, unavailable, or first unlocked mid-wave, do not catch up old
    // beats later. A slow frame may cross several thresholds: sound only one.
    if (!this.enabled || this.context?.state !== 'running' || wave.remaining < .04) return;
    const now = this.context.currentTime;
    const pan = PAN[wave.node] ?? 0;
    this._cancelGroup('warning');
    const locked = dangerLayers.length > 1;
    const note = variant === 'chase' ? (step % 2 ? NOTE.E4 : NOTE.A4) : variant === 'lock' ? NOTE.B3 : NOTE.A3;
    const length = Math.min(.075, duration * .025, wave.remaining - .03);
    this._tone(note * (beat > 3 ? 2 : 1), now, length,
      (locked ? .052 : .065) + beat * .004, pan, variant === 'chase' ? 'glass' : 'soft', null, 'warning');
    // A close paired pulse marks two simultaneously dangerous layers. It starts
    // on this frame too: audio never predicts a warning beyond the model clock.
    if (locked) this._tone(note * 1.05946, now, length, .027, -pan, 'soft', null, 'warning');
    if (beat === 0) this._air(now, Math.min(.16, duration * .1, wave.remaining - .02), .04, pan,
      variant === 'chase' ? 1800 : locked ? 550 : 1100, 'warning');
  }

  _riskReward(at, tier, pan, vault) {
    // A clear attack, ascending travel and a resolved chord make success feel
    // larger without raising the master gain. More tiers add range and space;
    // the individual notes get quieter as their count grows.
    this._cancelGroup('reward');
    const notes = tier === 1 ? [NOTE.D4, NOTE.A4, NOTE.D5] : tier === 2
      ? [NOTE.D4, NOTE.A4, NOTE.D5, NOTE.Fs5, NOTE.A5]
      : [NOTE.D4, NOTE.Fs4, NOTE.A4, NOTE.D5, NOTE.Fs5, NOTE.A5, NOTE.D6];
    const spacing = [.055, .047, .038][tier - 1];
    const settle = at + .065 + spacing * notes.length;
    this._tone(NOTE.D3, at, .2, .115, 0, 'soft', NOTE.D2, 'reward');
    this._arpeggio(notes, at + .025, spacing, .077 - tier * .005, pan, 'reward');
    this._cadence(settle, .48 + tier * .14 + (vault ? .12 : 0), .052, .18 + tier * .12, 'reward');
    if (tier > 1 || vault) this._air(at + .035, .17, .047, -pan, 2600 + tier * 220, 'reward');
  }

  _cadence(at, duration, volume, spread, group = null) {
    this._tone(NOTE.D4, at, duration, volume, -spread, 'soft', null, group);
    this._tone(NOTE.Fs4, at, duration * .85, volume * .65, spread, 'soft', null, group);
    this._tone(NOTE.A4, at, duration * .94, volume * .75, spread * .4, 'soft', null, group);
  }

  _arpeggio(notes, at, spacing, volume, pan, group = null) {
    notes.forEach((note, index) => {
      const spread = Math.max(-.75, Math.min(.75, pan + (index / Math.max(1, notes.length - 1) - .5) * .32));
      this._tone(note, at + spacing * index, .5 + index * .045, volume, spread, 'glass', null, group);
    });
  }

  _tone(frequency, at, duration, volume, pan, kind = 'glass', slide = null, group = null) {
    const context = this.context;
    if (!this.enabled || !context || context.state !== 'running') return;
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(volume, at + (kind === 'soft' ? .018 : .006));
    envelope.gain.exponentialRampToValueAtTime(.0001, at + duration);
    const output = this._connect(envelope, pan);
    const fundamental = context.createOscillator();
    fundamental.type = 'sine';
    fundamental.frequency.setValueAtTime(frequency * (kind === 'glass' ? 1.008 : 1), at);
    fundamental.frequency.exponentialRampToValueAtTime(slide || frequency, at + (slide ? duration * .82 : .055));
    fundamental.connect(envelope);
    const overtone = context.createOscillator();
    const color = context.createGain();
    color.gain.value = kind === 'soft' ? .11 : .21;
    overtone.type = kind === 'soft' ? 'triangle' : 'sine';
    overtone.frequency.setValueAtTime(frequency * (kind === 'soft' ? 1 : 2.002), at);
    if (slide) overtone.frequency.exponentialRampToValueAtTime(slide * (kind === 'soft' ? 1 : 2.002), at + duration * .82);
    overtone.connect(color);
    color.connect(envelope);
    this._register([fundamental, overtone], [envelope, output, color], at, at + duration + .025, group);
  }

  _air(at, duration, volume, pan, center, group = null) {
    const context = this.context;
    if (!this.enabled || !context || !this.noiseBuffer || context.state !== 'running') return;
    const source = context.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(center, at);
    filter.Q.value = .65;
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(volume, at + .012);
    envelope.gain.exponentialRampToValueAtTime(.0001, at + duration);
    source.connect(filter);
    filter.connect(envelope);
    const output = this._connect(envelope, pan);
    this._register([source], [filter, envelope, output], at, at + duration + .01, group);
  }

  _connect(envelope, pan) {
    if (this.context.createStereoPanner) {
      const panner = this.context.createStereoPanner();
      panner.pan.value = pan;
      envelope.connect(panner);
      panner.connect(this.master);
      return panner;
    }
    envelope.connect(this.master);
    return null;
  }

  _register(sources, nodes, start, end, group = null) {
    // Future-scheduled notes count toward the same limit as sounding notes.
    // No timeout/interval can survive cancellation, because none are created.
    for (const voice of this.voices) if (voice.end <= this.context.currentTime) this._stop(voice);
    while (this.voices.size >= MAX_VOICES) this._stop(this.voices.values().next().value);
    const voice = { sources, nodes: nodes.filter(Boolean), start, end, group };
    this.voices.add(voice);
    sources[0].onended = () => this._release(voice);
    for (const source of sources) {
      source.start(start);
      source.stop(end);
    }
  }

  _release(voice) {
    if (!this.voices.delete(voice)) return;
    for (const source of voice.sources) {
      source.onended = null;
      try { source.disconnect(); } catch { /* Already detached by device close. */ }
    }
    for (const node of voice.nodes) {
      try { node.disconnect(); } catch { /* Already detached by device close. */ }
    }
  }

  _stop(voice) {
    if (!voice) return;
    for (const source of voice.sources) {
      try { source.stop(); } catch { /* A scheduled source may already have ended. */ }
    }
    this._release(voice);
  }

  _cancel(preserveGroups = []) {
    for (const voice of [...this.voices]) if (!preserveGroups.includes(voice.group)) this._stop(voice);
    this.lastEvent.clear();
  }

  _cancelGroup(group) {
    for (const voice of [...this.voices]) if (voice.group === group) this._stop(voice);
  }

  dispose() {
    this.disposed = true;
    this._cancel();
    try { this.master?.disconnect(); } catch { /* Already disconnected. */ }
    try { this.compressor?.disconnect(); } catch { /* Already disconnected. */ }
    const context = this.context;
    this.context = null;
    this.master = null;
    this.compressor = null;
    this.noiseBuffer = null;
    if (context && context.state !== 'closed') {
      try { const closed = context.close(); closed?.catch?.(() => {}); } catch { /* Device already closed. */ }
    }
  }
}
