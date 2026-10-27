// A fresh, actually earned discovery entry for every authored first room/width.
// BASELINE=1 records the old generic instruction without changing the journey.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { courtyardBeatObserver } from './courtyard-first-beat.mjs';

const base = process.env.BASE_URL || 'http://127.0.0.1:4173';
const out = process.env.ARTIFACT_DIR;
assert.ok(out, 'use a fresh explicit artifact directory');
await mkdir(out, { recursive: true });
const baseline = process.env.BASELINE === '1';
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
      await route.fulfill({ response, body: await response.text() + courtyardBeatObserver });
    });
    const page = await context.newPage();
    page.on('pageerror', e => receipt.errors.push({ width, seed, message: e.message }));
    page.on('console', m => { if (['error', 'warning'].includes(m.type())) receipt.errors.push({ width, seed, message: m.text() }); });
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
    assert.equal(state.roomId, room); assert.equal(guide.kind, kind);
    assert.equal(state.activated.length, 1); assert.equal((await beat()).firstEntry, true);
    const target = state.nodes.find(n => n.id === guide.node);
    const controls = '.action-row .primary-button, .action-row .attention-action, .layer-controls .attention-action';
    const primary = page.locator(controls);
    const before = { state, beat: await beat(), objective: await page.locator('#objective').innerText(), primary: await primary.evaluateAll(els => els.map(el => el.id)) };
    const shot = name => page.screenshot({ path: `${out}/${width}-${room}-${name}.png`, fullPage: true });
    await shot('handoff');
    if (baseline) {
      assert.match(before.objective, /观察供能槽，切层或沿桥前往下一处机关/);
      assert.deepEqual(before.primary, ['move']);
    } else {
      assert.ok(before.objective.includes(target.name));
      assert.deepEqual(before.primary, [kind === 'shift' ? `layer-${guide.layer}` : 'move']);
      assert.equal(await page.locator('#friend-guide').isVisible(), false);
      assert.equal((await beat()).cue, null, 'persistent controls do not create a third beat');
      assert.equal(await primary.isDisabled(), false);
      assert.ok(await primary.evaluate(el => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight));
      assert.ok(await page.locator('#objective').evaluate(el => el.scrollWidth <= el.clientWidth));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (kind === 'shift') {
        assert.match(before.objective, /原地换到/);
        assert.equal(await primary.evaluate(el => getComputedStyle(el).animationName), 'none', 'layer handoff is static');
      } else {
        assert.ok((await primary.innerText()).includes(`稳行到${target.name}`));
        assert.equal(await primary.evaluate(el => { const range = document.createRange(); range.selectNodeContents(el.firstChild); return range.getClientRects().length; }), 1, 'the destination name stays on one line');
      }
      const actionId = await primary.getAttribute('id');
      const keys = (await beat()).used;
      await page.locator('#pause').click();
      await page.waitForFunction(selector => document.querySelectorAll(selector).length === 0, controls);
      assert.equal(await primary.count(), 0, 'pause removes actionable emphasis');
      await page.locator('#resume').click();
      await page.waitForFunction(({ selector, id }) => document.querySelector(selector)?.id === id, { selector: controls, id: actionId });
      assert.equal(await primary.getAttribute('id'), actionId);
      await page.waitForFunction(t => window.__courtyardBeat().time >= t + 6.2, before.beat.time);
      assert.deepEqual((await beat()).used, keys, 'idle never adds a third beat');
      assert.equal((await read()).node, state.node); assert.equal((await read()).w, state.w);
      assert.deepEqual((await read()).activated, state.activated, 'the handoff cannot move, shift or activate');
      assert.equal(await page.locator('#friend-guide').isVisible(), false);
      assert.equal(await page.locator('#action-feedback').isVisible(), false);
      assert.equal(await primary.getAttribute('id'), actionId);
      await shot('quiet');
      // Risk and explicit help own their channels; neither gains another beat.
      await page.locator('#risk-mode').click();
      assert.equal(await page.locator('.layer-controls .attention-action').count(), 0);
      assert.doesNotMatch(await page.locator('#objective').innerText(), /原地换到|沿桥稳行/);
      await page.locator('#safe-mode').click();
      assert.equal(await primary.getAttribute('id'), actionId);
      await page.keyboard.press('h');
      assert.equal(await page.locator('#friend-guide').isVisible(), true);
      assert.equal(await page.locator('.layer-controls .attention-action').count(), 0);
      if (width === 320 && room === 'split') {
        await page.getByRole('button', { name: '前往归响台', exact: true }).click();
        assert.equal(await page.locator('.layer-controls .attention-action').count(), 0);
        assert.equal(await page.locator('#move.primary-button').count(), 1);
        assert.equal((await page.locator('#move').innerText()).replace(/\s+/g, ' '), '稳行 Space ↗', 'explicit selection retires the handoff copy');
        await page.locator('#move').click();
        await page.waitForFunction(() => { const s = window.__courtyardSupplyState(); return s.node === 'hub' && !s.travel; });
      } else {
        await page.waitForFunction(() => document.querySelector('#friend-guide').hidden);
        assert.equal(await primary.getAttribute('id'), actionId);
        // Follow exactly the control the handoff names; no route-finding helper.
        if (width === 390 && kind === 'shift') await page.keyboard.press(['z', 'x', 'c'][guide.layer]);
        else await primary.click();
        await page.waitForFunction(id => { const s = window.__courtyardSupplyState(); return s.node === id && !s.travel; }, guide.node);
        const followed = await read();
        if (kind === 'shift') {
          for (const axis of ['x', 'y', 'z']) assert.equal(followed.nodes.find(n => n.id === followed.node).world[axis], state.nodes.find(n => n.id === state.node).world[axis], 'the named layer reveals a real co-located mechanism');
          assert.notEqual(followed.w, state.w, 'only the fourth coordinate changes');
          assert.equal(await page.locator('#interact.primary-button').count(), 1);
          await page.locator('#interact').click();
          assert.equal((await read()).activated.length, 2);
        }
        assert.deepEqual((await beat()).used, keys, 'following the handoff adds no third beat');
        before.followed = { node: followed.node, w: followed.w, activated: (await read()).activated };
      }
      assert.equal(await page.locator('.layer-controls .attention-action').count(), 0);
      assert.doesNotMatch(await page.locator('#objective').innerText(), /原地换到|沿桥稳行/);
      await shot('followed');
      await page.reload();
      await page.getByRole('button', { name: '选择缓落壳', exact: true }).click();
      assert.equal((await beat()).firstEntry, false);
      assert.equal(await page.locator('.layer-controls .attention-action').count(), 0);
    }
    receipt.checks.push({ width, seed, room, kind, before, passed: true });
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
