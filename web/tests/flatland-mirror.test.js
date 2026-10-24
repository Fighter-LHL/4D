import test from 'node:test';
import assert from 'node:assert/strict';
import { FlatlandModel } from '../src/flatland/model.js';
import { FLATLAND_LEVELS } from '../src/flatland/levels.js';
import { keyPoints, flipVertices, flippedPose, FLIP_DURATION } from '../src/flatland/mirror.js';

const index = FLATLAND_LEVELS.findIndex(level => level.id === 'mirror');
function play() { const m = new FlatlandModel(index); m.start(); m.drainEvents(); return m; }
function wait(m, seconds) { for (let t = 0; t < seconds - 1e-9; t += .05) m.update(Math.min(.05, seconds - t)); }
function walk(m, x, seconds) { m.setMove(x, 0); wait(m, seconds); m.setMove(0, 0); }
function pad(m) { walk(m, 1, 1.4); assert.equal(m.carrying, 'mirror-key'); assert.equal(m.canFlip(), true); }
function flip(m, choice = 1) {
  assert.equal(m.requestFlip(), true);
  if (m.flipPrediction.choice === null) assert.equal(m.answerFlipPrediction(choice), true);
  wait(m, FLIP_DURATION);
}
function unlock(m) { walk(m, 1, 1.4); assert.equal(m.phase, 'complete'); }
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

test('mirror requires a picked-up key and the flip pad; S cannot bypass the puzzle', () => {
  const m = new FlatlandModel(index);
  assert.equal(m.requestFlip(), false); assert.equal(m.answerFlipPrediction(1), false);
  m.start();
  assert.equal(m.rotateKey(), false); assert.equal(m.requestFlip(), false);
  assert.equal(m.setSlice(0), false); m.setSliceVelocity(1); wait(m, 1); assert.equal(m.s, 3);
  // Walk around the pickup to reach the pad empty-handed.
  m.setMove(0, -1); wait(m, .8); m.setMove(0, 0); walk(m, 1, 1.4);
  m.setMove(0, 1); wait(m, .8); m.setMove(0, 0);
  assert.equal(m.carrying, null); assert.equal(m.snapshot().mirror.onPad, true); assert.equal(m.requestFlip(), false);
  walk(m, 1, 1.4);
  assert.equal(m.phase, 'playing'); assert.equal(m.snapshot().mirror.lockReason, 'missing-key');
  const carrying = play(); walk(carrying, 1, .4);
  assert.equal(carrying.carrying, 'mirror-key'); assert.equal(carrying.requestFlip(), false);
});

test('unflipped key is rejected in every orientation without repeating rejection every frame', () => {
  const m = play(); walk(m, 1, 2.8);
  for (let q = 0; q < 4; q++) {
    wait(m, .1);
    assert.equal(m.phase, 'playing'); assert.equal(m.keyChirality, 1);
    assert.equal(m.snapshot().mirror.lockReason, 'chirality');
    m.rotateKey();
  }
  wait(m, .1); m.drainEvents(); wait(m, 2);
  assert.ok(!m.drainEvents().some(event => event.type === 'lock_reject'));
  assert.equal(m.counters.flips, 0);
});

test('first prediction blocks movement, rejects invalid or repeated answers and hides correctness until the flip ends', () => {
  const m = play(); pad(m); m.requestFlip(); const player = { ...m.player };
  assert.equal(m.setMove(1, 0), false); assert.equal(m.rotateKey(), false); assert.equal(m.requestFlip(), false);
  wait(m, .2); assert.deepEqual(m.player, player);
  for (const choice of [-1, 3, 1.5, NaN]) assert.equal(m.answerFlipPrediction(choice), false);
  assert.equal(m.answerFlipPrediction(1), true); assert.equal(m.answerFlipPrediction(0), false);
  assert.equal(m.snapshot().mirror.prediction.correct, null);
  assert.equal(m.snapshot().mirror.canRotate, false); assert.equal(m.snapshot().mirror.canFlip, false);
  wait(m, FLIP_DURATION / 2);
  close(m.snapshot().mirror.motion.progress, .5);
  assert.equal(m.keyChirality, 1); assert.equal(m.counters.flips, 0);
  assert.equal(m.setMove(-1, 0), false); assert.equal(m.rotateKey(), false);
  wait(m, FLIP_DURATION / 2);
  assert.deepEqual(m.player, player); assert.equal(m.flipMotion, null);
  assert.equal(m.keyChirality, -1); assert.equal(m.counters.flips, 1);
  assert.equal(m.snapshot().mirror.prediction.correct, true);
});

test('correct first prediction and exactly one physical flip earn three stars and one unlock', () => {
  const m = play(); pad(m); flip(m); unlock(m);
  assert.deepEqual(m.stars, [true, true, true]);
  for (const type of ['flip_start', 'flip_end', 'quiz_answer', 'unlock', 'complete']) {
    assert.equal(m.events.filter(event => event.type === type).length, 1);
  }
  assert.equal(m.requestFlip(), false); assert.equal(m.rotateKey(), false);
  assert.equal(m.answerFlipPrediction(1), false);
});

test('wrong first prediction still permits a one-flip completion, losing only its prediction star', () => {
  const m = play(); pad(m); flip(m, 0); unlock(m);
  assert.equal(m.counters.quizWrong, 1); assert.deepEqual(m.stars, [true, false, true]);
  assert.equal(m.snapshot().mirror.prediction.choice, 0);
});

test('two flips restore the original handedness; a third recovers the route without resetting the first prediction', () => {
  const m = play(); pad(m); flip(m); flip(m);
  assert.equal(m.keyChirality, 1); assert.equal(m.counters.flips, 2);
  walk(m, 1, 1.4); assert.equal(m.phase, 'playing'); assert.equal(m.lockReason, 'chirality');
  walk(m, -1, 1.4); flip(m); unlock(m);
  assert.deepEqual(m.stars, [true, true, false]);
  assert.equal(m.counters.flips, 3);
  assert.equal(m.events.filter(e => e.type === 'flip_predict').length, 1);
});

test('flipping a rotated key reflects its current orientation; planar correction aligns it with the lock', () => {
  const m = play(); pad(m); m.rotateKey(); flip(m);
  assert.equal(m.keyChirality, -1); assert.equal(m.keyTurns, 3);
  walk(m, 1, 1.4); assert.equal(m.phase, 'playing'); assert.equal(m.lockReason, 'orientation');
  m.rotateKey(); wait(m, .05);
  assert.equal(m.phase, 'complete'); assert.deepEqual(m.stars, [true, true, true]);
});

test('restart, snapshots and frame limits cannot leak or pre-complete a flip', () => {
  const m = play(); pad(m); m.requestFlip();
  const snap = m.snapshot(); snap.mirror.prediction.options[1].points[0][0] = -999;
  assert.notEqual(m.snapshot().mirror.prediction.options[1].points[0][0], -999);
  m.answerFlipPrediction(1); m.update(60);
  close(m.flipMotion.elapsed, .1); assert.equal(m.keyChirality, 1);
  const motion = m.snapshot(); motion.mirror.motion.elapsed = 999;
  close(m.flipMotion.elapsed, .1);
  m.restart(); assert.equal(m.flipMotion, null); assert.equal(m.flipPrediction, null);
  assert.equal(m.carrying, null); assert.equal(m.keyChirality, 1); assert.equal(m.counters.flips, 0);
  m.start(); pad(m); flip(m); unlock(m);
  assert.deepEqual(m.stars, [true, true, true]);
});
