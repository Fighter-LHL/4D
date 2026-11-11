import test from 'node:test';
import assert from 'node:assert/strict';
import { GameFeel, HITSTOP_MS } from '../src/game-feel.js';

test('a hit-stop freezes exactly its duration and passes the frame remainder through', () => {
  const feel = new GameFeel();
  assert.equal(feel.trigger('harmonic_burst'), true);
  assert.equal(feel.frozen, true);
  const frames = [feel.step(.02), feel.step(.02), feel.step(.02)];
  assert.deepEqual(frames, [0, .008, .02]);
  assert.equal(feel.frozen, false);
  const lost = .06 - frames.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(lost - HITSTOP_MS.harmonic_burst / 1000) < 1e-9, 'game time lost equals the hit-stop');
});

test('hit-stop is capped at 35ms, never stacks, and respects the 120ms gap', () => {
  const feel = new GameFeel();
  assert.equal(feel.trigger('phase_graze'), true);
  assert.equal(feel.trigger('harmonic_burst'), false, 'freezes never stack');
  feel.step(.028);
  assert.equal(feel.frozen, false);
  assert.equal(feel.trigger('bridge_landed'), false, 'still inside the 120ms gap');
  feel.step(.1);
  assert.equal(feel.trigger('bridge_landed'), false, 'only 108ms since the freeze ended');
  feel.step(.02);
  assert.equal(feel.trigger('bridge_landed'), true, '128ms after the previous freeze ended');
  feel.step(.018);
  assert.equal(feel.frozen, false, '18ms kind ended on schedule');

  HITSTOP_MS.probe = 80;
  try {
    const capped = new GameFeel();
    assert.equal(capped.trigger('probe'), true);
    assert.ok(Math.abs(capped.step(.04) - .005) < 1e-9, '80ms request caps to 35ms of lost game time');
  } finally {
    delete HITSTOP_MS.probe;
  }
});

test('delayed triggers count down on game dt and unknown kinds are rejected', () => {
  const feel = new GameFeel();
  assert.equal(feel.trigger('nonsense'), false);
  assert.equal(feel.trigger('phase_graze', { delay: .1 }), true);
  assert.equal(feel.frozen, false);
  feel.step(.05);
  assert.equal(feel.frozen, false);
  feel.step(.05);
  assert.equal(feel.frozen, true, 'the delayed hit-stop fires once its game-time delay elapses');
  assert.ok(Math.abs(feel.step(.05) - .022) < 1e-9, 'the 28ms freeze consumed the frame start');
  assert.equal(feel.frozen, false);
});

const firstPeak = (feel, key) => {
  let peak = 0;
  for (let i = 0; i < 80; i++) {
    feel.step(1 / 120);
    const v = feel.value(key);
    if (Math.abs(v) < Math.abs(peak) - 1e-9) break;
    peak = v;
  }
  return peak;
};

test('punches normalise to their amount and land even on rejected hit-stops', () => {
  const feel = new GameFeel();
  feel.punch('player', .2);
  assert.ok(Math.abs(firstPeak(feel, 'player') - .2) <= .04, 'first peak tracks the requested amount within 20%');

  const neg = new GameFeel();
  neg.punch('player', -.15);
  assert.ok(Math.abs(firstPeak(neg, 'player') + .15) <= .03, 'negative punches peak at the negative amount');

  const fired = new GameFeel();
  fired.trigger('harmonic_burst', { punches: [['player', .15]] });
  assert.ok(Math.abs(firstPeak(fired, 'player') - .15) <= .03, 'trigger punches are normalised too');

  const rejected = new GameFeel();
  assert.equal(rejected.trigger('harmonic_burst'), true);
  assert.equal(rejected.trigger('phase_graze', { punches: [['player', .1]] }), false, 'freeze rejected by stacking');
  assert.ok(rejected.value('player') === 0 && rejected._springs.get('player').v !== 0, 'the punch still landed');
  assert.notEqual(firstPeak(rejected, 'player'), 0);

  const delayed = new GameFeel();
  delayed.trigger('bridge_landed', { delay: .1, punches: [['player', .12]] });
  delayed.step(.05);
  assert.equal(delayed.value('player'), 0, 'no punch before the delay fires');
  delayed.step(.05);
  assert.notEqual(firstPeak(delayed, 'player'), 0, 'the delayed punch lands at fire time');
});

test('punched springs are underdamped, clamp to .35, and snap back to exact zero', () => {
  const feel = new GameFeel();
  assert.equal(feel.value('camera'), 0);
  feel.punch('camera', 3);
  assert.equal(feel.value('camera'), 0, 'impulse lands on velocity, not position');
  feel.step(.016);
  assert.notEqual(feel.value('camera'), 0);
  feel.punch('camera', 500);
  for (let i = 0; i < 30; i++) assert.ok(Math.abs(feel.value('camera')) <= .35 + 1e-9) && feel.step(.016);
  for (let i = 0; i < 400; i++) feel.step(.016);
  assert.equal(feel.value('camera'), 0, 'settled springs read exactly zero');
  assert.equal(feel.value('node:dew'), 0, 'unknown keys read zero');
});

test('reduced motion makes every facet inert and reset clears all state', () => {
  const calm = new GameFeel({ reducedMotion: true });
  assert.equal(calm.trigger('harmonic_burst'), false);
  calm.punch('camera', 4);
  assert.equal(calm.value('camera'), 0);
  assert.equal(calm.step(.016), .016);
  assert.equal(calm.frozen, false);

  const feel = new GameFeel();
  feel.trigger('phase_graze');
  feel.punch('player', 4);
  feel.step(.005);
  feel.reset();
  assert.equal(feel.frozen, false);
  assert.equal(feel.value('player'), 0);
  assert.equal(feel.trigger('bridge_landed'), true, 'reset also clears the inter-freeze gap');
  feel.setReducedMotion(true);
  assert.equal(feel.step(.016), .016);
  assert.equal(feel.frozen, false);
});
