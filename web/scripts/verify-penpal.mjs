// Optional browser regression: BASE_URL may point at an isolated serve.js port.
// Requires locally installed Playwright; no saved profile or model injection.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { GameModel } from '../src/model.js';
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
    await page.screenshot({ path: `${out}/courtyard-first-step-${width}.png` });
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
    await page.keyboard.press('h');
    assert.equal(await page.locator('#friend-guide').isVisible(), true, 'explicit help remains available after landing');
    const activatedAt = Date.now();
    await page.locator('#interact').click();
    await page.waitForFunction(() => document.querySelector('#mechanism-count').textContent === '1 / 3');
    await page.waitForFunction(() => document.querySelector('#action-feedback').textContent.includes('供能 1/2'));
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
    // Follow the visible route back to the hub, then select the other source.
    await page.getByRole('button', { name: '前往归响台', exact: true }).click();
    await page.locator('#align').click(); await page.locator('#move').click();
    await page.waitForFunction(() => !document.querySelector('#interact').disabled);
    await page.getByRole('button', { name: '前往辉光源', exact: true }).click();
    await page.locator('#align').click(); await page.locator('#move').click();
    await page.waitForFunction(() => document.querySelector('#interact').classList.contains('attention-action'));
    await page.locator('#interact').click();
    await page.waitForFunction(() => document.querySelector('#mechanism-count').textContent === '2 / 3');
    await page.waitForFunction(() => document.querySelector('#action-feedback').textContent.includes('供能到齐'));
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
    receipt.checks.push({ width, height: width > 700 ? 900 : 844, firstCrossingMs, secondSourceCueMs, landingGuideQuiet: true, explicitHelpAfterLanding: true, passed: true });
    await context.close();
  }
  assert.deepEqual(receipt.errors, []);
  receipt.status = 'passed';
} catch (error) {
  receipt.status = receipt.checks.length ? 'failed' : 'blocked-or-failed-before-first-check';
  receipt.failure = error.message;
  process.exitCode = 1;
} finally {
  await browser?.close();
  await writeFile(`${out}/receipt.json`, JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({ ...receipt, output: out }));
}
