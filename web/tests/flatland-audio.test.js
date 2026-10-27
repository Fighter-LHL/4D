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

test('fresh discovery cues are short, seed pickup avoids a second melody, and mute stays silent', async t => {
  const prior = globalThis.AudioContext; globalThis.AudioContext = Context;
  t.after(() => { if (prior) globalThis.AudioContext = prior; else delete globalThis.AudioContext; });
  const audio = new FlatlandAudio(), notes = [];
  const tone = audio._tone.bind(audio);
  audio._tone = (freq, options) => { notes.push({ freq, ...options }); tone(freq, options); };
  const events = [{ type: 'shard', id: 'friend-probe-0', golden: true }, { type: 'garden_seed', id: 'friend-probe-0', fresh: true }];
  audio.handle(events); assert.equal(audio.context, null, 'no automatic audio unlock');
  await audio.unlock(); notes.length = 0;
  audio.handle(events); assert.equal(notes.length, 2); assert.equal(audio.context.oscillators.length, 2);
  assert.ok(notes.every(n => n.at + n.duration < .5));
  notes.length = 0; audio.handle([{ type: 'friend_found', fresh: true }]);
  assert.equal(notes.length, 4); assert.ok(notes.every(n => n.at + n.duration < .5));
  notes.length = 0;
  audio.handle([{ type: 'friend_found', fresh: false }, { type: 'garden_seed', fresh: false }, { type: 'discovery_near' }]);
  assert.equal(notes.length, 0);
  audio.setEnabled(false); const count = audio.context.oscillators.length;
  audio.handle(events); assert.equal(audio.context.oscillators.length, count);
  audio.setEnabled(true); assert.equal(audio.context.oscillators.length, count, 'unmute never replays the discovery');
  audio.dispose();
});

test('peek audio has one voice per hold and releases it on release, mute, return, load and completion', async t => {
  const prior = globalThis.AudioContext;
  globalThis.AudioContext = Context;
  t.after(() => { if (prior) globalThis.AudioContext = prior; else delete globalThis.AudioContext; });
  const audio = new FlatlandAudio();
  await audio.unlock();
  for (const type of ['peek_end', 'guard_alert', 'load', 'complete', 'pause']) {
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

test('pause and retry cancel scheduled tones rather than replaying them on resume', async t => {
  class ScheduledContext extends Context {
    createOscillator() {
      const node = super.createOscillator();
      node.stop = at => { node.stops++; node.stopAt = at; };
      return node;
    }
  }
  const prior = globalThis.AudioContext; globalThis.AudioContext = ScheduledContext;
  t.after(() => { if (prior) globalThis.AudioContext = prior; else delete globalThis.AudioContext; });
  const audio = new FlatlandAudio(); await audio.unlock();
  for (const type of ['pause', 'load']) {
    audio.handle([{ type: 'ring_hit', combo: 2 }]);
    const voices = [...audio.voices]; assert.equal(voices.length, 3);
    audio.handle([{ type }]);
    assert.equal(audio.voices.size, 0);
    for (const { osc, amp } of voices) { assert.equal(osc.stopAt, 0); assert.equal(amp.gain.value, 0); }
    audio.handle([{ type: 'resume' }]); assert.equal(audio.voices.size, 0);
  }
  audio.dispose();
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
