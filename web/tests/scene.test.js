import test from 'node:test';
import assert from 'node:assert/strict';
import { SceneRenderer } from '../src/scene.js';
import { GameModel } from '../src/model.js';
import { courtyardFriends } from '../src/courtyard-friends.js';
import { FriendGuide } from '../src/friend-guide.js';
import { FLATLAND_LEVELS } from '../src/flatland/levels.js';
import { start, advance, travel, activateAll, openVault, seedFor, finishRoom } from './model-helpers.js';

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

test('collected companions and the real next-layer guide render at desktop and mobile scales', () => {
  for (const reduced of [true, false]) {
    const { renderer, calls } = scene(reduced);
    renderer.friends = courtyardFriends({ found: ['sprout', 'lantern', 'ribbon'] });
    for (const scale of [.32, 1]) for (let seed = 1; seed <= 12; seed++) {
      const m = new GameModel(seed); m.chooseRelic('shell');
      renderer.scale = scale; renderer.setState(m.snapshot()); renderer.render(.016);
      assert.ok(calls.some(call => call.method === 'bezierCurveTo'), 'recognisable ribbon follows the avatar');
    }
    assert.ok(calls.some(call => call.method === 'fillText' && /这边|换到这一层/.test(call.args[0])));
    renderer.destroy();
  }
});

test('courtyard friends follow without revealing the route; clicking their current position requests one hint', () => {
  const { renderer, calls } = scene();
  renderer.friends = courtyardFriends({ found: ['sprout', 'lantern', 'ribbon'] });
  const snapshot = state(), guide = new FriendGuide();
  renderer.setState(guide.present(snapshot)); renderer.render(.016);
  assert.equal(calls.some(call => call.method === 'fillText' && /这边|换到这一层/.test(call.args[0])), false);
  assert.equal(renderer.friendTargets.length, 3);
  const click = p => ({ clientX: p.x * renderer.scale + renderer.offsetX, clientY: p.y * renderer.scale + renderer.offsetY, button: 0 });
  for (const p of renderer.friendTargets) assert.equal(renderer.hitFriend(click(p)), true);
  let selected = false, asked = false;
  renderer.onSelect = () => { selected = true; };
  renderer.onFriend = () => { asked = true; guide.request(snapshot); };
  renderer.pointerDown(click(renderer.friendTargets[0]));
  assert.equal(asked, true); assert.equal(selected, false);
  renderer.setState(guide.present(snapshot)); renderer.render(.016);
  assert.ok(calls.some(call => call.method === 'fillText' && /这边|换到这一层/.test(call.args[0])));
  renderer.setState({ ...snapshot, wave: {} }); assert.equal(renderer.hitFriend(click(renderer.friendTargets[0])), false);
  renderer.destroy();
});

test('the six-garden flower crowns remain visible on all courtyard companions', () => {
  const { renderer, calls } = scene();
  const gardens = Object.fromEntries(FLATLAND_LEVELS.filter(l => l.garden).map(l => [l.id, true]));
  const friends = { found: ['sprout', 'lantern', 'ribbon'], companion: 'sprout' };
  renderer.friends = courtyardFriends(friends, gardens); renderer.setState(state()); renderer.render(.016);
  assert.equal(calls.filter(c => c.method === 'fill' && c.fill === '#fff4d9').length, 45);
  calls.length = 0; renderer.friends = courtyardFriends(friends, { ...gardens, ascend: false }); renderer.render(.016);
  assert.equal(calls.filter(c => c.method === 'fill' && c.fill === '#fff4d9').length, 0);
  renderer.destroy();
});

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

function plantedGarden() {
  const model = start('weave', seedFor('return'));
  travel(model, 'dew', true);
  assert.equal(model.interact(), true);
  advance(model, 1.1);
  assert.equal(model.useAbility('weave'), true);
  return model;
}

