import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

// Shared first-session courtyard harness for the browser checks.
// The observers appended to the page only copy snapshots and record what was painted;
// they never change the model, timing, collection or the persisted first-entry budget.
// Every courtyard action goes through real input: canvas / checklist clicks, the real
// wheel over the canvas, keyboard and buttons. The "player" follows only what the game
// itself shows (visual stepper + canvas pill), and asserts that what it shows is right.

export const discoveryObserver = '\nwindow.__discovery = () => structuredClone({ state: model.snapshot(), view: scene.view });';

export const courtyardFlowObserver = `
window.__flowPills = []; window.__flowMaxFullPills = 0; window.__flowFeedback = []; window.__flowPower = [];
let flowPillFrame = null;
const flowGuide = scene.drawVisualActionGuide.bind(scene), flowText = scene.ctx.fillText.bind(scene.ctx);
scene.drawVisualActionGuide = () => {
  flowPillFrame = [];
  try { flowGuide(); } finally {
    window.__flowPills = flowPillFrame; flowPillFrame = null;
    // Full callout pills carry sentences; compact badges are a glyph plus a number.
    window.__flowMaxFullPills = Math.max(window.__flowMaxFullPills, window.__flowPills.filter(t => [...t].length > 6).length);
  }
};
scene.ctx.fillText = (text, ...rest) => { if (flowPillFrame) flowPillFrame.push(String(text)); return flowText(text, ...rest); };
const flowEvents = scene.pushEvents.bind(scene);
scene.pushEvents = events => {
  window.__flowPower.push(...events.filter(e => e.type === 'power').map(e => ({ ...e, time: model.time })));
  flowEvents(events);
};
const flowRender = scene.render.bind(scene);
window.__flowTravelPills = [];
scene.render = dt => {
  flowRender(dt);
  // Judge pills against the very state this frame painted, not a later snapshot.
  if (scene.state?.travel) window.__flowTravelPills.push(...window.__flowPills.filter(t => [...t].length > 6));
  const el = $('action-feedback'), text = el.hidden ? '' : el.textContent, last = window.__flowFeedback.at(-1);
  if (!last || last.text !== text) window.__flowFeedback.push({ text, time: model.time, travel: !!model.snapshot().travel, node: model.node });
};
window.__flow = () => structuredClone({
  state: model.snapshot(), time: model.time,
  momentum: { cue: scene.state?.courtyardMomentum ? { beat: scene.state.courtyardMomentum.beat, node: scene.state.courtyardMomentum.node } : null, used: [...momentum.used], firstEntry: momentum.firstEntry },
  prompt: scene.pendingLayerPrompt ? { targetId: scene.pendingLayerPrompt.targetId, layer: scene.pendingLayerPrompt.targetLayer, at: scene.pendingLayerPrompt.atNode, kind: scene.pendingLayerPrompt.kind } : null,
  autoPilot: autoPilot ? autoPilot.targetNode : null,
  stage: scene.onboardingStage, pills: window.__flowPills, maxFullPills: window.__flowMaxFullPills, travelPills: window.__flowTravelPills,
  feedback: window.__flowFeedback, power: window.__flowPower,
  friends: scene.friends.map(({ id, name }) => ({ id, name })),
  view: { scale: scene.scale, offsetX: scene.offsetX, offsetY: scene.offsetY },
});`;

export const readFlow = page => page.evaluate(() => window.__flow());
const LAYER_NAMES = ['潮汐层', '回声层', '绽放层'];

