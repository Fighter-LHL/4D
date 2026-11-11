import test from 'node:test';
import assert from 'node:assert/strict';
import { GameAudio } from '../src/audio.js';

// Same lightweight WebAudio boundary as audio.test.js: lifecycle, not synthesis.
class Param {
  value = 0;
  setValueAtTime(value) { this.value = value; }
  linearRampToValueAtTime(value) { this.value = value; }
  exponentialRampToValueAtTime(value) { assert.ok(value > 0); this.value = value; }
  cancelScheduledValues() {}
}

class AudioNode {
  constructor(context) {
    this.context = context;
    for (const key of ['gain', 'frequency', 'Q', 'pan', 'threshold', 'knee', 'ratio', 'attack', 'release']) this[key] = new Param();
  }
  connect() {}
  disconnect() { this.disconnected = true; }
  start(at) { this.startAt = at; }
  stop(at = this.context.currentTime) { this.stopAt = at; }
}

function installAudio(t, unavailable = false) {
  const originals = ['AudioContext', 'webkitAudioContext'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  const contexts = [];
  class Context {
    currentTime = 2;
    sampleRate = 8000;
    state = 'suspended';
    sources = [];
    destination = new AudioNode(this);
    constructor() { contexts.push(this); }
    createGain() { return new AudioNode(this); }
    createDynamicsCompressor() { return new AudioNode(this); }
    createBiquadFilter() { return new AudioNode(this); }
    createStereoPanner() { return new AudioNode(this); }
    createBuffer(channels, length) { return { getChannelData: () => new Float32Array(length) }; }
    createOscillator() { const source = new AudioNode(this); this.sources.push(source); return source; }
    createBufferSource() { return this.createOscillator(); }
    async resume() { this.state = 'running'; }
    async close() { this.state = 'closed'; }
  }
  Object.defineProperty(globalThis, 'AudioContext', { configurable: true, writable: true, value: unavailable ? undefined : Context });
  Object.defineProperty(globalThis, 'webkitAudioContext', { configurable: true, writable: true, value: undefined });
  t.after(() => {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  return contexts;
}

const ambientSources = audio => audio.ambient?.sources || [];
const dead = source => source.disconnected && source.stopAt <= source.context.currentTime;

test('unlock stays silent; first syncAmbient builds the bed without spending voices', async t => {
  const contexts = installAudio(t);
  const audio = new GameAudio();
  t.after(() => audio.dispose());
  audio.syncAmbient({ progress: 3, w: .8 });
  assert.equal(audio.ambient, null, 'no graph before an unlocked running context');
  assert.equal(await audio.unlock(), true);
  const context = contexts[0];
  assert.equal(context.sources.length, 0, 'unlock itself still creates no sources');
  const voices = audio.voices.size;
  audio.syncAmbient({ progress: 0, w: .5 });
  assert.ok(audio.ambient, 'first frame call creates the persistent graph');
  assert.equal(audio.voices.size, voices, 'ambient sources never count as voices');
  assert.ok(ambientSources(audio).length >= 9, 'bed pair, overtones, shimmer and air loop');
  assert.equal(audio.ambient.gain.gain.value, 1, 'fade-in ramp lands at unity');
});

test('progress lights overtones in order, exit opens the shimmer, W slides the air filter', async t => {
  installAudio(t);
  const audio = new GameAudio();
  t.after(() => audio.dispose());
  await audio.unlock();
  audio.syncAmbient({ progress: 0, w: .5 });
  const ambient = audio.ambient;
  assert.deepEqual(ambient.overtones.map(node => node.gain.value), [0, 0, 0]);
  audio.syncAmbient({ progress: 1, w: .5 });
  assert.deepEqual(ambient.overtones.map(node => node.gain.value), [.009, 0, 0]);
  audio.syncAmbient({ progress: 3, w: .5 });
  assert.deepEqual(ambient.overtones.map(node => node.gain.value), [.009, .009, .009]);
  assert.equal(ambient.shimmer.gain.value, 0);
  audio.syncAmbient({ progress: 3, w: .5, exitOpen: true });
  assert.equal(ambient.shimmer.gain.value, .004);
  audio.syncAmbient({ progress: 3, w: 0 });
  assert.equal(ambient.filter.frequency.value, 500);
  audio.syncAmbient({ progress: 3, w: 1 });
  assert.equal(ambient.filter.frequency.value, 2800);
});

test('blocked, mute and dispose each cut the whole ambient graph in one call', async t => {
  const contexts = installAudio(t);
  const audio = new GameAudio();
  t.after(() => audio.dispose());
  await audio.unlock();
  const context = contexts[0];

  audio.syncAmbient({ progress: 2, w: .6 });
  const first = ambientSources(audio);
  audio.syncAmbient({ blocked: true });
  assert.equal(audio.ambient, null);
  assert.ok(first.every(dead), 'blocked cut every ambient source that frame');
  audio.syncAmbient({ progress: 0, w: .5 });
  const second = ambientSources(audio);
  assert.ok(second.length > 0 && !first.includes(second[0]), 'unblocking builds a fresh graph');
  assert.equal(audio.ambient.gain.gain.value, 1, 'fresh graph fades in from zero again');

  audio.setEnabled(false);
  assert.equal(audio.ambient, null);
  assert.ok(second.every(dead), 'muting cut every ambient source that frame');
  audio.setEnabled(true);
  audio.syncAmbient({ progress: 1, w: .5 });
  const third = ambientSources(audio);
  assert.ok(third.length > 0);
  context.currentTime += 1;
  audio.dispose();
  assert.equal(audio.ambient, null);
  assert.ok(third.every(dead), 'dispose cut every ambient source');
});

test('a fail cancel leaves the bed running while ambient pings still live in voice groups', async t => {
  const contexts = installAudio(t);
  const audio = new GameAudio();
  t.after(() => audio.dispose());
  await audio.unlock();
  const context = contexts[0];
  audio.syncAmbient({ progress: 0, w: .5 });
  const bed = ambientSources(audio);
  context.currentTime += 12;
  audio.syncAmbient({ progress: 0, w: .5 });
  assert.ok(audio.voices.size > 0, 'a sparse ping eventually sounds on the frame clock');
  audio.handle([{ type: 'fail', node: 'hub' }]);
  assert.equal([...audio.voices].some(voice => voice.group === 'ambient'), false, 'the ping voice honours ordinary cancellation');
  assert.ok(bed.every(source => !source.disconnected), 'the persistent bed survives _cancel');
});

test('no WebAudio device means a silent no-op, never a throw', async t => {
  installAudio(t, true);
  const audio = new GameAudio();
  assert.equal(await audio.unlock(), false);
  assert.doesNotThrow(() => audio.syncAmbient({ progress: 3, w: 1, exitOpen: true }));
  assert.equal(audio.ambient, null);
  assert.doesNotThrow(() => audio.dispose());
});
