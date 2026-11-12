// First courtyard completion, earned through real discovery and ordinary UI input only:
// every mechanism is reached by following the game's own guidance, the exit card opens,
// choosing it lands in the interlude with an ordinary picker while leaving first-run-done unset until won;
// no departure instruction is painted while walking; restart and revisit stay ordinary.
import assert from 'node:assert/strict';
import { runCourtyardChecks, FIRST_ROOMS, earnFirstDiscovery, enterCourtyard, chooseDiscoveryStarter, readFlow, followGuidance, waitSettled, verifyRestartAndRevisit } from './courtyard-first-beat.mjs';

await runCourtyardChecks({ name: 'first-exit', cases: FIRST_ROOMS, run: async ({ page, base, width, out, shot, seed, room }) => {
  await earnFirstDiscovery(page, base);
  await enterCourtyard(page, seed);
  await chooseDiscoveryStarter(page, out, width);
  const startedAt = Date.now();
  assert.equal((await readFlow(page)).state.roomId, room);

  // Light each mechanism in the order the checklist marks as the current target.
  const traces = [];
  {
    for (let n = 0; n < 3; n++) {
      const s = (await waitSettled(page)).state;
      const target = s.mechanismOrder.find(id => s.nodes.find(node => node.id === id).powered && !s.activated.includes(id));
      assert.ok(target, 'a powered mechanism is waiting');
      const row = page.locator(`[data-mechanism="${target}"] small`);
      assert.equal(await row.innerText(), '🎯 当前目标', 'the checklist marks the target it expects next');
      if (n === 1) {
        // Explicit help owns its channel and then retires; it never acts.
        await page.locator('#scene').focus();
        await page.keyboard.press('h');
        assert.equal(await page.locator('#friend-guide').isVisible(), true, 'H owns the instruction');
        const helped = (await readFlow(page)).state;
        await page.waitForFunction(() => document.querySelector('#friend-guide').hidden, null, { timeout: 12000 });
        const after = (await readFlow(page)).state;
        assert.equal(after.node, helped.node); assert.equal(after.layer, helped.layer);
      }
      traces.push({ target, trace: await followGuidance(page, target) });
    }
  }
  const lit = await waitSettled(page);
  assert.equal(lit.state.activated.length, 3, 'all three mechanisms activated through UI');
  // Recorded per painted frame: no callout instruction is drawn while a crossing is under way.
  assert.deepEqual(lit.travelPills, [], 'no callout instruction is painted during a crossing');

  // The exit card opens and choosing it finishes the room.
  assert.match(await page.locator('#exit-step-sub').innerText(), /大门已开/);
  assert.equal(await page.locator('#exit-step-card').evaluate(el => el.classList.contains('exit-open')), true);
  await shot('exit-open');
  traces.push({ target: 'exit', trace: await followGuidance(page, 'exit') });
  await page.locator('#choice-dialog[open]').waitFor();
  const interlude = await readFlow(page);
  assert.equal(interlude.state.phase, 'interlude');
  assert.equal(await page.locator('#choice-dialog.discovery-choice').count(), 0, 'next-room choice remains ordinary');
  assert.equal(await page.locator('.starter-alternatives').count(), 0);
  assert.equal(await page.locator('#relic-choices button:visible').count(), interlude.state.choices.length);
  assert.equal(await page.evaluate(() => localStorage.getItem('wslice-first-run-done')), null, 'finishing the first room keeps wslice-first-run-done unset until won');
  const elapsedMs = Date.now() - startedAt;
  await shot('interlude');
  await page.locator('#relic-choices button').first().click();

  const restart = await verifyRestartAndRevisit(page);
  return { elapsedMs, traces, interludeChoices: interlude.state.choices.map(c => c.id), ...restart };
} });
