import test from 'node:test';
import assert from 'node:assert/strict';
import { FlatlandAudio } from '../src/flatland/audio.js';

class Param {
  value = 0;
  setValueAtTime(value) { this.value = value; }
  linearRampToValueAtTime(value) { this.value = value; }
  exponentialRampToValueAtTime(value) { this.value = value; }
  cancelScheduledValues() {}
}
class Node {
  gain = new Param(); frequency = new Param(); stops = 0;
  connect(node) { return node; }
  disconnect() { this.disconnected = true; }
  start() { this.started = true; }
  stop() { this.stops++; this.onended?.(); }
}
class Context {
  state = 'running'; currentTime = 0; destination = {}; oscillators = [];
  createGain() { return new Node(); }
  createOscillator() { const node = new Node(); this.oscillators.push(node); return node; }
  resume() { this.state = 'running'; }
  close() { this.state = 'closed'; }
}

test('peek audio has one voice per hold and releases it on release, mute, return, load and completion', async t => {
  const prior = globalThis.AudioContext;
  globalThis.AudioContext = Context;
  t.after(() => { if (prior) globalThis.AudioContext = prior; else delete globalThis.AudioContext; });
  const audio = new FlatlandAudio();
  await audio.unlock();
  for (const type of ['peek_end', 'guard_alert', 'load', 'complete']) {
    audio.handle([{ type: 'peek_start' }]);
    const voice = audio.peekVoice;
    assert.ok(voice.osc.started);
    audio.handle([{ type: 'peek_start' }]);
    assert.equal(audio.peekVoice, voice, 'holding does not stack drones');
    audio.handle([{ type }]);
    assert.equal(audio.peekVoice, null);
    assert.equal(voice.osc.stops, 1);
    assert.equal(voice.osc.disconnected, true);
    assert.equal(audio.peekWanted, false);
  }
  audio.handle([{ type: 'peek_start' }]);
  const muted = audio.peekVoice;
  audio.setEnabled(false);
  assert.equal(audio.peekVoice, null);
  assert.equal(muted.osc.stops, 1);
  audio.setEnabled(true);
  assert.ok(audio.peekVoice, 'unmuting while still held restores the drone');
  const last = audio.peekVoice, context = audio.context;
  audio.dispose();
  assert.equal(last.osc.stops, 1);
  assert.equal(context.state, 'closed');
});

test('audio events remain safe before Web Audio unlock and delayed unlock does not revive a released peek', async t => {
  const prior = globalThis.AudioContext;
  globalThis.AudioContext = Context;
  t.after(() => { if (prior) globalThis.AudioContext = prior; else delete globalThis.AudioContext; });
  const audio = new FlatlandAudio();
  audio.handle([{ type: 'peek_start' }, { type: 'pickup' }, { type: 'peek_end' }]);
  assert.equal(audio.peekVoice, null);
  await audio.unlock();
  assert.equal(audio.peekVoice, null);
  assert.equal(audio.context.oscillators.length, 0);
  audio.dispose();
});
