import test from 'node:test';
import assert from 'node:assert/strict';
import { GameModel, LAYERS } from '../src/model.js';
import { ROOM_TEMPLATES, createRoomPlan, buildRoom, layoutClearance } from '../src/rooms.js';
import { start, advance, travel, reach, activateAll, finishRoom, escapeWave, fall } from './model-helpers.js';

const center = (model, id) => model.snapshot().nodes.find(node => node.id === id).center;
const route = (model, id) => model.snapshot().hiddenRoutes.find(item => item.id === id);
const layers = (model, values) => { for (const value of values) model.setW(LAYERS[value].center); };
function build(template, relics) {
  let seed = 0;
  while (createRoomPlan(seed)[relics.length - 1].template.id !== template) seed++;
  const model = start(relics[0], seed);
  for (const relic of relics.slice(1)) { finishRoom(model); assert.equal(model.chooseRelic(relic), true); }
  model.drainEvents(); return model;
}
function prepare(id, template = 'cascade') {
  const relics = { 'prism-coil': ['coil', 'prism'], 'shadow-weave': ['shadow', 'weave'], 'shell-weave': ['shell', 'weave'] }[id];
  const model = build(template, relics);
  if (id === 'prism-coil') {
    const roots = model.snapshot().nodes.filter(node => node.kind === 'mechanism' && node.required.length === 0);
    for (const root of roots) { reach(model, root.id); model.interact(); advance(model, .51); }
    reach(model, 'hub');
    const target = model.snapshot().coilArmed[0];
    assert.ok(target, `${template} has a powered downstream for an actual coil activation`);
    const layer = model.snapshot().nodes.find(node => node.id === target).layer;
    layers(model, [(layer + 1) % 3, layer]);
    assert.ok(model.snapshot().activated.includes(target));
  } else {
    travel(model, 'dew', true); model.interact();
    if (id === 'shadow-weave') {
      assert.equal(model.useAbility('shadow'), true); travel(model, 'hub');
      assert.equal(model.snapshot().weaveTarget.remote, true); assert.equal(model.useAbility('weave'), true);
    } else {
      assert.equal(model.useAbility('weave'), true); advance(model, .51); activateAll(model); reach(model, 'vault'); layers(model, [model.snapshot().roomChallenge.entryLayer]); assert.equal(model.interact(), true); escapeWave(model);
    }
  }
  assert.equal(route(model, id).eligible, true);
  return model;
}
function unlock(model, id) {
  const config = route(model, id); reach(model, config.entry);
  // Starting on the first layer is not a layer entry; step out before the ritual.
  layers(model, [(config.sequence[0] + 1) % 3, ...config.sequence]);
  assert.equal(route(model, id).progress, 3); assert.equal(route(model, id).unlocked, true);
  const edge = model.snapshot().edges.find(item => item.id === config.edge.id);
  assert.equal(edge.open, true); assert.equal(edge.layer, config.sequence[2]);
  return config;
}
function startTrial(model, id = 'shadow-weave') {
  unlock(model, id); travel(model, 'rift');
  assert.equal(model.snapshot().rift.canStart, true);
  const carried = model.snapshot().carried;
  assert.equal(model.interact(), true); assert.equal(model.snapshot().carried, carried - 2);
  return carried;
}
function dodgeRift(model) {
  while (model.snapshot().wave) {
    const wave = model.snapshot().wave, safe = wave.safeLayers[0];
    if (model.snapshot().layer === safe) layers(model, [(safe + 1) % 3]);
    layers(model, [safe]); assert.equal(model.snapshot().wave.entered, true);
    advance(model, wave.remaining + .001);
  }
}

for (const id of ['prism-coil', 'shadow-weave', 'shell-weave']) test(`${id} recipe uses earned actions and opens a distinct real route in all four templates`, () => {
  for (const template of ROOM_TEMPLATES) {
    const model = prepare(id, template.id), config = unlock(model, id);
    assert.equal(model.snapshot().hiddenRoutes.filter(item => item.unlocked).length, 1);
    const original = model.snapshot().selected;
    assert.ok(original === null || model.snapshot().availableNodes.includes(original));
    model.drainEvents(); travel(model, 'rift');
    assert.equal(model.snapshot().node, 'rift'); assert.equal(model.snapshot().nodes.find(node => node.id === 'rift').anchor, true);
    travel(model, config.entry); assert.equal(model.snapshot().stats.failures, 0);
    finishRoom(model); assert.equal(model.snapshot().phase, 'interlude');
  }
});