test('earned garden and woven bridges draw solid surfaces only on their actual open W slice', () => {
  const { renderer, calls } = scene();
  const model = plantedGarden();
  const planted = model.snapshot().woven[0];
  assert.equal(model.snapshot().resonance.stage, 3);
  assert.ok(planted);
  model.setW(model.snapshot().layers[planted.edge.layer].center);
  renderer.setState(model.snapshot()); renderer.drawConnections();
  assert.ok(calls.some(call => call.method === 'fill' && call.fill === '#e3f0cc'), 'planted bridge has a physical leaf surface');
  model.setW(model.snapshot().layers[(planted.edge.layer + 1) % 3].center);
  calls.length = 0; renderer.setState(model.snapshot()); renderer.drawConnections();
  assert.equal(calls.some(call => call.method === 'fill' && call.fill === '#e3f0cc'), false, 'another W cannot display a walkable planted surface');
  model.setW(model.snapshot().layers[planted.edge.layer].center);
  activateAll(model);
  model.setW(model.snapshot().layers[model.snapshot().resonance.edge.layer].center);
  calls.length = 0; renderer.setState(model.snapshot()); renderer.drawConnections();
  assert.ok(calls.some(call => call.method === 'fill' && call.fill === '#f9eab6'), 'earned bridge is solid after its gate is fulfilled');
  openVault(model);
  calls.length = 0; renderer.setState(model.snapshot()); renderer.drawConnections();
  assert.equal(calls.some(call => call.method === 'fill' && call.fill === '#f9eab6'), false, 'vault warning closes every grown escape surface');
  renderer.destroy();
});

test('growth preview never creates a bridge surface; permanent garden survives cleared celebration and pause', () => {
  const { renderer, calls } = scene();
  const model = start('weave', seedFor('return'));
  renderer.setState(model.snapshot()); renderer.drawDormantGrowth();
  assert.equal(renderer.connections().some(edge => edge.kind === 'resonance'), false);
  assert.ok(calls.some(call => call.method === 'setLineDash' && call.args[0].length === 2));
  assert.equal(calls.some(call => call.method === 'fill' && ['#e3f0cc', '#f9eab6'].includes(call.fill)), false);
  travel(model, 'dew', true); advance(model, 1.1);
  renderer.setState(model.snapshot()); renderer.pushEvents(model.drainEvents());
  assert.ok(renderer.effects.some(effect => effect.kind === 'garden_bloom'));
  const ages = renderer.effects.map(effect => effect.age);
  renderer.render(0); renderer.render(0);
  assert.deepEqual(renderer.effects.map(effect => effect.age), ages, 'paused render cannot advance earned growth');
  for (const cancel of ['warning', 'fail']) {
    renderer.pushEvents([{ type: cancel, node: 'vault' }]);
    assert.ok(renderer.effects.every(effect => !effect.celebration));
    calls.length = 0; renderer.drawGardenGrowth(renderer.node('hub'), 110, 57);
    assert.ok(calls.some(call => call.method === 'fill' && call.fill === '#fff6cf'), 'permanent flowers remain after transient cues stop');
  }
  renderer.setState(state(2)); calls.length = 0; renderer.drawGardenGrowth(renderer.node('hub'), 110, 57);
  assert.equal(calls.length, 0, 'new room has no previous growth');
  assert.equal(renderer.effects.length, 0);
  renderer.destroy();
});

test('coil waiting mark is attached to its real W mechanism and discharge joins real endpoints', () => {
  const model = start('coil', seedFor('return'));
  travel(model, 'dew'); model.interact(); advance(model, .6);
  const armed = model.snapshot().coilArmed;
  assert.ok(armed.includes('bell'));
  const { renderer, calls } = scene();
  renderer.setState(model.snapshot()); renderer.drawWStack();
  assert.ok(calls.some(call => call.method === 'stroke' && call.stroke === '#a568b7'));
  renderer.pushEvents([{ type: 'coil', from: 'hub', to: 'bell', node: 'bell', layer: renderer.node('bell').layer }]);
  const arc = renderer.effects.find(effect => effect.kind === 'coil_arc');
  assert.deepEqual(arc.to, { x: renderer.node('bell').x, y: renderer.node('bell').y });
  assert.equal(arc.layer, renderer.node('bell').layer);
  renderer.render(.1);
  renderer.destroy();
});

