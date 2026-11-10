// Optional browser regression: BASE_URL may point at an isolated serve.js port.
// Requires locally installed Playwright; no saved profile or model injection.
// Courtyard part: a fresh profile's first run starts without a modal wall, the compact
// progress layout keeps the first screen playable, refusals and supply news stay quiet and
// single-surface, H speaks the current controls, help tips stay short, and the earned
// discovery entry keeps its own starter picker.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { courtyardFlowObserver, discoveryObserver, readFlow, chooseTarget, followGuidance, waitSettled, earnFirstDiscovery, chooseDiscoveryStarter, verifyRestartAndRevisit, fitsViewport } from './courtyard-first-beat.mjs';
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
  const widths = process.env.VERIFY_WIDTHS ? process.env.VERIFY_WIDTHS.split(',').map(Number) : [1280, 390, 320];
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: width > 700 ? 900 : 844 }, reducedMotion: width === 320 ? 'reduce' : 'no-preference' });
    const page = await context.newPage();
    await context.route('**/src/main.js', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: await response.text() + courtyardFlowObserver });
    });
    await context.route('**/src/flatland/main.js', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: await response.text() + discoveryObserver });
    });
    page.on('pageerror', error => receipt.errors.push(error.message));
    page.on('console', message => { if (['error', 'warning'].includes(message.type())) receipt.errors.push(message.text()); });

    // A bare discovery URL cannot fabricate an earned entry or spend the welcome.
    await page.goto(`${baseURL}/?seed=2&from=discovery`);
    await page.locator('#choice-dialog[open]').waitFor();
    assert.equal(await page.locator('#choice-dialog.discovery-choice').count(), 0, 'a bare discovery URL cannot fabricate an earned entry');
    assert.equal(await page.locator('#relic-choices button:visible').count(), 5);
    assert.equal(await page.evaluate(() => localStorage.getItem('wslice-courtyard-welcome')), null, 'unearned entry does not spend the welcome');

    // A fresh profile's first run starts playing with the starter shell: no modal wall.
    await page.goto(`${baseURL}/?seed=2`);
    await page.waitForFunction(() => window.__flow?.());
    const startedAt = Date.now();
    const start = await readFlow(page);
    assert.equal(start.state.phase, 'playing', 'the first run starts without a picker');
    assert.equal(start.state.relics.shell, 1);
    assert.equal(await page.locator('#choice-dialog').isVisible(), false);
    assert.equal(await page.locator('#switch-relic-btn').count(), 0, 'no mid-run relic switch');

    // Compact progress: the build stays available on demand; the first screen stays playable.
    assert.equal(await page.locator('#run-details').evaluate(el => el.open), false);
    assert.equal(await page.locator('.scoreboard').isVisible(), true);
    assert.equal(await page.locator('#mechanisms').isVisible(), true);
    for (const selector of ['.relic-panel', '#resonance-panel', '#secret-panel']) assert.equal(await page.locator(selector).isVisible(), false);
    await page.locator('#run-details>summary').click();
    assert.equal(await page.locator('.relic-panel').isVisible(), true, 'build remains available on demand');
    await page.locator('#run-details>summary').click();
    if (width <= 480) {
      const heading = await page.locator('.mechanism-heading').first().boundingBox();
      const list = await page.locator('#mechanisms').boundingBox();
      assert.ok(heading.y + heading.height <= list.y, 'mechanism title stays above the first item');
      await page.evaluate(() => scrollTo(0, 0));
      for (const selector of ['#scene', '#onboarding-banner']) {
        const rect = await page.locator(selector).boundingBox();
        assert.ok(rect.y >= 0 && rect.y + rect.height <= 844, `${selector} fits the phone first screen: ${JSON.stringify(rect)}`);
      }
    }
    await page.screenshot({ path: `${out}/courtyard-first-step-${width}.png`, fullPage: true });

    // Keyboard E with nothing to bank still answers locally, and the popup never blocks the canvas.
    await page.locator('#scene').focus();
    await page.keyboard.press('e');
    await page.waitForFunction(() => document.querySelector('#action-feedback').textContent.includes('没有回响'));
    assert.equal(await page.locator('#action-feedback').evaluate(el => getComputedStyle(el).pointerEvents), 'none');

    // First activation: one click on ①; landing lights it; the landing stays quiet.
    const order = start.state.mechanismOrder;
    await chooseTarget(page, order[0]);
    await page.waitForFunction(id => window.__flow().state.activated.includes(id), order[0], { timeout: 15000 });
    const firstActivationMs = Date.now() - startedAt;
    assert.ok(firstActivationMs < 30000, 'scripted fresh-profile first activation within 30 seconds');
    assert.equal(await page.locator('#friend-guide').isVisible(), false, 'first landing is quiet');
    await waitSettled(page);

    // Partial supply is reported by the checklist slots only, not the popup or the canvas.
    const partial = await readFlow(page);
    const receiver = partial.state.nodes.find(n => n.required?.includes(order[0]) && !n.powered);
    if (receiver) {
      assert.match(await page.locator(`[data-mechanism="${receiver.id}"] small`).innerText(), /🔒 需先点亮/);
      assert.equal(await page.locator(`[data-mechanism="${receiver.id}"] [data-source].received`).count(), 1, 'the slot shows the delivered supply');
      assert.doesNotMatch(await page.locator('#action-feedback').innerText(), /供能 1\/2|还差一路/);
      assert.equal(partial.pills.some(t => /供能/.test(t)), false, 'no canvas note repeats partial supply');
    }
    await page.screenshot({ path: `${out}/courtyard-after-first-${width}.png`, fullPage: true });

    // H speaks the current controls (click / wheel), never the retired ones.
    await page.locator('#scene').focus();
    await page.keyboard.press('h');
    assert.equal(await page.locator('#friend-guide').isVisible(), true, 'explicit help is visible');
    const helpText = await page.locator('#friend-guide').innerText();
    assert.doesNotMatch(helpText, /点平台预览|再点稳行|按 E|E 启动/, `help speaks the current controls: ${helpText}`);
    await page.waitForFunction(() => document.querySelector('#friend-guide').hidden, null, { timeout: 12000 });

    // Remote completion: lighting ② completes the receiver; one surface reports it.
    const second = (await readFlow(page)).state.nodes.find(n => n.kind === 'mechanism' && n.powered && !partial.state.activated.includes(n.id));
    await followGuidance(page, second.id);
    await page.waitForFunction(() => window.__flow().feedback.some(f => f.text.includes('供能到齐')), null, { timeout: 8000 });
    const remote = await readFlow(page);
    const complete = remote.feedback.filter(f => f.text.includes('供能到齐'));
    assert.ok(complete.every(f => /点它前往点亮/.test(f.text)), `completion names the next action neutrally: ${JSON.stringify(complete)}`);
    assert.equal(remote.pills.some(t => /供能到齐/.test(t)), false, 'the canvas does not repeat the completion');
    assert.ok(remote.maxFullPills <= 2, `at most two full canvas pills at once (saw ${remote.maxFullPills})`);
    await page.screenshot({ path: `${out}/courtyard-power-complete-remote-${width}.png`, fullPage: true });

    // Help topics stay short and answer the current state.
    await page.locator('#help').click();
    assert.equal(await page.locator('[data-help]').count(), 3);
    const tips = {};
    for (const topic of ['next', 'slice', 'action']) {
      await page.locator(`[data-help="${topic}"]`).click();
      assert.equal(await page.locator('[data-help][aria-pressed="true"]').count(), 1);
      tips[topic] = await page.locator('#help-tip').innerText();
      assert.ok([...tips[topic]].length <= 60, `help tip stays short (${[...tips[topic]].length}): ${tips[topic]}`);
      assert.doesNotMatch(tips[topic], /点平台预览|再点稳行/);
    }
    await fitsViewport(page, page.locator('#help-tip'), 'help tip');
    await page.screenshot({ path: `${out}/courtyard-help-${width}.png` });
    await page.locator('#help-done').click();

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
    await earnFirstDiscovery(page, baseURL, 'level=escape&play=explore&seed=42');
    await page.getByRole('link', { name: '去庭院 ↗', exact: true }).first().click();
    await page.waitForFunction(() => window.__flow?.());
    const entry = await chooseDiscoveryStarter(page, out, width, { starterRelic: width === 390 ? 'shadow' : 'shell' });
    await followGuidance(page, (await readFlow(page)).state.mechanismOrder[0]);
    const restart = await verifyRestartAndRevisit(page);
    receipt.checks.push({ width, height: width > 700 ? 900 : 844, firstActivationMs, helpText, tips, remoteCompletion: complete.map(f => f.text), entry, ...restart, passed: true });
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
  console.log(JSON.stringify({ status: receipt.status, checks: receipt.checks.length, failure: receipt.failure, output: out }));
}
