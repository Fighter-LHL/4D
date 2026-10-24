import test from 'node:test';
import assert from 'node:assert/strict';
import { GameModel, LAYERS } from '../src/model.js';
import { createRoomPlan, buildRoom } from '../src/rooms.js';
import { start, advance, travel, reach, activateAll, finishRoom, openVault, escapeWave, fall, seedFor, pathTo } from './model-helpers.js';

const center = (model, id) => model.snapshot().nodes.find(node => node.id === id).center;
function build(template, relics, challenge) {
  const room = relics.length - 1;
  let seed = 0;
  while (createRoomPlan(seed)[room].template.id !== template || (challenge && createRoomPlan(seed)[room].challenge.variant !== challenge)) seed++;
  const model = start(relics[0], seed);
  for (const relic of relics.slice(1)) { finishRoom(model); model.chooseRelic(relic); }
  model.drainEvents(); return model;
}
function primeAtHub(model) {
  travel(model, 'dew', true); travel(model, 'hub');
  assert.equal(model.snapshot().charge, 1);
  model.setW(center(model, 'dew')); assert.equal(model.useAbility('prism'), true);
}

test('coil needs a new supported W entry from an anchor and skips the remote mechanism visit', () => {
  const model = start('coil', seedFor('return'));
  reach(model, 'dew'); model.interact(); reach(model, 'hub');
  assert.deepEqual(model.snapshot().coilArmed, ['bell']);
  const before = model.snapshot(); assert.equal(before.node, 'hub'); assert.equal(pathTo(before, 'bell').length, 2);
  model.drainEvents(); model.setW(center(model, 'bell'));
  assert.equal(model.snapshot().node, 'hub'); assert.ok(model.snapshot().activated.includes('bell')); assert.equal(model.snapshot().coilRemaining, 0);
  assert.equal(model.snapshot().coilArmed.includes('bell'), false);
  const events = model.drainEvents(); assert.ok(events.some(event => event.type === 'coil' && event.from === 'hub' && event.to === 'bell'));
  assert.ok(events.some(event => event.type === 'activate' && event.via === 'coil')); assert.equal(events.some(event => event.type === 'move'), false);
  advance(model, .51); assert.deepEqual(model.snapshot().coilArmed, [], 'exhausted coil never advertises another ready target'); model.setW(center(model, 'bloom')); assert.equal(model.snapshot().activated.includes('bloom'), false, 'rank one cannot activate a second target');
  finishRoom(model); assert.equal(model.snapshot().phase, 'interlude');
});

test('prism and coil chain remote power, but pre-entry and a gap bounce do not discharge an armed coil', () => {
  const model = build('cascade', ['prism', 'coil']); primeAtHub(model);
  model.setW(center(model, 'bell')); advance(model, .51);
  assert.deepEqual(model.snapshot().coilArmed, ['bell']); assert.equal(model.snapshot().activated.includes('bell'), false);
  model.setW(.34); model.setW(center(model, 'bell')); assert.equal(model.snapshot().activated.includes('bell'), false, 'gap is not another entity layer');
  model.setW(center(model, 'dew')); model.setW(center(model, 'bell'));
  assert.ok(model.snapshot().activated.includes('bell')); advance(model, .51); assert.ok(model.snapshot().powered.includes('bloom'));
  assert.equal(model.snapshot().charge, 0); assert.equal(model.snapshot().coilRemaining, 0);
});

