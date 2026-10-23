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

test('each W layer has a distinct short orientation cue and transfer replaces it', async t => {
  const contexts = installAudio(t);
  const audio = new GameAudio();
  t.after(() => audio.dispose());
  await audio.unlock();
  const context = contexts[0];
  const frequencies = [];
  let previous = [];
  for (const toLayer of [0, 1, 2]) {
    context.currentTime += .1;
    const first = context.sources.length;
    audio.handle([{ type: 'layer_shift', fromLayer: (toLayer + 2) % 3, toLayer, node: 'hub' }]);
    const cue = context.sources.slice(first);
    assert.ok(cue.length > 0 && cue.length <= 2);
    assert.ok(previous.every(source => stopped(source, context)), 'the departed layer must be silent');
    assert.ok(cue.every(source => source.stopAt <= context.currentTime + .2));
    frequencies.push(cue[0].frequency.value);
    previous = cue;
  }
  assert.equal(new Set(frequencies).size, 3, 'layers need audibly different pitch trajectories');
  const first = context.sources.length;
  audio.handle([{ type: 'phase_transfer', from: 'dew', to: 'bell', layer: 1 }]);
  assert.ok(previous.every(source => stopped(source, context)));
  assert.equal(context.sources.length - first, 4, 'same-XYZ transfer has its own bounded two-tone cue');
});

test('rapid W scrubbing cancels stale shifts and transfers before throttling', async t => {
  const contexts = installAudio(t);
  const audio = new GameAudio();
  t.after(() => audio.dispose());
  await audio.unlock();
  const context = contexts[0];
  for (let i = 0; i < 300; i++) {
    const old = context.sources.filter(source => !source.disconnected);
    audio.handle([{ type: 'layer_shift', toLayer: i % 3, node: 'hub' }]);
    assert.ok(old.every(source => stopped(source, context)));
    audio.handle([{ type: 'phase_transfer', from: 'dew', to: 'bell', layer: i % 3 }]);
    assert.ok(context.sources.filter(source => !source.disconnected).length <= 4);
    context.currentTime += .003;
  }
  assert.ok(context.sources.length < 100, 'scrubbing must not allocate a cue at pointer-frame frequency');
  context.currentTime += .1;
  const first = context.sources.length;
  audio.handle([{ type: 'layer_shift', toLayer: 2, node: 'hub' }]);
  assert.equal(context.sources.length - first, 2, 'a settled fresh change can sound after the throttle');
});

test('warning beats follow model time and every outcome/reset/mute path cancels them', async t => {
  const contexts = installAudio(t);
  const audio = new GameAudio();
  t.after(() => audio.dispose());
  await audio.unlock();
  const context = contexts[0];
  for (const type of ['fail', 'lose', 'restart', 'room', 'evade', 'shield']) {
    const first = context.sources.length;
    audio.handle([{ type: 'warning', node: 'vault', layer: 1, duration: 2.4 }]);
    audio.syncWave({ node: 'vault', layer: 1, duration: 2.4, remaining: .144 });
    const warning = context.sources.slice(first);
    assert.ok(warning.length > 0);
    assert.ok(warning.every(source => source.startAt === context.currentTime), 'never schedule future warning beats on the audio clock');
    assert.ok(warning.every(source => source.stopAt < context.currentTime + .144));
    context.currentTime += .15;
    audio.handle([{ type, node: 'vault' }]);
    assert.ok(warning.every(source => stopped(source, context)), `${type} left a warning beat scheduled`);
  }
  const first = context.sources.length;
  audio.handle([{ type: 'warning', node: 'vault', duration: 2.4 }]);
  audio.syncWave({ node: 'vault', layer: 1, duration: 2.4, remaining: 2.4 });
  const warning = context.sources.slice(first);
  audio.setEnabled(false);
  assert.ok(warning.every(source => stopped(source, context)));
  audio.setEnabled(true);
  assert.equal(context.sources.length, first + warning.length, 'unmuting cannot resurrect a countdown');
});

test('replacing or evading a warning preserves unrelated received-power feedback', async t => {
  const contexts = installAudio(t);
  const audio = new GameAudio();
  t.after(() => audio.dispose());
  await audio.unlock();
  const context = contexts[0];
  audio.handle([{ type: 'power', from: 'dew', to: 'bell', layer: 1 }]);
  const power = [...context.sources];
  assert.ok(power.length > 0);
  audio.handle([{ type: 'warning', node: 'vault', layer: 1, duration: 2.4 }]);
  audio.syncWave({ node: 'vault', layer: 1, duration: 2.4, remaining: 2.4 });
  const oldWarning = context.sources.slice(power.length);
  const first = context.sources.length;
  audio.handle([{ type: 'warning', node: 'vault', layer: 1, duration: 2.4 }]);
  audio.syncWave({ node: 'vault', layer: 1, duration: 2.4, remaining: 2.4 });
  assert.ok(oldWarning.every(source => stopped(source, context)));
  const currentWarning = context.sources.slice(first);
  audio.handle([{ type: 'evade', node: 'vault', value: 4, tier: 2 }]);
  assert.ok(currentWarning.every(source => stopped(source, context)));
  assert.ok(power.every(source => !source.disconnected), 'evasion must not erase a committed power ripple');
});