test('new growth effects remain bounded, reduced-motion safe and finite across dual hazards', () => {
  for (const reduced of [false, true]) {
    const { renderer } = scene(reduced);
    const model = plantedGarden(); const snapshot = model.snapshot();
    snapshot.coilArmed = ['bell']; snapshot.coilRemaining = 1;
    renderer.setState(snapshot);
    const events = model.drainEvents().filter(event => ['resonance', 'weave', 'reward'].includes(event.type));
    for (let i = 0; i < 30; i++) renderer.pushEvents(events);
    assert.ok(renderer.effects.length <= 36); assert.ok(renderer.particles.length <= 220);
    renderer.render(.1);
    for (const dangerLayers of [[0, 1], [0, 2], [1, 2]]) {
      snapshot.wave = { node: 'vault', layer: dangerLayers[0], dangerLayers, safeLayers: [0, 1, 2].filter(layer => !dangerLayers.includes(layer)), remaining: 1, duration: 2.6, step: 1, steps: 1 };
      renderer.pushEvents([{ type: 'warning', node: 'vault' }]); renderer.render(.1);
      assert.ok(renderer.effects.every(effect => !effect.celebration));
    }
    renderer.destroy();
  }
});

test('a committed crossing cannot turn a different parallel grown bridge into a solid surface', () => {
  const { renderer, calls } = scene();
  const snapshot = state(); const edge = snapshot.edges.find(item => item.open);
  snapshot.edges = [edge, { ...edge, id: 'closed-parallel-weave', open: false, kind: 'weave' }];
  snapshot.travel = { edgeId: edge.id, from: edge.from, to: edge.to, layer: edge.layer, progress: .5, stability: 1 };
  snapshot.w = snapshot.layers[edge.layer].center;
  for (const item of snapshot.edges) item.visible = true;
  renderer.setState(snapshot); renderer.drawConnections();
  assert.equal(calls.some(call => call.method === 'fill' && call.fill === '#e3f0cc'), false);
  renderer.destroy();
});

function hiddenGarden() {
  let seed = 0;
  while (new GameModel(seed).snapshot().roomPlan[1].id !== 'cascade') seed++;
  const model = start('shadow', seed);
  finishRoom(model); assert.equal(model.chooseRelic('weave'), true);
  travel(model, 'dew', true); assert.equal(model.interact(), true);
  assert.equal(model.useAbility('shadow'), true); travel(model, 'hub');
  assert.equal(model.useAbility('weave'), true);
  assert.equal(model.snapshot().hiddenRoutes.find(route => route.id === 'shadow-weave').eligible, true);
  return model;
}

function openHiddenGarden(model) {
  const route = model.snapshot().hiddenRoutes.find(item => item.id === 'shadow-weave');
  for (const layer of [(route.sequence[0] + 1) % 3, ...route.sequence]) model.setW(model.snapshot().layers[layer].center);
  assert.equal(model.snapshot().hiddenRoutes.find(item => item.id === route.id).unlocked, true);
  return route;
}

function completeRift(model) {
  travel(model, 'rift'); assert.equal(model.interact(), true);
  while (model.snapshot().wave) {
    const wave = model.snapshot().wave, safe = wave.safeLayers[0];
    if (model.snapshot().layer === safe) model.setW(model.snapshot().layers[(safe + 1) % 3].center);
    model.setW(model.snapshot().layers[safe].center);
    advance(model, wave.remaining + .001);
  }
  assert.equal(model.snapshot().rift.status, 'cleared');
  advance(model, 1.2);
  assert.equal(model.snapshot().rift.ascension, 3);
}

