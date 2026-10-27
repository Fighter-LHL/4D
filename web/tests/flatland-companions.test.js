import test from 'node:test';
import assert from 'node:assert/strict';
import { FlatlandModel } from '../src/flatland/model.js';
import { FLATLAND_LEVELS } from '../src/flatland/levels.js';
import { PROBE_FLIGHT, PROBE_STAY, GARDEN_SEEDS, normalizeGardenMemories } from '../src/flatland/companions.js';
import { levelIndex, goto, slide, wait, walk } from './flatland-helpers.js';

const collection = companion => ({ found: ['sprout', 'lantern', 'ribbon'], companion });
function roam(id = 'visitor', companion = 'all') {
  const m = new FlatlandModel(levelIndex(id), { seed: 42, playStyle: 'explore', collection: collection(companion) }); m.start(); m.drainEvents(); return m;
}
function fixture({ solids = [], shards = [], guards = [] } = {}, companion = 'sprout') {
  const level = { id: 'test', bounds: { w: 20, h: 12 }, slice: { min: 0, max: 6, start: 1.2 },
    player: { x: 3, y: 6, r: .4, canMove: true }, stars: [], solids, guards, build: () => ({ shards }) };
  const m = new FlatlandModel(0, { seed: 42, levels: [level], playStyle: 'explore', collection: collection(companion) }); m.start(); return m;
}
const wall = (z, x = 4) => ({ id: 'wall', kind: 'prism', solid: true, role: 'wall', z, polygon: [[x, 0], [x + .4, 0], [x + .4, 12], [x, 12]] });

test('visitor and shape lock allow continuous movement without changing slice puzzles', () => {
  for (const id of ['visitor', 'guess']) for (const playStyle of ['explore', 'challenge']) {
    const m = new FlatlandModel(levelIndex(id), { seed: 42, playStyle }); m.start();
    const before = m.snapshot(); walk(m, 1, 0, .4);
    assert.ok(m.player.x > before.player.x + 1.9); assert.equal(m.s, before.s);
  }
});

test('sprout collects along its destination slice without moving the player or collecting another layer', () => {
  const m = fixture({ shards: [{ x: 4.8, y: 6, z: [2.5, 2.9] }, { x: 5, y: 6, z: [4, 4.5] }] });
  const before = m.snapshot(); assert.equal(m.petCompanion(), true); wait(m, .31);
  assert.equal(m.shards[0].taken, true); assert.equal(m.shards[1].taken, false);
  assert.deepEqual(m.player, before.player); assert.equal(m.s, before.s);
  assert.equal(m.drainEvents().filter(e => e.type === 'shard').length, 1);
  wait(m, 1); assert.equal(m.drainEvents().filter(e => e.type === 'shard').length, 0);
});

test('sprout clears a low wall but sweeps and stops before a tall wall', () => {
  for (const [z, taken] of [[[0, 2], true], [[0, 6], false]]) {
    const m = fixture({ solids: [wall(z)], shards: [{ x: 4.9, y: 6, z: [2.5, 2.9] }] });
    m.petCompanion(); wait(m, .4); assert.equal(m.shards[0].taken, taken);
    if (!taken) assert.ok(m.snapshot().companions.probe.x < 4 - .21);
  }
});

test('sprout can be thrown in the current layer to collect or distract without a preliminary slice change', () => {
  const m = fixture({ shards: [{ x: 4.8, y: 6, z: [1, 1.4] }],
    guards: [{ id: 'guard', patrol: [[6, 8], [6, 6]], speed: .1, z: [1, 1.4], r: .32, range: 6, halfAngle: .05 }] });
  assert.equal(m.setProbeDirection(0), true); assert.equal(m.petCompanion(), true);
  wait(m, .31); assert.equal(m.snapshot().companions.probe.z, m.s);
  assert.equal(m.shards[0].taken, true); assert.equal(m.guards[0].distracted, true);
  const blocked = fixture({ solids: [wall([0, 6])] }); blocked.setProbeDirection(0); blocked.petCompanion(); wait(blocked, .4);
  assert.ok(blocked.snapshot().companions.probe.x < 3.8);
});

test('guards linger after the probe expires and turn continuously back to patrol', () => {
  const m = fixture({ guards: [{ id: 'guard', patrol: [[6, 6], [6, 8]], speed: .1, z: [2.5, 2.9], r: .32, range: 6, halfAngle: .5 }] });
  m.petCompanion(); let previous = m.guards[0].facing, lingered = false, recovered = false;
  for (let t = 0; t < 4.5; t += 1 / 60) {
    m.update(1 / 60); const g = m.guards[0];
    const delta = Math.atan2(Math.sin(g.facing - previous), Math.cos(g.facing - previous));
    assert.ok(Math.abs(delta) <= Math.PI * 1.5 / 60 + 1e-8, `no snap at ${m.time}`);
    if (!m.companions.probe && g.distracted) lingered = true;
    recovered ||= !!g.recovering; previous = g.facing;
  }
  assert.equal(lingered, true); assert.equal(recovered, true); assert.equal(m.companions.attention.size, 0);
});