test('AND input only arms after the last delayed source; roots and physical same-XYZ transfer never auto-activate', () => {
  const model = start('coil', seedFor('confluence'));
  reach(model, 'dew'); model.interact(); model.setW(center(model, 'bell')); advance(model, .51);
  assert.equal(model.snapshot().node, 'bell'); assert.deepEqual(model.snapshot().coilArmed, []); assert.equal(model.interact(), false);
  reach(model, 'bloom'); model.interact(); advance(model, .51);
  assert.deepEqual(model.snapshot().coilArmed, ['bell']); reach(model, 'hub'); model.setW(center(model, 'dew')); model.setW(center(model, 'bell'));
  assert.deepEqual(new Set(model.snapshot().activated), new Set(['dew', 'bloom', 'bell'])); assert.equal(model.snapshot().coilRemaining, 0);
  const physical = start('coil', seedFor('cascade')); reach(physical, 'dew'); physical.interact(); advance(physical, .51);
  physical.setW(center(physical, 'bell')); assert.equal(physical.snapshot().node, 'bell'); assert.equal(physical.snapshot().activated.includes('bell'), false);
  physical.interact(); assert.deepEqual(physical.snapshot().coilArmed, []); assert.equal(physical.snapshot().coilRemaining, 1);
});

test('coil observes real layers during travel; landing and same-layer retries cannot trigger it', () => {
  const model = build('return', ['prism', 'coil']); primeAtHub(model); advance(model, .51);
  model.select('dew'); model.setW(center(model, 'dew')); model.move(); model.setW(center(model, 'bell'));
  assert.equal(model.snapshot().activated.includes('bell'), false); assert.equal(model.snapshot().coilRemaining, 1);
  model.setW(center(model, 'dew')); advance(model, 1.36); travel(model, 'hub');
  model.setW(center(model, 'bell')); assert.ok(model.snapshot().activated.includes('bell'));
});

test('coil entries during waves are consumed as layer history and require a fresh entry after dodging', () => {
  const model = build('split', ['coil', 'coil'], 'single');
  reach(model, 'bell'); model.interact(); travel(model, 'hub');
  assert.deepEqual(model.snapshot().coilArmed, ['bloom']);
  reach(model, 'vault'); model.interact(); const target = model.snapshot().nodes.find(node => node.id === 'bloom').layer;
  assert.ok(model.snapshot().wave.safeLayers.includes(target));
  model.setW(center(model, 'bloom')); advance(model, model.snapshot().wave.remaining + .01);
  assert.equal(model.snapshot().wave, null); assert.equal(model.snapshot().activated.includes('bloom'), false);
  model.setW(.34); model.setW(center(model, 'bloom')); assert.equal(model.snapshot().activated.includes('bloom'), false);
  model.setW(center(model, 'bell')); model.setW(center(model, 'bloom')); assert.ok(model.snapshot().activated.includes('bloom'));
});

test('rank two coil permits two downstream activations and fresh rooms reset use counters', () => {
  const model = build('cascade', ['coil', 'coil']);
  reach(model, 'dew'); model.interact(); travel(model, 'hub');
  model.setW(center(model, 'bell')); advance(model, .51); model.setW(center(model, 'bloom'));
  assert.equal(model.snapshot().activated.length, 3); assert.equal(model.snapshot().coilRemaining, 0);
  reach(model, 'exit'); model.chooseRelic('coil'); assert.equal(model.snapshot().coilRemaining, 3); assert.deepEqual(model.snapshot().coilArmed, []);
});

test('an armed coil and committed power survive a fall, without refunding a spent use', () => {
  const model = start('coil', seedFor('cascade')); reach(model, 'dew'); model.interact(); advance(model, .51); fall(model, 'hub');
  assert.deepEqual(model.snapshot().coilArmed, ['bell']); travel(model, 'hub'); model.setW(center(model, 'bell'));
  assert.equal(model.snapshot().coilRemaining, 0); advance(model, .51); fall(model, 'dew'); assert.equal(model.snapshot().coilRemaining, 0); assert.deepEqual(model.snapshot().coilArmed, []);
  assert.equal(model.snapshot().abilities.find(item => item.id === 'coil').detail, '本庭接力已用尽，下一庭恢复');
});

