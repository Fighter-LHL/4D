import test from 'node:test';
import assert from 'node:assert/strict';
import { GameModel, LAYERS } from '../src/model.js';
import {
  createRoomPlan,
  buildRoom,
  layoutClearance,
  ALL_ROOM_TEMPLATES,
  HIDDEN_ROUTE_RECIPES,
  EXPEDITION_CHALLENGES,
} from '../src/rooms.js';
import { CURIOSITY_CATALOG } from '../src/exploration-radar.js';
import { CodexStore } from '../src/codex.js';
import { SceneRenderer } from '../src/scene.js';
import { planLayerRoute } from '../src/progressive-onboarding.js';
import { advance, travel, reach, escapeWave } from './model-helpers.js';

function createMemoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(k, String(v)); },
    removeItem(k) { map.delete(k); },
    clear() { map.clear(); },
  };
}

function createFiniteScene() {
  const calls = [];
  const finite = value => {
    if (typeof value === 'number') assert.ok(Number.isFinite(value), `non-finite canvas value: ${value}`);
    if (Array.isArray(value)) value.forEach(finite);
  };
  const context = new Proxy({}, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'measureText') return text => ({ width: String(text).length * 11 });
      if (key === 'createLinearGradient' || key === 'createRadialGradient') {
        return (...args) => { args.forEach(finite); return { addColorStop() {} }; };
      }
      return (...args) => { args.forEach(finite); calls.push({ method: key, args }); };
    },
    set(target, key, value) { finite(value); target[key] = value; return true; },
  });
  globalThis.window = {
    devicePixelRatio: 1,
    addEventListener() {},
    removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  };
  const canvas = {
    style: {},
    getContext: () => context,
    getBoundingClientRect: () => ({ width: 1000, height: 650, left: 0, top: 0 }),
    addEventListener() {},
    removeEventListener() {},
  };
  const renderer = new SceneRenderer(canvas);
  renderer.visualGuide = true;
  return { renderer, calls };
}

function walkPlannedRoute(model, targetId, { finalLayer = null } = {}) {
  let guard = 0;
  let crossings = 0;
  while (guard++ < 40) {
    const s = model.snapshot();
    if (s.wave) escapeWave(model);
    const cur = model.snapshot();
    if (cur.node === targetId && (finalLayer === null || cur.layer === finalLayer)) return crossings;
    const plan = planLayerRoute(cur, targetId, { finalLayer });
    assert.ok(plan, `expected route from ${cur.node}@${cur.layer} to ${targetId} in ${cur.roomId}`);
    if (plan.walk.length) {
      for (const step of plan.walk) {
        model.setW(LAYERS[step.layer].center);
        travel(model, step.to);
        crossings += 1;
      }
    } else if (plan.shift) {
      model.setW(LAYERS[plan.shift.layer].center);
      advance(model, 0.02);
    } else {
      break;
    }
  }
  assert.equal(model.snapshot().node, targetId);
  return crossings;
}

function solveAnyCourtyard(model) {
  let guard = 0;
  while (guard++ < 30) {
    const s = model.snapshot();
    if (s.wave) {
      escapeWave(model);
      advance(model, 1.15);
      continue;
    }
    const order = s.mechanismOrder;
    if (s.activated.length >= order.length) {
      walkPlannedRoute(model, 'exit');
      return;
    }
    const nextMech = order.find(id => {
      const n = s.nodes.find(item => item.id === id);
      return n && n.powered && !s.activated.includes(id);
    });
    assert.ok(nextMech, `expected powered unlit mechanism in ${s.roomId}, activated=${s.activated}`);
    const targetNode = s.nodes.find(n => n.id === nextMech);
    walkPlannedRoute(model, nextMech, { finalLayer: targetNode.layer });
    if (!model.snapshot().activated.includes(nextMech)) {
      assert.equal(model.interact(), true, `activating ${nextMech} in ${s.roomId}`);
    }
    advance(model, 0.55);
    if (model.snapshot().wave) {
      escapeWave(model);
      advance(model, 1.15);
    }
  }
  assert.fail('exceeded courtyard solve guard');
}

