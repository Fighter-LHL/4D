import test from 'node:test';
import assert from 'node:assert/strict';
import { FlatlandModel, RETURN_GRACE } from '../src/flatland/model.js';
import { FLATLAND_LEVELS } from '../src/flatland/levels.js';
import { guardPose, guardSees, sightFan, lowerPrismGhosts } from '../src/flatland/perception.js';
import { segmentHitsShape } from '../src/flatland/geometry.js';

const vault = FLATLAND_LEVELS.findIndex(level => level.id === 'vault');
function play() { const model = new FlatlandModel(vault); model.start(); model.drainEvents(); return model; }
function wait(model, seconds) { for (let t = 0; t < seconds - 1e-9; t += .05) model.update(Math.min(.05, seconds - t)); }
function slide(model, s) { model.setSlice(s); model.endSliceGesture(); }
function walk(model, x, y, seconds) { model.setMove(x, y); wait(model, seconds); model.setMove(0, 0); }
function takeKey(model) {
  slide(model, 5); walk(model, 1, 0, 1.4); slide(model, 1.2); wait(model, .05);
  assert.equal(model.carrying, 'vault-key');
}
function exitWithKey(model) { slide(model, 5); walk(model, 1, 0, 1.4); slide(model, 1.2); wait(model, .05); }
const wall = { type: 'polygon', points: [[2, -2], [2.2, -2], [2.2, 2], [2, 2]] };
const guard = { x: 0, y: 0, facing: 0, r: .3, range: 4, halfAngle: Math.PI / 4, z: [.85, 1.55] };

test('sight intersects crossing, tangent and contained segments without treating disjoint collinear edges as walls', () => {
  assert.equal(segmentHitsShape([0, 0], [3, 0], wall), true);
  assert.equal(segmentHitsShape([0, 2], [3, 2], wall), true);
  assert.equal(segmentHitsShape([2.05, 0], [2.15, 0], wall), true);
  assert.equal(segmentHitsShape([0, 3], [3, 3], wall), false);
  assert.equal(segmentHitsShape([0, 2], [1, 2], wall), false);
  assert.equal(segmentHitsShape([0, 1], [4, 1], { type: 'circle', cx: 2, cy: 0, r: 1 }), true);
});

test('guards require matching height, range and facing, with walls occluding their view', () => {
  const player = { x: 3, y: 0, r: .4 };
  assert.equal(guardSees(guard, player, 1.2, []), true);
  assert.equal(guardSees(guard, player, 5, []), false);
  assert.equal(guardSees(guard, { ...player, x: 5 }, 1.2, []), false);
  assert.equal(guardSees(guard, { ...player, x: -3 }, 1.2, []), false);
  assert.equal(guardSees(guard, { ...player, x: -.2 }, 1.2, []), true, 'touching a guard is detectable from behind');
  assert.equal(guardSees(guard, player, 1.2, [wall]), false);
  const points = sightFan(guard, [wall]);
  assert.ok(points.slice(1).every(([x]) => x <= 2.001), 'visible cones end at the blocking wall');
});

test('patrols turn at endpoints and use game time, with a safe entrance throughout both cycles', () => {
  const def = FLATLAND_LEVELS[vault].guards[0];
  assert.equal(guardPose(def, 0).y, 4.5);
  assert.equal(guardPose(def, 3).y, 7.5);
  assert.equal(guardPose(def, 6).y, 4.5);
  const model = play(), before = model.snapshot().guards;
  assert.deepEqual(model.snapshot().guards, before);
  wait(model, 30);
  assert.equal(model.counters.guardAlerts, 0);
  assert.equal(model.player.x, 3);
});

test('peek reveals lower hidden sections without leaking side profiles or granting remote pickups', () => {
  const model = play();
  assert.deepEqual(model.snapshot().profiles, []);
  assert.ok(!model.snapshot().sections.some(section => section.id === 'vault-key'), 'box hides the key at eye height');
  slide(model, 5); model.setPeek(true);
  const snap = model.snapshot();
  assert.equal(snap.sections.length, 0);
  assert.equal(snap.ghostGuards.length, 2);
  assert.ok(snap.ghosts.some(section => section.id === 'vault-key'));
  snap.ghosts[0].shape.points[0][0] = -999;
  snap.ghosts[0].z[0] = -999;
  snap.ghostGuards[0].z[0] = -999;
  assert.notEqual(model.snapshot().ghosts[0].shape.points[0][0], -999);
  assert.notEqual(model.snapshot().ghosts[0].z[0], -999);
  assert.notEqual(model.snapshot().ghostGuards[0].z[0], -999);
  walk(model, 1, 0, 1.4);
  assert.equal(model.carrying, null, 'overlapping a ghost is not a pickup');
  slide(model, 2); wait(model, .1);
  assert.equal(model.carrying, null);
  assert.ok(model.snapshot().ghosts.some(section => section.id === 'vault-key'));
  model.setPeek(false);
  assert.deepEqual(model.snapshot().ghosts, []);
  slide(model, 1.2); wait(model, .05);
  assert.equal(model.carrying, 'vault-key');
  assert.ok(!model.snapshot().sections.some(section => section.id === 'vault-key'));
  slide(model, 5); model.setPeek(true);
  assert.ok(!model.snapshot().ghosts.some(section => section.id === 'vault-key'), 'collected keys are absent from the overlay');
  assert.deepEqual(lowerPrismGhosts(FLATLAND_LEVELS[vault].solids, 0), []);
});

