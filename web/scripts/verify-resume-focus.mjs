// Local Chromium regression using ordinary pointer/keyboard input only.
// The appended hook observes state; it never drives gameplay or changes time.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.BASE_URL || 'http://127.0.0.1:4175';
const out = process.env.ARTIFACT_DIR;
assert.ok(out, 'provide a fresh ARTIFACT_DIR');
await mkdir(out, { recursive: true });
const baseline = process.env.BASELINE === '1';
const receipt = { baseline, base, checks: [], errors: [] };
const browser = await chromium.launch({ headless: true });
receipt.browser = browser.version();
try {
  for (const width of baseline ? [1280] : [1280, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.route('**/src/main.js', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: await response.text() + '\nwindow.__resumeState = () => structuredClone({ state: model.snapshot(), time: model.time, paused });' });
    });
    const page = await context.newPage();
    page.on('pageerror', error => receipt.errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') receipt.errors.push(message.text()); });
    const read = () => page.evaluate(() => window.__resumeState());
    const frozenPause = async () => {
      await page.locator('#pause-dialog[open]').waitFor();
      // Wait for the normal frame loop to disable gameplay controls.
      await page.waitForFunction(() => document.querySelector('#w-slider').disabled);
      const before = await read();
      await page.waitForTimeout(1400);
      assert.deepEqual(await read(), before, 'pause freezes rule state and timers');
      return before;
    };
    const resumed = async () => {
      assert.equal((await read()).paused, false);
      assert.equal(await page.locator('#pause-dialog').evaluate(el => el.open), false);
      assert.equal(await page.locator('#w-slider').evaluate(el => !el.disabled && el === document.activeElement), true, 'enabled W slider owns resumed keyboard input');
    };
    await page.goto(`${base}/?seed=10`);
    await page.getByRole('button', { name: '选择回流棱镜', exact: true }).click();
    await page.locator('#align').click();
    await page.locator('#pause').click();
    await frozenPause();
    await page.locator('#resume').click();
    if (baseline) {
      assert.equal(await page.evaluate(() => document.activeElement.id), 'pause');
      await page.keyboard.press('Space');
      assert.equal(await page.locator('#pause-dialog').evaluate(el => el.open), true);
      assert.equal((await read()).state.travel, null);
      receipt.checks.push({ width, label: 'resume leaves pause focused; Space reopens pause' });
      await page.screenshot({ path: `${out}/${width}-baseline.png`, fullPage: true });
      await context.close();
      continue;
    }
    await resumed();
    for (let repeat = 0; repeat < 3; repeat++) {
      if (repeat) {
        await page.locator('#align').click();
        await page.locator('#pause').click();
        await frozenPause();
        // Exercise native Enter on the resume button as well as pointer input.
        if (repeat === 1) await page.keyboard.press('Enter');
        else await page.locator('#resume').click();
        await resumed();
      }
      await page.keyboard.press('Space');
      const moving = await read();
      assert.ok(moving.state.travel, 'Space starts the accepted crossing');
      assert.equal(moving.paused, false);
      await page.keyboard.press('Escape');
      const paused = await frozenPause();
      assert.ok(paused.state.travel, 'interruption retains in-flight crossing');
      // Escape closes the native dialog through its cancel handler.
      await page.keyboard.press('Escape');
      await resumed();
      await page.waitForFunction(() => !window.__resumeState().state.travel);
      const arrived = await read();
      assert.equal(arrived.state.node, moving.state.travel.to);
      assert.equal(arrived.state.lives, 3);
      assert.equal(arrived.state.stats.failures, 0);
      receipt.checks.push({ width, label: `resume and interrupted crossing ${repeat + 1}`, from: moving.state.travel.from, to: arrived.state.node, lives: arrived.state.lives });
    }
    // Native arrow input still adjusts continuous W after resumption.
    const w = (await read()).state.w;
    await page.keyboard.press('ArrowLeft');
    const changed = (await read()).state.w;
    assert.ok(changed < w && w - changed < .01);
    await page.keyboard.press('c');
    await page.keyboard.press('e');
    assert.ok((await read()).state.activated.includes('dew'), 'interaction still works after resumed journeys');
    await page.screenshot({ path: `${out}/${width}-resumed.png`, fullPage: true });
    await page.locator('#restart').click();
    await page.locator('#confirm-restart').click();
    await page.locator('#choice-dialog[open]').waitFor();
    await page.getByRole('button', { name: '选择回流棱镜', exact: true }).click();
    await page.locator('#pause').click();
    await frozenPause();
    await page.locator('#resume').click();
    await resumed();
    assert.equal((await read()).state.lives, 3);
    receipt.checks.push({ width, label: 'fresh run resumes correctly; continuous W and E preserved' });
    await context.close();
  }
  assert.deepEqual(receipt.errors, []);
  receipt.status = 'passed';
} catch (error) { receipt.status = 'failed'; receipt.error = error.stack; throw error; }
finally { await writeFile(`${out}/receipt.json`, JSON.stringify(receipt, null, 2)); await browser.close(); }
console.log(JSON.stringify({ status: receipt.status, checks: receipt.checks.length, browser: receipt.browser }));
