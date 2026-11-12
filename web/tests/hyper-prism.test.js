import test from 'node:test';
import assert from 'node:assert/strict';
import { POLYTOPES, rotate4D, projectPolytope4D, PhaseResonanceController, RHYTHM_GATES } from '../src/hyper-prism.js';
import { ExplorationRadar, CURIOSITY_CATALOG } from '../src/exploration-radar.js';
import { ProgressiveOnboarding, ONBOARDING_STAGES, findCurrentLayerRoute, planLayerRoute, computeRiskDecisionPreview, computeRelicHudStatus } from '../src/progressive-onboarding.js';
import { GameModel } from '../src/model.js';
import { SceneRenderer } from '../src/scene.js';
import { FlatlandModel } from '../src/flatland/model.js';
import { FlatlandRenderer } from '../src/flatland/scene.js';

function createRecordingCanvas(width = 1000, height = 650) {
  globalThis.window ??= {
    devicePixelRatio: 1,
    addEventListener() {},
    removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  };
  const calls = [];
  const gradient = () => ({ addColorStop(offset, color) { assert(Number.isFinite(offset)); assert.equal(typeof color, 'string'); } });
  const ctx = new Proxy({
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1, font: '12px sans-serif',
    textAlign: 'left', textBaseline: 'alphabetic', lineCap: 'butt', lineJoin: 'miter',
    shadowColor: 'transparent', shadowBlur: 0,
  }, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return (...args) => { args.forEach(v => assert(Number.isFinite(v))); return gradient(); };
      if (prop === 'measureText') return text => ({ width: String(text).length * 7 });
      return (...args) => {
        args.forEach(v => { if (typeof v === 'number') assert(Number.isFinite(v), `${String(prop)} received non-finite number`); });
        calls.push({ method: prop, args, fill: target.fillStyle, stroke: target.strokeStyle });
      };
    },
    set(target, prop, value) {
      if (typeof value === 'number') assert(Number.isFinite(value), `${String(prop)} set to non-finite number`);
      target[prop] = value;
      return true;
    },
  });
  return {
    width, height, calls, style: {},
    getContext: () => ctx,
    getBoundingClientRect: () => ({ left: 0, top: 0, width, height }),
    addEventListener() {},
    removeEventListener() {},
  };
}

test('4D polytopes have exact topological counts and produce finite projections and hyperplane cross-sections', () => {
  assert.equal(POLYTOPES.tesseract.vertices.length, 16);
  assert.equal(POLYTOPES.tesseract.edges.length, 32);
  assert.equal(POLYTOPES.orthoplex.vertices.length, 8);
  assert.equal(POLYTOPES.orthoplex.edges.length, 24);
  assert.equal(POLYTOPES['24cell'].vertices.length, 24);
  assert.equal(POLYTOPES['24cell'].edges.length, 96);

  for (const id of Object.keys(POLYTOPES)) {
    const mid = projectPolytope4D(id, { w: 0.5, time: 1.25, radius: 110 });
    assert.equal(mid.vertices.length, POLYTOPES[id].vertices.length);
    for (const v of mid.vertices) {
      assert(Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.proximity));
    }
    assert(mid.intersections.length >= 4, `${id} at w=0.5 should intersect the W hyperplane`);
    assert(mid.sliceHull.length >= 3, `${id} at w=0.5 should form a 2D hull for its 3D cross-section`);
  }

  const rotated = rotate4D([1, -1, 0.5, -0.5], { xw: 0.7, yw: -0.4, zw: 0.3, xy: 0.2, xz: -0.1 });
  assert.equal(rotated.length, 4);
  rotated.forEach(coord => assert(Number.isFinite(coord)));
});

test('PhaseResonanceController tracks risky crossing rhythm gates, wave grazes, ripples and rank', () => {
  const pr = new PhaseResonanceController();
  const baseState = {
    seed: 101,
    room: 0,
    phase: 'playing',
    w: 0.28,
    layers: [{ center: 0.2, name: '潮汐层' }, { center: 0.5, name: '回声层' }, { center: 0.8, name: '绽放层' }],
    layer: 0,
    range: { min: 0.22, max: 0.46, center: 0.34, layer: 0 },
    travel: {
      edgeId: 'e1',
      risky: true,
      progress: 0.1,
    },
    wave: null,
  };

  // Start near target center and cross all 3 rhythm gates in the sweet spot
  pr.update(0.05, baseState, { active: true });
  for (const gate of RHYTHM_GATES) {
    const events = pr.update(0.05, {
      ...baseState,
      w: 0.345,
      travel: { ...baseState.travel, progress: gate + 0.01 },
    }, { active: true });
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'phase_beat');
    assert.equal(events[0].rating, 'perfect');
  }
  assert.equal(pr.perfectBeats, 3);
  assert.equal(pr.streak, 3);

  // Trigger a last-second wave graze (<= 0.82s left when entering safe slice)
  const unsafeWaveState = {
    ...baseState,
    travel: null,
    layer: 0,
    w: 0.2,
    wave: { node: 'vault', step: 1, steps: 2, remaining: 0.65, safeLayers: [1], dangerLayers: [0, 2], variant: 'normal', entered: false },
  };
  pr.update(0.05, unsafeWaveState, { active: true });
  const grazeEvents = pr.update(0.05, {
    ...unsafeWaveState,
    layer: 1,
    w: 0.5,
  }, { active: true });
  assert.equal(grazeEvents.length, 1);
  assert.equal(grazeEvents[0].type, 'phase_graze');
  assert.equal(pr.grazes, 1);
  assert.equal(pr.summary().rank, 'S+');
});

