import test from 'node:test';
import assert from 'node:assert/strict';
import { CourtyardMomentum } from '../src/courtyard-momentum.js';
import { FriendGuide } from '../src/friend-guide.js';
import { start, travel, fall } from './model-helpers.js';

function setup(options) {
  const model = start('shell', 2), guide = new FriendGuide(), momentum = new CourtyardMomentum(options);
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
  assert.deepEqual([...momentum.used], ['landing', 'onward', 'follow']);
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


test('first discovery entry has one quiet opportunity, freezes and yields to occupied entry or a crossing', () => {
  const { model: m, tick, view, momentum } = setup({ arrival: true });
  const before = m.snapshot();
  tick(1); tick(4, false); assert.equal(view(), null);
  tick(.65); assert.equal(view().beat, 'arrival');
  tick(6); assert.equal(view(), null); assert.deepEqual([...momentum.used], ['arrival']);
  assert.deepEqual(m.snapshot(), before);
  for (const reason of ['help', 'crossing']) {
    const run = setup({ arrival: true });
    if (reason === 'help') run.guide.request(run.model.snapshot());
    else travel(run.model, run.model.selected);
    run.tick(2);
    assert.equal(run.momentum.used.has('arrival'), false, 'do not queue a welcome behind another beat');
    run.tick(10); assert.equal(run.view(), null);
  }
});

test('visible onward invitation acknowledges a real landing once, even after quiet expiry', () => {
  for (const wait of [0, 5]) {
    const { model: m, momentum, guide, tick, view } = setup();
    travel(m, m.selected); tick(3); m.interact(); guide.activity(); tick(.5);
    assert.equal(view().beat, 'onward'); tick(wait);
    if (wait) assert.equal(view(), null, 'no nag after four seconds');
    travel(m, 'hub'); tick(.2);
    assert.equal(view().beat, 'follow'); assert.equal(view().node, 'hub');
    const before = m.snapshot(), frozen = view(); tick(10, false);
    assert.deepEqual(view(), frozen); assert.deepEqual(m.snapshot(), before);
    tick(1); assert.equal(view(), null); tick(5); assert.equal(view(), null);
    assert.deepEqual([...momentum.used], ['landing', 'onward', 'follow']);
  }
});

test('an unseen invitation, help, failed or diverted travel never earns follow-through', () => {
  for (const interrupt of ['unseen', 'help', 'fail', 'divert', 'slice', 'room']) {
    const { model: m, momentum, guide, tick, view } = setup();
    travel(m, m.selected); tick(3); m.interact(); guide.activity(); tick(interrupt === 'unseen' ? .1 : .5);
    if (interrupt === 'help') { guide.request(m.snapshot()); momentum.update(.01, m.snapshot(), guide); guide.activity(); }
    if (interrupt === 'fail') fall(m, 'hub');
    if (interrupt === 'divert') momentum.update(.01, { ...m.snapshot(), travel: { from: m.node, to: 'other' } }, guide);
    if (interrupt === 'slice') momentum.update(.01, { ...m.snapshot(), nodes: m.snapshot().nodes.map(n => ({ ...n, present: false })) }, guide);
    if (interrupt === 'room') momentum.update(.01, { ...m.snapshot(), room: 2 }, guide);
    travel(m, 'hub'); tick(.2);
    assert.equal(view(), null, interrupt); assert.equal(momentum.used.has('follow'), false, interrupt);
  }
});

test('explicit help instantly cancels arrival or earned feedback without delayed replay', () => {
  for (const beat of ['arrival', 'follow']) {
    const { model: m, guide, momentum, tick, view } = setup({ arrival: beat === 'arrival' });
    if (beat === 'arrival') tick(1.7);
    else { travel(m, m.selected); tick(3); m.interact(); guide.activity(); tick(.5); travel(m, 'hub'); tick(.2); }
    assert.equal(view().beat, beat);
    momentum.cancel(); guide.request(m.snapshot()); assert.equal(view(), null);
    tick(10); assert.equal(view(), null);
  }
});
