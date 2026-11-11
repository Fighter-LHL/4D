import test from 'node:test';
import assert from 'node:assert/strict';
import { CourtyardLife } from '../src/courtyard-life.js';

const NODES = [
  { id: 'hub', name: '归响台', kind: 'hub', anchor: true, x: 500, y: 350 },
  { id: 'relay', name: '维度锚台', kind: 'relay', anchor: true, x: 396, y: 296 },
  { id: 'dew', name: '引潮泵', kind: 'mechanism', x: 292, y: 242 },
  { id: 'exit', name: '庭门', kind: 'exit', x: 708, y: 296 },
];

function settle(life, seconds = 4, player = { x: -500, y: -500 }) {
  const frames = Math.ceil(seconds * 60);
  for (let i = 0; i < frames; i++) life.update(1 / 60, player);
}

test('fireflies live near anchors inside bounds and look toward the player', () => {
  const life = new CourtyardLife({ seed: 7 });
  life.setRoom('cascade:012:r0:m1:single:0', NODES);
  assert.equal(life.fireflies.length, 3);
  assert.equal(life.fireflies, life.fireflies, 'stable array identity');
  const player = { x: 600, y: 300 };
  for (let i = 0; i < 120; i++) life.update(1 / 60, player);
  for (const fly of life.fireflies) {
    assert.ok(fly.x >= 20 && fly.x <= 980 && fly.y >= 20 && fly.y <= 630);
    assert.ok(fly.lookX >= -1 && fly.lookX <= 1 && fly.lookY >= -1 && fly.lookY <= 1);
    assert.ok(fly.glow >= 0 && fly.glow <= 1);
    const lookLen = Math.hypot(fly.lookX, fly.lookY);
    assert.ok(lookLen > .5, 'firefly looks toward the player');
  }
});

test('every public surface stays finite and inert under garbage input', () => {
  const life = new CourtyardLife({ seed: 3 });
  life.setRoom('s', NODES);
  life.swayAngle('g', 100, 400);
  life.dustOffset(2, 200, 300);
  for (const dt of [NaN, Infinity, -Infinity, -1, 0]) life.update(dt, { x: 1, y: 2 });
  life.update(1 / 60, { x: NaN, y: NaN });
  life.update(1 / 60, null);
  life.pointer(NaN, 0, 0, 0);
  life.pointer(10, 10, NaN, Infinity);
  life.ripple(NaN, 0);
  life.dashPass(Infinity, 0, 1, 0);
  life.cheer(NaN);
  life.swayAngle('bad', NaN, 0);
  life.dustOffset(3, NaN, NaN);
  for (let i = 0; i < 60; i++) life.update(1 / 60, { x: 100, y: 100 });
  for (const fly of life.fireflies) for (const v of [fly.x, fly.y, fly.lookX, fly.lookY, fly.glow]) assert.ok(Number.isFinite(v));
  const dust = life.dustOffset(2, 200, 300);
  assert.ok(Number.isFinite(dust.dx) && Number.isFinite(dust.dy));
  assert.ok(Number.isFinite(life.swayAngle('g', 100, 400)));
});

test('sway and dust react to pointer, ripples and dashes, then return to rest', () => {
  const life = new CourtyardLife({ seed: 5 });
  life.setRoom('s', NODES);
  assert.equal(life.swayAngle('fern', 120, 500), 0);
  const dust = life.dustOffset(0, 400, 300);
  assert.deepEqual({ dx: dust.dx, dy: dust.dy }, { dx: 0, dy: 0 });

  life.pointer(130, 500, 900, 0);
  for (let i = 0; i < 30; i++) life.update(1 / 60, { x: 0, y: 0 });
  const angle = life.swayAngle('fern', 120, 500);
  assert.notEqual(angle, 0);
  assert.ok(Math.abs(angle) <= .6);
  life.pointer(null);
  settle(life);
  assert.equal(life.swayAngle('fern', 120, 500), 0);

  life.ripple(400, 300, 1);
  for (let i = 0; i < 10; i++) life.update(1 / 60, { x: 0, y: 0 });
  assert.ok(dust.dx !== 0 || dust.dy !== 0, 'ripple front kicks the mote once');
  settle(life);
  const rest = life.dustOffset(0, 400, 300);
  assert.equal(rest.dx, 0);
  assert.equal(rest.dy, 0);

  life.dashPass(120, 500, 1, 0);
  life.update(1 / 60, { x: 0, y: 0 });
  assert.notEqual(life.swayAngle('fern', 120, 500), 0, 'dash wind bends the fern');
});