test('SceneRenderer and FlatlandRenderer render astral mode, 4D hologram, risk corridor and slice ripples finitely', () => {
  const model = new GameModel(42);
  model.chooseRelic(model.snapshot().choices[0].id);
  const s0 = model.snapshot();
  const targetId = s0.availableNodes[0];
  model.select(targetId);
  const edge = model.snapshot().edges.find(e => (e.from === s0.node && e.to === targetId) || (e.to === s0.node && e.from === targetId));
  model.setW(model.snapshot().layers[edge.layer].center);
  model.setRisk(true);
  model.move();

  const canvas = createRecordingCanvas();
  const scene = new SceneRenderer(canvas);
  scene.astralMode = true;
  scene.visualGuide = true;
  const snap = model.snapshot();
  scene.liveGuide = snap.companionGuide;
  scene.phaseResonance.update(0.05, snap, { active: true });
  scene.setState(snap);
  scene.render(0.05);
  assert(canvas.calls.length > 50);

  const flatModel = new FlatlandModel(2, { seed: 7, playStyle: 'explore' });
  flatModel.start();
  const flatCanvas = createRecordingCanvas(960, 560);
  const flatScene = new FlatlandRenderer(flatCanvas);
  flatScene.astralMode = true;
  flatScene.setState(flatModel.snapshot());
  flatScene.render(0.05);
  flatModel.setSlice(flatModel.s + 0.25);
  flatScene.setState(flatModel.snapshot());
  flatScene.render(0.05);
  assert.equal(flatScene.sliceRipples.length, 1);
});

test('ExplorationRadar spawns deterministic 4D curiosities per room, detects off-layer ripples and collects materialized artifacts', () => {
  assert(CURIOSITY_CATALOG.length >= 6);
  const model = new GameModel(42);
  model.chooseRelic('shell');
  const radar = new ExplorationRadar();
  const s0 = model.snapshot();
  const list = radar.visibleAnomalies(s0);
  assert.equal(list.length, 2);
  assert.notEqual(list[0].layer, list[1].layer);

  // Pick an anomaly that is not on the current layer first
  const offLayerItem = list.find(a => a.layer !== s0.layer) || list[0];
  if (offLayerItem.layer !== s0.layer) {
    const offRes = radar.interact(s0, offLayerItem.key);
    assert.equal(offRes.status, 'off_layer');
    assert.equal(offRes.targetLayer, offLayerItem.layer);
  }

  // Switch W to the anomaly's layer so it materializes
  model.setW(s0.layers[offLayerItem.layer].center);
  const sAligned = model.snapshot();
  const hit = radar.hitTest(sAligned, offLayerItem.x + 5, offLayerItem.y - 5);
  assert.ok(hit);
  assert.equal(hit.id, offLayerItem.id);

  const collectedRes = radar.interact(sAligned, offLayerItem.key);
  assert.equal(collectedRes.status, 'collected');
  assert.equal(collectedRes.bonus, 2);
  assert.equal(radar.roomProgress(sAligned).done, 1);
  assert.equal(radar.roomProgress(sAligned).bonusScore, 2);
  assert.equal(radar.interact(sAligned, offLayerItem.key), null, 'cannot collect twice');
});

test('ProgressiveOnboarding gates stages by demonstrated 4D skills, respects banner cooldowns, and prevents trackpad inertia multi-jumps', () => {
  assert.equal(ONBOARDING_STAGES.length, 4);
  const onboarding = new ProgressiveOnboarding({ skillGated: true });
  assert.equal(onboarding.computeStage({ room: 0, activated: [] }).stage, 1);
  assert.equal(onboarding.consumeStageUpBanner({ room: 0, activated: [] }, 0, 1000), null);
  assert.equal(onboarding.shouldShowAssistButton(), false, 'assist button hidden initially');

  // Lighting mechanism ① advances to Stage 2 (4D Slice Folding)
  const stage2Banner = onboarding.consumeStageUpBanner({ room: 0, activated: ['dew'] }, 0, 1000);
  assert.ok(stage2Banner);
  assert.equal(stage2Banner.stage, 2);

  // Without manual layer shift, Stage 3 does NOT unlock in Room 0 even if 2 mechanisms are lit
  assert.equal(onboarding.computeStage({ room: 0, activated: ['dew', 'bell'] }).stage, 2);

  // Once the player manually switches layers and reveals a bridge, Stage 3 unlocks
  onboarding.recordManualLayerShift({ revealedBridge: true });
  assert.equal(onboarding.computeStage({ room: 0, activated: ['dew', 'bell'] }).stage, 3);
  // Banner cooldown (3800ms) prevents immediate banner collision at t=2000ms
  assert.equal(onboarding.consumeStageUpBanner({ room: 0, activated: ['dew', 'bell'] }, 0, 2000), null);
  const stage3Banner = onboarding.consumeStageUpBanner({ room: 0, activated: ['dew', 'bell'] }, 0, 5000);
  assert.ok(stage3Banner);
  assert.equal(stage3Banner.stage, 3);

  // Lowercase state.rift.status === 'cleared' or entering later rooms unlocks Stage 4
  const stage4Banner = onboarding.consumeStageUpBanner({ room: 0, activated: ['dew', 'bell'], rift: { status: 'cleared' } }, 0, 9500);
  assert.ok(stage4Banner);
  assert.equal(stage4Banner.stage, 4);

  // Assist button appears after 15s idle or 2 failures
  onboarding.tickIdle(15.5, { phase: 'playing', room: 0, travel: null, wave: null });
  assert.equal(onboarding.shouldShowAssistButton(), true);
  onboarding.recordActivity();
  assert.equal(onboarding.shouldShowAssistButton(), false);
  onboarding.recordFailure();
  onboarding.recordFailure();
  assert.equal(onboarding.shouldShowAssistButton(), true);

  // Discrete mouse wheel requires >= 80px accumulation, blocks trackpad inertia (<150ms stream), and ignores ctrlKey zoom.
  // Direction: wheel up (negative deltaY) climbs towards Ⅲ, the layer drawn on top of the W stack.
  assert.equal(onboarding.handleDiscreteWheel(-100, 0, 1000, { ctrlKey: true }), null, 'ignores pinch-to-zoom');
  assert.equal(onboarding.handleDiscreteWheel(-35, 0, 1200), null, 'accumulates small deltas');
  assert.equal(onboarding.handleDiscreteWheel(-50, 0, 1240), 1, '35 + 50 >= 80 wheel-up steps 1 layer up');
  // Simulated Mac trackpad inertia stream every 30ms must NOT jump to layer 2
  assert.equal(onboarding.handleDiscreteWheel(-120, 1, 1270), null, 'blocked by inertia lock');
  assert.equal(onboarding.handleDiscreteWheel(-110, 1, 1300), null, 'blocked by inertia lock');
  assert.equal(onboarding.handleDiscreteWheel(-95, 1, 1330), null, 'blocked by inertia lock');
  // After >= 150ms quiet pause (and >= 220ms since step at 1240), next intentional scroll steps to layer 2
  assert.equal(onboarding.handleDiscreteWheel(-100, 1, 1520), 2, 'wheel up climbs to Ⅲ');
  assert.equal(onboarding.handleDiscreteWheel(100, 2, 1800), 1, 'wheel down descends to Ⅱ');
  assert.equal(onboarding.handleDiscreteWheel(100, 0, 2100), null, 'wheel down at Ⅰ stays at the bottom layer');
});