test('sprout rejects a solid origin and height edges, and can deliberately hop downward', () => {
  const inside = fixture({ solids: [wall([2, 4], 2.8)] });
  assert.equal(inside.petCompanion(), false); assert.equal(inside.snapshot().companions.probe, null);
  const m = fixture(); slide(m, 5.5); assert.equal(m.petCompanion(), false);
  assert.equal(m.setProbeDirection(2), false); m.setProbeDirection(-1);
  assert.equal(m.petCompanion(), true); assert.ok(Math.abs(m.snapshot().companions.probe.z - 4) < 1e-8);
  for (const [s, direction, expected] of [[1.5, -1, 0], [4.5, 1, 6]]) {
    const edge = fixture(); slide(edge, s); edge.setProbeDirection(direction);
    assert.equal(edge.petCompanion(), true); assert.ok(Math.abs(edge.snapshot().companions.probe.z - expected) < 1e-8);
  }
});

test('pause freezes a deployed probe and cooldown; changing companion cancels action without bypassing cooldown', () => {
  const m = fixture(); m.petCompanion(); wait(m, .1); m.setPaused(true);
  const before = m.snapshot(); wait(m, 5); assert.deepEqual(m.snapshot(), before); assert.equal(m.petCompanion(), false);
  m.setPaused(false); wait(m, PROBE_FLIGHT + PROBE_STAY); assert.equal(m.snapshot().companions.probe, null);
  m.setCompanion('lantern'); assert.equal(m.petCompanion(), false);
  wait(m, .2); assert.equal(m.petCompanion(), true);
  m.load(0); assert.equal(m.snapshot().companions.cooldown, 0); assert.equal(m.snapshot().companions.radius, 3.2);
});

test('a reachable visible same-layer probe redirects guards, but other layers and occluding walls do not', () => {
  const guard = z => ({ id: 'guard', patrol: [[6, 6], [6, 8]], speed: .1, z, r: .32, range: 6, halfAngle: .5 });
  for (const [z, solids, expected] of [[[2.5, 2.9], [], true], [[0, 1.5], [], false], [[2.5, 2.9], [wall([0, 6], 5.7)], false]]) {
    const m = fixture({ guards: [guard(z)], solids }); m.petCompanion(); wait(m, .4);
    assert.equal(!!m.guards[0].distracted, expected);
    if (expected) assert.ok(Math.abs(m.guards[0].facing) > 2);
    wait(m, 3.8); assert.equal(!!m.guards[0].distracted, false); assert.equal(!!m.guards[0].recovering, false);
  }
});

test('lantern renders local exact upper and lower slices, including an occluded item, without granting contact', () => {
  const key = { id: 'hidden', role: 'item', occluded: true, kind: 'sphere', center: [4.8, 6, 2.4], r: .2 };
  const low = { id: 'lower', role: 'item', kind: 'sphere', center: [2, 6, 0], r: .2 };
  const far = { id: 'far', role: 'item', kind: 'sphere', center: [9, 6, 2.4], r: .2 };
  const m = fixture({ solids: [wall([0, 4]), key, low, far] }, 'lantern');
  const snap = m.snapshot(), ghosts = snap.lanternGhosts;
  assert.ok(ghosts.some(g => g.id === 'hidden' && g.direction === 1 && g.shape.r === .2));
  assert.ok(ghosts.some(g => g.id === 'lower' && g.direction === -1));
  assert.ok(!ghosts.some(g => g.id === 'far'));
  assert.ok(!snap.sections.some(s => s.id === 'hidden')); assert.equal(m.carrying, null);
  walk(m, 1, 0, .5); assert.ok(m.player.x < 3.61, 'ghosts cannot remove real walls');
  const score = m.score; m.petCompanion(); assert.equal(m.snapshot().companions.radius, 5);
  wait(m, 2.1); assert.equal(m.snapshot().companions.radius, 3.2); assert.equal(m.score, score);
  m.setCompanion('sprout'); assert.deepEqual(m.snapshot().lanternGhosts, []);
});

function reachGarden(m, point) {
  if (!m.level.slice.fixed) slide(m, 4.8);
  goto(m, point.x, point.y);
  if (!m.level.slice.fixed) slide(m, point.z);
  assert.ok(Math.hypot(m.player.x - point.x, m.player.y - point.y) < .1, m.level.id);
}