test('peek counts holds once, rejects unavailable phases and resets on restart', () => {
  const model = new FlatlandModel(vault);
  assert.equal(model.setPeek(true), false);
  model.start();
  for (let i = 0; i < 20; i++) model.setPeek(true);
  assert.equal(model.counters.peekUses, 1);
  assert.equal(model.drainEvents().filter(event => event.type === 'peek_start').length, 1);
  model.setPeek(false); model.setPeek(true);
  assert.equal(model.counters.peekUses, 2);
  model.restart();
  assert.equal(model.peek, false);
  assert.equal(model.counters.peekUses, 0);
  const visitor = new FlatlandModel(0); visitor.start();
  assert.equal(visitor.setPeek(true), false);
});

test('vault intended route earns three stars; completion stops peek and emits pickup and unlock once', () => {
  const model = play();
  slide(model, 5); model.setPeek(true);
  takeKey(model); exitWithKey(model);
  assert.equal(model.phase, 'complete');
  assert.deepEqual(model.stars, [true, true, true]);
  assert.equal(model.peek, false);
  assert.equal(model.setPeek(true), false);
  const events = model.drainEvents();
  for (const type of ['pickup', 'unlock', 'complete', 'peek_end']) assert.equal(events.filter(event => event.type === type).length, 1);
});

test('door requires the actual key and its active height, and the box blocks downward slicing', () => {
  const model = play();
  slide(model, 5); walk(model, 1, 0, 2.8); slide(model, 1.2); wait(model, .05);
  assert.equal(model.doorLocked, true);
  assert.equal(model.phase, 'playing');
  slide(model, 5); walk(model, -1, 0, 1.4); slide(model, 1.2); wait(model, .05);
  assert.equal(model.carrying, 'vault-key');
  slide(model, 5); walk(model, 1, 0, 1.4); wait(model, .1);
  assert.equal(model.phase, 'playing', 'high ghost doorway cannot complete');
  slide(model, 1.2); wait(model, .05);
  assert.equal(model.phase, 'complete');
  const blocked = play(); slide(blocked, 5); walk(blocked, 1, 0, 1.04);
  assert.equal(blocked.setSlice(1.2), false);
  assert.ok(blocked.s > 4 && blocked.s < 4.02);
  assert.ok(blocked.drainEvents().some(event => event.type === 'blocked' && event.solid === 'box-w'));
});

test('capture clears held inputs, stops peek and grants a short recovery without repeated alerts', () => {
  const model = play(); model.setPeek(true); model.setMove(1, 0);
  for (let i = 0; i < 100 && !model.counters.guardAlerts; i++) model.update(.05);
  assert.equal(model.counters.guardAlerts, 1);
  assert.equal(model.player.x, 3); assert.equal(model.player.y, 6); assert.equal(model.s, 1.2);
  assert.deepEqual(model.input, { x: 0, y: 0, slice: 0 });
  assert.equal(model.peek, false);
  assert.equal(model.snapshot().alert.returnedKey, false);
  assert.equal(model.setMove(1, 0), false);
  assert.equal(model.setSlice(5), false);
  assert.equal(model.setPeek(true), false);
  wait(model, RETURN_GRACE + .1);
  assert.equal(model.canSlice(), true);
  wait(model, 10);
  assert.equal(model.counters.guardAlerts, 1);
  assert.equal(model.player.x, 3);
  assert.equal(model.phase, 'playing');
});

test('capture after pickup restores the key and objectives, then allows a complete second attempt', () => {
  const model = play(); model.setPeek(true); model.setPeek(false); takeKey(model);
  slide(model, 5); walk(model, -1, 0, .8); slide(model, 1.2);
  for (let i = 0; i < 140 && !model.counters.guardAlerts; i++) model.update(.05);
  assert.equal(model.counters.guardAlerts, 1);
  assert.equal(model.snapshot().alert.returnedKey, true);
  assert.equal(model.carrying, null);
  assert.equal(model.collected.size, 0);
  assert.ok(model.goals.every(goal => !goal.done));
  wait(model, RETURN_GRACE + .1);
  slide(model, 5); model.setPeek(true);
  assert.ok(model.snapshot().ghosts.some(section => section.id === 'vault-key'));
  model.setPeek(false); takeKey(model); exitWithKey(model);
  assert.equal(model.phase, 'complete');
  assert.deepEqual(model.stars, [true, false, true]);
  assert.equal(model.counters.peekUses, 2);
});

test('extra peek uses affect only their star and large frame gaps cannot advance patrols by seconds', () => {
  const model = play();
  for (let i = 0; i < 3; i++) { model.setPeek(true); model.setPeek(false); }
  model.update(60);
  assert.ok(model.time <= .1 + 1e-9);
  takeKey(model); exitWithKey(model);
  assert.deepEqual(model.stars, [true, true, false]);
});
