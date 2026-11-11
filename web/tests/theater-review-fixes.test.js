import test from 'node:test';
import assert from 'node:assert/strict';
import { GameModel, LAYERS } from '../src/model.js';
import {
  ProgressiveOnboarding,
  nearestLayerCenter,
  resolveScrubReleaseTarget,
} from '../src/progressive-onboarding.js';
import { start, travel, reach, openVault, seedFor } from './model-helpers.js';

/**
 * Mirrors the per-frame `scrubGlide` loop in `web/src/main.js` (`frame()`):
 * steps `model.scrubW(next)` until `applied === target || !progressed`.
 */
function runScrubGlide(model, target, dt = 1 / 60, maxSteps = 240) {
  let steps = 0;
  let stalledAtClamp = false;
  while (steps < maxSteps) {
    steps += 1;
    const w = model.snapshot().w;
    const next = Math.abs(target - w) < 1e-3 ? target : w + (target - w) * Math.min(1, dt * 14);
    model.scrubW(next);
    const applied = model.snapshot().w;
    const progressed = applied === target || Math.abs(applied - target) < Math.abs(w - target) - 1e-6;
    if (applied === target || !progressed) {
      stalledAtClamp = applied !== target && !progressed;
      break;
    }
  }
  return { steps, finalW: model.snapshot().w, stalledAtClamp };
}

test('resolveScrubReleaseTarget + scrubGlide rebounds outer non-anchor Layer 0/1/2 platforms back to node.center and restores canMove', () => {
  const model = new GameModel(seedFor('confluence'), { ferryFromRoom: 0 });
  assert.equal(model.chooseRelic('shell'), true);
  model.drainEvents();

  // Collect all 3 mechanisms across Layers 0, 1, 2 in this room.
  const initialSnap = model.snapshot();
  const mechNodes = initialSnap.mechanismOrder.map(id => initialSnap.nodes.find(n => n.id === id));
  const layersCovered = new Set(mechNodes.map(n => n.layer));
  assert.deepEqual([...layersCovered].sort(), [0, 1, 2], 'test room mechanisms span Layers 0, 1, and 2');

  for (const mechId of initialSnap.mechanismOrder) {
    // Power prerequisites as needed by walking & activating in order.
    reach(model, mechId);
    const beforeScrub = model.snapshot();
    const node = beforeScrub.nodes.find(n => n.id === mechId);
    assert.equal(node.anchor, false, `${mechId} is a conditional non-anchor platform`);
    assert.equal(beforeScrub.w, LAYERS[node.layer].center);

    // Ensure a valid destination is selected so `canMove` reflects W alignment.
    const neighbor = beforeScrub.availableNodes[0];
    assert.ok(neighbor, `${mechId} has at least one open bridge`);
    assert.equal(model.select(neighbor), true);
    assert.equal(model.snapshot().canMove, true, 'canMove is true at layer center before scrub');

    // Aggressive off-slice scrub toward the opposite end of W with strong velocity.
    const distantW = node.layer === 0 ? 0.88 : node.layer === 2 ? 0.06 : 0.92;
    const velocity = node.layer === 2 ? -2.5 : 2.5;
    model.scrubW(distantW);
    const clampedSnap = model.snapshot();

    // At the +-0.13 clamp wall, W is outside the safe bridge window (~0.105), breaking canMove & ferry dock!
    const expectedClampedW = distantW > node.center ? node.center + 0.13 : node.center - 0.13;
    assert.ok(Math.abs(clampedSnap.w - expectedClampedW) < 1e-9, `${mechId} clamped at ${expectedClampedW}`);
    assert.equal(clampedSnap.canMove, false, `${mechId} at clamp wall cannot move before snap-back`);
    const clampedNode = clampedSnap.nodes.find(n => n.id === mechId);
    assert.ok(clampedNode.visibility < 1, `${mechId} island cross-section is shrunken at clamp wall`);
    if (clampedSnap.ferry && clampedSnap.ferry.a === mechId) {
      assert.ok(clampedSnap.ferry.u > 0.1, 'ferry drifts away from dock A while stuck at clamp wall');
      assert.equal(model.select('ferry'), true);
      assert.equal(model.snapshot().canMove, false, 'cannot board ferry at clamp wall');
      assert.equal(model.select(neighbor), true);
    }
    if (clampedSnap.ferry && clampedSnap.ferry.b === mechId) {
      assert.ok(clampedSnap.ferry.u < 0.9, 'ferry drifts away from dock B while stuck at clamp wall');
      assert.equal(model.select('ferry'), true);
      assert.equal(model.snapshot().canMove, false, 'cannot board ferry at clamp wall');
      assert.equal(model.select(neighbor), true);
    }

    // Both release ('end') and pointer cancel ('cancel') MUST target the platform's own layer center.
    const endTarget = resolveScrubReleaseTarget(clampedSnap, {
      phase: 'end',
      w: clampedSnap.w,
      velocity,
      beforeW: beforeScrub.w,
    });
    const cancelTarget = resolveScrubReleaseTarget(clampedSnap, {
      phase: 'cancel',
      w: clampedSnap.w,
      velocity,
      beforeW: clampedSnap.w, // even if beforeW was already off-center from an interrupted scrub
    });
    assert.equal(endTarget, LAYERS[node.layer].center, `${mechId} (layer ${node.layer}) release snaps to own center`);
    assert.equal(cancelTarget, LAYERS[node.layer].center, `${mechId} (layer ${node.layer}) cancel snaps to own center`);

    // Simulate scrubGlide and prove W rebounds cleanly without stalling at the clamp wall.
    const glide = runScrubGlide(model, endTarget);
    assert.equal(glide.stalledAtClamp, false, `${mechId} glide never stalls against clamp wall`);
    assert.equal(glide.finalW, LAYERS[node.layer].center);

    const restored = model.snapshot();
    assert.equal(restored.w, LAYERS[node.layer].center);
    assert.equal(restored.canMove, true, `${mechId} canMove is restored after rebound`);
    assert.equal(restored.phaseStability, 1);
    assert.equal(restored.nodes.find(n => n.id === mechId).visibility, 1, `${mechId} island scale restored to 1`);
    if (restored.ferry && restored.ferry.a === mechId) {
      assert.equal(restored.ferry.u, 0, 'ferry returns flush to dock A (gangplank restored)');
      assert.equal(restored.ferry.docked, 'a');
    }
    if (restored.ferry && restored.ferry.b === mechId) {
      assert.equal(restored.ferry.u, 1, 'ferry returns flush to dock B (gangplank restored)');
      assert.equal(restored.ferry.docked, 'b');
    }

    // Activate mechanism and wait for downstream power delivery before testing the next layer's mechanism.
    if (!restored.activated.includes(mechId)) {
      assert.equal(model.interact(), true);
      model.update(0.55);
    }
  }
});