function seedWithExpeditionRoom(templateId, challengeVariant = null) {
  for (let seed = 1; seed < 5000; seed++) {
    const plan = createRoomPlan(seed, { mode: 'expedition' });
    const idx = plan.findIndex(p => p.template.id === templateId && (!challengeVariant || p.challenge.variant === challengeVariant));
    if (idx !== -1) return { seed, roomIndex: idx };
  }
  throw new Error(`No expedition seed found for ${templateId} / ${challengeVariant}`);
}

function advanceToRoom(seed, roomIndex, relic = 'shell', mode = 'expedition') {
  const model = new GameModel(seed, { mode });
  model.chooseRelic(relic);
  for (let i = 0; i < roomIndex; i++) {
    solveAnyCourtyard(model);
    assert.equal(model.snapshot().phase, 'interlude');
    model.chooseRelic(relic);
  }
  model.drainEvents();
  return model;
}

test('expedition room plan builds 5 progressive non-repeating courtyards with valid geometry and zero intro seed drift', () => {
  assert.equal(ALL_ROOM_TEMPLATES.length, 7);
  assert.equal(EXPEDITION_CHALLENGES.length, 5);
  assert.equal(HIDDEN_ROUTE_RECIPES.length, 10);
  assert.equal(CURIOSITY_CATALOG.length, 12);

  for (let seed = 0; seed < 60; seed++) {
    const introDefault = createRoomPlan(seed);
    const introExplicit = createRoomPlan(seed, { mode: 'intro' });
    assert.deepEqual(
      introDefault.map(p => [p.template.id, p.challenge.variant, p.rotation, p.mirror, p.mapping]),
      introExplicit.map(p => [p.template.id, p.challenge.variant, p.rotation, p.mirror, p.mapping])
    );
    assert.equal(introDefault.length, 3);

    const exp = createRoomPlan(seed, { mode: 'expedition' });
    assert.equal(exp.length, 5);
    const ids = exp.map(p => p.template.id);
    assert.equal(new Set(ids).size, 5, 'all 5 rooms in an expedition are distinct');
    assert.ok(['cascade', 'split', 'return', 'confluence'].includes(ids[0]));
    assert.ok(['cascade', 'split', 'return', 'confluence'].includes(ids[1]));
    assert.deepEqual(new Set([ids[2], ids[3]]), new Set(['triad', 'interlock']));
    assert.equal(ids[4], 'sanctum');

    const chVariants = exp.map(p => p.challenge.variant);
    assert.equal(new Set(chVariants).size, 5, 'all 5 expedition vault challenges are distinct');

    for (const plan of exp) {
      const room = buildRoom(plan, LAYERS);
      assert.ok(layoutClearance(room.nodes) >= 1.05, `${plan.signature} clearance`);
      const nodeMap = new Map(room.nodes.map(n => [n.id, n]));
      const allEdges = [
        ...room.edges,
        ...room.shadows.map(s => s.edge),
        ...room.weaves.map(w => w.edge),
        room.resonance,
        ...room.hiddenRoutes.map(r => r.edge),
        room.rift.exitEdge,
        ...(room.sanctum ? [room.sanctum.exitEdge] : []),
      ];
      assert.equal(new Set(allEdges.map(e => e.id)).size, allEdges.length, `${plan.signature} unique edge IDs`);
      for (const edge of allEdges) {
        for (const endId of [edge.from, edge.to]) {
          const n = nodeMap.get(endId);
          assert.ok(n, `${plan.signature} missing endpoint ${endId}`);
          // crown crystallizes into an anchor before sanctum-crown-exit opens
          assert.ok(n.anchor || endId === 'crown' || n.layer === edge.layer, `${plan.signature}: ${edge.id} -> ${endId}`);
        }
      }
    }
  }
});

