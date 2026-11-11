// The handoff after the first activation, for every authored first room reachable from
// a fresh, actually earned discovery entry. The next step names the right layer and wheel
// direction (same-position rooms) or the anchor to return to (anchor rooms); idling never
// moves, shifts or activates for the player; pause freezes; H owns help; and following
// exactly what the game shows reaches and lights ②.
import assert from 'node:assert/strict';
import { runCourtyardChecks, FIRST_ROOMS, earnFirstDiscovery, enterCourtyard, chooseDiscoveryStarter, readFlow, followGuidance, waitSettled } from './courtyard-first-beat.mjs';

const LAYER_NAMES = ['潮汐层', '回声层', '绽放层'];

await runCourtyardChecks({ name: 'first-onward', cases: FIRST_ROOMS, run: async ({ page, base, width, out, shot, seed, room, handoff, anchor }) => {
  await earnFirstDiscovery(page, base);
  await enterCourtyard(page, seed);
  await chooseDiscoveryStarter(page, out, width);
  const order = (await readFlow(page)).state.mechanismOrder;
  await followGuidance(page, order[0]);
  const lit = await waitSettled(page);
  assert.equal(lit.state.roomId, room);
  assert.deepEqual(lit.state.activated, [order[0]]);
  const next = lit.state.nodes.find(n => n.kind === 'mechanism' && n.powered && !lit.state.activated.includes(n.id));
  assert.ok(next, 'the first activation powers a next mechanism');

  // Stage 2: the layer controls appear and the banner announces the new skill once.
  assert.equal(lit.stage, 2);
  assert.equal(await page.locator('#layer-controls').isVisible(), true);
  const guide = lit.state.companionGuide;
  let handoffCopy;
  if (handoff === 'same_xyz') {
    // Same XYZ: the stepper and the canvas pill both name the layer and its wheel direction.
    const direction = next.layer > lit.state.layer ? '上滚' : '下滚';
    handoffCopy = { title: await page.locator('#vstep-shift-title').innerText(), sub: await page.locator('#vstep-shift-sub').innerText() };
    assert.ok(handoffCopy.title.includes(LAYER_NAMES[next.layer]), `stepper names ${LAYER_NAMES[next.layer]}: ${handoffCopy.title}`);
    assert.ok(handoffCopy.sub.includes(direction), `stepper direction ${direction}: ${handoffCopy.sub}`);
    assert.ok(lit.pills.some(t => t.includes(`【${direction}`) && t.includes(LAYER_NAMES[next.layer])), `canvas pill names the same step: ${JSON.stringify(lit.pills)}`);
    assert.equal(await page.locator(`#layer-${next.layer}`).evaluate(el => el.classList.contains('attention-action')), true, 'the target layer button is the highlighted control');
  } else {
    // Anchor rooms: walk back first; the stepper names the ⚓ hub on the way.
    assert.equal(guide?.kind, 'move');
    handoffCopy = { title: await page.locator('#vstep-move-title').innerText() };
    assert.match(handoffCopy.title, /先回 ⚓ 归响台/);
  }
  await shot('handoff');

  // Idle: nothing moves, shifts or activates; no automatic help; the banner folds.
  await page.waitForFunction(t => window.__flow().time >= t + 6.2, lit.time);
  const idle = await readFlow(page);
  assert.equal(idle.state.node, lit.state.node); assert.equal(idle.state.layer, lit.state.layer);
  assert.deepEqual(idle.state.activated, lit.state.activated, 'the handoff cannot move, shift or activate');
  assert.equal(await page.locator('#friend-guide').isVisible(), false, 'no automatic idle help');
  assert.equal(await page.locator('#onboarding-banner').evaluate(el => el.classList.contains('collapsed')), true, 'the stage banner folds after its announcement');
  assert.equal(await page.locator('#action-feedback').isVisible(), false, 'no lingering popup');
  await shot('quiet');

  // Pause freezes the real model.
  await page.locator('#pause').click();
  const frozen = (await readFlow(page)).time;
  await page.waitForTimeout(300);
  assert.equal((await readFlow(page)).time, frozen, 'pause freezes the model');
  await page.locator('#resume').click();

  // H shows the companion's single hint, which then retires.
  await page.locator('#scene').focus();
  await page.keyboard.press('h');
  assert.equal(await page.locator('#friend-guide').isVisible(), true, 'H shows the companion hint');
  await page.waitForFunction(() => document.querySelector('#friend-guide').hidden, null, { timeout: 12000 });

  // Follow exactly what the game shows to reach ②.
  const trace = await followGuidance(page, next.id);
  const shifts = trace.filter(t => t.instruction).map(t => t.instruction);
  assert.equal(shifts.length, 1, `one instructed layer change: ${JSON.stringify(trace)}`);
  assert.equal(shifts[0].kind, handoff);
  assert.equal(shifts[0].to, next.layer);
  if (anchor) assert.equal(shifts[0].at, anchor, `the walk stops on the anchor that carries the bridge (${anchor})`);
  else assert.equal(shifts[0].at, order[0], 'the same-position change happens where ① stands');
  const after = await waitSettled(page);
  assert.equal(after.state.activated.length, 2);
  assert.ok(after.maxFullPills <= 2, `at most two full canvas pills at once (saw ${after.maxFullPills})`);
  await shot('followed');
  return { handoffCopy, trace };
} });
