import test from 'node:test';
import assert from 'node:assert/strict';
import { FlatlandModel, RESPAWN_TIME, SAFE_TIME } from '../src/flatland/model.js';
import { FLATLAND_LEVELS, matchWindow } from '../src/flatland/levels.js';
import { sliceSolid, shapeMatch } from '../src/flatland/geometry.js';
import { createRandom } from '../src/flatland/random.js';
import { DT, levelIndex, play, wait, slide, walk, types, goto, playVisitor, solveLocks, runEscape } from './flatland-helpers.js';

test('levels start in the intro and ignore input until started', () => {
  const model = new FlatlandModel(0, { seed: 1 });
  assert.equal(model.phase, 'intro');
  assert.equal(model.setSlice(3), false);
  assert.equal(model.start(), true);
  assert.equal(model.setSlice(3), true);
  assert.equal(model.start(), false);
});

test('no level carries quiz, concept or prediction text', () => {
  for (const level of FLATLAND_LEVELS) {
    for (const key of ['quiz', 'concept', 'rounds', 'intro']) assert.equal(level[key], undefined, `${level.id}.${key}`);
    assert.ok(level.tagline.length <= 40, `${level.id} tagline stays short`);
    for (const hint of [...level.hints, ...(level.volumeHints || [])]) assert.ok(hint.text.length <= 30, `${level.id} hint is a control prompt`);
  }
});

test('the same seed rebuilds the same variant; retry preserves it and reroll changes it', () => {
  const a = new FlatlandModel(levelIndex('visitor'), { seed: 42 }), b = new FlatlandModel(levelIndex('visitor'), { seed: 42 });
  assert.deepEqual(a.rings.list, b.rings.list);
  const seen = new Set();
  for (let seed = 1; seed <= 12; seed++) seen.add(new FlatlandModel(levelIndex('visitor'), { seed }).rings.list.join());
  assert.ok(seen.size >= 10, 'variants differ between seeds');
  const random = new FlatlandModel(levelIndex('escape'));
  const originalSeed = random.seed, originalShards = structuredClone(random.shards);
  random.start(); random.setSlice(4); random.update(.1); random.restart();
  assert.equal(random.seed, originalSeed);
  assert.deepEqual(random.shards, originalShards);
  assert.equal(random.time, 0);
  const seeds = new Set(Array.from({ length: 6 }, () => { random.reroll(); return random.seed; }));
  assert.ok(seeds.size > 1);
});

test('visitor: rings appear one by one; a sweep through the right size does not count', () => {
  const m = play('visitor', 3);
  assert.equal(m.snapshot().rings.active, false);
  wait(m, .65);
  assert.ok(types(m).includes('ring_spawn'));
  const target = m.rings.list[0], s = 3 - Math.sqrt(2.5 ** 2 - target ** 2);
  m.setSlice(s); m.update(DT); m.setSlice(.1); m.update(DT);
  assert.equal(m.rings.hits, 0);
  m.setSlice(s); wait(m, .3);
  assert.equal(m.rings.hits, 1);
  const events = m.drainEvents();
  assert.ok(events.some(e => e.type === 'ring_hit' && e.points > 100));
  assert.ok(events.some(e => e.type === 'score'));
});

test('visitor: the player can walk, and a quick precise run still earns three stars', () => {
  const m = play('visitor', 5), x = m.player.x;
  walk(m, 1, 0, .5);
  assert.ok(m.player.x > x + 2);
  playVisitor(m);
  assert.equal(m.phase, 'complete');
  assert.equal(m.cleared, true);
  assert.equal(m.rings.hits, 6);
  assert.ok(m.score >= 1800, `score ${m.score}`);
  assert.deepEqual(m.stars, [true, true, true]);
});