test('triad (三叠同位庭) stacks 3 mechanisms at identical XYZ with jump-supply dew -> bloom -> bell', () => {
  const { seed, roomIndex } = seedWithExpeditionRoom('triad');
  const model = advanceToRoom(seed, roomIndex);
  const s0 = model.snapshot();
  assert.equal(s0.roomId, 'triad');

  const dew = s0.nodes.find(n => n.id === 'dew');
  const bell = s0.nodes.find(n => n.id === 'bell');
  const bloom = s0.nodes.find(n => n.id === 'bloom');
  assert.ok(Math.hypot(dew.world.x - bell.world.x, dew.world.y - bell.world.y, dew.world.z - bell.world.z) < 1e-6);
  assert.ok(Math.hypot(dew.world.x - bloom.world.x, dew.world.y - bloom.world.y, dew.world.z - bloom.world.z) < 1e-6);
  assert.equal(new Set([dew.layer, bell.layer, bloom.layer]).size, 3);

  // 1. Walk to dew and activate -> powers bloom (skipping bell!)
  walkPlannedRoute(model, 'dew', { finalLayer: dew.layer });
  assert.equal(model.interact(), true);
  advance(model, 0.55);
  assert.ok(model.snapshot().powered.includes('bloom'));
  assert.equal(model.snapshot().powered.includes('bell'), false);

  // 2. Shift W in-place directly from dew -> bloom (zero bridge walking!)
  model.setW(LAYERS[bloom.layer].center);
  assert.equal(model.snapshot().node, 'bloom');
  assert.equal(model.interact(), true);
  advance(model, 0.55);
  assert.ok(model.snapshot().powered.includes('bell'));

  // 3. Shift W in-place directly from bloom -> bell and finish room
  model.setW(LAYERS[bell.layer].center);
  assert.equal(model.snapshot().node, 'bell');
  assert.equal(model.interact(), true);
  advance(model, 0.55);
  assert.equal(model.snapshot().nodes.find(n => n.id === 'exit').locked, false);
  walkPlannedRoute(model, 'exit');
  assert.equal(model.snapshot().phase, 'interlude');
});

test('interlock (相位换向庭) rewards smart bloom-first order in fewer moves and never softlocks naive dew-first order', () => {
  const { seed, roomIndex } = seedWithExpeditionRoom('interlock');

  // A. Smart order: bloom first via hub-bloom phaseSwap bridge, then dew -> bell -> relay -> exit
  const smart = advanceToRoom(seed, roomIndex);
  const swapEdgeBefore = smart.snapshot().edges.find(e => e.id === 'hub-bloom');
  assert.equal(swapEdgeBefore.phaseSwap, true);
  assert.equal(swapEdgeBefore.open, true);
  assert.equal(smart.snapshot().edges.find(e => e.id === 'hub-relay').open, false);

  const bloomLayer = smart.snapshot().nodes.find(n => n.id === 'bloom').layer;
  const dewLayer = smart.snapshot().nodes.find(n => n.id === 'dew').layer;
  const bellLayer = smart.snapshot().nodes.find(n => n.id === 'bell').layer;

  let smartMoves = 0;
  smartMoves += walkPlannedRoute(smart, 'bloom', { finalLayer: bloomLayer });
  assert.equal(smart.interact(), true);
  advance(smart, 0.55);
  smartMoves += walkPlannedRoute(smart, 'dew', { finalLayer: dewLayer });
  assert.equal(smart.interact(), true);
  advance(smart, 0.55);
  // Phase-swap: hub-bloom closes, hub-relay & relay-bloom open!
  assert.equal(smart.snapshot().edges.find(e => e.id === 'hub-bloom').open, false);
  assert.equal(smart.snapshot().edges.find(e => e.id === 'hub-relay').open, true);
  smart.setW(LAYERS[bellLayer].center);
  assert.equal(smart.interact(), true);
  advance(smart, 0.55);
  smartMoves += walkPlannedRoute(smart, 'exit');
  assert.equal(smart.snapshot().phase, 'interlude');

  // B. Naive order: light dew first -> hub-bloom closes, detour via hub -> relay -> bloom still solves cleanly
  const naive = advanceToRoom(seed, roomIndex);
  let naiveMoves = 0;
  naiveMoves += walkPlannedRoute(naive, 'dew', { finalLayer: dewLayer });
  assert.equal(naive.interact(), true);
  advance(naive, 0.55);
  assert.equal(naive.snapshot().edges.find(e => e.id === 'hub-bloom').open, false);
  assert.equal(naive.snapshot().edges.find(e => e.id === 'relay-bloom').open, true);
  naiveMoves += walkPlannedRoute(naive, 'bloom', { finalLayer: bloomLayer });
  assert.equal(naive.interact(), true);
  advance(naive, 0.55);
  naiveMoves += walkPlannedRoute(naive, 'bell', { finalLayer: bellLayer });
  assert.equal(naive.interact(), true);
  advance(naive, 0.55);
  naiveMoves += walkPlannedRoute(naive, 'exit');
  assert.equal(naive.snapshot().phase, 'interlude');
  assert.ok(smartMoves < naiveMoves, `smart order (${smartMoves} moves) beats naive order (${naiveMoves} moves)`);
});

