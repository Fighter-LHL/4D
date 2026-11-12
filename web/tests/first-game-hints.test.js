import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ONBOARDING_STAGES,
  ProgressiveOnboarding,
  describeNextStep,
  planLayerRoute,
  clampIntroductoryW,
} from '../src/progressive-onboarding.js';
import { SceneRenderer } from '../src/scene.js';
import { start, reach, advance } from './model-helpers.js';

const badgeOf = (state, id) => {
  if (id === 'exit') return '🚪';
  const index = state.mechanismOrder.indexOf(id);
  return ['①', '②', '③', '④'][index];
};

function light(model, id) {
  reach(model, id);
  if (!model.snapshot().activated.includes(id)) {
    assert.equal(model.interact(), true, `activate ${id}`);
    advance(model, 0.7);
  }
}

test('seed 2 next-step hint stays non-empty and never aims at a lit mechanism', () => {
  const model = start('shell', 2);
  const seen = [];
  const record = label => {
    const state = model.snapshot();
    const step = describeNextStep(state);
    seen.push({ label, step, node: state.node, layer: state.layer, activated: [...state.activated] });
    assert.ok(step.banner, `${label} hint is empty`);
    assert.ok(step.banner.length <= 20, `${label} banner longer than 20: ${step.banner} (${step.banner.length})`);
    assert.equal(step.goalId === 'exit' || !state.activated.includes(step.goalId), true, `${label} goal ${step.goalId} is already lit`);
    assert.ok(step.banner.includes(badgeOf(state, step.goalId)), `${label} banner "${step.banner}" does not name ${step.goalId}`);
    if (step.action === 'move' && state.activated.includes(step.targetId)) {
      assert.fail(`${label} tells the player to walk to already-lit ${step.targetId}: ${step.banner}`);
    }
  };

  record('0/3 at hub');
  assert.equal(describeNextStep(model.snapshot()).goalId, 'dew');
  assert.equal(describeNextStep(model.snapshot()).action, 'move');

  light(model, 'dew');
  record('1/3 on dew');
  assert.equal(describeNextStep(model.snapshot()).goalId, 'bloom');
  assert.equal(describeNextStep(model.snapshot()).banner, '去归响台，走上斜桥点②');
  reach(model, 'hub');
  record('1/3 at hub');
  const bloomLayer = model.snapshot().nodes.find(n => n.id === 'bloom').layer;
  const toBloom = planLayerRoute(model.snapshot(), 'bloom');
  assert.equal(toBloom.shift, null, 'from the hub the W-ramp reaches ② without a manual shift');
  assert.equal(toBloom.walk.length, 1);
  assert.equal(toBloom.walk[0].to, 'bloom');
  assert.equal(toBloom.walk[0].ramp, true);
  assert.equal(toBloom.walk[0].toLayer, bloomLayer);
  assert.equal(describeNextStep(model.snapshot()).banner, '走上斜桥，点亮②');

  light(model, 'bloom');
  record('2/3 on bloom');
  assert.equal(describeNextStep(model.snapshot()).goalId, 'bell');
  reach(model, 'hub');
  record('2/3 at hub on bloom layer');

  const bell = model.snapshot().nodes.find(n => n.id === 'bell');
  const atHub = model.snapshot();
  const toBell = planLayerRoute(atHub, 'bell');
  assert.equal(toBell.walk.length, 0, '2/3 at the hub must not walk back to lit dew');
  assert.equal(toBell.shift.kind, 'anchor');
  assert.equal(toBell.shift.at, 'hub');
  assert.equal(toBell.shift.layer, bell.layer);
  assert.ok(!toBell.steps.some(step => step.to === 'dew' && step.type === 'move'), 'route to bell does not detour through lit dew');
  const hubHint = describeNextStep(atHub);
  assert.equal(hubHint.action, 'shift');
  assert.equal(hubHint.layer, bell.layer);
  assert.equal(hubHint.goalId, 'bell');
  assert.ok(!hubHint.banner.includes('①'), `hub hint must not send the player back to ①: ${hubHint.banner}`);

  model.setW(model.snapshot().layers[model.snapshot().nodes.find(n => n.id === 'dew').layer].center);
  record('2/3 at hub on dew layer');
  const onDewLayer = planLayerRoute(model.snapshot(), 'bell');
  assert.equal(onDewLayer.walk.length, 0, 'even on dew’s layer the hub shifts toward bell instead of walking to dew');
  assert.notEqual(onDewLayer.steps[0]?.to, 'dew');

  reach(model, 'dew');
  record('2/3 standing on lit dew');
  // In seed 2, dew is on layer 2 (Ⅲ) and bell is on layer 0 (Ⅰ) with no platform at that XYZ on
  // layer 1 (Ⅱ), so rolling down from dew would strand the player on unsupported dew@1 and loop
  // with recover; the safe route walks back to 归响台 first and shifts there.
  const onDewPlan = planLayerRoute(model.snapshot(), 'bell');
  assert.equal(onDewPlan.walk[0]?.to, 'hub');
  assert.equal(onDewPlan.shift.kind, 'anchor');
  assert.equal(onDewPlan.shift.at, 'hub');
  assert.equal(onDewPlan.shift.layer, bell.layer);
  const onDew = describeNextStep(model.snapshot());
  assert.equal(onDew.action, 'move');
  assert.equal(onDew.targetId, 'hub');
  assert.equal(onDew.goalId, 'bell');
  assert.equal(onDew.layer, bell.layer);
  assert.equal(onDew.banner, '去归响台换层点③');
  assert.match(onDew.detail, /同一位置/);
  assert.match(onDew.banner, /③/);

  light(model, 'bell');
  record('3/3');
  assert.equal(describeNextStep(model.snapshot()).goalId, 'exit');
  assert.ok(seen.length >= 7);
});

