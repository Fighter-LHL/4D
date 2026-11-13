import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  ONBOARDING_STAGES,
  ProgressiveOnboarding,
  computeRelicHudStatus,
  describeNextStep,
  isCoarsePointer,
  planLayerRoute,
  clampIntroductoryW,
} from '../src/progressive-onboarding.js';
import { GameModel } from '../src/model.js';
import { SceneRenderer } from '../src/scene.js';
import { start, reach, advance } from './model-helpers.js';

const badgeOf = (state, id) => {
  if (id === 'exit') return '🚪';
  const index = state.mechanismOrder.indexOf(id);
  return ['①', '②', '③', '④'][index];
};

function assertSingleStepHonest(state, step, label = '') {
  const prefix = label ? `${label}: ` : '';
  const goalBadge = badgeOf(state, step.goalId);
  assert.ok(step.banner && step.banner.length <= 10,
    `${prefix}banner must be 1..10 chars, got "${step.banner}" (${step.banner?.length})`);
  assert.doesNotMatch(step.banner, /再点|再去/,
    `${prefix}banner must never chain two actions ("${step.banner}")`);
  if (step.targetId !== step.goalId) {
    if (step.action === 'move' || step.action === 'recover') {
      assert.ok(!step.banner.includes(goalBadge),
        `${prefix}waypoint ${step.action} to ${step.targetId} must not promise ${goalBadge} in banner "${step.banner}"`);
      assert.doesNotMatch(step.banner, /点亮|过关|去🚪|点[①②③④]/,
        `${prefix}waypoint ${step.action} must only state current step: "${step.banner}"`);
      assert.ok(step.detail.includes(goalBadge),
        `${prefix}detail should still preserve overall goal context ${goalBadge}: "${step.detail}"`);
    } else if (step.action === 'shift') {
      const plan = planLayerRoute(state, step.goalId);
      const firstShiftIdx = plan ? plan.steps.findIndex(s => s.type === 'shift') : -1;
      const afterFirstShift = firstShiftIdx >= 0 ? plan.steps.slice(firstShiftIdx + 1) : [];
      const directSameXyz = plan?.shift?.kind === 'same_xyz' && plan.shift.to === step.goalId && afterFirstShift.length === 0;
      const directAnchorWalk = plan?.shift?.kind === 'anchor' && firstShiftIdx >= 0 && !afterFirstShift.some(s => s.type === 'shift');
      if (!directSameXyz && !directAnchorWalk) {
        assert.ok(!step.banner.includes(goalBadge),
          `${prefix}indirect shift on ${state.node} must not promise ${goalBadge} in banner "${step.banner}"`);
        assert.doesNotMatch(step.banner, /点亮|显现|去🚪|点[①②③④]/,
          `${prefix}indirect shift must not over-promise immediate goal action: "${step.banner}"`);
      } else {
        assert.ok(step.banner.includes(goalBadge),
          `${prefix}direct shift "${step.banner}" names ${goalBadge}`);
      }
    }
  } else if (step.action !== 'shift') {
    assert.ok(step.banner.includes(goalBadge),
      `${prefix}direct step "${step.banner}" names ${goalBadge}`);
  }
}

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
    assert.equal(step.goalId === 'exit' || !state.activated.includes(step.goalId), true, `${label} goal ${step.goalId} is already lit`);
    assertSingleStepHonest(state, step, label);
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
  assert.equal(describeNextStep(model.snapshot()).banner, '去归响走斜桥');
  reach(model, 'hub');
  record('1/3 at hub');
  const bloomLayer = model.snapshot().nodes.find(n => n.id === 'bloom').layer;
  const toBloom = planLayerRoute(model.snapshot(), 'bloom');
  assert.equal(toBloom.shift, null, 'from the hub the W-ramp reaches ② without a manual shift');
  assert.equal(toBloom.walk.length, 1);
  assert.equal(toBloom.walk[0].to, 'bloom');
  assert.equal(toBloom.walk[0].ramp, true);
  assert.equal(toBloom.walk[0].toLayer, bloomLayer);
  assert.equal(describeNextStep(model.snapshot()).banner, '走上斜桥点亮②');

  light(model, 'bloom');
  record('2/3 on bloom');
  assert.equal(describeNextStep(model.snapshot()).goalId, 'bell');
  assert.equal(describeNextStep(model.snapshot()).banner, '沿斜桥回归响');
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
  assert.equal(onDew.banner, '去归响换层');
  assert.match(onDew.detail, /同一位置/);
  assert.doesNotMatch(onDew.banner, /③/);
  assert.match(onDew.detail, /③/);

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
  assert.ok(onRelay.banner.includes('归响'), `standing on 维度锚台 must distinguish 归响: ${onRelay.banner}`);
  assert.ok(!onRelay.banner.includes('先回⚓台'), onRelay.banner);
  assert.ok(onRelay.banner.length <= 10, onRelay.banner);
  assert.match(onRelay.detail, /维度锚台/);
  assert.match(onRelay.detail, /归响台/);

  reach(model, 'hub');
  const onHub = describeNextStep(model.snapshot());
  assert.equal(onHub.action, 'move', `already on 归响台 should board W-ramp, got ${onHub.banner}`);
  assert.equal(onHub.targetId, 'bell');
  assert.equal(onHub.banner, '走上斜桥点亮②');
  assert.ok(onHub.banner.includes('②'), onHub.banner);

  light(model, 'bell');
  light(model, 'bloom');
  reach(model, 'hub');
  const toExit = describeNextStep(model.snapshot());
  assert.equal(toExit.targetId, 'relay');
  assert.ok(toExit.banner.includes('维度'), toExit.banner);
  assert.match(toExit.detail, /维度锚台/);
  assert.ok(!toExit.banner.includes('先回⚓台'), toExit.banner);
  assert.ok(toExit.banner.length <= 10, `${toExit.banner} (${toExit.banner.length})`);
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
  // On dew in return room, the W-ramp starts at relay (2 hops away via hub), so hub is an intermediate hop
  assert.equal(describeNextStep(model.snapshot()).banner, '先去归响');
  reach(model, 'hub');
  const rampPlan = planLayerRoute(model.snapshot(), second);
  assert.deepEqual(rampPlan.walk.map(s => s.to), ['relay', 'bell'], 'walks via relay onto the W-ramp to ②');
  assert.equal(rampPlan.walk[1].ramp, true);
  assert.equal(rampPlan.shift, null);
  assert.equal(describeNextStep(model.snapshot()).banner, '去维度走斜桥');

  light(model, second);
  reach(model, 'hub');
  const plan = planLayerRoute(model.snapshot(), third);
  assert.ok(plan.walk.length > 0, 'walks on the current layer before switching at the wrong anchor');
  assert.equal(plan.shift.at, 'relay');
  assert.equal(describeNextStep(model.snapshot()).banner, '去维度换层');
});

