// First return to the hub after real Flatland discovery and the activation handoff.
// BASELINE=1 + BASELINE_MAIN records the frozen main.js before the presentation fix.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { courtyardBeatObserver } from './courtyard-first-beat.mjs';

const base = process.env.BASE_URL || 'http://127.0.0.1:4173';
const out = process.env.ARTIFACT_DIR;
assert.ok(out, 'use a fresh explicit artifact directory');
await mkdir(out, { recursive: true });
const baseline = process.env.BASELINE === '1';
const baselineMain = baseline ? await readFile(process.env.BASELINE_MAIN, 'utf8') : null;
const widths = process.env.VERIFY_WIDTHS ? process.env.VERIFY_WIDTHS.split(',').map(Number) : [1280, 390, 320];
assert.ok(widths.length && widths.every(width => [1280, 390, 320].includes(width)), 'supported viewport widths');
const receipt = { baseline, widths, status: 'started', checks: [], errors: [] };
const browser = await chromium.launch({ headless: true });
receipt.browserVersion = browser.version();
try {
  for (const width of widths) for (const [seed, room, kind] of [[10, 'cascade', 'shift'], [0, 'split', 'shift'], [2, 'confluence', 'move'], [7, 'return', 'move']]) {
    const context = await browser.newContext({ viewport: { width, height: width === 1280 ? 900 : 844 }, reducedMotion: width === 320 ? 'reduce' : 'no-preference' });
    await context.route('**/src/flatland/main.js', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: await response.text() + '\nwindow.__discovery = () => structuredClone({ state: model.snapshot(), view: scene.view });' });
    });
    await context.route('**/src/main.js', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: (baselineMain ?? await response.text()) + courtyardBeatObserver });
    });
    const page = await context.newPage();
    page.on('pageerror', e => receipt.errors.push({ width, seed, message: e.message }));
    page.on('console', m => { if (['error', 'warning'].includes(m.type())) receipt.errors.push({ width, seed, message: m.text() }); });
    const startedAt = Date.now();
    await page.goto(`${base}/flatland.html?play=explore&seed=42`);
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
    // The real earned link with the supported seed query fixes the room, not state.
    const entry = new URL(await page.getByRole('link', { name: '去庭院 ↗', exact: true }).first().getAttribute('href'), page.url());
    entry.searchParams.set('seed', seed);
    await page.goto(entry.href);
    await page.getByRole('button', { name: '带缓落壳出发', exact: true }).click();
    const read = () => page.evaluate(() => window.__courtyardSupplyState());
    const beat = () => page.evaluate(() => window.__courtyardBeat());
    await page.waitForFunction(() => window.__courtyardBeat().cue?.beat === 'arrival');
    await page.locator('#move').click();
    await page.waitForFunction(() => window.__courtyardBeat().cue?.beat === 'mechanism');
    await page.locator('#interact').click();
    await page.waitForFunction(() => { const b = window.__courtyardBeat(); return b.used.includes('mechanism-follow') && b.cue === null; });
    const state = await read(), guide = state.companionGuide;
    const steps = [];
    const controls = '.action-row .primary-button, .action-row .attention-action, .layer-controls .attention-action';
    const primary = page.locator(controls);
    const capture = async label => {
      const state = await read(), b = await beat();
      await page.screenshot({ path: `${out}/${width}-${room}-${label}.png`, fullPage: true });
      steps.push({ label, time: b.time, node: state.node, selected: state.selected, activated: state.activated, guide: state.companionGuide, objective: await page.locator('#objective').innerText(), controls: await page.locator('.action-row button, .layer-controls button, #align').evaluateAll(els => els.map(el => ({ id: el.id, text: el.textContent, disabled: el.disabled, className: el.className }))) });
    };
    await capture('first-activation');
    if (kind === 'shift') {
      await page.locator(`#layer-${guide.layer}`).click();
      await page.locator('#interact').click();
      await page.waitForTimeout(3100);
      await capture('second-activation');
    }
    await page.locator('#move').click();
    await page.waitForFunction(() => { const s = window.__courtyardSupplyState(); return s.node === 'hub' && !s.travel; });
    await page.waitForTimeout(3100);
    await capture('back-at-hub');
    const hub = await read(), b = await beat(), route = hub.companionGuide;
    const target = hub.nodes.find(n => n.id === route.node);
    const shift = !route.aligned;
    const actionId = shift ? `layer-${route.layer}` : 'move';
    const expectedObjective = () => shift
      ? `换到${['Ⅰ', 'Ⅱ', 'Ⅲ'][route.layer]} ${hub.layers[route.layer].name} · 显现通往${target.name}的桥`
      : `到${target.name} · 沿桥稳行`;
    assert.equal(hub.node, 'hub');
    assert.equal(route.kind, 'move');
    assert.equal(hub.selected, route.node);
    assert.equal(hub.activated.length, kind === 'shift' ? 2 : 1);
    const reachedHubMs = Date.now() - startedAt;
    assert.ok(reachedHubMs < 90000, 'scripted discovery to first return fits 90 seconds');
    if (baseline) {
      assert.equal(await page.locator('#objective').innerText(), hub.objective);
      assert.deepEqual(await primary.evaluateAll(els => els.map(el => el.id)), [shift ? 'interact' : 'move']);
      assert.equal(await page.locator('#move').isDisabled(), shift);
      assert.equal((await page.locator('#move').innerText()).replace(/\s+/g, ' '), '稳行 Space ↗');
    } else {
      const assertAction = async () => {
        assert.equal(await page.locator('#objective').innerText(), expectedObjective());
        assert.deepEqual(await primary.evaluateAll(els => els.map(el => el.id)), [actionId]);
        assert.equal(await primary.isDisabled(), false);
        assert.equal(await page.locator('#friend-guide').isVisible(), false);
      };
      await assertAction();
      assert.equal((await beat()).cue, null);
      assert.ok(await primary.evaluate(el => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight));
      assert.ok(await page.locator('#objective').evaluate(el => el.scrollWidth <= el.clientWidth));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const box = await primary.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= page.viewportSize().height, 'next action fits the first screen');
      if (shift) assert.equal(await primary.evaluate(el => getComputedStyle(el).animationName), 'none');
      await page.locator('#pause').click();
      await page.waitForFunction(selector => document.querySelectorAll(selector).length === 0, controls);
      await page.locator('#resume').click();
      await page.waitForFunction(id => document.querySelector(`#${id}`).classList.contains('attention-action'), actionId);
      await page.waitForFunction(t => window.__courtyardBeat().time >= t + 6.2, b.time);
      await assertAction();
      const idle = await read();
      assert.equal(idle.node, hub.node); assert.equal(idle.w, hub.w);
      assert.equal(idle.selected, hub.selected); assert.deepEqual(idle.activated, hub.activated);
      assert.deepEqual((await beat()).used, b.used, 'no third beat after the first return');
      assert.equal(await page.locator('#action-feedback').isVisible(), false);
      await capture('quiet');
      // Banking is still available without displacing the continuing route.
      await page.locator('#interact').click();
      const banked = await read();
      assert.equal(banked.banked, hub.banked + hub.carried); assert.equal(banked.carried, 0);
      await assertAction();
      await page.locator('#risk-mode').click();
      assert.equal(await page.locator('.layer-controls .attention-action').count(), 0);
      assert.equal(await page.locator('#objective').innerText(), (await read()).objective);
      await page.locator('#safe-mode').click();
      await assertAction();
      await page.keyboard.press('h');
      assert.equal(await page.locator('#friend-guide').isVisible(), true);
      assert.equal(await page.locator('.layer-controls .attention-action').count(), 0);
      await page.waitForFunction(() => document.querySelector('#friend-guide').hidden);
      await assertAction();
      if (shift) {
        // Follow the visibly named layer; 390 uses the existing shortcut.
        if (width === 390) await page.keyboard.press(['z', 'x', 'c'][route.layer]);
        else await primary.click();
        const aligned = await read();
        assert.equal(aligned.node, 'hub', 'changing W cannot move the player');
        assert.equal(aligned.w, route.w); assert.equal(aligned.selected, hub.selected);
        assert.deepEqual(aligned.activated, hub.activated);
      }
      assert.deepEqual(await primary.evaluateAll(els => els.map(el => el.id)), ['move']);
      assert.equal(await page.locator('#objective').innerText(), `到${target.name} · 沿桥稳行`);
      assert.equal((await primary.innerText()).replace(/\s+/g, ' '), `到${target.name} ${width <= 480 ? '↗' : 'Space ↗'}`);
      assert.equal(await primary.evaluate(el => { const range = document.createRange(); range.selectNodeContents(el.firstChild); return range.getClientRects().length; }), 1);
      await capture('bridge-ready');
      if (width === 320) {
        const alternate = hub.nodes.find(n => hub.availableNodes.includes(n.id) && n.id !== route.node);
        await page.getByRole('button', { name: `前往${alternate.name}`, exact: true }).click();
        assert.equal((await read()).selected, alternate.id);
        assert.equal(await page.locator('#objective').innerText(), (await read()).objective);
        assert.equal(await page.locator('.layer-controls .attention-action').count(), 0);
        assert.equal((await page.locator('#move').innerText()).replace(/\s+/g, ' '), '稳行 Space ↗');
        // Choosing the suggested destination explicitly still keeps normal controls.
        await page.getByRole('button', { name: `前往${target.name}`, exact: true }).click();
        assert.equal(await page.locator('#objective').innerText(), (await read()).objective);
      }
      await page.locator('#move').click();
      await page.waitForFunction(id => { const s = window.__courtyardSupplyState(); return s.node === id && !s.travel; }, target.id);
      assert.equal(await page.locator('.layer-controls .attention-action').count(), 0);
      assert.equal(await page.locator('#objective').innerText(), (await read()).objective, 'the hub instruction retires on departure');
      assert.deepEqual((await beat()).used, b.used);
      if (target.kind === 'mechanism') {
        assert.equal(await page.locator('#interact.primary-button').count(), 1);
        await page.locator('#interact').click();
        assert.equal((await read()).activated.length, hub.activated.length + 1);
      }
      await capture('followed');
      assert.deepEqual((await beat()).conflicts, []);
      assert.deepEqual((await beat()).powerConflicts, []);
      await page.reload();
      await page.getByRole('button', { name: '选择缓落壳', exact: true }).click();
      assert.equal((await beat()).firstEntry, false);
      assert.equal(await page.locator('.layer-controls .attention-action').count(), 0);
    }
    receipt.checks.push({ width, seed, room, kind, shift, target: target.id, reachedHubMs, steps, passed: true });
    await context.close();
    await writeFile(`${out}/progress.json`, JSON.stringify({ completed: receipt.checks.length, last: { width, room } }, null, 2));
  }
  assert.deepEqual(receipt.errors, []);
  receipt.status = 'passed';
} catch (e) {
  receipt.status = 'failed'; receipt.failure = e.stack; receipt.actual = e.actual; receipt.expected = e.expected; process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile(`${out}/receipt.json`, JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({ status: receipt.status, checks: receipt.checks.length, failure: receipt.failure, out }));
}