test('two anchors are named, and the anchor you already stand on says to switch there', () => {
  const model = start('shell', 401491695);
  assert.equal(model.snapshot().roomId, 'split');
  light(model, 'dew');
  reach(model, 'relay');
  const onRelay = describeNextStep(model.snapshot());
  assert.equal(onRelay.action, 'move');
  assert.equal(onRelay.targetId, 'hub');
  assert.equal(onRelay.goalId, 'bell');
  assert.ok(onRelay.banner.includes('归响台'), `standing on 维度锚台 must name 归响台: ${onRelay.banner}`);
  assert.ok(!onRelay.banner.includes('先回⚓台'), onRelay.banner);
  assert.ok(onRelay.banner.length <= 20, onRelay.banner);
  assert.match(onRelay.detail, /维度锚台/);
  assert.match(onRelay.detail, /归响台/);

  reach(model, 'hub');
  const onHub = describeNextStep(model.snapshot());
  assert.equal(onHub.action, 'move', `already on 归响台 should board W-ramp, got ${onHub.banner}`);
  assert.equal(onHub.targetId, 'bell');
  assert.equal(onHub.banner, '走上斜桥，点亮②');
  assert.ok(onHub.banner.includes('②'), onHub.banner);

  light(model, 'bell');
  light(model, 'bloom');
  reach(model, 'hub');
  const toExit = describeNextStep(model.snapshot());
  assert.equal(toExit.targetId, 'relay');
  assert.ok(toExit.banner.includes('维度锚台'), toExit.banner);
  assert.ok(!toExit.banner.includes('先回⚓台'), toExit.banner);
  assert.ok(toExit.banner.length <= 20, `${toExit.banner} (${toExit.banner.length})`);
  reach(model, 'relay');
  const atRelay = describeNextStep(model.snapshot());
  assert.equal(atRelay.action, 'shift');
  assert.match(atRelay.detail, /就在维度锚台/);
});

