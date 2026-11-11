import test from 'node:test';
import assert from 'node:assert/strict';
import { GameModel, LAYERS } from '../src/model.js';
import { ALL_ROOM_TEMPLATES, createRoomPlan, buildRoom, ferryPosition } from '../src/rooms.js';
import { planLayerRoute, findCurrentLayerRoute } from '../src/progressive-onboarding.js';
import { start, advance, travel, escapeWave, finishRoom, seedFor } from './model-helpers.js';

const EXPECTED_DOCKS = {
  cascade: ['bell', 'bloom'], confluence: ['dew', 'bloom'], return: ['dew', 'bell'],
  split: ['bell', 'bloom'], triad: ['dew', 'relay'], interlock: ['dew', 'bloom'], sanctum: ['bell', 'bloom'],
};

function trackClearance(room) {
  const { p0, c, p1 } = room.ferry.track;
  let minimum = Infinity;
  for (const t of [0, .25, .5, .75, 1]) {
    const s = 1 - t;
    const x = s * s * p0.x + 2 * s * t * c.x + t * t * p1.x;
    const y = s * s * p0.y + 2 * s * t * c.y + t * t * p1.y;
    for (const node of room.nodes) {
      const width = 44 + (node.id === 'hub' ? 112 : 81);
      const height = 26 + (node.id === 'hub' ? 60 : 52);
      minimum = Math.min(minimum, Math.hypot((x - node.x) / width, (y - node.y) / height));
    }
  }
  return minimum;
}

// Routes used by the solvers below exclude ferry edges; assertions run inside.
function assertNoFerrySteps(plan, state, targetId) {
  if (!plan || state.node === 'ferry' || targetId === 'ferry') return;
  for (const step of plan.steps || plan) {
    assert.ok(!/^ferry-/.test(step.edgeId || ''), `route used ferry edge ${step.edgeId}`);
    assert.notEqual(step.to, 'ferry');
    assert.notEqual(step.from, 'ferry');
  }
}

function walkRoute(model, targetId, { finalLayer = null } = {}) {
  let guard = 0;
  while (guard++ < 40) {
    const s = model.snapshot();
    if (s.wave) escapeWave(model);
    const cur = model.snapshot();
    if (cur.node === targetId && (finalLayer === null || cur.layer === finalLayer)) return;
    const plan = planLayerRoute(cur, targetId, { finalLayer });
    assert.ok(plan, `route ${cur.roomId}:${cur.node}@${cur.layer}→${targetId}`);
    assertNoFerrySteps(plan, cur, targetId);
    if (plan.walk.length) {
      for (const step of plan.walk) { model.setW(LAYERS[step.layer].center); travel(model, step.to); }
    } else if (plan.shift) {
      model.setW(LAYERS[plan.shift.layer].center);
      advance(model, .02);
    } else break;
  }
  assert.equal(model.snapshot().node, targetId);
}

function solveRoom(model) {
  let guard = 0;
  while (guard++ < 30) {
    const s = model.snapshot();
    if (s.wave) { escapeWave(model); advance(model, 1.15); continue; }
    if (s.activated.length >= s.mechanismOrder.length) { walkRoute(model, 'exit'); return; }
    const next = s.mechanismOrder.find(id => s.powered.includes(id) && !s.activated.includes(id));
    assert.ok(next, `expected powered mechanism in ${s.roomId}`);
    walkRoute(model, next, { finalLayer: s.nodes.find(n => n.id === next).layer });
    if (!model.snapshot().activated.includes(next)) assert.equal(model.interact(), true, `activate ${next} in ${s.roomId}`);
    advance(model, .55);
    if (model.snapshot().wave) { escapeWave(model); advance(model, 1.15); }
  }
  assert.fail('solve guard exceeded');
}

// BFS where each node's open edges are re-evaluated from that node, so escape
// gates open exactly when the player would stand on their authored side.
function openNeighbors(model, id) {
  const saved = model.node;
  model.node = id;
  const edges = model._edges().filter(edge => edge.open);
  model.node = saved;
  const out = [];
  for (const edge of edges) {
    if (edge.from === id) out.push(edge.to);
    else if (edge.to === id) out.push(edge.from);
  }
  return out;
}
function canReturnToHub(model, from) {
  const queue = [from], seen = new Set([from]);
  while (queue.length) {
    const id = queue.shift();
    if (id === 'hub') return true;
    for (const next of openNeighbors(model, id)) if (!seen.has(next)) { seen.add(next); queue.push(next); }
  }
  return false;
}

