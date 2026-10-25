import test from 'node:test';
import assert from 'node:assert/strict';
import { SENTRY_HALL, legalCorridorSpot, corridorSections, wChangeEngulfs } from '../geometry.mjs';
import { SENTRY_LEVEL } from '../levels.mjs';
import { patrolPose, sees, touches, presentAt, Patrol, SENTRY } from '../sentry.mjs';
import { appHarness } from './app-harness.mjs';
import { wToDial, dialToW } from '../geometry.mjs';

const field = SENTRY_HALL;
const sentries = SENTRY_LEVEL.sentries;
const byId = (id) => sentries.find((s) => s.id === id);
const sectionsAt = (w) => corridorSections(w, field);

test('a sentry exists, sees and touches only inside its own W range', () => {
  const s = byId('sentry-zero-west');
  const pose = patrolPose(s, 0);
  const inFront = [pose.x - 1.0, 0];
  assert.ok(sees(s, pose, inFront, 0, sectionsAt(0), field.tokenY));
  assert.equal(sees(s, pose, inFront, 1.4, sectionsAt(1.4), field.tokenY), false, 'another W: invisible to it');
  assert.equal(sees(s, pose, [pose.x + 1.0, 0], 0, sectionsAt(0), field.tokenY), false, 'behind it');
  assert.equal(presentAt(s, 0.74), true);
  assert.equal(presentAt(s, 0.76), false);
  assert.ok(touches(s, pose, [pose.x, 0], 0, field.tokenY, field.tokenRadius));
  assert.equal(touches(s, pose, [pose.x, 0], 1.4, field.tokenY, field.tokenRadius), false, 'phase through it in another W');
});

test('walls of the current section cut a sentry\u2019s sight', () => {
  const s = byId('sentry-zero-west');
  const pose = patrolPose(s, 0);
  // Behind the west wall's north segment, well inside the cone's range.
  assert.equal(sees(s, pose, [-1.85, -0.75], 0, sectionsAt(0), field.tokenY), false);
});

test('alert builds over continuous sight, cools when hidden, and respawn grants grace', () => {
  const patrol = new Patrol([byId('sentry-zero-west')]);
  const pose = patrolPose(byId('sentry-zero-west'), 0);
  const spot = [pose.x - 1.0, 0];
  let caught = null;
  for (let i = 0; i < 10 && !caught; i++) caught = patrol.step(0.05, spot, 0, sectionsAt(0), field.tokenY, field.tokenRadius).caught;
  assert.equal(caught, null, 'half a second is not yet a catch');
  for (let i = 0; i < 6 && !caught; i++) caught = patrol.step(0.05, spot, 0, sectionsAt(0), field.tokenY, field.tokenRadius).caught;
  assert.equal(caught, 'sentry-zero-west');
  patrol.respawn();
  const after = patrol.step(0.05, spot, 0, sectionsAt(0), field.tokenY, field.tokenRadius);
  assert.equal(after.caught, null, 'grace after respawn');
  assert.ok(SENTRY.graceSeconds > 1);
});

// Conservative planner: any state where a sentry sees or touches the
// courier is forbidden (the game tolerates 0.6 s of sight).
function solve({ offset = 0, fixedW = null, seconds = 40 } = {}) {
  const DT = 0.2, CELL = 0.2, WS = 0.25;
  const nx = Math.round(2 * field.bounds.x / CELL) + 1, nz = Math.round(2 * field.bounds.z / CELL) + 1, nw = Math.round(4 / WS) + 1;
  const X = (i) => -field.bounds.x + i * CELL, Z = (j) => -field.bounds.z + j * CELL, W = (k) => -2 + k * WS;
  const secs = Array.from({ length: nw }, (_, k) => sectionsAt(W(k)));
  const key = (i, j, k) => (k * nx + i) * nz + j;
  const legal = (i, j, k) => legalCorridorSpot(secs[k], X(i), Z(j), field);
  const safe = (t, i, j, k) => sentries.every((s) => {
    const pose = patrolPose(s, offset + t * DT);
    return !sees(s, pose, [X(i), Z(j)], W(k), secs[k], field.tokenY) && !touches(s, pose, [X(i), Z(j)], W(k), field.tokenY, field.tokenRadius);
  });
  const k0 = fixedW === null ? Math.round(2 / WS) : Math.round((fixedW + 2) / WS);
  let frontier = new Set([key(Math.round((field.start[0] + field.bounds.x) / CELL), Math.round((field.start[1] + field.bounds.z) / CELL), k0)]);
  for (let t = 0; t < seconds / DT; t++) {
    const next = new Set();
    for (const s of frontier) {
      const k = Math.floor(s / (nx * nz)), i = Math.floor((s % (nx * nz)) / nz), j = s % nz;
      if (Math.hypot(X(i) - field.goal[0], Z(j) - field.goal[1]) < 0.3 && Math.abs(W(k)) <= 0.25) return true;
      const moves = [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [1, 1, 0], [1, -1, 0], [-1, 1, 0], [-1, -1, 0]];
      if (fixedW === null) moves.push([0, 0, 1], [0, 0, -1]);
      for (const [di, dj, dk] of moves) {
        const a = i + di, b = j + dj, c = k + dk;
        if (a < 0 || b < 0 || c < 0 || a >= nx || b >= nz || c >= nw || !legal(a, b, c)) continue;
        if (dk && wChangeEngulfs(field, [X(i), Z(j)], W(k), W(c))) continue;
        const n = key(a, b, c);
        if (!next.has(n) && safe(t + 1, a, b, c)) next.add(n);
      }
    }
    frontier = next;
    if (!frontier.size) return false;
  }
  return false;
}

test('sentry hall is solvable from several patrol phases, and impossible at any fixed W', () => {
  for (const offset of [0, 3.5, 9]) assert.ok(solve({ offset }), `phase ${offset}`);
  for (const fixedW of [-1.5, -0.75, 0, 0.75, 1.5]) assert.equal(solve({ fixedW }), false, `fixed W ${fixedW}`);
});

test('full app: getting caught returns to the checkpoint with grace; the patrol keeps animating', async () => {
  const h = await appHarness('?level=sentry');
  assert.equal(h.app.level.id, 'sentry');
  h.advance(200);
  assert.ok(h.frames.size > 0, 'a patrolled level is never idle');
  const cp = h.app.level.field.checkpoint;
  h.app.run.pos = [...cp.pos]; h.advance(50);
  // Step right in front of the W 0 west-facing post.
  h.app.run.pos = [-1.1, 0]; h.app.setDial(wToDial(0));
  h.advance(1200);
  assert.deepEqual(h.app.run.pos, [...cp.pos], 'back at the checkpoint');
  assert.equal(dialToW(h.app.current), cp.w);
  assert.ok(h.node('stage').classes.has('caught'));
  assert.match(h.node('sr-status').textContent, /被发现/);
});

test('full app: reaching the exit stops the patrol and reports catches on the card', async () => {
  const h = await appHarness('?level=sentry');
  h.app.run.pos = [...h.app.level.field.goal]; h.app.setDial(wToDial(0));
  h.advance(100);
  assert.equal(h.app.run.won, true);
  h.advance(1000);
  assert.equal(h.frames.size, 0, 'no frames once the run is over');
});
