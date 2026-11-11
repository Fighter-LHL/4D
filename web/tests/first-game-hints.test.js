import assert from 'node:assert/strict';
import test from 'node:test';
import { describeNextStep, planLayerRoute } from '../src/progressive-onboarding.js';
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
