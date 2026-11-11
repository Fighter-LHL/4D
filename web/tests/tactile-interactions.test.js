import test from 'node:test';
import assert from 'node:assert/strict';
import { GameModel } from '../src/model.js';
import { SceneRenderer } from '../src/scene.js';
import { GameAudio } from '../src/audio.js';
import { magnetizeLensW, projectPolytopeLock, wrapSignedAngle, wrapHalfTurnAngle } from '../src/hyper-prism.js';
import { start, advance } from './model-helpers.js';

function createTestScene(reducedMotion = false, callbacks = {}) {
  const calls = [];
  let saveDepth = 0;
  const finite = value => {
    if (typeof value === 'number') assert.ok(Number.isFinite(value), `non-finite canvas value: ${value}`);
    if (Array.isArray(value)) value.forEach(finite);
  };
  const listeners = new Map();
  const context = new Proxy({}, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'save') return () => { saveDepth += 1; calls.push({ method: 'save', args: [] }); };
      if (key === 'restore') return () => { saveDepth -= 1; assert.ok(saveDepth >= 0, 'unbalanced ctx.restore'); calls.push({ method: 'restore', args: [] }); };
      if (key === 'measureText') return text => ({ width: String(text).length * 10 });
      if (key === 'createLinearGradient' || key === 'createRadialGradient') {
        return (...args) => {
          args.forEach(finite);
          if (key === 'createRadialGradient') {
            assert.ok(args[2] > 0 && args[5] > 0, `radial gradient radii must be > 0: ${args}`);
          }
          return { addColorStop() {} };
        };
      }
      return (...args) => {
        args.forEach(finite);
        if (key === 'arc') assert.ok(args[2] > 0, `arc radius must be > 0: ${args[2]}`);
        if (key === 'ellipse') assert.ok(args[2] > 0 && args[3] > 0, `ellipse radii must be > 0: ${args[2]}, ${args[3]}`);
        calls.push({ method: key, args, fill: target.fillStyle, stroke: target.strokeStyle, alpha: target.globalAlpha });
      };
    },
    set(target, key, value) { finite(value); target[key] = value; return true; },
  });
  globalThis.window = {
    devicePixelRatio: 1,
    addEventListener() {},
    removeEventListener() {},
    matchMedia: () => ({ matches: reducedMotion, addEventListener() {}, removeEventListener() {} }),
  };
  const canvas = {
    style: {},
    getContext: () => context,
    getBoundingClientRect: () => ({ width: 1000, height: 650, left: 0, top: 0 }),
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type) { listeners.delete(type); },
  };
  const renderer = new SceneRenderer(canvas, callbacks);
  renderer.visualGuide = true;
  renderer.onboardingStage = 3;
  return { renderer, calls, listeners, getSaveDepth: () => saveDepth };
}

test('magnetizeLensW snaps smoothly into 3 W-layer detents and scrubs continuously outside', () => {
  const centers = [0.18, 0.50, 0.82];
  const nearLow = magnetizeLensW(0.195, centers);
  assert.equal(nearLow.snappedLayer, 0);
  assert.equal(nearLow.detent, true);
  assert.ok(Math.abs(nearLow.w - 0.18) < Math.abs(0.195 - 0.18), 'magnetism pulls W closer to center');

  const between = magnetizeLensW(0.34, centers);
  assert.equal(between.detent, false);
  assert.equal(between.w, 0.34);

  const nearHigh = magnetizeLensW(0.81, centers);
  assert.equal(nearHigh.snappedLayer, 2);
  assert.equal(nearHigh.detent, true);
  assert.ok(Math.abs(nearHigh.w - 0.82) < 0.005);

  assert.equal(wrapSignedAngle(Math.PI * 2.5), Math.PI * 0.5);
  assert.equal(wrapSignedAngle(NaN), 0);
  assert.ok(Math.abs(wrapHalfTurnAngle(Math.PI)) < 1e-9, 'half-turn wraps π to 0 for bidirectional crystal snap');
  assert.equal(wrapHalfTurnAngle(NaN), 0);
});

test('projectPolytopeLock maps mechanisms to distinct 4D polytopes and snaps within threshold', () => {
  const dewOff = projectPolytopeLock('dew', { w: 0.5, offsetAngle: 0.9, radius: 28 });
  assert.equal(dewOff.polytopeId, 'tesseract');
  assert.equal(dewOff.snapped, false);
  assert.ok(dewOff.alignment < 0.5);

  const bellNear = projectPolytopeLock('bell', { w: 0.5, offsetAngle: 0.14, radius: 28 });
  assert.equal(bellNear.polytopeId, 'orthoplex');
  assert.equal(bellNear.snapped, true);
  assert.equal(bellNear.alignment, 1);
  assert.equal(bellNear.offsetAngle, 0);

  const crownLock = projectPolytopeLock('crown', { w: 0.82, offsetAngle: -0.6, radius: 30 });
  assert.equal(crownLock.polytopeId, '24cell');
  assert.ok(crownLock.live.vertices.every(v => Number.isFinite(v.x) && Number.isFinite(v.y)));
});

