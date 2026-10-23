// Every sound follows a model event. There is deliberately no ambient loop and
// no deferred replay of events that occurred before the player's first gesture.
const MAX_VOICES = 24;
const NOTE = { D3: 146.83, A3: 220, B3: 246.94, D4: 293.66, E4: 329.63, Fs4: 369.99, A4: 440, B4: 493.88, D5: 587.33, E5: 659.25, Fs5: 739.99, A5: 880, B5: 987.77, D6: 1174.66 };
const PAN = { dew: -.6, bell: .55, bloom: .35, hub: 0, exit: -.12 };

export class GameAudio {
  constructor() {
    this.enabled = true;
    this.context = null;
    this.master = null;
    this.compressor = null;
    this.noiseBuffer = null;
    this.voices = new Set();
    this.lastEvent = new Map();
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
      if (['fail', 'lose', 'restart', 'room'].includes(event.type)) this._cancel();
      if (!this.enabled || this.context?.state !== 'running') continue;
      const now = this.context.currentTime;
      // Selection/movement can repeat under keyboard input; major consequences
      // are never silently dropped by this small input-sound throttle.
      const gap = event.type === 'select' ? .065 : event.type === 'move' ? .08 : 0;
      if (gap && now - (this.lastEvent.get(event.type) ?? -Infinity) < gap) continue;
      this.lastEvent.set(event.type, now);
      const pan = PAN[event.to ?? event.node] ?? 0;
      const tier = Math.min(3, Math.max(1, Number(event.tier) || 1));
      switch (event.type) {
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
          const notes = tier === 3 ? [NOTE.D5, NOTE.Fs5, NOTE.A5, NOTE.D6] : tier === 2 ? [NOTE.D5, NOTE.Fs5, NOTE.A5] : [NOTE.D5, NOTE.A5];
          this._arpeggio(notes, now, tier === 1 ? .09 : .065, .1, pan);
          this._tone(tier === 3 ? NOTE.D3 : NOTE.D4, now, .55, .1, 0, 'soft');
          if (tier > 1) this._air(now + .08, .2, .055, -pan, 3200);
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
          this._arpeggio([NOTE.D4, NOTE.A4, NOTE.D5], now, .12, .065, 0);
          break;
        case 'win':
          this._cancel();
          this._tone(NOTE.D3, now, 1.4, .17, 0, 'soft');
          this._arpeggio([NOTE.D4, NOTE.Fs4, NOTE.A4, NOTE.D5, NOTE.Fs5, NOTE.A5, NOTE.D6], now + .035, .105, .115, 0);
          this._tone(NOTE.D5, now + .74, 1.1, .09, -.25, 'soft');
          this._tone(NOTE.A5, now + .74, 1.1, .07, .25, 'soft');
          this._air(now + .3, .34, .1, 0, 2700);
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

  _arpeggio(notes, at, spacing, volume, pan) {
    notes.forEach((note, index) => {
      const spread = Math.max(-.75, Math.min(.75, pan + (index / Math.max(1, notes.length - 1) - .5) * .32));
      this._tone(note, at + spacing * index, .5 + index * .045, volume, spread, 'glass');
    });
  }

  _tone(frequency, at, duration, volume, pan, kind = 'glass', slide = null) {
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
    this._register([fundamental, overtone], [envelope, output, color], at, at + duration + .025);
  }

  _air(at, duration, volume, pan, center) {
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
    this._register([source], [filter, envelope, output], at, at + duration + .01);
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

  _register(sources, nodes, start, end) {
    // Future-scheduled notes count toward the same limit as sounding notes.
    // No timeout/interval can survive cancellation, because none are created.
    for (const voice of this.voices) if (voice.end <= this.context.currentTime) this._stop(voice);
    while (this.voices.size >= MAX_VOICES) this._stop(this.voices.values().next().value);
    const voice = { sources, nodes: nodes.filter(Boolean), start, end };
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

  _cancel() {
    for (const voice of [...this.voices]) this._stop(voice);
    this.lastEvent.clear();
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
