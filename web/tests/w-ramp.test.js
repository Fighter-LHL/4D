import assert from 'node:assert/strict';
import test from 'node:test';
import { GameModel } from '../src/model.js';
import { describeNextStep, findCurrentLayerRoute, planLayerRoute } from '../src/progressive-onboarding.js';
import { SceneRenderer } from '../src/scene.js';
import { start, reach, advance, finishRoom } from './model-helpers.js';

const RAMP_SEEDS = [2, 401491695, 4097396765, 5, 777, 31337, 123456789, 42, 90210, 2026111, 7];

function stepExact(model, targetSeconds) {
  let rem = targetSeconds;
  while (rem > 1e-9) {
    const dt = Math.min(0.01, rem);
    model.update(dt);
    rem -= dt;
  }
}

test('W-ramp appears only after lighting dew in intro Room 0 across all 10 standard seeds + return seed 7', () => {
  for (const seed of RAMP_SEEDS) {
    const model = start('shell', seed);
    assert.equal(model.snapshot().edges.some(e => e.ramp), false, `seed ${seed}: no ramp at room start`);

    reach(model, 'dew');
    assert.equal(model.snapshot().edges.some(e => e.ramp), false, `seed ${seed}: no ramp before activating dew`);

    assert.equal(model.interact(), true);
    advance(model, 0.6);

    const afterDew = model.snapshot();
    const [, secondId, thirdId] = afterDew.mechanismOrder;
    const dew = afterDew.nodes.find(n => n.id === 'dew');
    const second = afterDew.nodes.find(n => n.id === secondId);
    const ramps = afterDew.edges.filter(e => e.ramp);
    assert.equal(ramps.length, 1, `seed ${seed} (${afterDew.roomId}): exactly 1 ramp after dew`);

    const ramp = ramps[0];
    const endpoints = [ramp.from, ramp.to];
    assert.ok(endpoints.includes(secondId), `seed ${seed}: ramp connects to ② (${secondId}), got ${ramp.id}`);
    const anchorId = ramp.from === secondId ? ramp.to : ramp.from;
    assert.ok(anchorId === 'hub' || anchorId === 'relay', `seed ${seed}: ramp starts from anchor, got ${anchorId}`);
    if (afterDew.roomId === 'return') assert.equal(ramp.id, 'relay-bell');
    else if (afterDew.roomId === 'confluence') assert.equal(ramp.id, 'hub-bloom');
    else assert.equal(ramp.id, 'hub-bell');

    const expectFrom = ramp.from === secondId ? second.layer : dew.layer;
    const expectTo = ramp.from === secondId ? dew.layer : second.layer;
    assert.equal(ramp.fromLayer, expectFrom);
    assert.equal(ramp.toLayer, expectTo);
    assert.notEqual(ramp.fromLayer, ramp.toLayer);
    assert.equal(ramp.open, true);

    // Route and onboarding hints prioritize the 0-shift W-ramp
    const planFromDew = planLayerRoute(afterDew, secondId);
    assert.equal(planFromDew.shift, null, `seed ${seed}: 0 shifts needed from dew to ②`);
    assert.equal(planFromDew.walk.at(-1)?.ramp, true);
    assert.equal(describeNextStep(afterDew).banner, '去归响台，走上斜桥点②');

    reach(model, anchorId);
    const atAnchor = model.snapshot();
    assert.equal(describeNextStep(atAnchor).banner, '走上斜桥，点亮②');
    const currentRoute = findCurrentLayerRoute(atAnchor, secondId);
    assert.equal(currentRoute?.length, 1);
    assert.equal(currentRoute[0].ramp, true);
    assert.equal(currentRoute[0].toLayer, second.layer);

    // Lighting ② and ③ never spawns a second ramp
    reach(model, secondId);
    assert.equal(model.interact(), true);
    advance(model, 0.6);
    assert.deepEqual(model.snapshot().edges.filter(e => e.ramp).map(e => e.id), [ramp.id]);
    reach(model, thirdId);
    assert.equal(model.interact(), true);
    advance(model, 0.6);
    assert.deepEqual(model.snapshot().edges.filter(e => e.ramp).map(e => e.id), [ramp.id]);
  }
});

