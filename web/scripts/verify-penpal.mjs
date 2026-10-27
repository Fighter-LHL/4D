// Optional browser regression: reuse npm start on 127.0.0.1:4173.
// Requires locally installed Playwright; no saved profile or model injection.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const out = fileURLToPath(new URL(`../artifacts/play-fun-20261027/browser-${Date.now()}/`, import.meta.url));
await mkdir(out, { recursive: true });
const receipt = { status: 'started', checks: [], errors: [] };
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  for (const width of [1280, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: width > 700 ? 900 : 844 }, reducedMotion: width === 320 ? 'reduce' : 'no-preference' });
    const page = await context.newPage();
    page.on('pageerror', error => receipt.errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') receipt.errors.push(message.text()); });
    await page.goto('http://127.0.0.1:4173/?seed=2');
    await page.locator('#choice-dialog[open]').waitFor();
    assert.equal(await page.locator('#relic-choices button').count(), 5);
    assert.equal(await page.locator('#choice-route').isVisible(), false);
    assert.ok(await page.locator('#choice-dialog').evaluate(el => el.scrollHeight <= el.clientHeight + 2), 'short choice fits without scrolling');
    await page.screenshot({ path: `${out}/courtyard-choice-${width}.png` });
    await page.getByRole('button', { name: '选择缓落壳', exact: true }).click();
    assert.equal(await page.locator('#choice-dialog').isVisible(), false);
    assert.equal(await page.locator('#friend-guide').isVisible(), true);
    await page.screenshot({ path: `${out}/courtyard-first-step-${width}.png` });
    await page.keyboard.press('e');
    await page.waitForFunction(() => document.querySelector('#action-feedback').textContent.includes('没有回响'));
    assert.equal(await page.locator('#action-feedback').evaluate(el => getComputedStyle(el).pointerEvents), 'none');
    await page.locator('#align').click();
    await page.locator('#move').click();
    await page.waitForFunction(() => document.querySelector('#interact').classList.contains('attention-action'));
    await page.locator('#interact').click();
    await page.waitForFunction(() => document.querySelector('#mechanism-count').textContent === '1 / 3');
    await page.waitForFunction(() => document.querySelector('#action-feedback').textContent.includes('供能 1/2'));
    await page.locator('#scene').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${out}/courtyard-power-${width}.png` });
    await page.locator('#help').click();
    assert.equal(await page.locator('[data-help]').count(), 3);
    for (const topic of ['next', 'slice', 'action']) {
      await page.locator(`[data-help="${topic}"]`).click();
      assert.equal(await page.locator('[data-help][aria-pressed="true"]').count(), 1);
      assert.ok((await page.locator('#help-tip').innerText()).length < 55);
    }
    await page.screenshot({ path: `${out}/courtyard-help-${width}.png` });
    await page.locator('#help-done').click();
    await page.goto('http://127.0.0.1:4173/flatland.html?level=visitor&play=explore&seed=7');
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
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow');
    receipt.checks.push({ width, height: width > 700 ? 900 : 844, passed: true });
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