test('resolveScrubReleaseTarget preserves free cross-layer momentum on anchors (hub & ferry), cancel rollback, and active waves', () => {
  const model = new GameModel(seedFor('confluence'), { ferryFromRoom: 0 });
  assert.equal(model.chooseRelic('shell'), true);
  model.drainEvents();

  // 1. Anchor (hub): flicking from 0.18 to 0.41 with upward velocity (+1.0 -> origin 0.53) lands on Layer 1 (0.50).
  const beforeHub = model.snapshot();
  assert.equal(beforeHub.node, 'hub');
  model.scrubW(0.41);
  const afterHubFlick = model.snapshot();
  const hubTarget = resolveScrubReleaseTarget(afterHubFlick, {
    phase: 'end',
    w: afterHubFlick.w,
    velocity: 1.0,
    beforeW: beforeHub.w,
  });
  assert.equal(hubTarget, LAYERS[1].center, 'anchor flick with positive velocity snaps to Layer 1 (0.50)');
  const hubGlide = runScrubGlide(model, hubTarget);
  assert.equal(hubGlide.stalledAtClamp, false);
  assert.equal(model.snapshot().w, LAYERS[1].center);

  // 2. Anchor cancel: dragging to 0.80 then cancelling rolls back to session beforeW (0.50 -> Layer 1).
  const sessionBeforeW = model.snapshot().w;
  model.scrubW(0.80);
  const cancelTarget = resolveScrubReleaseTarget(model.snapshot(), {
    phase: 'cancel',
    w: 0.80,
    velocity: 1.5,
    beforeW: sessionBeforeW,
  });
  assert.equal(cancelTarget, LAYERS[1].center, 'cancel on anchor returns to beforeW layer center');
  runScrubGlide(model, cancelTarget);
  assert.equal(model.snapshot().w, LAYERS[1].center);

  // 3. Ferry anchor: scrubbing from dock A across to dock B snaps to dock B's layer center.
  const ferryInfo = model.snapshot().ferry;
  model.setW(ferryInfo.centerA);
  travel(model, ferryInfo.a);
  travel(model, 'ferry');
  assert.equal(model.snapshot().node, 'ferry');
  model.scrubW(ferryInfo.centerB - 0.05);
  const ferryTarget = resolveScrubReleaseTarget(model.snapshot(), {
    phase: 'end',
    w: model.snapshot().w,
    velocity: ferryInfo.centerB > ferryInfo.centerA ? 0.8 : -0.8,
    beforeW: ferryInfo.centerA,
  });
  assert.equal(ferryTarget, ferryInfo.centerB, 'ferry anchor snaps cleanly to destination dock layer');
  runScrubGlide(model, ferryTarget);
  assert.equal(model.snapshot().ferry.docked, 'b');

  // 4. Safe non-risky bridge travel: high pointer velocity cannot pull target out of bridge layer.
  const bridgeModel = start('shell', seedFor('confluence'));
  assert.equal(bridgeModel.select('dew'), true);
  bridgeModel.setW(bridgeModel.snapshot().range.center);
  assert.equal(bridgeModel.move(), true);
  bridgeModel.scrubW(0.95);
  const travelSnap = bridgeModel.snapshot();
  assert.ok(travelSnap.travel && !travelSnap.travel.risky);
  const travelTarget = resolveScrubReleaseTarget(travelSnap, {
    phase: 'end',
    w: travelSnap.w,
    velocity: 3.0,
    beforeW: travelSnap.travel.center,
  });
  assert.equal(travelTarget, LAYERS[travelSnap.travel.layer].center, 'safe crossing snaps back to bridge layer center');

  // 5. Active wave: scrubW is unclamped and snaps freely to safe layer center.
  const waveModel = start('shell', seedFor('confluence'));
  openVault(waveModel);
  const waveSnap0 = waveModel.snapshot();
  assert.ok(waveSnap0.wave, 'vault wave is active');
  const safeLayer = waveSnap0.wave.safeLayers[0];
  const safeCenter = LAYERS[safeLayer].center;
  waveModel.scrubW(safeCenter);
  const waveTarget = resolveScrubReleaseTarget(waveModel.snapshot(), {
    phase: 'end',
    w: safeCenter,
    velocity: 0,
    beforeW: waveSnap0.w,
  });
  assert.equal(waveTarget, safeCenter, 'active wave snaps freely to scrubbed safe layer');
  assert.equal( nearestLayerCenter(waveModel.snapshot(), safeCenter), safeCenter);
});

