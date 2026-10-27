import assert from 'node:assert/strict';

// Appended only by the browser checks: observes real input/rendering, never
// changes the model, timing, collection, or persisted first-entry budget.
export const courtyardBeatObserver = `
window.__courtyardBeats = []; window.__courtyardBeatConflicts = [];
let observedBeat = null, beatDrawing = false, beatStrokes = 0;
const beatRender = scene.render.bind(scene), beatDraw = scene.drawMomentum.bind(scene), beatStroke = scene.ctx.stroke.bind(scene.ctx);
scene.ctx.stroke = (...args) => { if (beatDrawing && scene.ctx.globalAlpha > .05) beatStrokes++; return beatStroke(...args); };
scene.drawMomentum = () => { beatDrawing = true; try { beatDraw(); } finally { beatDrawing = false; } };
scene.render = dt => {
  beatStrokes = 0; beatRender(dt);
  const cue = scene.state?.courtyardMomentum, key = cue && cue.beat + ':' + cue.node;
  if (key && key !== observedBeat) window.__courtyardBeats.push({ beat: cue.beat, node: cue.node, time: model.time });
  observedBeat = key;
  const primary = [...document.querySelectorAll('.action-row .primary-button, .action-row .attention-action')];
  if (primary.length > 1 || primary.some(el => el.disabled) || (cue && scene.state.companionGuide))
    window.__courtyardBeatConflicts.push({ time: model.time, primary: primary.map(el => el.id), cue });
};
window.__courtyardBeat = () => structuredClone({ time: model.time, firstEntry: momentum.firstEntry,
  cue: scene.state?.courtyardMomentum, renderedNode: scene.momentumNode()?.id, strokes: beatStrokes,
  node: model.node, selected: model.selected, settled: guide.settled, used: [...momentum.used],
  beats: window.__courtyardBeats, conflicts: window.__courtyardBeatConflicts });
`;

// Called after the real "go to courtyard" link with a genuinely earned friend.
export async function verifyCourtyardFirstBeat(page, out, width, { interrupt = false } = {}) {
  const read = () => page.evaluate(() => window.__courtyardBeat());
  const shot = name => page.screenshot({ path: `${out}/courtyard-first-beat-${name}-${width}.png`, fullPage: true });
  assert.equal(new URL(page.url()).searchParams.get('from'), 'discovery');
  await page.getByRole('button', { name: '选择缓落壳', exact: true }).click();
  assert.equal(await page.locator('#friend-guide').isVisible(), false, 'entry is not occupied by automatic help');
  await page.waitForFunction(() => window.__courtyardBeat().cue?.beat === 'arrival' && window.__courtyardBeat().cue.age >= .3);
  const invitation = await read();
  assert.equal(invitation.firstEntry, true);
  assert.ok(invitation.beats[0].time >= 1 && invitation.beats[0].time <= 3);
  assert.notEqual(invitation.cue.node, invitation.node, 'invite a next step, not the starting platform');
  assert.equal(invitation.cue.node, invitation.selected);
  assert.equal(invitation.renderedNode, invitation.selected);
  assert.ok(invitation.strokes > 0, 'the invited platform actually paints its glint');
  assert.equal(await page.locator('.action-row .primary-button').count(), 1);
  assert.equal(await page.locator('#move.primary-button.attention-action').count(), 1);
  assert.equal(await page.locator('#friend-guide').isVisible(), false);
  assert.equal(await page.locator('#announcement').innerText(), '');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await shot('invitation');
  await page.locator('#pause').click();
  const frozen = (await read()).cue;
  await page.waitForTimeout(250);
  assert.deepEqual((await read()).cue, frozen);
  await page.locator('#resume').click();
  let completed = null;
  if (interrupt) {
    await page.keyboard.press('h');
    assert.equal((await read()).cue, null, 'H immediately takes the invitation channel');
    assert.equal(await page.locator('#friend-guide').isVisible(), true);
    await shot('help');
    await page.locator('#move').click();
    await page.waitForFunction(() => window.__courtyardBeat().settled);
    await page.waitForFunction(() => window.__courtyardBeat().time >= 8);
    assert.deepEqual((await read()).used, ['arrival'], 'cancelled invitations cannot pay out later');
  } else {
    await page.waitForFunction(t => window.__courtyardBeat().time >= t + 6.5, invitation.time);
    const idle = await read();
    assert.equal(idle.cue, null); assert.deepEqual(idle.used, ['arrival']);
    assert.equal(await page.locator('#friend-guide').isVisible(), false, 'no second prompt on the six-second idle timer');
    assert.equal(await page.locator('#announcement').innerText(), '');
    await shot('idle');
    await page.locator('#move').click();
    await page.waitForFunction(() => window.__courtyardBeat().cue?.beat === 'follow' && window.__courtyardBeat().cue.age >= .2);
    completed = await read();
    assert.equal(completed.node, invitation.cue.node);
    assert.equal(completed.renderedNode, completed.node); assert.ok(completed.strokes > 0);
    assert.equal(completed.settled, true);
    assert.deepEqual(completed.used, ['arrival', 'follow']);
    assert.equal(await page.locator('#friend-guide').isVisible(), false);
    assert.equal(await page.locator('.action-row .primary-button').count(), 1);
    await shot('complete');
    await page.keyboard.press('h');
    assert.equal((await read()).cue, null, 'earned feedback also yields immediately to H');
    assert.equal(await page.locator('#friend-guide').isVisible(), true);
  }
  await page.locator('#interact').click();
  await page.waitForFunction(() => document.querySelector('#mechanism-count').textContent === '1 / 3');
  const activatedAt = (await read()).time;
  await page.waitForFunction(t => window.__courtyardBeat().time >= t + 6.2, activatedAt);
  const settled = await read();
  assert.equal(settled.cue, null);
  assert.deepEqual(settled.beats.map(b => b.beat), interrupt ? ['arrival'] : ['arrival', 'follow']);
  assert.equal(await page.locator('#friend-guide').isVisible(), false);
  assert.deepEqual(settled.conflicts, []);
  await shot('settled');
  await page.reload();
  await page.getByRole('button', { name: '选择缓落壳', exact: true }).click();
  await page.locator('#align').click();
  await page.waitForFunction(() => window.__courtyardBeat().time >= 3.5);
  const revisit = await read();
  assert.equal(revisit.firstEntry, false); assert.equal(revisit.cue, null);
  assert.deepEqual(revisit.beats, []); assert.deepEqual(revisit.used, []);
  assert.deepEqual(revisit.conflicts, []);
  return { invitation, completed, settled, revisit, interrupt, idleSeconds: interrupt ? null : 6.5, passed: true };
}