test('weave spends an earned seed at an active mechanism to make a permanent supported shortcut', () => {
  const model = start('weave', seedFor('cascade')); travel(model, 'dew', true);
  assert.equal(model.snapshot().weaveCharge, 1); assert.equal(model.useAbility('weave'), false);
  model.interact(); const value = model.snapshot().carried; assert.equal(model.useAbility('weave'), true);
  assert.equal(model.snapshot().carried, value); assert.equal(model.snapshot().weaveCharge, 0);
  const edge = model.snapshot().edges.find(item => item.kind === 'weave'); assert.equal(edge.layer, model.snapshot().nodes.find(node => node.id === 'dew').layer);
  assert.equal(edge.open, true); assert.equal(model.snapshot().edges.find(item => item.id === 'hub-relay').open, false, 'woven shortcut changes the accessible route before main latch');
  assert.ok(model.snapshot().availableNodes.includes('relay')); travel(model, 'relay'); assert.equal(model.snapshot().node, 'relay');
  assert.equal(model.snapshot().nodes.find(node => node.id === 'exit').locked, true); finishRoom(model);
});

test('safe and banked routes cannot produce seeds; loss clears seeds and the immutable risk source cannot refill them', () => {
  const model = start('weave'); travel(model, 'dew'); assert.equal(model.snapshot().weaveCharge, 0); travel(model, 'hub'); model.interact();
  travel(model, 'dew', true); assert.equal(model.snapshot().weaveCharge, 0); travel(model, 'hub'); fall(model, 'dew'); travel(model, 'dew', true); assert.equal(model.snapshot().weaveCharge, 0);
  const lost = start('weave'); travel(lost, 'dew', true); lost.interact(); assert.equal(lost.snapshot().weaveCharge, 1); travel(lost, 'hub'); fall(lost, 'dew');
  assert.equal(lost.snapshot().weaveCharge, 0); travel(lost, 'dew', true); assert.equal(lost.snapshot().weaveCharge, 0);
  assert.equal(lost.snapshot().resonance.stage, 3); assert.equal(lost.snapshot().resonance.triggered, true);
});

test('weave capacity follows rank and each source can only be planted once; planted edges survive failure', () => {
  const model = build('cascade', ['weave', 'weave']); travel(model, 'dew', true); model.interact(); travel(model, 'hub', true);
  assert.equal(model.snapshot().weaveCharge, 2); travel(model, 'dew'); model.useAbility('weave'); assert.equal(model.snapshot().weaveCharge, 1); assert.equal(model.useAbility('weave'), false);
  fall(model, 'hub'); assert.equal(model.snapshot().weaveCharge, 0); assert.equal(model.snapshot().woven.length, 1); assert.equal(model.snapshot().edges.find(edge => edge.kind === 'weave').open, true);
});

test('shadow plus weave can remotely make a permanent bridge after returning to an anchor', () => {
  const model = build('return', ['shadow', 'weave']); travel(model, 'dew', true); model.interact(); assert.equal(model.useAbility('shadow'), true); travel(model, 'hub');
  const target = model.snapshot().weaveTarget; assert.equal(target.node, 'dew'); assert.equal(target.remote, true); assert.equal(model.useAbility('weave'), true);
  assert.ok(model.drainEvents().some(event => event.type === 'weave' && event.remote && event.from === 'dew' && event.to === 'relay'));
  advance(model, 13); assert.equal(model.snapshot().ghost, null); assert.ok(model.snapshot().edges.some(edge => edge.kind === 'weave' && edge.open));
  assert.equal(model.useAbility('weave'), false); finishRoom(model); assert.equal(model.snapshot().phase, 'interlude');
});

test('parallel normal and woven edges honor the current W layer and destinations stay unique', () => {
  const model = start('weave', seedFor('confluence')); travel(model, 'bloom', true); model.interact(); model.useAbility('weave'); travel(model, 'relay');
  travel(model, 'bloom'); assert.equal(model.snapshot().node, 'bloom'); travel(model, 'hub'); reach(model, 'dew'); model.interact(); advance(model, .51); model.setW(center(model, 'bell')); model.interact();
  // All three weaves are unique IDs; bell weave may coexist with its shadow route.
  const dual = build('cascade', ['shadow', 'weave']); travel(dual, 'dew', true); dual.interact(); advance(dual, .51); dual.setW(center(dual, 'bell')); dual.interact(); dual.useAbility('shadow'); dual.useAbility('weave');
  const edges = dual.snapshot().edges.filter(edge => edge.from === 'bell' && edge.to === 'relay'); assert.equal(edges.length, 2);
  assert.equal(new Set(edges.map(edge => edge.id)).size, 2); assert.equal(dual.snapshot().availableNodes.filter(id => id === 'relay').length, 1);
  travel(dual, 'relay'); advance(dual, 13); travel(dual, 'bell'); assert.equal(dual.snapshot().node, 'bell');
});