test('owning a build alone cannot open a hidden route, and one relic cannot activate any recipe', () => {
  for (const relic of ['prism', 'coil', 'shadow', 'weave', 'shell']) {
    const model = start(relic); activateAll(model);
    for (const config of model.snapshot().hiddenRoutes) { reach(model, config.entry); layers(model, [(config.sequence[0] + 1) % 3, ...config.sequence]); }
    assert.equal(model.snapshot().hiddenRoutes.some(item => item.eligible || item.unlocked || item.progress > 0), false);
    assert.equal(model.snapshot().edges.some(edge => edge.kind === 'secret'), false);
    assert.equal(model.snapshot().nodes.find(node => node.id === 'rift').locked, true);
  }
  for (const pair of [['prism', 'coil'], ['shadow', 'weave'], ['shell', 'weave']]) {
    const model = build('cascade', pair);
    assert.equal(model.snapshot().hiddenRoutes.some(item => item.eligible), false);
  }
});

test('local planting cannot replace remote weaving, and shell planting also needs a successful vault escape', () => {
  for (const relic of ['shadow', 'shell']) {
    const model = build('cascade', [relic, 'weave']); travel(model, 'dew', true); model.interact(); model.useAbility('weave');
    assert.equal(route(model, `${relic}-weave`).eligible, false);
    if (relic === 'shell') {
      advance(model, .51); activateAll(model); reach(model, 'vault'); layers(model, [model.snapshot().roomChallenge.entryLayer]); model.interact();
      const wave = model.snapshot().wave; layers(model, [wave.dangerLayers[0]]); advance(model, wave.remaining + .01);
      assert.equal(model.snapshot().vaultStatus, 'failed'); assert.equal(route(model, 'shell-weave').eligible, false);
    }
  }
});

test('prism activation can earn its recipe before any coil discharge, but the ritual remains mandatory', () => {
  const model = build('cascade', ['prism', 'coil']); travel(model, 'dew', true); travel(model, 'hub'); model.setW(center(model, 'dew'));
  assert.equal(model.useAbility('prism'), true); assert.equal(route(model, 'prism-coil').eligible, true);
  assert.equal(model.snapshot().coilRemaining, 1); assert.equal(route(model, 'prism-coil').unlocked, false);
  assert.ok(model.drainEvents().some(event => event.type === 'activate' && event.via === 'prism'));
});

test('seals count only actual new supported W entries at their anchor; wrong order resets and no idle/gap farm exists', () => {
  const model = prepare('shadow-weave'), config = route(model, 'shadow-weave'), [a, b, c] = config.sequence;
  layers(model, [c, a]); assert.equal(route(model, config.id).progress, 1);
  layers(model, [a, a]); advance(model, 5); assert.equal(route(model, config.id).progress, 1);
  model.setW(.34); layers(model, [a]); assert.equal(route(model, config.id).progress, 1);
  layers(model, [c]); assert.equal(route(model, config.id).progress, 0);
  layers(model, [a, b]); assert.equal(route(model, config.id).progress, 2);
  layers(model, [a]); assert.equal(route(model, config.id).progress, 1, 'a valid prefix restarts the sequence');
  layers(model, [b, c]); assert.equal(route(model, config.id).unlocked, true);
  assert.equal(model.snapshot().availableNodes.includes('rift'), true);
});

test('ritual entries while travelling or at another platform never count and landing does not replay them', () => {
  const model = prepare('shadow-weave'), config = route(model, 'shadow-weave');
  model.select('dew'); model.setW(model.snapshot().range.center); model.move();
  layers(model, config.sequence); assert.equal(route(model, config.id).progress, 0);
  model.setW(model.snapshot().range.center); advance(model, 1.36);
  layers(model, config.sequence); assert.equal(route(model, config.id).progress, 0);
  model.setW(center(model, 'dew')); travel(model, 'hub');
  const progress = route(model, config.id).progress;
  model.setW(model.snapshot().w); assert.equal(route(model, config.id).progress, progress, 'arrival and repeated W are not entries');
});

test('hidden seals and physical routes persist through ordinary failure; opening preserves a valid explicit target', () => {
  const model = prepare('shadow-weave'), config = route(model, 'shadow-weave');
  layers(model, [(config.sequence[0] + 1) % 3, config.sequence[0]]);
  const before = route(model, config.id).progress;
  fall(model, 'bell'); assert.equal(route(model, config.id).progress, before);
  reach(model, 'hub'); model.select('dew'); layers(model, config.sequence.slice(1));
  assert.equal(route(model, config.id).unlocked, true); assert.equal(model.snapshot().selected, 'dew');
  fall(model, 'dew'); assert.equal(route(model, config.id).unlocked, true);
  assert.equal(model.snapshot().edges.find(edge => edge.id === config.edge.id).open, true);
});