// One browser, a fresh isolated context per case, and a receipt in ARTIFACT_DIR.
export async function runCourtyardChecks({ name, cases, run }) {
  const base = process.env.BASE_URL || 'http://127.0.0.1:4173';
  const out = process.env.ARTIFACT_DIR;
  assert.ok(out, 'use a fresh explicit artifact directory');
  await mkdir(out, { recursive: true });
  const widths = process.env.VERIFY_WIDTHS ? process.env.VERIFY_WIDTHS.split(',').map(Number) : [1280, 390, 320];
  assert.ok(widths.length && widths.every(width => [1280, 390, 320].includes(width)), 'supported viewport widths');
  const receipt = { name, widths, base, status: 'started', checks: [], errors: [] };
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  receipt.browserVersion = browser.version();
  try {
    for (const width of widths) for (const testCase of cases) {
      const context = await browser.newContext({ viewport: { width, height: width === 1280 ? 900 : 844 }, reducedMotion: width === 320 ? 'reduce' : 'no-preference' });
      await context.route('**/src/flatland/main.js', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: await response.text() + discoveryObserver });
      });
      await context.route('**/src/main.js', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: await response.text() + courtyardFlowObserver });
      });
      const page = await context.newPage();
      page.on('pageerror', e => receipt.errors.push({ width, case: testCase.label, message: e.message }));
      page.on('console', m => { if (['error', 'warning'].includes(m.type())) receipt.errors.push({ width, case: testCase.label, message: m.text() }); });
      const shot = label => page.screenshot({ path: `${out}/${width}-${testCase.label}-${label}.png`, fullPage: true });
      const result = await run({ page, base, width, out, shot, ...testCase });
      receipt.checks.push({ width, ...testCase, ...result, passed: true });
      await writeFile(`${out}/progress.json`, JSON.stringify({ completed: receipt.checks.length, last: { width, case: testCase.label } }, null, 2));
      await context.close();
    }
    assert.deepEqual(receipt.errors, [], 'no page errors or console warnings');
    receipt.status = 'passed';
  } catch (error) {
    receipt.status = 'failed'; receipt.failure = error.stack; receipt.actual = error.actual; receipt.expected = error.expected;
    process.exitCode = 1;
  } finally {
    await browser.close();
    await writeFile(`${out}/receipt.json`, JSON.stringify(receipt, null, 2));
    console.log(JSON.stringify({ name, status: receipt.status, checks: receipt.checks.length, failure: receipt.failure, out }));
  }
}

