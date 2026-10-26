import test from 'node:test';
import assert from 'node:assert/strict';
import { FlatlandModel } from '../src/flatland/model.js';
import { FLATLAND_LEVELS } from '../src/flatland/levels.js';
import { keyPoints, flipVertices, flippedPose, FLIP_DURATION } from '../src/flatland/mirror.js';
import { mirrorPar } from '../src/flatland/levels.js';
import { createRandom } from '../src/flatland/random.js';
import { levelIndex, play, wait, goto, solveMirror, types } from './flatland-helpers.js';

const index = levelIndex('mirror');
function pad(m) { goto(m, 5, 6); goto(m, 10, 6); assert.equal(m.carrying, 'mirror-key'); assert.equal(m.canFlip(), true); }
function flip(m) { assert.equal(m.requestFlip(), true); wait(m, FLIP_DURATION + .02); }
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test('rigid flip leaves X fixed, lifts Y into Z at halfway, then returns an exact reflected key', () => {
  for (const chirality of [1, -1]) for (let turns = 0; turns < 4; turns++) {
    const before = keyPoints(chirality, turns), edge = flipVertices(chirality, turns, .5), end = flipVertices(chirality, turns, 1);
    const pose = flippedPose(chirality, turns), after = keyPoints(pose.chirality, pose.turns);
    before.forEach(([x, y], i) => {
      close(edge[i][0], x); close(edge[i][1], 0); close(edge[i][2], y);
      close(end[i][0], after[i][0]); close(end[i][1], after[i][1]); close(end[i][2], 0);
    });
    const during = flipVertices(chirality, turns, .37);
    for (let i = 1; i < before.length; i++) {
      close(Math.hypot(before[i][0] - before[0][0], before[i][1] - before[0][1]), Math.hypot(...during[i].map((n, axis) => n - during[0][axis])));
    }
    assert.deepEqual(flippedPose(pose.chirality, pose.turns), { chirality, turns });
  }
});

test('unequal L arms cannot align to the reflected outline by any of the four planar turns', () => {
  const normalize = points => {
    const minX = Math.min(...points.map(p => p[0])), minY = Math.min(...points.map(p => p[1]));
    return points.map(([x, y]) => `${(x - minX).toFixed(5)},${(y - minY).toFixed(5)}`).sort();
  };
  for (let q = 0; q < 4; q++) assert.notDeepEqual(normalize(keyPoints(1, q)), normalize(keyPoints(-1, 0)));
});

test('mirror requires a picked-up key and the flip pad; S cannot change', () => {
  const m = new FlatlandModel(index, { seed: 3 });
  assert.equal(m.requestFlip(), false);
  m.start();
  assert.equal(m.setSlice(5), false);
  assert.equal(m.canRotateKey(), false);
  goto(m, 3, 10); goto(m, 10, 10); goto(m, 10, 6);
  assert.equal(m.carrying, null);
  assert.equal(m.requestFlip(), false, 'no key yet');
  goto(m, 5, 6);
  assert.equal(m.carrying, 'mirror-key');
  assert.equal(m.requestFlip(), false, 'off the pad');
  goto(m, 10, 6);
  assert.equal(m.requestFlip(), true);
  assert.equal(m.setMove(1, 0), false, 'flipping freezes movement');
  assert.equal(m.rotateKey(), false);
  assert.equal(m.requestFlip(), false, 'no double flip');
  wait(m, FLIP_DURATION + .02);
  assert.deepEqual([m.keyChirality, m.counters.flips], [-1, 1]);
});

test('every seeded lock set mixes both handednesses; par is the cheapest visiting order plus one', () => {
  const level = FLATLAND_LEVELS[index];
  for (let seed = 1; seed <= 80; seed++) {
    const v = level.build(createRandom(seed));
    assert.equal(v.mirrorLocks.length, 3);
    assert.ok(v.mirrorLocks.some(l => l.chirality === 1) && v.mirrorLocks.some(l => l.chirality === -1));
    assert.ok(!v.mirrorLocks.some(l => l.chirality === 1 && l.turns === 0), 'never the starting pose');
    assert.equal(new Set(v.mirrorLocks.map(l => `${l.chirality}:${l.turns}`)).size, 3);
    assert.ok(v.parActions >= 3 && v.parActions <= 9);
  }
  assert.equal(mirrorPar([{ chirality: 1, turns: 1 }]), 1);
  assert.equal(mirrorPar([{ chirality: -1, turns: 0 }]), 1);
  assert.equal(mirrorPar([{ chirality: -1, turns: 1 }, { chirality: 1, turns: 1 }]), 4);
  assert.equal(mirrorPar([{ chirality: 1, turns: 2 }, { chirality: -1, turns: 0 }, { chirality: -1, turns: 1 }]), 4, 'rotating before a flip can be cheaper');
});

test('a wrong pose is rejected once per contact; the matching pose opens the lock', () => {
  const m = play('mirror', 5);
  const lock = m.mirrorLocks.find(l => l.chirality === -1);
  goto(m, 5, 6); goto(m, lock.x, lock.y);
  assert.equal(lock.open, false);
  assert.equal(types(m).filter(t => t === 'lock_reject').length, 1);
  wait(m, .5);
  assert.equal(types(m).filter(t => t === 'lock_reject').length, 0, 'standing still does not repeat');
  goto(m, 10, 6); flip(m);
  while (m.keyTurns !== lock.turns) m.rotateKey();
  goto(m, lock.x, lock.y);
  assert.equal(lock.open, true);
  assert.ok(m.drainEvents().some(e => e.type === 'lock_open' && e.points >= 200));
});

test('the cheapest route opens all three locks within par for three stars', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const m = solveMirror(play('mirror', seed));
    assert.equal(m.phase, 'complete', `seed ${seed}`);
    assert.ok(m.counters.flips + m.counters.planarTurns <= m.variant.parActions);
    assert.deepEqual(m.stars, [true, true, true], `seed ${seed} at ${m.time.toFixed(1)}s`);
  }
});

test('wasted turns cost only the action star; two flips restore the original handedness', () => {
  const m = play('mirror', 8);
  pad(m); flip(m); flip(m);
  assert.equal(m.keyChirality, 1);
  for (let i = 0; i < 8; i++) m.rotateKey();
  assert.equal(m.keyTurns, 0);
  solveMirror(m);
  assert.equal(m.phase, 'complete');
  assert.deepEqual(m.stars.slice(0, 2), [true, false]);
  assert.equal(m.snapshot().stars[1].label.includes(String(m.variant.parActions)), true);
});

test('restart, snapshots and frame limits cannot leak or pre-complete a flip', () => {
  const m = play('mirror', 2);
  pad(m); m.requestFlip(); m.update(100);
  assert.ok(m.flipMotion.elapsed <= .1 + 1e-9);
  const snap = m.snapshot(); snap.mirror.locks[0].open = true;
  assert.equal(m.mirrorLocks[0].open, false);
  m.restart();
  assert.equal(m.flipMotion, null); assert.equal(m.keyChirality, 1); assert.equal(m.carrying, null);
  assert.equal(m.counters.flips, 0);
});