test('stage 1 continuous W cannot hide ① or close its bridge', () => {
  const model = start('shell', 2);
  const startW = model.snapshot().w;
  const dew = () => model.snapshot().nodes.find(node => node.id === 'dew');
  assert.equal(dew().present, true);
  for (const raw of [0, 0.661, 0.999, 1, -1, startW - 5, startW + 5]) {
    const clamped = clampIntroductoryW(model.snapshot(), raw);
    model.setW(clamped);
    const after = model.snapshot();
    assert.equal(after.layer, 2, `raw ${raw} stayed on layer 2 at ${clamped}`);
    assert.equal(dew().present, true, `① present at ${clamped} (from ${raw})`);
    assert.equal(after.canMove, true, `bridge to ① still walkable at ${clamped}`);
    model.setW(startW);
  }
  let w = startW;
  for (let i = 0; i < 80; i++) w = clampIntroductoryW(model.snapshot(), w - 0.015);
  model.setW(w);
  assert.equal(dew().present, true);
  assert.equal(model.snapshot().canMove, true);
  for (let i = 0; i < 80; i++) w = clampIntroductoryW(model.snapshot(), w + 0.015);
  model.setW(w);
  assert.equal(dew().present, true);
  assert.equal(model.snapshot().canMove, true);
  assert.ok(Math.abs(w - startW) < 0.12, `clamp stayed near the layer center, got ${w}`);

  model.setW(0.661);
  const hidden = model.snapshot();
  assert.equal(hidden.nodes.find(node => node.id === 'dew').present, false);
  const recover = describeNextStep(hidden);
  assert.equal(recover.action, 'recover');
  assert.match(recover.banner, /回中心/);
  assert.ok(recover.banner.includes('①'), recover.banner);
  assert.ok(recover.banner.length <= 20, recover.banner);
});

test('planLayerRoute still walks to the anchor that actually holds the bridge', () => {
  const model = start('shell', 7);
  const [first, second, third] = model.snapshot().mechanismOrder;
  light(model, first);
  reach(model, 'hub');
  const rampPlan = planLayerRoute(model.snapshot(), second);
  assert.deepEqual(rampPlan.walk.map(s => s.to), ['relay', 'bell'], 'walks via relay onto the W-ramp to ②');
  assert.equal(rampPlan.walk[1].ramp, true);
  assert.equal(rampPlan.shift, null);
  assert.equal(describeNextStep(model.snapshot()).banner, '去维度锚台，走上斜桥点②');

  light(model, second);
  reach(model, 'hub');
  const plan = planLayerRoute(model.snapshot(), third);
  assert.ok(plan.walk.length > 0, 'walks on the current layer before switching at the wrong anchor');
  assert.equal(plan.shift.at, 'relay');
});

test('drifting W after lighting ① never claims an off-layer ② is still on the current layer', () => {
  const model = start('shell', 2);
  light(model, 'dew');
  const baseline = describeNextStep(model.snapshot());
  assert.equal(baseline.goalId, 'bloom');
  assert.equal(baseline.banner, '去归响台，走上斜桥点②');

  for (const driftedW of [0.93, 0.99, 1.0, 0.70]) {
    model.setW(driftedW);
    const state = model.snapshot();
    const bloom = state.nodes.find(node => node.id === 'bloom');
    assert.equal(state.layer, 2, `w=${driftedW} stays in layer 2`);
    assert.equal(bloom.layer, 1);
    assert.equal(bloom.present, false, `bloom is not visible at w=${driftedW}`);
    const step = describeNextStep(state);
    assert.equal(step.goalId, 'bloom');
    assert.notEqual(step.action, 'recover', `w=${driftedW} must not emit same-layer recover for off-layer ②: ${step.banner}`);
    assert.doesNotMatch(step.banner, /回中心见②/);
    assert.doesNotMatch(step.detail, /还在这一层/);
    assert.equal(step.banner, '去归响台，走上斜桥点②');
    assert.equal(step.targetId, 'hub');
    assert.equal(step.layer, state.layer);
    assert.ok(step.banner.length <= 20, step.banner);
    assert.ok(!step.banner.includes('①'), step.banner);
  }

  const centerW = model.snapshot().layers[model.snapshot().layer].center;
  model.setW(centerW);
  const centered = describeNextStep(model.snapshot());
  assert.equal(centered.banner, '去归响台，走上斜桥点②');
  assert.equal(centered.action, 'move');
  assert.equal(centered.targetId, 'hub');

  // Once ② is lit and the player stands on hub in ③'s own layer (flat bridge hub-bell on layer 0),
  // drifting W within that layer DOES legitimately offer same-layer center recovery for ③.
  light(model, 'bloom');
  reach(model, 'hub');
  const bellLayer = model.snapshot().nodes.find(node => node.id === 'bell').layer;
  model.setW(model.snapshot().layers[bellLayer].center);
  model.setW(0.33);
  const onBellLayerDrifted = model.snapshot();
  assert.equal(onBellLayerDrifted.layer, bellLayer);
  assert.equal(onBellLayerDrifted.nodes.find(node => node.id === 'bell').present, false);
  const legitRecover = describeNextStep(onBellLayerDrifted);
  assert.equal(legitRecover.action, 'recover');
  assert.equal(legitRecover.banner, '按Z回中心见③');
  assert.match(legitRecover.detail, /③还在这一层/);
  model.setW(onBellLayerDrifted.layers[onBellLayerDrifted.layer].center);
  assert.equal(model.snapshot().nodes.find(node => node.id === 'bell').present, true);
});