test('visitor: missed rings break the streak; fewer than four hits fails the level', () => {
  const m = play('visitor', 5);
  playVisitor(m, { skip: [2] });
  assert.equal(m.rings.hits, 5); assert.equal(m.cleared, true);
  assert.ok(m.drainEvents().some(e => e.type === 'combo_break'));
  assert.deepEqual(m.stars.slice(0, 2), [true, false]);
  const fail = play('visitor', 5);
  playVisitor(fail, { skip: [0, 2, 4] });
  assert.equal(fail.phase, 'complete'); assert.equal(fail.cleared, false);
  assert.deepEqual(fail.stars, [false, false, false]);
  const events = fail.drainEvents();
  assert.equal(events.filter(e => e.type === 'ring_miss').length, 3);
});

test('visitor: later rings move the visitor so the matching height drifts', () => {
  const m = play('visitor', 9);
  m.rings.index = 4; m.rings.gap = 1; wait(m, 3);
  const z = new Set(); for (let i = 0; i < 20; i++) { wait(m, .2); z.add(m._visitorSolid().center[2].toFixed(2)); }
  assert.ok(z.size > 5);
});

test('locks: the solid stays hidden from the side unless the player peeks, which costs a star', () => {
  const m = play('guess', 11);
  assert.deepEqual(m.snapshot().profiles, []);
  assert.equal(m.snapshot().sideView, 'player-only');
  assert.equal(m.reveal(), true); assert.equal(m.reveal(), false);
  assert.equal(m.snapshot().profiles.length, 1);
  solveLocks(m);
  assert.equal(m.phase, 'complete');
  assert.deepEqual(m.stars, [true, true, false]);
  assert.equal(m.counters.reveals, 1);
});

test('locks: holding the target height opens all five locks; the reveal resets each round', () => {
  const m = play('guess', 12);
  solveLocks(m);
  assert.equal(m.locks.times.length, 5);
  assert.deepEqual(m.stars, [true, true, true]);
  assert.ok(m.score > 750);
  const opened = m.drainEvents().filter(e => e.type === 'lock_open');
  assert.equal(opened.length, 5);
});

test('locks: closeness rises toward the target and every variant can be held by hand', () => {
  const m = play('guess', 13);
  wait(m, .1); m.locks.gap = 0; m.locks.index = 1; m.locks.roundStart = m.time;
  const target = m.locks.list[1].target, readings = [];
  for (const d of [1.5, .8, .3, 0]) { m.setSlice(target + d); m.update(DT); readings.push(m.locks.closeness); }
  assert.ok(readings[0] < readings[1] && readings[1] < readings[2] && readings[2] <= readings[3], readings.join());
  for (let seed = 1; seed <= 60; seed++) {
    const v = FLATLAND_LEVELS[levelIndex('guess')].build(createRandom(seed));
    v.locks.forEach((lock, i) => {
      const target = sliceSolid(lock.solid, lock.target);
      assert.ok(shapeMatch(target, target).match);
      if (i >= 3) assert.ok(matchWindow(lock.solid, lock.target) >= .15, `seed ${seed} lock ${i}`);
    });
  }
});
test('escape: walls block walking at low S and vanish above their height', () => {
  const m = play('escape');
  walk(m, 1, 0, 2);
  assert.ok(m.player.x <= 12.2 + 1e-6, 'stopped by the east wall');
  slide(m, 4);
  walk(m, 1, 0, .4);
  assert.ok(m.player.x > 13.4, 'walked out over the wall');
});

test('escape: descending onto a wall stops flush above it and reports the blocker once', () => {
  const m = play('escape');
  walk(m, 1, 0, 2); slide(m, 4); walk(m, 1, 0, .1); wait(m, .5);
  m.drainEvents();
  const bumps = m.counters.blockedCount;
  assert.equal(m.setSlice(1), false);
  assert.ok(m.s > 3.5 && m.s < 3.52, `stopped flush at ${m.s}`);
  assert.deepEqual(m.drainEvents().filter(e => e.type === 'blocked').map(e => e.solid), ['wall-e']);
  m.setSlice(1);
  assert.equal(m.counters.blockedCount, bumps + 1, 'held input does not spam blocked');
});