test('W-ramp linearly interpolates w at progress 0, 0.25, 0.5, 0.75, 1 without wrap, locks wheel, and reverses cleanly', () => {
  for (const seed of RAMP_SEEDS) {
    const model = start('shell', seed);
    reach(model, 'dew');
    assert.equal(model.interact(), true);
    advance(model, 0.6);

    const stateAfterDew = model.snapshot();
    const [, secondId] = stateAfterDew.mechanismOrder;
    const dewLayer = stateAfterDew.nodes.find(n => n.id === 'dew').layer;
    const secondLayer = stateAfterDew.nodes.find(n => n.id === secondId).layer;
    const fromCenter = stateAfterDew.layers[dewLayer].center;
    const toCenter = stateAfterDew.layers[secondLayer].center;
    const ramp = stateAfterDew.edges.find(e => e.ramp);
    const anchorId = ramp.from === secondId ? ramp.to : ramp.from;

    reach(model, anchorId);
    assert.equal(model.select(secondId), true);
    model.drainEvents();
    assert.equal(model.move(), true);

    const duration = model.snapshot().travel.duration;
    assert.equal(duration, 1.35, 'normal travel duration remains 1.35s');

    const samples = [model.snapshot().w];
    for (const frac of [0.25, 0.5, 0.75]) {
      stepExact(model, duration * 0.25);
      const snap = model.snapshot();
      assert.ok(snap.travel, `seed ${seed}: still travelling at p=${frac}`);
      assert.ok(Math.abs(snap.travel.progress - frac) < 1e-4);
      const expectedW = fromCenter + (toCenter - fromCenter) * snap.travel.progress;
      assert.ok(Math.abs(snap.w - expectedW) < 1e-4, `seed ${seed} p=${frac}: got ${snap.w}, expected ${expectedW}`);
      samples.push(snap.w);

      // Manual wheel / scrubW during ramp travel must not pull W off the ramp
      assert.equal(model.setW(toCenter), false);
      assert.ok(Math.abs(model.scrubW(0.99) - snap.w) < 1e-9);
      assert.ok(Math.abs(model.snapshot().w - snap.w) < 1e-9);
    }

    stepExact(model, duration * 0.25 + 0.02);
    const arrived = model.snapshot();
    samples.push(arrived.w);

    assert.equal(arrived.travel, null, `seed ${seed}: travel completed`);
    assert.equal(arrived.node, secondId, `seed ${seed}: arrived at ②`);
    assert.equal(arrived.layer, secondLayer, `seed ${seed}: settled in toLayer`);
    assert.equal(arrived.w, toCenter, `seed ${seed}: w settled at exact toCenter`);
    assert.equal(arrived.stats.failures, 0, `seed ${seed}: zero failures`);

    // Monotonicity & no-wrap verification
    const dir = Math.sign(toCenter - fromCenter);
    for (let i = 1; i < samples.length; i++) {
      assert.ok((samples[i] - samples[i - 1]) * dir > 0, `seed ${seed}: monotonic step ${i - 1}->${i}: ${samples.join(', ')}`);
    }
    if (Math.abs(toCenter - fromCenter) > 0.45) {
      assert.ok(Math.abs(samples[2] - 0.5) < 1e-4, `seed ${seed}: |Δw|>0.45 passes linearly through 0.50, got ${samples[2]}`);
      const shifts = model.drainEvents().filter(ev => ev.type === 'layer_shift');
      assert.ok(shifts.some(ev => ev.toLayer === 1), `seed ${seed}: emits layer_shift into middle layer 1`);
    }

    // Activate ② and walk the ramp in reverse back to anchor: toCenter -> fromCenter
    assert.equal(model.interact(), true);
    advance(model, 0.6);
    assert.equal(model.select(anchorId), true);
    assert.equal(model.move(), true);

    const revSamples = [model.snapshot().w];
    for (const frac of [0.25, 0.5, 0.75]) {
      stepExact(model, duration * 0.25);
      const snap = model.snapshot();
      const expectedW = toCenter + (fromCenter - toCenter) * snap.travel.progress;
      assert.ok(Math.abs(snap.w - expectedW) < 1e-4, `seed ${seed} reverse p=${frac}: got ${snap.w}, expected ${expectedW}`);
      revSamples.push(snap.w);
    }
    stepExact(model, duration * 0.25 + 0.02);
    const backAtAnchor = model.snapshot();
    revSamples.push(backAtAnchor.w);

    assert.equal(backAtAnchor.travel, null);
    assert.equal(backAtAnchor.node, anchorId);
    assert.equal(backAtAnchor.layer, dewLayer);
    assert.equal(backAtAnchor.w, fromCenter);
    assert.equal(backAtAnchor.stats.failures, 0);
    for (let i = 1; i < revSamples.length; i++) {
      assert.ok((revSamples[i] - revSamples[i - 1]) * (-dir) > 0, `seed ${seed}: reverse monotonic ${revSamples.join(', ')}`);
    }
  }
});