test('findCurrentLayerRoute stays strictly within current W layer and planLayerRoute hands off-layer changes to the player', () => {
  const model = new GameModel(42);
  model.chooseRelic('shell');
  const s = model.snapshot();

  // Find a mechanism on the current layer vs a mechanism on a different layer
  const sameLayerMech = s.nodes.find(n => n.kind === 'mechanism' && n.layer === s.layer && n.powered);
  const offLayerMech = s.nodes.find(n => n.kind === 'mechanism' && n.layer !== s.layer);

  if (sameLayerMech) {
    const route = findCurrentLayerRoute(s, sameLayerMech.id);
    assert.ok(route && route.length > 0, 'current-layer mechanism has a direct current-layer route');
    assert.ok(route.every(step => step.type === 'move' && step.layer === s.layer), 'never inserts cross-layer shift steps');
    const plan = planLayerRoute(s, sameLayerMech.id);
    assert.equal(plan.shift, null, 'same-layer target needs no player layer change');
    assert.ok(plan.walk.length > 0 && plan.walk.every(step => step.layer === s.layer));
  }

  if (offLayerMech) {
    const directRoute = findCurrentLayerRoute(s, offLayerMech.id);
    assert.equal(directRoute, null, 'off-layer mechanism must not be auto-routed across W layers');
  }
});

// Drives the click-to-target flow like main.js does: the autopilot walks `plan.walk`, stops at
// `plan.shift`, and an obedient player performs exactly the prompted layer change.
function obedientReach(m, targetId) {
  for (let guard = 0; guard < 30; guard++) {
    const s = m.snapshot();
    const plan = planLayerRoute(s, targetId);
    if (!plan) return `no plan from ${s.node}@${s.layer}`;
    if (!plan.walk.length && !plan.shift) return null;
    if (plan.walk.length) {
      const step = plan.walk[0];
      assert.equal(step.layer, s.layer, 'autopilot only walks bridges of the current layer');
      if (!m.select(step.to)) return `cannot select ${step.to}`;
      if (!m.snapshot().canMove) m.setW(s.layers[s.layer].center);
      if (!m.move()) return `cannot cross to ${step.to}`;
      for (let t = 0; t < 400 && m.snapshot().travel; t++) m.update(.05);
      continue;
    }
    const here = s.nodes.find(n => n.id === s.node);
    assert.ok(here.anchor || plan.shift.kind === 'same_xyz', 'prompted layer changes only happen on real cross-layer support');
    assert.notEqual(plan.shift.layer, s.layer, 'never asks for the layer the player already stands in');
    m.setW(s.layers[plan.shift.layer].center);
    m.update(.05);
    const after = m.snapshot();
    if (after.layer === s.layer) return 'prompted shift had no effect';
    if (after.phaseStability < .99) return 'prompted shift voided the player';
  }
  return 'too many steps';
}

test('planLayerRoute guides an obedient player through every courtyard template without dead ends (300 seeds × 3 rooms)', () => {
  const templates = new Set();
  let rooms = 0, prompts = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const m = new GameModel(seed);
    m.chooseRelic('shell');
    for (let room = 0; room < 3 && m.snapshot().phase === 'playing'; room++) {
      const s0 = m.snapshot();
      templates.add(s0.roomName);
      for (const id of [...s0.mechanismOrder, 'exit']) {
        for (let t = 0; t < 40; t++) m.update(.05);
        const before = m.snapshot().layer;
        const failure = obedientReach(m, id);
        assert.equal(failure, null, `seed ${seed} room ${room + 1} (${s0.roomName}) → ${id}: ${failure}`);
        if (m.snapshot().layer !== before) prompts++;
        if (id !== 'exit') assert.ok(m.interact(), `seed ${seed} room ${room + 1}: ${id} activates on arrival`);
      }
      for (let t = 0; t < 40; t++) m.update(.05);
      rooms++;
      if (m.snapshot().phase === 'interlude') m.chooseRelic('shell');
    }
  }
  assert.equal(rooms, 900, 'every seeded journey completes all three courtyards');
  assert.equal(templates.size, 4, 'all four courtyard templates are exercised');
  assert.ok(prompts > rooms, 'the player still performs real layer changes (the 4D puzzle is not automated away)');
});

