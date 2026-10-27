import test from 'node:test';
import assert from 'node:assert/strict';
import { FlatlandModel } from '../src/flatland/model.js';
import { FRIENDS, normalizeCollection } from '../src/flatland/discoveries.js';
import { FLIP_DURATION } from '../src/flatland/mirror.js';
import { levelIndex, goto, wait, walk, slide, playVisitor, solveLocks, runEscape } from './flatland-helpers.js';

function roam(id, seed = 42, collection) {
  const m = new FlatlandModel(levelIndex(id), { seed, playStyle: 'explore', collection }); m.start(); m.drainEvents(); return m;
}
function chase(m) {
  const path = structuredClone(m.encounter.path);
  slide(m, 4.7); goto(m, path[0].x, path[0].y); wait(m, .3);
  goto(m, path[1].x, path[1].y); slide(m, path[1].z); wait(m, .65);
  goto(m, path[2].x, path[2].y); slide(m, path[2].z); wait(m, .65);
}
function wake(m) {
  slide(m, 4.8); goto(m, m.encounter.x, m.encounter.y);
  m.setPeek(true); wait(m, .5); m.setPeek(false); wait(m, 1.4);
  slide(m, m.encounter.z); wait(m, .3);
}
function reflect(m) {
  goto(m, 5, 6); goto(m, 10, 6); m.requestFlip(); wait(m, FLIP_DURATION + .05);
  for (let i = 0; i < m.encounter.turns; i++) m.rotateKey();
  goto(m, m.encounter.x, m.encounter.y); wait(m, .3);
}

test('each friend can be found through real movement and abilities across 12 seeded layouts', () => {
  for (let seed = 1; seed <= 12; seed++) for (const [level, solve, id] of [['escape', chase, 'sprout'], ['vault', wake, 'lantern'], ['mirror', reflect, 'ribbon']]) {
    const m = roam(level, seed); solve(m);
    assert.equal(m.encounter.found, true, `${level} seed ${seed}`);
    assert.deepEqual(m.collection, { found: [id], companion: id });
    assert.equal(m.drainEvents().filter(e => e.type === 'friend_found').length, 1);
    wait(m, 3); assert.equal(m.drainEvents().filter(e => e.type === 'friend_found').length, 0);
  }
});

test('chase requires the current layer and leaves a visible trace without revealing future positions', () => {
  const m = roam('escape');
  goto(m, 11, 5); wait(m, 1); assert.equal(m.encounter.step, 0);
  const view = m.snapshot().encounter;
  assert.equal(view.trace, true); assert.equal(view.visible, false);
  assert.equal(view.path, undefined); assert.equal(view.z, undefined);
  slide(m, 4.7); wait(m, .3);
  assert.equal(m.encounter.step, 1);
  assert.ok(m.drainEvents().some(e => e.type === 'friend_hop'));
});

test('sleeping friend is hidden behind the box and needs a nearby overhead peek to wake', () => {
  const m = roam('vault');
  assert.equal(m.snapshot().encounter.visible, false);
  assert.equal(m.snapshot().encounter.trace, false);
  slide(m, 4.8);
  assert.equal(m.snapshot().encounter.trace, true, 'climbing above the box reveals the snoring trace');
  m.setPeek(true); wait(m, 1);
  assert.equal(m.encounter.step, 0, 'a distant peek only reveals the sleeper');
  m.setPeek(false); goto(m, m.encounter.x, m.encounter.y); wait(m, 1);
  assert.equal(m.encounter.step, 0, 'standing above is not the interaction');
  m.setPeek(true); wait(m, .2); m.setPeek(false); wait(m, .1);
  assert.equal(m.encounter.hold, 0, 'brief peeks do not accumulate invisibly');
  m.setPeek(true); wait(m, .5); assert.equal(m.encounter.step, 1);
  m.setPaused(true); const before = m.snapshot(); wait(m, 3); assert.deepEqual(m.snapshot(), before);
  m.setPaused(false); wait(m, 2); assert.equal(m.encounter.found, true);
});

test('mirror friend rejects the wrong hand or orientation, then recognises the real flipped key', () => {
  const m = roam('mirror'); goto(m, 5, 6);
  for (let i = 0; i < m.encounter.turns; i++) m.rotateKey();
  goto(m, m.encounter.x, m.encounter.y); wait(m, .5);
  assert.equal(m.encounter.found, false);
  goto(m, 10, 6); m.requestFlip(); wait(m, FLIP_DURATION + .05);
  while (m.keyTurns !== m.encounter.turns) m.rotateKey();
  goto(m, m.encounter.x, m.encounter.y); wait(m, .3);
  assert.equal(m.encounter.found, true);
});

