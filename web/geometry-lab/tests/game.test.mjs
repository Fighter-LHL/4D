import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SINGLE, TWINS, CORRIDOR, CORRIDOR_3D, ROOM, ROOM_3D, GATE, TWO_ROOMS, TIDAL, ISLANDS, FETCH_ROOM, STATION_ROOM, relayField, wToDial, dialToW, sliceAtW, corridorSections,
  legalCorridorSpot, tokenInsideSection, wChangeEngulfs, wFootprint, flatShape, flatVariant,
  blockedWIntervals, exclusionRadius, goalOpenAt, fieldWithRadius, itemSectionAtW, itemFootprint,
} from '../geometry.mjs';
import { WalkRun, VisitRun, WIN_RADIUS, WALK_SPEED } from '../game.mjs';
import { LEVELS_LIST, CHAPTERS, FETCH_LEVEL, LAB_LEVEL, levelById, nextLevel, isUnlocked, planeY } from '../levels.mjs';
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
  for (let head = 0; head < queue.length; head += 1) {
    const [i, j, d] = queue[head];
    const x = (i - nx) * STEP;
    const z = (j - nz) * STEP;
    const w = dialToW(d / (DIALS - 1));
    if (Math.hypot(x - level.goal[0], z - level.goal[1]) < WIN_RADIUS && goalOpenAt(level, w)) return true;
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
const CENTER_DIAL = (DIALS - 1) / 2;

for (const level of walkLevels) {
  test(`level ${level.id} needs the fourth dimension`, () => {
    const { field } = level;
    assert.ok(legalCorridorSpot(corridorSections(0, field), ...field.start, field), 'start must be legal at W=0');
    assert.ok(solve(field), 'a route through (x, z, W) must exist');
    assert.ok(!solve(field, { fixedDial: CENTER_DIAL }), 'W = 0 alone must not solve it');
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
  assert.deepEqual(LEVELS_LIST.map((l) => l.id), ['0-1', '0-2', '0-3', '1-1', '1-2', '1-3', '2-1', '2-2', '2-3', '2-4']);
  assert.equal(CHAPTERS.length, 3);
  assert.equal(nextLevel('0-3').id, '1-1');
  assert.equal(nextLevel('2-4'), null);
  assert.ok(isUnlocked('0-1', new Set()));
  assert.ok(!isUnlocked('0-2', new Set()));
  assert.ok(isUnlocked('0-2', new Set(['0-1'])));
  for (const level of LEVELS_LIST) {
    assert.equal(level.map === 'hidden', level.chapter === 2);
    assert.equal(level.view === 'flat', level.chapter === 0);
    assert.equal(level.hints.length, 3);
    for (const hint of level.hints) assert.ok(!/\d/.test(hint), `${level.id} hint has number: ${hint}`);
    assert.ok(Number.isFinite(planeY(level)));
  }
  // Flatland and chapter 1 share the same base (x, z, W) layouts, while 1-2 and 1-3 add 3D-elevated spheres.
  assert.deepEqual(levelById('0-2').field.bodies.map((b) => b.center[3]), CORRIDOR.bodies.map((b) => b.center[3]));
  assert.deepEqual(levelById('1-2').field.bodies.slice(0, 3), CORRIDOR.bodies);
  assert.equal(levelById('1-2').field, CORRIDOR_3D);
  assert.equal(levelById('1-3').field, ROOM_3D);
  assert.equal(levelById('2-2').field, TWO_ROOMS);
  assert.equal(levelById('2-3').field, TIDAL);
  assert.equal(levelById('2-4').field, ISLANDS);
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
  assert.deepEqual(free.reachDial(0.7), { dial: 0.7, clamped: false, won: false });
  assert.equal(free.refused, 0);
});

test('goal only completes inside its W interval, including when sliding W onto it', () => {
  const run = new WalkRun(ROOM, '1-3', 0);
  run.setDial(0.8); // W = 1.2: room is gone, but goal is closed outside [-0.35, 0.35]
  run.pos = [3.0, 0];
  const outside = run.step(1, 0, 0.1, 2000);
  assert.equal(outside.won, false);
  assert.equal(outside.goalOtherW, true);
  assert.equal(run.won, false);
  // Slide W back into the goal interval while standing on the goal ring.
  run.setDial(0.5);
  const inside = run.step(0, 0, 0.016, 2500, 0.5);
  assert.equal(inside.won, true);
  assert.equal(run.won, true);
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

test('2-3 tidal gates only open in their mid-W windows and re-seal at extreme W', () => {
  assert.equal(legalCorridorSpot(corridorSections(0, TIDAL), -1.4, 0, TIDAL), false);
  assert.equal(legalCorridorSpot(corridorSections(-0.5, TIDAL), -1.4, 0, TIDAL), true);
  assert.equal(legalCorridorSpot(corridorSections(-2, TIDAL), -1.4, 0, TIDAL), false);
  assert.equal(legalCorridorSpot(corridorSections(0, TIDAL), 1.4, 0, TIDAL), false);
  assert.equal(legalCorridorSpot(corridorSections(0.5, TIDAL), 1.4, 0, TIDAL), true);
  assert.equal(legalCorridorSpot(corridorSections(2, TIDAL), 1.4, 0, TIDAL), false);
});

test('2-4 stepping-stone islands refuse W shifts outside the safe pockets', () => {
  assert.equal(wChangeEngulfs(ISLANDS, ISLANDS.start, 0, 0.6), true);
  assert.equal(wChangeEngulfs(ISLANDS, [-2.1, 0.75], 0, 0.6), false);
  assert.equal(wChangeEngulfs(ISLANDS, [0, 0.75], 0.6, -0.6), true);
  assert.equal(wChangeEngulfs(ISLANDS, [0, -0.75], 0.6, -0.6), false);
  assert.equal(wChangeEngulfs(ISLANDS, [1.8, -0.75], -0.6, 0), true);
  assert.equal(wChangeEngulfs(ISLANDS, ISLANDS.goal, -0.6, 0), false);
});

test('visit runs without forced trials complete directly on observation; LAB_LEVEL keeps 6 trials', () => {
  const level = levelById('0-1');
  const direct = new VisitRun(level.bodies, level.goal, [], level.id);
  assert.equal(direct.session, null);
  assert.equal(direct.observe(0.5), false);
  assert.equal(direct.observe(0.98), true);
  assert.equal(direct.phase, 'done');
  assert.equal(direct.won, true);

  assert.equal(levelById('lab'), LAB_LEVEL);
  assert.equal(LAB_LEVEL.trials.length, 6);
  assert.ok(!CHAPTERS[2].intro.body.includes('记下来'));
});

test('FETCH_ROOM ("无门取物"): empty-handed entry, carrying blocks narrow west gap, wide +W exit solves it', () => {
  assert.equal(levelById('fetch'), FETCH_LEVEL);
  assert.equal(FETCH_LEVEL.objective, '把屋里的东西带到这里。门打不开。');
  const emptyField = { ...FETCH_ROOM, goal: [FETCH_ROOM.item.start[0], FETCH_ROOM.item.start[1]], goalW: [-0.25, 0.25] };
  assert.ok(!solve(emptyField, { fixedDial: CENTER_DIAL }), 'room is sealed at W=0');
  assert.ok(solve(emptyField), 'empty-handed player can enter the room via W shifts');

  const carriedField = fieldWithRadius(FETCH_ROOM, FETCH_ROOM.carriedRadius);
  // The narrow west doorway at x = -0.3, z in [-0.33, 0.33] opens in -W (W = -0.9),
  // allowing empty-handed passage (r = 0.22) but blocking carried passage (r = 0.40).
  const minusWSections = corridorSections(-0.9, FETCH_ROOM);
  assert.equal(legalCorridorSpot(minusWSections, -0.3, 0, FETCH_ROOM), true);
  for (let z = -0.5; z <= 0.5; z += 0.04) {
    assert.equal(legalCorridorSpot(minusWSections, -0.3, z, carriedField), false, `west doorway must block carried object at z=${z}`);
  }
  // No single fixed W can take the carried object from inside the room to the active receiving pad.
  const carryToGoal = {
    ...carriedField,
    start: [FETCH_ROOM.item.start[0], FETCH_ROOM.item.start[1]],
    goal: FETCH_ROOM.goal,
    goalW: FETCH_ROOM.goalW,
  };
  for (let d = 0; d < DIALS; d += 1) {
    assert.ok(!solve(carryToGoal, { fixedDial: d }), `single dial ${d} must not extract and deliver the object`);
  }

  // At the pickup spot [0.85, 0], shifting directly to +W (W = 0.95) is safe empty-handed
  // but engulfed by fetch-room-orb when carrying the object; stepping south to [0.85, 0.35] clears it.
  assert.equal(wChangeEngulfs(FETCH_ROOM, [0.85, 0], 0, 0.95), false);
  assert.equal(wChangeEngulfs(carriedField, [0.85, 0], 0, 0.95), true);
  assert.equal(wChangeEngulfs(carriedField, [0.85, 0.35], 0, 0.95), false);

  // From the south interior spot [0.85, 0.35], a player carrying the object can shift to +W,
  // exit through the wide south wall, curve around to the receiving pad, and return W to 0.
  const carryEscape = {
    ...carriedField,
    start: [0.85, 0.35],
    goal: FETCH_ROOM.goal,
    goalW: FETCH_ROOM.goalW,
  };
  assert.ok(solve(carryEscape), 'carried object can exit via +W south opening and reach the receiving pad');
});

test('WalkRun pickup, 4D placed position persistence across W, and goal delivery', () => {
  const run = new WalkRun(FETCH_ROOM, 'fetch', 1000);
  assert.equal(run.carrying, false);
  // Standing on the receiving pad without the object does not win.
  run.pos = [...FETCH_ROOM.goal];
  const emptyAtGoal = run.step(0, 0, 0.016, 1100);
  assert.equal(emptyAtGoal.won, false);
  assert.equal(emptyAtGoal.goalNeedsItem, true);

  // Move to the item inside the room at W = 0 and pick it up.
  run.pos = [0.85, 0];
  assert.equal(run.canInteract().action, 'pickup');
  const picked = run.interact(1200);
  assert.equal(picked.action, 'picked');
  assert.equal(run.carrying, true);
  assert.equal(run.activeField().tokenRadius, FETCH_ROOM.carriedRadius);

  // Shifting directly to +W (dial 0.74 -> W = 0.96) at [0.85, 0] is refused while carrying!
  assert.equal(run.setDial(0.74), false);

  // Put the item down at [0.85, 0.35] at W = -0.2 (dial 0.45): it stays at that 4D coordinate.
  run.pos = [0.85, 0.35];
  assert.ok(run.setDial(0.45));
  const dropped = run.interact(1400);
  assert.equal(dropped.action, 'dropped');
  assert.equal(run.carrying, false);
  near(run.item.w, -0.2);

  // Shift W far away to +1.2 (dial 0.8): the dropped item's 3D cross-section vanishes and cannot be picked up.
  assert.ok(run.setDial(0.8));
  const farSlice = itemSectionAtW(FETCH_ROOM, run.itemState(), dialToW(0.8));
  assert.equal(farSlice.kind, 'empty');
  assert.equal(run.canInteract().reason, 'other-w');
  // Its 4D footprint on the W map still records its exact (x, z, w).
  const foot = itemFootprint(FETCH_ROOM, run.itemState());
  near(foot.center[0], 0.85);
  near(foot.center[1], 0.35);
  near(foot.center[2], -0.2);

  // Return W to -0.2 (dial 0.45): the item reappears in this slice and can be picked back up.
  assert.ok(run.setDial(0.45));
  const nearSlice = itemSectionAtW(FETCH_ROOM, run.itemState(), dialToW(0.45));
  assert.equal(nearSlice.kind, 'sphere');
  assert.equal(run.interact(1600).action, 'picked');
  assert.equal(run.carrying, true);

  // Shift to +W (dial 0.72 -> W = 0.88) from the safe south spot [0.85, 0.35], carry to goal, and return to W = 0.
  assert.ok(run.setDial(0.72));
  run.pos = [...FETCH_ROOM.goal];
  run.item.x = run.pos[0];
  run.item.z = run.pos[1];
  assert.equal(run.step(0, 0, 0.016, 1800).won, false); // still at W = 0.88, outside goalW
  assert.ok(run.setDial(0.5, 2000)); // return to W = 0
  assert.equal(run.won, true);
  assert.equal(run.carrying, false); // placed on the receiving pad
  const json = run.toJSON();
  assert.equal(json.pickups, 2);
  assert.equal(json.drops, 1);
  assert.equal(json.completed, true);
});

test('dropping during a W transition stores the visible slice, and returning recovers the core', () => {
  const run = new WalkRun(STATION_ROOM, 'station');
  run.pos = STATION_ROOM.item.start.slice(0, 2);
  assert.equal(run.interact().action, 'picked');
  assert.ok(run.setDial(wToDial(1.1)));
  const drop = run.interact(1200, wToDial(0));
  assert.equal(drop.action, 'dropped');
  near(drop.item.w, 0);
  assert.equal(itemSectionAtW(STATION_ROOM, run.itemState(), 0).kind, 'sphere');
  assert.equal(run.canInteract().reason, 'other-w');
  assert.ok(run.setDial(wToDial(0)));
  assert.equal(run.interact(1400).action, 'picked');
});

test('core map ellipsoid agrees with spatial sections at the map height', () => {
  for (const field of [FETCH_ROOM, STATION_ROOM]) {
    const state = { x: 0.8, z: 0.3, w: -0.2, carrying: false };
    for (const y of [0.1, field.tokenY, field.item.y, 0.6]) {
      const foot = itemFootprint(field, state, y);
      for (let i = 0; i <= 100; i += 1) {
        const w = state.w - 0.9 + i * 0.018;
        const section = itemSectionAtW(field, state, w);
        const dy = y - section.center[1];
        const sectionR2 = section.kind === 'sphere' ? Math.max(0, section.radius ** 2 - dy ** 2) : 0;
        const mapR2 = foot.exists ? Math.max(0, foot.radius ** 2 * (1 - ((w - foot.center[2]) / foot.wRadius) ** 2)) : 0;
        near(mapR2, sectionR2);
      }
    }
    const centerCut = itemFootprint(field, state, field.item.y);
    near(centerCut.wRadius, field.item.wReach);
    const atMapHeight = itemFootprint(field, state);
    assert.ok(atMapHeight.wRadius > 0.5, 'the visible core at W offset 0.5 intersects the map');
    assert.equal(itemFootprint(field, { ...state, carrying: true }).exists, false,
      'the raised carried core is above the map height, not a false solid at floor height');
  }
});

test('station gates require power and a W change; an opened return passage carries the core', () => {
  assert.equal(levelById('station').field, STATION_ROOM);
  assert.equal(nextLevel('fetch').id, 'station');
  assert.ok(isUnlocked('station', new Set()));
  assert.ok(!solve(STATION_ROOM), 'a fully closed divider cannot be bypassed at any W');
  const powered = relayField(STATION_ROOM, true, false);
  assert.ok(solve(powered), 'power provides a route when W may change');
  for (let d = 0; d < DIALS; d += 1) {
    assert.ok(!solve(powered, { fixedDial: d }), `constant W ${d} cannot both cross and deliver`);
  }
  const carrying = fieldWithRadius(relayField(STATION_ROOM, false, false), STATION_ROOM.carriedRadius);
  assert.ok(!solve(carrying), 'taking the core before opening the return passage closes every route');
  const returned = fieldWithRadius(relayField(STATION_ROOM, false, true), STATION_ROOM.carriedRadius);
  assert.ok(solve(returned, { fixedDial: CENTER_DIAL }), 'the unlocked wide passage permits carrying at the destination W');
});

function walkTo(run, x, z) {
  for (let step = 0; step < 1000; step += 1) {
    const dx = x - run.pos[0];
    const dz = z - run.pos[1];
    const distance = Math.hypot(dx, dz);
    if (distance < 1e-5 || run.won) return;
    const delta = Math.min(0.025, distance / WALK_SPEED);
    const result = run.step(dx, dz, delta, 1000 + run.distance * 1000);
    assert.ok(result.travelled > 1e-8, `blocked on the way to ${x}, ${z} from ${run.pos}`);
    assert.ok(legalCorridorSpot(run.sectionsAt(), ...run.pos, run.activeField()));
  }
  assert.fail('waypoint was not reached');
}

test('failed interaction names the nearby device, while a reachable core still takes priority', () => {
  const run = new WalkRun(STATION_ROOM, 'station');
  const { latch, socket } = STATION_ROOM.relay;
  run.pos = [latch.x, latch.z];
  assert.ok(run.setDial(wToDial(1.1)));
  const stored = { ...run.item };
  assert.equal(run.interact().reason, 'latch-other-w');
  assert.deepEqual(run.item, stored, 'a rejected device interaction does not move the core');
  assert.equal(run.relayLatched, false);
  assert.ok(run.setDial(wToDial(0)));
  assert.equal(run.canInteract(wToDial(1.1)).reason, 'latch-other-w', 'visible W must reach the device');
  assert.equal(run.interact().action, 'latched');
  assert.equal(run.interact().reason, 'latch-open');

  run.item = { x: latch.x, z: latch.z, w: 0 };
  assert.equal(run.interact().action, 'picked', 'an already open latch does not hide a nearby core');
  run.interact();
  run.pos = [socket.x, socket.z];
  assert.equal(run.interact().reason, 'socket-other-w');
  assert.ok(run.setDial(wToDial(socket.w)));
  assert.equal(run.interact().reason, 'socket-empty');
});

test('station full physical route: dock, cross W, release latch, retrieve and deliver', () => {
  const run = new WalkRun(STATION_ROOM, 'station', 1000);
  assert.notEqual(run.canInteract().action, 'latch', 'the latch cannot be used remotely');
  walkTo(run, -1.8, 0.4);
  assert.equal(run.interact(1100).action, 'picked');
  walkTo(run, -1.7, -1.2);
  assert.equal(run.canInteract().action, 'drop', 'the socket cannot dock in the wrong layer');
  assert.ok(run.setDial(wToDial(-1.1)));
  assert.equal(run.canInteract(wToDial(0)).action, 'drop', 'shown W must also have reached the socket');
  assert.equal(run.interact(1200).action, 'docked');
  assert.equal(run.socketPowered(), true);
  assert.equal(run.activeField().bodies.some((b) => b.id === STATION_ROOM.relay.poweredGate), false);
  const stored = { ...run.item };
  assert.ok(run.setDial(wToDial(1.1)));
  assert.deepEqual(run.item, stored, 'the power source stays in the blue layer');
  assert.ok(run.socketPowered(), 'leaving that layer does not cut power');
  walkTo(run, 0, -1.1);
  assert.equal(run.setDial(wToDial(0)), false, 'closing the W curtain over the traveler is refused');
  walkTo(run, 1.15, -1.1);
  walkTo(run, 1.15, 1.0);
  assert.notEqual(run.canInteract().action, 'latch', 'the switch is only present in its own slice');
  assert.ok(run.setDial(wToDial(0)));
  assert.equal(run.interact(1300).action, 'latched');
  walkTo(run, -1.7, 1.0);
  walkTo(run, -1.7, -1.2);
  assert.ok(run.setDial(wToDial(-1.1)));
  assert.equal(run.interact(1400).action, 'picked');
  assert.equal(run.socketPowered(), false);
  assert.ok(run.activeField().bodies.some((b) => b.id === STATION_ROOM.relay.poweredGate));
  assert.equal(run.activeField().bodies.some((b) => b.id === STATION_ROOM.relay.shortcutGate), false);
  walkTo(run, -1.7, 1.0);
  walkTo(run, 1.5, 1.0);
  assert.ok(run.setDial(wToDial(0)));
  walkTo(run, ...STATION_ROOM.goal);
  assert.ok(run.won);
  assert.deepEqual(run.toJSON().relay, { powered: false, latched: true, socketUses: 1 });
  assert.equal(run.pickups, 2);
  const reset = new WalkRun(STATION_ROOM, 'station');
  assert.equal(reset.relayLatched, false);
  assert.equal(reset.socketPowered(), false);
  assert.equal(reset.activeField().bodies.length, STATION_ROOM.bodies.length);
});

test('removing a power source cannot close its gate around the traveler', () => {
  const spec = { ...STATION_ROOM, relay: { ...STATION_ROOM.relay,
    socket: { ...STATION_ROOM.relay.socket, x: -0.5, z: -1.1, w: 1.1 } } };
  const run = new WalkRun(spec, 'near-gate-test');
  walkTo(run, -1.8, 0.4);
  run.interact();
  assert.ok(run.setDial(wToDial(1.1)));
  walkTo(run, -1.0, -1.1);
  assert.equal(run.interact().action, 'docked');
  walkTo(run, 0, -1.1);
  assert.equal(run.canInteract().action, 'blocked');
  assert.equal(run.interact().action, 'blocked');
  assert.ok(run.socketPowered());
  assert.ok(legalCorridorSpot(run.sectionsAt(), ...run.pos, run.activeField()));
});
