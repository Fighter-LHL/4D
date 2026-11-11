import test from 'node:test';
import assert from 'node:assert/strict';
import { GameModel } from '../src/model.js';
import { SceneRenderer } from '../src/scene.js';
import { GameFeel } from '../src/game-feel.js';
import { createRoomPlan } from '../src/rooms.js';
import { start, travel } from './model-helpers.js';

function createTestScene(reducedMotion = false, callbacks = {}) {
  const calls = [];
  let saveDepth = 0;
  const finite = value => {
    if (typeof value === 'number') assert.ok(Number.isFinite(value), `non-finite canvas value: ${value}`);
    if (Array.isArray(value)) value.forEach(finite);
  };
  const listeners = new Map();
  const context = new Proxy({}, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'save') return () => { saveDepth += 1; calls.push({ method: 'save', args: [] }); };
      if (key === 'restore') return () => { saveDepth -= 1; assert.ok(saveDepth >= 0, 'unbalanced ctx.restore'); calls.push({ method: 'restore', args: [] }); };
      if (key === 'measureText') return text => ({ width: String(text).length * 10 });
      if (key === 'createLinearGradient' || key === 'createRadialGradient') {
        return (...args) => {
          args.forEach(finite);
          if (key === 'createRadialGradient') {
            assert.ok(args[2] > 0 && args[5] > 0, `radial gradient radii must be > 0: ${args}`);
          }
          return { addColorStop() {} };
        };
      }
      return (...args) => {
        args.forEach(finite);
        if (key === 'arc') assert.ok(args[2] > 0, `arc radius must be > 0: ${args[2]}`);
        if (key === 'ellipse') assert.ok(args[2] > 0 && args[3] > 0, `ellipse radii must be > 0: ${args[2]}, ${args[3]}`);
        calls.push({ method: key, args, fill: target.fillStyle, stroke: target.strokeStyle, alpha: target.globalAlpha });
      };
    },
    set(target, key, value) { finite(value); target[key] = value; return true; },
  });
  globalThis.window = {
    devicePixelRatio: 1,
    addEventListener() {},
    removeEventListener() {},
    matchMedia: () => ({ matches: reducedMotion, addEventListener() {}, removeEventListener() {} }),
  };
  const canvas = {
    style: {},
    getContext: () => context,
    getBoundingClientRect: () => ({ width: 1000, height: 650, left: 0, top: 0 }),
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type) { listeners.delete(type); },
  };
  const renderer = new SceneRenderer(canvas, callbacks);
  renderer.visualGuide = true;
  renderer.onboardingStage = 3;
  return { renderer, calls, listeners, getSaveDepth: () => saveDepth };
}

const TAU = Math.PI * 2;
const press = (l, x, y) => l.get('pointerdown')({ button: 0, clientX: x, clientY: y });
const moveTo = (l, x, y) => l.get('pointermove')({ clientX: x, clientY: y });
const release = (l, x, y) => l.get('pointerup')({ button: 0, clientX: x, clientY: y });

function twoPrismTargetModel() {
  for (let seed = 1; seed < 2000; seed++) {
    const plan = createRoomPlan(seed, { mode: 'expedition' });
    const roomIndex = plan.findIndex(p => p.template.id === 'sanctum');
    if (roomIndex === -1) continue;
    const model = new GameModel(seed, { mode: 'expedition' });
    model.chooseRelic('prism');
    model.room = roomIndex;
    model._setupRoom();
    model.phase = 'playing';
    model.powered.add('crown');
    model.charge = 2;
    model.drainEvents();
    return model;
  }
  throw new Error('no sanctum expedition room');
}

