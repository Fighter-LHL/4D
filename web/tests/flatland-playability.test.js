import test from 'node:test';
import assert from 'node:assert/strict';
import { FLATLAND_LEVELS } from '../src/flatland/levels.js';
import { parseSeed } from '../src/flatland/random.js';
import { FLIP_DURATION } from '../src/flatland/mirror.js';
import { play, wait, walk, goto } from './flatland-helpers.js';

test('challenge URLs accept zero and the uint32 boundary but reject ambiguous seeds', () => {
  for (const [value, expected] of [['0', 0], ['42', 42], ['4294967295', 4294967295]]) assert.equal(parseSeed(value), expected);
  for (const value of [null, '', ' ', '-1', '1.2', '1e3', '42x', '4294967296', '99999999999']) assert.equal(parseSeed(value), null);
});

test('pause freezes every level and ignores movement, slicing and ability input', () => {
  for (const level of FLATLAND_LEVELS) {
    const m = play(level.id, 42);
    m.setMove(1, 0); m.setSliceVelocity(1); wait(m, .2);
    assert.equal(m.setPaused(true), true);
    const before = m.snapshot();
    assert.equal(m.setMove(1, 1), false);
    assert.equal(m.setSlice(5), false);
    assert.equal(m.setSliceVelocity(1), false);
    assert.equal(m.setPeek(true), false);
    assert.equal(m.reveal(), false);
    assert.equal(m.rotateKey(), false);
    assert.equal(m.requestFlip(), false);
    wait(m, 5);
    assert.deepEqual(m.snapshot(), before, level.id);
    m.setPaused(false); wait(m, .1);
    assert.ok(m.time > before.time);
    assert.deepEqual([m.player.x, m.player.y, m.s], [before.player.x, before.player.y, before.s], 'held input does not return');
    m.restart(); assert.equal(m.paused, false);
  }
});

test('pausing a mirror flip preserves the exact animation and completes only after resume', () => {
  const m = play('mirror'); goto(m, 5, 6); goto(m, 10, 6); m.requestFlip(); wait(m, .1);
  m.setPaused(true); const before = m.snapshot(); wait(m, 2);
  assert.deepEqual(m.snapshot(), before);
  m.setPaused(false); wait(m, FLIP_DURATION);
  assert.equal(m.counters.flips, 1);
});

test('pause also freezes the dimension transition and its later W controls', () => {
  const m = play('ascend'); m.setSlice(4); walk(m, 1, 0, 1.4); m.setSlice(1); wait(m, .05);
  assert.equal(m.ascend.stage, 'transition');
  m.setPaused(true); const before = m.snapshot(); wait(m, 5);
  assert.deepEqual(m.snapshot(), before);
  m.setPaused(false); wait(m, 4); assert.equal(m.ascend.stage, 'volume');
  m.setPaused(true); const volume = m.snapshot();
  assert.equal(m.setSlice(.82), false); wait(m, 2);
  assert.deepEqual(m.snapshot(), volume);
});

test('precision is continuous and slow even after acceleration, without adding gestures', () => {
  const m = play('visitor');
  m.setSliceVelocity(1); wait(m, .6); const s = m.s;
  m.setPrecision(true); wait(m, 1);
  assert.ok(Math.abs(m.s - s - .35) < 1e-8);
  m.setSliceVelocity(0);
  assert.equal(m.counters.sliceMoves, 1);
  m.setPaused(true); assert.equal(m.precision, false);
});

function grazeSetup() {
  const m = play('storm', 2);
  m.storm.nextSpawn = m.storm.nextShard = Infinity;
  m.player.x = 11.55;
  m.lastGrazePose = { x: m.player.x, y: m.player.y, s: m.s };
  m.hazards = [{ id: 'near', kind: 'sphere', center: [10, 6, 3], r: 1, velocity: [0, 0, 0] }];
  return m;
}

test('an active near miss pays once on safe exit, without changing shard combo', () => {
  const m = grazeSetup();
  walk(m, 0, 1, .08);
  assert.equal(m.storm.grazes, 0);
  assert.equal(m.snapshot().storm.nearMiss, true);
  walk(m, 0, 1, .15);
  assert.equal(m.storm.grazes, 1);
  assert.equal(m.combo.count, 0);
  assert.equal(m.drainEvents().find(e => e.type === 'graze').points, 75);
  walk(m, 0, -1, .23); walk(m, 0, 1, .23);
  assert.equal(m.storm.grazes, 1, 'same obstacle cannot be farmed');
  m.restart(); assert.equal(m.storm.grazes, 0);
});

test('continuous slice movement can earn a near miss; standing still and teleports cannot', () => {
  const m = grazeSetup(); m.setSliceVelocity(1); wait(m, 1.2);
  assert.equal(m.storm.grazes, 1);
  const idle = grazeSetup(); wait(idle, 1); idle.setSlice(6); wait(idle, .1);
  assert.equal(idle.storm.grazes, 0);
});

test('a collision cancels pending near misses and invulnerability grants none', () => {
  const m = grazeSetup(); walk(m, 0, 1, .08);
  walk(m, -1, 0, .15);
  assert.equal(m.storm.lives, 2);
  walk(m, 1, 0, .4);
  assert.equal(m.storm.grazes, 0);
  wait(m, 2); walk(m, 0, 1, .3);
  assert.equal(m.storm.grazes, 0);
  const safe = grazeSetup(); safe.safeUntil = 10; walk(safe, 0, 1, .3);
  assert.equal(safe.storm.grazes, 0);
});

test('a generated storm near miss is reproducible at 30, 60 and 120 frames per second', () => {
  const results = [30, 60, 120].map(fps => {
    const m = play('storm', 4);
    for (let i = 0; i < fps * 6; i++) m.update(1 / fps);
    m.setMove(1, 0);
    for (let i = 0; i < fps * 1.5; i++) m.update(1 / fps);
    return { lives: m.storm.lives, grazes: m.storm.grazes, events: m.drainEvents().filter(e => e.type === 'graze').map(e => [e.id, e.points]) };
  });
  assert.equal(results[0].grazes, 1);
  assert.equal(results[0].lives, 3);
  assert.deepEqual(results[1], results[0]); assert.deepEqual(results[2], results[0]);
});
