import test from 'node:test';
import assert from 'node:assert/strict';
import { CourtyardMomentum } from '../src/courtyard-momentum.js';
import { FriendGuide } from '../src/friend-guide.js';
import { start, travel, fall, advance } from './model-helpers.js';

function setup(options, seed = 2) {
  const model = start('shell', seed), guide = new FriendGuide(), momentum = new CourtyardMomentum(options);
  const update = model.update.bind(model);
  const tick = (seconds, active = true) => {
    for (let t = 0; t < seconds; t += .01) {
      const s = model.snapshot(); guide.update(.01, s, active, !momentum.firstEntry); momentum.update(.01, s, guide, active);
    }
  };
  model.update = dt => { update(dt); guide.update(dt, model.snapshot(), true, !momentum.firstEntry); momentum.update(dt, model.snapshot(), guide); };
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
  assert.equal(view().node, m.selected); assert.notEqual(view().node, m.node, 'point at the reachable next step');
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

test('first entry offers one mechanism after a fully quiet follow, then closes on real activation', () => {
  for (const wait of [0, 8]) {
    const { model: m, guide, momentum, tick, view } = setup({ arrival: true });
    tick(1.5); assert.equal(view().beat, 'arrival');
    const target = view().node;
    tick(wait); assert.equal(guide.view(m.snapshot()), null, 'idle never adds a second guide');
    travel(m, target); tick(.2);
    assert.equal(view().beat, 'follow'); assert.equal(view().node, m.node);
    assert.equal(guide.settled, true); assert.equal(guide.view(m.snapshot()), null);
    const before = m.snapshot(), frozen = view(); tick(3, false);
    assert.deepEqual(view(), frozen);
    while (momentum.cue?.beat === 'follow') tick(.01);
    assert.equal(view(), null, 'the first follow has fully faded');
    tick(.3); assert.equal(view(), null, 'a quiet gap separates the two beats');
    tick(.2); assert.equal(view().beat, 'mechanism'); assert.equal(view().node, target);
    assert.equal(m.snapshot().interactAvailable, true, 'existing E action can fulfill the invitation');
    const invited = view(); tick(3, false); assert.deepEqual(view(), invited);
    tick(8); assert.equal(view(), null, 'one invitation expires without idle replay');
    assert.deepEqual(m.snapshot(), before, 'all invitation and quiet time is presentation only');
    assert.equal(m.interact(), true); guide.activity(); m.update(.01);
    assert.equal(view().beat, 'mechanism-follow');
    const activated = view(); tick(3, false); assert.deepEqual(view(), activated);
    advance(m, .51);
    assert.deepEqual(m.snapshot().nodes.find(n => n.id === 'bell').received, [target]);
    assert.equal(m.snapshot().nodes.find(n => n.id === 'bell').powered, false, 'one source does not claim both supplies');
    tick(8); assert.equal(view(), null);
    assert.equal(m.interact(), false); tick(1); assert.equal(view(), null);
    travel(m, 'hub'); travel(m, target); tick(1);
    assert.equal(view(), null); assert.deepEqual([...momentum.used], ['arrival', 'follow', 'mechanism', 'mechanism-follow']);
  }
});

test('first entry cannot reward failed, risky, diverted, off-slice, unseen or help-interrupted travel', () => {
  for (const reason of ['failed', 'risky', 'diverted', 'slice', 'unseen', 'help']) {
    const { model: m, guide, momentum, tick, view } = setup({ arrival: true });
    const target = m.selected;
    tick(reason === 'unseen' ? .2 : 1.5);
    if (reason === 'failed') fall(m, target);
    if (reason === 'risky') travel(m, target, true);
    if (reason === 'diverted') { assert.equal(m.select('bloom'), true); tick(.1); }
    if (reason === 'slice') { m.setW(.5); tick(.1); }
    if (reason === 'help') { momentum.cancel(); guide.request(m.snapshot()); assert.equal(view(), null); tick(.1); }
    if (m.node !== target) travel(m, target);
    tick(.2); assert.equal(view(), null, reason);
    assert.equal(momentum.used.has('follow'), false, reason);
    tick(8); assert.equal(view(), null, reason);
  }
});

test('first action names only the seen invitation, survives its fade, and settles on actual action', () => {
  const { model: m, guide, momentum, tick, view } = setup({ arrival: true });
  const action = () => momentum.firstAction(m.snapshot(), guide);
  assert.equal(action(), null, 'no instruction before the invitation');
  tick(1.5);
  const target = view().node, before = m.snapshot();
  assert.deepEqual(action(), { action: 'move', node: target });
  tick(8); assert.equal(view(), null);
  assert.deepEqual(action(), { action: 'move', node: target }, 'the button still names the faded invitation');
  assert.deepEqual(m.snapshot(), before, 'naming the action has no model authority');
  travel(m, target); tick(.2);
  assert.equal(action(), null, 'landing completion gets its own quiet space');
  while (momentum.cue?.beat === 'follow') tick(.01);
  tick(.3); assert.equal(action(), null, 'do not bring the next invitation forward');
  tick(.2); assert.deepEqual(action(), { action: 'interact', node: target });
  tick(8); assert.deepEqual(action(), { action: 'interact', node: target });
  assert.equal(m.interact(), true);
  assert.equal(action(), null, 'a successful E settles the instruction immediately');
  advance(m, .6); tick(8); assert.equal(action(), null);
});

test('first action withdraws immediately for help, invalid targets and interrupted journeys', () => {
  for (const stage of ['move', 'interact']) for (const reason of ['help', 'risk', 'slice', 'travel', 'wave', 'failure', 'room', 'restart', 'divert']) {
    const { model: m, guide, momentum, tick, view } = setup({ arrival: true });
    tick(1.5);
    if (stage === 'interact') { travel(m, view().node); tick(2); }
    const s = m.snapshot();
    assert.equal(momentum.firstAction(s, guide)?.action, stage);
    if (reason === 'help') guide.request(s);
    const invalid = reason === 'risk' ? { ...s, riskMode: true }
      : reason === 'slice' ? { ...s, nodes: s.nodes.map(n => ({ ...n, present: false })) }
      : reason === 'travel' ? { ...s, travel: {} }
      : reason === 'wave' ? { ...s, wave: {} }
      : reason === 'failure' ? { ...s, stats: { ...s.stats, failures: 1 } }
      : reason === 'room' ? { ...s, room: s.room + 1 }
      : reason === 'restart' ? { ...s, phase: 'choose' }
      : reason === 'divert' ? { ...s, ...(stage === 'move' ? { selected: 'hub' } : { node: 'hub' }) } : s;
    assert.equal(momentum.firstAction(invalid, guide), null, `${stage}/${reason} before the next frame`);
    // Failures are cumulative in a real run; only restart can clear them.
    if (reason === 'failure') continue;
    momentum.update(.01, invalid, guide);
    guide.activity(); tick(8);
    assert.equal(momentum.firstAction(s, guide), null, `${stage}/${reason} cannot reappear`);
  }
  const ordinary = setup(); ordinary.tick(2);
  assert.equal(ordinary.momentum.firstAction(ordinary.model.snapshot(), ordinary.guide), null);
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


for (const seed of [0, 2, 7, 10]) test(`second beat uses the actual first source/gate in room seed ${seed}`, () => {
  const { model: m, guide, momentum, tick, view } = setup({ arrival: true }, seed);
  tick(1.5); const target = view().node;
  travel(m, target); tick(1.5);
  assert.equal(view().beat, 'mechanism'); assert.equal(view().node, target);
  const before = m.snapshot();
  assert.equal(before.nodes.find(n => n.id === target).kind, 'mechanism');
  assert.equal(before.interactAvailable, true);
  assert.ok(before.nodes.some(n => n.kind === 'mechanism' && !n.powered));
  assert.equal(m.interact(), true); guide.activity(); m.update(.01);
  assert.equal(view().beat, 'mechanism-follow');
  advance(m, .51);
  for (const receiver of before.nodes.filter(n => n.required?.includes(target))) {
    assert.ok(m.snapshot().nodes.find(n => n.id === receiver.id).received.includes(target));
  }
  tick(20); assert.equal(view(), null);
  assert.deepEqual([...momentum.used], ['arrival', 'follow', 'mechanism', 'mechanism-follow']);
});

test('early activation never queues an unnecessary second or third step', () => {
  for (const timing of ['follow', 'gap']) {
    const { model: m, guide, momentum, tick, view } = setup({ arrival: true });
    tick(1.5); travel(m, view().node); tick(.2);
    if (timing === 'gap') while (momentum.cue?.beat === 'follow') tick(.01);
    assert.equal(m.interact(), true); guide.activity(); advance(m, .6);
    tick(10); assert.equal(view(), null);
    assert.deepEqual([...momentum.used], ['arrival', 'follow']);
  }
});

test('help at first follow, quiet gap, second invitation, expired invitation or second follow spends the opportunity', () => {
  for (const timing of ['follow', 'gap', 'invitation', 'expired', 'complete']) {
    const { model: m, guide, momentum, tick, view } = setup({ arrival: true });
    tick(1.5); travel(m, view().node); tick(.2);
    if (timing !== 'follow') while (momentum.cue?.beat === 'follow') tick(.01);
    if (['invitation', 'expired', 'complete'].includes(timing)) tick(.5);
    if (timing === 'expired') tick(8);
    if (timing === 'complete') { m.interact(); m.update(.01); assert.equal(view().beat, 'mechanism-follow'); }
    momentum.cancel(); guide.request(m.snapshot()); assert.equal(view(), null);
    tick(5); m.interact(); advance(m, .6); tick(15);
    assert.equal(view(), null); assert.equal(momentum.mechanism, null);
    if (timing !== 'complete') assert.equal(momentum.used.has('mechanism-follow'), false);
  }
});

test('second opportunity is retired by departure, failed travel, slice change, risk or a new run/room', () => {
  for (const timing of ['gap', 'invitation', 'expired']) for (const reason of ['depart', 'fail', 'slice', 'risk', 'restart', 'room', 'wave']) {
    const { model: m, guide, momentum, tick, view } = setup({ arrival: true });
    tick(1.5); const target = view().node; travel(m, target); tick(.2);
    while (momentum.cue?.beat === 'follow') tick(.01);
    if (timing !== 'gap') tick(.5);
    if (timing === 'expired') tick(8);
    if (reason === 'depart') { travel(m, 'hub'); travel(m, target); }
    if (reason === 'fail') fall(m, 'hub');
    if (reason === 'slice') { m.setW(.5); tick(.1); m.setW(.82); }
    if (reason === 'risk') { m.setRisk(true); tick(.1); m.setRisk(false); }
    if (reason === 'restart') { m.restart(); tick(.1); m.chooseRelic('shell'); travel(m, target); }
    if (reason === 'room' || reason === 'wave') {
      const s = m.snapshot();
      momentum.update(.01, reason === 'room' ? { ...s, room: s.room + 1 } : { ...s, wave: {} }, guide);
    }
    tick(.1); m.interact(); advance(m, .6); tick(12);
    assert.equal(view(), null, `${timing}/${reason}`);
    assert.equal(momentum.used.has('mechanism-follow'), false, `${timing}/${reason}`);
  }
});
