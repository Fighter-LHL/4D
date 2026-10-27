import assert from 'node:assert/strict';
import { pathTo } from '../tests/model-helpers.js';

// Appended only by the browser checks: observes real input/rendering, never
// changes the model, timing, collection, or persisted first-entry budget.
export const courtyardBeatObserver = `
window.__courtyardBeats = []; window.__courtyardBeatEnds = []; window.__courtyardBeatEvents = []; window.__courtyardBeatConflicts = [];
window.__courtyardPowerFrames = []; window.__courtyardPowerConflicts = [];
let pendingPower = [];
const beatPush = scene.pushEvents.bind(scene);
scene.pushEvents = events => {
  window.__courtyardBeatEvents.push(...events.filter(e => ['activate', 'power', 'fail'].includes(e.type)).map(e => ({ ...e, time: model.time })));
  pendingPower.push(...events.filter(e => e.type === 'power').map(e => ({ ...e, beat: scene.state?.courtyardMomentum?.beat || null, slotsVisible: hasSupplySlots(e.to) })));
  beatPush(events);
};
let observedBeat = null, beatDrawing = false, beatStrokes = 0;
const beatRender = scene.render.bind(scene), beatDraw = scene.drawMomentum.bind(scene), beatStroke = scene.ctx.stroke.bind(scene.ctx);
scene.ctx.stroke = (...args) => { if (beatDrawing && scene.ctx.globalAlpha > .05) beatStrokes++; return beatStroke(...args); };
scene.drawMomentum = () => { beatDrawing = true; try { beatDraw(); } finally { beatDrawing = false; } };
scene.render = dt => {
  beatStrokes = 0; beatRender(dt);
  const cue = scene.state?.courtyardMomentum, key = cue && cue.beat + ':' + cue.node;
  if (key && key !== observedBeat) window.__courtyardBeats.push({ beat: cue.beat, node: cue.node, time: model.time });
  if (observedBeat && key !== observedBeat) window.__courtyardBeatEnds.push({ key: observedBeat, time: model.time });
  observedBeat = key;
  const primary = [...document.querySelectorAll('.action-row .primary-button, .action-row .attention-action, .layer-controls .attention-action')];
  if (primary.length > 1 || primary.some(el => el.disabled) || (cue && scene.state.companionGuide))
    window.__courtyardBeatConflicts.push({ time: model.time, primary: primary.map(el => el.id), cue });
  const notes = scene.effects.filter(e => e.kind === 'note' && e.supply).map(e => e.text);
  const text = $('action-feedback').hidden ? '' : $('action-feedback').textContent;
  const status = $('scene-state').textContent;
  const powerText = /供能到齐|供能 [0-9]|还差一路/.test(text);
  if ((['mechanism', 'mechanism-follow'].includes(cue?.beat) && (notes.length || powerText)) ||
      notes.filter(t => t.includes('供能到齐')).length + Number(text.includes('供能到齐')) + Number(status.includes('供能到齐')) > 1)
    window.__courtyardPowerConflicts.push({ time: model.time, cue, notes, text, status });
  if (pendingPower.length) {
    window.__courtyardPowerFrames.push({ time: model.time, node: model.node, cue, events: pendingPower, notes, text, status,
      announcement: $('announcement').textContent, primary: primary.map(el => el.id),
      effects: scene.effects.filter(e => ['power', 'ring'].includes(e.kind)).map(e => e.kind),
      slots: [...document.querySelectorAll('[data-mechanism]')].map(row => ({ id: row.dataset.mechanism,
        received: row.querySelectorAll('[data-source].received').length, total: row.querySelectorAll('[data-source]').length })) });
    pendingPower = [];
  }
};
window.__courtyardSupplyState = () => model.snapshot();
window.__courtyardBeat = () => structuredClone({ time: model.time, firstEntry: momentum.firstEntry,
  friends: scene.friends.map(({ id, name }) => ({ id, name })),
  firstAction: momentum.firstAction(model.snapshot(), guide), objective: $('objective').textContent, moveLabel: $('move').textContent,
  cue: scene.state?.courtyardMomentum, renderedNode: scene.momentumNode()?.id, strokes: beatStrokes,
  node: model.node, selected: model.selected, settled: guide.settled, used: [...momentum.used],
  activated: [...model.activated], nodes: model.snapshot().nodes.map(n => ({ id: n.id, required: n.required, received: n.received, powered: n.powered, present: n.present })),
  beats: window.__courtyardBeats, ends: window.__courtyardBeatEnds, events: window.__courtyardBeatEvents, conflicts: window.__courtyardBeatConflicts,
  powerFrames: window.__courtyardPowerFrames, powerConflicts: window.__courtyardPowerConflicts });
`;

