import test from 'node:test';
import assert from 'node:assert/strict';
import { GameModel, LAYERS } from '../src/model.js';
import { ROOM_TEMPLATES, createRoomPlan, buildRoom, layoutClearance } from '../src/rooms.js';
import { start, advance, travel, reach, finishRoom, seedFor } from './model-helpers.js';

function sameXYZ(a, b) { return ['x', 'y', 'z'].every(axis => a.world[axis] === b.world[axis]); }

test('seed determines the whole nonrepeating route plan, challenge order, layers and geometry', () => {
  const profiles = new Set();
  for (let seed = 0; seed < 100; seed++) {
    const a = new GameModel(seed).snapshot(), b = new GameModel(seed).snapshot();
    assert.deepEqual(a, b); assert.equal(new Set(a.roomPlan.map(room => room.id)).size, 3); assert.equal(new Set(a.roomPlan.map(room => room.challengeName)).size, 3);
    profiles.add(JSON.stringify({ required: a.nodes.map(node => node.required), world: a.nodes.map(node => node.world), edges: a.edges.map(edge => [edge.from, edge.to, edge.layer, edge.open]) }));
  }
  assert.ok(profiles.size >= 40, 'seed changes physical route or prerequisites, not just descriptive labels');
});

test('100 seeds × three rooms solve without relic abilities, retain previews and cover all template/layer permutations', () => {
  const coverage = Object.fromEntries(ROOM_TEMPLATES.map(room => [room.id, new Set()]));
  for (let seed = 0; seed < 100; seed++) {
    const model = start('prism', seed);
    for (let room = 0; room < 3; room++) {
      const state = model.snapshot(), roomPlan = createRoomPlan(seed)[room];
      coverage[state.roomId].add(roomPlan.mapping.join(''));
      const mechanisms = state.nodes.filter(node => node.kind === 'mechanism');
      assert.ok(mechanisms.some((a, i) => mechanisms.some((b, j) => i !== j && sameXYZ(a, b) && a.layer !== b.layer)), `same-XYZ W transfer in ${state.roomId}`);
      finishRoom(model); const finished = model.snapshot();
      assert.equal(finished.lives, 3, `seed ${seed}, room ${room}`); assert.equal(finished.stats.failures, 0); assert.equal(finished.phase, room === 2 ? 'won' : 'interlude');
      if (room < 2) { model.chooseRelic('prism'); assert.equal(model.snapshot().roomSignature, finished.nextRoom.signature); }
    }
  }
  for (const [id, permutations] of Object.entries(coverage)) assert.equal(permutations.size, 6, `all W permutations exercised for ${id}`);
});

test('authored transforms preserve projections, separated visible platforms and layer-supported bridge endpoints', () => {
  const orientations = Object.fromEntries(ROOM_TEMPLATES.map(room => [room.id, new Set()]));
  for (let seed = 0; seed < 100; seed++) for (const plan of createRoomPlan(seed)) {
    const room = buildRoom(plan, LAYERS); orientations[plan.template.id].add(`${plan.rotation}:${plan.mirror}`);
    assert.ok(layoutClearance(room.nodes) >= 1.05, plan.signature);
    const nodes = new Map(room.nodes.map(node => [node.id, node]));
    for (const node of room.nodes) {
      assert.equal(node.x, 500 + (node.world.x - node.world.z) * 52); assert.equal(node.y, 350 + (node.world.x + node.world.z) * 27 - node.world.y * 50);
      assert.ok(node.x >= 100 && node.x <= 900); assert.ok(node.y >= 80 && node.y <= 560);
    }
    const pairs = new Set();
    for (const edge of [...room.edges, ...room.shadows.map(shadow => shadow.edge)]) {
      const pair = [edge.from, edge.to].sort().join(':'); assert.equal(pairs.has(pair), false, 'no ambiguous parallel endpoint selection'); pairs.add(pair);
      for (const id of [edge.from, edge.to]) { const node = nodes.get(id); assert.ok(node.anchor || node.layer === edge.layer, `bridge ${edge.id} matches support of ${id}`); }
    }
  }
  for (const values of Object.values(orientations)) assert.ok(values.size >= 2, 'readable layouts still offer multiple real orientations');
});

test('AND confluence needs both sources independently; partial power survives collapse and is separately visible', () => {
  for (const first of ['dew', 'bloom']) {
    const model = start('prism', seedFor('confluence'));
    reach(model, first); const source = model.snapshot().nodes.find(node => node.id === first);
    model.setW(.34); advance(model, .65); model.setW(source.center); model.interact(); model.setW(.34); advance(model, .26);
    assert.equal(model.snapshot().node, 'hub'); assert.equal(model.snapshot().powered.includes('bell'), false); model.drainEvents(); advance(model, .25);
    const bell = model.snapshot().nodes.find(node => node.id === 'bell'); assert.deepEqual(bell.received, [first]); assert.equal(bell.powered, false); assert.equal(bell.locked, true);
    const power = model.drainEvents().find(event => event.type === 'power'); assert.equal(power.from, first); assert.equal(power.complete, false); assert.equal(power.received, 1); assert.equal(power.required, 2);
    reach(model, 'bell'); assert.equal(model.interact(), false, 'one source cannot substitute for both');
    reach(model, first === 'dew' ? 'bloom' : 'dew'); assert.equal(model.interact(), true); advance(model, .51);
    assert.equal(model.snapshot().powered.includes('bell'), true); reach(model, 'bell'); assert.equal(model.interact(), true); reach(model, 'exit'); assert.equal(model.snapshot().phase, 'interlude');
  }
});

test('split bridge and power are independent necessary branches, and prism cannot bypass the missing bridge source', () => {
  const model = start('prism', seedFor('split'));
  travel(model, 'bell', true); assert.equal(model.interact(), true); travel(model, 'hub');
  assert.equal(model.snapshot().powered.includes('bloom'), true); assert.equal(model.snapshot().edges.find(edge => edge.id === 'hub-relay').open, false);
  model.setW(model.snapshot().nodes.find(node => node.id === 'bloom').center); assert.equal(model.useAbility('prism'), true);
  assert.equal(model.snapshot().activated.includes('bloom'), true); assert.equal(model.snapshot().nodes.find(node => node.id === 'exit').locked, true); assert.equal(model.select('relay'), false);
  reach(model, 'dew'); model.interact(); assert.equal(model.snapshot().nodes.find(node => node.id === 'exit').locked, false); reach(model, 'exit');
});

test('return layout changes the co-located pair and needs an anchor return to its starting-layer exit', () => {
  const model = start('prism', seedFor('return'));
  const state = model.snapshot(), nodes = Object.fromEntries(state.nodes.map(node => [node.id, node]));
  assert.ok(sameXYZ(nodes.bell, nodes.bloom)); assert.equal(sameXYZ(nodes.dew, nodes.bell), false); assert.equal(nodes.exit.layer, nodes.dew.layer);
  reach(model, 'dew'); model.interact(); advance(model, .51); reach(model, 'bell'); model.interact(); advance(model, .51);
  model.setW(nodes.bloom.center); assert.equal(model.snapshot().node, 'bloom'); model.interact();
  assert.equal(model.snapshot().availableNodes.includes('exit'), false); reach(model, 'hub'); assert.ok(model.snapshot().availableNodes.includes('exit')); reach(model, 'exit');
});