test('evade plus reward has one reward melody, with only an unpitched escape release', async t => {
  const contexts = installAudio(t);
  const audio = new GameAudio();
  t.after(() => audio.dispose());
  await audio.unlock();
  const context = contexts[0];
  const reward = { type: 'reward', node: 'vault', risky: true, value: 4, tier: 3 };
  audio.handle([reward]);
  const baselineTones = context.sources.filter(source => !source.buffer).length;
  audio.handle([{ type: 'restart' }]);
  const first = context.sources.length;
  audio.handle([{ type: 'evade', node: 'vault', value: 4, tier: 3 }, reward]);
  const escaped = context.sources.slice(first);
  assert.equal(escaped.filter(source => !source.buffer).length, baselineTones);
  assert.equal(escaped.filter(source => source.buffer).length, 2, 'one release and the tier-3 reward texture');
});

test('pause cancels every queued sound and resumes only upcoming model-time warning beats', async t => {
  const contexts = installAudio(t);
  const audio = new GameAudio();
  t.after(() => audio.dispose());
  await audio.unlock();
  const context = contexts[0];
  const wave = { node: 'vault', layer: 1, duration: 2.4, remaining: 1.75 };
  audio.handle([{ type: 'win' }, { type: 'warning', node: 'vault', duration: 2.4 }]);
  audio.syncWave(wave);
  const beforePause = [...context.sources];
  assert.ok(beforePause.some(source => source.startAt > context.currentTime));
  audio.syncWave(wave, true);
  assert.ok(beforePause.every(source => stopped(source, context)));
  context.currentTime += 10;
  audio.syncWave(wave, true);
  audio.handle([{ type: 'reward', risky: true, tier: 3 }]);
  audio.syncWave(wave, false);
  assert.equal(context.sources.length, beforePause.length, 'no warning or victory catch-up on resume');
  context.currentTime += .6;
  audio.syncWave({ ...wave, remaining: 1.15 });
  assert.equal(context.sources.length - beforePause.length, 2, 'the next genuine model-time beat sounds once');
});

test('slow frames cannot outrun warning clock or create a backlog of sounds', async t => {
  const contexts = installAudio(t);
  const audio = new GameAudio();
  t.after(() => audio.dispose());
  await audio.unlock();
  const context = contexts[0];
  const wave = { node: 'vault', layer: 1, duration: 2.4, remaining: 2.4 };
  audio.handle([{ type: 'warning', node: 'vault', duration: 2.4 }]);
  audio.syncWave(wave);
  const first = context.sources.length;
  context.currentTime += 5;
  audio.syncWave(wave);
  assert.equal(context.sources.length, first, 'wall time alone must never advance the warning');
  audio.syncWave({ ...wave, remaining: 1.2 });
  assert.equal(context.sources.length - first, 2, 'skip to one current beat, never replay crossed beats');
  const last = context.sources.slice(first);
  audio.syncWave(null);
  assert.ok(last.every(source => stopped(source, context)), 'wave disappearance is a final cleanup even without an outcome event');
  const count = context.sources.length;
  audio.syncWave(null);
  assert.equal(context.sources.length, count);
});

test('same-frame committed power survives the audio failure cleanup but not a new run', async t => {
  const contexts = installAudio(t);
  const audio = new GameAudio();
  t.after(() => audio.dispose());
  await audio.unlock();
  const context = contexts[0];
  audio.handle([{ type: 'power', from: 'dew', to: 'bell', layer: 1 }]);
  const power = [...context.sources];
  audio.handle([{ type: 'fail', node: 'hub' }]);
  assert.ok(power.length > 0 && power.every(source => !source.disconnected));
  audio.handle([{ type: 'restart' }]);
  assert.ok(power.every(source => stopped(source, context)), 'new runs still cancel every old power cue');
});