test('six distinct terrain layouts are reachable, require simultaneous hold, and pay once', () => {
  const layouts = new Set();
  for (const id of ['visitor', 'guess', 'escape', 'vault', 'mirror', 'ascend']) {
    const m = roam(id, 'ribbon'), g = m.level.garden; layouts.add(JSON.stringify(g));
    for (const drop of Object.values(g.drops).flat()) for (const pad of [g.left, g.right, g.bud]) {
      assert.ok(Math.hypot(drop.x - pad.x, drop.y - (pad.y - .8)) >= 1, `${id}: drop clear of label`);
    }
    reachGarden(m, g.left);
    wait(m, .8); assert.equal(m.companions.garden.mirrorOpen, false);
    m.petCompanion(); wait(m, .3); assert.equal(m.companions.garden.mirrorOpen, false);
    walk(m, 0, 1, .2); assert.equal(m.companions.garden.hold, 0);
    goto(m, g.left.x, g.left.y); wait(m, .65);
    assert.equal(m.companions.garden.mirrorOpen, true, id);
    assert.equal(m.shards.filter(s => s.bonus).length, 2);
    for (const drop of g.drops.mirror) {
      reachGarden(m, { ...drop, z: g.left.z }); wait(m, .05);
      assert.ok(m.shards.some(s => s.bonus && s.x === drop.x && s.y === drop.y && s.taken));
    }
    reachGarden(m, g.left); wait(m, 1);
    assert.equal(m.shards.filter(s => s.bonus).length, 2);
    assert.equal(m.drainEvents().filter(e => e.type === 'friend_garden' && e.kind === 'mirror').length, 1);
  }
  assert.equal(layouts.size, 6);
});

test('mirror is exact reflection, and an occupied counterpart cannot press a pad', () => {
  const m = fixture({ solids: [wall([0, 6], 17.8)] }, 'ribbon');
  goto(m, 2, 10.3); m.petCompanion(); wait(m, 1);
  const snap = m.snapshot(); assert.equal(snap.companions.mirror.x, 20 - m.player.x);
  assert.equal(snap.companions.mirror.blocked, true); assert.equal(m.companions.garden.mirrorOpen, false);
});

test('every authored bud requires sprout, and three collected seeds bloom and persist a garden at 3/3', () => {
  for (const id of ['visitor', 'guess', 'escape', 'vault', 'mirror', 'ascend']) {
    const m = roam(id, 'sprout'), g = m.level.garden;
    if (!m.level.slice.fixed) {
      reachGarden(m, g.bud); wait(m, .4);
      assert.equal(m.companions.garden.probeOpen, false, `${id}: player body alone cannot open bud`);
    }
    const from = [g.left, g.right].sort((a,b) => Math.hypot(a.x-g.bud.x,a.y-g.bud.y)-Math.hypot(b.x-g.bud.x,b.y-g.bud.y))[0];
    reachGarden(m, from);
    const dx = g.bud.x - from.x, dy = g.bud.y - from.y, d = Math.hypot(dx, dy);
    walk(m, dx/d, dy/d, .008); m.setProbeDirection(Math.sign(g.bud.z - from.z));
    assert.equal(m.petCompanion(), true); wait(m, .4);
    assert.equal(m.companions.garden.probeOpen, true, id);
    reachGarden(m, { ...g.drops.probe[0], z: g.left.z }); wait(m, .05);
    assert.equal(m.snapshot().companions.garden.petals, 1);
    assert.deepEqual(m.gardenMemories[id], ['friend-probe-0']);
    m.setCompanion('ribbon'); reachGarden(m, g.left); wait(m, 2.6); m.petCompanion(); wait(m, .7);
    for (const drop of g.drops.mirror) { reachGarden(m, { ...drop, z: g.left.z }); wait(m, .05); }
    assert.equal(m.snapshot().companions.garden.petals, 3, id);
    assert.deepEqual(m.gardenMemories[id], [...GARDEN_SEEDS]);
    assert.equal(m.snapshot().companions.garden.bloomed, true);
    assert.equal(m.drainEvents().filter(e=>e.type==='garden_bloom').length, 1);
    const restored = new FlatlandModel(levelIndex(id), { seed:42, playStyle:'explore', gardenMemories:JSON.parse(JSON.stringify(m.gardenMemories)) });
    assert.equal(restored.snapshot().companions.garden.bloomed, true);
    assert.equal(restored.snapshot().companions.garden.petals, 3);
    m.restart();
    assert.equal(m.companions.garden.probeOpen, true);
    assert.equal(m.snapshot().companions.garden.petals, 3);
    assert.deepEqual(m.gardenMemories[id], [...GARDEN_SEEDS]);
  }
});