test('planLayerRoute walks to the anchor that actually carries the target bridge before asking for a layer change', () => {
  // Seed 7 starts with 远端折返庭: ② (bell) uses the Room 0 W-ramp off relay, and ③ (bloom) hangs off relay on its own flat layer.
  const m = new GameModel(7);
  m.chooseRelic('shell');
  const [first, second, third] = m.snapshot().mechanismOrder;
  assert.equal(obedientReach(m, first), null);
  assert.ok(m.interact());
  for (let t = 0; t < 40; t++) m.update(.05);
  assert.equal(obedientReach(m, 'hub'), null);
  const rampPlan = planLayerRoute(m.snapshot(), second);
  assert.deepEqual(rampPlan.walk.map(st => st.to), ['relay', 'bell']);
  assert.equal(rampPlan.shift, null);
  assert.equal(obedientReach(m, second), null);
  assert.ok(m.interact());
  for (let t = 0; t < 40; t++) m.update(.05);
  assert.equal(obedientReach(m, 'hub'), null);
  const s = m.snapshot();
  const plan = planLayerRoute(s, third);
  assert.ok(plan.walk.length > 0, 'walks on the current layer first instead of switching at the hub');
  assert.equal(plan.shift.at, 'relay');
  assert.notEqual(plan.shift.layer, s.layer);
});

test('planLayerRoute honours a required arrival layer and recovers a fading footing first', () => {
  const m = new GameModel(3);
  m.chooseRelic('shell');
  const s = m.snapshot();
  const otherLayer = (s.layer + 1) % 3;
  const plan = planLayerRoute(s, 'hub', { finalLayer: otherLayer });
  assert.deepEqual(plan.walk, []);
  assert.equal(plan.shift.layer, otherLayer, 'anchor target with a required layer asks for that layer');

  const first = s.mechanismOrder[0];
  assert.equal(obedientReach(m, first), null);
  const onOuter = m.snapshot();
  const here = onOuter.nodes.find(n => n.id === onOuter.node);
  // Pick a layer without a same-XYZ counterpart, so the change really leaves the footing unsupported.
  const voidLayer = [0, 1, 2].find(layer => layer !== onOuter.layer && !onOuter.nodes.some(n =>
    !n.anchor && n.id !== here.id && n.layer === layer && n.world.x === here.world.x && n.world.y === here.world.y && n.world.z === here.world.z));
  m.setW(onOuter.layers[voidLayer].center);
  assert.equal(m.snapshot().node, here.id);
  const recover = planLayerRoute(m.snapshot(), 'hub');
  assert.equal(recover.shift.kind, 'recover');
  assert.equal(recover.shift.layer, onOuter.layer);
});

test('planLayerRoute returns null while the target is still gated', () => {
  const m = new GameModel(7);
  m.chooseRelic('shell');
  assert.equal(planLayerRoute(m.snapshot(), 'exit'), null, 'exit stays unreachable until all mechanisms are lit');
});

test('SceneRenderer displayW eases smoothly without model side effects and wraps I <-> III without sweeping through II', () => {
  const canvas = createRecordingCanvas(1000, 650);
  const renderer = new SceneRenderer(canvas);
  const m = new GameModel(1);
  m.chooseRelic('shell');
  m.setW(0.18);
  renderer.setState(m.snapshot());
  assert.equal(renderer.currentW(), 0.18);

  // Adjacent shift I (0.18) -> II (0.50): logical W snaps, displayW eases monotonically
  m.setW(0.50);
  renderer.setState(m.snapshot());
  assert.equal(m.snapshot().w, 0.50);
  assert.equal(renderer.currentW(), 0.18, 'displayW starts at previous W before render ticks');
  let prevW = renderer.currentW();
  for (let i = 0; i < 9; i++) {
    renderer.render(0.05);
    assert.ok(renderer.currentW() >= prevW - 1e-6 && renderer.currentW() <= 0.50 + 1e-6, 'ease-out has no overshoot');
    prevW = renderer.currentW();
  }
  assert.equal(renderer.currentW(), 0.50);

  // Wrap-around shift I (0.18) -> III (0.82): never enters Layer II cross-section [0.34, 0.66]
  m.setW(0.18);
  renderer.reducedMotion = true;
  renderer.setState(m.snapshot());
  renderer.reducedMotion = false;
  assert.equal(renderer.currentW(), 0.18);

  m.setW(0.82);
  renderer.setState(m.snapshot());
  for (let i = 0; i < 20; i++) {
    renderer.render(0.025);
    const w = renderer.currentW();
    const inLayerII = w > 0.34 && w < 0.66;
    assert.equal(inLayerII, false, `wrap-around displayW (${w.toFixed(3)}) must never sweep through layer II`);
  }
  assert.equal(renderer.currentW(), 0.82);

  // Risky travel snaps displayW immediately with zero lag
  const riskySnap = { ...m.snapshot(), w: 0.44, travel: { risky: true, progress: 0.3, from: 'hub', to: 'dew', layer: 1 } };
  renderer.setState(riskySnap);
  assert.equal(renderer.currentW(), 0.44);
  renderer.destroy();
});

