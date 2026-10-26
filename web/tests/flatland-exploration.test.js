import test from 'node:test';
import assert from 'node:assert/strict';
import { FlatlandModel } from '../src/flatland/model.js';
import { shapeCentroid } from '../src/flatland/geometry.js';
import { levelIndex, goto, wait, slide, playVisitor, solveLocks } from './flatland-helpers.js';

function roam(id, seed = 42) {
  const m = new FlatlandModel(levelIndex(id), { seed, playStyle: 'explore' }); m.start(); return m;
}

test('visitor needs both the right slice and proximity to the ring in exploration', () => {
  const m = roam('visitor'), radius = m.rings.list[0], height = 3 - Math.sqrt(2.5 ** 2 - radius ** 2);
  slide(m, height); wait(m, 1); assert.equal(m.rings.hits, 0, 'correct slice alone cannot catch a distant ring');
  slide(m, 0); goto(m, 10 - radius, 6); wait(m, .4);
  assert.equal(m.rings.hits, 0, 'standing on the ring needs a matching section');
  slide(m, height); wait(m, .3); assert.equal(m.rings.hits, 1);
});

test('shape locks travel with the avatar and require both XY alignment and a matching slice', () => {
  const m = roam('guess'), first = m.locks.list[0];
  slide(m, first.target); wait(m, 1); assert.equal(m.locks.times.length, 0);
  const shape = m.snapshot().sections.find(s => s.id === first.solid.id).shape;
  const center = shapeCentroid(shape);
  assert.ok(Math.hypot(center[0] - m.player.x, center[1] - m.player.y) < 1e-8);
  slide(m, 0); goto(m, ...first.stamp); wait(m, .4); assert.equal(m.locks.times.length, 0);
  slide(m, first.target); wait(m, .4); assert.equal(m.locks.times.length, 1);
  assert.equal(m.snapshot().locks.prints.length, 1);
  wait(m, .8); const cone = m.locks.list[1];
  assert.notDeepEqual(first.stamp, cone.stamp); slide(m, .2); goto(m, ...cone.stamp); wait(m, .4);
  assert.equal(m.locks.times.length, 1); slide(m, cone.target); wait(m, .4); assert.equal(m.locks.times.length, 2);
});

test('moving rings and all five floor stamps remain solvable across twelve seeds', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const visitor = roam('visitor', seed); playVisitor(visitor);
    assert.equal(visitor.cleared, true, `visitor ${seed}`); assert.equal(visitor.rings.hits, 6);
    const locks = roam('guess', seed); solveLocks(locks);
    assert.equal(locks.cleared, true, `guess ${seed}`); assert.equal(locks.snapshot().locks.prints.length, 5);
    assert.equal(locks.phase, 'playing');
  }
});
