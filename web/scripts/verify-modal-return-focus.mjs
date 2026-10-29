// Ordinary Chromium clicks/keys drive gameplay. The response-appended observer
// only returns cloned state; no model writes, fake timers or synthetic DOM input.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const base = process.env.BASE_URL || 'http://127.0.0.1:4177';
const out = process.env.ARTIFACT_DIR;
assert.ok(out, 'provide a fresh ARTIFACT_DIR');
await mkdir(out); // Preserve earlier runs, including failed runs.
const baseline = process.env.BASELINE === '1';
const source = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const receipt = {
  base, baseline, startedUtc: new Date().toISOString(),
  head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceSha256: createHash('sha256').update(source).digest('hex'),
  input: 'Playwright Chromium pointer/keyboard input; no native OS app-switching claim.',
  observer: 'Read-only response-appended cloned model snapshot, time and paused flag; served main.js verified against disk before append.',
  cases: [], controls: [], errors: [], externalRequests: [],
};
const variants = [
  { name: 'help-x', opener: 'help', modal: 'help-dialog', close: 'close-help' },
  { name: 'help-done', opener: 'help', modal: 'help-dialog', close: 'help-done' },
  { name: 'help-escape', opener: 'help', modal: 'help-dialog' },
  { name: 'restart-cancel', opener: 'restart', modal: 'restart-dialog', close: 'cancel-restart' },
  { name: 'restart-escape', opener: 'restart', modal: 'restart-dialog' },
];
const read = page => page.evaluate(() => window.__modalReturnState());
const stable = ({ state: s }) => ({
  phase: s.phase, seed: s.seed, room: s.room, node: s.node, selected: s.selected,
  w: s.w, carried: s.carried, banked: s.banked, lives: s.lives,
  relics: s.relics, activated: s.activated, stats: s.stats,
});
const brief = s => ({ ...stable(s), time: s.time, paused: s.paused, travel: s.state.travel });
async function ready(page) {
  await page.goto(`${base}/?seed=10`);
  await page.getByRole('button', { name: '选择回流棱镜', exact: true }).click();
  await page.locator('#align').click();
  await page.waitForFunction(() => !document.querySelector('#move').disabled);
}
async function focusByTab(page, id) {
  for (let i = 0; i < 20; i++) {
    if (await page.evaluate(() => document.activeElement.id) === id) return;
    await page.keyboard.press('Tab');
  }
  assert.fail(`Native Tab did not reach ${id}`);
}
async function open(page, v) {
  await page.locator(`#${v.opener}`).click();
  await page.locator(`#${v.modal}[open]`).waitFor();
  await page.waitForFunction(() => document.querySelector('#w-slider').disabled);
}
async function dismiss(page, v, method) {
  if (!v.close) await page.keyboard.press('Escape');
  else if (method === 'click') await page.locator(`#${v.close}`).click();
  else {
    await focusByTab(page, v.close);
    await page.keyboard.press(method);
  }
}
async function returned(page) {
  assert.equal(await page.locator('dialog[open]').count(), 0, 'no modal remains open');
  assert.equal((await read(page)).paused, false);
  assert.equal(await page.locator('#w-slider').evaluate(el => !el.disabled && el === document.activeElement), true, 'enabled W slider receives focus');
}
const browser = await chromium.launch({ headless: true, chromiumSandbox: true });
receipt.browser = { version: browser.version(), executable: chromium.executablePath(), headless: true, chromiumSandbox: true };
try {
  for (const width of baseline ? [1280] : [1280, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const responseChecks = [];
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== base) { receipt.externalRequests.push(url.href); return route.abort(); }
      if (url.pathname !== '/src/main.js') return route.continue();
      const check = (async () => {
        const response = await route.fetch();
        const body = await response.text();
        assert.equal(body, source, 'browser must run current worktree source');
        await route.fulfill({ response, body: body + '\nwindow.__modalReturnState = () => structuredClone({ state: model.snapshot(), time: model.time, paused });' });
      })();
      responseChecks.push(check);
      await check;
    });
    const page = await context.newPage();
    page.on('pageerror', e => receipt.errors.push({ width, type: 'pageerror', message: e.message }));
    page.on('console', m => { if (['error', 'warning'].includes(m.type())) receipt.errors.push({ width, type: m.type(), message: m.text() }); });
    for (const v of variants) {
      await ready(page);
      const methods = baseline ? ['click'] : v.close ? ['click', 'Enter', 'Space'] : ['Escape', 'Escape'];
      for (const [repeat, method] of methods.entries()) {
        if (repeat) await page.locator('#align').click();
        const before = await read(page);
        const row = { width, variant: v.name, repeat: repeat + 1, dismissal: v.close ? method : 'Escape', before: brief(before) };
        receipt.cases.push(row);
        await open(page, v);
        await dismiss(page, v, method);
        if (baseline) {
          assert.equal(await page.evaluate(() => document.activeElement.id), v.opener);
          await page.keyboard.press('Space');
          assert.equal(await page.locator(`#${v.modal}`).evaluate(el => el.open), true);
          assert.equal((await read(page)).state.travel, null);
          row.baselineReproduced = true;
          continue;
        }
        await returned(page);
        const closed = await read(page);
        assert.deepEqual(stable(closed), stable(before), 'dismissal preserves the run');
        assert.equal(closed.state.travel, null, 'native dismissal key must not start movement');
        assert.equal(await page.locator('#move').isEnabled(), true);
        await page.keyboard.press('Space');
        const moving = await read(page);
        assert.ok(moving.state.travel, 'immediate Space starts the selected crossing');
        assert.equal(moving.state.travel.to, before.state.selected);
        assert.equal(await page.locator('dialog[open]').count(), 0, 'Space must not reopen a dialog');
        row.crossing = brief(moving);
        // Interrupt that same crossing. 1.4 s exceeds its normal 1.35 s duration.
        await open(page, v);
        const frozen = await read(page);
        assert.ok(frozen.state.travel, 'dialog opens during the crossing');
        await page.waitForTimeout(1400);
        assert.deepEqual(await read(page), frozen, 'modal freezes complete snapshot and model clock');
        row.frozen = brief(frozen);
        if (!repeat && ['help-done', 'restart-escape'].includes(v.name)) {
          await page.screenshot({ path: `${out}/${width}-${v.name}-frozen.png`, fullPage: true });
        }
        await dismiss(page, v, method);
        await returned(page);
        const resumed = await read(page);
        assert.deepEqual(stable(resumed), stable(frozen), 'cancellation retains carried reward, seed, lives and selected path');
        assert.ok(resumed.state.travel, 'same crossing resumes');
        for (const key of ['from', 'to', 'duration', 'risky', 'layer', 'source']) {
          assert.deepEqual(resumed.state.travel[key], frozen.state.travel[key], `crossing ${key} unchanged`);
        }
        assert.ok(resumed.state.travel.progress >= frozen.state.travel.progress);
        assert.ok(resumed.state.travel.progress - frozen.state.travel.progress < .25, 'no paused-time jump');
        if (!repeat && ['help-done', 'restart-escape'].includes(v.name)) {
          await page.screenshot({ path: `${out}/${width}-${v.name}-resumed.png`, fullPage: true });
        }
        await page.waitForFunction(() => !window.__modalReturnState().state.travel);
        const arrived = await read(page);
        assert.equal(arrived.state.node, moving.state.travel.to);
        assert.equal(arrived.state.lives, before.state.lives);
        assert.equal(arrived.state.stats.failures, 0);
        assert.equal(arrived.state.seed, 10);
        assert.ok(arrived.state.carried >= before.state.carried, 'earned reward remains carried');
        row.resumed = brief(resumed); row.arrived = brief(arrived); row.status = 'passed';
      }
      console.log(JSON.stringify({ width, variant: v.name, repeats: methods.length, status: baseline ? 'baseline-reproduced' : 'passed' }));
    }
    if (!baseline) {
      // Native range arrows and A/D still move W continuously after cancellation.
      const start = (await read(page)).state.w;
      await page.keyboard.press('ArrowLeft');
      const left = (await read(page)).state.w;
      assert.ok(start - left > 0 && start - left < .01);
      await page.keyboard.press('ArrowRight');
      assert.ok(Math.abs((await read(page)).state.w - start) < .002);
      await page.keyboard.press('a');
      assert.ok(Math.abs((await read(page)).state.w - (start - .015)) < .002);
      await page.keyboard.press('d');
      assert.ok(Math.abs((await read(page)).state.w - start) < .002);
      const previous = await read(page);
      assert.ok(previous.state.carried > 0, 'restart control starts with earned rewards');
      await page.locator('#restart').click();
      await focusByTab(page, 'confirm-restart');
      await page.keyboard.press('Enter');
      await page.locator('#choice-dialog[open]').waitFor();
      const fresh = await read(page);
      assert.equal(fresh.state.phase, 'choose');
      assert.notEqual(fresh.state.seed, previous.state.seed);
      assert.equal(fresh.state.carried, 0);
      assert.equal(fresh.state.banked, 0);
      assert.equal(fresh.state.lives, 3);
      assert.equal(fresh.state.travel, null);
      await page.getByRole('button', { name: '选择回流棱镜', exact: true }).click();
      assert.equal((await read(page)).state.phase, 'playing');
      await page.screenshot({ path: `${out}/${width}-new-run.png`, fullPage: true });
      receipt.controls.push({ width, continuousW: { start, left, arrowStep: start - left }, nativeEnterRestart: { before: brief(previous), after: brief(fresh) }, status: 'passed' });
    }
    await Promise.all(responseChecks);
    await context.close();
  }
  assert.deepEqual(receipt.errors, []);
  assert.deepEqual(receipt.externalRequests, []);
  receipt.status = 'passed';
} catch (error) { receipt.status = 'failed'; receipt.failure = error.stack; process.exitCode = 1; }
finally {
  await browser.close(); receipt.finishedUtc = new Date().toISOString(); receipt.browserClosed = true;
  await writeFile(`${out}/receipt.json`, JSON.stringify(receipt, null, 2) + '\n');
}
console.log(JSON.stringify({ status: receipt.status, cases: receipt.cases.length, controls: receipt.controls.length, failure: receipt.failure }));
