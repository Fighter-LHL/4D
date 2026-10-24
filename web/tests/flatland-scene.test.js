import test from 'node:test';
import assert from 'node:assert/strict';
import { FlatlandRenderer } from '../src/flatland/scene.js';
import { FlatlandModel } from '../src/flatland/model.js';
import { FLATLAND_LEVELS } from '../src/flatland/levels.js';
import { projectFloor } from '../src/flatland/ascend.js';

function renderer(width = 1000, height = 560) {
  const calls = [];
  const finite = value => {
    if (typeof value === 'number') assert.ok(Number.isFinite(value), `non-finite canvas value: ${value}`);
    if (Array.isArray(value)) value.forEach(finite);
  };
  const context = new Proxy({}, {
    get(target, key) {
      if (key in target) return target[key];
      return (...args) => { args.forEach(finite); calls.push({ method: key, args, stroke: target.strokeStyle }); };
    },
    set(target, key, value) { finite(value); target[key] = value; return true; },
  });
  globalThis.window = { devicePixelRatio: 2, matchMedia: () => ({ matches: false, addEventListener() {} }) };
  const canvas = { width: 0, height: 0, getContext: () => context, getBoundingClientRect: () => ({ width, height, left: 0, top: 0 }) };
  return { scene: new FlatlandRenderer(canvas), calls, canvas };
}

test('ascend renders both dimensions and W collision feedback, with a reversible pointer projection', () => {
  for (const [width, height] of [[1000, 560], [380, 600]]) for (const reduced of [false, true]) {
    const { scene, calls } = renderer(width, height); scene.reducedMotion = reduced;
    const m = new FlatlandModel(FLATLAND_LEVELS.findIndex(l => l.id === 'ascend')); m.start();
    const draw = () => { scene.setState(m.snapshot()); scene.pushEvents(m.drainEvents()); scene.render(.05); };
    const wait = seconds => { for (let t = 0; t < seconds - 1e-9; t += .05) { m.update(.05); draw(); } };
    m.setSlice(4); m.setMove(1, 0); wait(1.4); m.setMove(0, 0); m.setSlice(1); wait(.05);
    assert.equal(m.ascend.stage, 'transition'); assert.equal(scene.screenToWorld(100, 100), null);
    wait(4);
    assert.equal(m.ascend.stage, 'volume');
    assert.ok(calls.some(c => c.method === 'fillText' && c.args[0] === 'Z'));
    assert.ok(calls.some(c => c.method === 'fillText' && c.args[0] === 'W'));
    const { ox, oy, k } = scene.dimensionView;
    for (const [x, z] of [[1, 1], [10, 6], [17, 6], [19, 11]]) {
      const [u, v] = projectFloor(x, z); const point = scene.screenToWorld(ox + u * k, oy + v * k);
      assert.ok(Math.abs(point.x - x) < 1e-8 && Math.abs(point.y - z) < 1e-8);
    }
    assert.equal(scene.screenToWorld(-100, -100), null);
    m.setSlice(.82); m.setMove(1, 0); wait(.56); m.setMove(0, 0); m.setSlice(.18); draw();
    assert.ok(calls.some(c => c.method === 'stroke' && c.stroke === '#bd6146'));
    assert.ok(calls.some(c => c.method === 'setLineDash' && c.args[0].length));
    for (const w of [1, .82, .6]) { m.setSlice(w); draw(); }
    m.setMove(1, 0); wait(.84); m.setMove(0, 0); m.setSlice(.18); wait(.05);
    assert.equal(m.phase, 'complete');
    assert.ok(calls.some(c => c.method === 'fillText' && c.args[0] === '教学出口 · 已抵达'));
  }
});

test('every level renders finite geometry across the slice range, wide and narrow', () => {
  for (const [width, height] of [[1000, 560], [380, 600]]) {
    const { scene, canvas } = renderer(width, height);
    FLATLAND_LEVELS.forEach((_, index) => {
      const model = new FlatlandModel(index); model.start();
      for (let s = 0; s <= 6; s += .25) {
        model.setSlice(s); model.update(.05);
        scene.setState(model.snapshot()); scene.pushEvents(model.drainEvents()); scene.render(1 / 60);
      }
    });
    assert.equal(canvas.width, width * 2);
  }
});

test('blocked events flash the blocking solid in the danger color', () => {
  const { scene, calls } = renderer();
  const model = new FlatlandModel(FLATLAND_LEVELS.findIndex(level => level.id === 'escape')); model.start();
  model.setMove(1, 0); model.update(.1); model.update(.1); model.update(.1); model.update(.1); model.update(.1);
  model.setSlice(4); model.setMove(1, 0); model.update(.1);
  model.setMove(0, 0);
  assert.equal(model.setSlice(1), false, 'standing over the east wall');
  scene.setState(model.snapshot()); scene.pushEvents(model.drainEvents()); scene.render(.05);
  assert.ok(calls.some(call => call.method === 'stroke' && call.stroke === '#bd6146'));
});

