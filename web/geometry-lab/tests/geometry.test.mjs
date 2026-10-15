import test from 'node:test';
import assert from 'node:assert/strict';
import { SINGLE, TWINS, TRANSFER, CORRIDOR, hypersphere, sliceAtW, sliceAtDial, dialToW, surfacePoint, classifyChange, corridorSections, tokenInsideSection, legalCorridorSpot, moveCorridorToken } from '../geometry.mjs';
import { PredictionSession, TRIALS } from '../challenge.mjs';

const near = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);

test('central slice has the full 4D radius and correct 3D volume', () => {
  const section = sliceAtW(SINGLE, 0);
  assert.equal(section.kind, 'sphere');
  near(section.radius, 1.5);
  near(section.volume, 4.5 * Math.PI);
});

test('both boundaries are points; slices beyond either boundary are empty', () => {
  for (const sign of [-1, 1]) {
    assert.equal(sliceAtW(SINGLE, sign * 1.5).kind, 'point');
    assert.equal(sliceAtW(SINGLE, sign * 1.6).kind, 'empty');
    near(sliceAtW(SINGLE, sign * 1.6).volume, 0);
    assert.ok(sliceAtW(SINGLE, sign * (1.5 - 1e-8)).radius < 0.001);
  }
});

test('every sampled 3D surface point satisfies its original 4D equation', () => {
  for (const body of [SINGLE, TRANSFER, ...TWINS]) {
    for (let i = 1; i < 40; i += 1) {
      const w = body.center[3] - body.radius + 2 * body.radius * i / 40;
      const section = sliceAtW(body, w);
      for (let j = 0; j < 12; j += 1) {
        const point = surfacePoint(section, j * Math.PI / 12 - Math.PI / 2, j * 2.39996);
        const distanceSquared = [...point, w].reduce((sum, value, axis) => sum + (value - body.center[axis]) ** 2, 0);
        near(distanceSquared, body.radius ** 2);
      }
    }
  }
});

test('radius is symmetric about the W center, including translated bodies', () => {
  for (const body of [SINGLE, TRANSFER, ...TWINS]) {
    for (const distance of [0, 0.1, 0.4, 0.7, 1.1]) {
      near(sliceAtW(body, body.center[3] - distance).radius, sliceAtW(body, body.center[3] + distance).radius);
    }
  }
});

test('normalized W mapping clamps endpoints and rejects non-finite values', () => {
  near(dialToW(-1), -2);
  near(dialToW(0.5), 0);
  near(dialToW(2), 2);
  for (const value of [NaN, Infinity, -Infinity]) {
    assert.throws(() => dialToW(value), TypeError);
    assert.throws(() => sliceAtW(SINGLE, value), TypeError);
  }
  assert.throws(() => hypersphere('invalid', [0, 0, 0], 1), TypeError);
  assert.throws(() => hypersphere('invalid', [0, 0, 0, 0], 0), RangeError);
});

test('two fixed 4D bodies produce different cross-sections at the same W', () => {
  assert.ok(sliceAtDial(TWINS[0], 0.25).radius > 0);
  assert.equal(sliceAtDial(TWINS[1], 0.25).kind, 'empty');
  assert.equal(sliceAtDial(TWINS[0], 0.75).kind, 'empty');
  assert.ok(sliceAtDial(TWINS[1], 0.75).radius > 0);
});

test('all five qualitative predictions and the shifted-body trial are covered', () => {
  const answers = TRIALS.map(({ body, from, to }) => classifyChange(sliceAtDial(body, from), sliceAtDial(body, to)));
  assert.deepEqual(answers, ['appear', 'grow', 'shrink', 'disappear', 'same', 'grow']);
  assert.equal(classifyChange(sliceAtW(SINGLE, -2), sliceAtW(SINGLE, 2)), 'same');
});

test('challenge locks answers, counts actual correct predictions, and completes once', () => {
  const session = new PredictionSession();
  assert.throws(() => session.next());
  assert.throws(() => session.submit('unknown'), RangeError);
  for (let i = 0; i < TRIALS.length; i += 1) {
    const { body, from, to } = session.trial;
    const answer = classifyChange(sliceAtDial(body, from), sliceAtDial(body, to));
    const record = session.submit(i === 0 ? 'disappear' : answer);
    assert.equal(record.correct, i !== 0);
    assert.throws(() => session.submit(answer));
    assert.equal(session.next(), i < TRIALS.length - 1);
  }
  assert.equal(session.state, 'complete');
  assert.equal(session.score, 5);
  const result = JSON.parse(JSON.stringify(session));
  assert.equal(result.completed, true);
  assert.equal(result.answered, 6);
  assert.equal(result.trials[5].body.center[3], 0.45);
  assert.throws(() => session.next());
});