test('drawSliceVolumes renders dashed off-slice bridge silhouettes and brightens them on safety anchors', () => {
  const canvas = createRecordingCanvas(1000, 650);
  const { calls } = canvas;
  const renderer = new SceneRenderer(canvas);
  const m = new GameModel(1);
  m.chooseRelic('shell');
  const s = m.snapshot();
  renderer.setState(s);
  calls.length = 0;
  renderer.drawSliceVolumes();
  const anchorBridgeStrokes = calls.filter(c => c.method === 'stroke' || c.method === 'lineTo');
  assert.ok(anchorBridgeStrokes.length > 0, 'draws off-slice bridge and island silhouettes');
  renderer.destroy();
});

test('drawVisualActionGuide declutters to at most 2 full pills at 375px in Stage 4 and 0 pills during wave', () => {
  const canvas = createRecordingCanvas(375, 650);
  const { calls } = canvas;
  const renderer = new SceneRenderer(canvas);
  renderer.visualGuide = true;
  renderer.onboardingStage = 4;

  const m = new GameModel(1);
  m.chooseRelic('shell');
  const s = m.snapshot();
  renderer.liveGuide = s.companionGuide;
  renderer.setState(s);

  calls.length = 0;
  renderer.drawVisualActionGuide();
  const texts = calls.filter(c => c.method === 'fillText').map(c => String(c.args[0]));
  const fullPills = texts.filter(t => t.length > 6);
  const compactBadges = texts.filter(t => t.length <= 6);
  assert.ok(fullPills.length <= 2, `expected <= 2 full text pills at 375px Stage 4, got ${fullPills.length}: ${JSON.stringify(fullPills)}`);
  assert.ok(compactBadges.length >= 3, 'non-focus islands collapse into compact circular badges');

  // During a wave, all callout pills and badges in drawVisualActionGuide are suppressed
  calls.length = 0;
  renderer.setState({
    ...s,
    wave: { node: 'vault', layer: 0, dangerLayers: [0], safeLayers: [1, 2], remaining: 1.5, duration: 2.5, step: 1, steps: 1 },
  });
  renderer.drawVisualActionGuide();
  assert.equal(calls.filter(c => c.method === 'fillText').length, 0, 'wave suppresses all visual guide pills');
  renderer.destroy();
});

test('Stage 3+ switches layer prompts to deductive visual-clue mode and restores explicit hints on H request or 10s idle', () => {
  const onboarding = new ProgressiveOnboarding({ skillGated: true });
  const m = new GameModel(7);
  m.chooseRelic('shell');
  // Light ① so ② (on layer 0) is the next target while standing on relay (layer 2)
  const first = m.snapshot().mechanismOrder[0];
  assert.equal(obedientReach(m, first), null);
  assert.ok(m.interact());
  assert.equal(obedientReach(m, 'relay'), null);
  const sRelay = m.snapshot();

  // In Stage 2, explicit layer hints are revealed to teach the mechanic
  assert.equal(onboarding.computeStage(sRelay).stage, 2);
  assert.equal(onboarding.shouldRevealExplicitLayerHint(sRelay), true);

  // Unlock Stage 3 (second courtyard or manual shift + 2 mechanisms)
  onboarding.recordManualLayerShift({ revealedBridge: true });
  const sStage3 = { ...sRelay, room: 1 };
  assert.equal(onboarding.computeStage(sStage3).stage, 3);
  assert.equal(onboarding.shouldRevealExplicitLayerHint(sStage3), false, 'Stage 3+ hides direct layer spoiler by default');

  // Verify SceneRenderer renders deductive visual-clue prompt without spoiling layer name in Stage 3
  const canvas = createRecordingCanvas(1000, 650);
  const { calls } = canvas;
  const renderer = new SceneRenderer(canvas);
  renderer.visualGuide = true;
  renderer.onboardingStage = 3;
  renderer.explicitLayerHint = false;
  renderer.pendingLayerPrompt = { targetId: sStage3.mechanismOrder[1], targetLayer: 0, atNode: 'relay', kind: 'anchor' };
  renderer.setState(sStage3);

  calls.length = 0;
  renderer.drawVisualActionGuide();
  const deductiveTexts = calls.filter(c => c.method === 'fillText').map(c => String(c.args[0]));
  assert.ok(deductiveTexts.includes('⇅'), `expected compact deductive shift symbol, got ${JSON.stringify(deductiveTexts)}`);
  assert.ok(deductiveTexts.includes('②'), `expected off-slice number badge without Chinese layer name, got ${JSON.stringify(deductiveTexts)}`);
  assert.ok(!deductiveTexts.some(t => t.includes('▼') || t.includes('▲') || t.includes('Ⅰ层') || t.includes('潮汐层') || t.includes('异层')), 'must not spoil target layer or emit Chinese layer prose in deductive mode');

  // After 10s hesitation (or pressing H), explicit layer hint automatically unlocks
  onboarding.tickIdle(10.5, sStage3);
  assert.equal(onboarding.shouldRevealExplicitLayerHint(sStage3), true, '10s idle reveals explicit layer hint');
  renderer.explicitLayerHint = true;
  calls.length = 0;
  renderer.drawVisualActionGuide();
  const explicitTexts = calls.filter(c => c.method === 'fillText').map(c => String(c.args[0]));
  assert.ok(explicitTexts.includes('▼'), `expected explicit directional chevron after idle fallback, got ${JSON.stringify(explicitTexts)}`);
  assert.ok(explicitTexts.includes('②'), `expected target number badge, got ${JSON.stringify(explicitTexts)}`);
  assert.ok(!explicitTexts.includes('⇅'), 'explicit directional chevron replaces deductive ⇅');
  renderer.destroy();
});

