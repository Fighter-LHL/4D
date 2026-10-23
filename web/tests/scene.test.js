import test from 'node:test';
import assert from 'node:assert/strict';
import { SceneRenderer } from '../src/scene.js';
import { GameModel } from '../src/model.js';

function scene(reducedMotion = false) {
  const calls = [];
  const finite = value => {
    if (typeof value === 'number') assert.ok(Number.isFinite(value), `non-finite canvas value: ${value}`);
    if (Array.isArray(value)) value.forEach(finite);
  };
  const context = new Proxy({}, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'measureText') return text => ({ width: String(text).length * 12 });
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return (...args) => { args.forEach(finite); return { addColorStop() {} }; };
      return (...args) => { args.forEach(finite); calls.push({ method: key, args, fill: target.fillStyle, stroke: target.strokeStyle, alpha: target.globalAlpha }); };
    },
    set(target, key, value) { finite(value); target[key] = value; return true; },
  });
  globalThis.window = {
    devicePixelRatio: 1, addEventListener() {}, removeEventListener() {},
    matchMedia: () => ({ matches: reducedMotion, addEventListener() {}, removeEventListener() {} }),
  };
  const canvas = { style: {}, getContext: () => context, getBoundingClientRect: () => ({ width: 1000, height: 650, left: 0, top: 0 }), addEventListener() {}, removeEventListener() {} };
  return { renderer: new SceneRenderer(canvas), calls };
}
function state(seed = 1) { const model = new GameModel(seed); model.chooseRelic('shadow'); return model.snapshot(); }

// Rendering the actual generated snapshots catches assumptions about W roles,
// same-position nodes, mirrored geometry, and optional wave metadata.
test('generated room snapshots render finite geometry across every template and continuous W', () => {
  const { renderer } = scene();
  const templates = new Set();
  for (let seed = 1; seed <= 40; seed++) {
    const model = new GameModel(seed); model.chooseRelic('shadow');
    for (const w of [0, .18, .34, .5, .66, .82, 1]) {
      model.setW(w);
      const snapshot = model.snapshot(); templates.add(snapshot.roomId);
      renderer.setState(snapshot); renderer.render(.016);
    }
  }
  assert.equal(templates.size, 4);
  renderer.destroy();
});

test('AND mechanism displays independent received input slots', () => {
  const { renderer, calls } = scene();
  let snapshot;
  for (let seed = 1; seed < 100; seed++) { const candidate = state(seed); if (candidate.roomId === 'confluence') { snapshot = candidate; break; } }
  assert.ok(snapshot);
  renderer.setState(snapshot);
  const target = snapshot.nodes.find(node => node.required.length === 2);
  target.received = [target.required[0]];
  renderer.drawInputSlots(target);
  const receivedColor = renderer.palette(renderer.node(target.required[0]).layer).glow;
  const waitingColor = renderer.palette(renderer.node(target.required[1]).layer).glow;
  assert.equal(calls.filter(call => call.method === 'fill' && call.fill === receivedColor).length, 1);
  assert.equal(calls.filter(call => call.method === 'fill' && call.fill === waitingColor).length, 0);
  renderer.destroy();
});

test('earned resonance follows open adjacent bridges and waits for anticipation', () => {
  const { renderer } = scene();
  const snapshot = state();
  renderer.setState(snapshot);
  renderer.pushEvents([{ type: 'reward', node: 'hub', value: 5, risky: true, tier: 3 }]);
  const echoes = renderer.effects.filter(effect => effect.kind === 'bridge_echo');
  assert.ok(echoes.length > 0);
  for (const effect of echoes) {
    const edge = snapshot.edges.find(edge => edge.id === effect.edgeId);
    assert.ok(edge.open && [edge.from, edge.to].includes('hub'));
    assert.equal(effect.layer, edge.layer);
    assert.ok(effect.delay >= .18);
  }
  assert.equal(renderer.effects.find(effect => effect.kind === 'gather').delay, undefined);
  assert.ok(renderer.particles.every(particle => particle.age < 0));
  assert.equal(renderer.shake, 0); assert.equal(renderer.flash, 0);
  for (let frame = 0; frame < 20; frame++) renderer.render(.1);
  assert.equal(renderer.effects.length, 0);
  renderer.destroy();
});

test('failure, room replacement and warning cancel delayed success presentation', () => {
  for (const cancel of ['fail', 'restart', 'room', 'warning']) {
    const { renderer } = scene(); renderer.setState(state());
    renderer.pushEvents([{ type: 'reward', node: 'hub', value: 6, risky: true, tier: 3 }]);
    renderer.pushEvents([{ type: cancel, node: 'hub' }]);
    assert.ok(renderer.effects.every(effect => !effect.celebration), cancel);
    assert.ok(renderer.particles.every(particle => !particle.celebration), cancel);
    renderer.destroy();
  }
  const { renderer } = scene(); renderer.setState(state(1));
  renderer.pushEvents([{ type: 'reward', node: 'hub', value: 6, risky: true, tier: 3 }]);
  renderer.setState(state(2));
  assert.equal(renderer.effects.length, 0); assert.equal(renderer.particles.length, 0);
  renderer.destroy();
});

test('dual-layer warning marks both dangerous W planes; a gap is not safe', () => {
  const { renderer, calls } = scene();
  const snapshot = state();
  snapshot.wave = { node: 'vault', layer: 0, dangerLayers: [0, 1], safeLayers: [2], remaining: 1.2, duration: 2.6, step: 1, steps: 1 };
  snapshot.w = .66; snapshot.layer = 2;
  renderer.setState(snapshot); renderer.drawWave();
  assert.ok(calls.some(call => call.method === 'fillText' && call.fill === '#9f4938'), 'nearest safe layer cannot make an unsupported gap safe');
  calls.length = 0; snapshot.w = .82; renderer.drawWave();
  assert.ok(calls.some(call => call.method === 'fillText' && call.fill === '#247b65'));
  calls.length = 0; renderer.drawWStack();
  assert.equal(calls.filter(call => call.method === 'stroke' && call.stroke === '#d36d59' && call.args.length === 0).length >= 6, true, 'two planes and their two cross strokes are marked');
  renderer.destroy();
});

test('presentation stays bounded and reduced motion sharply reduces bursts', () => {
  const full = scene().renderer; full.setState(state());
  const reduced = scene(true).renderer; reduced.setState(state());
  const event = { type: 'reward', node: 'hub', value: 6, risky: true, tier: 3 };
  full.pushEvents([event]); reduced.pushEvents([event]);
  assert.ok(reduced.particles.length <= 6 && full.particles.length >= 40);
  for (let i = 0; i < 80; i++) full.pushEvents([event]);
  assert.ok(full.effects.length <= 36); assert.ok(full.particles.length <= 220);
  full.render(.1); reduced.render(.1);
  full.destroy(); reduced.destroy();
});