test('seed 5 drifting W after lighting ① never claims an off-layer goal is on the current layer', () => {
  const model = start('shell', 5);
  const first = model.snapshot().mechanismOrder[0];
  light(model, first);
  const originW = model.snapshot().w;
  assert.equal(model.snapshot().layer, 0);
  assert.equal(describeNextStep(model.snapshot()).banner, '去归响台，走上斜桥点②');

  for (const driftedW of [0, 0.01, 0.07, 0.30, 0.339, 0.35, 0.70, 0.93, 1.0]) {
    model.setW(originW);
    model.setW(driftedW);
    const state = model.snapshot();
    const step = describeNextStep(state);
    const goal = state.nodes.find(node => node.id === step.goalId);
    const sym = badgeOf(state, step.goalId);
    assert.ok(step.banner && step.banner.length <= 20, `w=${driftedW}: ${step.banner}`);
    assert.equal(state.activated.includes(step.goalId), false);
    assert.ok(step.banner.includes(sym), `w=${driftedW}: "${step.banner}" names ${sym}`);
    if (goal.layer !== state.layer) {
      assert.doesNotMatch(step.banner, /回中心见/, `w=${driftedW}: off-layer goal claimed at center (${step.banner})`);
      assert.doesNotMatch(step.detail, /还在这一层/, `w=${driftedW}: off-layer goal claimed on current layer (${step.detail})`);
    }
    if (driftedW < 0.34) {
      assert.equal(state.layer, 0);
      assert.equal(step.banner, '去归响台，走上斜桥点②');
      assert.equal(step.action, 'move');
      assert.equal(step.targetId, 'hub');
    }
  }

  model.setW(originW);
  assert.equal(describeNextStep(model.snapshot()).banner, '去归响台，走上斜桥点②');
});