test('screenToWorld maps canvas pixels into the flat world', () => {
  const { scene } = renderer();
  scene.setState(new FlatlandModel(1).snapshot()); scene.render(0);
  const { main } = scene.view;
  const point = scene.screenToWorld(main.ox + 5 * main.scale, main.oy + 3 * main.scale);
  assert.ok(Math.abs(point.x - 5) < 1e-9 && Math.abs(point.y - 3) < 1e-9);
  assert.equal(scene.screenToWorld(1, 1), null);
});

test('vault renders lower ghosts, carried keys and capture recovery at desktop and narrow widths', () => {
  for (const [width, height] of [[1000, 560], [380, 600]]) {
    const { scene, calls } = renderer(width, height);
    const model = new FlatlandModel(FLATLAND_LEVELS.findIndex(level => level.id === 'vault')); model.start();
    const draw = () => { scene.setState(model.snapshot()); scene.pushEvents(model.drainEvents()); scene.render(.05); };
    const wait = seconds => { for (let t = 0; t < seconds; t += .05) { model.update(.05); draw(); } };
    draw();
    assert.ok(calls.some(call => call.method === 'fillText' && call.args[0].includes('只显示你的高度')));
    model.setSlice(5); model.setPeek(true); draw();
    assert.ok(calls.some(call => call.method === 'setLineDash' && call.args[0].length > 0));
    assert.ok(calls.some(call => call.method === 'fillText' && call.args[0].includes('钥匙')));
    model.setMove(1, 0); wait(1.4); model.setMove(0, 0); model.setSlice(1.2); wait(.05);
    assert.equal(model.carrying, 'vault-key');
    model.setSlice(5); model.setMove(-1, 0); wait(.8); model.setMove(0, 0); model.setSlice(1.2);
    for (let i = 0; i < 140 && !model.counters.guardAlerts; i++) { model.update(.05); draw(); }
    assert.equal(model.counters.guardAlerts, 1);
    assert.equal(model.carrying, null);
    draw();
    assert.ok(calls.some(call => call.method === 'fillText' && call.args[0] === '啊！'));
  }
});

test('all guessing rounds render their observed and revealed slices on wide and narrow canvases', () => {
  for (const [width, height] of [[1000, 560], [380, 600]]) {
    const { scene, calls } = renderer(width, height);
    const model = new FlatlandModel(FLATLAND_LEVELS.findIndex(level => level.id === 'guess')); model.start();
    const draw = () => { scene.setState(model.snapshot()); scene.pushEvents(model.drainEvents()); scene.render(.05); };
    const observe = heights => { for (const s of heights) { model.setSlice(s); for (let i = 0; i < 6; i++) { model.update(.05); draw(); } } };
    draw();
    assert.ok(calls.some(call => call.method === 'fillText' && call.args[0].includes('暂时遮住')));
    observe([1.7, 3, 4.3]);
    for (const answer of [1, 0, 1]) {
      model.answerRound(answer); draw();
      observe(model.snapshot().round.targets);
      for (const s of [0, 1, 2, 3, 4, 5, 6]) { model.setSlice(s); draw(); }
      model.nextRound(); draw();
    }
    assert.equal(model.phase, 'complete');
  }
});

test('mirror renders the edge-on midpoint and both returned handednesses, including reduced motion', () => {
  for (const [width, height] of [[1000, 560], [380, 600]]) for (const reduced of [false, true]) {
    const { scene, calls } = renderer(width, height); scene.reducedMotion = reduced;
    const m = new FlatlandModel(FLATLAND_LEVELS.findIndex(level => level.id === 'mirror')); m.start();
    const draw = () => { scene.setState(m.snapshot()); scene.pushEvents(m.drainEvents()); scene.render(.05); };
    const wait = seconds => { for (let t = 0; t < seconds - 1e-9; t += .05) { m.update(.05); draw(); } };
    m.setMove(1, 0); wait(1.4); m.setMove(0, 0); m.requestFlip(); draw(); m.answerFlipPrediction(1);
    wait(.9);
    assert.ok(scene.mirrorVertices().every(([, y]) => Math.abs(y) < 1e-8));
    assert.ok(calls.some(call => call.method === 'fillText' && call.args[0].includes('翻转投影示意')));
    assert.ok(calls.some(call => call.method === 'fillText' && call.args[0].includes('Y–Z')));
    wait(.9); m.requestFlip(); wait(1.8);
    assert.equal(m.keyChirality, 1);
    m.requestFlip(); wait(1.8); m.setMove(1, 0); wait(1.4); draw();
    assert.equal(m.phase, 'complete');
    assert.ok(calls.some(call => call.method === 'fillText' && call.args[0] === '镜之锁 · 已开'));
  }
});