test('sanctum (四象升维圣殿) requires 4 mechanisms, crystallizes crown anchor, and handles both choir win and fail cleanly', () => {
  const { seed } = seedWithExpeditionRoom('sanctum');

  // Case 1: Clear 3-wave Sanctum Crown Choir -> +8 echoes & golden crown->exit skybridge
  const winRun = advanceToRoom(seed, 4);
  const s0 = winRun.snapshot();
  assert.equal(s0.roomId, 'sanctum');
  assert.deepEqual(s0.mechanismOrder, ['dew', 'bell', 'bloom', 'crown']);

  for (const id of ['dew', 'bell', 'bloom']) {
    const layer = winRun.snapshot().nodes.find(n => n.id === id).layer;
    walkPlannedRoute(winRun, id, { finalLayer: layer });
    assert.equal(winRun.interact(), true);
    advance(winRun, 0.55);
  }
  assert.equal(winRun.snapshot().activated.length, 3);
  assert.equal(winRun.snapshot().nodes.find(n => n.id === 'exit').locked, true, 'exit remains locked at 3/4 in sanctum');

  const crownLayer = winRun.snapshot().nodes.find(n => n.id === 'crown').layer;
  winRun.setW(LAYERS[crownLayer].center);
  assert.equal(winRun.snapshot().node, 'crown');
  const carriedBeforeChoir = winRun.snapshot().carried;
  assert.equal(winRun.interact(), true);

  const duringChoir = winRun.snapshot();
  assert.equal(duringChoir.nodes.find(n => n.id === 'crown').anchor, true, 'crown crystallizes into cross-layer anchor');
  assert.equal(duringChoir.wave?.variant, 'sanctum');
  assert.equal(duringChoir.wave?.steps, 3);
  assert.equal(duringChoir.sanctum?.status, 'warning');

  escapeWave(winRun);
  advance(winRun, 1.05);
  const afterChoir = winRun.snapshot();
  assert.equal(afterChoir.sanctum?.status, 'cleared');
  assert.equal(afterChoir.carried, carriedBeforeChoir + 8, '+8 sanctum choir reward');
  const skybridge = afterChoir.edges.find(e => e.id === 'sanctum-crown-exit');
  assert.ok(skybridge?.open, 'golden skybridge opens from crown straight to exit');
  winRun.setW(LAYERS[skybridge.layer].center);
  travel(winRun, 'exit');
  assert.equal(winRun.snapshot().phase, 'won');

  // Case 2: Fail Sanctum Crown Choir -> costs shield/life, skybridge stays closed, normal relay->exit still wins
  const failRun = advanceToRoom(seed, 4);
  for (const id of ['dew', 'bell', 'bloom']) {
    const layer = failRun.snapshot().nodes.find(n => n.id === id).layer;
    walkPlannedRoute(failRun, id, { finalLayer: layer });
    failRun.interact();
    advance(failRun, 0.55);
  }
  const fCrownLayer = failRun.snapshot().nodes.find(n => n.id === 'crown').layer;
  failRun.setW(LAYERS[fCrownLayer].center);
  failRun.interact();
  const dangerLayer = failRun.snapshot().wave.dangerLayers[0];
  failRun.setW(LAYERS[dangerLayer].center);
  advance(failRun, 2.5);
  const afterFail = failRun.snapshot();
  assert.equal(afterFail.sanctum?.status, 'failed');
  assert.equal(afterFail.nodes.find(n => n.id === 'crown').anchor, true, 'crown stays anchored even if choir fails');
  assert.equal(Boolean(afterFail.edges.find(e => e.id === 'sanctum-crown-exit')?.open), false);
  assert.equal(afterFail.nodes.find(n => n.id === 'exit').locked, false, 'normal exit gate is still unlocked');
  walkPlannedRoute(failRun, 'exit');
  assert.equal(failRun.snapshot().phase, 'won');
});