test('drifting W after lighting ① never claims an off-layer ② is still on the current layer', () => {
  const model = start('shell', 2);
  light(model, 'dew');
  const baseline = describeNextStep(model.snapshot());
  assert.equal(baseline.goalId, 'bloom');
  assert.equal(baseline.banner, '去归响走斜桥');

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
    assert.equal(step.banner, '去归响走斜桥');
    assert.equal(step.targetId, 'hub');
    assert.equal(step.layer, state.layer);
    assertSingleStepHonest(state, step, `seed 2 w=${driftedW}`);
    assert.ok(!step.banner.includes('①'), step.banner);
  }

  const centerW = model.snapshot().layers[model.snapshot().layer].center;
  model.setW(centerW);
  const centered = describeNextStep(model.snapshot());
  assert.equal(centered.banner, '去归响走斜桥');
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
  assert.equal(describeNextStep(model.snapshot()).banner, '去归响走斜桥');

  for (const driftedW of [0, 0.01, 0.07, 0.30, 0.339, 0.35, 0.70, 0.93, 1.0]) {
    model.setW(originW);
    model.setW(driftedW);
    const state = model.snapshot();
    const step = describeNextStep(state);
    const goal = state.nodes.find(node => node.id === step.goalId);
    assert.equal(state.activated.includes(step.goalId), false);
    assertSingleStepHonest(state, step, `seed 5 w=${driftedW}`);
    if (goal.layer !== state.layer) {
      assert.doesNotMatch(step.banner, /回中心见/, `w=${driftedW}: off-layer goal claimed at center (${step.banner})`);
      assert.doesNotMatch(step.detail, /还在这一层/, `w=${driftedW}: off-layer goal claimed on current layer (${step.detail})`);
    }
    if (driftedW < 0.34) {
      assert.equal(state.layer, 0);
      assert.equal(step.banner, '去归响走斜桥');
      assert.equal(step.action, 'move');
      assert.equal(step.targetId, 'hub');
    }
  }

  model.setW(originW);
  assert.equal(describeNextStep(model.snapshot()).banner, '去归响走斜桥');
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
    assert.equal(clickBloomStep.banner, '点击③走去点亮');

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
    assert.equal(
      hint.goalId === 'exit' || !state.activated.includes(hint.goalId),
      true,
      `step ${stepIdx} targets already-lit ${hint.goalId}: "${hint.banner}"`,
    );
    assertSingleStepHonest(state, hint, `step ${stepIdx}`);

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
    assert.equal(nextHint.banner, '去归响走斜桥');
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
    assert.equal(recoverHint.banner, '上滚回Ⅲ站稳');
    model.setW(stranded.layers[recoverHint.layer].center);
    const stabilizedHint = describeNextStep(model.snapshot());
    assert.equal(stabilizedHint.action, 'move');
    assert.equal(stabilizedHint.targetId, 'hub');
    assert.equal(stabilizedHint.banner, '去归响走斜桥');

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
    assert.equal(hint.banner, '去归响走斜桥');

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
  assert.ok(stage2.title.length <= 10, `Stage 2 title stays <= 10 chars: "${stage2.title}" (${stage2.title.length})`);
  assert.ok(!stage2.title.includes('站在 ⚓ 归响台上滚轮'), `Stage 2 title must not say obsolete wheel prompt: ${stage2.title}`);
  assert.ok(stage2.title.includes('⚓') && stage2.title.includes('W尺'), `Stage 2 title names ⚓ and W尺: ${stage2.title}`);
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
        assert.notEqual(hint.banner, stageInfo.title,
          `seed ${seed} room ${expectedRoom} step ${stepIdx}: hint must be concrete next step, not stage summary "${stageInfo.title}"`);
        assertSingleStepHonest(state, hint, `seed ${seed} room ${expectedRoom} step ${stepIdx}`);
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

test('touch / coarsePointer hints replace wheel copy across shift, same_xyz, and recover while desktop defaults stay unchanged', () => {
  const WHEEL_RE = /上滚|下滚|滚轮/;

  // 1. Anchor shift to mechanism: 下滚到Ⅰ点亮③ -> 点Ⅰ点亮③
  const mShift = start('shell', 2);
  light(mShift, 'dew');
  light(mShift, 'bloom');
  reach(mShift, 'hub');
  const shiftState = mShift.snapshot();
  const desktopShift = describeNextStep(shiftState);
  const touchShift = describeNextStep(shiftState, { coarsePointer: true });
  assert.equal(desktopShift.action, 'shift');
  assert.equal(desktopShift.banner, '下滚到Ⅰ点亮③');
  assert.match(desktopShift.detail, /或下滚/);
  assert.equal(touchShift.action, 'shift');
  assert.equal(touchShift.layer, desktopShift.layer);
  assert.equal(touchShift.banner, '点Ⅰ点亮③');
  assert.doesNotMatch(touchShift.banner, WHEEL_RE);
  assert.doesNotMatch(touchShift.detail, WHEEL_RE);
  assert.match(touchShift.detail, /右侧 W 尺Ⅰ珠/);

  // Walk-to-anchor-before-shift detail also drops "（或滚轮）" on coarse pointers
  mShift.setW(shiftState.layers[shiftState.nodes.find(n => n.id === 'dew').layer].center);
  reach(mShift, 'dew');
  const walkBeforeShiftDesktop = describeNextStep(mShift.snapshot());
  const walkBeforeShiftTouch = describeNextStep(mShift.snapshot(), { coarsePointer: true });
  assert.equal(walkBeforeShiftDesktop.banner, '去归响换层');
  assert.match(walkBeforeShiftDesktop.detail, /滚轮/);
  assert.equal(walkBeforeShiftTouch.banner, '去归响换层');
  assert.doesNotMatch(walkBeforeShiftTouch.banner, WHEEL_RE);
  assert.doesNotMatch(walkBeforeShiftTouch.detail, WHEEL_RE);
  assert.match(walkBeforeShiftTouch.detail, /右侧 W 尺Ⅰ珠/);

  // 2. Anchor shift toward exit: indirect multi-shift at hub (下滚到Ⅱ层 -> 点Ⅱ换层) & direct shift at relay (去🚪)
  const mExit = start('shell', 31337);
  for (const id of mExit.snapshot().mechanismOrder) light(mExit, id);
  reach(mExit, 'hub');
  mExit.setW(mExit.snapshot().layers[2].center);
  const exitShiftState = mExit.snapshot();
  const desktopExitShift = describeNextStep(exitShiftState);
  const touchExitShift = describeNextStep(exitShiftState, { coarsePointer: true });
  assert.equal(desktopExitShift.action, 'shift');
  assert.equal(desktopExitShift.banner, '下滚到Ⅱ层');
  assert.equal(touchExitShift.action, 'shift');
  assert.equal(touchExitShift.layer, 1);
  assert.equal(touchExitShift.banner, '点Ⅱ换层');
  assert.doesNotMatch(touchExitShift.banner, WHEEL_RE);
  assert.doesNotMatch(touchExitShift.detail, WHEEL_RE);
  assert.match(touchExitShift.detail, /右侧 W 尺Ⅱ珠/);

  reach(mExit, 'relay');
  mExit.setW(mExit.snapshot().layers[1].center);
  const directExitState = mExit.snapshot();
  const directDesktopExit = describeNextStep(directExitState);
  const directTouchExit = describeNextStep(directExitState, { coarsePointer: true });
  assert.equal(directDesktopExit.action, 'shift');
  assert.match(directDesktopExit.banner, /^(上滚|下滚)到[ⅠⅡⅢ]去🚪$/);
  assert.equal(directTouchExit.action, 'shift');
  assert.match(directTouchExit.banner, /^点[ⅠⅡⅢ]去🚪$/);
  assert.doesNotMatch(directTouchExit.banner, WHEEL_RE);
  assert.doesNotMatch(directTouchExit.detail, WHEEL_RE);

  // 3. same_xyz shift (must include target layer Roman numeral): 站①下滚显现② -> 站①点Ⅱ显现②
  const mSame = start('shell', 42);
  for (const id of mSame.snapshot().mechanismOrder) light(mSame, id);
  reach(mSame, 'exit');
  assert.equal(mSame.chooseRelic(mSame.snapshot().choices[0].id), true);
  light(mSame, mSame.snapshot().mechanismOrder[0]);
  const sameState = mSame.snapshot();
  const desktopSame = describeNextStep(sameState);
  const touchSame = describeNextStep(sameState, { coarsePointer: true });
  assert.equal(desktopSame.action, 'shift');
  assert.equal(desktopSame.banner, '站①下滚显现②');
  assert.equal(touchSame.action, 'shift');
  assert.equal(touchSame.layer, 1);
  assert.equal(touchSame.banner, '站①点Ⅱ显现②');
  assert.doesNotMatch(touchSame.banner, WHEEL_RE);
  assert.doesNotMatch(touchSame.detail, WHEEL_RE);
  assert.match(touchSame.detail, /同一位置/);
  assert.match(touchSame.detail, /右侧 W 尺Ⅱ珠/);

  // 4. recover shift (both downward to Ⅰ and upward to Ⅲ): 下滚回Ⅰ站稳 -> 点Ⅰ回层站稳
  const mRecoverDown = start('shell', 5);
  light(mRecoverDown, 'dew');
  light(mRecoverDown, 'bloom');
  reach(mRecoverDown, 'dew');
  mRecoverDown.setW(mRecoverDown.snapshot().layers[1].center);
  const recoverDownState = mRecoverDown.snapshot();
  const desktopRecoverDown = describeNextStep(recoverDownState);
  const touchRecoverDown = describeNextStep(recoverDownState, { coarsePointer: true });
  assert.equal(desktopRecoverDown.action, 'shift');
  assert.equal(desktopRecoverDown.banner, '下滚回Ⅰ站稳');
  assert.equal(touchRecoverDown.action, 'shift');
  assert.equal(touchRecoverDown.layer, 0);
  assert.equal(touchRecoverDown.banner, '点Ⅰ回层站稳');
  assert.doesNotMatch(touchRecoverDown.banner, WHEEL_RE);
  assert.doesNotMatch(touchRecoverDown.detail, WHEEL_RE);
  assert.match(touchRecoverDown.detail, /右侧 W 尺Ⅰ珠/);

  const mRecoverUp = start('shell', 42);
  light(mRecoverUp, 'dew');
  mRecoverUp.setW(mRecoverUp.snapshot().layers[1].center);
  const recoverUpState = mRecoverUp.snapshot();
  assert.equal(describeNextStep(recoverUpState).banner, '上滚回Ⅲ站稳');
  const touchRecoverUp = describeNextStep(recoverUpState, { coarsePointer: true });
  assert.equal(touchRecoverUp.banner, '点Ⅲ回层站稳');
  assert.doesNotMatch(touchRecoverUp.banner, WHEEL_RE);
  assert.doesNotMatch(touchRecoverUp.detail, WHEEL_RE);

  // 5. Charged prism positioningHint on an anchor avoids wheel copy when coarsePointer is true
  const prismAnchorState = {
    ...shiftState,
    relics: { ...shiftState.relics, prism: 1 },
    charge: 1,
    abilities: [{ id: 'prism', available: false }],
  };
  const desktopPrismHud = computeRelicHudStatus(prismAnchorState);
  const touchPrismHud = computeRelicHudStatus(prismAnchorState, { coarsePointer: true });
  assert.match(desktopPrismHud.positioningHint, /下滚/);
  assert.doesNotMatch(touchPrismHud.positioningHint, WHEEL_RE);
  assert.match(touchPrismHud.positioningHint, /右侧 W 尺 Ⅰ 珠/);
});

test('isCoarsePointer defaults to desktop without window and detects pointer:coarse / touch', () => {
  assert.equal(isCoarsePointer(undefined, undefined), false);
  assert.equal(
    isCoarsePointer({ matchMedia: q => ({ matches: q === '(pointer: fine)' }) }, { maxTouchPoints: 0 }),
    false,
  );
  assert.equal(
    isCoarsePointer({ matchMedia: q => ({ matches: q === '(pointer: coarse)' }) }, { maxTouchPoints: 5 }),
    true,
  );
  assert.equal(
    isCoarsePointer({ ontouchstart: null }, { maxTouchPoints: 1 }),
    true,
  );
  // Touchscreen laptop with fine primary pointer keeps desktop wheel copy
  assert.equal(
    isCoarsePointer({ matchMedia: q => ({ matches: q === '(pointer: fine)' }), ontouchstart: null }, { maxTouchPoints: 10 }),
    false,
  );

  const m = start('shell', 2);
  light(m, 'dew');
  light(m, 'bloom');
  reach(m, 'hub');
  const snap = m.snapshot();
  const prevWin = globalThis.window;
  try {
    delete globalThis.window;
    assert.equal(describeNextStep(snap).banner, '下滚到Ⅰ点亮③');
    globalThis.window = { matchMedia: q => ({ matches: q === '(pointer: coarse)' }), navigator: { maxTouchPoints: 5 } };
    assert.equal(describeNextStep(snap).banner, '点Ⅰ点亮③');
    assert.equal(describeNextStep(snap, { coarsePointer: false }).banner, '下滚到Ⅰ点亮③');
  } finally {
    globalThis.window = prevWin;
  }
});

test('coarsePointer hints clear all 3 courtyards across standard seeds without any wheel words', () => {
  const WHEEL_RE = /上滚|下滚|滚轮/;
  const ROMAN_BY_LAYER = ['Ⅰ', 'Ⅱ', 'Ⅲ'];
  for (const seed of [2, 42, 401491695, 4097396765, 5, 777, 31337, 123456789, 90210, 2026111]) {
    const model = start('shell', seed);
    for (const expectedRoom of [0, 1, 2]) {
      assert.equal(model.snapshot().room, expectedRoom);
      for (let stepIdx = 1; stepIdx <= 45; stepIdx++) {
        const state = model.snapshot();
        if (state.phase !== 'playing') break;
        const hint = describeNextStep(state, { coarsePointer: true });
        assertSingleStepHonest(state, hint, `touch seed ${seed} r${expectedRoom} s${stepIdx}`);
        assert.doesNotMatch(hint.banner, WHEEL_RE, `seed ${seed} r${expectedRoom} banner has wheel word: "${hint.banner}"`);
        assert.doesNotMatch(hint.detail, WHEEL_RE, `seed ${seed} r${expectedRoom} detail has wheel word: "${hint.detail}"`);
        if (hint.action === 'shift') {
          assert.ok(
            hint.banner.includes(`点${ROMAN_BY_LAYER[hint.layer]}`),
            `seed ${seed} r${expectedRoom} shift banner must name 点${ROMAN_BY_LAYER[hint.layer]}: "${hint.banner}"`,
          );
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
      if (expectedRoom < 2) {
        assert.equal(model.snapshot().phase, 'interlude');
        assert.equal(model.chooseRelic(model.snapshot().choices[0].id), true);
      } else {
        assert.equal(model.snapshot().phase, 'won');
      }
    }
  }
});

test('target W-ruler bead CSS defines visible #ff7b5a pulse, solid target ring, 44px hit box, and reduced-motion override', () => {
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(css, /@keyframes ruler-target-pulse\{0%,100%\{[^}]+\}50%\{[^}]*scale\(1\.12\)[^}]*rgba\(255,123,90,\.85\)\}\}/);
  assert.match(css, /@keyframes ruler-target-ring\{0%,100%\{[^}]+\}50%\{[^}]*scale\(1\.22\)[^}]*opacity:1\}\}/);
  assert.match(css, /html\.theater #layer-controls button\{[^}]*width:44px;height:44px;min-width:44px;min-height:44px/);
  assert.match(
    css,
    /html\.theater #layer-controls button\.attention-action:not\(\[aria-pressed="true"\]\)::before\{[^}]*border:2\.5px solid #ff7b5a[^}]*animation:ruler-target-pulse/,
  );
  assert.match(
    css,
    /html\.theater #layer-controls button\.attention-action:not\(\[aria-pressed="true"\]\) \.target-ring-svg\{display:block;animation:ruler-target-ring/,
  );
  assert.match(
    css,
    /@media\(prefers-reduced-motion:reduce\)\{[\s\S]*?button\.attention-action:not\(\[aria-pressed="true"\]\)::before,html\.theater #layer-controls button\.attention-action:not\(\[aria-pressed="true"\]\) \.target-ring-svg\{animation:none\}/,
  );
});