test('rift pays a non-refundable stake and seals all trial bridges and abilities across all three stages', () => {
  const model = prepare('shadow-weave'); startTrial(model); const banked = model.snapshot().banked;
  for (let step = 1; step <= 3; step++) {
    const state = model.snapshot(), wave = state.wave;
    assert.equal(wave.step, step); assert.equal(wave.steps, 3); assert.equal(wave.variant, 'rift'); assert.equal(wave.duration, 2.8);
    assert.equal(wave.safeLayers.length, 1); assert.equal(wave.dangerLayers.length, 2);
    assert.equal(state.edges.filter(edge => ['vault', 'rift'].includes(edge.from) || ['vault', 'rift'].includes(edge.to)).every(edge => !edge.open), true);
    assert.equal(model.move(), false); assert.equal(model.setRisk(true), false); assert.equal(model.interact(), false);
    for (const relic of ['prism', 'shadow', 'weave']) assert.equal(model.useAbility(relic), false);
    const safe = wave.safeLayers[0]; if (state.layer === safe) layers(model, [(safe + 1) % 3]); layers(model, [safe]); advance(model, wave.remaining + .001);
    if (step < 3) assert.equal(model.snapshot().banked, banked);
  }
  assert.equal(model.snapshot().rift.status, 'cleared'); assert.equal(model.interact(), false);
});

test('starting already in the first safe layer requires leaving and re-entering; gap bouncing cannot satisfy a rift wave', () => {
  for (const change of ['none', 'gap']) {
    const model = prepare('shadow-weave'); unlock(model, 'shadow-weave'); travel(model, 'rift');
    layers(model, [model.snapshot().rift.sequence[0]]); assert.equal(model.interact(), true);
    if (change === 'gap') { model.setW(.34); layers(model, [model.snapshot().rift.sequence[0]]); }
    assert.equal(model.snapshot().wave.entered, false); advance(model, 2.81);
    assert.equal(model.snapshot().rift.status, 'failed'); assert.equal(model.snapshot().vaultStatus, 'available');
    assert.equal(model.snapshot().stats.failures, 1); assert.equal(model.snapshot().lives, 2); assert.equal(model.interact(), false);
    assert.equal(model.snapshot().edges.some(edge => edge.kind === 'secret' && edge.open), true);
  }
});

test('later rift failure awards no partial reward, preserves committed seals, and shell protects only the post-stake holdings', () => {
  const model = prepare('shell-weave'); const before = startTrial(model, 'shell-weave'); const initial = model.snapshot().carried;
  let wave = model.snapshot().wave, safe = wave.safeLayers[0]; if (model.snapshot().layer === safe) layers(model, [(safe + 1) % 3]); layers(model, [safe]); advance(model, 2.801);
  assert.equal(model.snapshot().wave.step, 2); assert.equal(model.snapshot().carried, initial);
  model.drainEvents(); wave = model.snapshot().wave; layers(model, [wave.dangerLayers[0]]); advance(model, 2.81);
  assert.equal(model.snapshot().rift.status, 'failed'); assert.equal(model.snapshot().rift.ascension, 0); assert.equal(model.snapshot().carried, before - 2);
  assert.equal(model.snapshot().shieldUses, 0); assert.equal(model.snapshot().lives, 3); assert.equal(model.snapshot().vaultStatus, 'escaped');
  const events = model.drainEvents(); assert.ok(events.some(event => event.type === 'fail' && event.reason === 'rift' && event.protected));
  assert.equal(events.some(event => event.type === 'rift_clear' || event.type === 'ascension' || event.type === 'reward'), false);
  assert.equal(model.interact(), false); travel(model, 'vault'); assert.equal(route(model, 'shell-weave').unlocked, true);
});

test('full rift success produces exactly one reward and ordered committed growth without bypassing missing mechanisms', () => {
  const model = prepare('shadow-weave'); startTrial(model); const carried = model.snapshot().carried; model.drainEvents(); dodgeRift(model);
  assert.equal(model.snapshot().carried, carried + 9); assert.equal(model.snapshot().rift.ascension, 0);
  let events = model.drainEvents(); const reward = events.filter(event => event.type === 'reward');
  assert.equal(reward.length, 1); assert.equal(reward[0].challenge, 'rift'); assert.equal(reward[0].value, 9);
  assert.ok(events.findIndex(event => event.type === 'rift_clear') < events.findIndex(event => event.type === 'reward'));
  assert.equal(events.some(event => event.type === 'evade'), false);
  advance(model, .2); assert.equal(model.snapshot().rift.ascension, 1);
  fall(model, 'hub'); advance(model, .41); assert.equal(model.snapshot().rift.ascension, 3);
  events = model.drainEvents(); assert.deepEqual(events.filter(event => event.type === 'ascension').map(event => [event.stage, event.to]), [[1, 'hub'], [2, 'relay'], [3, 'exit']]);
  let edge = model.snapshot().edges.find(item => item.kind === 'ascension'); assert.equal(edge.open, false); assert.equal(model.snapshot().activated.length, 1);
  travel(model, 'hub'); activateAll(model); reach(model, 'rift'); edge = model.snapshot().edges.find(item => item.kind === 'ascension');
  assert.equal(edge.open, true); assert.equal(edge.layer, model.snapshot().nodes.find(node => node.id === 'exit').layer);
  travel(model, 'exit'); assert.equal(model.snapshot().phase, 'interlude');
});

