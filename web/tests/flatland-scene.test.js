import test from 'node:test';
import assert from 'node:assert/strict';
import { FlatlandRenderer } from '../src/flatland/scene.js';
import { FlatlandModel } from '../src/flatland/model.js';
import { FLATLAND_LEVELS } from '../src/flatland/levels.js';
import { projectFloor } from '../src/flatland/ascend.js';
import { drawCompanions } from '../src/flatland/friends-scene.js';
import { DT, levelIndex, play, goto, playVisitor, solveLocks, solveMirror, runEscape } from './flatland-helpers.js';

function renderer(width = 1000, height = 560) {
  const calls = [];
  const finite = value => {
    if (typeof value === 'number') assert.ok(Number.isFinite(value), `non-finite canvas value: ${value}`);
    if (Array.isArray(value)) value.forEach(finite);
  };
  const special = { createRadialGradient: () => ({ addColorStop() {} }), measureText: text => ({ width: String(text).length * 8 }) };
  const context = new Proxy({}, {
    get(target, key) {
      if (key in target) return target[key];
      return (...args) => { args.forEach(finite); calls.push({ method: key, args, stroke: target.strokeStyle, fill: target.fillStyle }); return special[key]?.(...args); };
    },
    set(target, key, value) { finite(value); target[key] = value; return true; },
  });
  globalThis.window = { devicePixelRatio: 2, matchMedia: () => ({ matches: false, addEventListener() {} }) };
  const canvas = { width: 0, height: 0, getContext: () => context, getBoundingClientRect: () => ({ width, height, left: 0, top: 0 }) };
  return { scene: new FlatlandRenderer(canvas), calls, canvas };
}
const SIZES = [[1000, 560], [380, 600]];
const texts = calls => calls.filter(c => c.method === 'fillText').map(c => String(c.args[0]));
// Steps the model while drawing every frame, so bots exercise every effect path.
function drawing(m, scene) {
  const update = m.update.bind(m);
  m.update = dt => { update(dt); scene.setState(m.snapshot()); scene.pushEvents(m.drainEvents()); scene.render(dt); };
  return m;
}

test('every level renders finite geometry across the slice range, wide and narrow', () => {
  for (const [width, height] of SIZES) {
    const { scene, canvas } = renderer(width, height);
    FLATLAND_LEVELS.forEach((_, index) => {
      const model = new FlatlandModel(index, { seed: index + 1 }); model.start();
      for (let s = 0; s <= 6; s += .25) {
        model.setSlice(s); model.update(.05);
        scene.setState(model.snapshot()); scene.pushEvents(model.drainEvents()); scene.render(1 / 60);
      }
    });
    assert.equal(canvas.width, width * 2);
  }
});

test('full bot runs draw score popups, particles and the HUD for every story level', () => {
  for (const [width, height] of SIZES) for (const reduced of [false, true]) {
    const { scene, calls } = renderer(width, height); scene.reducedMotion = reduced;
    for (const [id, solve] of [['visitor', playVisitor], ['guess', solveLocks], ['escape', runEscape], ['mirror', solveMirror]]) {
      const m = drawing(play(id, 4), scene);
      solve(m);
      assert.equal(m.phase, 'complete', id);
      for (let i = 0; i < 30; i++) m.update(DT);
      scene.render(.05);
    }
    const drawn = texts(calls);
    assert.ok(drawn.some(t => /^\+\d+/.test(t)), 'score popups');
    assert.ok(drawn.some(t => t.includes('×')), 'combo multiplier');
    assert.ok(drawn.some(t => t.startsWith('S ')), 'slice readout');
    assert.ok(calls.some(c => c.method === 'ellipse'));
  }
});

test('hazards, warnings and deaths draw in the danger colour with a screen flash', () => {
  const { scene, calls } = renderer();
  const m = drawing(play('escape', 2), scene);
  goto(m, 10, 6); m.setSlice(4); goto(m, 13.8, 6); m.setSlice(2.6); goto(m, 15.8, 6, 3);
  for (let i = 0; i < 300 && !m.dying; i++) m.update(DT);
  assert.ok(m.deaths >= 1);
  assert.ok(calls.some(c => c.method === 'stroke' && c.stroke === '#c4553b'));
  assert.ok(calls.some(c => c.method === 'createRadialGradient'), 'hurt vignette');
  assert.ok(scene.particles.length > 0);
});

