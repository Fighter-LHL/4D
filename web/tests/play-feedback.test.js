import test from 'node:test';
import assert from 'node:assert/strict';
import { GameModel, RELICS } from '../src/model.js';
import { FriendGuide } from '../src/friend-guide.js';
import { STARTER_RELICS, mechanismFeedback, contextualHelp, DiscoveryHints, nearbyDiscovery, discoveryFeedback } from '../src/play-feedback.js';
import { visitorCue, VisitorCueSequence } from '../src/flatland/visitor-cue.js';
import { FlatlandModel } from '../src/flatland/model.js';
import { start, travel, reach, advance, seedFor, activateAll } from './model-helpers.js';
import { goto, slide, wait, walk, levelIndex } from './flatland-helpers.js';
import { collectGardenSeed } from '../src/flatland/companions.js';

test('discovery approach is nearby, once per region, frozen on pause and never solves or moves', () => {
  const m = new FlatlandModel(levelIndex('escape'), { seed: 42, playStyle: 'explore' }); m.start();
  const hints = new DiscoveryHints();
  slide(m, 4.7); goto(m, 4, 3);
  assert.equal(hints.update(m.snapshot(), .1), null);
  slide(m, 4.7); goto(m, 9.4, 5);
  const before = m.snapshot(), cue = hints.update(before, .1);
  assert.equal(cue.key, 'escape:friend:sprout');
  assert.equal(cue.text, '咦，耳朵动了一下');
  assert.deepEqual(m.snapshot(), before);
  assert.equal(m.encounter.step, 0); assert.deepEqual(m.collection.found, []);
  assert.equal(hints.update({ ...before, paused: true }, 10), null);
  assert.equal(hints.cooldown, 3.6);
  assert.equal(hints.update(before, 3), null, 'remaining near does not repeat');
  m.restart(); m.start(); slide(m, 4.7); goto(m, 9.4, 5);
  assert.equal(hints.update(m.snapshot(), 3), null, 'retry keeps session clue memory');
  for (const patch of [{ paused: true }, { phase: 'intro' }, { exploration: false }, { dying: {} }, { returning: 1 }, { collection: { found: ['sprout'] } }]) {
    assert.equal(nearbyDiscovery({ ...before, ...patch }), null);
  }
});

test('arrival narration defers the first approach cue without consuming it, including pause and retry', () => {
  const m = new FlatlandModel(levelIndex('escape'), { seed: 42, playStyle: 'explore' }); m.start();
  const hints = new DiscoveryHints(), visitor = new VisitorCueSequence();
  visitor.receive(m.drainEvents(), m.snapshot());
  slide(m, 4.7);
  const cue = () => { const s = m.snapshot(); return hints.update(s, .05, { suppressed: visitor.arrivalActive(s) }); };
  assert.ok(nearbyDiscovery(m.snapshot()), 'player has deliberately revealed the nearby friend');
  assert.equal(cue(), null);
  wait(m, 1); m.setPaused(true); const pausedTime = m.time; wait(m, 5);
  assert.equal(m.time, pausedTime); assert.equal(cue(), null);
  m.setPaused(false); wait(m, 2.99);
  assert.match(visitor.text(m.snapshot()), /墙那边/); assert.equal(cue(), null);
  assert.equal(hints.seen.size, 0); assert.equal(hints.cooldown, 0);
  wait(m, .02);
  assert.equal(visitor.text(m.snapshot()), '');
  assert.equal(cue().key, 'escape:friend:sprout');
  assert.equal(cue(), null, 'only one cue after narration');
  m.restart(); m.start(); visitor.receive(m.drainEvents(), m.snapshot()); slide(m, 4.7); wait(m, 4.1);
  assert.equal(cue(), null, 'retry does not reset the once-per-region memory');
});