test('wave stages and danger sets replace stale beats even at identical elapsed times', async t => {
  const contexts = installAudio(t);
  const audio = new GameAudio();
  t.after(() => audio.dispose());
  await audio.unlock();
  const context = contexts[0];
  const wave = { node: 'vault', layer: 1, dangerLayers: [1], safeLayers: [0, 2],
    duration: 2.4, remaining: 2.4, variant: 'chase', step: 1, steps: 2 };
  audio.syncWave(wave);
  const stageOne = [...context.sources];
  const initialPitch = stageOne[0].frequency.value;
  audio.syncWave({ ...wave, step: 2 });
  const stageTwo = context.sources.slice(stageOne.length);
  assert.ok(stageOne.every(source => stopped(source, context)), 'a new stage cannot retain the previous threat pulse');
  assert.ok(stageTwo.length > 0);
  assert.notEqual(stageTwo[0].frequency.value, initialPitch, 'the next chase must be distinguishable by pitch');

  const first = context.sources.length;
  audio.syncWave({ ...wave, step: 2, variant: 'lock', dangerLayers: [0, 1], safeLayers: [2] });
  const locked = context.sources.slice(first);
  assert.ok(stageTwo.every(source => stopped(source, context)));
  assert.equal(locked.filter(source => !source.buffer).length, 4, 'two dangerous layers have a paired pulse');
  assert.ok(locked.every(source => source.startAt === context.currentTime), 'warning voices never predict the next beat');
  const count = context.sources.length;
  audio.syncWave({ ...wave, step: 2, variant: 'lock', dangerLayers: [1, 0], safeLayers: [2] });
  assert.equal(context.sources.length, count, 'reordering the same danger set must not retrigger it');
  audio.syncWave(null);
  assert.ok(locked.every(source => stopped(source, context)));
});

test('intermediate dodge clears its warning and plays only a short unresolved cue', async t => {
  const contexts = installAudio(t);
  const audio = new GameAudio();
  t.after(() => audio.dispose());
  await audio.unlock();
  const context = contexts[0];
  audio.syncWave({ node: 'vault', layer: 0, dangerLayers: [0], safeLayers: [1, 2],
    duration: 2, remaining: .2, step: 1, steps: 2, variant: 'chase' });
  const warning = [...context.sources];
  audio.handle([{ type: 'dodge', node: 'vault', step: 1, steps: 2, layer: 2 }]);
  const dodge = context.sources.slice(warning.length);
  assert.ok(warning.every(source => stopped(source, context)));
  assert.equal(dodge.length, 4);
  assert.ok(dodge.every(source => source.stopAt <= context.currentTime + .22));
  assert.ok([...audio.voices].every(voice => voice.group !== 'reward'), 'a partial dodge never earns the final cadence');
});

test('risky tiers add musical range and a resolved tail while keeping headroom and voice limits', async t => {
  const contexts = installAudio(t);
  const audio = new GameAudio();
  t.after(() => audio.dispose());
  await audio.unlock();
  const context = contexts[0];
  audio.handle([{ type: 'reward', risky: false, tier: 3 }]);
  const safe = [...context.sources];
  assert.equal(safe.filter(source => !source.buffer).length, 4);
  const tierCounts = [];
  for (const tier of [1, 2, 3]) {
    audio.handle([{ type: 'restart' }]);
    const first = context.sources.length;
    audio.handle([{ type: 'reward', node: 'vault', risky: true, tier, challenge: 'vault' }]);
    const notes = context.sources.slice(first).filter(source => !source.buffer);
    tierCounts.push(notes.length);
    assert.ok(notes.some(source => source.frequency.value < 100), 'earned risk has a low impact absent from safe collection');
    assert.ok(notes.some(source => source.startAt > context.currentTime + .2 && source.stopAt > context.currentTime + .8), 'the arpeggio must settle into a final chord');
    assert.ok(audio.voices.size <= 24);
    assert.equal(audio.master.gain.value, .65, 'tiers never raise the master output');
    assert.equal(audio.compressor.threshold.value, -18);
  }
  assert.ok(tierCounts[0] < tierCounts[1] && tierCounts[1] < tierCounts[2]);
  const old = context.sources.filter(source => !source.disconnected);
  audio.handle([{ type: 'reward', risky: true, tier: 2 }]);
  assert.ok(old.every(source => stopped(source, context)), 'a new risky cadence replaces the old one instead of accumulating music');
});

test('room completion has a closing cadence distinct from entering a room', async t => {
  const contexts = installAudio(t);
  const audio = new GameAudio();
  t.after(() => audio.dispose());
  await audio.unlock();
  const context = contexts[0];
  audio.handle([{ type: 'room' }]);
  const entrance = [...context.sources];
  audio.handle([{ type: 'room', completed: true }]);
  const completion = context.sources.slice(entrance.length);
  assert.ok(entrance.every(source => stopped(source, context)));
  assert.ok(completion.length > entrance.length);
  assert.ok(completion.some(source => source.startAt > context.currentTime + .25 && source.stopAt > context.currentTime + 1));
  audio.handle([{ type: 'win' }]);
  assert.ok(completion.every(source => stopped(source, context)));
  assert.ok(audio.voices.size <= 24);
});
