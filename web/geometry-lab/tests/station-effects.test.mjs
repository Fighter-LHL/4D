import test from 'node:test';
import assert from 'node:assert/strict';
import { StationEffects } from '../station-effects.mjs';

const relay = (powered = false, latched = false) => ({ powered, latched });

test('loading and repeatedly rendering a settled station never creates an effect', () => {
  const fx = new StationEffects();
  fx.observe(relay(true, true), 0);
  fx.observe(relay(true, true), 500);
  assert.equal(fx.isActive(500), false);
  assert.deepEqual(fx.sample(500), {
    power: { progress: -1, strength: 0, pose: 1 },
    latch: { progress: -1, strength: 0, pose: 1 },
  });
});

test('power and lever settle independently and stop after their finite deadlines', () => {
  const fx = new StationEffects();
  fx.observe(relay(), 0);
  fx.observe(relay(true), 100);
  fx.observe(relay(true, true), 300);
  const midway = fx.sample(500);
  assert.ok(midway.power.pose > 0 && midway.power.pose < 1);
  assert.ok(midway.latch.pose > 0 && midway.latch.pose < 1);
  fx.observe(relay(true, true), 900); // render calls cannot restart either clock
  assert.equal(fx.isActive(999), true);
  assert.equal(fx.isActive(1000), false);
  assert.equal(fx.sample(1000).power.strength + fx.sample(1000).latch.strength, 0);
  assert.equal(fx.sample(1000).latch.pose, 1);
});

test('taking a core back during the power pulse reverses contacts without a jump', () => {
  const fx = new StationEffects();
  fx.observe(relay(), 0);
  fx.observe(relay(true), 10);
  const before = fx.sample(310).power.pose;
  fx.observe(relay(), 310);
  assert.equal(fx.sample(310).power.pose, before);
  assert.ok(fx.sample(700).power.pose < before);
  assert.equal(fx.sample(1210).power.pose, 0);
  assert.equal(fx.isActive(1210), false);
});

test('reduced motion settles state immediately, including an effect already in flight', () => {
  const fx = new StationEffects();
  fx.observe(relay(), 0);
  fx.observe(relay(true, true), 100);
  fx.observe(relay(true, true), 250, true);
  assert.equal(fx.isActive(250), false);
  assert.equal(fx.sample(250).power.pose, 1);
  assert.equal(fx.sample(250).latch.pose, 1);
  fx.observe(relay(), 300, true);
  fx.observe(relay(), 400, false);
  assert.equal(fx.isActive(400), false);
  assert.equal(fx.sample(400).power.pose, 0);
});

test('leaving, restarting or entering another chapter cannot replay an old transition', () => {
  const fx = new StationEffects();
  fx.observe(relay(), 0);
  fx.observe(relay(true, true), 100);
  fx.clear();
  assert.equal(fx.isActive(101), false);
  fx.observe(relay(), 102);
  assert.equal(fx.sample(102).power.pose, 0);
  fx.observe(relay(true), 200);
  fx.observe(null, 250);
  assert.equal(fx.isActive(250), false);
});

test('resuming after a long hidden interval shows the final state without catching up', () => {
  const fx = new StationEffects();
  fx.observe(relay(), 0);
  fx.observe(relay(true, true), 100);
  assert.equal(fx.isActive(300000), false);
  assert.equal(fx.sample(300000).power.pose, 1);
  assert.equal(fx.sample(300000).latch.progress, -1);
});