test('Risk decision preview and Relic HUD surface novel bridge rewards, charging progress, and 1-click ability readiness', () => {
  const m = new GameModel(7);
  m.chooseRelic('prism');
  const s0 = m.snapshot();
  const firstId = s0.mechanismOrder[0];

  // Before crossing anchor -> first mechanism, computeRiskDecisionPreview identifies the novel route and prism/resonance rewards
  const decision0 = computeRiskDecisionPreview(s0, firstId);
  assert.equal(decision0.available, true, 'expected risk decision preview for novel bridge');
  assert.equal(decision0.to, firstId);
  assert.equal(decision0.isNovel, true);
  assert.ok(decision0.bonuses.some(r => r.includes('+3◆')), 'includes 3x resonance reward');
  assert.ok(decision0.bonuses.some(r => r.includes('唤醒花桥')), 'includes flower bridge awakening');
  assert.ok(decision0.bonuses.some(r => r.includes('棱镜蓄能+1')), 'includes prism charge reward');

  // Initial Relic HUD shows prism 0/1 uncharged
  const hud0 = computeRelicHudStatus(s0);
  assert.equal(hud0.readyAbility, null);
  const prismChip0 = hud0.items.find(it => it.id === 'prism');
  assert.ok(prismChip0);
  assert.equal(prismChip0.charged, false);

  // Cross the bridge in Risk Mode to earn prism charge +1 and awaken flower bridge
  m.setRisk(true);
  assert.ok(m.select(firstId));
  assert.ok(m.move());
  for (let i = 0; i < 60 && m.snapshot().travel; i += 1) {
    m.setW(m.snapshot().range.center);
    m.update(0.1);
  }
  m.setRisk(false);

  const sAfterRisk = m.snapshot();
  assert.ok(sAfterRisk.charge >= 1, 'risk crossing charged prism');
  assert.equal(computeRiskDecisionPreview({ ...sAfterRisk, node: s0.node, w: s0.w }, firstId).isNovel, false, 'claimed route no longer offers first-crossing risk bonus');

  // Light ① so ② (on layer 0) becomes the next unlit mechanism with active upstream supply after 0.5s power propagation
  assert.ok(m.interact());
  for (let i = 0; i < 6; i += 1) m.update(0.1);
  const sChargedOnMech = m.snapshot();
  const hudCharged = computeRelicHudStatus(sChargedOnMech);
  assert.ok(hudCharged.positioningHint?.includes('棱镜已蓄满'), 'shows positioning hint when charged but not yet aligned at anchor');

  // Walk to relay (anchor) and shift to layer 0 where ② lives so prism is ready to fire
  assert.equal(obedientReach(m, 'relay'), null);
  m.setW(s0.layers[0].center);
  const sReady = m.snapshot();
  const hudReady = computeRelicHudStatus(sReady);
  assert.ok(hudReady.readyAbility, 'prism ability is now ready to fire at mechanism ②');
  assert.equal(hudReady.readyAbility.id, 'prism');
  assert.ok(hudReady.readyAbility.ctaText.includes('点此远程点亮'));

  // Verify SceneRenderer keeps canvas uncluttered (no verbose relic paragraph above player; compact badges only)
  const canvas = createRecordingCanvas(1000, 650);
  const { calls } = canvas;
  const renderer = new SceneRenderer(canvas);
  renderer.visualGuide = true;
  renderer.onboardingStage = 2;
  renderer.relicHud = hudReady;
  renderer.setState(sReady);
  calls.length = 0;
  renderer.drawVisualActionGuide();
  const texts = calls.filter(c => c.method === 'fillText').map(c => String(c.args[0]));
  assert.ok(texts.includes('🎯 ②'), `expected compact target badge on mechanism ②, got ${JSON.stringify(texts)}`);
  assert.ok(!texts.some(t => t.includes('点此远程点亮')), 'verbose relic ability paragraph is omitted from canvas');

  // Firing prism remotely activates ② without crossing the bridge
  assert.ok(m.useAbility('prism'));
  assert.ok(m.snapshot().activated.includes(sReady.mechanismOrder[1]), 'prism remotely activated mechanism ②');
  renderer.destroy();
});

