import assert from 'node:assert/strict';
import { GameModel } from '../src/model.js';
export function start(relic = 'prism', seed = 102) { const model = new GameModel(seed); assert.equal(model.chooseRelic(relic), true); model.drainEvents(); return model; }
export function advance(model, seconds, track = false, dt = track ? 1 / 60 : .1) {
  for (let t = 0; t < seconds - 1e-9; t += dt) {
    if (track && model.snapshot().travel) model.setW(model.snapshot().range.center);
    model.update(Math.min(dt, seconds - t));
  }
}
export function travel(model, target, risky = false) {
  assert.equal(model.setRisk(risky), true);
  assert.equal(model.select(target), true, `route ${model.snapshot().roomId}:${model.snapshot().node}→${target} is open`);
  assert.equal(model.setW(model.snapshot().range.center), true);
  assert.equal(model.move(), true, `route to ${target} supports its source and layer`);
  advance(model, risky ? 2.51 : 1.36, risky);
  assert.equal(model.snapshot().node, target); assert.equal(model.snapshot().travel, null);
}
function sameXYZ(a, b) { return ['x', 'y', 'z'].every(axis => a.world[axis] === b.world[axis]); }
export function pathTo(state, target) {
  const nodes = new Map(state.nodes.map(node => [node.id, node]));
  const queue = [{ id: state.node, path: [] }], visited = new Set([state.node]);
  while (queue.length) {
    const { id, path } = queue.shift();
    if (id === target) return path;
    const steps = state.edges.filter(edge => edge.open && (edge.from === id || edge.to === id)).map(edge => ({ kind: 'move', id: edge.from === id ? edge.to : edge.from, layer: edge.layer }));
    if (!nodes.get(id).anchor) for (const node of nodes.values()) if (!node.anchor && node.id !== id && sameXYZ(node, nodes.get(id))) steps.push({ kind: 'shift', id: node.id, layer: node.layer });
    for (const step of steps) if (!visited.has(step.id)) { visited.add(step.id); queue.push({ id: step.id, path: [...path, step] }); }
  }
  return null;
}
export function reach(model, target) {
  const path = pathTo(model.snapshot(), target);
  assert.ok(path, `reachable ${model.snapshot().roomId}:${model.snapshot().node}→${target}`);
  for (const step of path) {
    if (step.kind === 'move') travel(model, step.id);
    else { model.setW(model.snapshot().layers[step.layer].center); assert.equal(model.snapshot().node, step.id); }
  }
}
export function activateAll(model) {
  for (let i = 0; i < 3; i++) {
    const state = model.snapshot();
    const target = state.mechanismOrder.find(id => !state.activated.includes(id) && state.powered.includes(id) && pathTo(state, id));
    if (!target) { assert.equal(state.activated.length, 3); break; }
    reach(model, target); assert.equal(model.interact(), true); advance(model, .51);
  }
  assert.equal(model.snapshot().activated.length, 3);
}
export function finishRoom(model) { activateAll(model); reach(model, 'exit'); }
export function openVault(model) { activateAll(model); reach(model, 'hub'); reach(model, 'vault'); assert.equal(model.interact(), true); }
export function escapeWave(model) { while (model.snapshot().wave) { const wave = model.snapshot().wave; model.setW(model.snapshot().layers[wave.safeLayers[0]].center); advance(model, wave.remaining + .001); } }
export function fall(model, target = model.snapshot().availableNodes[0]) { model.setRisk(false); assert.equal(model.select(target), true); model.setW(model.snapshot().range.center); assert.equal(model.move(), true); model.setW(1); advance(model, .7); assert.equal(model.snapshot().travel, null); }
export function seedFor(template, challenge) { for (let seed = 0; seed < 10000; seed++) { const state = new GameModel(seed).snapshot(); if (state.roomId === template && (!challenge || state.roomChallenge.variant === challenge)) return seed; } throw new Error('seed not found'); }