test('sealed build routes show only hollow previews and cannot expose a shrine hit target', () => {
  const { renderer, calls } = scene();
  const model = start('shadow');
  renderer.setState(model.snapshot());
  const rift = renderer.node('rift');
  assert.equal(rift.locked, true);
  renderer.drawHiddenRoutes(); renderer.drawIsland(rift);
  assert.equal(calls.some(call => call.method === 'fill'), false, 'a locked route and shrine have no filled platform');
  assert.ok(calls.some(call => call.method === 'setLineDash' && call.args[0].length > 0));
  assert.equal(renderer.hitTest({ clientX: rift.x, clientY: rift.y }), null);
  const earned = hiddenGarden(); openHiddenGarden(earned);
  renderer.setState(earned.snapshot());
  const open = renderer.node('rift');
  assert.equal(renderer.hitTest({ clientX: open.x, clientY: open.y })?.id, 'rift');
  travel(earned, 'rift'); earned.interact(); renderer.setState(earned.snapshot());
  assert.equal(renderer.hitTest({ clientX: open.x, clientY: open.y }), null, 'all routes seal during a trial');
  renderer.destroy();
});

test('real W seal events light their entry island and secret surfaces obey layer and trial locks', () => {
  const { renderer, calls } = scene();
  const model = hiddenGarden();
  model.drainEvents(); const route = openHiddenGarden(model);
  renderer.setState(model.snapshot()); renderer.pushEvents(model.drainEvents());
  const seals = renderer.effects.filter(effect => effect.kind === 'seal_turn');
  assert.deepEqual(seals.map(effect => effect.layer), route.sequence);
  assert.ok(seals.every(effect => effect.x === renderer.node('hub').x && effect.y === renderer.node('hub').y));
  renderer.drawConnections();
  assert.ok(calls.some(call => call.method === 'fill' && call.fill === '#e9dafa'));
  model.setW(model.snapshot().layers[(route.edge.layer + 1) % 3].center);
  calls.length = 0; renderer.setState(model.snapshot()); renderer.drawConnections();
  assert.equal(calls.some(call => call.method === 'fill' && call.fill === '#e9dafa'), false);
  travel(model, 'rift'); model.interact();
  calls.length = 0; renderer.setState(model.snapshot()); renderer.drawConnections(); renderer.drawWave();
  assert.equal(calls.some(call => call.method === 'fill' && call.fill === '#e9dafa'), false);
  assert.ok(calls.some(call => call.method === 'stroke' && call.stroke === '#d36d59'));
  renderer.destroy();
});

test('rift warning stays unsafe until a fresh supported entry and turns unsafe again after leaving', () => {
  const model = hiddenGarden(); openHiddenGarden(model); travel(model, 'rift');
  const safeLayer = model.snapshot().rift.sequence[0];
  const safeW = model.snapshot().layers[safeLayer].center;
  const otherW = model.snapshot().layers[(safeLayer + 1) % 3].center;
  model.setW(safeW); assert.equal(model.interact(), true);
  assert.equal(model.snapshot().wave.entered, false);
  const { renderer, calls } = scene();
  const color = () => {
    calls.length = 0; renderer.setState(model.snapshot()); renderer.drawWave();
    return calls.find(call => call.method === 'fillText').fill;
  };
  assert.equal(color(), '#9f4938', 'already occupying a safe slice does not satisfy the trial');
  model.setW(.34); model.setW(safeW);
  assert.equal(color(), '#9f4938', 'a gap excursion does not count as a new entity-layer entry');
  model.setW(otherW); model.setW(safeW);
  assert.equal(model.snapshot().wave.entered, true);
  assert.equal(color(), '#247b65', 'a real supported layer entry earns the safe ring');
  model.setW(otherW);
  assert.equal(color(), '#9f4938', 'the earned entry flag cannot make a dangerous layer safe');
  model.setW(.34);
  assert.equal(color(), '#9f4938', 'a supported entry cannot make an unsupported gap safe');
  renderer.destroy();
});