test('first risk grows an ordered permanent scene bridge, with prerequisites and no duplicate growth', () => {
  const model = start('shell', seedFor('cascade')); travel(model, 'dew', true); model.drainEvents();
  assert.deepEqual(model.snapshot().resonance, { stage: 0, triggered: true, from: 'dew', edge: { id: 'resonance-vault-relay', from: 'vault', to: 'relay', layer: model.snapshot().nodes.find(node => node.id === 'bloom').layer } });
  advance(model, .24); assert.equal(model.snapshot().resonance.stage, 1); // arrival helper already advances .01 seconds
  advance(model, .35); assert.equal(model.snapshot().resonance.stage, 2); advance(model, .4); assert.equal(model.snapshot().resonance.stage, 3);
  assert.deepEqual(model.drainEvents().filter(event => event.type === 'resonance').map(event => [event.stage, event.to]), [[1, 'hub'], [2, 'vault'], [3, 'relay']]);
  assert.equal(model.snapshot().edges.find(edge => edge.kind === 'resonance').open, false, 'growth cannot bypass the vault prerequisite');
  model.interact(); model.setW(center(model, 'bell')); advance(model, .51); model.interact(); assert.equal(model.snapshot().edges.find(edge => edge.kind === 'resonance').open, true);
  travel(model, 'hub', true); advance(model, 1.1); assert.equal(model.drainEvents().filter(event => event.type === 'resonance').length, 0);
});

test('grown bridges never bypass active vault waves; winning the challenge creates a new exit route', () => {
  const model = start('weave', seedFor('cascade', 'single')); openVault(model); escapeWave(model);
  assert.equal(model.snapshot().weaveCharge, 1); advance(model, 1.01);
  const edge = model.snapshot().edges.find(item => item.kind === 'resonance'); assert.equal(edge.open, true);
  assert.ok(model.snapshot().availableNodes.includes('relay')); model.setW(LAYERS[edge.layer].center); travel(model, 'relay'); assert.equal(model.snapshot().lives, 3);
  const second = start('weave', seedFor('cascade', 'chase')); travel(second, 'dew', true); second.interact(); advance(second, .51); activateAll(second); reach(second, 'vault'); second.setW(LAYERS[second.snapshot().roomChallenge.entryLayer].center); assert.equal(second.interact(), true);
  assert.ok(second.snapshot().edges.some(item => item.kind === 'resonance')); assert.equal(second.snapshot().edges.filter(item => item.from === 'vault' || item.to === 'vault').every(item => !item.open), true);
  assert.equal(second.useAbility('weave'), false); assert.equal(second.move(), false); escapeWave(second); assert.equal(second.snapshot().edges.filter(item => item.from === 'vault' || item.to === 'vault').every(item => item.open), true);
});

test('growth is committed through failure, freezes without updates and is cancelled on restart or room change', () => {
  const model = start('weave'); travel(model, 'dew', true); model.setW(.34); advance(model, .91);
  assert.equal(model.snapshot().stats.failures, 1); assert.equal(model.snapshot().resonance.stage, 2); advance(model, .1); assert.equal(model.snapshot().resonance.stage, 3);
  const other = start('weave'); travel(other, 'dew', true); const before = other.snapshot(); other.update(0); assert.deepEqual(other.snapshot(), before);
  other.restart(); other.chooseRelic('weave'); advance(other, 2); assert.equal(other.snapshot().resonance.triggered, false); assert.equal(other.snapshot().edges.some(edge => edge.kind === 'resonance'), false);
  finishRoom(model); model.chooseRelic('weave'); assert.equal(model.snapshot().resonance.stage, 0); assert.equal(model.snapshot().resonance.triggered, false); assert.equal(model.snapshot().weaveCharge, 0); assert.deepEqual(model.snapshot().woven, []);
});

