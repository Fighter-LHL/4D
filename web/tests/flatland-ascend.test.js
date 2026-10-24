import test from 'node:test';
import assert from 'node:assert/strict';
import { FlatlandModel } from '../src/flatland/model.js';
import { FLATLAND_LEVELS, UPCOMING } from '../src/flatland/levels.js';
import { ASCEND_BOXES, boxPresent, sphereHitsBox, roomBlocker } from '../src/flatland/ascend.js';
import { COURTYARD_ENTRY, isFlatlandArrival } from '../src/flatland/handoff.js';
import { normalizeProgress, isLevelUnlocked } from '../src/flatland/progress.js';

const index = FLATLAND_LEVELS.findIndex(level => level.id === 'ascend');
const play = () => { const m = new FlatlandModel(index); m.start(); m.drainEvents(); return m; };
function wait(m, seconds) { for (let t = 0; t < seconds - 1e-9; t += .05) m.update(Math.min(.05, seconds - t)); }
function slide(m, target) { const reached = m.setSlice(target); m.endSliceGesture(); return reached; }
function walk(m, x, z, seconds) { m.setMove(x, z); wait(m, seconds); m.setMove(0, 0); }
function flat(m) { slide(m, 4); walk(m, 1, 0, 1.4); slide(m, 1); wait(m, .05); }
function volume() { const m = play(); flat(m); wait(m, 4); m.drainEvents(); return m; }
function finish(m) { slide(m, .82); walk(m, 1, 0, (17 - m.player.x) / 5); slide(m, .18); wait(m, .05); }

test('ascend opens after mirror, preserves existing stars and completes the six-level catalogue', () => {
  assert.equal(index, 5); assert.deepEqual(UPCOMING, []);
  const progress = normalizeProgress({ mirror: 3, vault: 2 }, FLATLAND_LEVELS);
  assert.deepEqual(progress, { vault: 2, mirror: 3 });
  assert.equal(isLevelUnlocked(FLATLAND_LEVELS, progress, index), true);
  assert.equal(isLevelUnlocked(FLATLAND_LEVELS, { vault: 3 }, index), false);
});

test('flat recap must reach the actual low flag before starting the transition', () => {
  const m = play(); slide(m, 4); walk(m, 1, 0, 1.4);
  assert.equal(m.ascend.stage, 'flat');
  assert.equal(m.snapshot().ascend.readyForCourtyard, false);
  slide(m, 1); wait(m, .05);
  assert.equal(m.ascend.stage, 'transition'); assert.equal(m.ascend.flatComplete, true);
  assert.equal(m.phase, 'playing'); assert.equal(m.snapshot().ascend.readyForCourtyard, false);
  assert.deepEqual(m.stars, [false, false, false]);
  assert.equal(m.drainEvents().filter(e => e.type === 'dimension_start').length, 1);
});

test('transition rejects movement and slice input, clamps large frames and initializes W only once', () => {
  const m = play(); flat(m);
  const p = { ...m.player }, s = m.s, start = m.ascend.elapsed;
  assert.equal(m.setMove(1, 1), false); assert.equal(m.setSlice(.82), false); assert.equal(m.setSliceVelocity(1), false);
  m.update(100);
  assert.ok(m.ascend.elapsed - start <= .10001); assert.deepEqual(m.player, p); assert.equal(m.s, s);
  wait(m, 4);
  assert.equal(m.ascend.stage, 'volume'); assert.equal(m.s, .18);
  assert.deepEqual(m.ascend.position, { x: 10, y: .4, z: 6 });
  assert.equal(m.snapshot().ascend.progress, 1);
  assert.deepEqual(m.input, { x: 0, y: 0, slice: 0 });
  assert.equal(m.goals[0].done, false);
  wait(m, 4);
  assert.equal(m.drainEvents().filter(e => e.type === 'dimension_ready').length, 1);
});

test('3D collision includes walls, roof and floor, while W keeps XYZ fixed', () => {
  assert.equal(roomBlocker({ x: 12.8, y: 1, z: 6 }, .4, .18), 'room-e');
  assert.equal(roomBlocker({ x: 10, y: 3, z: 6 }, .4, .18), 'roof');
  assert.equal(roomBlocker({ x: 10, y: .2, z: 6 }, .4, .82), 'floor');
  assert.equal(roomBlocker({ x: 10, y: .4, z: 6 }, .4, .18), null, 'touching the supporting floor is valid');
  assert.equal(roomBlocker({ x: 12.8, y: 1, z: 6 }, .4, .82), null);
  const m = volume(), p = { ...m.ascend.position };
  for (const w of [.82, 1, .18, 0, .5]) { slide(m, w); wait(m, .05); assert.deepEqual(m.ascend.position, p); }
  assert.equal(m.phase, 'playing'); assert.equal(m.ascend.leftRoom, false);
  assert.equal(m.snapshot().ascend.boxes.filter(b => b.present && b.role === 'wall').length, 4);
  const gate = ASCEND_BOXES.find(b => b.role === 'goal');
  assert.equal(boxPresent(gate, .32), true); assert.equal(boxPresent(gate, .33), false);
  assert.equal(sphereHitsBox({ x: 17, y: .4, z: 6 }, .4, gate), true);
  assert.equal(sphereHitsBox({ x: 17, y: 3, z: 6 }, .4, gate), false);
});