test('cast drag snaps to a legal target and fires onCast exactly once', () => {
  const model = twoPrismTargetModel();
  const castCalls = [], selects = [];
  const { renderer, listeners } = createTestScene(false, {
    onCast: (relic, target) => castCalls.push([relic, target]),
    onSelect: id => selects.push(id),
  });
  renderer.setState(model.snapshot());
  const hub = renderer.node('hub'), crown = renderer.node('crown');
  assert.ok(hub && crown, 'sanctum hub & crown present');
  assert.deepEqual(renderer.state.castTargets.prism, ['dew', 'crown']);

  press(listeners, hub.x, hub.y - 14);
  moveTo(listeners, crown.x, crown.y);
  assert.equal(renderer.grab?.kind, 'cast');
  assert.equal(renderer.hyperLens.active, false, 'cast grab never opens the hyper-lens');
  release(listeners, crown.x, crown.y);
  assert.deepEqual(castCalls, [['prism', 'crown']]);
  assert.deepEqual(selects, [], 'a cast drag never falls through to a click');
  assert.equal(renderer.cast, null);
});

test('cast release on empty space, pointercancel and pointerleave call nothing', () => {
  const model = twoPrismTargetModel();
  for (const [name, end] of [
    ['empty release', l => release(l, 500, 620)],
    ['pointercancel', l => l.get('pointercancel')({ pointerId: 1 })],
    ['pointerleave', l => l.get('pointerleave')({})],
  ]) {
    const castCalls = [], selects = [];
    const { renderer, listeners } = createTestScene(false, {
      onCast: (relic, target) => castCalls.push([relic, target]),
      onSelect: id => selects.push(id),
    });
    renderer.setState(model.snapshot());
    const hub = renderer.node('hub');
    press(listeners, hub.x, hub.y - 14);
    moveTo(listeners, hub.x + 60, hub.y - 60);
    assert.equal(renderer.grab?.kind, 'cast', `${name} starts the cast grab`);
    end(listeners);
    assert.deepEqual(castCalls, [], `${name} casts nothing`);
    assert.deepEqual(selects, [], `${name} selects nothing`);
  }
});

test('weave and shadow casts reach their own receptor shapes', () => {
  const weave = start('weave');
  travel(weave, 'dew', true);
  assert.equal(weave.interact(), true);
  const weaveTarget = weave._weaveTarget().edge.to;
  const casts = [], { renderer, listeners } = createTestScene(false, {
    onCast: (relic, target) => casts.push([relic, target]),
  });
  renderer.setState(weave.snapshot());
  const dew = renderer.node('dew'), targetNode = renderer.node(weaveTarget);
  assert.ok(targetNode, 'weave target island exists');
  press(listeners, dew.x, dew.y - 14);
  moveTo(listeners, targetNode.x, targetNode.y);
  release(listeners, targetNode.x, targetNode.y);
  assert.deepEqual(casts, [['weave', weaveTarget]]);

  const shadow = start('shadow');
  travel(shadow, 'dew');
  assert.equal(shadow.interact(), true);
  const shadowCasts = [], shadowScene = createTestScene(false, {
    onCast: (relic, target) => shadowCasts.push([relic, target]),
  });
  shadowScene.renderer.setState(shadow.snapshot());
  const pad = { x: renderer.node('dew').x - 21, y: renderer.node('dew').y - 4 };
  const home = renderer.node('dew');
  shadowScene.listeners.get('pointerdown')({ button: 0, clientX: home.x, clientY: home.y - 14 });
  // Travel past the pad so the shadow reach (>= 24px) is satisfied while inside its 30px magnet.
  shadowScene.listeners.get('pointermove')({ clientX: pad.x - 12, clientY: pad.y + 2 });
  shadowScene.listeners.get('pointerup')({ button: 0, clientX: pad.x - 12, clientY: pad.y + 2 });
  assert.deepEqual(shadowCasts, [['shadow', 'dew']]);
});

test('an avatar press under 8px stays an ordinary click', () => {
  const model = twoPrismTargetModel();
  const castCalls = [], selects = [];
  const { renderer, listeners } = createTestScene(false, {
    onCast: (relic, target) => castCalls.push([relic, target]),
    onSelect: id => selects.push(id),
  });
  renderer.setState(model.snapshot());
  const hub = renderer.node('hub');
  press(listeners, hub.x, hub.y - 14);
  moveTo(listeners, hub.x + 3, hub.y - 13);
  release(listeners, hub.x + 3, hub.y - 13);
  assert.deepEqual(castCalls, []);
  assert.deepEqual(selects, ['hub'], 'a sub-8px avatar press clicks the island normally');
});