test('storm draws hearts, waves and hazard profiles in the side view', () => {
  const { scene, calls } = renderer();
  const m = drawing(play('storm', 6), scene);
  m.safeUntil = Infinity;
  for (let i = 0; i < 60 * 15; i++) m.update(DT);
  assert.ok(texts(calls).some(t => t.startsWith('第 ')));
  assert.ok(calls.some(c => c.method === 'fill' && c.fill === '#f1c2b4'));
});

test('pause freezes particles, popups and the current shake offset', () => {
  const { scene, calls } = renderer();
  const m = play('storm'); scene.setState(m.snapshot());
  scene.pushEvents([{ type: 'hurt', x: 10, y: 6 }, { type: 'graze', x: 10, y: 6, points: 75 }]);
  scene.render(.05); m.setPaused(true); scene.setState(m.snapshot());
  calls.length = 0; scene.render(.1); const first = JSON.stringify(calls);
  calls.length = 0; scene.render(.1);
  assert.equal(JSON.stringify(calls), first);
  assert.ok(texts(calls).includes('险过 +75'));
});

test('exploration draws encounters, companion parties and toy faces with finite geometry', () => {
  const collection = { found: ['sprout', 'lantern', 'ribbon'], companion: 'all' };
  for (const [width, height] of SIZES) for (const reduced of [false, true]) {
    const { scene, calls } = renderer(width, height); scene.reducedMotion = reduced;
    for (const id of ['visitor', 'guess', 'escape', 'vault', 'mirror', 'ascend']) {
      const m = new FlatlandModel(levelIndex(id), { seed: 42, playStyle: 'explore', collection }); m.start();
      for (const s of [.6, 2.7, 3, 4.7, 5.4]) {
        m.setSlice(s); m.setPeek(true); m.petCompanion(); m.update(.1);
        scene.setState(m.snapshot()); scene.pushEvents(m.drainEvents()); scene.render(.1);
      }
    }
    assert.ok(!texts(calls).some(t => /^\+\d+/.test(t)), 'roaming does not advertise score');
    assert.ok(calls.some(c => c.method === 'bezierCurveTo'), 'ribbon companion is drawn');
  }
});

test('storm friends cheer at grazes and high combos, keep crowns, and freeze with pause or reduced motion', () => {
  const collection = { found: ['sprout', 'lantern', 'ribbon'], companion: 'all' };
  const gardens = Object.fromEntries(FLATLAND_LEVELS.filter(l => l.garden).map(l => [l.id, true]));
  for (const reduced of [false, true]) {
    const { scene, calls } = renderer(320, 400); scene.reducedMotion = reduced;
    const m = new FlatlandModel(levelIndex('storm'), { seed: 42, collection, gardenMemories: gardens }); m.start();
    const before = m.snapshot(); scene.setState(before); drawCompanions(scene);
    const restingY = calls.find(c => c.method === 'translate').args[1];
    assert.equal(calls.filter(c => c.method === 'fill' && c.fill === '#fff4d9').length, 45, 'three five-petal flowers on each friend');
    scene.pushEvents([{ type: 'score', combo: 2, points: 100, x: 10, y: 6 }]); assert.equal(scene.friendCheer, 0);
    for (const event of [{ type: 'graze', points: 75, x: 10, y: 6 }, { type: 'score', combo: 3, points: 200, x: 10, y: 6 }]) {
      scene.pushEvents([event]); assert.equal(scene.friendCheer, 1.1);
      calls.length = 0; drawCompanions(scene);
      const happyY = calls.find(c => c.method === 'translate').args[1];
      if (reduced) assert.equal(happyY, restingY); else assert.ok(happyY < restingY);
      assert.ok(calls.some(c => c.method === 'quadraticCurveTo'), 'happy eyes remain visible without hopping');
      scene.render(.2); const remaining = scene.friendCheer;
      scene.setState({ ...before, paused: true }); scene.render(.5); assert.equal(scene.friendCheer, remaining);
      scene.setState(before); scene.render(1.2); assert.equal(scene.friendCheer, 0);
    }
    scene.pushEvents([{ type: 'graze', points: 75, x: 10, y: 6 }, { type: 'hurt', x: 10, y: 6 }]);
    assert.equal(scene.friendCheer, 0, 'do not celebrate a lost life');
    scene.pushEvents([{ type: 'graze', points: 75, x: 10, y: 6 }, { type: 'load' }]); assert.equal(scene.friendCheer, 0);
    assert.deepEqual(m.snapshot(), before, 'presentation leaves the game authority untouched');
  }
});