async function assertFirstAction(page, action, node) {
  const state = await page.evaluate(() => window.__courtyardSupplyState());
  const target = state.nodes.find(n => n.id === node);
  const actual = await page.evaluate(() => window.__courtyardBeat());
  assert.deepEqual(actual.firstAction, { action, node }, 'instruction refers to the invitation already seen');
  assert.equal(actual.objective, action === 'move' ? `先到${target.name} · 稳行过去` : `启动脚下的${target.name} · 按 E`);
  const button = page.locator(`#${action}.primary-button.attention-action`);
  assert.equal(await button.count(), 1);
  assert.ok((await button.innerText()).includes(action === 'move' ? `到${target.name}` : `启动${target.name}`));
  assert.ok(await button.evaluate(el => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight), 'named primary action fits its button');
  const box = await button.boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= page.viewportSize().width, 'named primary stays within the viewport');
}

async function reachThroughUI(page, target) {
  const state = await page.evaluate(() => window.__courtyardSupplyState());
  const path = pathTo(state, target);
  assert.ok(path, `visible route to ${target}`);
  for (const step of path) {
    if (step.kind === 'shift') await page.locator(`[data-layer="${step.layer}"]`).click();
    else {
      await page.getByRole('button', { name: `前往${state.nodes.find(n => n.id === step.id).name}`, exact: true }).click();
      await page.locator('#align').click(); await page.locator('#move').click();
    }
    await page.waitForFunction(id => { const s = window.__courtyardSupplyState(); return s.node === id && !s.travel; }, step.id);
  }
}

function assertQuietPower(frames) {
  // A split-bridge first mechanism opens a bridge and sends no power.
  for (const frame of frames) {
    assert.deepEqual(frame.notes, [], 'visible slots / completion leave no scene power note');
    assert.doesNotMatch(frame.status, /供能到齐|供能 [0-9]|还差一路/, 'status does not repeat the action popup');
    assert.ok(frame.effects.includes('power') && frame.effects.includes('ring'), 'power and ring remain');
    for (const event of frame.events) {
      const slot = frame.slots.find(s => s.id === event.to);
      assert.equal(slot.received, event.received, 'the rendered slots reflect delivery');
      if (!event.complete || ['mechanism', 'mechanism-follow'].includes(event.beat)) {
        assert.doesNotMatch(frame.text, /供能到齐|供能 [0-9]|还差一路/);
        assert.doesNotMatch(frame.announcement, /供能到齐|供能 [0-9]|还差一路/);
      }
    }
  }
}

export async function verifyPowerAtReceiver(page, out, width) {
  await page.goto(new URL('/?seed=2', page.url()).href);
  await page.getByRole('button', { name: '选择缓落壳', exact: true }).click();
  await reachThroughUI(page, 'bloom'); await page.locator('#interact').click();
  await page.waitForFunction(() => window.__courtyardBeat().powerFrames.length === 1);
  await reachThroughUI(page, 'dew'); await page.locator('#interact').click();
  await page.keyboard.press('z'); // Same XYZ receiver, before the committed .5s delivery.
  await page.waitForFunction(() => window.__courtyardBeat().powerFrames.length === 2);
  const receipt = await page.evaluate(() => window.__courtyardBeat());
  assertQuietPower(receipt.powerFrames);
  const complete = receipt.powerFrames[1];
  assert.equal(complete.node, 'bell'); assert.equal(complete.events[0].complete, true);
  assert.deepEqual(complete.primary, ['interact']);
  assert.doesNotMatch(complete.text, /供能到齐|到台上/);
  assert.doesNotMatch(complete.announcement, /供能到齐|到台上/);
  assert.deepEqual(receipt.powerConflicts, []);
  await page.screenshot({ path: `${out}/courtyard-power-at-receiver-${width}.png`, fullPage: true });
  return receipt;
}

