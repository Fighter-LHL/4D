// Local feedback and pointer-to-keyboard handoff after real Flatland discovery.
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
const receipt = { baseline, widths, base, status: 'started', checks: [], errors: [] };
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
    const steps = [];
    const capture = async label => {
      const ui = await page.evaluate(() => ({
        focus: document.activeElement.id,
        text: Object.fromEntries(['objective', 'scene-state', 'action-feedback', 'move', 'interact', 'announcement'].map(id => [id, document.getElementById(id).textContent])),
        popupVisible: !document.getElementById('action-feedback').hidden,
      }));
      steps.push({ label, elapsedMs: Date.now() - startedAt, state: await read(), beat: await beat(), ui });
      await page.screenshot({ path: `${out}/${width}-${room}-${label}.png`, fullPage: true });
      await writeFile(`${out}/${width}-${room}-steps.json`, JSON.stringify(steps, null, 2));
      return steps.at(-1);
    };
    const popupFits = async () => {
      assert.ok(await page.locator('#action-feedback').evaluate(el => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight));
      const box = await page.locator('#action-feedback').boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= page.viewportSize().height);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    };
    await page.waitForFunction(() => window.__courtyardBeat().cue?.beat === 'arrival');
    assert.equal((await read()).roomId, room);
    await page.keyboard.press('e');
    const early = await capture('early-e');
    assert.match(early.ui.text['action-feedback'], /没有回响/);
    assert.equal(early.ui.popupVisible, true);
    await popupFits();
    if (!baseline) assert.notEqual(early.ui.text['scene-state'], early.ui.text['action-feedback'], 'one DOM result surface');
    await page.locator('#move').click();
    const crossing = await capture('crossing');
    assert.ok(crossing.state.travel, 'actual accepted crossing');
    if (baseline) {
      assert.equal(crossing.ui.popupVisible, true);
      assert.equal(crossing.ui.text['action-feedback'], early.ui.text['action-feedback']);
    } else {
      assert.equal(crossing.ui.popupVisible, false, 'accepted departure retires the old local E message');
      assert.equal(crossing.ui.text['action-feedback'], '');
      assert.equal(crossing.ui.text['scene-state'], '沿当前切片前进');
      assert.equal(crossing.ui.text.announcement, '');
    }
    await page.waitForFunction(() => !window.__courtyardSupplyState().travel);
    if (!baseline) assert.equal(await page.locator('#action-feedback').isVisible(), false, 'old hub instruction is absent on the ready source');
    await page.waitForFunction(() => window.__courtyardBeat().cue?.beat === 'mechanism');
    await page.locator('#interact').click();
    const active = await capture('activated');
    assert.equal(active.state.activated.length, 1);
    assert.equal(active.ui.popupVisible, true);
    assert.match(active.ui.text['action-feedback'], /已启动 · 1\/3/);
    assert.equal(active.ui.text.announcement, active.ui.text['action-feedback'], 'accessible result is retained');
    await popupFits();
    assert.equal(active.ui.focus, baseline ? 'interact' : 'w-slider');
    if (baseline) assert.equal(active.ui.text['scene-state'], active.ui.text['action-feedback']);
    else {
      const node = active.state.nodes.find(n => n.id === active.state.node);
      assert.equal(active.ui.text['scene-state'], `${node.name} · ${active.state.layers[active.state.layer].name}`);
    }
    await page.waitForFunction(() => { const b = window.__courtyardBeat(); return b.used.includes('mechanism-follow') && !b.cue; });
    const settled = await capture('settled');
    assert.equal(settled.state.companionGuide.kind, kind);
    const used = settled.beat.used;
    if (kind === 'shift') {
      const route = settled.state.companionGuide;
      assert.equal(await page.locator(`#layer-${route.layer}.attention-action`).count(), 1);
      await page.locator(`#layer-${route.layer}`).click();
      // Deliberately keyboard-focused activation still uses native Space.
      await page.locator('#interact').focus();
      await page.keyboard.press('Space');
      assert.equal((await read()).activated.length, 2);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'interact');
      await page.waitForTimeout(650);
      await capture('keyboard-activation');
      await page.locator('#w-slider').focus();
    }
    await page.keyboard.press('Space');
    const afterSpace = await capture('space');
    if (baseline && kind === 'move') {
      assert.equal(afterSpace.state.travel, null, 'baseline Space re-clicks completed E');
      assert.equal(afterSpace.ui.focus, 'interact');
      assert.equal(afterSpace.state.node, settled.state.node);
      await page.locator('#move').click();
    } else {
      assert.ok(afterSpace.state.travel, 'Space starts the offered return crossing');
      assert.equal(afterSpace.state.travel.to, 'hub');
      if (kind === 'shift') {
        assert.equal(afterSpace.ui.popupVisible, true, 'remote supply remains relevant after departure');
        assert.match(afterSpace.ui.text['action-feedback'], /供能到齐/);
        assert.equal(afterSpace.beat.events.at(-1).type, 'power');
        assert.equal(afterSpace.beat.events.at(-1).complete, true);
      } else assert.equal(afterSpace.ui.popupVisible, false, 'local activation message retires on departure');
      assert.equal(afterSpace.ui.text['scene-state'], '沿当前切片前进');
    }
    await page.waitForFunction(() => { const s = window.__courtyardSupplyState(); return s.node === 'hub' && !s.travel; });
    assert.deepEqual((await beat()).used, used, 'no third beat');
    // Banking is a different action: a pointer click keeps its button focus.
    await page.locator('#interact').click();
    assert.equal(await page.evaluate(() => document.activeElement.id), 'interact');
    assert.ok((await read()).banked > 0);
    // A blocked pointer E also keeps focus and continues to explain the failure.
    await page.locator('#interact').click();
    assert.equal(await page.evaluate(() => document.activeElement.id), 'interact');
    assert.match(await page.locator('#action-feedback').innerText(), /没有回响/);
    const beforeRejected = await page.locator('#action-feedback').innerText();
    const hub = await read(), wrongLayer = (hub.companionGuide.layer + 1) % 3;
    await page.locator(`#layer-${wrongLayer}`).click();
    await page.locator('#w-slider').focus();
    await page.keyboard.press('Space');
    assert.equal((await read()).travel, null, 'off-layer crossing is rejected');
    assert.equal(await page.locator('#action-feedback').innerText(), beforeRejected, 'rejected move does not erase useful feedback');
    assert.deepEqual((await beat()).conflicts, []);
    const done = await capture('blocked-controls');
    assert.ok(done.elapsedMs < 90000, 'scripted first session under 90s, not a human comprehension claim');
    receipt.checks.push({ width, seed, room, elapsedMs: done.elapsedMs, stages: steps.map(s => s.label) });
    console.log(`PASS ${width} ${room}${baseline ? ' baseline reproduction' : ''}`);
    await context.close();
  }
  assert.deepEqual(receipt.errors, []);
  receipt.status = 'PASS';
} catch (error) {
  receipt.status = 'FAIL'; receipt.failure = error.stack; throw error;
} finally {
  await writeFile(`${out}/receipt.json`, JSON.stringify(receipt, null, 2));
  await browser.close();
}