test('escape: every shard variant can be collected on the way to the flag for three stars', () => {
  const variants = new Set();
  for (let seed = 1; seed <= 24; seed++) {
    const m = runEscape(play('escape', seed));
    variants.add(m.shards.map(s => s.x).join());
    assert.equal(m.phase, 'complete', `seed ${seed}`);
    assert.equal(m.deaths, 0);
    assert.deepEqual(m.stars, [true, true, true], `seed ${seed} at ${m.time.toFixed(1)}s`);
  }
  assert.equal(variants.size, 8);
});

test('escape: shards exist only in their own band; chained pickups raise the combo', () => {
  const m = play('escape', 1);
  m.shards[0] = { ...m.shards[0], x: 8.4, y: 4.8, z: [.3, 1.1] };
  m.shards[1] = { ...m.shards[1], x: 9.6, y: 4.8, z: [.3, 1.1] };
  m.update(DT);
  assert.equal(m.snapshot().shards[0].visible, true);
  slide(m, 2); m.update(DT);
  assert.equal(m.snapshot().shards[0].visible, false);
  goto(m, 8.4, 4.8);
  assert.equal(m.shards[0].taken, false, 'wrong height: no pickup');
  slide(m, .7); m.update(DT);
  assert.equal(m.shards[0].taken, true);
  goto(m, 9.6, 4.8);
  assert.equal(m.shards[1].taken, true);
  const scores = m.drainEvents().filter(e => e.type === 'score');
  assert.deepEqual(scores.map(e => e.points), [100, 150]);
});

test('escape: the bobbing buoy kills on contact, then respawns at the start with shards kept', () => {
  const m = play('escape', 2);
  m.shards[0].taken = true;
  slide(m, 4); goto(m, 13.8, 6); slide(m, 2.6);
  goto(m, 15.8, 6, 3);
  for (let i = 0; i < 300 && !m.dying; i++) m.update(DT);
  assert.equal(m.deaths, 1);
  assert.ok(m.dying);
  assert.equal(m.setMove(1, 0), false);
  wait(m, RESPAWN_TIME + .05);
  assert.equal(m.dying, null);
  assert.deepEqual([m.player.x, m.player.y, m.s], [10, 6, 1]);
  assert.equal(m.shards[0].taken, true);
  assert.ok(m.snapshot().safe > 0 && m.snapshot().safe <= SAFE_TIME);
  const events = types(m);
  assert.ok(events.includes('death') && events.includes('respawn'));
  assert.equal(m.phase, 'playing');
});

test('escape: hazards that are about to cross the plane show up as warnings first', () => {
  const m = play('escape', 2);
  let warned = false;
  for (let i = 0; i < 400 && !warned; i++) { m.update(DT); warned = m.snapshot().warnings.length > 0; }
  assert.ok(warned);
});

test('control hints appear after idle time and clear when the player acts', () => {
  const m = play('visitor', 1);
  wait(m, 3);
  assert.equal(m.hint, null);
  wait(m, .6);
  assert.match(m.hint, /Q \/ E/);
  m.setSlice(.4); m.update(DT);
  assert.equal(m.hint, null);
  assert.equal(m.counters.hintsShown, 1);
});

test('held slice input accelerates and ends one gesture on release', () => {
  const m = play('escape');
  m.setSliceVelocity(1); wait(m, .25);
  const early = m.s - 1;
  wait(m, .75);
  const total = m.s - 1;
  m.setSliceVelocity(0);
  assert.ok(early < total / 3, `starts gentle: ${early} of ${total}`);
  assert.ok(total > 1.4 && total < 2.2, `total ${total}`);
  assert.equal(m.counters.sliceMoves, 1);
});

test('snapshots are plain data, stars report live status, and next() advances levels', () => {
  const m = play('escape', 4);
  const snapshot = m.snapshot();
  assert.doesNotThrow(() => JSON.stringify(snapshot));
  assert.deepEqual(snapshot.stars.map(s => s.status), ['', '', '']);
  wait(m, 33);
  assert.equal(m.snapshot().stars[2].status, 'failed');
  snapshot.shards[0].z[0] = -9;
  assert.notEqual(m.snapshot().shards[0].z[0], -9);
  assert.equal(m.next(), true);
  assert.equal(m.snapshot().levelId, 'vault');
  assert.equal(m.load(99), false);
});
