import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SINGLE, TWINS, CORRIDOR, ROOM, GATE, TWO_ROOMS, dialToW, sliceAtW, corridorSections,
  legalCorridorSpot, tokenInsideSection, wChangeEngulfs, wFootprint, flatShape, flatVariant,
  blockedWIntervals, exclusionRadius,
} from '../geometry.mjs';
import { WalkRun, VisitRun, WIN_RADIUS } from '../game.mjs';
import { LEVELS_LIST, CHAPTERS, levelById, nextLevel, isUnlocked, planeY } from '../levels.mjs';
import { LAYERS, layerIndex, layerBlend, wColor } from '../layers.mjs';
import { PredictionSession } from '../challenge.mjs';

const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `${a} != ${b}`);
const STEP = 0.08;
const DIALS = 51;

// Breadth-first search over a grid of (x, z, dial). Moves in x/z use the
// section at the current dial; dial moves must pass the engulf check.
function solve(level, { fixedDial = null } = {}) {
  const nx = Math.floor(level.bounds.x / STEP);
  const nz = Math.floor(level.bounds.z / STEP);
  const W = 2 * nx + 1;
  const H = 2 * nz + 1;
  const sections = Array.from({ length: DIALS }, (_, d) => corridorSections(dialToW(d / (DIALS - 1)), level));
  const legal = (i, j, d) => legalCorridorSpot(sections[d], (i - nx) * STEP, (j - nz) * STEP, level);
  const key = (i, j, d) => (d * H + j) * W + i;
  const startI = Math.round(level.start[0] / STEP) + nx;
  const startJ = Math.round(level.start[1] / STEP) + nz;
  const startD = fixedDial ?? (DIALS - 1) / 2;
  const seen = new Uint8Array(W * H * DIALS);
  const queue = [[startI, startJ, startD]];
  seen[key(startI, startJ, startD)] = 1;
  while (queue.length) {
    const [i, j, d] = queue.shift();
    const x = (i - nx) * STEP;
    const z = (j - nz) * STEP;
    if (Math.hypot(x - level.goal[0], z - level.goal[1]) < WIN_RADIUS) return true;
    const next = [[i + 1, j, d], [i - 1, j, d], [i, j + 1, d], [i, j - 1, d]];
    if (fixedDial === null) next.push([i, j, d + 1], [i, j, d - 1]);
    for (const [a, b, c] of next) {
      if (a < 0 || b < 0 || a >= W || b >= H || c < 0 || c >= DIALS) continue;
      if (seen[key(a, b, c)]) continue;
      if (c !== d) {
        if (wChangeEngulfs(level, [x, z], dialToW(d / (DIALS - 1)), dialToW(c / (DIALS - 1)))) continue;
      } else if (!legal(a, b, c)) continue;
      seen[key(a, b, c)] = 1;
      queue.push([a, b, c]);
    }
  }
  return false;
}

const walkLevels = LEVELS_LIST.filter((level) => level.kind === 'walk');
// Single-room levels are fully open at extreme W (that is the lesson), so for
// them only W = 0 must be unsolvable. Every other level needs a W change
// mid-route: no single W solves it.
const SINGLE_ROOM = new Set(['0-3', '1-3']);
const CENTER_DIAL = (DIALS - 1) / 2;

for (const level of walkLevels) {
  test(`level ${level.id} needs the fourth dimension`, () => {
    const { field } = level;
    assert.ok(legalCorridorSpot(corridorSections(0, field), ...field.start, field), 'start must be legal at W=0');
    assert.ok(solve(field), 'a route through (x, z, W) must exist');
    assert.ok(!solve(field, { fixedDial: CENTER_DIAL }), 'W = 0 alone must not solve it');
    if (SINGLE_ROOM.has(level.id)) return;
    for (let d = 0; d < DIALS; d += 1) {
      assert.ok(!solve(field, { fixedDial: d }), `dial ${d / (DIALS - 1)} alone must not solve it`);
    }
  });
}