test('dial grab scrubs W monotonically, emits start/move/end and never wraps the top', () => {
  const scrubs = [];
  const { renderer, listeners } = createTestScene(false, {
    onScrubW: (w, info) => scrubs.push({ w, ...info }),
  });
  const model = start('shell', 10);
  model.setW(.3);
  model.drainEvents();
  renderer.setState(model.snapshot());
  const hub = renderer.node('hub');
  const angleOf = w => w * TAU - Math.PI / 2;
  const pointAt = a => ({ x: hub.x + Math.cos(a) * 51, y: hub.y - 2 + Math.sin(a) * 27 });
  let a = angleOf(.3);
  const bead0 = pointAt(a);
  press(listeners, bead0.x, bead0.y);
  for (let i = 1; i <= 10; i++) {
    a += .16;
    const p = pointAt(a);
    moveTo(listeners, p.x, p.y);
  }
  assert.equal(renderer.grab?.kind, 'dial');
  const last = pointAt(a);
  release(listeners, last.x, last.y);
  assert.equal(scrubs[0].phase, 'start');
  assert.equal(scrubs.at(-1).phase, 'end');
  const moves = scrubs.slice(1, -1);
  assert.ok(moves.length >= 8 && moves.every(m => m.phase === 'move'));
  for (let i = 1; i < moves.length; i++) {
    assert.ok(moves[i].w >= moves[i - 1].w - 1e-9, `clockwise drag raises W: ${moves[i - 1].w} -> ${moves[i].w}`);
  }
  assert.ok(moves.every(m => m.w >= 0 && m.w <= 1), 'W stays clamped');
  assert.equal(renderer.hyperLens.active, false);

  // Starting near the top of the dial, dragging further clockwise clamps at 1 instead of wrapping to 0.
  const topScrubs = [];
  const top = createTestScene(false, { onScrubW: (w, info) => topScrubs.push({ w, ...info }) });
  model.setW(.95);
  model.drainEvents();
  top.renderer.setState(model.snapshot());
  a = angleOf(.95);
  const bead = pointAt(a);
  top.listeners.get('pointerdown')({ button: 0, clientX: bead.x, clientY: bead.y });
  for (let i = 1; i <= 8; i++) {
    a += .2;
    const p = pointAt(a);
    top.listeners.get('pointermove')({ clientX: p.x, clientY: p.y });
  }
  const p = pointAt(a);
  top.listeners.get('pointerup')({ button: 0, clientX: p.x, clientY: p.y });
  const topMoves = topScrubs.filter(s2 => s2.phase === 'move');
  assert.ok(topMoves.length > 0 && topMoves.every(m => m.w >= .9 && m.w <= 1), 'no wrap through the dial top');
});

test('ferry grab rides the rail from dock A to dock B and click selects the skiff', () => {
  const model = new GameModel(102, { ferryFromRoom: 0 });
  model.chooseRelic('shell');
  model.drainEvents();
  const ferry = model.snapshot().ferry;
  assert.ok(ferry, 'ferry present with ferryFromRoom 0');
  model.setW(ferry.centerA);
  model.drainEvents();
  const scrubs = [], selects = [];
  const { renderer, listeners } = createTestScene(false, {
    onScrubW: (w, info) => scrubs.push({ w, ...info }),
    onSelect: id => selects.push(id),
  });
  renderer.setState(model.snapshot());
  assert.equal(renderer.state.ferry.docked, 'a');

  const track = renderer.state.ferry.track;
  const at = t => {
    const s = 1 - t;
    return {
      x: s * s * track.p0.x + 2 * s * t * track.c.x + t * t * track.p1.x,
      y: s * s * track.p0.y + 2 * s * t * track.c.y + t * t * track.p1.y,
    };
  };
  press(listeners, track.p0.x, track.p0.y);
  for (let i = 1; i <= 8; i++) {
    const p = at(i / 8);
    moveTo(listeners, p.x, p.y);
  }
  assert.equal(renderer.grab?.kind, 'ferry');
  assert.equal(renderer.hyperLens.active, false);
  const end = at(1);
  release(listeners, end.x, end.y);
  assert.equal(scrubs[0].phase, 'start');
  assert.equal(scrubs.at(-1).phase, 'end');
  const moves = scrubs.filter(s => s.phase === 'move').map(s => s.w);
  assert.ok(moves.length >= 6);
  assert.ok(moves[0] >= ferry.centerA - 1e-6 && moves[0] < ferry.centerB - .05, 'drag starts near dock A');
  assert.ok(Math.abs(moves.at(-1) - ferry.centerB) < .06, `drag ends near dock B: ${moves.at(-1)} vs ${ferry.centerB}`);
  for (let i = 1; i < moves.length; i++) assert.ok(moves[i] >= moves[i - 1] - 1e-9, 'ferry W rises monotonically A -> B');

  press(listeners, track.p0.x, track.p0.y);
  release(listeners, track.p0.x, track.p0.y);
  assert.ok(selects.includes('ferry'), 'a sub-8px ferry press still clicks the skiff');
});