test('all authored dynamic edges have supported endpoints and separate IDs across 100 seeds', () => {
  for (let seed = 0; seed < 100; seed++) for (const plan of createRoomPlan(seed)) {
    const room = buildRoom(plan, LAYERS); const nodes = new Map(room.nodes.map(node => [node.id, node]));
    const edges = [...room.edges, ...room.shadows.map(item => item.edge), ...room.weaves.map(item => item.edge), room.resonance];
    assert.equal(new Set(edges.map(edge => edge.id)).size, edges.length);
    for (const edge of edges) for (const id of [edge.from, edge.to]) assert.ok(nodes.get(id).anchor || nodes.get(id).layer === edge.layer, `${plan.signature} ${edge.id} has supported ${id}`);
  }
});

test('snapshots isolate woven routes, resonance edges, coil lists and weave target from authority', () => {
  const model = start('weave'); travel(model, 'dew', true); model.interact();
  let state = model.snapshot(); state.weaveTarget.edge.to = 'exit'; state.resonance.edge.layer = 99; state.coilArmed.push('exit');
  model.useAbility('weave'); state = model.snapshot(); state.woven[0].edge.to = 'exit'; state.woven.push({ node: 'exit' });
  assert.equal(model.snapshot().woven[0].edge.to, 'relay'); assert.equal(model.snapshot().woven.length, 1); assert.notEqual(model.snapshot().resonance.edge.layer, 99); assert.deepEqual(model.snapshot().coilArmed, []);
});


test('a parallel open edge in a different W layer cannot hide the usable grown bridge', () => {
  const model = start('weave', seedFor('cascade', 'single')); openVault(model); escapeWave(model); advance(model, 1.01);
  const layer = model.snapshot().resonance.edge.layer;
  // Focused selector regression: both endpoints are anchors, so both authored
  // layers support them. The earlier edge must not mask the current-layer one.
  model.roomConfig.edges.push({ id: 'parallel-fixture', from: 'vault', to: 'relay', layer: (layer + 1) % 3 });
  model.setW(LAYERS[layer].center); model.select('relay'); assert.equal(model.snapshot().range.layer, layer);
  assert.equal(model.move(), true); assert.equal(model.snapshot().travel.edgeId, 'resonance-vault-relay'); advance(model, 1.36); assert.equal(model.snapshot().node, 'relay');
});

test('passive coil activation preserves an explicitly selected available route', () => {
  const model = build('cascade', ['coil', 'coil']); reach(model, 'dew'); model.interact(); travel(model, 'hub');
  model.setW(center(model, 'bell')); advance(model, .51); model.select('dew');
  model.setW(center(model, 'bloom')); assert.equal(model.snapshot().activated.length, 3); assert.equal(model.snapshot().selected, 'dew');
});

test('60 seeded runs finish three rooms with planted shortcuts, growth and accumulating weave/coil/prism builds', () => {
  const templates = new Set();
  for (let seed = 0; seed < 60; seed++) {
    const model = start('weave', seed);
    for (let room = 0; room < 3; room++) {
      templates.add(model.snapshot().roomId);
      travel(model, 'dew', true); model.interact(); model.useAbility('weave'); advance(model, .51);
      assert.equal(model.snapshot().woven.length, 1);
      const target = model.snapshot().woven[0].edge.to;
      travel(model, target); assert.equal(model.snapshot().resonance.stage, 3);
      finishRoom(model); assert.equal(model.snapshot().lives, 3, `seed ${seed} room ${room}`);
      assert.equal(model.snapshot().phase, room === 2 ? 'won' : 'interlude');
      if (room < 2) model.chooseRelic(room === 0 ? 'coil' : 'prism');
    }
  }
  assert.equal(templates.size, 4);
});
