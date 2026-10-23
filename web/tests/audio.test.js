import test from 'node:test';
import assert from 'node:assert/strict';
import { GameAudio } from '../src/audio.js';

// Track the WebAudio boundary, including future starts/stops. These tests check
// lifecycle safety, not synthesis quality or browser autoplay enforcement.
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

const stopped = (source, context) => source.disconnected && source.stopAt <= context.currentTime;

test('audio waits for explicit unlock and safely degrades without WebAudio', async t => {
  const contexts = installAudio(t);
  const audio = new GameAudio();
  t.after(() => audio.dispose());
  audio.setEnabled(true);
  audio.handle([{ type: 'win' }]);
  assert.equal(contexts.length, 0);
  assert.equal(await audio.unlock(), true);
  assert.equal(contexts.length, 1);
  assert.equal(contexts[0].sources.length, 0, 'unlock must not replay pre-gesture events');
  audio.handle([{ type: 'reward', risky: true, tier: 3 }]);
  assert.ok(contexts[0].sources.length > 0);

  globalThis.AudioContext = undefined;
  const unavailable = new GameAudio();
  assert.equal(await unavailable.unlock(), false);
  assert.doesNotThrow(() => unavailable.handle([{ type: 'win' }]));
  unavailable.dispose();
});

test('failure, loss, room change and restart cancel every old scheduled success source', async t => {
  const contexts = installAudio(t);
  const audio = new GameAudio();
  t.after(() => audio.dispose());
  await audio.unlock();
  const context = contexts[0];
  for (const type of ['fail', 'lose', 'room', 'restart']) {
    const first = context.sources.length;
    audio.handle([{ type: 'win' }]);
    const victory = context.sources.slice(first);
    assert.ok(victory.some(source => source.startAt > context.currentTime));
    audio.handle([{ type }]);
    assert.ok(victory.every(source => stopped(source, context)), `${type} left an old success source scheduled`);
  }
});

test('mute stops future notes immediately and re-enable plays only new events', async t => {
  const contexts = installAudio(t);
  const audio = new GameAudio();
  t.after(() => audio.dispose());
  await audio.unlock();
  const context = contexts[0];
  audio.handle([{ type: 'win' }]);
  const beforeMute = [...context.sources];
  audio.setEnabled(false);
  assert.ok(beforeMute.every(source => stopped(source, context)));
  audio.handle([{ type: 'unlock' }, { type: 'reward', tier: 3 }]);
  assert.equal(await audio.unlock(), false);
  assert.equal(context.sources.length, beforeMute.length);
  audio.setEnabled(true);
  assert.equal(context.sources.length, beforeMute.length);
  assert.equal(contexts.length, 1);
  audio.handle([{ type: 'bank', value: 9 }]);
  assert.ok(context.sources.length > beforeMute.length);
  assert.ok(beforeMute.every(source => stopped(source, context)));
});

test('burst feedback stays bounded and disposal closes all live or future sources', async t => {
  const contexts = installAudio(t);
  const audio = new GameAudio();
  await audio.unlock();
  const context = contexts[0];
  for (let i = 0; i < 100; i++) {
    audio.handle([{ type: 'reward', tier: 3, risky: true }]);
    const connected = context.sources.filter(source => !source.disconnected);
    assert.ok(connected.length <= 48, '24 voices may contain at most two sources each');
  }
  assert.ok(context.sources.some(source => stopped(source, context)), 'overflow should stop old sources');
  audio.dispose();
  assert.equal(context.state, 'closed');
  assert.ok(context.sources.every(source => stopped(source, context)));
  const sourceCount = context.sources.length;
  audio.setEnabled(true);
  audio.handle([{ type: 'win' }]);
  assert.equal(await audio.unlock(), false);
  assert.equal(context.sources.length, sourceCount);
  assert.equal(contexts.length, 1);
});