test('seed 4097396765 mobile canvas tap on ③ (bloom) selects bloom instead of hitting WStack layer 0', () => {
  const prevWindow = globalThis.window;
  const listeners = new Map();
  const selected = [];
  const layerSelected = [];
  let rectWidth = 390;
  let rectHeight = 670;
  const ctx = new Proxy({}, {
    get: () => () => ({ width: 20, addColorStop() {} }),
    set: () => true,
  });
  globalThis.window = {
    devicePixelRatio: 2,
    addEventListener() {},
    removeEventListener() {},
    matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }),
  };
  const canvas = {
    style: {},
    getContext: () => ctx,
    getBoundingClientRect: () => ({ width: rectWidth, height: rectHeight, left: 0, top: 0 }),
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type) { listeners.delete(type); },
  };
  const renderer = new SceneRenderer(canvas, {
    onSelect: id => selected.push(id),
    onLayerSelect: layerIdx => layerSelected.push(layerIdx),
  });
  try {
    renderer.visualGuide = true;
    const model = start('shell', 4097396765);
    assert.equal(model.snapshot().roomId, 'cascade');

    // Follow hint sequence: ① dew -> ② bell -> hub (reverse ramp lands on dew's layer) -> shift to bell's layer -> relay -> shift to layer 2 (Ⅲ)
    light(model, 'dew');
    light(model, 'bell');
    reach(model, 'hub');
    const bellLayer = model.snapshot().nodes.find(n => n.id === 'bell').layer;
    const hubShift = describeNextStep(model.snapshot());
    assert.equal(hubShift.action, 'shift');
    assert.equal(hubShift.layer, bellLayer);
    model.setW(model.snapshot().layers[bellLayer].center);
    assert.equal(describeNextStep(model.snapshot()).targetId, 'relay');
    reach(model, 'relay');
    const shiftStep = describeNextStep(model.snapshot());
    assert.equal(shiftStep.action, 'shift');
    assert.equal(shiftStep.layer, 2);
    assert.equal(shiftStep.goalId, 'bloom');

    model.setW(model.snapshot().layers[2].center);
    const atRelayLayer2 = model.snapshot();
    assert.equal(atRelayLayer2.node, 'relay');
    assert.equal(atRelayLayer2.layer, 2);
    const clickBloomStep = describeNextStep(atRelayLayer2);
    assert.equal(clickBloomStep.action, 'move');
    assert.equal(clickBloomStep.targetId, 'bloom');
    assert.equal(clickBloomStep.banner, '点击③，走过去点亮');

    const bloom = atRelayLayer2.nodes.find(node => node.id === 'bloom');
    assert.deepEqual({ x: bloom.x, y: bloom.y, present: bloom.present }, { x: 292, y: 192, present: true });

    const tapWorld = (wx, wy) => {
      const clientX = renderer.offsetX + wx * renderer.scale;
      const clientY = renderer.offsetY + wy * renderer.scale;
      listeners.get('pointerdown')({ pointerId: 1, pointerType: 'touch', button: 0, clientX, clientY });
      listeners.get('pointerup')({ pointerId: 1, pointerType: 'touch', button: 0, clientX, clientY });
    };

    for (const [w, h] of [[390, 670], [320, 568]]) {
      rectWidth = w;
      rectHeight = h;
      renderer.resize();
      renderer.onboardingStage = 3;
      renderer.setState(atRelayLayer2);
      assert.ok(0.45 / renderer.scale > 1.1, `${w}x${h} scales up WStack on mobile`);

      // Tapping bloom center (292, 192) and its upper-left rim (266, 183) must select bloom, never WStack layer 0.
      for (const [dx, dy] of [[0, 0], [-26, -9]]) {
        selected.length = 0;
        layerSelected.length = 0;
        tapWorld(bloom.x + dx, bloom.y + dy);
        assert.deepEqual(layerSelected, [], `${w}x${h} offset (${dx},${dy}) does not trigger WStack layer switch`);
        assert.deepEqual(selected, ['bloom'], `${w}x${h} offset (${dx},${dy}) selects bloom`);
      }

      // Tapping the actual WStack plane diamonds still selects layers 0, 1, 2 cleanly.
      const miniScale = Math.min(1.2, Math.max(1, 0.45 / renderer.scale));
      for (const layerIdx of [0, 1, 2]) {
        selected.length = 0;
        layerSelected.length = 0;
        tapWorld(62 + 64 * miniScale, 88 + (24 + (2 - layerIdx) * 29) * miniScale);
        assert.deepEqual(layerSelected, [layerIdx], `${w}x${h} WStack diamond ${layerIdx} selects layer ${layerIdx}`);
        assert.deepEqual(selected, []);
      }
    }
  } finally {
    renderer.destroy();
    globalThis.window = prevWindow;
  }
});