test('exploration has no ring expiry or forced end screen; completed worlds remain playable', () => {
  const visitor = roam('visitor'); wait(visitor, 40);
  assert.equal(visitor.rings.index, 0); assert.equal(visitor.rings.results.length, 0);
  playVisitor(visitor); assert.equal(visitor.cleared, true); assert.equal(visitor.phase, 'playing');
  assert.equal(visitor.snapshot().rings.active, false);
  assert.equal(visitor.setSlice(3), true); wait(visitor, 2);
  const locks = roam('guess'); solveLocks(locks);
  assert.equal(locks.cleared, true); assert.equal(locks.phase, 'playing');
  assert.equal(locks.snapshot().locks.active, false); wait(locks, 2);
  const escape = roam('escape'); runEscape(escape);
  assert.equal(escape.cleared, true); assert.equal(escape.phase, 'playing');
  assert.deepEqual(escape.stars, [false, false, false]);
  assert.equal(escape.drainEvents().filter(e => e.type === 'explore_clear').length, 1);
  const x = escape.player.x; walk(escape, -1, 0, .1); assert.ok(escape.player.x < x);
  assert.equal(escape.drainEvents().filter(e => e.type === 'explore_clear').length, 0);
});

test('collection survives level changes and reload; re-encounters do not duplicate finds', () => {
  const m = roam('escape'); chase(m); m.load(levelIndex('vault')); m.start(); wake(m);
  m.load(levelIndex('mirror')); m.start(); reflect(m);
  assert.deepEqual([...m.collection.found].sort(), FRIENDS.map(f => f.id).sort());
  assert.equal(m.setCompanion('all'), true);
  const restored = roam('escape', 42, JSON.parse(JSON.stringify(m.snapshot().collection)));
  assert.equal(restored.collection.companion, 'all');
  chase(restored); assert.equal(restored.collection.found.length, 3);
  assert.equal(restored.collection.companion, 'all');
  assert.equal(restored.drainEvents().find(e => e.type === 'friend_found').fresh, false);
  const snap = restored.snapshot(); snap.collection.found.length = 0;
  assert.equal(restored.collection.found.length, 3);
});

test('companion action has a cooldown, respects pause, and no reward without contact', () => {
  const m = roam('escape'); assert.equal(m.petCompanion(), false); assert.equal(m.setCompanion('all'), false);
  chase(m); const before = m.score;
  assert.equal(m.petCompanion(), true); assert.equal(m.petCompanion(), false);
  m.setPaused(true); wait(m, 5); assert.equal(m.petCompanion(), false);
  m.setPaused(false); wait(m, 2.6); assert.equal(m.petCompanion(), true);
  assert.equal(m.score, before); assert.equal(m.collection.found.length, 1);
});

test('malformed collection data cannot create friends or unlock the group reward', () => {
  for (const value of [null, 'all', { found: 'sprout' }, { found: ['unknown'], companion: 'all' }]) assert.deepEqual(normalizeCollection(value), { found: [], companion: null });
  assert.deepEqual(normalizeCollection({ found: ['sprout', 'sprout', 'unknown'], companion: 'all' }), { found: ['sprout'], companion: 'sprout' });
});

test('poking the visitor moves the actual sphere through the slice, pauses and returns', () => {
  const m = roam('visitor'); slide(m, 3);
  const radius = () => m.snapshot().sections.find(s => s.role === 'visitor').shape.r;
  const before = radius();
  assert.equal(m.pokeVisitor({ x: 0, y: 0 }), false);
  assert.equal(m.pokeVisitor({ x: 10, y: 6 }), true);
  assert.equal(m.pokeVisitor(), false);
  wait(m, .6); assert.ok(radius() < before - .1);
  m.setPaused(true); const frozen = m.snapshot(); wait(m, 2);
  assert.deepEqual(m.snapshot(), frozen); assert.equal(m.pokeVisitor(), false);
  m.setPaused(false); wait(m, .65); assert.ok(Math.abs(radius() - before) < 1e-8);
  assert.equal(m.pokeVisitor(), true);
  const challenge = new FlatlandModel(0, { seed: 42 }); challenge.start(); challenge.setSlice(3);
  assert.equal(challenge.pokeVisitor(), false);
});