test('30 full 5-room expedition seeds are 100% solvable from start to sanctum victory', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const model = new GameModel(seed, { mode: 'expedition' });
    model.chooseRelic('shell');
    for (let r = 0; r < 5; r++) {
      solveAnyCourtyard(model);
      if (r < 4) {
        assert.equal(model.snapshot().phase, 'interlude');
        model.chooseRelic('shell');
      }
    }
    assert.equal(model.snapshot().phase, 'won', `expedition seed ${seed} won`);
  }
});

test('new expedition vault challenges cascade_wave and shift_lock run multi-step dodges and award +7 echoes', () => {
  for (const variant of ['cascade_wave', 'shift_lock']) {
    const { seed, roomIndex } = seedWithExpeditionRoom('cascade', variant);
    const model = advanceToRoom(seed, roomIndex);
    const s = model.snapshot();
    assert.equal(s.roomChallenge.variant, variant);
    assert.equal(s.roomChallenge.reward, 7);

    // Activate mechanisms until vault unlocks
    for (const id of s.mechanismOrder) {
      if (!model.snapshot().nodes.find(n => n.id === 'vault').locked) break;
      const layer = model.snapshot().nodes.find(n => n.id === id).layer;
      walkPlannedRoute(model, id, { finalLayer: layer });
      model.interact();
      advance(model, 0.55);
    }
    const entryLayer = model.snapshot().roomChallenge.entryLayer;
    walkPlannedRoute(model, 'vault', { finalLayer: entryLayer });
    const carriedBefore = model.snapshot().carried;
    assert.equal(model.interact(), true);
    assert.equal(model.snapshot().wave.variant, variant);
    assert.equal(model.snapshot().wave.steps, variant === 'cascade_wave' ? 3 : 2);
    escapeWave(model);
    assert.equal(model.snapshot().vaultStatus, 'escaped');
    assert.equal(model.snapshot().carried, carriedBefore + 7);
  }
});