test('ferry exists from room 1 by default, and ferryFromRoom controls first appearance', () => {
  const plain = new GameModel(7);
  assert.equal(plain.chooseRelic('shell'), true);
  assert.equal(plain.snapshot().ferry, null);
  assert.equal(plain.snapshot().nodes.some(node => node.id === 'ferry'), false);
  assert.equal(plain.snapshot().edges.some(edge => edge.kind === 'ferry'), false);
  finishRoom(plain);
  assert.equal(plain.snapshot().phase, 'interlude');
  plain.chooseRelic('shell');
  assert.ok(plain.snapshot().ferry, 'ferry appears from room 1');
  assert.ok(plain.snapshot().nodes.some(node => node.id === 'ferry' && node.anchor && node.kind === 'ferry'));

  const early = new GameModel(7, { ferryFromRoom: 0 });
  assert.equal(early.chooseRelic('shell'), true);
  assert.ok(early.snapshot().ferry, 'ferryFromRoom:0 puts the ferry in the first courtyard');
  early.restart(11, { ferryFromRoom: 0 });
  assert.ok(early.snapshot().ferry, 'restart honors the option');
  early.restart(13);
  assert.ok(early.snapshot().ferry, 'the option persists across restarts like mode');
});

test('every template builds a ferry track between two different dock layers', () => {
  for (const template of ALL_ROOM_TEMPLATES) {
    assert.deepEqual([template.ferry.a, template.ferry.b], EXPECTED_DOCKS[template.id], `${template.id} docks`);
  }
  const plansByTemplate = new Map();
  for (let seed = 1; seed < 400; seed++) {
    for (const plan of createRoomPlan(seed, { mode: 'expedition' })) {
      const list = plansByTemplate.get(plan.template.id) || [];
      if (list.length < 3 && !list.some(item => item.signature === plan.signature)) list.push(plan);
      plansByTemplate.set(plan.template.id, list);
    }
    if (ALL_ROOM_TEMPLATES.every(template => (plansByTemplate.get(template.id) || []).length >= 3)) break;
  }
  assert.equal(plansByTemplate.size, 7);
  const minimumByTemplate = {};
  for (const [id, plans] of plansByTemplate) {
    for (const plan of plans) {
      const room = buildRoom(plan, LAYERS);
      const ferry = room.ferry;
      assert.ok(ferry, `${plan.signature} has a ferry track`);
      assert.notEqual(ferry.layerA, ferry.layerB, `${plan.signature} dock layers differ`);
      assert.equal(ferry.centerA, LAYERS[ferry.layerA].center);
      assert.equal(ferry.centerB, LAYERS[ferry.layerB].center);
      const pos0 = ferryPosition(ferry, ferry.centerA);
      const pos1 = ferryPosition(ferry, ferry.centerB);
      assert.equal(pos0.u, 0); assert.equal(pos1.u, 1);
      assert.equal(pos0.x, ferry.track.p0.x); assert.equal(pos0.y, ferry.track.p0.y);
      assert.equal(pos1.x, ferry.track.p1.x); assert.equal(pos1.y, ferry.track.p1.y);
      let prev = null;
      for (let i = 0; i <= 40; i++) {
        const w = ferry.centerA + (ferry.centerB - ferry.centerA) * (i / 40);
        const pos = ferryPosition(ferry, w);
        if (prev) {
          assert.ok(pos.u >= prev.u - 1e-12, `${plan.signature} u monotone`);
          assert.ok(Math.hypot(pos.x - prev.x, pos.y - prev.y) < 60, `${plan.signature} continuous`);
        }
        prev = pos;
      }
      for (const w of [.18, .4, .5, .66, .82]) {
        const near = ferryPosition(ferry, w + 1e-4);
        const at = ferryPosition(ferry, w);
        assert.ok(Math.hypot(near.x - at.x, near.y - at.y) < .5, `${plan.signature} small dw → small dxy`);
      }
      const clearance = trackClearance(room);
      minimumByTemplate[id] = Math.min(minimumByTemplate[id] ?? Infinity, clearance);
      assert.ok(clearance > .6, `${plan.signature} track clearance ${clearance.toFixed(3)} > .6`);
    }
  }
  for (const id of Object.keys(minimumByTemplate).sort()) {
    console.log(`ferry track clearance ${id}: ${minimumByTemplate[id].toFixed(3)}`);
  }
});