test('neighboring regions leave a quiet gap without spending their first cue during cooldown', () => {
  const m = new FlatlandModel(0, { seed: 42, playStyle: 'explore' }); m.start();
  const hints = new DiscoveryHints();
  slide(m, 2.1); goto(m, 6.5, 9);
  assert.equal(hints.update(m.snapshot(), .1).key, 'visitor:pads');
  slide(m, m.level.garden.bud.z); goto(m, m.level.garden.bud.x, m.level.garden.bud.y);
  const before = m.snapshot();
  assert.equal(hints.update(before, 3.1), null, 'a second region stays quiet beyond the old 2.4s cooldown');
  assert.equal(hints.seen.has('visitor:bud'), false);
  assert.equal(hints.update({ ...before, paused: true }, 10), null);
  assert.equal(hints.update(before, .4), null);
  assert.equal(hints.update(before, .11).key, 'visitor:bud', 'approaching a new region still gives its one cue');
  assert.equal(hints.update(before, 10), null);
  slide(m, 2.1); goto(m, 6.5, 9);
  assert.equal(hints.update(m.snapshot(), 10), null, 'returning to the first region cannot repeat it');
});

test('standing on an off-layer trace stays quiet; revealing and approaching the friend gives one cue', () => {
  const m = new FlatlandModel(levelIndex('escape'), { seed: 42, playStyle: 'explore' }); m.start();
  const hints = new DiscoveryHints(); wait(m, 5);
  const idle = m.snapshot();
  assert.equal(idle.encounter.trace, true); assert.equal(idle.encounter.nearby, true);
  assert.equal(hints.update(idle, .1), null, 'arrival ending alone must not reveal the friend');
  slide(m, 4.7); goto(m, 9.2, 5);
  assert.equal(m.snapshot().encounter.visible, true);
  assert.equal(hints.update(m.snapshot(), .1), null, 'old two-unit radius is too early');
  goto(m, 9.4, 5);
  assert.equal(hints.update(m.snapshot(), .1).key, 'escape:friend:sprout');
  assert.equal(hints.update(m.snapshot(), 3), null);
  assert.equal(m.encounter.step, 0); assert.deepEqual(m.collection.found, []);
});

test('discovery cues respect the box concealment and current flower layer without leaking future positions', () => {
  const m = new FlatlandModel(levelIndex('vault'), { seed: 42, playStyle: 'explore' }); m.start();
  slide(m, 1.25); goto(m, 7.9, 6.8);
  assert.equal(nearbyDiscovery(m.snapshot()), null);
  const hidden = m.snapshot();
  assert.equal(nearbyDiscovery({ ...hidden, encounter: { ...hidden.encounter, nearby: true } }), null, 'even nearby must respect concealment');
  m.restart(); m.start(); slide(m, 4.8); goto(m, 9.2, 6.8);
  assert.equal(nearbyDiscovery(m.snapshot()), null, 'off-layer trace alone stays quiet');
  m.setPeek(true);
  const cue = nearbyDiscovery(m.snapshot());
  assert.equal(cue.key, 'vault:friend:lantern');
  assert.equal(cue.z, undefined); assert.equal(cue.path, undefined); assert.equal(cue.turns, undefined);
  const garden = new FlatlandModel(0, { seed: 42, playStyle: 'explore' }); garden.start();
  slide(garden, 2.1); goto(garden, 6.5, 9);
  assert.equal(nearbyDiscovery(garden.snapshot()).key, 'visitor:pads');
  slide(garden, .6); assert.equal(nearbyDiscovery(garden.snapshot()), null);
  slide(garden, garden.level.garden.bud.z); goto(garden, garden.level.garden.bud.x, garden.level.garden.bud.y);
  assert.equal(nearbyDiscovery(garden.snapshot()).key, 'visitor:bud');
});