test('all 10 dual-relic secret routes earn eligibility through gameplay and unlock the hidden rift', () => {
  const triggerScenario = (id) => {
    const m = new GameModel(42, { mode: 'expedition' });
    const [r1, r2] = id.split('-').map(part => ({ prism: 'prism', coil: 'coil', shadow: 'shadow', weave: 'weave', shell: 'shell' }[part]));
    m.chooseRelic(r1);
    solveAnyCourtyard(m);
    m.chooseRelic(r2);
    m.drainEvents();

    const dewLayer = m.snapshot().nodes.find(n => n.id === 'dew').layer;
    const ensureCoilArmed = () => {
      while (!m.snapshot().coilArmed.length) {
        const root = m.snapshot().mechanismOrder.find(mid => {
          const n = m.snapshot().nodes.find(x => x.id === mid);
          return n.powered && !m.snapshot().activated.includes(mid);
        });
        assert.ok(root, 'expected root mechanism to arm downstream coil');
        const rl = m.snapshot().nodes.find(n => n.id === root).layer;
        walkPlannedRoute(m, root, { finalLayer: rl });
        m.interact();
        advance(m, 0.55);
      }
    };

    if (id === 'prism-coil') {
      m.setW(LAYERS[dewLayer].center);
      travel(m, 'dew', true);
      travel(m, 'hub');
      m.setW(LAYERS[dewLayer].center);
      assert.equal(m.useAbility('prism'), true);
    } else if (id === 'shadow-weave') {
      m.setW(LAYERS[dewLayer].center);
      travel(m, 'dew', true);
      m.interact();
      assert.equal(m.useAbility('shadow'), true);
      travel(m, 'hub');
      assert.equal(m.useAbility('weave'), true);
    } else if (id === 'shell-weave') {
      m.setW(LAYERS[dewLayer].center);
      travel(m, 'dew', true);
      m.interact();
      assert.equal(m.useAbility('weave'), true);
      for (const mechId of m.snapshot().mechanismOrder) {
        if (!m.snapshot().nodes.find(n => n.id === 'vault').locked) break;
        if (m.snapshot().activated.includes(mechId)) continue;
        const ml = m.snapshot().nodes.find(n => n.id === mechId).layer;
        walkPlannedRoute(m, mechId, { finalLayer: ml });
        m.interact();
        advance(m, 0.55);
      }
      walkPlannedRoute(m, 'vault', { finalLayer: m.snapshot().roomChallenge.entryLayer });
      m.interact();
      escapeWave(m);
    } else if (id === 'prism-shadow') {
      m.setW(LAYERS[dewLayer].center);
      travel(m, 'dew', true);
      m.interact();
      advance(m, 0.55);
      assert.equal(m.useAbility('shadow'), true);
      travel(m, 'hub');
      const nextPowered = m.snapshot().mechanismOrder.find(mid => {
        const n = m.snapshot().nodes.find(x => x.id === mid);
        return n.powered && !m.snapshot().activated.includes(mid);
      });
      const targetL = m.snapshot().nodes.find(n => n.id === nextPowered).layer;
      m.setW(LAYERS[targetL].center);
      assert.equal(m.useAbility('prism'), true);
    } else if (id === 'coil-shadow') {
      m.setW(LAYERS[dewLayer].center);
      travel(m, 'dew', true);
      m.interact();
      advance(m, 0.55);
      assert.equal(m.useAbility('shadow'), true);
      ensureCoilArmed();
      walkPlannedRoute(m, 'hub');
      const armedId = m.snapshot().coilArmed[0];
      const armedLayer = m.snapshot().nodes.find(n => n.id === armedId).layer;
      if (m.snapshot().layer === armedLayer) m.setW(LAYERS[(armedLayer + 1) % 3].center);
      m.setW(LAYERS[armedLayer].center);
    } else if (id === 'prism-weave') {
      m.setW(LAYERS[dewLayer].center);
      travel(m, 'dew', true);
      m.interact();
      assert.equal(m.useAbility('weave'), true);
      advance(m, 0.55);
      travel(m, 'hub', true);
      const nextPowered = m.snapshot().mechanismOrder.find(mid => {
        const n = m.snapshot().nodes.find(x => x.id === mid);
        return n.powered && !m.snapshot().activated.includes(mid);
      });
      const targetL = m.snapshot().nodes.find(n => n.id === nextPowered).layer;
      m.setW(LAYERS[targetL].center);
      assert.equal(m.useAbility('prism'), true);
    } else if (id === 'coil-weave') {
      m.setW(LAYERS[dewLayer].center);
      travel(m, 'dew', true);
      m.interact();
      assert.equal(m.useAbility('weave'), true);
      advance(m, 0.55);
      ensureCoilArmed();
      walkPlannedRoute(m, 'hub');
      const armedId = m.snapshot().coilArmed[0];
      const armedLayer = m.snapshot().nodes.find(n => n.id === armedId).layer;
      if (m.snapshot().layer === armedLayer) m.setW(LAYERS[(armedLayer + 1) % 3].center);
      m.setW(LAYERS[armedLayer].center);
    } else if (id === 'prism-shell') {
      m.setW(LAYERS[dewLayer].center);
      travel(m, 'dew', true);
      travel(m, 'hub');
      m.setW(LAYERS[dewLayer].center);
      assert.equal(m.useAbility('prism'), true);
      advance(m, 0.55);
      for (const mechId of m.snapshot().mechanismOrder) {
        if (!m.snapshot().nodes.find(n => n.id === 'vault').locked) break;
        if (m.snapshot().activated.includes(mechId)) continue;
        const ml = m.snapshot().nodes.find(n => n.id === mechId).layer;
        walkPlannedRoute(m, mechId, { finalLayer: ml });
        if (!m.snapshot().activated.includes(mechId)) m.interact();
        advance(m, 0.55);
      }
      walkPlannedRoute(m, 'vault', { finalLayer: m.snapshot().roomChallenge.entryLayer });
      m.interact();
      escapeWave(m);
    } else if (id === 'coil-shell') {
      ensureCoilArmed();
      walkPlannedRoute(m, 'hub');
      const armedId = m.snapshot().coilArmed[0];
      const armedLayer = m.snapshot().nodes.find(n => n.id === armedId).layer;
      if (m.snapshot().layer === armedLayer) m.setW(LAYERS[(armedLayer + 1) % 3].center);
      m.setW(LAYERS[armedLayer].center);
      advance(m, 0.55);
      for (const mechId of m.snapshot().mechanismOrder) {
        if (!m.snapshot().nodes.find(n => n.id === 'vault').locked) break;
        if (m.snapshot().activated.includes(mechId)) continue;
        const ml = m.snapshot().nodes.find(n => n.id === mechId).layer;
        walkPlannedRoute(m, mechId, { finalLayer: ml });
        if (!m.snapshot().activated.includes(mechId)) m.interact();
        advance(m, 0.55);
      }
      walkPlannedRoute(m, 'vault', { finalLayer: m.snapshot().roomChallenge.entryLayer });
      m.interact();
      escapeWave(m);
    } else if (id === 'shadow-shell') {
      for (const mechId of m.snapshot().mechanismOrder) {
        if (!m.snapshot().nodes.find(n => n.id === 'vault').locked) break;
        const ml = m.snapshot().nodes.find(n => n.id === mechId).layer;
        walkPlannedRoute(m, mechId, { finalLayer: ml });
        m.interact();
        advance(m, 0.55);
      }
      // Leave shadow at the last lit mechanism, then open & evade vault!
      assert.equal(m.useAbility('shadow'), true);
      walkPlannedRoute(m, 'vault', { finalLayer: m.snapshot().roomChallenge.entryLayer });
      m.interact();
      escapeWave(m);
    }

    const route = m.snapshot().hiddenRoutes.find(r => r.id === id);
    assert.ok(route?.eligible, `expected ${id} to become eligible, got ${JSON.stringify(route)}`);

    // Walk to route.entry and dial the 3-step W sequence to unlock rift!
    if (route.entry === 'vault' && m.snapshot().nodes.find(n => n.id === 'vault').locked) {
      for (const mechId of m.snapshot().mechanismOrder) {
        if (!m.snapshot().nodes.find(n => n.id === 'vault').locked) break;
        if (m.snapshot().activated.includes(mechId)) continue;
        const ml = m.snapshot().nodes.find(n => n.id === mechId).layer;
        walkPlannedRoute(m, mechId, { finalLayer: ml });
        m.interact();
        advance(m, 0.55);
      }
    }
    walkPlannedRoute(m, route.entry);
    for (const seqLayer of route.sequence) {
      if (m.snapshot().layer === seqLayer) {
        m.setW(LAYERS[(seqLayer + 1) % 3].center);
      }
      m.setW(LAYERS[seqLayer].center);
    }
    const unlockedRoute = m.snapshot().hiddenRoutes.find(r => r.id === id);
    assert.equal(unlockedRoute.unlocked, true, `expected ${id} to unlock rift`);
    assert.equal(m.snapshot().nodes.find(n => n.id === 'rift').locked, false);
  };

  for (const recipe of HIDDEN_ROUTE_RECIPES) {
    triggerScenario(recipe.id);
  }
});