test('boarding and leaving the ferry only works while W sits in the dock layer', () => {
  const model = new GameModel(seedFor('confluence'), { ferryFromRoom: 0 });
  assert.equal(model.chooseRelic('shell'), true);
  const ferry = model.snapshot().ferry;
  assert.deepEqual([ferry.a, ferry.b], ['dew', 'bloom']);
  const [edgeA, edgeB] = [model.snapshot().edges.find(e => e.id === 'ferry-a'), model.snapshot().edges.find(e => e.id === 'ferry-b')];
  assert.equal(edgeA.layer, ferry.layerA); assert.equal(edgeB.layer, ferry.layerB);
  travel(model, 'dew');
  const dockedA = { x: model.snapshot().ferry.x, y: model.snapshot().ferry.y };
  assert.equal(model.snapshot().ferry.docked, 'a');
  travel(model, 'ferry');
  assert.equal(model.snapshot().node, 'ferry');
  assert.equal(model.snapshot().lastAnchor, 'ferry');
  assert.equal(model.interact(), false);
  assert.equal(model.snapshot().interactLabel, '摆渡星舟 · 跨层支撑');
  assert.equal(model.select('bloom'), true);
  assert.equal(model.move(), false, 'still in dock layer A: cannot leave toward B');
  assert.equal(model.scrubW(ferry.centerB), ferry.centerB);
  assert.equal(model.snapshot().ferry.docked, 'b');
  assert.equal(model.move(), true);
  advance(model, 1.36);
  assert.equal(model.snapshot().node, 'bloom');
  const end = model.snapshot().ferry;
  assert.equal(end.u, 1);
  assert.ok(Math.hypot(end.x - dockedA.x, end.y - dockedA.y) > 1, 'ferry moved between docks');
});

test('scrubW clamps only where standing support is conditional', () => {
  const model = start('shell', seedFor('confluence'));
  travel(model, 'dew');
  const center = model._node('dew').center;
  assert.ok(Math.abs(model.scrubW(0) - (center - .13)) < 1e-9);
  assert.ok(Math.abs(model.scrubW(1) - (center + .13)) < 1e-9);
  advance(model, 2);
  assert.equal(model.snapshot().phaseStability, 1);

  const crossing = start('shell', seedFor('confluence'));
  assert.equal(crossing.select('dew'), true);
  crossing.setW(crossing.snapshot().range.center);
  assert.equal(crossing.move(), true);
  const band = crossing.snapshot().range;
  assert.ok(Math.abs(crossing.scrubW(0) - band.min) < 1e-9);
  assert.ok(Math.abs(crossing.scrubW(1) - band.max) < 1e-9);
  advance(crossing, 1.36);
  assert.equal(crossing.snapshot().node, 'dew', 'clamped scrub still lands the crossing');

  const anchor = start('shell');
  assert.equal(anchor.scrubW(.03), .03);
  assert.equal(anchor.scrubW(.97), .97);

  const risky = start('shell', seedFor('confluence'));
  risky.setRisk(true);
  assert.equal(risky.select('dew'), true);
  risky.setW(risky.snapshot().range.center);
  assert.equal(risky.move(), true);
  assert.equal(risky.scrubW(.42), .42, 'risky crossing keeps manual W control');

  const wave = start('shell');
  wave.wave = { node: 'vault', layer: 0, dangerLayers: [0], safeLayers: [1, 2], remaining: 5, duration: 5, step: 1, steps: 1, variant: 'single' };
  assert.equal(wave.scrubW(.61), .61, 'waves keep manual W control');

  const ferryRide = new GameModel(seedFor('confluence'), { ferryFromRoom: 0 });
  assert.equal(ferryRide.chooseRelic('shell'), true);
  travel(ferryRide, 'dew');
  travel(ferryRide, 'ferry');
  assert.equal(ferryRide.scrubW(.31), .31, 'the ferry itself is an anchor: unclamped');
});

test('every expedition room stays completable without ferry edges and docks never strand the player', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 30; seed++) {
    const plan = createRoomPlan(seed, { mode: 'expedition' });
    const model = new GameModel(seed, { mode: 'expedition', ferryFromRoom: 0 });
    assert.equal(model.chooseRelic('shell'), true);
    for (let roomIndex = 0; roomIndex < plan.length; roomIndex++) {
      model.room = roomIndex;
      model._setupRoom();
      model.phase = 'playing';
      model.drainEvents();
      const s0 = model.snapshot();
      seen.add(s0.roomId);
      assert.ok(s0.ferry, `${s0.roomId}#${roomIndex} has a ferry`);
      for (const dock of [s0.ferry.a, s0.ferry.b]) {
        assert.ok(canReturnToHub(model, dock), `${s0.roomId}: ${dock} can return to hub at zero activations`);
      }
      const suggested = model._nextRoute();
      if (suggested) for (const step of suggested) assert.notEqual(step.to, 'ferry', `${s0.roomId} never suggests the ferry`);
      for (const route of [findCurrentLayerRoute(s0, 'exit'), planLayerRoute(s0, 'exit')]) {
        if (route) for (const step of route.steps || route) {
          assert.notEqual(step.to, 'ferry');
          assert.ok(!/^ferry-/.test(step.edgeId || ''));
        }
      }
      solveRoom(model);
      assert.ok(['interlude', 'won'].includes(model.snapshot().phase), `${s0.roomId} completed`);
    }
  }
  assert.deepEqual([...seen].sort(), ALL_ROOM_TEMPLATES.map(template => template.id).sort(), 'all 7 templates covered');
});