test('GameModel authoritatively scores 4D curiosities, perfect risky crossings and last-second wave grazes without farming, and resets on restart', () => {
  const m = new GameModel(42);
  assert.equal(m.collectAnomaly('tesseract_shard'), false, 'cannot collect before run starts');
  m.chooseRelic('shell');

  const s0 = m.snapshot();
  assert.equal(s0.anomalies.length, 2);
  assert.equal(s0.anomalyProgress.done, 0);
  assert.equal(s0.banked, 0);

  // 1. Off-layer curio is rejected with an anomaly_off_layer event and no score change
  const offItem = s0.anomalies.find(a => a.layer !== s0.layer) || s0.anomalies[0];
  if (offItem.layer !== s0.layer) {
    m.drainEvents();
    assert.equal(m.collectAnomaly(offItem.id), false);
    assert.equal(m.snapshot().banked, 0);
    assert.ok(m.drainEvents().some(e => e.type === 'anomaly_off_layer' && e.targetLayer === offItem.layer));
  }

  // Materialize and collect both curiosities in room 0 (+2◆ each -> +4◆ banked)
  for (const item of s0.anomalies) {
    m.setW(s0.layers[item.layer].center);
    assert.equal(m.collectAnomaly(item.key), true);
    assert.equal(m.collectAnomaly(item.id), false, 'cannot collect the same curio twice');
  }
  const sAfterCurios = m.snapshot();
  assert.equal(sAfterCurios.banked, 4);
  assert.equal(sAfterCurios.roomScore, 4);
  assert.equal(sAfterCurios.stats.anomalies, 2);
  assert.equal(sAfterCurios.anomalyProgress.done, 2);
  assert.equal(sAfterCurios.anomalyProgress.totalCollected, 2);
  assert.equal(sAfterCurios.anomalyProgress.bonusScore, 4);

  // 2. Novel risky crossing hitting all 3 rhythm gates in sweetSpot awards +3◇ carried AND +1◆ banked phase_sync bonus
  const firstId = s0.mechanismOrder[0];
  const firstNode = s0.nodes.find(n => n.id === firstId);
  m.setW(s0.layers[firstNode.layer].center);
  m.setRisk(true);
  assert.equal(m.select(firstId), true);
  assert.equal(m.move(), true);
  m.drainEvents();
  while (m.snapshot().travel) {
    m.setW(m.snapshot().range.center);
    m.update(1 / 60);
  }
  const riskEvents = m.drainEvents();
  assert.equal(riskEvents.filter(e => e.type === 'phase_beat' && e.rating === 'perfect').length, 3);
  assert.equal(riskEvents.filter(e => e.type === 'phase_sync').length, 1);
  const sAfterPerfectRisk = m.snapshot();
  assert.equal(sAfterPerfectRisk.carried, 3, 'novel risky bridge still awards 3 carried echoes');
  assert.equal(sAfterPerfectRisk.banked, 5, '4 from curios + 1 from 3/3 perfect rhythm gates');
  assert.equal(sAfterPerfectRisk.stats.perfectBeats, 3);
  assert.equal(sAfterPerfectRisk.stats.perfectCrossings, 1);
  assert.equal(sAfterPerfectRisk.phaseResonance.rank, 'S+');

  // Repeating the same directed risky crossing after returning cannot farm another phase_sync bonus
  m.setRisk(false);
  assert.equal(m.select('hub'), true);
  assert.equal(m.move(), true);
  while (m.snapshot().travel) m.update(0.05);
  m.interact(); // bank carried (3 + 1 = 4 -> banked becomes 9)
  const bankedBeforeRepeat = m.snapshot().banked;
  m.setRisk(true);
  assert.equal(m.select(firstId), true);
  assert.equal(m.move(), true);
  while (m.snapshot().travel) {
    m.setW(m.snapshot().range.center);
    m.update(1 / 60);
  }
  assert.equal(m.snapshot().banked, bankedBeforeRepeat, 'already-claimed route cannot farm phase_sync banked bonus');
  assert.equal(m.snapshot().carried, 0);
  m.setRisk(false);

  // 3. Last-second wave graze (entering safe layer with <= 0.82s remaining) awards +1◆ banked once per wave step
  for (const id of m.snapshot().mechanismOrder) {
    assert.equal(obedientReach(m, id), null);
    if (!m.snapshot().activated.includes(id)) assert.equal(m.interact(), true);
    for (let i = 0; i < 12; i++) m.update(0.05);
  }
  assert.equal(obedientReach(m, 'vault'), null);
  const entryLayer = m.snapshot().roomChallenge.entryLayer;
  m.setW(s0.layers[entryLayer].center);
  assert.equal(m.interact(), true);
  const wave0 = m.snapshot().wave;
  assert.ok(wave0);
  // Stay in danger layer until remaining <= 0.70s to arm graze, then shift into safe layer
  const dangerLayer = wave0.dangerLayers[0];
  const safeLayer = wave0.safeLayers[0];
  m.setW(s0.layers[dangerLayer].center);
  while (m.snapshot().wave && m.snapshot().wave.remaining > 0.65) {
    m.update(0.05);
  }
  const bankedBeforeGraze = m.snapshot().banked;
  m.drainEvents();
  m.setW(s0.layers[safeLayer].center);
  const grazeEvents = m.drainEvents().filter(e => e.type === 'phase_graze');
  assert.equal(grazeEvents.length, 1, 'shifting into safe layer at <= 0.82s triggers phase_graze');
  assert.equal(m.snapshot().banked, bankedBeforeGraze + 1, 'phase_graze awards +1◆ banked');
  assert.equal(m.snapshot().stats.grazes, 1);

  // Bouncing out and back in on the same wave step cannot trigger a second graze bonus
  m.setW(s0.layers[dangerLayer].center);
  m.setW(s0.layers[safeLayer].center);
  assert.equal(m.snapshot().banked, bankedBeforeGraze + 1, 'same wave step cannot be grazed twice');

  // Snapshot isolation check for new fields
  const snapMut = m.snapshot();
  snapMut.anomalies[0].collected = false;
  snapMut.anomalyProgress.bonusScore = 999;
  snapMut.phaseResonance.rank = 'Z';
  assert.equal(m.snapshot().anomalies[0].collected, true);
  assert.equal(m.snapshot().anomalyProgress.bonusScore, 4);
  assert.notEqual(m.snapshot().phaseResonance.rank, 'Z');

  // 4. Restart clears curiosities, phase resonance, banked score and stats
  m.restart(42);
  m.chooseRelic('shell');
  const sReset = m.snapshot();
  assert.equal(sReset.banked, 0);
  assert.equal(sReset.stats.anomalies, 0);
  assert.equal(sReset.stats.perfectBeats, 0);
  assert.equal(sReset.stats.grazes, 0);
  assert.equal(sReset.stats.perfectCrossings, 0);
  assert.equal(sReset.anomalyProgress.done, 0);
  assert.equal(sReset.phaseResonance.rank, 'B');
});