const wallBlocked = (sections, wallX) => {
  for (let z = -0.9; z <= 0.9; z += 0.025) {
    if (legalCorridorSpot(sections, wallX, z)) return false;
  }
  return true;
};

const pathLegal = (sections, from, to) => {
  const steps = Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / 0.02);
  for (let i = 0; i <= steps; i += 1) {
    const x = from[0] + (to[0] - from[0]) * (i / steps);
    const z = from[1] + (to[1] - from[1]) * (i / steps);
    if (!legalCorridorSpot(sections, x, z)) return false;
  }
  return true;
};

const NEAR_X = CORRIDOR.bodies[0].center[0];
const FAR_X = CORRIDOR.bodies[3].center[0];

test('corridor walls seal at W=0 and each opens only on its own W side', () => {
  const center = corridorSections(0);
  assert.equal(center.filter((s) => s.kind === 'sphere').length, 6);
  assert.ok(wallBlocked(center, NEAR_X) && wallBlocked(center, FAR_X));
  // No single W leaves the straight route open: near wall seals for W <= 0,
  // far wall seals for W >= 0.
  for (const w of [-2, -1.6, -1.2, -0.6, 0]) assert.ok(wallBlocked(corridorSections(w), NEAR_X), `near wall should block at ${w}`);
  for (const w of [0.6, 1.2, 1.6, 2]) assert.ok(wallBlocked(corridorSections(w), FAR_X), `far wall should block at ${w}`);
  const high = corridorSections(0.3);
  const low = corridorSections(-0.3);
  assert.ok(high.slice(0, 3).every((s) => s.kind === 'empty'));
  assert.ok(low.slice(3).every((s) => s.kind === 'empty'));
  assert.ok(wallBlocked(high, FAR_X));
  assert.ok(wallBlocked(low, NEAR_X));
});

test('corridor route is only solvable by changing W mid-run', () => {
  const entry = corridorSections(0.3);
  assert.ok(pathLegal(entry, CORRIDOR.start, [0, 0]));
  assert.ok(!pathLegal(entry, [0, 0], CORRIDOR.goal));
  const exit = corridorSections(-0.3);
  assert.ok(pathLegal(exit, [0, 0], CORRIDOR.goal));
  assert.ok(!pathLegal(exit, CORRIDOR.start, [0, 0]));
  // Straight-line legality never exists at a single W.
  for (let dial = 0; dial <= 1; dial += 0.02) {
    assert.ok(!pathLegal(corridorSections(dialToW(dial)), CORRIDOR.start, CORRIDOR.goal), `dial ${dial}`);
  }
});

test('growing sections would engulf the token; engulf check detects it', () => {
  assert.ok(!tokenInsideSection(corridorSections(0), -2.2, 0));
  assert.ok(tokenInsideSection(corridorSections(-1), -2.2, 0));
  assert.ok(tokenInsideSection(corridorSections(1), 2.2, 0));
  assert.ok(!legalCorridorSpot(corridorSections(0), 2.4, 0));
  assert.ok(!legalCorridorSpot(corridorSections(0), 0, 1.0));
});

test('corridor token moves slide along walls and stop at bounds', () => {
  const sections = corridorSections(0);
  const slide = moveCorridorToken(sections, [-2.0, 0.7], 0, -0.2);
  assert.equal(slide.blocked, null);
  near(slide.z, 0.5);
  const wedged = moveCorridorToken(sections, [-2.05, 0.2], 0.2, 0);
  assert.equal(wedged.x, -2.05);
  assert.notEqual(wedged.blocked, null);
  const out = moveCorridorToken(sections, [-2.3, 0], -0.2, 0);
  assert.equal(out.x, -2.3);
  const diagonal = moveCorridorToken(sections, [-2.0, 0.55], 0.3, -0.15);
  assert.equal(diagonal.blocked, 'x');
  near(diagonal.z, 0.4);
  assert.ok(legalCorridorSpot(sections, diagonal.x, diagonal.z));
});
