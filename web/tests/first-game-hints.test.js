import assert from 'node:assert/strict';
import test from 'node:test';
import { describeNextStep, planLayerRoute, clampIntroductoryW } from '../src/progressive-onboarding.js';
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
  reach(model, 'hub');
  record('1/3 at hub');
  const toBloom = planLayerRoute(model.snapshot(), 'bloom');
  assert.equal(toBloom.walk.length, 0, 'from the hub the next layer change happens here');
  assert.equal(toBloom.shift.at, 'hub');
  assert.equal(toBloom.shift.layer, model.snapshot().nodes.find(n => n.id === 'bloom').layer);

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
  const onDew = describeNextStep(model.snapshot());
  assert.equal(onDew.action, 'shift');
  assert.equal(onDew.goalId, 'bell');
  assert.equal(onDew.layer, bell.layer);
  assert.equal(planLayerRoute(model.snapshot(), 'bell').shift.kind, 'same_xyz');
  assert.match(onDew.detail, /同一位置/);
  assert.match(onDew.banner, /③/);
  assert.ok(onDew.banner.includes('①'), `standing on ① should say so: ${onDew.banner}`);

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
  assert.equal(onHub.action, 'shift', `already on 归响台 should switch here, got ${onHub.banner}`);
  assert.equal(onHub.targetId, 'hub');
  assert.match(onHub.banner, /滚/);
  assert.ok(onHub.banner.includes('②'), onHub.banner);
  assert.match(onHub.detail, /就在归响台/);

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
  const first = model.snapshot().mechanismOrder[0];
  light(model, first);
  reach(model, 'hub');
  const second = model.snapshot().mechanismOrder[1];
  const plan = planLayerRoute(model.snapshot(), second);
  assert.ok(plan.walk.length > 0, 'walks on the current layer before switching at the wrong anchor');
  assert.equal(plan.shift.at, 'relay');
});

test('drifting W after lighting ① never claims an off-layer ② is still on the current layer', () => {
  const model = start('shell', 2);
  light(model, 'dew');
  const baseline = describeNextStep(model.snapshot());
  assert.equal(baseline.goalId, 'bloom');
  assert.equal(baseline.banner, '去归响台换层点②');

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
    assert.equal(step.banner, '去归响台换层点②');
    assert.equal(step.targetId, 'hub');
    assert.equal(step.layer, bloom.layer);
    assert.ok(step.banner.length <= 20, step.banner);
    assert.ok(!step.banner.includes('①'), step.banner);
  }

  const centerW = model.snapshot().layers[model.snapshot().layer].center;
  model.setW(centerW);
  const centered = describeNextStep(model.snapshot());
  assert.equal(centered.banner, '去归响台换层点②');
  assert.equal(centered.action, 'move');
  assert.equal(centered.targetId, 'hub');

  // Once the player actually walks to the hub and enters ②'s own layer, drifting W within
  // that layer DOES legitimately offer same-layer center recovery for ②.
  reach(model, 'hub');
  const bloomLayer = model.snapshot().nodes.find(node => node.id === 'bloom').layer;
  model.setW(model.snapshot().layers[bloomLayer].center);
  model.setW(0.35);
  const onBloomLayerDrifted = model.snapshot();
  assert.equal(onBloomLayerDrifted.layer, bloomLayer);
  assert.equal(onBloomLayerDrifted.nodes.find(node => node.id === 'bloom').present, false);
  const legitRecover = describeNextStep(onBloomLayerDrifted);
  assert.equal(legitRecover.action, 'recover');
  assert.equal(legitRecover.banner, '按X回中心见②');
  assert.match(legitRecover.detail, /②还在这一层/);
  model.setW(onBloomLayerDrifted.layers[onBloomLayerDrifted.layer].center);
  assert.equal(model.snapshot().nodes.find(node => node.id === 'bloom').present, true);
});

test('seed 5 drifting W after lighting ① never claims an off-layer goal is on the current layer', () => {
  const model = start('shell', 5);
  const first = model.snapshot().mechanismOrder[0];
  light(model, first);
  const originW = model.snapshot().w;
  assert.equal(model.snapshot().layer, 0);
  assert.equal(describeNextStep(model.snapshot()).banner, '去归响台换层点②');

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
      assert.equal(step.banner, '去归响台换层点②');
      assert.equal(step.action, 'move');
      assert.equal(step.targetId, 'hub');
    }
  }

  model.setW(originW);
  assert.equal(describeNextStep(model.snapshot()).banner, '去归响台换层点②');
});