test('SceneRenderer renders triad, interlock, and sanctum in daylight and astral modes with finite geometry', () => {
  const { renderer } = createFiniteScene();
  for (const tplId of ['triad', 'interlock', 'sanctum']) {
    const { seed, roomIndex } = seedWithExpeditionRoom(tplId);
    const model = advanceToRoom(seed, roomIndex);
    for (const astral of [false, true]) {
      renderer.astralMode = astral;
      renderer.setState(model.snapshot());
      renderer.render(0.016);
    }
    if (tplId === 'sanctum') {
      for (const id of ['dew', 'bell', 'bloom']) {
        const layer = model.snapshot().nodes.find(n => n.id === id).layer;
        walkPlannedRoute(model, id, { finalLayer: layer });
        model.interact();
        advance(model, 0.55);
      }
      const crownLayer = model.snapshot().nodes.find(n => n.id === 'crown').layer;
      model.setW(LAYERS[crownLayer].center);
      model.interact();
      renderer.setState(model.snapshot());
      renderer.pushEvents(model.drainEvents());
      renderer.render(0.016);
      escapeWave(model);
      renderer.setState(model.snapshot());
      renderer.pushEvents(model.drainEvents());
      renderer.render(0.05);
    }
  }
  renderer.destroy();
});

test('CodexStore persists 12 curiosities, 10 secrets, 7 rooms, Flatland progress, and monotonic chapter ranks', () => {
  const storage = createMemoryStorage({
    'wslice-flatland-stars': JSON.stringify({ visitor: 2, guess: 1 }),
    'wslice-flatland-friends': JSON.stringify({ found: ['sprout', 'lantern'], companion: 'sprout' }),
    'wslice-flatland-gardens': JSON.stringify({
      visitor: true,
      escape: ['friend-probe-0', 'friend-mirror-0', 'friend-mirror-1'],
    }),
  });

  const store = new CodexStore({ storage });
  for (const item of CURIOSITY_CATALOG.slice(0, 8)) store.recordAnomaly(item.id);
  store.recordSecretUnlock('prism-shadow');
  store.recordSecretUnlock('shadow-shell');
  store.recordRoomVisit('triad');
  store.recordRoomClear('sanctum');
  store.recordRiftClear();
  store.recordSanctumChoirClear();
  store.recordRunFinish({ mode: 'intro', won: true, banked: 28, rank: 'A' });
  store.recordRunFinish({ mode: 'expedition', won: true, banked: 64, rank: 'S' });
  store.recordRunFinish({ mode: 'expedition', won: false, banked: 19, rank: 'B' });

  // Reload from storage into a brand-new instance
  const reloaded = new CodexStore({ storage });
  const sum = reloaded.summary();
  assert.equal(sum.curiosities.discovered, 8);
  assert.equal(sum.curiosities.total, 12);
  assert.equal(sum.secrets.unlocked, 2);
  assert.equal(sum.secrets.total, 10);
  assert.deepEqual(new Set(sum.rooms.visitedIds), new Set(['triad', 'sanctum']));
  assert.deepEqual(sum.rooms.clearedIds, ['sanctum']);
  assert.equal(sum.riftClears, 1);
  assert.equal(sum.sanctumChoirClears, 1);
  assert.equal(sum.chapters.intro.clears, 1);
  assert.equal(sum.chapters.intro.bestScore, 28);
  assert.equal(sum.chapters.intro.bestRank, 'A');
  assert.equal(sum.chapters.expedition.runs, 2);
  assert.equal(sum.chapters.expedition.clears, 1);
  assert.equal(sum.chapters.expedition.bestScore, 64);
  assert.equal(sum.chapters.expedition.bestRank, 'S', 'lower rank B does not overwrite bestRank S');
  assert.equal(sum.flatland.clearedLevels, 2);
  assert.equal(sum.flatland.totalStars, 3);
  assert.equal(sum.flatland.friendsFound, 2);
  assert.equal(sum.flatland.gardensBloomed, 2);
});