test('real seed pickup reports fresh position once, then saved seeds cannot re-celebrate', () => {
  const m = new FlatlandModel(0, { seed: 42, playStyle: 'explore', collection: { found: ['sprout'], companion: 'sprout' } }); m.start(); m.drainEvents();
  slide(m, 2.1); goto(m, 6.5, 9); walk(m, 1, 0, .008); m.petCompanion(); wait(m, .7);
  const drop = m.level.garden.drops.probe[0]; goto(m, drop.x, drop.y); wait(m, .1);
  const seed = m.drainEvents().find(e => e.type === 'garden_seed');
  assert.ok(seed.fresh); assert.equal(seed.x, drop.x); assert.equal(seed.y, drop.y);
  assert.equal(discoveryFeedback(seed).text, '收下花种 · 1/3');
  const restored = new FlatlandModel(0, { seed: 42, playStyle: 'explore', gardenMemories: m.gardenMemories });
  restored.start(); restored.drainEvents(); collectGardenSeed(restored, seed.id);
  const repeated = restored.drainEvents().find(e => e.type === 'garden_seed');
  assert.equal(repeated.fresh, false); assert.equal(discoveryFeedback(repeated), null);
  assert.equal(discoveryFeedback({ type: 'friend_found', id: 'sprout', fresh: false }), null);
  assert.equal(discoveryFeedback({ type: 'friend_found', id: 'sprout', fresh: true }).text, '跳跳跟上来了');
});

test('short starter choices retain all five abilities and their complete descriptions', () => {
  assert.deepEqual(Object.keys(STARTER_RELICS).sort(), RELICS.map(r => r.id).sort());
  for (const relic of RELICS) {
    assert.ok(STARTER_RELICS[relic.id].length <= 24);
    assert.ok(relic.description.length > STARTER_RELICS[relic.id].length);
    const model = new GameModel(42);
    assert.equal(model.chooseRelic(relic.id), true);
    assert.equal(model.snapshot().relics[relic.id], 1);
  }
});

test('first-step highlight works without companions and expires without moving or solving', () => {
  const m = start('shell', 42), guide = new FriendGuide(), before = m.snapshot();
  assert.equal(guide.request(before), true);
  assert.deepEqual(guide.view(before), before.companionGuide);
  for (let n = 0; n < 50; n++) guide.update(.1, m.snapshot(), false, false);
  assert.ok(guide.view(before), 'modal time must preserve the first hint');
  for (let n = 0; n < 50; n++) guide.update(.1, m.snapshot(), true, false);
  assert.equal(guide.view(before), null);
  for (let n = 0; n < 200; n++) guide.update(.1, m.snapshot(), true, false);
  assert.equal(guide.view(before), null, 'no idle walkthrough for a new profile');
  assert.deepEqual(m.snapshot(), before);
});

test('failed E explains empty bank, crossing and missing footing without changing state', () => {
  const m = start('shell', 42);
  const reject = pattern => {
    m.drainEvents(); const before = m.snapshot();
    assert.equal(m.interact(), false); assert.deepEqual(m.snapshot(), before);
    const [event] = m.drainEvents(); assert.equal(event.type, 'interact_blocked');
    assert.match(mechanismFeedback(event, before), pattern);
  };
  reject(/没有回响/);
  const target = m.snapshot().selected;
  m.setW(m.snapshot().range.center); m.move(); reject(/穿越/);
  advance(m, 1.4); assert.equal(m.snapshot().node, target);
  m.setW(.34); reject(/脚下没站稳/);
});

