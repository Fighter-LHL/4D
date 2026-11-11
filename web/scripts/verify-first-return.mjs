// The first return to the hub after the first activation (confluence: the bridge to ②
// leaves the hub on another slice). Choosing ② walks back and stops on the ⚓ hub; waiting
// or rolling the wrong way never moves the player or resumes the walk; rolling the
// instructed way reveals the bridge and the walk resumes to light ② without more input.
import assert from 'node:assert/strict';
import { runCourtyardChecks, FIRST_ROOMS, earnFirstDiscovery, enterCourtyard, chooseDiscoveryStarter, readFlow, followGuidance, chooseTarget, waitSettled, readLayerInstruction, wheelNotch } from './courtyard-first-beat.mjs';

export async function verifyAnchorStop({ page, base, width, out, shot, seed, room, anchor }) {
  await earnFirstDiscovery(page, base);
  await enterCourtyard(page, seed);
  await chooseDiscoveryStarter(page, out, width);
  const order = (await readFlow(page)).state.mechanismOrder;
  await followGuidance(page, order[0]);
  const lit = await waitSettled(page);
  assert.equal(lit.state.roomId, room);
  const next = lit.state.nodes.find(n => n.kind === 'mechanism' && n.powered && !lit.state.activated.includes(n.id));

  // Choosing ② walks the current slice only and stops on the anchor that carries its bridge.
  const visited = new Set();
  await chooseTarget(page, next.id);
  for (let i = 0; i < 40; i++) {
    const f = await readFlow(page);
    if (f.state.travel) visited.add(f.state.travel.to);
    if (!f.state.travel && !f.autoPilot && f.prompt) break;
    await page.waitForTimeout(150);
  }
  const stopped = await waitSettled(page);
  assert.equal(stopped.state.node, anchor, `the walk stops on ⚓ ${anchor}`);
  assert.ok(stopped.state.nodes.find(n => n.id === anchor).anchor, 'the stop is a cross-layer anchor');
  assert.equal(stopped.state.layer, lit.state.layer, 'the game never changes the layer for the player');
  assert.equal(stopped.prompt.at, anchor);
  assert.equal(stopped.prompt.targetId, next.id);
  const instruction = await readLayerInstruction(page);
  assert.match(await page.locator('#action-feedback').innerText(), new RegExp(`已到「${stopped.state.nodes.find(n => n.id === anchor).name}」`), 'arrival names the anchor once');
  await shot('anchor-stop');

  // Waiting changes nothing; the arrival popup retires while the stepper and pill stay.
  await page.waitForFunction(t => window.__flow().time >= t + 6.2, stopped.time);
  const idle = await readFlow(page);
  assert.equal(idle.state.node, anchor); assert.equal(idle.state.layer, stopped.state.layer);
  assert.equal(await page.locator('#action-feedback').isVisible(), false, 'the popup does not repeat the persistent instruction');
  await readLayerInstruction(page);
  assert.equal(await page.locator('#friend-guide').isVisible(), false, 'no automatic idle help');
  await shot('anchor-quiet');

  // A wrong-way notch (when one exists) changes the slice but cannot walk on.
  const wrong = instruction.direction === 'up' ? 'down' : 'up';
  const canGoWrong = wrong === 'up' ? stopped.state.layer < 2 : stopped.state.layer > 0;
  if (canGoWrong) {
    await wheelNotch(page, wrong);
    await page.waitForTimeout(900);
    const astray = await readFlow(page);
    assert.notEqual(astray.state.layer, stopped.state.layer, 'the wheel works on the anchor');
    assert.equal(astray.state.node, anchor, 'a wrong slice cannot move the player');
    assert.equal(astray.autoPilot, null, 'a wrong slice does not resume the walk');
    assert.deepEqual(astray.state.activated, stopped.state.activated);
  }

  // Following the instruction resumes the walk and lights ② with no further clicks:
  // the only click in this whole leg was choosing ②.
  const trace = await followGuidance(page, next.id, { click: false });
  const after = await waitSettled(page);
  assert.ok(after.state.activated.includes(next.id), '② is lit by the resumed walk');
  assert.equal(trace.filter(t => t.click).length, 0, `after choosing ②, only the instructed wheel: ${JSON.stringify(trace)}`);
  await shot('resumed');
  return { visited: [...visited], instruction: { title: instruction.title, sub: instruction.sub, pill: instruction.pill }, wrongWayTried: canGoWrong, trace };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runCourtyardChecks({ name: 'first-return', cases: FIRST_ROOMS.filter(r => r.anchor === 'hub'), run: verifyAnchorStop });
}