// Called after the real "go to courtyard" link with a genuinely earned friend.
export async function verifyCourtyardFirstBeat(page, out, width, { interrupt = false, fullPowerChain = false, starterRelic = 'shell' } = {}) {
  const read = () => page.evaluate(() => window.__courtyardBeat());
  const shot = name => page.screenshot({ path: `${out}/courtyard-first-beat-${name}-${width}.png`, fullPage: true });
  assert.equal(new URL(page.url()).searchParams.get('from'), 'discovery');
  await page.locator('#choice-dialog[open]').waitFor();
  const beforeChoice = await page.evaluate(() => window.__courtyardSupplyState());
  const friends = (await read()).friends;
  assert.ok(friends.length > 0, 'entry uses an actually earned companion');
  assert.equal(await page.locator('#choice-title').innerText(), `${friends.length === 1 ? friends[0].name : '伙伴们'}也来了。`);
  const primaryChoice = page.getByRole('button', { name: '带缓落壳出发', exact: true });
  assert.equal(await page.locator('#relic-choices .primary-button').count(), 1);
  assert.equal(await page.locator('#relic-choices button:visible').count(), 1);
  assert.equal(await page.locator('#relic-choices button').count(), 5, 'all five relics remain available');
  assert.ok(await primaryChoice.evaluate(el => document.activeElement === el), 'entry focuses the explicit departure action');
  assert.ok(await primaryChoice.evaluate(el => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight));
  const choiceBox = await primaryChoice.boundingBox();
  assert.ok(choiceBox.x >= 0 && choiceBox.x + choiceBox.width <= width && choiceBox.y >= 0 && choiceBox.y + choiceBox.height <= page.viewportSize().height);
  const fits = () => page.locator('#choice-dialog').evaluate(el => el.scrollHeight <= el.clientHeight + 2 && el.scrollWidth <= el.clientWidth);
  assert.ok(await fits(), 'collapsed choice fits without scrolling');
  await page.screenshot({ path: `${out}/courtyard-entry-choice-${width}.png`, fullPage: true });
  // Native keyboard disclosure never chooses a relic or spends gameplay time.
  await page.keyboard.press('Tab');
  assert.ok(await page.locator('.starter-alternatives summary').evaluate(el => document.activeElement === el));
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#relic-choices button:visible').count(), 5);
  assert.equal(await page.locator('#relic-choices .primary-button').count(), 1);
  assert.ok(await fits(), 'expanded alternatives fit without scrolling');
  await page.waitForTimeout(250);
  assert.deepEqual(await page.evaluate(() => window.__courtyardSupplyState()), beforeChoice, 'browsing choices does not start, advance or equip the run');
  await page.screenshot({ path: `${out}/courtyard-entry-alternatives-${width}.png`, fullPage: true });
  if (starterRelic === 'shell') {
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#relic-choices button:visible').count(), 1);
    await page.keyboard.press('Shift+Tab');
    assert.ok(await primaryChoice.evaluate(el => document.activeElement === el));
    await page.keyboard.press('Enter');
  } else {
    assert.equal(starterRelic, 'shadow');
    await page.getByRole('button', { name: '选择留影扣', exact: true }).click();
  }
  const chosen = await page.evaluate(() => window.__courtyardSupplyState());
  assert.equal(chosen.phase, 'playing');
  assert.deepEqual(Object.entries(chosen.relics).filter(([, rank]) => rank > 0), [[starterRelic, 1]], 'only the explicitly chosen relic is equipped');
  const entryChoice = { friends, starterRelic, initialPhase: beforeChoice.phase, chosenRelics: chosen.relics,
    singlePrimary: true, keyboardDisclosure: true, fitsCollapsedAndExpanded: true, noAutostart: true };
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
  await assertFirstAction(page, 'move', invitation.cue.node);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await shot('invitation');
  await page.locator('#pause').click();
  const frozen = (await read()).cue;
  await page.waitForTimeout(250);
  assert.deepEqual((await read()).cue, frozen);
  await page.locator('#resume').click();
  let completed = null, secondInvitation = null, secondCompleted = null;
  const helpAt = interrupt === true ? 'arrival' : interrupt;
  if (helpAt === 'arrival') {
    await page.keyboard.press('h');
    assert.equal((await read()).cue, null, 'H immediately takes the invitation channel');
    assert.equal(await page.locator('#friend-guide').isVisible(), true);
    assert.equal((await read()).firstAction, null, 'H also retires the named instruction');
    assert.match(await page.locator('#move').innerText(), /^稳行/);
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
    await assertFirstAction(page, 'move', invitation.cue.node);
    await shot('idle');
    await page.locator('#move').click();
    assert.equal((await read()).firstAction, null, 'crossing retires the named invitation');
    assert.match(await page.locator('#move').innerText(), /^穿越中/);
    await page.waitForFunction(() => window.__courtyardBeat().cue?.beat === 'follow' && window.__courtyardBeat().cue.age >= .2);
    completed = await read();
    assert.equal(completed.node, invitation.cue.node);
    assert.equal(completed.renderedNode, completed.node); assert.ok(completed.strokes > 0);
    assert.equal(completed.settled, true);
    assert.equal(completed.firstAction, null, 'landing completion is not another instruction');
    assert.deepEqual(completed.used, ['arrival', 'follow']);
    assert.equal(await page.locator('#friend-guide').isVisible(), false);
    assert.equal(await page.locator('.action-row .primary-button').count(), 1);
    await shot('complete');
    if (helpAt === 'follow') {
      await page.keyboard.press('h');
      assert.equal((await read()).cue, null, 'H during the first follow cancels the second opportunity');
      assert.equal(await page.locator('#friend-guide').isVisible(), true);
      await shot('follow-help');
    } else {
      await page.waitForFunction(() => window.__courtyardBeat().cue?.beat === 'mechanism' && window.__courtyardBeat().cue.age >= .3);
      secondInvitation = await read();
      assert.equal(secondInvitation.cue.node, completed.node, 'invite the actual first source/gate underfoot');
      assert.equal(secondInvitation.renderedNode, secondInvitation.cue.node);
      assert.ok(secondInvitation.strokes > 0, 'the second invitation is painted, not only scheduled');
      const firstEnd = secondInvitation.ends.find(e => e.key === 'follow:' + completed.node);
      const secondStart = secondInvitation.beats.find(b => b.beat === 'mechanism');
      assert.ok(secondStart.time - firstEnd.time >= .44, 'first follow fully ends, then a quiet gap');
      assert.deepEqual(secondInvitation.used, ['arrival', 'follow', 'mechanism']);
      assert.equal(await page.locator('.action-row .primary-button').count(), 1);
      assert.equal(await page.locator('#interact.primary-button.attention-action').count(), 1);
      assert.equal(await page.locator('#friend-guide').isVisible(), false);
      await assertFirstAction(page, 'interact', secondInvitation.cue.node);
      await page.screenshot({ path: `${out}/courtyard-second-beat-invitation-${width}.png`, fullPage: true });
      await page.locator('#pause').click();
      const secondFrozen = (await read()).cue;
      await page.waitForTimeout(250); assert.deepEqual((await read()).cue, secondFrozen);
      await page.locator('#resume').click();
      if (helpAt === 'mechanism') {
        await page.keyboard.press('h');
        assert.equal((await read()).cue, null, 'H immediately takes the second invitation channel');
        assert.equal(await page.locator('#friend-guide').isVisible(), true);
        assert.equal((await read()).firstAction, null, 'help owns the instruction after H');
        await page.screenshot({ path: `${out}/courtyard-second-beat-help-${width}.png`, fullPage: true });
      } else {
        await page.waitForFunction(t => window.__courtyardBeat().time >= t + 6.2, secondInvitation.time);
        assert.equal((await read()).cue, null, 'expired second invitation stays quiet');
        assert.equal(await page.locator('#friend-guide').isVisible(), false, 'no automatic idle help');
        assert.deepEqual((await read()).used, ['arrival', 'follow', 'mechanism']);
        await assertFirstAction(page, 'interact', secondInvitation.cue.node);
        await page.screenshot({ path: `${out}/courtyard-second-beat-idle-${width}.png`, fullPage: true });
      }
    }
  }
  await page.locator('#interact').click();
  await page.waitForFunction(() => document.querySelector('#mechanism-count').textContent === '1 / 3');
  const activatedAt = (await read()).time;
  if (secondInvitation && helpAt !== 'mechanism') {
    await page.waitForFunction(() => window.__courtyardBeat().cue?.beat === 'mechanism-follow' && window.__courtyardBeat().cue.age >= .2);
    secondCompleted = await read();
    assert.equal(secondCompleted.renderedNode, secondInvitation.cue.node);
    assert.ok(secondCompleted.strokes > 0);
    assert.ok(secondCompleted.activated.includes(secondInvitation.cue.node));
    assert.equal(secondCompleted.firstAction, null, 'successful activation settles the instruction');
    assert.equal(secondCompleted.events.filter(e => e.type === 'activate' && e.node === secondInvitation.cue.node && e.via === 'touch').length, 1);
    assert.deepEqual(secondCompleted.used, ['arrival', 'follow', 'mechanism', 'mechanism-follow']);
    assert.equal(await page.locator('#friend-guide').isVisible(), false);
    await page.screenshot({ path: `${out}/courtyard-second-beat-complete-${width}.png`, fullPage: true });
    await page.locator('#pause').click();
    const completionFrozen = (await read()).cue;
    await page.waitForTimeout(250); assert.deepEqual((await read()).cue, completionFrozen);
    await page.locator('#resume').click();
    if (helpAt === 'mechanism-follow') {
      // The .5s delivery may change the next-step photograph. Request H once it
      // has settled, while the .85s follow is still visible, so the test does not
      // race legitimate guide invalidation against its visibility assertion.
      await page.waitForFunction(() => window.__courtyardBeat().cue?.beat === 'mechanism-follow' && window.__courtyardBeat().cue.age >= .55);
      await page.keyboard.press('h');
      assert.equal((await read()).cue, null);
      assert.equal(await page.locator('#friend-guide').isVisible(), true);
    }
  }
  await page.waitForFunction(t => window.__courtyardBeat().time >= t + 6.2, activatedAt);
  const settled = await read();
  assert.equal(settled.cue, null);
  assert.equal(settled.firstAction, null);
  assert.match(await page.locator('#move').innerText(), /^稳行/);
  const expected = helpAt === 'arrival' ? ['arrival'] : helpAt === 'follow' ? ['arrival', 'follow']
    : helpAt === 'mechanism' ? ['arrival', 'follow', 'mechanism'] : ['arrival', 'follow', 'mechanism', 'mechanism-follow'];
  assert.deepEqual(settled.beats.map(b => b.beat), expected);
  if (secondInvitation) for (const receiver of secondInvitation.nodes.filter(n => n.required?.includes(secondInvitation.cue.node))) {
    const actual = settled.nodes.find(n => n.id === receiver.id);
    assert.ok(actual.received.includes(secondInvitation.cue.node), 'real supply reaches the model receiver');
    assert.equal(actual.powered, actual.required.every(id => actual.received.includes(id)), 'partial supply is never reported complete');
    assert.equal(settled.events.filter(e => e.type === 'power' && e.from === secondInvitation.cue.node && e.to === receiver.id).length, 1);
  }
  assert.equal(await page.locator('#friend-guide').isVisible(), false);
  assert.deepEqual(settled.conflicts, []);
  assertQuietPower(settled.powerFrames);
  assert.deepEqual(settled.powerConflicts, []);
  await shot('settled');
  if (secondInvitation) await page.screenshot({ path: `${out}/courtyard-second-beat-settled-${width}.png`, fullPage: true });
  let powerChain = null;
  let interludeChoices = null;
  if (fullPowerChain) {
    for (let i = 0; i < 2; i++) {
      const state = await page.evaluate(() => window.__courtyardSupplyState());
      const target = state.nodes.find(n => n.kind === 'mechanism' && n.powered && !state.activated.includes(n.id) && pathTo(state, n.id));
      assert.ok(target, 'a real supplied mechanism remains reachable');
      await reachThroughUI(page, target.id); await page.locator('#interact').click();
      const time = (await read()).time;
      await page.waitForFunction(t => window.__courtyardBeat().time >= t + .7, time);
    }
    const time = (await read()).time;
    await page.waitForFunction(t => window.__courtyardBeat().time >= t + 6.2, time);
    powerChain = await read();
    assert.equal(powerChain.activated.length, 3);
    assert.ok(powerChain.powerFrames.some(f => f.events.some(e => e.complete)));
    assertQuietPower(powerChain.powerFrames);
    assert.deepEqual(powerChain.powerConflicts, []);
    assert.deepEqual(powerChain.used, expected, 'the full chain adds no third beat');
    assert.equal(powerChain.cue, null);
    assert.equal(await page.locator('#friend-guide').isVisible(), false);
    assert.equal(await page.locator('#action-feedback').isVisible(), false);
    await shot('full-power-chain-quiet');
    // Landing at the exit already banks the run and opens the next-room picker.
    await reachThroughUI(page, 'exit');
    await page.locator('#choice-dialog[open]').waitFor();
    assert.equal(await page.locator('#choice-dialog.discovery-choice').count(), 0, 'next-room choice remains ordinary');
    assert.equal(await page.locator('.starter-alternatives').count(), 0);
    const next = await page.evaluate(() => window.__courtyardSupplyState());
    assert.equal(next.phase, 'interlude');
    assert.equal(await page.locator('#relic-choices button:visible').count(), next.choices.length);
    interludeChoices = next.choices.map(relic => relic.id);
    await page.locator('#relic-choices button').first().click();
  }
  // Exercise restart on the original discovery page, where the entry flag was
  // true at load, rather than only after a reload has cleared that condition.
  await page.locator('#restart').click(); await page.locator('#confirm-restart').click();
  await page.locator('#choice-dialog[open]').waitFor();
  assert.equal(await page.locator('#choice-dialog.discovery-choice').count(), 0, 'restart cannot re-arm the first-entry picker');
  assert.equal(await page.locator('.starter-alternatives').count(), 0);
  assert.equal(await page.locator('#relic-choices button:visible').count(), 5);
  await page.reload();
  await page.locator('#choice-dialog[open]').waitFor();
  assert.equal(await page.locator('#choice-dialog.discovery-choice').count(), 0, 'revisits do not repeat the first-entry picker');
  assert.equal(await page.locator('#relic-choices button:visible').count(), 5);
  assert.equal(await page.locator('#relic-choices .primary-button').count(), 0);
  await page.getByRole('button', { name: '选择缓落壳', exact: true }).click();
  await page.locator('#align').click();
  await page.waitForFunction(() => window.__courtyardBeat().time >= 3.5);
  const revisit = await read();
  assert.equal(revisit.firstEntry, false); assert.equal(revisit.cue, null);
  assert.equal(revisit.firstAction, null);
  assert.deepEqual(revisit.beats, []); assert.deepEqual(revisit.used, []);
  assert.deepEqual(revisit.conflicts, []);
  return { entryChoice, interludeChoices, invitation, completed, secondInvitation, secondCompleted, settled, powerChain, revisit, interrupt: helpAt, idleSeconds: helpAt === 'arrival' ? null : 6.5, secondIdleSeconds: secondCompleted ? 6.2 : null, passed: true };
}
