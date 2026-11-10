// Local feedback in the first courtyard after a real Flatland discovery.
// A refused action explains itself in one fitted popup (not repeated by the status line),
// an accepted departure retires that stale message, the first activation needs no E, and
// its result is announced once and then expires.
import assert from 'node:assert/strict';
import { runCourtyardChecks, FIRST_ROOMS, earnFirstDiscovery, enterCourtyard, chooseDiscoveryStarter, readFlow, chooseTarget, fitsViewport, waitSettled } from './courtyard-first-beat.mjs';

await runCourtyardChecks({ name: 'first-feedback', cases: FIRST_ROOMS, run: async ({ page, base, width, out, shot, seed, room }) => {
  await earnFirstDiscovery(page, base);
  await enterCourtyard(page, seed);
  await chooseDiscoveryStarter(page, out, width);
  await page.waitForFunction(() => window.__flow().momentum.cue?.beat === 'arrival');
  const start = await readFlow(page);
  assert.equal(start.state.roomId, room);
  const order = start.state.mechanismOrder;

  // Stage 1 shows one instruction: the banner names ①, layer controls stay hidden.
  assert.equal(start.stage, 1);
  assert.match(await page.locator('#onboarding-title').innerText(), /①/);
  assert.equal(await page.locator('#onboarding-banner').evaluate(el => el.classList.contains('collapsed')), false);
  assert.equal(await page.locator('#layer-controls').isVisible(), false, 'stage 1 does not show layer controls yet');
  assert.ok(start.pills.some(t => t.includes('第一步')), `the first target carries its canvas instruction: ${JSON.stringify(start.pills)}`);
  assert.equal(await page.locator('#action-feedback').isVisible(), false, 'arrival starts without a popup');

  // A refused action: the locked ③ explains why, in one fitted popup.
  await page.locator(`[data-mechanism="${order[2]}"]`).click();
  const refused = await readFlow(page);
  const refusal = await page.locator('#action-feedback').innerText();
  assert.match(refusal, /🔒/);
  assert.equal(refused.state.node, start.state.node, 'a refused target does not move the player');
  assert.equal(refused.state.travel, null);
  await fitsViewport(page, page.locator('#action-feedback'), 'refusal popup');
  assert.notEqual(await page.locator('#scene-state').innerText(), refusal, 'one DOM surface owns the result');
  assert.equal(await page.locator('#announcement').innerText(), refusal, 'the refusal is announced');
  await shot('refused');

  // Accepted departure towards ①: the stale refusal is retired while walking.
  const how = await chooseTarget(page, order[0]);
  await page.waitForFunction(() => !!window.__flow().state.travel);
  const walking = await page.locator('#action-feedback').isVisible() ? await page.locator('#action-feedback').innerText() : '';
  assert.doesNotMatch(walking, /🔒/, 'accepted departure retires the refusal');
  await shot('departing');

  // Landing activates ① without E; the result is announced once and fits.
  await page.waitForFunction(id => window.__flow().state.activated.includes(id), order[0]);
  const lit = await readFlow(page);
  const result = await page.locator('#action-feedback').innerText();
  assert.match(result, /已启动 · 1\/3/);
  assert.equal(await page.locator('#announcement').innerText(), result, 'accessible result is retained');
  await fitsViewport(page, page.locator('#action-feedback'), 'activation popup');
  assert.equal(lit.state.node, order[0]);
  await shot('activated');

  // The popup expires; nothing in the first session asked for E.
  await page.waitForFunction(() => document.getElementById('action-feedback').hidden, null, { timeout: 8000 });
  const settled = await waitSettled(page);
  const texts = settled.feedback.map(f => f.text).filter(Boolean);
  assert.equal(texts.some(t => /按 ?E/.test(t)), false, `no first-session feedback asks for E: ${JSON.stringify(texts)}`);
  assert.ok(settled.maxFullPills <= 2, `at most two full canvas pills at once (saw ${settled.maxFullPills})`);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow');
  await shot('settled');
  return { firstClick: how, refusal, result, feedbackTrail: texts };
} });