test('GameModel.dashTravel boosts safe bridge crossings with sweet-spot rating and rejects risky/idle', () => {
  const m = start('shell', 42);
  assert.equal(m.dashTravel(), false, 'cannot dash while idle');
  m.setW(m.snapshot().range.center);

  // Reject risky crossing dash
  m.setRisk(true);
  assert.equal(m.move(), true);
  advance(m, 0.7);
  assert.equal(m.dashTravel(), false, 'risky crossings use W-corridor surfing, not dash');
  m.restart(42);
  m.chooseRelic('shell');

  // Sweet-spot perfect dash (progress in [0.20, 0.66])
  m.setW(m.snapshot().range.center);
  assert.equal(m.move(), true);
  m.drainEvents();
  advance(m, 0.04); // progress ~0.03 < 0.06
  assert.equal(m.dashTravel(), false, 'too early before 0.06');
  advance(m, 0.40); // progress ~0.326 in sweet spot
  assert.equal(m.dashTravel(), true);
  assert.equal(m.dashTravel(), false, 'cannot double-dash same crossing');

  const dashEvt = m.drainEvents().find(e => e.type === 'phase_dash');
  assert.ok(dashEvt);
  assert.equal(dashEvt.rating, 'perfect');
  assert.equal(m.snapshot().travel.dashed, 'perfect');
  assert.equal(m.snapshot().stats.perfectDashes, 1);

  // Completes remaining ~67% of 1.35s crossing in ~0.32s thanks to 2.85x speed boost
  advance(m, 0.40);
  assert.equal(m.snapshot().travel, null, 'dashed crossing arrives much faster than 1.35s');
});

test('GameModel.tuneMechanism + _activate grants +1 banked bonus, 0.12s fast power delivery, and surfCombo', () => {
  const m = start('shell', 10); // cascade room
  const [firstId, secondId] = m.snapshot().mechanismOrder;
  const firstNode = m.snapshot().nodes.find(n => n.id === firstId);

  // Unpowered downstream mechanism cannot be tuned yet
  assert.equal(m.tuneMechanism(secondId), false);
  assert.equal(m.tuneMechanism('hub'), false);

  // Start safe crossing to firstId, dash in sweet spot, and mid-dash pre-lock firstId (Surf + Snap combo!)
  m.setW(m.snapshot().layers[firstNode.layer].center);
  m.select(firstId);
  assert.equal(m.move(), true);
  advance(m, 0.45);
  assert.equal(m.dashTravel(), true);
  assert.equal(m.tuneMechanism(firstId), true);
  assert.deepEqual(m.snapshot().tunedMechanisms, [firstId]);

  advance(m, 0.45); // Arrive on firstId
  assert.equal(m.snapshot().node, firstId);
  m.drainEvents();
  const bankedBefore = m.snapshot().banked;

  assert.equal(m.interact(), true);
  const events = m.drainEvents();
  const burst = events.find(e => e.type === 'harmonic_burst');
  assert.ok(burst, 'emits harmonic_burst on tuned mechanism activation');
  assert.equal(burst.surfCombo, true, 'recognizes Depart -> Surf -> Snap combo');
  assert.equal(m.snapshot().banked, bankedBefore + 1, 'awards +1 banked echo immediately');
  assert.equal(m.snapshot().stats.harmonicLocks, 1);

  // Downstream power arrives in 0.12s instead of 0.50s!
  advance(m, 0.16);
  const afterFastPower = m.snapshot().nodes.find(n => n.id === secondId);
  assert.equal(afterFastPower.powered, true, 'overcharged activation delivers downstream power in 0.12s');
});