test('a large visitor section cannot paint over the nearby flower-pad instruction on a phone', () => {
  const { scene, calls } = renderer(320, 400);
  const m = new FlatlandModel(levelIndex('visitor'), { seed: 42, playStyle: 'explore' }); m.start();
  m.setSlice(2.1); goto(m, 6.5, 9); scene.setState(m.snapshot()); scene.render(.016);
  const instruction = calls.findIndex(c => c.method === 'fillText' && c.args[0] === '懂倒影的朋友');
  const visitor = calls.findIndex(c => c.method === 'fill' && c.fill === '#cfe6ee');
  assert.ok(visitor >= 0 && instruction > visitor, 'instruction belongs to the foreground');
});

test('blocked events flash the blocking solid', () => {
  const { scene, calls } = renderer();
  const model = play('escape');
  model.setMove(1, 0); for (let i = 0; i < 5; i++) model.update(.1);
  model.setSlice(4); model.setMove(1, 0); model.update(.1); model.setMove(0, 0);
  for (let i = 0; i < 6; i++) model.update(.1);
  assert.equal(model.setSlice(1), false, 'standing over the east wall');
  scene.setState(model.snapshot()); scene.pushEvents(model.drainEvents()); scene.render(.05);
  assert.ok(calls.some(call => call.method === 'stroke' && call.stroke === '#c4553b'));
});

test('screenToWorld maps canvas pixels into the flat world', () => {
  const { scene } = renderer();
  scene.setState(new FlatlandModel(1, { seed: 1 }).snapshot()); scene.render(0);
  const { main } = scene.view;
  const point = scene.screenToWorld(main.ox + 5 * main.scale, main.oy + 3 * main.scale);
  assert.ok(Math.abs(point.x - 5) < 1e-9 && Math.abs(point.y - 3) < 1e-9);
  assert.equal(scene.screenToWorld(1, 1), null);
});

test('locks hide the side view behind a question mark until revealed', () => {
  const { scene, calls } = renderer();
  const m = play('guess', 3);
  scene.setState(m.snapshot()); scene.render(.05);
  assert.ok(texts(calls).includes('?'));
  calls.length = 0; m.reveal(); scene.setState(m.snapshot()); scene.render(.05);
  assert.ok(!texts(calls).includes('?'));
});

test('ascend renders both dimensions and a reversible pointer projection', () => {
  for (const [width, height] of SIZES) for (const reduced of [false, true]) {
    const { scene, calls } = renderer(width, height); scene.reducedMotion = reduced;
    const m = drawing(new FlatlandModel(levelIndex('ascend'), { seed: 1 }), scene); m.start();
    const wait = seconds => { for (let t = 0; t < seconds - 1e-9; t += .05) m.update(.05); };
    m.setSlice(4); m.setMove(1, 0); wait(1.4); m.setMove(0, 0); m.setSlice(1); wait(.05);
    assert.equal(m.ascend.stage, 'transition'); assert.equal(scene.screenToWorld(100, 100), null);
    wait(4);
    assert.equal(m.ascend.stage, 'volume');
    assert.ok(texts(calls).includes('Z') && texts(calls).includes('W'));
    const { ox, oy, k } = scene.dimensionView;
    for (const [x, z] of [[1, 1], [10, 6], [17, 6], [19, 11]]) {
      const [u, v] = projectFloor(x, z); const point = scene.screenToWorld(ox + u * k, oy + v * k);
      assert.ok(Math.abs(point.x - x) < 1e-8 && Math.abs(point.y - z) < 1e-8);
    }
    m.setSlice(.82); m.setMove(1, 0); wait(1.4); m.setMove(0, 0); m.setSlice(.18); wait(.05);
    assert.equal(m.phase, 'complete');
    assert.ok(texts(calls).includes('✓'));
  }
});
