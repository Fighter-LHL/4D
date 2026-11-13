// The first manual cross-layer anchor stop in intro Room 0 (confluence: after ① and ②'s
// sloped W-ramp, the bridge to ③ leaves ⚓ 归响台 on another slice). Choosing ③ walks back
// and stops on ⚓ hub; waiting or switching to a non-target slice never moves the player or
// resumes the walk; switching to the instructed slice reveals the bridge and resumes to ③.
import assert from 'node:assert/strict';
import { runCourtyardChecks, FIRST_ROOMS, earnFirstDiscovery, enterCourtyard, chooseDiscoveryStarter, readFlow, followGuidance, chooseTarget, waitSettled, readLayerInstruction, wheelNotch, tapLayerButton, fitsViewport } from './courtyard-first-beat.mjs';

export async function verifyAnchorStop({ page, base, viewport, hasTouch, out, shot, seed, room, anchor }) {
  await earnFirstDiscovery(page, base);
  await enterCourtyard(page, seed);
  await chooseDiscoveryStarter(page, out, viewport.key);
  const order = (await readFlow(page)).state.mechanismOrder;
  await followGuidance(page, order[0]);
  const afterFirst = await waitSettled(page);
  assert.equal(afterFirst.state.roomId, room);
  const second = afterFirst.state.nodes.find(n => n.kind === 'mechanism' && n.powered && !afterFirst.state.activated.includes(n.id));
  await followGuidance(page, second.id);
  const lit = await waitSettled(page);
  assert.equal(lit.state.activated.length, 2);
  const next = lit.state.nodes.find(n => n.kind === 'mechanism' && n.powered && !lit.state.activated.includes(n.id));
  assert.ok(next, 'activating ② powers ③');

  // Choosing ③ walks open bridges / ramps and stops on the ⚓ anchor that carries its cross-layer bridge.
  const visited = new Set();
  await chooseTarget(page, next.id);
  for (let i = 0; i < 50; i++) {
    const f = await readFlow(page);
    if (f.state.travel) visited.add(f.state.travel.to);
    if (!f.state.travel && !f.autoPilot && f.prompt) break;
    await page.waitForTimeout(150);
  }
  const stopped = await waitSettled(page);
  assert.equal(stopped.state.node, anchor, `the walk stops on ⚓ ${anchor}`);
  assert.ok(stopped.state.nodes.find(n => n.id === anchor).anchor, 'the stop is a cross-layer anchor');
  assert.notEqual(stopped.state.layer, next.layer, 'the game never switches into the target cross-layer slice for the player');
  assert.equal(stopped.prompt.at, anchor);
  assert.equal(stopped.prompt.targetId, next.id);
  const instruction = await readLayerInstruction(page);
  const promptText = await page.locator('#action-feedback').innerText();
  assert.match(promptText, /🌀|点亮③|已到/, `anchor stop shows a single transient shift prompt: ${promptText}`);
  await fitsViewport(page, page.locator('#action-feedback'), 'anchor shift prompt');
  await shot('anchor-stop');

  // Waiting changes nothing; the arrival popup retires while the stepper and badge stay.
  await page.waitForFunction(t => window.__flow().time >= t + 6.2, stopped.time);
  const idle = await readFlow(page);
  assert.equal(idle.state.node, anchor); assert.equal(idle.state.layer, stopped.state.layer);
  assert.equal(await page.locator('#action-feedback').isVisible(), false, 'the popup does not repeat the persistent instruction');
  await readLayerInstruction(page);
  assert.equal(await page.locator('#friend-guide').isVisible(), false, 'no automatic idle help');
  await shot('anchor-quiet');

  // Switching to a non-target slice (when reachable in one step) changes the slice but cannot walk on.
  const nonTargetLayer = [0, 1, 2].find(
    l => l !== stopped.state.layer && l !== stopped.prompt.layer && (hasTouch || Math.abs(l - stopped.state.layer) === 1)
  );
  if (nonTargetLayer !== undefined) {
    if (hasTouch) {
      await tapLayerButton(page, nonTargetLayer);
    } else {
      await wheelNotch(page, nonTargetLayer > stopped.state.layer ? 'up' : 'down');
    }
    await page.waitForTimeout(900);
    const astray = await readFlow(page);
    assert.equal(astray.state.layer, nonTargetLayer, 'manual slice input works on the anchor');
    assert.equal(astray.state.node, anchor, 'a non-target slice cannot move the player');
    assert.equal(astray.autoPilot, null, 'a non-target slice does not resume the walk');
    assert.deepEqual(astray.state.activated, stopped.state.activated);
  }

  // Following the instruction resumes the walk and lights ③ with no further target clicks.
  const trace = await followGuidance(page, next.id, { click: false });
  const after = await waitSettled(page);
  assert.ok(after.state.activated.includes(next.id), '③ is lit by the resumed walk');
  assert.equal(trace.filter(t => t.click).length, 0, `after choosing ③, only the instructed slice change is needed: ${JSON.stringify(trace)}`);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow');
  await shot('resumed');
  return { visited: [...visited], instruction: { title: instruction.title, sub: instruction.sub, pill: instruction.pill }, wrongWayTried: nonTargetLayer !== undefined, trace };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runCourtyardChecks({ name: 'first-return', cases: FIRST_ROOMS.filter(r => r.anchor === 'hub'), run: verifyAnchorStop });
}
