// Optional browser regression: BASE_URL may point at an isolated serve.js port.
// Requires locally installed Playwright; no saved profile or model injection.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { GameModel } from '../src/model.js';
import { courtyardBeatObserver, verifyCourtyardFirstBeat, verifyPowerAtReceiver } from './courtyard-first-beat.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const baseURL = process.env.BASE_URL || 'http://127.0.0.1:4173';
const out = process.env.ARTIFACT_DIR || fileURLToPath(new URL(`../artifacts/play-fun-20261027/browser-${Date.now()}/`, import.meta.url));
await mkdir(out, { recursive: true });
const receipt = { status: 'started', baseURL, checks: [], errors: [] };
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  receipt.browserVersion = browser.version();
  for (const width of [1280, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: width > 700 ? 900 : 844 }, reducedMotion: width === 320 ? 'reduce' : 'no-preference' });
    const page = await context.newPage();
    await context.route('**/src/main.js', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: await response.text() + `
window.__penpalLabels = []; window.__penpalGlints = [];
const penpalRender = scene.render.bind(scene), penpalText = scene.ctx.fillText.bind(scene.ctx), penpalEllipse = scene.ctx.ellipse.bind(scene.ctx);
const penpalMomentum = scene.drawMomentum.bind(scene);
scene.drawMomentum = () => { window.__penpalDrawingGlint = true; try { penpalMomentum(); } finally { window.__penpalDrawingGlint = false; } };
scene.render = dt => { window.__penpalLabels = []; window.__penpalGlints = []; penpalRender(dt); };
scene.ctx.fillText = (text, x, y, ...rest) => {
  const t = scene.ctx.getTransform(), m = scene.ctx.measureText(text), d = devicePixelRatio || 1;
  const cx = (t.a * x + t.c * y + t.e) / d, cy = (t.b * x + t.d * y + t.f) / d;
  window.__penpalLabels.push({ text, left: cx - t.a * m.actualBoundingBoxLeft / d, right: cx + t.a * m.actualBoundingBoxRight / d,
    top: cy - t.d * m.actualBoundingBoxAscent / d, bottom: cy + t.d * m.actualBoundingBoxDescent / d });
  penpalText(text, x, y, ...rest);
};
scene.ctx.ellipse = (x, y, rx, ry, ...rest) => {
  if (window.__penpalDrawingGlint) { const t = scene.ctx.getTransform(), d = devicePixelRatio || 1;
    window.__penpalGlints.push({ left: (t.a * (x - rx) + t.e) / d, right: (t.a * (x + rx) + t.e) / d,
      top: (t.d * (y - ry) + t.f) / d, bottom: (t.d * (y + ry) + t.f) / d }); }
  penpalEllipse(x, y, rx, ry, ...rest);
};
window.__penpalMomentum = () => structuredClone({ cue: scene.state?.courtyardMomentum, renderedNode: scene.momentumNode()?.id, currentNode: model.node, interactLabel: scene.state?.interactLabel, used: [...momentum.used], time: model.time, labels: window.__penpalLabels, glints: window.__penpalGlints });
${courtyardBeatObserver}
` });
    });
    await context.route('**/src/flatland/main.js', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: await response.text() + '\nwindow.__penpalDiscovery = () => structuredClone({ state: model.snapshot(), view: scene.view });' });
    });
    // Observe every frame; no game state or saved profile is injected.
    await page.addInitScript(() => {
      window.ctaViolations = [];
      function audit() {
        const primary = [...document.querySelectorAll('.action-row .primary-button, .action-row .attention-action')];
        if (primary.length > 1 || primary.some(el => el.disabled)) window.ctaViolations.push(primary.map(el => el.id));
        requestAnimationFrame(audit);
      }
      requestAnimationFrame(audit);
    });
    page.on('pageerror', error => receipt.errors.push(error.message));
    page.on('console', message => { if (['error', 'warning'].includes(message.type())) receipt.errors.push(message.text()); });
    await page.goto(`${baseURL}/?seed=2`);
    await page.locator('#choice-dialog[open]').waitFor();
    assert.equal(await page.locator('#relic-choices button').count(), 5);
    assert.equal(await page.locator('#choice-route').isVisible(), false);
    assert.ok(await page.locator('#choice-dialog').evaluate(el => el.scrollHeight <= el.clientHeight + 2), 'short choice fits without scrolling');
    await page.screenshot({ path: `${out}/courtyard-choice-${width}.png` });
    await page.getByRole('button', { name: '选择缓落壳', exact: true }).click();
    const startedAt = Date.now();
    assert.equal(await page.locator('#choice-dialog').isVisible(), false);
    assert.equal(await page.locator('#friend-guide').isVisible(), true);
    if (width <= 480) {
      assert.equal(await page.locator('#run-details').evaluate(el => el.open), false);
      assert.equal(await page.locator('.scoreboard').isVisible(), true);
      assert.equal(await page.locator('#mechanisms').isVisible(), true);
      const mechanismHeading = await page.locator('.mechanism-heading').boundingBox();
      const mechanismList = await page.locator('#mechanisms').boundingBox();
      assert.ok(mechanismHeading.y + mechanismHeading.height <= mechanismList.y, 'mechanism title stays above the first item');
      for (const selector of ['.relic-panel', '#resonance-panel', '#secret-panel']) assert.equal(await page.locator(selector).isVisible(), false);
      await page.locator('#run-details>summary').click();
      assert.equal(await page.locator('.relic-panel').isVisible(), true, 'build remains available on demand');
      await page.locator('#run-details>summary').click();
      await page.evaluate(() => scrollTo(0, 0));
      for (const selector of ['#scene', '.layer-controls', '#w-slider', '.action-row .primary-button']) {
        const rect = await page.locator(selector).boundingBox();
        assert.ok(rect.y >= 0 && rect.y + rect.height <= 844, `${selector} fits the phone first screen: ${JSON.stringify(rect)}`);
      }
    } else assert.equal(await page.locator('.relic-panel').isVisible(), true);
    await page.screenshot({ path: `${out}/courtyard-first-step-${width}.png`, fullPage: true });
    await page.keyboard.press('e');
    await page.waitForFunction(() => document.querySelector('#action-feedback').textContent.includes('没有回响'));
    assert.equal(await page.locator('#action-feedback').evaluate(el => getComputedStyle(el).pointerEvents), 'none');
    await page.locator('#align').click();
    // Seeded geometry supplies the click coordinate only; traversal is UI-only.
    const fixture = new GameModel(2); fixture.chooseRelic('shell');
    const target = fixture.snapshot().nodes.find(n => n.id === fixture.selected);
    const box = await page.locator('#scene').boundingBox();
    const scale = Math.min(box.width / 1000, box.height / 650);
    await page.locator('#scene').click({ position: {
      x: (box.width - 1000 * scale) / 2 + target.x * scale,
      y: (box.height - 650 * scale) / 2 + target.y * scale,
    } });
    assert.match(await page.locator('#move').innerText(), /稳行/);
    assert.equal(await page.locator('#move.attention-action').count(), 1);
    await page.screenshot({ path: `${out}/courtyard-preview-${width}.png` });
    if (width === 320) assert.equal(await page.locator('#move').evaluate(el => getComputedStyle(el).animationName), 'none');
    await page.locator('#move').click();
    assert.equal(await page.locator('#interact').isDisabled(), true);
    assert.match(await page.locator('#interact').getAttribute('title'), /还在穿越/);
    await page.screenshot({ path: `${out}/courtyard-crossing-${width}.png` });
    await page.locator('.action-row').screenshot({ path: `${out}/crossing-actions-${width}.png` });
    await page.waitForFunction(() => document.querySelector('#interact').classList.contains('attention-action'));
    const firstCrossingMs = Date.now() - startedAt;
    assert.ok(firstCrossingMs < 30000, 'scripted fresh-profile first crossing within 30 seconds');
    assert.equal(await page.locator('#friend-guide').isVisible(), false, 'first safe landing is quiet');
    await page.waitForFunction(() => window.__penpalMomentum().cue?.age >= .3);
    const landing = await page.evaluate(() => window.__penpalMomentum());
    assert.equal(landing.cue.beat, 'landing');
    assert.equal(landing.renderedNode, landing.currentNode);
    assert.equal(landing.cue.node, landing.renderedNode);
    assert.equal(await page.locator('#interact.primary-button.attention-action').count(), 1);
    assert.equal(await page.locator('#move.primary-button').count(), 0);
    assert.ok((await page.locator('#interact').innerText()).includes(landing.interactLabel));
    await page.screenshot({ path: `${out}/courtyard-landing-glint-${width}.png` });
    await page.keyboard.press('h');
    assert.equal(await page.locator('#friend-guide').isVisible(), true, 'explicit help remains available after landing');
    assert.equal((await page.evaluate(() => window.__penpalMomentum())).cue, null, 'explicit help suppresses the ambient beat');
    const activatedAt = Date.now();
    await page.locator('#interact').click();
    await page.waitForFunction(() => document.querySelector('#mechanism-count').textContent === '1 / 3');
    await page.waitForFunction(() => [...document.querySelectorAll('#mechanisms small')].some(el => el.textContent === '供能 1/2'));
    assert.doesNotMatch(await page.locator('#action-feedback').innerText(), /供能 1\/2|还差一路/);
    await page.waitForFunction(() => window.__penpalMomentum().cue?.beat === 'onward' && window.__penpalMomentum().cue.age >= .3);
    assert.equal((await page.evaluate(() => window.__penpalMomentum())).cue.node, 'hub');
    const onwardLayout = await page.evaluate(() => window.__penpalMomentum());
    assert.equal(onwardLayout.labels.some(l => /供能 1\/2|还差一路/.test(l.text)), false);
    if (width < 700) {
      const relevant = onwardLayout.labels.filter(l => /归响台/.test(l.text));
      assert.ok(relevant.some(l => l.text === '归响台'));
      const activation = onwardLayout.labels.find(l => /^启动/.test(l.text));
      assert.ok(activation);
      for (const note of [activation]) for (const label of onwardLayout.labels.filter(l => /^(维度锚台|归响台|潮汐源|裂隙花匣)$/.test(l.text))) {
        assert.ok(note.right + 3 < label.left || note.left - 3 > label.right || note.bottom + 3 < label.top || note.top - 3 > label.bottom,
          'phone notes avoid platform names as well as each other');
      }
      for (const label of relevant) for (const rim of onwardLayout.glints) {
        assert.ok(label.right + 3 < rim.left || label.left - 3 > rim.right || label.bottom + 3 < rim.top || label.top - 3 > rim.bottom,
          'phone power and platform labels leave a gap around the glint');
      }
    }
    await page.screenshot({ path: `${out}/courtyard-onward-glint-${width}.png` });
    await page.locator('#scene').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${out}/courtyard-power-${width}.png` });
    assert.match(await page.locator('#interact').innerText(), /^已启动/);
    assert.equal(await page.locator('#interact.completed-action').count(), 1);
    await page.keyboard.press('e');
    await page.waitForFunction(() => document.querySelector('#action-feedback').textContent.includes('去辉光源'));
    const secondSourceCueMs = Date.now() - activatedAt;
    assert.ok(secondSourceCueMs < 20000);
    await page.screenshot({ path: `${out}/courtyard-second-source-${width}.png` });
    await page.locator('.action-row').screenshot({ path: `${out}/completed-actions-${width}.png` });
    assert.equal(await page.locator('#interact').evaluate(el => getComputedStyle(el).outlineColor === 'rgb(198, 154, 75)'), false,
      'completed E must not keep the primary gold focus ring');
    const quietSince = await page.evaluate(() => window.__penpalMomentum().time);
    await page.waitForFunction(t => window.__penpalMomentum().time >= t + 4.2, quietSince);
    assert.equal(await page.evaluate(() => window.__penpalMomentum().cue), null, 'unfollowed invitation stays quiet');
    // Follow the visible route back to the hub after the light has expired.
    await page.getByRole('button', { name: '前往归响台', exact: true }).click();
    await page.locator('#align').click(); await page.locator('#move').click();
    await page.waitForFunction(() => window.__penpalMomentum().cue?.beat === 'follow' && window.__penpalMomentum().cue.age >= .2);
    await page.screenshot({ path: `${out}/courtyard-follow-through-${width}.png` });
    await page.keyboard.press('h');
    assert.equal(await page.evaluate(() => window.__penpalMomentum().cue), null, 'H yields immediately even during earned feedback');
    assert.equal(await page.locator('#friend-guide').isVisible(), true);
    await page.getByRole('button', { name: '前往辉光源', exact: true }).click();
    await page.locator('#align').click(); await page.locator('#move').click();
    await page.waitForFunction(() => document.querySelector('#interact').classList.contains('attention-action'));
    await page.locator('#interact').click();
    await page.waitForFunction(() => document.querySelector('#mechanism-count').textContent === '2 / 3');
    await page.waitForFunction(() => document.querySelector('#action-feedback').textContent.includes('供能到齐'));
    const remotePower = await page.evaluate(() => window.__courtyardBeat());
    assert.deepEqual(remotePower.powerConflicts, []);
    assert.deepEqual(remotePower.powerFrames.at(-1).notes, [], 'remote completion has only its action feedback');
    await page.screenshot({ path: `${out}/courtyard-power-complete-remote-${width}.png`, fullPage: true });
    assert.equal(await page.locator('.action-row .primary-button').count(), 1);
    assert.deepEqual(await page.evaluate(() => window.ctaViolations), []);
    await page.locator('#help').click();
    assert.equal(await page.locator('[data-help]').count(), 3);
    for (const topic of ['next', 'slice', 'action']) {
      await page.locator(`[data-help="${topic}"]`).click();
      assert.equal(await page.locator('[data-help][aria-pressed="true"]').count(), 1);
      assert.ok((await page.locator('#help-tip').innerText()).length < 55);
    }
    await page.screenshot({ path: `${out}/courtyard-help-${width}.png` });
    await page.locator('#help-done').click();
    const powerAtReceiver = await verifyPowerAtReceiver(page, out, width);
    await page.goto(`${baseURL}/flatland.html?level=visitor&play=explore&seed=7`);
    await page.locator('#visitor-goal').waitFor();
    assert.match(await page.locator('#visitor-goal').innerText(), /拖 S.*按 E/);
    assert.equal(await page.locator('#collection-dialog').isVisible(), false);
    await page.screenshot({ path: `${out}/visitor-first-step-${width}.png` });
    // Use native range keyboard input; never assign model state or a saved collection.
    await page.locator('#s-slider').focus();
    await page.keyboard.press('Home');
    for (let n = 0; n < 5; n++) await page.keyboard.press('PageUp');
    await page.waitForFunction(() => !document.querySelector('#poke').disabled);
    assert.match(await page.locator('#visitor-goal').innerText(), /戳一下球/);
    await page.locator('#poke').click();
    assert.match(await page.locator('#visitor-goal').innerText(), /跳起来了/);
    await page.locator('#pause').click();
    await page.waitForTimeout(1400);
    assert.match(await page.locator('#visitor-goal').innerText(), /跳起来了/);
    await page.locator('#resume').click();
    await page.waitForFunction(() => document.querySelector('#visitor-goal').textContent === '走到光环边找访客');
    assert.equal(await page.locator('#collection-dialog').isVisible(), false);
    await page.screenshot({ path: `${out}/visitor-next-beat-${width}.png` });
    await page.locator('[data-level="2"]').click();
    assert.equal(await page.locator('#visitor-goal').innerText(), '墙那边有动静 · 换个切片看看');
    await page.screenshot({ path: `${out}/escape-arrival-${width}.png` });
    await page.waitForFunction(() => document.querySelector('#visitor-goal').hidden);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow');
    // New-save collection is earned through the actual chase before the handoff.
    await page.goto(`${baseURL}/flatland.html?level=escape&play=explore&seed=42`);
    await page.waitForFunction(() => window.__penpalDiscovery?.().view);
    for (const [step, height] of [[0, 4.7], [1, 2.7], [2, .6]]) {
      const slice = async () => {
        await page.locator('#s-slider').evaluate((el, value) => { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, height);
        await page.waitForFunction(value => Math.abs(window.__penpalDiscovery().state.s - value) < .02, height);
      };
      if (!step) await slice();
      await page.locator('#scene').scrollIntoViewIfNeeded();
      const { state, view } = await page.evaluate(() => window.__penpalDiscovery()), box = await page.locator('#scene').boundingBox();
      const { x, y } = state.encounter;
      await page.mouse.move(box.x + view.main.ox + x * view.main.scale, box.y + view.main.oy + y * view.main.scale);
      await page.mouse.down();
      try {
        await page.waitForFunction(({ x, y }) => { const p = window.__penpalDiscovery().state.player; return Math.hypot(p.x - x, p.y - y) < .22; }, { x, y }, { timeout: 8000 });
      } finally { await page.mouse.up(); }
      if (step) await slice();
      await page.waitForFunction(step => { const e = window.__penpalDiscovery().state.encounter; return e.kind === 'home' || e.step > step; }, step);
    }
    assert.deepEqual(await page.evaluate(() => window.__penpalDiscovery().state.collection.found), ['sprout']);
    await page.getByRole('link', { name: '去庭院 ↗', exact: true }).first().click();
    const firstEntryBeat = await verifyCourtyardFirstBeat(page, out, width, { interrupt: width === 390 ? 'mechanism-follow' : false, fullPowerChain: true });
    receipt.checks.push({ width, height: width > 700 ? 900 : 844, firstCrossingMs, secondSourceCueMs, landingGuideQuiet: true,
      landingAndOnwardGlints: true, landing, onwardLayout, compactProgress: width <= 480, singleSupplyProgress: true, remotePower, powerAtReceiver, followAfterExpiry: true, unfollowedQuietSeconds: 4.2, glintYieldsToExplicitHelp: true, explicitHelpAfterLanding: true, firstEntryBeat, passed: true });
    await context.close();
  }
  assert.deepEqual(receipt.errors, []);
  receipt.status = 'passed';
} catch (error) {
  receipt.status = receipt.checks.length ? 'failed' : 'blocked-or-failed-before-first-check';
  receipt.failure = error.stack;
  receipt.failureActual = error.actual;
  receipt.failureExpected = error.expected;
  process.exitCode = 1;
} finally {
  await browser?.close();
  await writeFile(`${out}/receipt.json`, JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({ ...receipt, output: out }));
}