test('SceneRenderer renders 4D Hyper-Lens, Polytope Locks, and Bridge Surf Dash with finite balanced canvas calls', () => {
  for (const reduced of [false, true]) {
    for (const astral of [false, true]) {
      const detents = [];
      let dashedCount = 0;
      const tunedIds = [];
      const { renderer, calls, listeners, getSaveDepth } = createTestScene(reduced, {
        onLensDetent: l => detents.push(l),
        onBridgeDash: () => { dashedCount += 1; },
        onPolytopeTune: id => tunedIds.push(id),
      });
      renderer.astralMode = astral;
      const m = start('shell', 10);
      const firstId = m.snapshot().mechanismOrder[0];
      const firstNode = m.snapshot().nodes.find(n => n.id === firstId);
      m.setW(m.snapshot().layers[firstNode.layer].center);
      renderer.setState(m.snapshot());
      renderer.altarWindow = { node: firstId, progress: 0.35 };

      // 1. Drag on empty canvas opens 4D Hyper-Lens, scrubs W across detents, and closes cleanly on pointerup
      listeners.get('pointerdown')({ button: 0, clientX: 220, clientY: 420 });
      listeners.get('pointermove')({ clientX: 220, clientY: 260 });
      assert.equal(renderer.hyperLens.active, true);
      renderer.render(0.1);
      assert.equal(getSaveDepth(), 0, 'balanced save/restore with active 4D Hyper-Lens');
      assert.ok(calls.some(c => c.method === 'clip'), 'draws clipped 4D portal');
      listeners.get('pointerup')({ button: 0, clientX: 220, clientY: 260 });
      assert.equal(renderer.hyperLens.active, false, 'releasing drag closes lens without mutating layer');

      // 2. Dragging across a powered mechanism's 4D Polytope Lock snaps alignment
      const lockCy = firstNode.y - (firstId === 'bell' ? 44 : 36);
      listeners.get('pointerdown')({ button: 0, clientX: firstNode.x, clientY: lockCy });
      for (let dx = -60; dx <= 60; dx += 10) {
        listeners.get('pointermove')({ clientX: firstNode.x + dx, clientY: lockCy });
      }
      listeners.get('pointerup')({ button: 0, clientX: firstNode.x + 60, clientY: lockCy });
      assert.ok(tunedIds.includes(firstId), 'dragging crystal lock snaps into alignment');

      // 3. Safe bridge crossing Surf Cue + Comet Afterimages + paused render(0) stillness
      m.select(firstId);
      m.move();
      advance(m, 0.42);
      renderer.setState(m.snapshot());
      renderer.render(0.05);
      assert.equal(getSaveDepth(), 0);

      // Click during crossing triggers Bridge Surf Dash
      listeners.get('pointerdown')({ button: 0, clientX: 500, clientY: 320 });
      listeners.get('pointerup')({ button: 0, clientX: 500, clientY: 320 });
      assert.equal(dashedCount, 1);

      m.dashTravel();
      renderer.pushEvents(m.drainEvents());
      renderer.setState(m.snapshot());
      renderer.render(0.05);
      assert.equal(getSaveDepth(), 0, 'balanced save/restore with dashed comet afterimages');

      // Paused frame render(0) keeps state frozen
      const snapshotBeforePause = calls.length;
      const serializable = list => list.map(c => ({ method: c.method, args: structuredClone(c.args), alpha: c.alpha }));
      calls.length = 0;
      renderer.render(0);
      const pausedCalls = serializable(calls);
      calls.length = 0;
      renderer.render(0);
      assert.deepEqual(serializable(calls), pausedCalls, 'render(0) keeps all new geometry completely still');
      assert.ok(snapshotBeforePause > 0);

      renderer.destroy();
    }
  }
});

test('GameAudio synthesizes lens_detent, lens_dive, phase_dash, polytope_lock, and harmonic_burst safely', async () => {
  const sources = [];
  class Param {
    value = 0;
    setValueAtTime(v) { this.value = v; }
    linearRampToValueAtTime(v) { this.value = v; }
    exponentialRampToValueAtTime(v) { assert.ok(v > 0); this.value = v; }
    cancelScheduledValues() {}
  }
  class Node {
    constructor(ctx) {
      this.context = ctx;
      for (const k of ['gain', 'frequency', 'Q', 'pan', 'threshold', 'knee', 'ratio', 'attack', 'release']) this[k] = new Param();
    }
    connect() {}
    disconnect() {}
    start(at) { this.startAt = at; }
    stop(at = 2) { this.stopAt = at; }
  }
  const prevAudio = globalThis.AudioContext;
  globalThis.AudioContext = class {
    currentTime = 2;
    sampleRate = 8000;
    state = 'running';
    destination = new Node(this);
    createGain() { return new Node(this); }
    createDynamicsCompressor() { return new Node(this); }
    createBiquadFilter() { return new Node(this); }
    createStereoPanner() { return new Node(this); }
    createBuffer(_, len) { return { getChannelData: () => new Float32Array(len) }; }
    createOscillator() { const n = new Node(this); sources.push(n); return n; }
    createBufferSource() { return this.createOscillator(); }
    async resume() {}
    async close() {}
  };
  try {
    const audio = new GameAudio();
    await audio.unlock();
    audio.handle([
      { type: 'lens_detent', layer: 1 },
      { type: 'lens_dive', layer: 2 },
      { type: 'phase_dash', layer: 0, rating: 'perfect' },
      { type: 'polytope_lock', layer: 1 },
      { type: 'harmonic_burst', layer: 1, surfCombo: true },
    ]);
    const tactileVoices = [...sources];
    assert.ok(tactileVoices.length >= 8, 'synthesizes crisp multi-voice tactile cues');
    audio.handle([{ type: 'fail', protected: true }]);
    assert.ok(tactileVoices.every(s => s.stopAt <= 2.05), 'failure stops all previously scheduled tactile voices');
    audio.dispose();
  } finally {
    globalThis.AudioContext = prevAudio;
  }
});