test('P2-5 single-step honest waypoint & multi-hop banners never promise a second action across exit, multi-anchor, multi-shift, and triad cases', () => {
  const ANCHOR_RE = /(?:到|去|回)\s*「?⚓?\s*(归响|维度|花匣|星舟)/;
  const VIA_RE = /^(?:先)?到([①②③④])/;

  // 1. Seed 2 (confluence): after lighting all 3 mechanisms, walking bell -> hub -> relay -> exit on bell's layer
  // uses flat multi-hop waypoints ("先到归响" -> "先到维度" -> "点击🚪走去过关"), NEVER "先到归响再去🚪" or "先到维度再去🚪".
  {
    const m = start('shell', 2);
    for (const id of m.snapshot().mechanismOrder) light(m, id);
    assert.equal(m.snapshot().node, 'bell');
    const fromBell = describeNextStep(m.snapshot());
    assert.equal(fromBell.goalId, 'exit');
    assert.equal(fromBell.targetId, 'hub');
    assert.equal(fromBell.banner, '先到归响');
    assert.match(fromBell.banner, ANCHOR_RE);
    assertSingleStepHonest(m.snapshot(), fromBell, 'seed 2 bell -> hub toward exit');

    reach(m, 'hub');
    const fromHub = describeNextStep(m.snapshot());
    assert.equal(fromHub.goalId, 'exit');
    assert.equal(fromHub.targetId, 'relay');
    assert.equal(fromHub.banner, '先到维度');
    assert.match(fromHub.banner, ANCHOR_RE);
    assertSingleStepHonest(m.snapshot(), fromHub, 'seed 2 hub -> relay toward exit');

    reach(m, 'relay');
    const fromRelay = describeNextStep(m.snapshot());
    assert.equal(fromRelay.goalId, 'exit');
    assert.equal(fromRelay.targetId, 'exit');
    assert.equal(fromRelay.banner, '点击🚪走去过关');
    assertSingleStepHonest(m.snapshot(), fromRelay, 'seed 2 relay -> exit');
  }

  // 2. Multi-anchor pass-through before shifting (`plan.shift.at !== dest.id`):
  // In split room (seed 401491695), standing on dew after lighting dew & bell:
  // route to bloom (③) walks dew -> hub -> relay on dew's layer, then shifts at relay!
  // On dew, hub is ONLY a pass-through (NOT where the player shifts), so banner must be "先去归响", NOT "去归响换层"!
  {
    const m = start('shell', 401491695);
    light(m, 'dew');
    light(m, 'bell');
    reach(m, 'hub'); // reverse W-ramp lands on dew's layer
    reach(m, 'dew');
    const snap = m.snapshot();
    const plan = planLayerRoute(snap, 'bloom');
    assert.equal(plan.walk[0]?.to, 'hub');
    assert.equal(plan.walk[1]?.to, 'relay');
    assert.equal(plan.shift?.at, 'relay');
    const onDew = describeNextStep(snap);
    assert.equal(onDew.targetId, 'hub');
    assert.equal(onDew.banner, '先去归响');
    assert.doesNotMatch(onDew.banner, /换层/);
    assert.match(onDew.banner, ANCHOR_RE);
    assertSingleStepHonest(snap, onDew, 'split dew -> hub -> relay(shift)');

    reach(m, 'hub');
    const onHub = describeNextStep(m.snapshot());
    assert.equal(onHub.targetId, 'relay');
    assert.equal(onHub.banner, '去维度换层');
    assert.match(onHub.banner, ANCHOR_RE);
    assertSingleStepHonest(m.snapshot(), onHub, 'split hub -> relay(shift)');
  }

  // 3. Indirect anchor shift (`!directGoalAfterFirstShift`):
  // In cascade room (seed 4097396765), after lighting dew & bell and returning to hub on dew's layer:
  // shifting on hub to bell's layer only opens hub -> relay (still must walk to relay and shift again to layer Ⅲ for ③ / 🚪).
  // Banner must NOT falsely claim "点亮③" or "去🚪" or "通往③的桥会显形"!
  {
    const m = start('shell', 4097396765);
    light(m, 'dew');
    light(m, 'bell');
    reach(m, 'hub');
    const snap = m.snapshot();
    const desktopHint = describeNextStep(snap);
    const touchHint = describeNextStep(snap, { coarsePointer: true });
    assert.equal(desktopHint.action, 'shift');
    assert.match(desktopHint.banner, /^(上滚|下滚)到[ⅠⅡⅢ]层$/);
    assert.doesNotMatch(desktopHint.banner, /③|点亮/);
    assert.doesNotMatch(desktopHint.detail, /通往③的桥会显形/);
    assert.match(desktopHint.detail, /维度锚台/);
    assert.match(touchHint.banner, /^点[ⅠⅡⅢ]换层$/);
    assert.doesNotMatch(touchHint.banner, /③|点亮/);
    assertSingleStepHonest(snap, desktopHint, 'cascade indirect shift desktop');
    assertSingleStepHonest(snap, touchHint, 'cascade indirect shift touch');

    // Same when all 3 are lit and player stands on hub on wrong layer for cascade exit:
    light(m, 'bloom');
    reach(m, 'hub');
    const wrongLayer = [0, 1, 2].find(l => l !== m.snapshot().nodes.find(n => n.id === 'bell').layer);
    m.setW(m.snapshot().layers[wrongLayer].center);
    const exitSnap = m.snapshot();
    const exitDesktop = describeNextStep(exitSnap);
    const exitTouch = describeNextStep(exitSnap, { coarsePointer: true });
    assert.equal(exitDesktop.goalId, 'exit');
    assert.equal(exitDesktop.action, 'shift');
    assert.doesNotMatch(exitDesktop.banner, /去🚪/);
    assert.doesNotMatch(exitTouch.banner, /去🚪/);
    assertSingleStepHonest(exitSnap, exitDesktop, 'cascade indirect exit shift desktop');
    assertSingleStepHonest(exitSnap, exitTouch, 'cascade indirect exit shift touch');
  }

  // 4. Intermediate lit-mechanism waypoint (`先到①换层` / `先到①`) & multi-step same_xyz (`triad` expedition room):
  {
    let triadModel = null;
    for (let s = 1; s <= 200 && !triadModel; s++) {
      const exp = new GameModel(s, { mode: 'expedition' });
      exp.chooseRelic('shell');
      for (let r = 0; r < 4; r++) {
        if (exp.snapshot().roomId === 'triad') {
          const snap = exp.snapshot();
          const dew = snap.nodes.find(n => n.id === 'dew');
          const bloom = snap.nodes.find(n => n.id === 'bloom');
          if (Math.abs(dew.layer - bloom.layer) === 2) {
            triadModel = exp;
            break;
          }
        }
        if (r === 3) break;
        for (const id of exp.snapshot().mechanismOrder) light(exp, id);
        reach(exp, 'exit');
        if (exp.snapshot().phase === 'interlude') exp.chooseRelic(exp.snapshot().choices[0].id);
        else break;
      }
    }
    assert.ok(triadModel, 'found triad room with 2-slice span between ① (dew) and ② (bloom)');
    // At hub on dew's layer after lighting ①: only open bridge from hub is hub-dew (lit ①), where player shifts!
    light(triadModel, 'dew');
    // Standing on dew, shifting 1 slice lands on intermediate bell (unpowered ③), NOT bloom (②)!
    const onDewDesktop = describeNextStep(triadModel.snapshot());
    const onDewTouch = describeNextStep(triadModel.snapshot(), { coarsePointer: true });
    assert.equal(onDewDesktop.action, 'shift');
    assert.match(onDewDesktop.banner, /^站①(上滚|下滚)到Ⅱ$/);
    assert.doesNotMatch(onDewDesktop.banner, /显现②/);
    assert.equal(onDewTouch.banner, '站①点Ⅱ换层');
    assertSingleStepHonest(triadModel.snapshot(), onDewDesktop, 'triad intermediate same_xyz desktop');
    assertSingleStepHonest(triadModel.snapshot(), onDewTouch, 'triad intermediate same_xyz touch');

    // Unsupported-layer recover (`plan.shift.kind === 'recover'`) never over-promises immediate goal action:
    const mRecover = start('shell', 42);
    light(mRecover, 'dew');
    mRecover.setW(mRecover.snapshot().layers[1].center);
    const recoverDesktop = describeNextStep(mRecover.snapshot());
    const recoverTouch = describeNextStep(mRecover.snapshot(), { coarsePointer: true });
    assert.equal(recoverDesktop.action, 'shift');
    assert.match(recoverDesktop.banner, /^(上滚|下滚)回[ⅠⅡⅢ]站稳$/);
    assert.match(recoverTouch.banner, /^点[ⅠⅡⅢ]回层站稳$/);
    assertSingleStepHonest(mRecover.snapshot(), recoverDesktop, 'unsupported layer recover desktop');
    assertSingleStepHonest(mRecover.snapshot(), recoverTouch, 'unsupported layer recover touch');

    // Walk back to hub on dew's layer: route to ② goes hub -> dew (lit ①) -> shift!
    reach(triadModel, 'hub');
    const fromHubViaDew = describeNextStep(triadModel.snapshot());
    assert.equal(fromHubViaDew.action, 'move');
    assert.equal(fromHubViaDew.targetId, 'dew');
    assert.equal(fromHubViaDew.banner, '先到①换层');
    assert.match(fromHubViaDew.banner, VIA_RE);
    assertSingleStepHonest(triadModel.snapshot(), fromHubViaDew, 'triad hub -> lit ① waypoint');

    // Drifting W on hub so lit ① is not present triggers off-center recover for waypoint (`targetId !== goalId`)
    const dewLayer = triadModel.snapshot().layer;
    triadModel.setW(dewLayer === 0 ? 0.33 : 0.67);
    const offCenterWaypoint = describeNextStep(triadModel.snapshot());
    assert.equal(offCenterWaypoint.action, 'recover');
    assert.equal(offCenterWaypoint.targetId, 'dew');
    assert.match(offCenterWaypoint.banner, /^按[ZXC]回中心$/);
    assertSingleStepHonest(triadModel.snapshot(), offCenterWaypoint, 'triad off-center waypoint recover');
  }

  // 5. Sweep all 10 standard seeds + seed 7 across all 3 intro courtyards (desktop + coarsePointer):
  // every generated step satisfies assertSingleStepHonest (<= 10 chars, zero over-promising).
  for (const seed of [2, 401491695, 4097396765, 5, 777, 31337, 123456789, 42, 90210, 2026111, 7]) {
    for (const coarsePointer of [false, true]) {
      const m = start('shell', seed);
      for (const roomIdx of [0, 1, 2]) {
        assert.equal(m.snapshot().room, roomIdx);
        for (let turn = 0; turn < 45 && m.snapshot().phase === 'playing'; turn++) {
          const s = m.snapshot();
          const h = describeNextStep(s, { coarsePointer });
          assertSingleStepHonest(s, h, `seed=${seed} coarse=${coarsePointer} r=${roomIdx} t=${turn}`);
          if (h.action === 'move' || h.action === 'done') reach(m, h.targetId || h.goalId);
          else if (h.action === 'shift' || h.action === 'recover') { m.setW(s.layers[h.layer].center); advance(m, 0.05); }
          else if (h.action === 'activate') light(m, h.goalId);
          else advance(m, 0.35);
        }
        if (roomIdx < 2) m.chooseRelic(m.snapshot().choices[0].id);
        else assert.equal(m.snapshot().phase, 'won');
      }
    }
  }
});
