// Optional local Playwright check. Isolated profiles, no storage preload or model writes.
// Instrumentation only copies snapshots/events and observes actual oscillator starts.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const baseURL = process.env.BASE_URL || 'http://127.0.0.1:4173';
const out = process.env.ARTIFACT_DIR || fileURLToPath(new URL(`../artifacts/play-fun-top5-20261027/browser-${Date.now()}/`, import.meta.url));
await mkdir(out, { recursive: true });
const receipt = { status: 'started', baseURL, checks: [], errors: [], instrumentation: 'read-only snapshot/event observer; Web Audio start observer; real range/pointer/key inputs' };
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
receipt.browserVersion = browser.version();
try {
  for (const width of [1280, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: width > 700 ? 900 : 844 }, reducedMotion: width === 320 ? 'reduce' : 'no-preference' });
    await context.addInitScript(() => {
      window.__top5Labels = [];
      const fillText = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (text, x, y, ...rest) {
        if (/^(收下花种|跳跳跟上来了|S .*s$)/.test(text)) {
          const t = this.getTransform(), m = this.measureText(text), dpr = devicePixelRatio || 1;
          const baseline = (t.b * x + t.d * y + t.f) / dpr;
          window.__top5Labels.push({ text, baseline, top: baseline - t.d * m.actualBoundingBoxAscent / dpr,
            bottom: baseline + t.d * m.actualBoundingBoxDescent / dpr });
        }
        return fillText.call(this, text, x, y, ...rest);
      };
      window.__top5Notes = [];
      const proto = (window.AudioContext || window.webkitAudioContext).prototype;
      const create = proto.createOscillator;
      proto.createOscillator = function (...args) {
        const osc = create.apply(this, args), start = osc.start, setFrequency = osc.frequency.setValueAtTime;
        let frequency = osc.frequency.value;
        osc.frequency.setValueAtTime = function (...values) { frequency = values[0]; return setFrequency.apply(this, values); };
        osc.start = function (...times) { window.__top5Notes.push({ frequency, at: times[0] }); return start.apply(this, times); };
        return osc;
      };
    });
    await context.route('**/src/flatland/main.js', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: await response.text() + `
window.__top5Events = [];
window.__top5Near = [];
window.__top5CueConflicts = [];
const top5Push = scene.pushEvents.bind(scene);
scene.pushEvents = events => {
  window.__top5Events.push(...structuredClone(events));
  for (const event of events.filter(e => e.type === 'discovery_near')) {
    window.__top5Near.push({ key: event.key, time: model.time, duringArrival: visitorCues.arrivalActive(model.snapshot()) });
  }
  top5Push(events);
};
const top5Render = scene.render.bind(scene);
scene.render = dt => {
  window.__top5Labels = [];
  top5Render(dt);
  const arrival = document.querySelector('#visitor-goal').textContent.includes('墙那边有动静');
  const announcedNear = window.__top5Events.some(e => e.type === 'discovery_near' && e.text === document.querySelector('#announcement').textContent);
  if (arrival && (scene.popups.some(p => p.near) || announcedNear)) window.__top5CueConflicts.push({ time: model.time });
};
window.__top5Read = () => structuredClone({ state: model.snapshot(), popups: scene.popups, view: scene.view, reduced: scene.reducedMotion, audioState: audio.context?.state, labels: window.__top5Labels });
` });
    });
    await context.route('**/src/main.js', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: await response.text() + `
window.__top5Courtyard = () => ({ time: model.time, settled: guide.settled, friends: scene.friends.length });
` });
    });
    const page = await context.newPage();
    page.on('pageerror', error => receipt.errors.push({ width, message: error.message }));
    page.on('console', message => { if (['error', 'warning'].includes(message.type())) receipt.errors.push({ width, message: message.text() }); });
    const read = () => page.evaluate(() => window.__top5Read());
    const ready = () => page.waitForFunction(() => window.__top5Read?.().view);
    const screenshot = name => page.screenshot({ path: `${out}/${width}-${name}.png`, fullPage: true });
    const slice = async value => {
      // DOM range input uses the same input/change handlers as dragging the slider.
      await page.locator('#s-slider').evaluate((el, value) => { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, value);
      await page.waitForFunction(value => Math.abs(window.__top5Read().state.s - value) < .02, value);
    };
    const go = async (x, y) => {
      await page.locator('#scene').scrollIntoViewIfNeeded();
      const { view } = await read(), box = await page.locator('#scene').boundingBox();
      await page.mouse.move(box.x + view.main.ox + x * view.main.scale, box.y + view.main.oy + y * view.main.scale);
      await page.mouse.down();
      try { await page.waitForFunction(({ x, y }) => { const p = window.__top5Read().state.player; return Math.hypot(p.x - x, p.y - y) < .22; }, { x, y }, { timeout: 8000 }); }
      finally { await page.mouse.up(); }
    };
    await page.goto(`${baseURL}/flatland.html?play=explore&seed=42`); await ready();
    assert.equal(await page.locator('#title').innerText(), '越墙');
    assert.match(await page.locator('#levels [aria-current=true]').innerText(), /越墙/);
    assert.equal(await page.locator('#garden-count').innerText(), '0/6');
    assert.equal(await page.locator('#garden-petals').innerText(), '0/3');
    await screenshot('arrival');
    await page.waitForFunction(() => window.__top5Read().state.time >= 4.2);
    assert.equal((await page.evaluate(() => window.__top5Events)).some(e => e.type === 'discovery_near'), false,
      'standing on the starting slice stays quiet even after narration ends');
    await screenshot('idle-after-arrival');
    // Replay through real controls, deliberately revealing a nearby friend during narration.
    await page.keyboard.press('r'); await slice(4.7);
    await page.waitForFunction(() => window.__top5Read().state.time >= 1);
    assert.equal((await read()).state.encounter.visible, true);
    assert.match(await page.locator('#visitor-goal').innerText(), /墙那边有动静/);
    assert.equal((await page.evaluate(() => window.__top5Events)).some(e => e.type === 'discovery_near'), false);
    assert.equal(await page.locator('#announcement').innerText(), '');
    await screenshot('arrival-visible-friend');
    await page.locator('#pause').click();
    const arrivalPausedAt = (await read()).state.time;
    await page.waitForTimeout(250);
    assert.equal((await read()).state.time, arrivalPausedAt);
    assert.match(await page.locator('#visitor-goal').innerText(), /墙那边有动静/);
    await page.locator('#resume').click();
    await page.waitForFunction(() => window.__top5Read().popups.some(p => p.near));
    const approach = await read(), approachPopup = approach.popups.find(p => p.near);
    const nearEvents = await page.evaluate(() => window.__top5Near);
    assert.equal(nearEvents.length, 1);
    assert.equal(nearEvents[0].duringArrival, false); assert.ok(nearEvents[0].time >= 4);
    assert.equal(await page.locator('#visitor-goal').isVisible(), false);
    const narrowCanvas = approach.view.width <= 480;
    assert.equal(approachPopup.duration, narrowCanvas ? 1.3 : 2.2);
    await screenshot('approach');
    await page.locator('#pause').click();
    const pausedCue = (await read()).popups;
    assert.ok(pausedCue.some(p => p.near));
    await page.waitForTimeout(250);
    assert.deepEqual((await read()).popups, pausedCue, 'approach cue also freezes while paused');
    await page.locator('#resume').click();
    await page.waitForFunction(() => !window.__top5Read().popups.some(p => p.near));
    const approachClearedAt = (await read()).state.time;
    assert.ok(approachClearedAt - nearEvents[0].time <= approachPopup.duration + .25);
    assert.equal((await read()).state.encounter.step, 0, 'cue expires while the encounter is still present');
    await screenshot('approach-cleared');
    await page.locator('#scene').click({ position: { x: 15, y: 15 } }); // user gesture unlocks audio, outside the world
    if (width === 320) await page.locator('#sound').click();
    const notesBefore = await page.evaluate(() => window.__top5Notes.length);
    for (const [step, height] of [[0, 4.7], [1, 2.7], [2, .6]]) {
      if (step === 0) await slice(height);
      const e = (await read()).state.encounter;
      await go(e.x, e.y);
      if (step) await slice(height);
      await page.waitForFunction(step => { const e = window.__top5Read().state.encounter; return e.kind === 'home' || e.step > step; }, step);
    }
    await page.waitForFunction(() => window.__top5Read().popups.some(p => p.text === '跳跳跟上来了'));
    const found = await read(); assert.deepEqual(found.state.collection.found, ['sprout']);
    const discoveryDuration = found.popups.find(p => p.discovery).duration;
    assert.equal(discoveryDuration, narrowCanvas ? 1.35 : 1.8);
    assert.equal((await page.evaluate(() => window.__top5Events)).filter(e => e.type === 'friend_found' && e.fresh).length, 1, 'one delivery of the first discovery');
    assert.equal(found.state.phase, 'playing'); assert.equal(found.state.paused, false);
    assert.equal(await page.locator('dialog[open]').count(), 0);
    if (width === 320) assert.equal(await page.evaluate(() => window.__top5Notes.length), notesBefore, 'muted discovery produces no oscillator');
    else assert.ok(await page.evaluate(() => window.__top5Notes.some(n => n.frequency === 1047)), 'discovery melody scheduled after user gesture');
    await screenshot('friend-found');
    await page.keyboard.press('p');
    const frozen = await read();
    await page.waitForTimeout(250);
    assert.deepEqual((await read()).popups, frozen.popups);
    await page.locator('#resume').click();
    await page.waitForFunction(() => !window.__top5Read().popups.some(p => p.discovery));
    await screenshot('friend-found-cleared');
    assert.equal((await page.evaluate(() => window.__top5Near)).filter(e => e.key === 'escape:friend:sprout').length, 1);
    await page.locator('[data-level="0"]').click();
    const visitorSeed = (await read()).state.seed;
    assert.equal(await page.locator('#title').innerText(), '访客');
    assert.match(await page.locator('#levels [aria-current=true]').innerText(), /访客/);
    // Integration smoke: visitor sequence and discovery consumers share one event drain.
    await slice(3); await page.locator('#poke').click();
    assert.match(await page.locator('#visitor-goal').innerText(), /跳起来了/);
    await page.waitForFunction(() => document.querySelector('#visitor-goal').textContent === '走到光环边找访客');
    await slice(2.1); await go(6.5, 9);
    // Face east with a brief native key input, then use Sprout's upper-layer hop.
    await page.keyboard.down('d'); await page.waitForTimeout(30); await page.keyboard.up('d');
    await page.locator('#pet').click();
    await page.waitForFunction(() => window.__top5Events.some(e => e.type === 'friend_garden' && e.kind === 'probe'));
    await go(10, 9.8);
    await page.waitForFunction(() => window.__top5Read().popups.some(p => p.text === '收下花种 · 1/3'));
    assert.equal(await page.locator('#garden-petals').innerText(), '1/3');
    assert.equal(await page.locator('#garden-count').innerText(), '0/6', 'one seed is not a completed garden');
    assert.equal(await page.locator('#visitor-goal').innerText(), '走到光环边找访客', 'seed discovery does not reset the visitor beat');
    assert.equal((await read()).popups.filter(p => p.discovery).length, 1, 'one discovery label alongside the visitor goal');
    assert.equal((await read()).popups.find(p => p.discovery).duration, discoveryDuration);
    const seedLayout = await page.evaluate(() => window.__top5Read().labels);
    if (narrowCanvas) {
      const seedLabel = seedLayout.find(l => l.text.startsWith('收下花种'));
      const probeLabel = seedLayout.find(l => l.text.startsWith('S '));
      assert.ok(seedLabel && probeLabel, 'observe both live Canvas labels');
      assert.ok(seedLabel.top - probeLabel.bottom >= 4, 'seed text leaves a visible gap below the probe label');
    }
    await screenshot('seed-found');
    const firstSeed = (await page.evaluate(() => window.__top5Events)).find(e => e.type === 'garden_seed');
    assert.equal(firstSeed.fresh, true);
    assert.equal((await page.evaluate(() => window.__top5Events)).filter(e => e.type === 'garden_seed' && e.fresh).length, 1, 'one delivery of the first seed');
    assert.deepEqual(await page.evaluate(() => window.__top5CueConflicts), [], 'arrival never shares a frame with near text or its announcement');
    await page.reload(); await ready();
    assert.deepEqual((await read()).state.collection.found, ['sprout']);
    assert.equal(await page.locator('#garden-petals').innerText(), '1/3');
    assert.equal((await read()).popups.filter(p => p.discovery).length, 0);
    await page.keyboard.press('r');
    assert.equal((await read()).state.seed, visitorSeed);
    assert.equal(await page.locator('#garden-petals').innerText(), '1/3');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const hud = await page.locator('#garden-progress').boundingBox(), canvas = await page.locator('#scene').boundingBox();
    assert.ok(hud.y + hud.height <= canvas.y, 'HUD sits above gameplay');
    await screenshot('saved-progress');
    await page.locator('#style-toggle').click();
    assert.equal(await page.locator('#garden-progress').isVisible(), false, 'challenge keeps its own HUD');
    // Integration smoke: the same newly earned collection enters the courtyard CTA flow.
    await page.goto(`${baseURL}/?seed=2`);
    await page.getByRole('button', { name: '选择缓落壳', exact: true }).click();
    await page.locator('#align').click();
    assert.equal(await page.locator('.action-row .primary-button').count(), 1);
    assert.equal(await page.locator('#move.attention-action').count(), 1);
    assert.match(await page.locator('#move').innerText(), /稳行/);
    await screenshot('discovery-to-courtyard');
    await page.locator('#move').click();
    assert.equal(await page.locator('#interact').isDisabled(), true);
    assert.equal(await page.locator('.action-row .primary-button, .action-row .attention-action').count(), 0);
    await page.waitForFunction(() => document.querySelector('#interact').classList.contains('attention-action'));
    assert.equal(await page.locator('.action-row .primary-button').count(), 1);
    const landed = await page.evaluate(() => window.__top5Courtyard());
    assert.equal(landed.friends, 1, 'test the idle guide with the genuinely earned companion');
    assert.equal(landed.settled, true);
    assert.equal(await page.locator('#friend-guide').isVisible(), false);
    await page.waitForFunction(time => window.__top5Courtyard().time >= time + 6.2, landed.time);
    assert.equal(await page.locator('#friend-guide').isVisible(), false, 'no automatic guide at the old six-second idle trigger');
    await screenshot('courtyard-settled-quiet');
    await page.keyboard.press('h');
    assert.equal(await page.locator('#friend-guide').isVisible(), true);
    await page.waitForFunction(() => document.querySelector('#friend-guide').hidden);
    await screenshot('courtyard-requested-help-cleared');
    await page.locator('#interact').click();
    await page.keyboard.press('e');
    await page.waitForFunction(() => document.querySelector('#action-feedback').textContent.includes('去辉光源'));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    receipt.checks.push({ width, reducedMotion: width === 320, muted: width === 320, friendFound: true, seedFound: true, savedAfterReloadAndRetry: true, levelHighlightSynced: true, noOverflow: true, visitorAndDiscoveryCoexist: true, discoveryDeliveredOnce: true, earnedCollectionToCourtyardCTA: true,
      arrivalAndNearExclusive: true, idleAfterArrivalQuiet: true, nearOnce: nearEvents, approachDuration: approachPopup.duration, approachClearedAfter: approachClearedAt - nearEvents[0].time, discoveryDuration,
      seedLayout, courtyardGuideRetiredAfterLanding: true, companionIdleQuietSeconds: 6.2, explicitHelpStillExpires: true });
    console.log(`passed ${width}px: discovery, seed, pause, saved progress, HUD, visitor beat and courtyard CTA`);
    await context.close();
  }
  assert.deepEqual(receipt.errors, []);
  receipt.status = 'passed';
} catch (error) {
  receipt.status = 'failed'; receipt.failure = error.stack; process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile(`${out}/receipt.json`, JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({ ...receipt, output: out }));
}