test('rift entry requires actual supported W and enough carried stake; banking cannot be charged and failed rooms never refund or retry', () => {
  const model = prepare('shadow-weave'); unlock(model, 'shadow-weave'); model.interact();
  assert.equal(model.snapshot().carried, 0); const banked = model.snapshot().banked; travel(model, 'rift');
  assert.equal(model.snapshot().carried, 1); assert.equal(model.interact(), false); assert.equal(model.snapshot().banked, banked);
  travel(model, 'hub'); travel(model, 'rift'); assert.equal(model.snapshot().carried, 2);
  model.setW(.34); assert.equal(model.interact(), false); layers(model, [0]); assert.equal(model.interact(), true);
  const wave = model.snapshot().wave; layers(model, [wave.dangerLayers[0]]); advance(model, 2.81);
  assert.equal(model.snapshot().rift.status, 'failed'); assert.equal(model.interact(), false); assert.equal(model.snapshot().banked, banked);
});

test('pause, huge background delta, snapshot mutation, restart and room transition cannot leak or replay trial state', () => {
  const model = prepare('shadow-weave'); startTrial(model); const before = model.snapshot(); model.update(0); assert.deepEqual(model.snapshot(), before);
  model.update(100); assert.ok(Math.abs(model.snapshot().wave.remaining - (before.wave.remaining - .1)) < 1e-8);
  const mutable = model.snapshot(); mutable.hiddenRoutes[1].sequence[0] = 99; mutable.hiddenRoutes[1].requires[0] = 'shell'; mutable.hiddenRoutes[1].edge.to = 'exit'; mutable.rift.sequence[0] = 99; mutable.rift.exitEdge.layer = 99; mutable.wave.safeLayers[0] = 99;
  assert.notEqual(model.snapshot().hiddenRoutes[1].sequence[0], 99); assert.equal(model.snapshot().hiddenRoutes[1].requires[0], 'shadow');
  assert.equal(model.snapshot().hiddenRoutes[1].edge.to, 'rift'); assert.notEqual(model.snapshot().rift.sequence[0], 99); assert.notEqual(model.snapshot().rift.exitEdge.layer, 99); assert.notEqual(model.snapshot().wave.safeLayers[0], 99);
  model.restart(); model.chooseRelic('shadow'); advance(model, 4); assert.equal(model.snapshot().wave, null); assert.equal(model.snapshot().rift.status, 'available'); assert.equal(model.snapshot().rift.ascension, 0); assert.equal(model.snapshot().hiddenRoutes.some(item => item.unlocked || item.eligible || item.progress), false);
  const second = prepare('shadow-weave'); startTrial(second); dodgeRift(second); advance(second, 1.11); finishRoom(second); second.chooseRelic('weave');
  assert.equal(second.snapshot().rift.status, 'available'); assert.equal(second.snapshot().rift.ascension, 0); assert.equal(second.snapshot().hiddenRoutes.some(item => item.unlocked || item.eligible || item.progress), false);
});

test('100 seeds retain their original plan transforms and every hidden/ascension edge has supported distinct endpoints and clear geometry', () => {
  const coverage = new Set();
  for (let seed = 0; seed < 100; seed++) for (const plan of createRoomPlan(seed)) {
    const room = buildRoom(plan, LAYERS), base = buildRoom(plan, LAYERS, { includeRift: false }); coverage.add(plan.template.id);
    assert.deepEqual(room.nodes.slice(0, -1), base.nodes); assert.ok(layoutClearance(room.nodes) >= 1.05);
    const nodes = new Map(room.nodes.map(node => [node.id, node]));
    const edges = [...room.edges, ...room.shadows.map(item => item.edge), ...room.weaves.map(item => item.edge), room.resonance, ...room.hiddenRoutes.map(item => item.edge), room.rift.exitEdge];
    assert.equal(new Set(edges.map(edge => edge.id)).size, edges.length);
    for (const edge of edges) for (const id of [edge.from, edge.to]) assert.ok(nodes.get(id).anchor || nodes.get(id).layer === edge.layer, `${plan.signature}: ${edge.id} ${id}`);
    for (const config of room.hiddenRoutes) assert.equal(new Set(config.sequence).size, 3);
    assert.equal(new Set(room.rift.sequence).size, 3);
  }
  assert.equal(coverage.size, 4);
});