test('lens drag on empty canvas still opens the hyper-lens', () => {
  const { renderer, listeners } = createTestScene(false, {});
  const model = start('shell', 10);
  renderer.setState(model.snapshot());
  press(listeners, 500, 620);
  moveTo(listeners, 500, 560);
  assert.equal(renderer.hyperLens.active, true, 'ordinary empty-canvas drag opens the lens');
});

test('ferry, cast drag, fireflies and feel punches render finite and balanced in both motion modes', () => {
  for (const reduced of [false, true]) {
    const { renderer, calls, getSaveDepth } = createTestScene(reduced, {});
    const model = twoPrismTargetModel();
    renderer.setState(model.snapshot());
    const feel = new GameFeel({ reducedMotion: reduced });
    renderer.feel = feel;
    feel.punch('player', .12);
    feel.punch('camera', .012);
    feel.punch('node:dew', .1);
    for (let i = 0; i < 6; i++) feel.step(1 / 60);
    const hub = renderer.node('hub');
    renderer.cast = { x: hub.x + 90, y: hub.y - 90, ax: hub.x, ay: hub.y - 14, snap: null, retract: 0 };
    calls.length = 0;
    renderer.render(1 / 30);
    assert.equal(getSaveDepth(), 0, `balanced save/restore (reduced=${reduced})`);
    assert.ok(calls.length > 50, 'a full frame drew');
    assert.ok(renderer.life?.fireflies?.length === 3, 'three courtyard fireflies alive');
  }
});

test('reduced motion renders identical frames 0.5s apart', () => {
  const { renderer, calls } = createTestScene(true, {});
  const model = twoPrismTargetModel();
  renderer.setState(model.snapshot());
  const hub = renderer.node('hub');
  renderer.cast = { x: hub.x + 90, y: hub.y - 90, ax: hub.x, ay: hub.y - 14, snap: null, retract: 0 };
  const serializable = list => list.map(c => ({ method: c.method, args: structuredClone(c.args), alpha: c.alpha }));
  for (let i = 0; i < 8; i++) renderer.render(.4);
  calls.length = 0;
  renderer.render(.5);
  const first = serializable(calls);
  calls.length = 0;
  renderer.render(.5);
  assert.deepEqual(serializable(calls), first, 'all new motion is static under prefers-reduced-motion');
});

test('no canvas fillText ever names the ferry across a full W sweep', () => {
  const { renderer, calls } = createTestScene(false, {});
  const model = new GameModel(102, { ferryFromRoom: 0 });
  model.chooseRelic('shell');
  model.drainEvents();
  for (const w of [0, .18, .34, .5, .66, .82, 1]) {
    model.setW(w);
    model.drainEvents();
    renderer.setState(model.snapshot());
    renderer.render(1 / 60);
  }
  const texts = calls.filter(c => c.method === 'fillText').map(c => c.args[0]);
  assert.ok(texts.length > 0, 'labels were drawn during the sweep');
  assert.ok(texts.every(t => !String(t).includes('摆渡星舟')), 'the skiff carries no name tag');
});