test('high-risk success permanently unfolds the shrine and gate while the physical exit still needs every mechanism', () => {
  const model = hiddenGarden(); openHiddenGarden(model); model.drainEvents(); completeRift(model);
  const { renderer, calls } = scene(); renderer.setState(model.snapshot()); renderer.pushEvents(model.drainEvents());
  const ascensions = renderer.effects.filter(effect => effect.kind === 'ascension_signal');
  assert.deepEqual(ascensions.map(effect => effect.stage), [1, 2, 3]);
  assert.deepEqual(ascensions.map(effect => effect.to), ['hub', 'relay', 'exit'].map(id => ({ x: renderer.node(id).x, y: renderer.node(id).y })));
  assert.deepEqual(ascensions.map(effect => effect.layer), [...model.snapshot().rift.sequence.slice(0, 2), model.snapshot().rift.exitEdge.layer]);
  assert.equal(renderer.shake, 0); assert.equal(renderer.flash, 0);
  const edge = model.snapshot().edges.find(item => item.kind === 'ascension');
  assert.equal(edge.open, false, 'two mechanisms still missing after this optional route');
  model.setW(model.snapshot().layers[edge.layer].center); renderer.setState(model.snapshot()); renderer.drawConnections();
  assert.equal(calls.some(call => call.method === 'fill' && call.fill === '#fff0b8'), false);
  renderer.pushEvents([{ type: 'fail', node: 'rift' }]);
  assert.ok(renderer.effects.every(effect => !effect.celebration));
  calls.length = 0; renderer.drawRift(renderer.node('rift'));
  renderer.drawAscendedArchitecture(renderer.node('exit'), 86); renderer.drawAscensionCanopy();
  assert.ok(calls.some(call => call.method === 'fill' && call.fill === '#fff1c6'), 'permanent shrine wings remain after cues clear');
  assert.ok(calls.some(call => call.method === 'fill' && call.fill === '#ead8a4'), 'golden pillars stay raised');
  assert.ok(calls.some(call => call.method === 'quadraticCurveTo'), 'earned canopy persists');
  activateAll(model); model.setW(model.snapshot().layers[edge.layer].center);
  calls.length = 0; renderer.setState(model.snapshot()); renderer.drawConnections();
  assert.ok(calls.some(call => call.method === 'fill' && call.fill === '#fff0b8'), 'actual exit W now holds a solid ascension bridge');
  model.setW(model.snapshot().layers[(edge.layer + 1) % 3].center);
  calls.length = 0; renderer.setState(model.snapshot()); renderer.drawConnections();
  assert.equal(calls.some(call => call.method === 'fill' && call.fill === '#fff0b8'), false);
  renderer.setState(state(3)); calls.length = 0;
  renderer.drawAscensionCanopy(); renderer.drawAscendedArchitecture(renderer.node('exit'), 86);
  assert.equal(calls.length, 0, 'a fresh room never inherits the ascended garden');
  renderer.destroy();
});

test('hidden-route and three-wave success cues are finite, bounded, paused and readable with reduced motion', () => {
  const model = hiddenGarden(); model.drainEvents(); openHiddenGarden(model); completeRift(model);
  const events = model.drainEvents().filter(event => ['secret_seal', 'secret_open', 'rift_clear', 'ascension'].includes(event.type));
  for (const reduced of [false, true]) {
    const { renderer } = scene(reduced); renderer.setState(model.snapshot()); renderer.pushEvents(events);
    const before = renderer.effects.map(effect => effect.age);
    renderer.render(0); renderer.render(0); assert.deepEqual(renderer.effects.map(effect => effect.age), before);
    assert.equal(renderer.flash, 0); assert.equal(renderer.shake, 0);
    if (reduced) assert.ok(renderer.particles.length <= 30);
    for (let i = 0; i < 40; i++) renderer.pushEvents(events);
    assert.ok(renderer.effects.length <= 36); assert.ok(renderer.particles.length <= 220);
    for (let frame = 0; frame < 28; frame++) renderer.render(.1);
    assert.equal(renderer.effects.length, 0); assert.equal(renderer.particles.length, 0);
    renderer.destroy();
  }
});