test('both escapes and a real return to the gate W earn three stars in four gestures', () => {
  const m = volume(); slide(m, .82); walk(m, 1, 0, 1.4);
  assert.equal(m.ascend.leftRoom, true); assert.equal(m.phase, 'playing', 'high-W ghost gate cannot finish');
  assert.equal(m.snapshot().ascend.readyForCourtyard, false);
  slide(m, .18); wait(m, .05);
  assert.equal(m.phase, 'complete'); assert.deepEqual(m.stars, [true, true, true]);
  assert.equal(m.counters.sliceMoves, 4); assert.equal(m.counters.blockedCount, 0);
  assert.equal(m.snapshot().ascend.readyForCourtyard, true);
  const position = { ...m.ascend.position }; walk(m, 1, 0, 1);
  assert.deepEqual(m.ascend.position, position); assert.equal(m.setSlice(.82), false);
  assert.equal(m.drainEvents().filter(e => e.type === 'complete').length, 1);
  assert.equal(m.next(), false);
});

test('returning W into a wall stops before intersection and remains recoverable', () => {
  const m = volume(); slide(m, .82); walk(m, 1, 0, .56); m.drainEvents();
  const p = { ...m.ascend.position };
  assert.equal(slide(m, .18), false);
  assert.ok(m.s > .58 && m.s < .586, `blocked at ${m.s}`);
  assert.deepEqual(m.ascend.position, p);
  assert.equal(roomBlocker(p, .4, m.s), null);
  assert.equal(m.snapshot().ascend.blocked, 'room-e');
  assert.deepEqual(m.drainEvents().filter(e => e.type === 'blocked').map(e => e.solid), ['room-e']);
  m.setSlice(.18); assert.equal(m.counters.blockedCount, 1, 'held input is not repeated feedback');
  m.endSliceGesture();
  walk(m, 1, 0, (17 - m.player.x) / 5); slide(m, .18); wait(m, .05);
  assert.equal(m.phase, 'complete'); assert.equal(m.stars[0], true); assert.equal(m.stars[2], false);
});

test('walking cannot cross a present wall, but leaving its W permits escape after a bump', () => {
  const m = volume(); walk(m, 1, 0, 2);
  assert.ok(m.player.x <= 12.2 + 1e-9); assert.equal(m.counters.blockedCount, 1);
  finish(m); assert.equal(m.phase, 'complete'); assert.deepEqual(m.stars, [true, true, false]);
});

test('W gesture micro-adjustments do not inflate counts and keyboard release commits once', () => {
  const m = volume(); const before = m.counters.sliceMoves;
  for (const w of [.19, .2, .21]) slide(m, w);
  assert.equal(m.counters.sliceMoves, before);
  m.setSliceVelocity(1); wait(m, 1); m.setSliceVelocity(0);
  assert.ok(Math.abs(m.s - .61) < 1e-8); assert.equal(m.counters.sliceMoves, before + 1);
  assert.equal(m.setSlice(NaN), false); assert.equal(m.setMove(Infinity, 1), false);
});

test('restart during transition, exploration or completion clears stage, held input and old effects', () => {
  for (const stage of ['transition', 'volume', 'complete']) {
    const m = play(); flat(m);
    if (stage !== 'transition') wait(m, 4);
    if (stage === 'complete') finish(m);
    assert.equal(stage === 'complete' ? m.phase : m.ascend.stage, stage);
    m.setMove(1, 0); m.setSliceVelocity(1); m.restart();
    assert.equal(m.phase, 'intro'); assert.equal(m.ascend.stage, 'flat'); assert.equal(m.s, 1);
    assert.equal(m.snapshot().ascend.readyForCourtyard, false); assert.equal(m.ascend.flatComplete, false);
    assert.equal(m.counters.sliceMoves, 0); assert.deepEqual(m.input, { x: 0, y: 0, slice: 0 });
    assert.deepEqual(m.drainEvents().map(e => e.type), ['load']);
    m.start(); wait(m, 5); assert.equal(m.ascend.stage, 'flat');
  }
});

test('volume snapshot does not expose mutable position or room geometry and hints change to W', () => {
  const m = volume(), snap = m.snapshot();
  snap.ascend.position.x = -99; snap.ascend.boxes[0].min[0] = -99;
  assert.equal(m.snapshot().ascend.position.x, 10); assert.equal(m.snapshot().ascend.boxes[0].min[0], 0);
  wait(m, 19); assert.match(m.hint, /W/);
  assert.deepEqual(m.snapshot().abilities, { peek: false, flip: false }); assert.equal(m.carrying, null);
});

test('formal entry copy requires completed ascend progress and uses a normal courtyard URL', () => {
  assert.equal(COURTYARD_ENTRY, './?from=flatland');
  for (const saved of [null, [], {}, { mirror: 3 }, { ascend: 0 }, { ascend: 4 }, { ascend: '3' }, { ascend: 1.5 }]) assert.equal(isFlatlandArrival('?from=flatland', saved), false);
  for (const ascend of [1, 2, 3]) assert.equal(isFlatlandArrival('?from=flatland&seed=4', { ascend }), true);
  assert.equal(isFlatlandArrival('?seed=4', { ascend: 3 }), false);
});