test('Stage 1 declutters canvas and off-slice exit always renders ghosted gate silhouette with 3-lamp lock progress', () => {
  const prevWin = globalThis.window;
  globalThis.window = {
    devicePixelRatio: 1,
    addEventListener() {},
    removeEventListener() {},
    matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }),
  };
  try {
    const canvas = createRecordingCanvas(1000, 650);
    const { calls } = canvas;
    const renderer = new SceneRenderer(canvas);
    renderer.visualGuide = true;
    renderer.onboardingStage = 1;

    // Find a seed where exit starts on an off-slice W layer relative to hub's starting layer
    let m = new GameModel(1);
    for (let seed = 1; seed <= 30; seed += 1) {
      const cand = new GameModel(seed);
      cand.chooseRelic('shell');
      const snap = cand.snapshot();
      const exitNode = snap.nodes.find(n => n.id === 'exit');
      if (exitNode && !exitNode.present && exitNode.scale <= 0.08) {
        m = cand;
        break;
      }
    }
    const s0 = m.snapshot();
    const firstId = s0.mechanismOrder[0];
    const firstNode = s0.nodes.find(n => n.id === firstId);
    const exitNode = s0.nodes.find(n => n.id === 'exit');
    const vaultNode = s0.nodes.find(n => n.id === 'vault');
    assert.ok(exitNode && exitNode.scale <= 0.08, 'selected room starts with exit on an off-slice W layer');

    renderer.liveGuide = s0.companionGuide;
    renderer.setState(s0);
    calls.length = 0;
    renderer.render(0.016);
    const stage1Texts = calls.filter(c => c.method === 'fillText').map(c => String(c.args[0]));

    // 1. Stage 1 minimal symbols & progressive decluttering
    assert.ok(stage1Texts.includes('👆 ①'), `expected minimal Stage 1 target badge, got ${JSON.stringify(stage1Texts)}`);
    assert.ok(stage1Texts.includes('⚓ 起点'), `expected Stage 1 hub role label, got ${JSON.stringify(stage1Texts)}`);
    assert.ok(!stage1Texts.includes(firstNode.name), 'unhovered mechanism omits bottom poetic name pill');
    assert.ok(!stage1Texts.some(t => t.includes('🔒')), 'Stage 1 hides locked unpowered mechanism badges');
    assert.ok(!stage1Texts.some(t => t.includes('宝箱') || t.includes('✨')), 'Stage 1 hides locked vault');
    assert.ok(!stage1Texts.some(t => t.includes('Ⅰ ▲') || t.includes('Ⅱ ●') || t.includes('Ⅲ ▼')), 'Stage 1 hides WStack');
    assert.equal(renderer.hitWStackLayer({ clientX: 100, clientY: 110 }), null, 'WStack hit-test disabled in Stage 1');
    if (vaultNode?.locked) {
      assert.equal(renderer.hitTest({ clientX: vaultNode.x, clientY: vaultNode.y }), null, 'locked vault hit-test disabled before Stage 3');
    }

    // 2. Always-visible off-slice exit gate silhouette + 3-lamp lock progress (icon + pips only, no Chinese prose)
    const mechTotal = s0.mechanismOrder.length;
    assert.ok(
      stage1Texts.includes('🚪') && !stage1Texts.some(t => t.includes('出口')),
      `expected icon-only ghosted off-slice exit 🚪, got ${JSON.stringify(stage1Texts)}`
    );

    // 3. Hovering mechanism keeps minimal badge without duplicating bottom hint sentence or Chinese mechanism name
    renderer.hover = firstId;
    calls.length = 0;
    renderer.render(0.016);
    const hoverTexts = calls.filter(c => c.method === 'fillText').map(c => String(c.args[0]));
    assert.ok(hoverTexts.includes('👆 ①'), `hovering mechanism keeps minimal target badge, got ${JSON.stringify(hoverTexts)}`);
    assert.ok(!hoverTexts.includes(firstNode.name) && !hoverTexts.includes('点此走过去点亮 ①'), `hovering mechanism omits duplicate canvas prose, got ${JSON.stringify(hoverTexts)}`);

    // 4. Off-slice exit silhouette updates lamp pips and keeps icon-only 🚪 when all mechanisms are lit
    renderer.hover = null;
    renderer.onboardingStage = 2;
    renderer.setState({ ...s0, activated: [...s0.mechanismOrder] });
    calls.length = 0;
    renderer.drawIsland(renderer.node('exit'));
    const openSilhouetteTexts = calls.filter(c => c.method === 'fillText').map(c => String(c.args[0]));
    assert.ok(
      openSilhouetteTexts.includes('🚪') && !openSilhouetteTexts.some(t => t.includes('出口')),
      `expected icon-only open off-slice exit 🚪, got ${JSON.stringify(openSilhouetteTexts)}`
    );
    const lampEllipses = calls.filter(c => c.method === 'ellipse');
    assert.ok(lampEllipses.length >= 1 + mechTotal * 3, 'draws dashed platform ellipse plus lit 3-lamp glow/core/glint pips');

    renderer.destroy();
  } finally {
    globalThis.window = prevWin;
  }
});