test('W footprint matches the 3D section at every sampled point', () => {
  const bodies = [SINGLE, ...TWINS, ...CORRIDOR.bodies, ...GATE.bodies];
  for (const body of bodies) {
    for (const y of [0.22, 0.6, 1.4]) {
      const print = wFootprint(body, y);
      for (let k = 0; k < 400; k += 1) {
        const x = body.center[0] + Math.sin(k * 1.7) * 1.6;
        const z = body.center[2] + Math.cos(k * 2.3) * 1.6;
        const w = body.center[3] + Math.sin(k * 0.9) * 1.8;
        const section = sliceAtW(body, w);
        let inSection;
        if (section.kind === 'empty') inSection = false;
        else if (section.type === 'box') inSection = [x, y, z].every((v, a) => Math.abs(v - section.center[a]) < section.half[a]);
        else inSection = (x - section.center[0]) ** 2 + (y - section.center[1]) ** 2 + (z - section.center[2]) ** 2 < section.radius ** 2;
        let inPrint;
        if (!print.exists) inPrint = false;
        else if (print.type === 'box') inPrint = [x, z, w].every((v, a) => Math.abs(v - print.center[a]) < print.half[a]);
        else inPrint = (x - print.center[0]) ** 2 + (z - print.center[1]) ** 2 + (w - print.center[2]) ** 2 < print.radius ** 2;
        assert.equal(inPrint, inSection, `${body.id} at (${x}, ${y}, ${z}, ${w})`);
      }
    }
  }
});

test('Flatland shapes are exactly the collision boundary', () => {
  for (const level of [flatVariant(CORRIDOR), flatVariant(ROOM)]) {
    for (const w of [-1.4, -0.5, 0, 0.3, 1.1]) {
      const sections = corridorSections(w, level);
      const shapes = sections.map((s) => flatShape(s, level.tokenY));
      for (let k = 0; k < 600; k += 1) {
        const x = Math.sin(k * 1.3) * level.bounds.x;
        const z = Math.cos(k * 0.7) * level.bounds.z;
        const r = level.tokenRadius;
        const drawnHit = shapes.some((shape) => {
          if (!shape) return false;
          if (shape.type === 'sphere') return Math.hypot(x - shape.center[0], z - shape.center[1]) < shape.radius + r;
          const qx = Math.max(shape.center[0] - shape.half[0], Math.min(shape.center[0] + shape.half[0], x));
          const qz = Math.max(shape.center[1] - shape.half[1], Math.min(shape.center[1] + shape.half[1], z));
          return Math.hypot(x - qx, z - qz) < r;
        });
        assert.equal(drawnHit, tokenInsideSection(sections, x, z, level), `w=${w} at (${x}, ${z})`);
      }
    }
  }
});

test('walk run refuses swallowing W changes, counts stats and detects the goal', () => {
  const run = new WalkRun(CORRIDOR, '1-2', 1000);
  assert.ok(run.setDial(0.6));
  run.noteWAdjust();
  // Park inside the near wall footprint, then ask for a W where the wall exists.
  run.pos = [-1.3, 0];
  assert.equal(run.setDial(0.25), false);
  assert.equal(run.refused, 1);
  assert.equal(run.dial, 0.6);
  run.pos = [-2.2, 0];
  assert.ok(run.setDial(0.5));
  const first = run.step(1, 0, 0.1, 2000);
  assert.ok(first.travelled > 0);
  let jam = { newlyBlocked: false };
  for (let i = 0; i < 5 && !jam.newlyBlocked; i += 1) jam = run.step(1, 0, 0.2, 2100);
  assert.ok(jam.newlyBlocked);
  assert.equal(run.blocked, 1);
  assert.equal(run.blockStreak, 1);
  run.noteWAdjust();
  assert.equal(run.blockStreak, 0);
  run.pos = [2.0, 0];
  const done = run.step(1, 0, 0.1, 5000);
  assert.ok(done.won && run.won);
  assert.equal(run.seconds(9999), 3);
  const json = JSON.parse(JSON.stringify(run));
  assert.equal(json.level, '1-2');
  assert.equal(json.completed, true);
  assert.equal(json.wAdjusts, 2);
  assert.equal(json.wRefused, 1);
});