function followHintsFromAfterFirstLight(model, { discreteShift = false, maxStepsToSecond = 30, maxRoomSteps = 40 } = {}) {
  const initial = model.snapshot();
  const [, secondId, thirdId] = initial.mechanismOrder;
  assert.equal(initial.activated.length, 1, 'starts immediately after lighting ①');
  const visited = [];
  let stepsToSecond = null;

  for (let stepIdx = 1; stepIdx <= maxRoomSteps; stepIdx++) {
    const state = model.snapshot();
    if (state.phase === 'interlude' || state.room >= 1) break;
    const hint = describeNextStep(state);
    assert.ok(hint.banner && hint.banner.length <= 20, `step ${stepIdx} invalid banner: "${hint.banner}"`);
    assert.equal(
      hint.goalId === 'exit' || !state.activated.includes(hint.goalId),
      true,
      `step ${stepIdx} targets already-lit ${hint.goalId}: "${hint.banner}"`,
    );
    assert.ok(
      hint.banner.includes(badgeOf(state, hint.goalId)),
      `step ${stepIdx} "${hint.banner}" must name ${badgeOf(state, hint.goalId)}`,
    );

    const sig = `${state.node}@${state.layer}|${state.activated.join(',')}|${hint.action}:${hint.banner}`;
    if (visited.length >= 2) {
      assert.notEqual(
        sig,
        visited[visited.length - 2],
        `2-cycle detected: ${visited.slice(-2).join(' -> ')} -> ${sig}`,
      );
    }
    visited.push(sig);

    if (hint.action === 'move' || hint.action === 'done') {
      const dest = hint.targetId || hint.goalId;
      const beforeLayer = state.layer;
      reach(model, dest);
      if (model.snapshot().phase === 'playing') {
        const expectedLayer = hint.ramp ? hint.toLayer : beforeLayer;
        assert.equal(model.snapshot().layer, expectedLayer, `move hint "${hint.banner}" lands on layer ${expectedLayer}`);
      }
    } else if (hint.action === 'shift') {
      assert.ok(Number.isInteger(hint.layer) && hint.layer !== state.layer, `valid target layer on "${hint.banner}"`);
      const nextLayer = discreteShift
        ? state.layer + Math.sign(hint.layer - state.layer)
        : hint.layer;
      model.setW(state.layers[nextLayer].center);
      advance(model, 0.05);
      const after = model.snapshot();
      const footing = after.nodes.find(node => node.id === after.node);
      assert.equal(
        Boolean(footing && (footing.anchor || footing.layer === after.layer)),
        true,
        `shift "${hint.banner}" landed on unsupported ${after.node}@${after.layer}`,
      );
      assert.ok(after.phaseStability >= 0.99, `shift "${hint.banner}" decayed phaseStability (${after.phaseStability})`);
    } else if (hint.action === 'activate') {
      light(model, hint.goalId);
    } else if (hint.action === 'recover') {
      model.setW(state.layers[hint.layer].center);
      advance(model, 0.05);
    } else {
      advance(model, 0.35);
    }

    if (stepsToSecond === null && model.snapshot().activated.includes(secondId)) {
      stepsToSecond = stepIdx;
      assert.ok(stepsToSecond <= maxStepsToSecond, `lit ② in ${stepsToSecond} steps (limit ${maxStepsToSecond})`);
    }
  }

  assert.notEqual(stepsToSecond, null, `must light ② (${secondId}) within ${maxStepsToSecond} steps: ${visited.join(' -> ')}`);
  const done = model.snapshot();
  assert.ok(done.activated.includes(secondId), 'lit ②');
  assert.ok(done.activated.includes(thirdId), 'lit ③');
  assert.equal(done.phase, 'interlude', `cleared Room 0 to interlude: ${visited.join(' -> ')}`);
  assert.equal(done.stats.failures, 0, 'zero falls while following hints');
  return { stepsToSecond, totalSteps: visited.length };
}