test('ProgressiveOnboarding.resetRun clears roomFailures/assist state and resets maxStageReached from Act II (4) back to Act I (1)', () => {
  const onboarding = new ProgressiveOnboarding({ skillGated: true });

  // Accumulate failures, idle time, explicit hint override, and wheel inertia lock in Run 1.
  onboarding.recordFailure();
  onboarding.recordFailure();
  onboarding.tickIdle(16, { phase: 'playing', room: 0, travel: null, wave: null });
  onboarding.requestExplicitHint();
  assert.equal(onboarding.shouldShowAssistButton(), true, '2+ failures / 16s idle shows assist button');
  assert.equal(onboarding.handleDiscreteWheel(-100, 0, 5000), 1, 'wheel step engages inertia lock');
  assert.equal(onboarding.lockedUntilQuiet, true);

  // Switch to Act II (expedition), raising maxStageReached to 4 and announcing banner at t=6000ms.
  const expeditionRoom0 = { mode: 'expedition', phase: 'playing', room: 0, activated: [], travel: null, wave: null };
  assert.equal(onboarding.computeStage(expeditionRoom0).stage, 4);
  assert.equal(onboarding.maxStageReached, 4);
  const expBanner = onboarding.consumeStageUpBanner(expeditionRoom0, 0, 6000);
  assert.equal(expBanner?.stage, 4);
  assert.equal(onboarding.lastAnnouncedStage, 4);

  // Restart into Act I (intro) via resetRun().
  onboarding.resetRun();

  assert.equal(onboarding.roomFailures, 0);
  assert.equal(onboarding.idleSeconds, 0);
  assert.equal(onboarding.lastRoom, 0);
  assert.equal(onboarding.explicitHintOverride, false);
  assert.equal(onboarding.maxStageReached, 1);
  assert.equal(onboarding.lastAnnouncedStage, 1);
  assert.equal(onboarding.lastBannerAtMs, -Infinity);
  assert.equal(onboarding.wheelAccumulator, 0);
  assert.equal(onboarding.lockedUntilQuiet, false);

  // At t=0 of new Act I Room 0, assist button is hidden and stage is back to Stage 1!
  const introRoom0 = { mode: 'intro', phase: 'playing', room: 0, activated: [], travel: null, wave: null };
  onboarding.tickIdle(0, introRoom0);
  assert.equal(onboarding.shouldShowAssistButton(), false, 'assist button hidden at t=0 of fresh Room 0');
  assert.equal(onboarding.computeStage(introRoom0).stage, 1, 'Act I restarts cleanly at Stage 1 after Act II');
  assert.equal(onboarding.consumeStageUpBanner(introRoom0, 0, 100), null);

  // Lighting ① in the new Act I run announces Stage 2 immediately without stale banner cooldown bleed,
  // and wheel input at low timestamp works without stale step-cooldown bleed.
  const afterFirstMech = { ...introRoom0, activated: ['dew'] };
  const stage2Banner = onboarding.consumeStageUpBanner(afterFirstMech, 0, 200);
  assert.equal(stage2Banner?.stage, 2, 'Stage 2 banner fires cleanly in restarted Act I run');
  assert.equal(onboarding.handleDiscreteWheel(-90, 0, 250), 1, 'wheel step works cleanly in restarted run');
});