test('Courtyard 2/3 (room >= 1) and expedition mode never create a W-ramp', () => {
  for (const seed of [2, 42, 401491695, 7]) {
    // Intro Room 1 & Room 2
    const intro = start('shell', seed);
    finishRoom(intro);
    assert.equal(intro.snapshot().phase, 'interlude');
    assert.equal(intro.chooseRelic(intro.snapshot().choices[0].id), true);
    assert.equal(intro.snapshot().room, 1);
    reach(intro, 'dew');
    assert.equal(intro.interact(), true);
    advance(intro, 0.6);
    assert.equal(intro.snapshot().edges.some(e => e.ramp), false, `seed ${seed}: no ramp in intro Room 1`);

    finishRoom(intro);
    assert.equal(intro.chooseRelic(intro.snapshot().choices[0].id), true);
    assert.equal(intro.snapshot().room, 2);
    reach(intro, 'dew');
    assert.equal(intro.interact(), true);
    advance(intro, 0.6);
    assert.equal(intro.snapshot().edges.some(e => e.ramp), false, `seed ${seed}: no ramp in intro Room 2`);

    // Expedition Room 0
    const exp = new GameModel(seed, { mode: 'expedition' });
    assert.equal(exp.chooseRelic('shell'), true);
    assert.equal(exp.snapshot().room, 0);
    reach(exp, 'dew');
    assert.equal(exp.interact(), true);
    advance(exp, 0.6);
    assert.equal(exp.snapshot().edges.some(e => e.ramp), false, `seed ${seed}: no ramp in expedition Room 0`);
  }
});

test('SceneRenderer tracks ramp W without wTween/wrap and lifts playerPosition along sloped endpoints', () => {
  const prevWindow = globalThis.window;
  const gradients = [];
  const ctx = new Proxy({}, {
    get(_target, key) {
      if (key === 'createLinearGradient' || key === 'createRadialGradient') {
        return (...args) => {
          args.forEach(v => assert.ok(Number.isFinite(v)));
          const stops = [];
          const g = { args, stops, addColorStop(offset, col) { stops.push([offset, col]); } };
          if (key === 'createLinearGradient') gradients.push(g);
          return g;
        };
      }
      if (key === 'measureText') return () => ({ width: 24 });
      return () => {};
    },
    set: () => true,
  });
  globalThis.window = {
    devicePixelRatio: 1,
    addEventListener() {},
    removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  };
  const canvas = {
    style: {},
    getContext: () => ctx,
    getBoundingClientRect: () => ({ width: 1000, height: 650, left: 0, top: 0 }),
    addEventListener() {},
    removeEventListener() {},
  };
  const renderer = new SceneRenderer(canvas);
  try {
    // Seed 42 has |Δw| = |0.18 - 0.82| = 0.64 > 0.45
    const model = start('shell', 42);
    reach(model, 'dew');
    model.interact();
    advance(model, 0.6);
    reach(model, 'hub');
    renderer.onboardingStage = 2;
    renderer.setState(model.snapshot());
    gradients.length = 0;
    renderer.render(0.016);
    assert.ok(gradients.some(g => g.stops.length === 2), 'draws sloped linear gradient bridge while standing on hub');

    model.select('bell');
    model.move();
    for (let i = 0; i < 14; i++) {
      model.update(0.1);
      const snap = model.snapshot();
      renderer.setState(snap);
      renderer.render(0.1);
      assert.equal(renderer.wTween, null, `step ${i}: no wTween during or at arrival of ramp`);
      assert.equal(renderer.wrapAlpha, 1, `step ${i}: wrapAlpha stays 1 (no wrap fade)`);
      assert.equal(renderer.displayW, snap.w, `step ${i}: displayW tracks snapshot.w directly`);
    }

    // Verify playerPosition() interpolates along lifted endpoints
    const custom = model.snapshot();
    const hub = custom.nodes.find(n => n.id === 'hub');
    const bell = custom.nodes.find(n => n.id === 'bell');
    renderer.setState({
      ...custom,
      w: 0.82,
      travel: { from: 'hub', to: 'bell', progress: 0.5, ramp: true, fromLayer: 2, toLayer: 0, stability: 1, gates: [] },
    });
    const pos = renderer.playerPosition();
    const expectedY = ((hub.y - (0.82 - 0.82) * 95) + (bell.y - (0.18 - 0.82) * 95)) * 0.5;
    assert.ok(Math.abs(pos.y - expectedY) < 1e-6, `playerPosition lifts y along slope (${pos.y} vs ${expectedY})`);
  } finally {
    renderer.destroy();
    globalThis.window = prevWindow;
  }
});