test('seeds 42, 90210, 2026111 route via anchor instead of void same_xyz on dew and clear Room 0 without 2-cycle', () => {
  for (const seed of [42, 90210, 2026111]) {
    const model = start('shell', seed);
    const [firstId, secondId] = model.snapshot().mechanismOrder;
    assert.equal(firstId, 'dew');
    assert.equal(secondId, 'bell');

    light(model, 'dew');
    const atDew = model.snapshot();
    const dew = atDew.nodes.find(node => node.id === 'dew');
    const bell = atDew.nodes.find(node => node.id === 'bell');
    assert.equal(atDew.node, 'dew');
    assert.equal(atDew.layer, dew.layer);
    assert.ok(Math.hypot(dew.world.x - bell.world.x, dew.world.y - bell.world.y, dew.world.z - bell.world.z) < 1e-4);
    assert.equal(Math.abs(bell.layer - dew.layer), 2, `seed ${seed}: dew and bell sit on non-adjacent layers`);

    // Standing on dew in dew's own layer: next hint must NOT be a same_xyz shift across an empty middle slice;
    // it walks back to 归响台 and boards the 0-shift W-ramp to ②.
    const plan = planLayerRoute(atDew, 'bell');
    assert.equal(plan.shift, null, `seed ${seed}: W-ramp reaches ② with zero manual shifts`);
    assert.equal(plan.walk[0]?.to, 'hub', `seed ${seed}: walks to 归响台 first`);
    assert.equal(plan.walk[1]?.to, 'bell');
    assert.equal(plan.walk[1]?.ramp, true);
    assert.equal(plan.walk[1]?.toLayer, bell.layer);

    const nextHint = describeNextStep(atDew);
    assert.equal(nextHint.action, 'move', `seed ${seed}: standing on dew moves to anchor, got ${nextHint.banner}`);
    assert.equal(nextHint.targetId, 'hub');
    assert.equal(nextHint.goalId, 'bell');
    assert.equal(nextHint.banner, '去归响台，走上斜桥点②');
    assert.doesNotMatch(nextHint.banner, /显现②/);

    // If the player is already stranded on the unsupported middle layer, recover returns to dew's layer,
    // and the step after stabilizing moves to 归响台 rather than sending them back into the void.
    const midLayer = (dew.layer + bell.layer) / 2;
    model.setW(atDew.layers[midLayer].center);
    const stranded = model.snapshot();
    assert.equal(stranded.node, 'dew');
    assert.equal(stranded.layer, midLayer);
    const recoverHint = describeNextStep(stranded);
    assert.equal(recoverHint.action, 'shift');
    assert.equal(recoverHint.layer, dew.layer);
    assert.match(recoverHint.banner, /回Ⅲ站稳/);
    model.setW(stranded.layers[recoverHint.layer].center);
    const stabilizedHint = describeNextStep(model.snapshot());
    assert.equal(stabilizedHint.action, 'move');
    assert.equal(stabilizedHint.targetId, 'hub');
    assert.equal(stabilizedHint.banner, '去归响台，走上斜桥点②');

    // Repeatedly executing describeNextStep clears ② within <= 30 steps, then ③ and exit (both setW and 1-layer steps).
    const directRun = followHintsFromAfterFirstLight(model, { discreteShift: false, maxStepsToSecond: 30 });
    assert.ok(directRun.stepsToSecond <= 30);

    const discreteModel = start('shell', seed);
    light(discreteModel, 'dew');
    const discreteRun = followHintsFromAfterFirstLight(discreteModel, { discreteShift: true, maxStepsToSecond: 30 });
    assert.ok(discreteRun.stepsToSecond <= 30);
  }
});

test('adjacent completable same_xyz seeds keep in-place transfer and all established seeds clear Room 0 by hints', () => {
  for (const seed of [401491695, 4097396765, 31337, 123456789]) {
    const model = start('shell', seed);
    light(model, 'dew');
    const atDew = model.snapshot();
    const dew = atDew.nodes.find(node => node.id === 'dew');
    const bell = atDew.nodes.find(node => node.id === 'bell');
    assert.equal(Math.abs(bell.layer - dew.layer), 1, `seed ${seed}: dew and bell are on adjacent layers`);

    const plan = planLayerRoute(atDew, 'bell');
    assert.equal(plan.shift, null, `seed ${seed}: 0-shift W-ramp is preferred over same_xyz in Room 0`);
    assert.equal(plan.walk[0]?.to, 'hub');
    assert.equal(plan.walk[1]?.to, 'bell');
    assert.equal(plan.walk[1]?.ramp, true);
    assert.equal(plan.walk[1]?.toLayer, bell.layer);

    const hint = describeNextStep(atDew);
    assert.equal(hint.action, 'move');
    assert.equal(hint.targetId, 'hub');
    assert.equal(hint.banner, '去归响台，走上斜桥点②');

    model.setW(atDew.layers[bell.layer].center);
    const transferred = model.snapshot();
    assert.equal(transferred.node, 'bell', `seed ${seed}: manual 1-layer shift on dew still transfers footing directly onto bell`);
    assert.equal(transferred.layer, bell.layer);
    assert.equal(transferred.phaseStability, 1);
  }

  for (const seed of [2, 401491695, 4097396765, 5, 777, 31337, 123456789, 7]) {
    for (const discreteShift of [false, true]) {
      const model = start('shell', seed);
      light(model, model.snapshot().mechanismOrder[0]);
      followHintsFromAfterFirstLight(model, { discreteShift, maxStepsToSecond: 30 });
    }
  }
});

