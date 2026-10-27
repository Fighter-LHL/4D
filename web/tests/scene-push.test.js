import test from 'node:test';
import assert from 'node:assert/strict';
import { courtyardActions, missingSupplySources, reachablePlatforms, mechanismFeedback } from '../src/play-feedback.js';
import { FlatlandModel } from '../src/flatland/model.js';
import { VisitorCueSequence, VISITOR_OBSERVATION_BEAT } from '../src/flatland/visitor-cue.js';
import { start, travel, reach, advance, seedFor, openVault } from './model-helpers.js';

test('preview, crossing, activation and completed source give one executable primary action', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const m = start('shell', seed);
    m.setW(m.snapshot().range.center); m.select(m.selected);
    const preview = m.snapshot();
    assert.equal(courtyardActions(preview).primary, 'move');
    assert.ok(reachablePlatforms(preview).includes(preview.selected));
    assert.deepEqual(m.snapshot(), preview, 'presentation must not move or solve');
    m.move();
    assert.equal(courtyardActions(m.snapshot()).primary, null);
    assert.equal(courtyardActions(m.snapshot()).interactDisabled, true);
    assert.deepEqual(reachablePlatforms(m.snapshot()), []);
    advance(m, 1.4);
    assert.equal(courtyardActions(m.snapshot()).primary, 'interact');
    m.interact();
    const done = courtyardActions(m.snapshot());
    assert.equal(done.interactDone, true);
    assert.notEqual(done.primary, 'interact');
    assert.equal(done.interactDisabled, false, 'empty E remains available to explain the next source');
  }
});

test('unavailable footing, wrong slices, waves and non-playing phases never advertise a crossing', () => {
  const m = start('shell', 2);
  m.setW(1);
  assert.deepEqual(reachablePlatforms(m.snapshot()), []);
  assert.equal(courtyardActions(m.snapshot()).primary, null);
  travel(m, m.selected); m.setW(.34);
  assert.deepEqual(reachablePlatforms(m.snapshot()), []);
  assert.equal(courtyardActions(m.snapshot()).primary, null);
  m.setW(m.snapshot().nodes.find(n => n.id === m.node).center);
  openVault(m);
  assert.equal(courtyardActions(m.snapshot()).primary, null);
  assert.equal(courtyardActions(m.snapshot()).interactDisabled, true);
  assert.deepEqual(reachablePlatforms(m.snapshot()), []);
  assert.equal(courtyardActions({ ...m.snapshot(), phase: 'interlude', wave: null }).primary, null);
});

test('either dual source points only at the unsent branch, including before delivery arrives', () => {
  for (const reverse of [false, true]) {
    const m = start('shell', seedFor('confluence'));
    const sources = m.snapshot().nodes.filter(n => n.kind === 'mechanism' && !n.required.length);
    if (reverse) sources.reverse();
    assert.deepEqual(missingSupplySources(m.snapshot()), []);
    reach(m, sources[0].id); m.interact();
    for (const elapsed of [0, .51]) {
      advance(m, elapsed);
      const before = m.snapshot();
      assert.deepEqual(missingSupplySources(before).map(n => n.id), [sources[1].id]);
      m.drainEvents(); assert.equal(m.interact(), false);
      const blocked = m.drainEvents().find(e => e.type === 'interact_blocked');
      assert.equal(mechanismFeedback(blocked, before), `这边已经亮了 · 去${sources[1].name}`);
      assert.deepEqual(m.snapshot(), before);
      const crossing = { ...before, travel: {} };
      assert.equal(mechanismFeedback({ ...blocked, text: '还在穿越，落稳后再按 E' }, crossing), '还在穿越，落稳后再按 E');
    }
    reach(m, sources[1].id); m.interact();
    assert.deepEqual(missingSupplySources(m.snapshot()), [], 'in-flight energy is not another unsent source');
  }
  const chain = start('shell', seedFor('cascade'));
  assert.deepEqual(missingSupplySources(chain.snapshot()), [], 'ordinary chains do not get a dual-source cue');
});

test('visitor observation advances on game time, persists after cooldown and resets on replay', () => {
  const m = new FlatlandModel(0, { seed: 7, playStyle: 'explore' }); m.start();
  const cues = new VisitorCueSequence();
  const consume = () => cues.receive(m.drainEvents(), m.snapshot());
  consume(); m.setSlice(3); m.pokeVisitor(); consume();
  const before = m.snapshot();
  assert.match(cues.text(before), /跳起来了/);
  assert.deepEqual(m.snapshot(), before);
  m.setPaused(true); advance(m, 3);
  assert.match(cues.text(m.snapshot()), /跳起来了/, 'paused time does not skip observation');
  m.setPaused(false); advance(m, VISITOR_OBSERVATION_BEAT + .1);
  assert.equal(cues.text(m.snapshot()), '走到光环边找访客');
  m.setSlice(0); advance(m, 3);
  assert.equal(cues.text(m.snapshot()), '走到光环边找访客', 'invisible ball does not erase next step');
  m.setSlice(3); m.pokeVisitor(); consume();
  assert.match(cues.text(m.snapshot()), /跳起来了/, 'repeated poke gets another observation beat');
  m.load(0, 7); m.start(); consume();
  assert.match(cues.text(m.snapshot()), /拖 S/);
  assert.equal(cues.text({ ...m.snapshot(), exploration: false }), '');
});

test('escape arrival gives one short scene line, freezes on pause and expires without discovery effects', () => {
  const m = new FlatlandModel(0, { seed: 7, playStyle: 'explore' });
  const cues = new VisitorCueSequence();
  m.load(2, 7); m.start();
  cues.receive(m.drainEvents(), m.snapshot());
  assert.equal(cues.text(m.snapshot()), '墙那边有动静 · 换个切片看看');
  m.setPaused(true); advance(m, 5);
  assert.ok(cues.text(m.snapshot()));
  m.setPaused(false); advance(m, 4.1);
  assert.equal(cues.text(m.snapshot()), '');
  assert.equal(cues.text({ ...m.snapshot(), time: 0, exploration: false }), '');
  assert.equal(m.drainEvents().some(e => ['friend_found', 'garden_seed'].includes(e.type)), false);
});
