import assert from 'node:assert/strict';
import { GameModel, LAYERS } from '../../src/model.js';
import { createRoomPlan, buildRoom, layoutClearance } from '../../src/rooms.js';
import { createRoomPlan as previousPlan, buildRoom as previousRoom } from './rooms-before-hidden.mjs';

let simulationTicks = 0;
const state = model => model.snapshot();
function ticks(model, seconds, follow = false) {
  const count = Math.ceil(seconds * 120);
  for (let i = 0; i < count; i++) {
    if (follow && state(model).travel) model.setW(state(model).range.center);
    model.update(1 / 120); simulationTicks++;
  }
}
function shift(model, layer) { assert.equal(model.setW(LAYERS[layer].center), true); }
function cross(model, destination, risk = false) {
  assert.equal(model.setRisk(risk), true); assert.equal(model.select(destination), true);
  model.setW(state(model).range.center); assert.equal(model.move(), true);
  let guard = 0;
  while (state(model).travel && guard++ < 500) { if (risk) model.setW(state(model).range.center); model.update(1 / 120); simulationTicks++; }
  assert.equal(state(model).node, destination); assert.equal(state(model).travel, null);
}
function path(model, target) {
  const snapshot = state(model), byId = new Map(snapshot.nodes.map(node => [node.id, node]));
  const queue = [[snapshot.node, []]], seen = new Set();
  while (queue.length) {
    const [current, commands] = queue.shift(); if (current === target) return commands; if (seen.has(current)) continue; seen.add(current);
    for (const edge of snapshot.edges) {
      if (!edge.open || (edge.from !== current && edge.to !== current)) continue;
      queue.push([edge.from === current ? edge.to : edge.from, [...commands, { move: edge.from === current ? edge.to : edge.from }]]);
    }
    const node = byId.get(current);
    if (!node.anchor) for (const other of snapshot.nodes) if (!other.anchor && other.id !== current && ['x', 'y', 'z'].every(axis => node.world[axis] === other.world[axis])) queue.push([other.id, [...commands, { shift: other.layer }]]);
  }
  return null;
}
function navigate(model, destination) {
  const commands = path(model, destination); assert.ok(commands, `${state(model).roomId}:${state(model).node}->${destination}`);
  for (const command of commands) if (command.move) cross(model, command.move); else shift(model, command.shift);
  assert.equal(state(model).node, destination);
}
function mechanisms(model) {
  for (let guard = 0; state(model).activated.length < 3 && guard < 10; guard++) {
    ticks(model, .51);
    const snapshot = state(model), next = snapshot.mechanismOrder.find(id => snapshot.powered.includes(id) && !snapshot.activated.includes(id) && path(model, id));
    assert.ok(next); navigate(model, next);
    if (!state(model).activated.includes(next)) assert.equal(model.interact(), true);
  }
  assert.equal(state(model).activated.length, 3);
}
function finish(model) { mechanisms(model); navigate(model, 'exit'); }
function acquire(template, pair) {
  let seed = 0; while (createRoomPlan(seed)[1].template.id !== template) seed++;
  const model = new GameModel(seed); model.chooseRelic(pair[0]); finish(model); model.chooseRelic(pair[1]); model.drainEvents(); return model;
}
function earnedRecipe(id, template, unlockRoute = true) {
  const pairs = { 'prism-coil': ['prism', 'coil'], 'shadow-weave': ['shadow', 'weave'], 'shell-weave': ['weave', 'shell'] };
  const model = acquire(template, pairs[id]);
  cross(model, 'dew', true);
  if (id === 'prism-coil') {
    cross(model, 'hub'); shift(model, state(model).nodes.find(node => node.id === 'dew').layer); assert.equal(model.useAbility('prism'), true); mechanisms(model);
  } else {
    assert.equal(model.interact(), true);
    if (id === 'shadow-weave') { assert.equal(model.useAbility('shadow'), true); cross(model, 'hub'); assert.equal(model.useAbility('weave'), true); }
    else {
      assert.equal(model.useAbility('weave'), true); mechanisms(model); navigate(model, 'vault'); shift(model, state(model).roomChallenge.entryLayer); assert.equal(model.interact(), true);
      while (state(model).wave) { const wave = state(model).wave; shift(model, wave.safeLayers[0]); ticks(model, wave.remaining); }
      assert.equal(state(model).vaultStatus, 'escaped');
    }
  }
  const route = state(model).hiddenRoutes.find(route => route.id === id); assert.equal(route.eligible, true);
  navigate(model, route.entry); model.drainEvents();
  if (!unlockRoute) return { model, route };
  shift(model, route.sequence[2]); for (const layer of route.sequence) shift(model, layer);
  assert.equal(state(model).hiddenRoutes.find(route => route.id === id).unlocked, true);
  assert.equal(model.drainEvents().filter(event => event.type === 'secret_open').length, 1);
  const holdings = state(model).carried;
  for (let i = 0; i < 3; i++) for (const layer of route.sequence) shift(model, layer);
  assert.equal(state(model).carried, holdings); assert.equal(model.drainEvents().some(event => event.type === 'secret_open' || event.type === 'reward'), false);
  return { model, route };
}
function trial(model) {
  cross(model, 'rift'); const value = state(model).carried; assert.ok(value >= 2);
  assert.equal(model.interact(), true); assert.equal(state(model).carried, value - 2);
  return value - 2;
}
function freshSafe(model) {
  const wave = state(model).wave, safe = wave.safeLayers[0];
  // Always use two real entries; this also tests the already-safe start case.
  shift(model, wave.dangerLayers[0]); shift(model, safe); assert.equal(state(model).wave.entered, true);
}
const report = { baselineRooms: 0, originalSeedLayouts: 0, endpointChecks: 0, cases: [], edgeCases: [] };
for (let seed = 0; seed < 100; seed++) {
  const plans = createRoomPlan(seed), before = previousPlan(seed);
  assert.deepEqual(plans.map(plan => plan.signature), before.map(plan => plan.signature));
  const model = new GameModel(seed); model.chooseRelic('prism');
  for (let roomIndex = 0; roomIndex < 3; roomIndex++) {
    const room = buildRoom(plans[roomIndex], LAYERS), old = previousRoom(before[roomIndex], LAYERS);
    assert.deepEqual(room.nodes.filter(node => node.id !== 'rift'), old.nodes); assert.ok(layoutClearance(room.nodes) >= 1.05); report.originalSeedLayouts++;
    const nodes = new Map(room.nodes.map(node => [node.id, node]));
    for (const edge of [...room.hiddenRoutes.map(route => route.edge), room.rift.exitEdge]) for (const id of [edge.from, edge.to]) { assert.ok(nodes.get(id).anchor || nodes.get(id).layer === edge.layer); report.endpointChecks++; }
    finish(model); assert.equal(state(model).lives, 3); assert.equal(state(model).stats.failures, 0); report.baselineRooms++;
    assert.equal(state(model).phase, roomIndex === 2 ? 'won' : 'interlude'); if (roomIndex < 2) model.chooseRelic('prism');
  }
}
for (const template of ['cascade', 'confluence', 'return', 'split']) for (const id of ['prism-coil', 'shadow-weave', 'shell-weave']) {
  const { model, route } = earnedRecipe(id, template);
  const before = state(model).carried; cross(model, 'rift'); cross(model, route.entry);
  assert.equal(state(model).carried, before + 2);
  cross(model, 'rift'); cross(model, route.entry); assert.equal(state(model).carried, before + 2, 'already claimed directed hidden crossings do not pay twice');
  const paid = trial(model); model.drainEvents();
  for (let step = 1; step <= 3; step++) {
    const wave = state(model).wave; assert.equal(wave.step, step); assert.equal(wave.entered, false); freshSafe(model); ticks(model, wave.remaining);
    if (step < 3) assert.equal(state(model).carried, paid, 'no partial payment');
  }
  assert.equal(state(model).rift.status, 'cleared'); assert.equal(state(model).carried, paid + 9); assert.equal(model.interact(), false);
  const events = model.drainEvents(); assert.equal(events.filter(event => event.type === 'rift_clear').length, 1); assert.equal(events.filter(event => event.type === 'reward' && event.challenge === 'rift').length, 1);
  ticks(model, 1.11); assert.equal(state(model).rift.ascension, 3);
  if (id === 'shadow-weave') { assert.equal(state(model).activated.length, 1); assert.equal(state(model).edges.find(edge => edge.kind === 'ascension').open, false); }
  cross(model, route.entry); mechanisms(model); navigate(model, 'rift'); cross(model, 'exit'); assert.equal(state(model).phase, 'interlude');
  report.cases.push({ template, recipe: id, sequence: route.sequence, reward: 9, baselineGateRetained: true, hiddenRoundTripRepeatReward: 0 });
}
for (const invalid of ['leave-safe', 'gap-after-entry', 'same-layer-gap-bounce', 'second-wave']) {
  const { model, route } = earnedRecipe('shadow-weave', 'return');
  cross(model, 'rift');
  if (invalid === 'same-layer-gap-bounce') shift(model, state(model).rift.sequence[0]);
  assert.equal(model.interact(), true);
  if (invalid === 'second-wave') { freshSafe(model); ticks(model, state(model).wave.remaining); }
  if (invalid === 'same-layer-gap-bounce') { model.setW(.34); shift(model, state(model).wave.safeLayers[0]); assert.equal(state(model).wave.entered, false); }
  else {
    freshSafe(model);
    if (invalid === 'gap-after-entry') model.setW(.34); else shift(model, state(model).wave.dangerLayers[0]);
  }
  model.drainEvents(); ticks(model, state(model).wave.remaining);
  assert.equal(state(model).rift.status, 'failed'); assert.equal(state(model).rift.ascension, 0); assert.equal(state(model).lives, 2);
  assert.equal(state(model).vaultStatus, 'available'); assert.equal(state(model).rift.canStart, false);
  assert.equal(model.drainEvents().some(event => event.type === 'reward' || event.type === 'rift_clear' || event.type === 'ascension'), false);
  cross(model, route.entry); cross(model, 'rift'); assert.equal(model.interact(), false); cross(model, route.entry); finish(model);
  report.edgeCases.push({ case: invalid, failureCount: state(model).stats.failures, returnedAndCompleted: true });
}
{
  const { model } = earnedRecipe('shell-weave', 'return'); const postStake = trial(model); const lives = state(model).lives;
  shift(model, state(model).wave.dangerLayers[0]); ticks(model, state(model).wave.remaining);
  assert.equal(state(model).rift.status, 'failed'); assert.equal(state(model).carried, postStake); assert.equal(state(model).lives, lives); assert.equal(state(model).shieldUses, 0); assert.equal(model.interact(), false);
  report.edgeCases.push({ case: 'shell-does-not-refund-stake', postStakePreserved: true });
}
{
  const { model, route } = earnedRecipe('shadow-weave', 'cascade', false);
  shift(model, route.sequence[2]); shift(model, route.sequence[0]);
  for (let i = 0; i < 20; i++) model.setW(state(model).w);
  ticks(model, 1); model.setW(.34); shift(model, route.sequence[0]);
  assert.equal(state(model).hiddenRoutes.find(item => item.id === route.id).progress, 1);
  assert.equal(model.select('bell'), true); model.setW(state(model).range.center); assert.equal(model.move(), true);
  for (const layer of route.sequence) shift(model, layer);
  assert.equal(state(model).hiddenRoutes.find(item => item.id === route.id).progress, 1);
  model.setW(1); ticks(model, .7); assert.equal(state(model).travel, null);
  assert.equal(state(model).hiddenRoutes.find(item => item.id === route.id).progress, 1);
  const returnedW = state(model).w; for (let i = 0; i < 20; i++) model.setW(returnedW);
  assert.equal(state(model).hiddenRoutes.find(item => item.id === route.id).progress, 1);
  shift(model, route.sequence[1]); shift(model, route.sequence[2]);
  assert.equal(state(model).hiddenRoutes.find(item => item.id === route.id).unlocked, true);
  report.edgeCases.push({ case: 'retained-seals-still-require-fresh-entries', travelAndFailureReplay: false });
}
{
  const { model } = earnedRecipe('shadow-weave', 'split'); trial(model);
  freshSafe(model); const safe = state(model).wave.safeLayers[0]; model.setW(.34); shift(model, safe);
  ticks(model, state(model).wave.remaining); assert.equal(state(model).wave.step, 2);
  report.edgeCases.push({ case: 'earned-entry-can-recover-to-safe-before-deadline', nextStep: 2 });
}
report.simulationTicks = simulationTicks;
console.log(JSON.stringify(report, null, 2));
