import test from 'node:test';
import assert from 'node:assert/strict';
import { CourtyardMomentum } from '../src/courtyard-momentum.js';
import { FriendGuide } from '../src/friend-guide.js';
import { start, travel, fall } from './model-helpers.js';

function setup() {
  const model = start('shell', 2), guide = new FriendGuide(), momentum = new CourtyardMomentum();
  const update = model.update.bind(model);
  const tick = (seconds, active = true) => {
    for (let t = 0; t < seconds; t += .01) {
      const s = model.snapshot(); guide.update(.01, s, active); momentum.update(.01, s, guide, active);
    }
  };
  model.update = dt => { update(dt); guide.update(dt, model.snapshot()); momentum.update(dt, model.snapshot(), guide); };
  return { model, guide, momentum, tick, view: () => momentum.view(model.snapshot(), guide) };
}

test('safe landing and the first onward platform get finite, silent beats without changing the model', () => {
  const { model: m, guide, momentum, tick, view } = setup();
  tick(12); assert.equal(view(), null, 'idle start adds no light');
  travel(m, m.selected);
  assert.equal(guide.settled, true); assert.equal(view(), null, 'leave breathing room after landing');
  tick(.5); assert.equal(view().beat, 'landing'); assert.equal(view().node, m.node);
  const before = m.snapshot(), frozen = view(); tick(5, false);
  assert.deepEqual(view(), frozen, 'modal/paused/hidden time freezes the beat');
  tick(3); assert.equal(view(), null); tick(30); assert.equal(view(), null, 'no idle replay');
  assert.deepEqual(m.snapshot(), before, 'no authority to move, activate or score');
  m.interact(); guide.activity(); tick(.5);
  assert.equal(view().beat, 'onward'); assert.equal(view().node, 'hub');
  tick(3); assert.equal(view(), null);
  travel(m, 'hub'); tick(3); assert.equal(view(), null, 'the cue does not become an advancing route');
  assert.deepEqual([...momentum.used], ['landing', 'onward']);
});

test('explicit help and leaving a real slice cancel a beat without replaying it', () => {
  for (const interrupt of ['help', 'slice', 'travel', 'wave']) {
    const { model: m, guide, momentum, tick, view } = setup();
    travel(m, m.selected); tick(.5); assert.ok(view());
    const s = m.snapshot();
    if (interrupt === 'help') guide.request(s);
    const unavailable = interrupt === 'slice' ? { ...s, nodes: s.nodes.map(n => ({ ...n, present: false })) }
      : interrupt === 'travel' ? { ...s, travel: {} } : interrupt === 'wave' ? { ...s, wave: {} } : s;
    assert.equal(momentum.view(unavailable, guide), null, 'immediate suppression before next frame');
    momentum.update(.01, unavailable, guide);
    guide.activity(); tick(8); assert.equal(view(), null, 'interrupted beat is spent');
  }
});

test('risky or failed crossings do not start momentum; a new room resets its budget', () => {
  for (const risky of [false, true]) {
    const { model: m, tick, view } = setup();
    if (risky) travel(m, m.selected, true); else fall(m, m.selected);
    tick(2); assert.equal(view(), null);
  }
  const { model: m, guide, momentum, tick } = setup();
  travel(m, m.selected); tick(3); assert.equal(momentum.used.size, 1);
  const next = { ...m.snapshot(), room: m.room + 1 };
  guide.update(.01, next); momentum.update(.01, next, guide);
  assert.equal(momentum.used.size, 0); assert.equal(momentum.view(next, guide), null);
});