test('missing source feedback distinguishes partial delivery from energy still in flight', () => {
  const m = start('shell', seedFor('confluence'));
  const sources = m.snapshot().nodes.filter(n => n.kind === 'mechanism' && !n.required.length);
  const sink = m.snapshot().nodes.find(n => n.required.length === 2);
  // Reach the shared XYZ, then change W to the unpowered receiver.
  reach(m, sources[0].id);
  m.setW(sink.center);
  assert.equal(m.snapshot().node, sink.id);
  const before = m.snapshot(); assert.equal(m.interact(), false);
  assert.deepEqual(m.snapshot(), before);
  const rejection = m.drainEvents().find(e => e.type === 'interact_blocked');
  assert.match(rejection.text, /还缺/);
  for (const source of sources) assert.ok(rejection.text.includes(source.name));
  reach(m, sources[1].id); m.interact(); advance(m, .51);
  const partial = m.drainEvents().find(e => e.type === 'power');
  assert.equal(partial.complete, false);
  assert.match(mechanismFeedback(partial, m.snapshot()), /1\/2.*还差/);
  reach(m, sources[0].id); m.interact();
  m.setW(sink.center);
  assert.equal(m.snapshot().node, sink.id);
  assert.equal(m.interact(), false);
  assert.match(m.drainEvents().find(e => e.type === 'interact_blocked').text, /正在路上/);
  advance(m, .51);
  const complete = m.drainEvents().find(e => e.type === 'power');
  assert.equal(complete.complete, true);
  assert.match(mechanismFeedback(complete, m.snapshot()), /供能到齐.*按 E/);
  assert.equal(m.snapshot().activated.includes(sink.id), false, 'feedback never activates the sink');
});

test('activation reports its real count; pressing E twice cannot award another activation', () => {
  const m = start('shell', 42); reach(m, m.snapshot().selected); m.drainEvents();
  assert.equal(m.interact(), true);
  const event = m.drainEvents().find(e => e.type === 'activate');
  assert.match(mechanismFeedback(event, m.snapshot()), /已启动 · 1\/3/);
  const before = m.snapshot(); assert.equal(m.interact(), false); assert.deepEqual(m.snapshot(), before);
  assert.match(m.drainEvents()[0].text, /已启动/);
});

test('wave and wrong-layer chest feedback take priority over ordinary E hints', () => {
  const m = start('shell', 42); activateAll(m); reach(m, 'vault');
  const entry = m.snapshot().roomChallenge.entryLayer;
  m.setW(m.snapshot().layers[(entry + 1) % 3].center);
  assert.equal(m.interact(), false);
  assert.match(m.drainEvents().find(e => e.type === 'interact_blocked').text, /开匣先切到/);
  m.setW(m.snapshot().layers[entry].center); m.interact();
  assert.equal(m.interact(), false);
  assert.match(m.drainEvents().find(e => e.type === 'interact_blocked').text, /回流中/);
  for (const topic of ['next', 'slice', 'action']) assert.match(contextualHelp(m.snapshot(), topic), /回流来了/);
});

test('help presents one current action and never mutates the route or exposes a full solution', () => {
  const m = start('shell', 42), before = m.snapshot();
  assert.match(contextualHelp(before, 'action'), /没有回响/);
  assert.match(contextualHelp(before, 'slice'), /跨层支撑/);
  for (const topic of ['next', 'slice', 'action']) {
    const text = contextualHelp(before, topic);
    assert.ok(text.length < 55); assert.doesNotMatch(text, /隐星|符印|棱镜.*线圈/);
  }
  assert.deepEqual(m.snapshot(), before);
  travel(m, before.selected);
  assert.match(contextualHelp(m.snapshot(), 'next'), /按 E/);
});

test('visitor goal explains invisible slice, poke and its response, independently of the pocket', () => {
  const m = new FlatlandModel(0, { seed: 7, playStyle: 'explore' }); m.start();
  assert.equal(m.snapshot().exploration, true);
  m.setSlice(0);
  assert.match(visitorCue(m.snapshot()), /拖 S.*按 E/);
  m.setSlice(3);
  const before = m.snapshot(); assert.match(visitorCue(before), /戳一下球/);
  assert.deepEqual(m.snapshot(), before, 'cue does not adjust slice or move the player');
  assert.equal(m.pokeVisitor(), true);
  assert.match(visitorCue(m.snapshot()), /跳起来了/);
  assert.equal(visitorCue({ ...m.snapshot(), exploration: false }), '');
  assert.equal(visitorCue({ ...m.snapshot(), rings: null }), '');
});
