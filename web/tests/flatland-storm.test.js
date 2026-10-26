import test from 'node:test';
import assert from 'node:assert/strict';
import { FlatlandModel } from '../src/flatland/model.js';
import { FLATLAND_LEVELS } from '../src/flatland/levels.js';
import { hazardSolid, hazardZ, spawnStormHazard } from '../src/flatland/hazards.js';
import { createRandom } from '../src/flatland/random.js';
import { sliceSolid } from '../src/flatland/geometry.js';
import { DT, levelIndex, play, goto, types } from './flatland-helpers.js';

const storm = FLATLAND_LEVELS[levelIndex('storm')];
const until = (m, done, limit = 120) => { while (!done() && m.phase === 'playing' && m.time < limit) m.update(DT); };

test('storm hazards enter from outside the slice range and pass all the way through it', () => {
  const rng = createRandom(9);
  for (let i = 0; i < 200; i++) {
    const h = spawnStormHazard(rng, { id: `h${i}`, time: 0, level: i % 6, bounds: storm.bounds, slice: storm.slice });
    const [lo, hi] = hazardZ(h, 0), down = h.velocity[2] < 0;
    assert.ok(down ? lo > storm.slice.max : hi < storm.slice.min, `${h.kind} starts outside`);
    assert.equal(sliceSolid(hazardSolid(h, 0), down ? storm.slice.max : storm.slice.min), null);
    const crossing = (storm.slice.max - storm.slice.min + hi - lo + .2) / Math.abs(h.velocity[2]);
    const [lo2, hi2] = hazardZ(h, crossing);
    assert.ok(down ? hi2 < storm.slice.min : lo2 > storm.slice.max, `${h.kind} leaves after ${crossing.toFixed(1)}s`);
  }
});

test('the same seed and inputs replay the same storm', () => {
  const run = () => { const m = play('storm', 77); until(m, () => false, 20); return [m.score, m.storm.lives, m.hazards.map(h => h.id).join(), m.shards.map(s => s.x.toFixed(3)).join()]; };
  assert.deepEqual(run(), run());
});

test('hits cost lives with a grace period; three hits end the run with score-based stars', () => {
  const m = play('storm', 3);
  until(m, () => m.storm.lives < 3);
  assert.equal(m.storm.lives, 2);
  const at = m.time;
  assert.ok(m.snapshot().safe > 0);
  until(m, () => m.storm.lives < 2);
  assert.ok(m.time - at >= storm.stormRules.invulnerable - 1e-9, 'no double hit inside the grace period');
  until(m, () => m.phase === 'complete', 300);
  assert.equal(m.phase, 'complete');
  assert.equal(m.storm.lives, 0);
  assert.equal(m.cleared, true);
  assert.deepEqual(m.stars, storm.stars.map(star => m.score >= star.value));
  const events = types(m);
  assert.equal(events.filter(t => t === 'hurt').length, 3);
  assert.equal(events.filter(t => t === 'complete').length, 1);
});

test('surviving earns points, waves escalate, and the side view shows incoming hazards', () => {
  const m = play('storm', 5);
  let profiled = false, warned = false;
  until(m, () => { const snap = m.snapshot(); profiled ||= snap.profiles.some(p => p.role === 'hazard'); warned ||= snap.warnings.length > 0; return m.time > 4; });
  assert.ok(profiled && warned);
  assert.ok(m.score >= 15, `survival points ${m.score}`);
  m.safeUntil = Infinity;
  until(m, () => m.time > 26);
  assert.equal(m.storm.level, 2);
  assert.equal(m.drainEvents().filter(e => e.type === 'storm_level').length, 2);
});

test('shards spawn in random bands, chain into combos and expire if ignored', () => {
  const m = play('storm', 8);
  m.safeUntil = Infinity;
  until(m, () => m.shards.length >= 2);
  const before = m.score;
  for (let i = 0; i < 4; i++) {
    until(m, () => m.shards.length > 0);
    const shard = m.shards[0];
    m.setSlice((shard.z[0] + shard.z[1]) / 2); goto(m, shard.x, shard.y);
  }
  const scores = m.drainEvents().filter(e => e.type === 'score' && e.kind === 'shard');
  assert.ok(scores.length >= 4);
  assert.ok(scores.some(e => e.mult > 1), 'quick pickups chain');
  assert.ok(m.score > before + 400);
  const idle = play('storm', 8); idle.safeUntil = Infinity;
  until(idle, () => idle.time > storm.stormRules.shardLife + 3);
  assert.ok(idle.drainEvents().some(e => e.type === 'shard_expire'));
  assert.ok(idle.shards.every(s => idle.time - s.born < storm.stormRules.shardLife));
});

test('storm is endless and unaffected by intro input', () => {
  const m = new FlatlandModel(levelIndex('storm'), { seed: 1 });
  m.update(5);
  assert.equal(m.hazards.length, 0);
  assert.equal(m.snapshot().endless, true);
  assert.equal(m.snapshot().storm.lives, 3);
});