test('Stage 2 fixed onboarding copy aligns with 归响台 / 维度锚台 and never says 换层台', () => {
  for (const stage of ONBOARDING_STAGES) {
    assert.ok(!stage.title.includes('换层台'), `stage ${stage.stage} title must not say 换层台: ${stage.title}`);
    assert.ok(!stage.instruction.includes('换层台'), `stage ${stage.stage} instruction must not say 换层台: ${stage.instruction}`);
    assert.ok(!stage.badge.includes('换层台'), `stage ${stage.stage} badge must not say 换层台: ${stage.badge}`);
  }
  const stage2 = ONBOARDING_STAGES.find(s => s.stage === 2);
  assert.ok(stage2, 'Stage 2 exists');
  assert.equal(stage2.id, 'slice_shift');
  assert.ok(stage2.title.length <= 20, `Stage 2 title stays <= 20 chars: "${stage2.title}" (${stage2.title.length})`);
  assert.ok(stage2.title.includes('⚓ 归响台'), `Stage 2 title names ⚓ 归响台: ${stage2.title}`);
  assert.ok(stage2.instruction.includes('⚓ 归响台'), `Stage 2 instruction names ⚓ 归响台: ${stage2.instruction}`);
  assert.ok(stage2.instruction.includes('⚓ 维度锚台'), `Stage 2 instruction names ⚓ 维度锚台: ${stage2.instruction}`);
});

test('following describeNextStep clears all 3 courtyards (rooms 0, 1, 2) to won even when computeStage is 4', () => {
  for (const seed of [2, 42, 401491695, 4097396765]) {
    const model = start('shell', seed);
    const onboarding = new ProgressiveOnboarding({ storage: null });
    assert.equal(model.snapshot().roomTotal, 3, `seed ${seed} intro run has 3 rooms`);
    let sawStage4HintInRoom1 = false;
    let sawStage4HintInRoom2 = false;

    for (const expectedRoom of [0, 1, 2]) {
      assert.equal(model.snapshot().room, expectedRoom, `seed ${seed} enters room ${expectedRoom}`);
      assert.equal(model.snapshot().phase, 'playing');

      let cleared = false;
      for (let stepIdx = 1; stepIdx <= 45; stepIdx++) {
        const state = model.snapshot();
        if (state.phase !== 'playing') {
          cleared = true;
          break;
        }
        const stageInfo = onboarding.computeStage(state, 0);
        const hint = describeNextStep(state);
        assert.ok(hint.banner && hint.banner.length <= 20,
          `seed ${seed} room ${expectedRoom} step ${stepIdx}: valid banner "${hint.banner}"`);
        assert.notEqual(hint.banner, stageInfo.title,
          `seed ${seed} room ${expectedRoom} step ${stepIdx}: hint must be concrete next step, not stage summary "${stageInfo.title}"`);
        assert.ok(hint.banner.includes(badgeOf(state, hint.goalId)),
          `seed ${seed} room ${expectedRoom} step ${stepIdx}: "${hint.banner}" names ${badgeOf(state, hint.goalId)}`);
        if (expectedRoom === 1 && stageInfo.stage === 4) sawStage4HintInRoom1 = true;
        if (expectedRoom === 2) {
          assert.equal(stageInfo.stage, 4, `seed ${seed} room 2 is at stage 4 from entry`);
          sawStage4HintInRoom2 = true;
        }

        if (hint.action === 'move' || hint.action === 'done') {
          reach(model, hint.targetId || hint.goalId);
        } else if (hint.action === 'shift' || hint.action === 'recover') {
          model.setW(state.layers[hint.layer].center);
          advance(model, 0.05);
        } else if (hint.action === 'activate') {
          light(model, hint.goalId);
        } else {
          advance(model, 0.35);
        }
      }

      if (!cleared) assert.notEqual(model.snapshot().phase, 'playing', `seed ${seed} room ${expectedRoom} cleared within 45 steps`);
      assert.equal(model.snapshot().stats.failures, 0, `seed ${seed} room ${expectedRoom} zero falls`);

      if (expectedRoom < 2) {
        assert.equal(model.snapshot().phase, 'interlude', `seed ${seed} room ${expectedRoom} reaches interlude`);
        assert.equal(model.chooseRelic(model.snapshot().choices[0].id), true);
      } else {
        assert.equal(model.snapshot().phase, 'won', `seed ${seed} room 2 reaches won`);
      }
    }

    assert.equal(sawStage4HintInRoom1, true, `seed ${seed}: room 1 late steps reach stage 4 while keeping concrete hints`);
    assert.equal(sawStage4HintInRoom2, true, `seed ${seed}: room 2 stays on concrete hints at stage 4`);
  }
});