test('partial seed progress persists across level switches and reloads without double counting', () => {
  const m = roam('guess', 'sprout'), g = m.level.garden;
  reachGarden(m, g.left);
  const dx = g.bud.x - g.left.x, dy = g.bud.y - g.left.y, d = Math.hypot(dx, dy);
  walk(m, dx / d, dy / d, .008); m.setProbeDirection(Math.sign(g.bud.z - g.left.z));
  assert.equal(m.petCompanion(), true); wait(m, .4);
  reachGarden(m, { ...g.drops.probe[0], z: g.left.z }); wait(m, .05);
  assert.equal(m.snapshot().companions.garden.petals, 1);
  assert.deepEqual(m.gardenMemories.guess, ['friend-probe-0']);
  // Switch to another level and return: 1/3 remains intact.
  m.load(levelIndex('escape')); m.start();
  assert.equal(m.snapshot().companions.garden.petals, 0);
  m.load(levelIndex('guess')); m.start();
  assert.equal(m.snapshot().companions.garden.petals, 1);
  assert.equal(m.companions.garden.probeOpen, true);
  assert.equal(m.companions.garden.mirrorOpen, false);
  // Reload from saved JSON: still 1/3, and remaining 2 seeds complete 3/3.
  const reloaded = new FlatlandModel(levelIndex('guess'), {
    seed: 42, playStyle: 'explore', collection: collection('ribbon'),
    gardenMemories: JSON.parse(JSON.stringify(m.gardenMemories)),
  });
  reloaded.start();
  assert.equal(reloaded.snapshot().companions.garden.petals, 1);
  reachGarden(reloaded, g.left); reloaded.petCompanion(); wait(reloaded, .7);
  for (const drop of g.drops.mirror) { reachGarden(reloaded, { ...drop, z: g.left.z }); wait(reloaded, .05); }
  assert.equal(reloaded.snapshot().companions.garden.petals, 3);
  assert.equal(reloaded.snapshot().companions.garden.bloomed, true);
  assert.deepEqual(reloaded.gardenMemories.guess, [...GARDEN_SEEDS]);
});

test('garden memories migrate legacy booleans, retain valid seed IDs, and cannot enable challenge toys', () => {
  for (const bad of [null, [], 'visitor', 12]) assert.deepEqual(normalizeGardenMemories(bad, FLATLAND_LEVELS), {});
  assert.deepEqual(
    normalizeGardenMemories({ visitor: true, guess: ['friend-probe-0', 'unknown'], escape: [], vault: false, storm: true, fake: true }, FLATLAND_LEVELS),
    { visitor: [...GARDEN_SEEDS], guess: ['friend-probe-0'] },
  );
  const legacy = new FlatlandModel(0, { playStyle: 'explore', gardenMemories: { visitor: true }, collection: collection('all') });
  legacy.start();
  assert.equal(legacy.snapshot().companions.garden.bloomed, true);
  assert.equal(legacy.snapshot().companions.garden.petals, 3);
  const m = new FlatlandModel(0, { playStyle: 'challenge', gardenMemories: { visitor: true }, collection: collection('all') });
  m.start(); assert.equal(m.snapshot().companions.garden, null); assert.equal(m.petCompanion(), false);
});

test('challenge and storm receive no powers or optional toys even with a full saved collection', () => {
  for (const [index, level] of FLATLAND_LEVELS.entries()) {
    const m = new FlatlandModel(index, { seed: 42, collection: collection('all'), playStyle: level.endless ? 'explore' : 'challenge' }); m.start();
    assert.equal(m.petCompanion(), false); const s = m.snapshot();
    assert.equal(s.companions.enabled, false); assert.equal(s.companions.garden, null);
    assert.equal(s.companions.mirror, null); assert.equal(s.companions.probe, null); assert.deepEqual(s.lanternGhosts, []);
    assert.ok(!s.sections.some(s => s.id === 'friend-bud'));
    const baseline = new FlatlandModel(index, { seed: 42 }); baseline.start();
    walk(m, 1, 0, .2); walk(baseline, 1, 0, .2);
    for (const key of ['player', 'score', 'guards', 'hazards', 'shards', 'stars']) assert.deepEqual(m.snapshot()[key], baseline.snapshot()[key], `${level.id}:${key}`);
  }
});

test('snapshot mutations do not change companion authority', () => {
  const m = roam(); m.petCompanion(); const s = m.snapshot();
  s.companions.probe.x = -100; s.companions.garden.mirrorOpen = true;
  s.companions.mirror.x = -100; s.lanternGhosts.length = 0;
  assert.notEqual(m.snapshot().companions.probe.x, -100); assert.equal(m.companions.garden.mirrorOpen, false);
});