test('visit runs gate predictions behind the observation goal', () => {
  const level = levelById('0-1');
  const run = new VisitRun(level.bodies, level.goal, level.trials, level.id);
  assert.equal(run.observe(0.04), false);
  assert.equal(run.observe(0.5), false);
  assert.throws(() => run.submit('grow'));
  assert.equal(run.observe(0.98), true);
  assert.equal(run.phase, 'predict');
  const answers = ['appear', 'grow', 'disappear'];
  answers.forEach((answer, i) => {
    assert.equal(run.submit(answer).correct, true);
    assert.equal(run.next(), i < answers.length - 1);
  });
  assert.ok(run.won);
  assert.equal(JSON.parse(JSON.stringify(run)).predictions.score, 3);

  const twins = levelById('1-1');
  const pair = new VisitRun(twins.bodies, twins.goal, twins.trials, twins.id);
  assert.equal(pair.observe(twins.startDial), false);
  assert.equal(pair.observe(0.5), true);
  const expected = ['shrink', 'same', 'grow'];
  expected.forEach((answer) => { assert.equal(pair.submit(answer).correct, true); pair.next(); });
  assert.ok(pair.won);
});

test('level table is ordered, unlocks in sequence and keeps maps hidden in chapter 2', () => {
  assert.deepEqual(LEVELS_LIST.map((l) => l.id), ['0-1', '0-2', '0-3', '1-1', '1-2', '1-3', '2-1', '2-2']);
  assert.equal(CHAPTERS.length, 3);
  assert.equal(nextLevel('0-3').id, '1-1');
  assert.equal(nextLevel('2-2'), null);
  assert.ok(isUnlocked('0-1', new Set()));
  assert.ok(!isUnlocked('0-2', new Set()));
  assert.ok(isUnlocked('0-2', new Set(['0-1'])));
  for (const level of LEVELS_LIST) {
    assert.equal(level.map === 'hidden', level.chapter === 2);
    assert.equal(level.view === 'flat', level.chapter === 0);
    assert.equal(level.hints.length, 3);
    assert.ok(Number.isFinite(planeY(level)));
  }
  // Flatland and chapter 1 share the same (x, z, W) layouts.
  assert.deepEqual(levelById('0-2').field.bodies.map((b) => b.center[3]), CORRIDOR.bodies.map((b) => b.center[3]));
  assert.equal(levelById('2-2').field, TWO_ROOMS);
});

test('W layers cover [-2, 2], crossfade at borders and tint smoothly', () => {
  assert.equal(LAYERS.length, 5);
  assert.equal(layerIndex(-2), 0);
  assert.equal(layerIndex(0), 2);
  assert.equal(layerIndex(2), 4);
  assert.deepEqual(layerBlend(0), { a: 2, b: 2, t: 0 });
  const border = -0.4;
  const below = layerBlend(border - 1e-6);
  const above = layerBlend(border + 1e-6);
  assert.equal(below.a, 1); assert.equal(below.b, 2);
  near(below.t, 0.5, 1e-4); near(above.t, 0.5, 1e-4);
  for (let w = -2; w < 2; w += 0.01) {
    const a = wColor(w);
    const b = wColor(w + 0.01);
    assert.ok(a.every((v, k) => Math.abs(v - b[k]) < 0.05), `hue jumps at ${w}`);
  }
});

test('prediction sessions accept any trial list', () => {
  const trials = levelById('1-1').trials;
  const session = new PredictionSession(trials);
  assert.equal(session.trial, trials[0]);
  assert.throws(() => new PredictionSession([]), RangeError);
  assert.equal(JSON.parse(JSON.stringify(session)).total, 3);
});

const allFields = walkLevels.map((level) => level.field);