test('capacity is fixed: extra sway keys and dust indices read as zero', () => {
  const life = new CourtyardLife({ seed: 1 });
  life.setRoom('cap', NODES);
  for (let i = 0; i < 170; i++) life.swayAngle(`k${i}`, (i * 37) % 900 + 50, (i * 53) % 500 + 60);
  life.pointer(500, 300, 800, 800);
  for (let i = 0; i < 30; i++) life.update(1 / 60, { x: 0, y: 0 });
  assert.equal(life.swayAngle('k160', 800, 100), 0, 'keys past 150 never register');
  const out = life.dustOffset(32, 0, 0);
  assert.deepEqual({ dx: out.dx, dy: out.dy }, { dx: 0, dy: 0 });
  assert.deepEqual({ dx: life.dustOffset(-1, 0, 0).dx, dy: life.dustOffset(-1, 0, 0).dy }, { dx: 0, dy: 0 });
  assert.equal(life.dustOffset(0, 10, 10), life.dustOffset(0, 10, 10), 'reused object per index');
});

test('fireflies avoid the pointer, scatter on ripples, and come home', () => {
  const life = new CourtyardLife({ seed: 11 });
  life.setRoom('avoid', NODES);
  const fly = life.fireflies[0];
  const home = { x: fly.x, y: fly.y };
  life.pointer(home.x, home.y, 0, 0);
  for (let i = 0; i < 90; i++) life.update(1 / 60, { x: 0, y: 0 });
  const away = Math.hypot(fly.x - home.x, fly.y - home.y);
  assert.ok(away >= 60, `firefly keeps distance from pointer (${away.toFixed(1)}px)`);
  life.pointer(null);
  settle(life);
  assert.ok(Math.hypot(fly.x - home.x, fly.y - home.y) < 1e-3, 'firefly returns home');

  life.ripple(home.x, home.y, 1.4);
  for (let i = 0; i < 20; i++) life.update(1 / 60, { x: 0, y: 0 });
  assert.ok(Math.hypot(fly.x - home.x, fly.y - home.y) > 5, 'ring front scatters the firefly');
  settle(life);
  assert.ok(Math.hypot(fly.x - home.x, fly.y - home.y) < 1e-3, 'firefly returns home again');
  assert.ok(fly.x >= 20 && fly.x <= 980 && fly.y >= 20 && fly.y <= 630);
});

test('cheer raises a timed happy flag and the same seed+signature is deterministic', () => {
  const life = new CourtyardLife({ seed: 9 });
  life.setRoom('cheer', NODES);
  assert.equal(life.cheering, false);
  life.cheer(1.1);
  assert.equal(life.cheering, true);
  life.update(1 / 60, { x: 0, y: 0 });
  assert.equal(life.fireflies[0].happy, true);
  settle(life, 1.5);
  assert.equal(life.cheering, false);
  assert.equal(life.fireflies[0].happy, false);

  const run = () => {
    const l = new CourtyardLife({ seed: 42 });
    l.setRoom('same', NODES);
    l.pointer(300, 300, 100, 50);
    for (let i = 0; i < 90; i++) l.update(1 / 60, { x: 320, y: 280 });
    l.ripple(400, 300, .8);
    for (let i = 0; i < 30; i++) l.update(1 / 60, { x: 320, y: 280 });
    return l.fireflies.map(f => [f.x, f.y, f.lookX, f.lookY, f.glow]);
  };
  assert.deepEqual(run(), run(), 'identical seed+signature replays identically');
});

test('reduced motion zeroes ambient response but still permits firefly gaze', () => {
  const life = new CourtyardLife({ reducedMotion: true, seed: 3 });
  life.setRoom('calm', NODES);
  const reference = new CourtyardLife({ seed: 3 });
  reference.setRoom('calm', NODES);
  life.pointer(300, 350, 900, 0);
  life.ripple(400, 300);
  for (let i = 0; i < 120; i++) life.update(1 / 60, { x: 640, y: 320 });
  assert.equal(life.swayAngle('grass', 100, 400), 0);
  assert.deepEqual({ dx: life.dustOffset(0, 200, 200).dx, dy: life.dustOffset(0, 200, 200).dy }, { dx: 0, dy: 0 });
  for (let i = 0; i < 3; i++) {
    assert.equal(life.fireflies[i].x, reference.fireflies[i].x, 'firefly rests at home');
    assert.equal(life.fireflies[i].y, reference.fireflies[i].y);
    assert.ok(Math.hypot(life.fireflies[i].lookX, life.fireflies[i].lookY) > .5, 'gaze still tracks the player');
  }
});