// The real Flatland chase that earns the first companion (sprout), driven by pointer and slider.
export async function earnFirstDiscovery(page, base, query = 'play=explore&seed=42') {
  await page.goto(`${base}/flatland.html?${query}`);
  await page.waitForFunction(() => window.__discovery?.().view);
  const slice = async height => {
    await page.locator('#s-slider').evaluate((el, value) => { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, height);
    await page.waitForFunction(value => Math.abs(window.__discovery().state.s - value) < .02, height);
  };
  for (const [step, height] of [[0, 4.7], [1, 2.7], [2, .6]]) {
    if (!step) await slice(height);
    await page.locator('#scene').scrollIntoViewIfNeeded();
    const { state, view } = await page.evaluate(() => window.__discovery()), box = await page.locator('#scene').boundingBox();
    const { x, y } = state.encounter;
    await page.mouse.move(box.x + view.main.ox + x * view.main.scale, box.y + view.main.oy + y * view.main.scale);
    await page.mouse.down();
    try { await page.waitForFunction(({ x, y }) => { const p = window.__discovery().state.player; return Math.hypot(p.x - x, p.y - y) < .22; }, { x, y }, { timeout: 8000 }); }
    finally { await page.mouse.up(); }
    if (step) await slice(height);
    await page.waitForFunction(step => { const e = window.__discovery().state.encounter; return e.kind === 'home' || e.step > step; }, step);
  }
  assert.deepEqual(await page.evaluate(() => window.__discovery().state.collection.found), ['sprout']);
}

// Follow the real earned "去庭院" link; the supported seed query only fixes the room.
export async function enterCourtyard(page, seed) {
  const entry = new URL(await page.getByRole('link', { name: '去庭院 ↗', exact: true }).first().getAttribute('href'), page.url());
  entry.searchParams.set('seed', seed);
  await page.goto(entry.href);
  await page.waitForFunction(() => window.__flow?.());
}

export async function fitsViewport(page, locator, label) {
  // Allow a smooth scroll (panel shortcuts bring the scene into view) to finish.
  const viewport = page.viewportSize();
  const inside = b => b && b.x >= -1 && b.x + b.width <= viewport.width + 1 && b.y >= -1 && b.y + b.height <= viewport.height + 1;
  let box = await locator.boundingBox();
  for (let i = 0; i < 10 && !inside(box); i++) { await page.waitForTimeout(150); box = await locator.boundingBox(); }
  assert.ok(box, `${label} is rendered`);
  assert.ok(inside(box), `${label} fits the viewport: ${JSON.stringify(box)}`);
  assert.ok(await locator.evaluate(el => el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1), `${label} does not clip its text`);
}

// The discovery arrival keeps its designed starter picker: one primary "带缓落壳出发",
// four alternatives folded away, keyboard disclosure, and no autostart while browsing.
export async function chooseDiscoveryStarter(page, out, width, { starterRelic = 'shell' } = {}) {
  assert.equal(new URL(page.url()).searchParams.get('from'), 'discovery');
  await page.locator('#choice-dialog[open]').waitFor();
  const before = (await readFlow(page)).state;
  const friends = (await readFlow(page)).friends;
  assert.ok(friends.length > 0, 'entry uses an actually earned companion');
  assert.equal(before.phase, 'choose', 'the discovery arrival is not auto-equipped');
  assert.equal(await page.locator('#choice-title').innerText(), `${friends.length === 1 ? friends[0].name : '伙伴们'}也来了。`);
  const primary = page.getByRole('button', { name: '带缓落壳出发', exact: true });
  assert.equal(await page.locator('#relic-choices .primary-button').count(), 1);
  assert.equal(await page.locator('#relic-choices button:visible').count(), 1);
  assert.equal(await page.locator('#relic-choices button').count(), 5, 'all five relics remain available');
  assert.ok(await primary.evaluate(el => document.activeElement === el), 'entry focuses the explicit departure action');
  await fitsViewport(page, primary, 'starter departure button');
  const fits = () => page.locator('#choice-dialog').evaluate(el => el.scrollHeight <= el.clientHeight + 2 && el.scrollWidth <= el.clientWidth);
  assert.ok(await fits(), 'collapsed choice fits without scrolling');
  await page.screenshot({ path: `${out}/${width}-entry-choice.png`, fullPage: true });
  await page.keyboard.press('Tab');
  assert.ok(await page.locator('.starter-alternatives summary').evaluate(el => document.activeElement === el));
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#relic-choices button:visible').count(), 5);
  assert.ok(await fits(), 'expanded alternatives fit without scrolling');
  await page.waitForTimeout(250);
  assert.deepEqual((await readFlow(page)).state, before, 'browsing choices does not start, advance or equip the run');
  if (starterRelic === 'shell') {
    await page.keyboard.press('Enter');
    await page.keyboard.press('Shift+Tab');
    assert.ok(await primary.evaluate(el => document.activeElement === el));
    await page.keyboard.press('Enter');
  } else {
    await page.getByRole('button', { name: `选择${{ shadow: '留影扣', prism: '回流棱镜', coil: '接力线圈', weave: '织桥种' }[starterRelic]}`, exact: true }).click();
  }
  const chosen = (await readFlow(page)).state;
  assert.equal(chosen.phase, 'playing');
  assert.deepEqual(Object.entries(chosen.relics).filter(([, rank]) => rank > 0), [[starterRelic, 1]], 'only the explicitly chosen relic is equipped');
  assert.equal(await page.locator('#friend-guide').isVisible(), false, 'entry is not occupied by automatic help');
  return { friends, starterRelic };
}

// Screen point of a platform, from the renderer's own world -> canvas transform.
export async function nodePoint(page, id) {
  const { state, view } = await readFlow(page);
  const node = state.nodes.find(n => n.id === id);
  assert.ok(node, `node ${id} exists`);
  const box = await page.locator('#scene').boundingBox();
  return { x: box.x + view.offsetX + node.x * view.scale, y: box.y + view.offsetY + node.y * view.scale, present: node.present };
}

// What a player does to "go to" something: click it on the canvas when it is drawn
// in this slice, otherwise use its numbered checklist row (or the exit card).
export async function chooseTarget(page, id) {
  const { state } = await readFlow(page);
  const node = state.nodes.find(n => n.id === id);
  if (node?.present && (node.anchor || node.layer === state.layer)) {
    await page.locator('#scene').scrollIntoViewIfNeeded();
    const p = await nodePoint(page, id);
    await page.mouse.click(p.x, p.y);
    return 'canvas';
  }
  if (id === 'exit') { await page.locator('#exit-step-card').click(); return 'exit-card'; }
  await page.locator(`[data-mechanism="${id}"]`).click();
  return 'checklist';
}

// Settled = no crossing, no wave and no pending autopilot for three polls (> resume delay).
export async function waitSettled(page, { timeout = 15000 } = {}) {
  const started = Date.now();
  let calm = 0;
  while (calm < 3) {
    assert.ok(Date.now() - started < timeout, 'the courtyard settles');
    await page.waitForTimeout(300);
    const f = await readFlow(page);
    calm = !f.state.travel && !f.state.wave && !f.autoPilot ? calm + 1 : 0;
  }
  return readFlow(page);
}

// One real wheel notch over an empty part of the canvas.
export async function wheelNotch(page, direction) {
  await page.locator('#scene').scrollIntoViewIfNeeded();
  const box = await page.locator('#scene').boundingBox();
  await page.mouse.move(box.x + box.width * .97, box.y + box.height * .93);
  await page.mouse.wheel(0, direction === 'up' ? -120 : 120);
  await page.waitForTimeout(450);
}

// Read the persistent instruction the game shows while it waits for a layer change and
// check it against the prompt it is actually waiting on. From stage 3 the game may hide
// the layer on purpose (deduce it from the dashed bridge); then nothing may leak it, and
// the stepper card is the designed way to reveal it.
export async function readLayerInstruction(page, { allowDeduction = false } = {}) {
  const f = await readFlow(page);
  assert.ok(f.prompt && f.prompt.layer !== f.state.layer, 'the game is waiting for a layer change');
  const title = await page.locator('#vstep-shift-title').innerText();
  const sub = await page.locator('#vstep-shift-sub').innerText();
  assert.equal(await page.locator('#visual-stepper').isVisible(), true, 'the visual stepper is visible');
  if (allowDeduction && /调谐/.test(title)) {
    assert.ok(f.stage >= 3, 'layer hints are only withheld after the shift has been learned');
    assert.ok(!LAYER_NAMES.some(name => title.includes(name) || sub.includes(name)), `deduction mode does not name the layer: ${title} / ${sub}`);
    assert.match(sub, /揭晓/, 'the stepper offers to reveal the layer');
    const pill = f.pills.find(t => /虚线桥/.test(t));
    assert.ok(pill, `the canvas points at the dashed bridge: ${JSON.stringify(f.pills)}`);
    assert.ok(!LAYER_NAMES.some(name => pill.includes(name)) && !/上滚|下滚/.test(pill), `the canvas pill does not leak the answer: ${pill}`);
    return { deduction: true, title, sub, pill, prompt: f.prompt, layer: f.state.layer, node: f.state.node };
  }
  const direction = /上滚/.test(sub) ? 'up' : /下滚/.test(sub) ? 'down' : null;
  const expected = f.prompt.layer > f.state.layer ? 'up' : 'down';
  assert.ok(title.includes(LAYER_NAMES[f.prompt.layer]), `stepper names the target layer: ${title}`);
  assert.equal(direction, expected, `stepper wheel direction matches the target layer: ${sub}`);
  const pill = f.pills.find(t => /【(上滚|下滚)/.test(t));
  assert.ok(pill, `the canvas pill repeats the instruction where the player stands: ${JSON.stringify(f.pills)}`);
  assert.ok(pill.includes(expected === 'up' ? '上滚' : '下滚'), `canvas pill direction matches: ${pill}`);
  return { title, sub, pill, direction, prompt: f.prompt, layer: f.state.layer, node: f.state.node };
}

// The player: choose the target (unless continuing a pending instruction), then only follow
// the game's layer instruction with the real wheel. Walking and activation must happen
// without any other input.
export async function followGuidance(page, targetId, { beforeShift = null, maxRounds = 10, click = true } = {}) {
  const trace = [];
  const done = f => targetId === 'exit' ? f.state.phase !== 'playing'
    : f.state.nodes.find(n => n.id === targetId)?.kind === 'mechanism' ? f.state.activated.includes(targetId)
      : f.state.node === targetId;
  if (click) trace.push({ click: await chooseTarget(page, targetId) });
  for (let round = 0; round < maxRounds; round++) {
    const f = await waitSettled(page);
    if (done(f)) return trace;
    if (f.prompt && f.prompt.layer !== f.state.layer) {
      let instruction = await readLayerInstruction(page, { allowDeduction: true });
      if (instruction.deduction) {
        // A stuck player asks the stepper; it reveals the layer without changing it.
        trace.push({ deduction: { title: instruction.title, pill: instruction.pill } });
        const layerBefore = f.state.layer;
        await page.locator('#vstep-shift').click();
        await page.waitForTimeout(250); // let the canvas repaint with the revealed hint
        assert.equal((await readFlow(page)).state.layer, layerBefore, 'revealing the hint does not shift for the player');
        assert.match(await page.locator('#action-feedback').innerText(), new RegExp(`层提示已揭晓.*${LAYER_NAMES[instruction.prompt.layer]}`));
        instruction = await readLayerInstruction(page);
      }
      if (beforeShift && !trace.some(t => t.instruction)) await beforeShift(instruction);
      trace.push({ instruction: { at: instruction.node, from: instruction.layer, to: instruction.prompt.layer, kind: instruction.prompt.kind, sub: instruction.sub } });
      while ((await readFlow(page)).state.layer !== instruction.prompt.layer) {
        const before = (await readFlow(page)).state.layer;
        await wheelNotch(page, instruction.direction);
        assert.notEqual((await readFlow(page)).state.layer, before, 'each instructed wheel notch changes the layer');
      }
      continue;
    }
    // The walk ended without a pending instruction (e.g. a resumed walk reached a waypoint): ask again.
    trace.push({ click: await chooseTarget(page, targetId) });
  }
  assert.fail(`could not reach ${targetId} by following the game's guidance: ${JSON.stringify(trace)}`);
}

// Restart and revisit never re-arm the one-time discovery picker.
export async function verifyRestartAndRevisit(page) {
  await page.locator('#restart').click(); await page.locator('#confirm-restart').click();
  await page.locator('#choice-dialog[open]').waitFor();
  assert.equal(await page.locator('#choice-dialog.discovery-choice').count(), 0, 'restart cannot re-arm the first-entry picker');
  assert.equal(await page.locator('#relic-choices button:visible').count(), 5);
  await page.reload();
  await page.locator('#choice-dialog[open]').waitFor();
  assert.equal(await page.locator('#choice-dialog.discovery-choice').count(), 0, 'revisits do not repeat the first-entry picker');
  assert.equal(await page.locator('#relic-choices .primary-button').count(), 0);
  await page.getByRole('button', { name: '选择缓落壳', exact: true }).click();
  await page.waitForFunction(() => window.__flow().time >= 3.5);
  const revisit = await readFlow(page);
  assert.equal(revisit.momentum.firstEntry, false);
  assert.deepEqual(revisit.momentum.used, [], 'a revisit plays no first-entry beats');
  return { restartOrdinary: true, revisitOrdinary: true };
}

// The four authored first rooms reachable from the discovery entry, with the shape of
// their second step: a same-position layer change, a return to the hub, or the relay.
export const FIRST_ROOMS = [
  { label: 'cascade', seed: 10, room: 'cascade', handoff: 'same_xyz', anchor: null },
  { label: 'split', seed: 0, room: 'split', handoff: 'same_xyz', anchor: null },
  { label: 'confluence', seed: 2, room: 'confluence', handoff: 'anchor', anchor: 'hub' },
  { label: 'return', seed: 7, room: 'return', handoff: 'anchor', anchor: 'relay' },
];