test('blockedWIntervals matches the section collision on every walking field', () => {
  for (const field of allFields) {
    for (let k = 0; k < 160; k += 1) {
      const pos = [Math.sin(k * 1.3) * field.bounds.x, Math.cos(k * 0.7) * field.bounds.z];
      const intervals = blockedWIntervals(field, pos);
      for (let w = -1.97; w <= 1.97; w += 0.06) {
        if (intervals.some(([lo, hi]) => Math.abs(w - lo) < 1e-4 || Math.abs(w - hi) < 1e-4)) continue;
        const inside = intervals.some(([lo, hi]) => w > lo && w < hi);
        assert.equal(inside, tokenInsideSection(corridorSections(w, field), ...pos, field), `pos=${pos} w=${w}`);
      }
    }
  }
});

test('a sphere never blocks a token whose disc lies outside its floor circle', () => {
  for (const field of allFields) {
    for (const body of field.bodies.filter((b) => b.type === 'sphere')) {
      const edge = exclusionRadius(body, field) + field.tokenRadius;
      for (let a = 0; a < 12; a += 1) {
        const at = (r) => [body.center[0] + Math.cos(a) * r, body.center[2] + Math.sin(a) * r];
        const only = { ...field, bodies: [body] };
        assert.equal(blockedWIntervals(only, at(edge + 1e-3)).length, 0);
        assert.equal(blockedWIntervals(only, at(edge - 1e-3)).length, 1);
      }
    }
  }
});

test('reachDial stops at the edge of a blocked W interval without engulfing', () => {
  for (const [from, to] of [[0.6, 0.25], [0.6, 0], [0.4, 0.9]]) {
    const run = new WalkRun(CORRIDOR, '1-2', 0);
    run.setDial(from);
    run.pos = from > to ? [-1.3, 0] : [1.3, 0];
    const result = run.reachDial(to);
    assert.ok(result.clamped);
    assert.equal(run.refused, 1);
    assert.ok(!wChangeEngulfs(CORRIDOR, run.pos, dialToW(from), dialToW(run.dial)));
    const [lo, hi] = blockedWIntervals(CORRIDOR, run.pos)[0];
    near(dialToW(run.dial), from > to ? hi : lo, 1e-3);
  }
  const free = new WalkRun(CORRIDOR, '1-2', 0);
  assert.deepEqual(free.reachDial(0.7), { dial: 0.7, clamped: false });
  assert.equal(free.refused, 0);
});

test('one W gesture pushing into a wall counts one refusal', () => {
  const run = new WalkRun(CORRIDOR, '1-2', 0);
  run.setDial(0.6);
  run.pos = [-1.3, 0];
  for (const to of [0.3, 0.25, 0.2, 0.1]) assert.ok(run.reachDial(to).clamped);
  assert.equal(run.refused, 1);
  run.endWGesture();
  run.reachDial(0.2);
  assert.equal(run.refused, 2);
});

test('moves during a W animation respect every section up to the target', () => {
  const run = new WalkRun(CORRIDOR, '1-2', 0);
  run.setDial(0.6); // W = 0.4: the near wall is gone
  run.pos = [-1.75, 0];
  assert.ok(run.setDial(0.5)); // W = 0: the near wall is back, token still clear
  // The screen still shows W = 0.4, but the wall must already block.
  run.step(1, 0, 0.3, 0, 0.6);
  const reach = CORRIDOR.bodies[0].center[0] - CORRIDOR.bodies[0].half[0] - CORRIDOR.tokenRadius;
  assert.ok(run.pos[0] <= reach + 1e-9, `token entered the wall at x=${run.pos[0]}`);
  assert.ok(!tokenInsideSection(corridorSections(0, CORRIDOR), ...run.pos, CORRIDOR));
});

test('both rooms of 2-2 stand at W = 0, each opens on its own side', () => {
  const kinds = (w, side) => corridorSections(w, TWO_ROOMS).filter((s) => s.id.startsWith(side)).map((s) => s.kind);
  for (const side of ['left', 'right']) assert.ok(kinds(0, side).every((k) => k === 'box'), `${side} room at W=0`);
  assert.ok(kinds(-0.5, 'left').every((k) => k === 'empty'));
  assert.ok(kinds(0.5, 'right').every((k) => k === 'empty'));
});
