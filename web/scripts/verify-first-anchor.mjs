// First anchor after the named hub crossing, earned through real Flatland discovery.
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
    const controls = '.action-row .primary-button, .action-row .attention-action, .layer-controls .attention-action';
    const primary = page.locator(controls), steps = [];
    const capture = async label => {
      const state = await read(), b = await beat();
      await page.screenshot({ path: `${out}/${width}-${room}-${label}.png`, fullPage: true });
      const step = { label, elapsedMs: Date.now() - startedAt, state, beat: b,
        objective: await page.locator('#objective').innerText(),
        primary: await primary.evaluateAll(els => els.map(el => ({ id: el.id, text: el.textContent, disabled: el.disabled }))) };
      steps.push(step);
      await writeFile(`${out}/${width}-${room}-steps.json`, JSON.stringify(steps, null, 2));
      return step;
    };
    // Setup/closing traversal reads the model's existing route and sends real UI
    // input. The chosen anchor breakpoint below follows the visible CTA only.
    const routeStep = async () => {
      const s = await read(), g = s.companionGuide;
      assert.ok(g, 'there is an authored next step');
      if (!g.aligned) await page.locator(`#layer-${g.layer}`).click();
      else if (g.kind === 'activate') {
        await page.locator('#interact').click();
        await page.waitForTimeout(650); // Existing committed supply delivery.
      } else {
        assert.equal(s.selected, g.node, 'use the route already selected by the game');
        await page.locator('#move').click();
        await page.waitForFunction(() => !window.__courtyardSupplyState().travel);
      }
    };
    const first = await read();
    assert.equal(first.roomId, room);
    if (kind === 'shift') {
      await page.locator(`#layer-${first.companionGuide.layer}`).click();
      await page.locator('#interact').click();
      await page.waitForTimeout(650);
    }
    await page.locator('#move').click();
    await page.waitForFunction(() => { const s = window.__courtyardSupplyState(); return s.node === 'hub' && !s.travel; });
    const hub = await read(), bridge = hub.companionGuide;
    const destination = hub.nodes.find(n => n.id === bridge.node);
    assert.equal(bridge.kind, 'move');
    assert.equal(hub.selected, destination.id);
    if (!bridge.aligned) {
      assert.deepEqual(await primary.evaluateAll(els => els.map(el => el.id)), [`layer-${bridge.layer}`]);
      await primary.click();
    }
    assert.equal(await page.locator('#objective').innerText(), `到${destination.name} · 沿桥稳行`);
    assert.deepEqual(await primary.evaluateAll(els => els.map(el => el.id)), ['move']);
    await primary.click();
    await page.waitForFunction(id => { const s = window.__courtyardSupplyState(); return s.node === id && !s.travel; }, destination.id);
    const landing = await capture('after-hub-crossing');
    assert.ok(landing.elapsedMs < 90000, 'automated first discovery to breakpoint fits 90s, not a human-time claim');
    if (room === 'confluence') {
      // Control: the hub leads straight to a ready source, not a stranded anchor.
      assert.equal(destination.kind, 'mechanism');
      assert.deepEqual(landing.primary.map(p => p.id), ['interact']);
      assert.equal(landing.objective, landing.state.objective);
      await page.locator('#interact').click();
      assert.equal((await read()).activated.length, 2);
      await page.waitForTimeout(650);
    } else {
      const anchor = landing.state, b = landing.beat, route = anchor.companionGuide;
      const target = anchor.nodes.find(n => n.id === route.node);
      assert.equal(anchor.node, 'relay'); assert.equal(route.kind, 'move');
      assert.equal(route.aligned, false); assert.equal(anchor.selected, target.id);
      assert.equal(b.firstEntry, true); assert.equal(b.cue, null);
      assert.equal(anchor.activated.length, room === 'return' ? 1 : 2);
      const actionId = `layer-${route.layer}`;
      const expected = `换到${['Ⅰ', 'Ⅱ', 'Ⅲ'][route.layer]} ${anchor.layers[route.layer].name} · 显现通往${target.name}的桥`;
      const assertAction = async () => {
        assert.equal(await page.locator('#objective').innerText(), expected);
        assert.deepEqual(await primary.evaluateAll(els => els.map(el => el.id)), [actionId]);
        assert.equal(await primary.isDisabled(), false);
        assert.equal(await page.locator('#friend-guide').isVisible(), false);
      };
      if (baseline) {
        assert.equal(landing.objective, anchor.objective);
        assert.match(landing.objective, /已供能待启动/);
        assert.deepEqual(landing.primary, [], 'baseline loses the primary action on the anchor');
        assert.equal(await page.locator('#move').isDisabled(), true);
      } else {
        await assertAction();
        assert.equal(await primary.evaluate(el => getComputedStyle(el).animationName), 'none');
        assert.ok(await primary.evaluate(el => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight));
        assert.ok(await page.locator('#objective').evaluate(el => el.scrollWidth <= el.clientWidth));
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        const box = await primary.boundingBox();
        assert.ok(box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= page.viewportSize().height);
        await page.locator('#pause').click();
        await page.waitForFunction(selector => document.querySelectorAll(selector).length === 0, controls);
        const paused = await read();
        await page.waitForTimeout(250);
        assert.deepEqual(await read(), paused, 'pause freezes the real model');
        await page.locator('#resume').click();
        await page.waitForFunction(id => document.querySelector(`#${id}`).classList.contains('attention-action'), actionId);
        await page.waitForFunction(t => window.__courtyardBeat().time >= t + 6.2, b.time);
        await assertAction();
        const idle = await read();
        for (const key of ['node', 'w', 'selected']) assert.equal(idle[key], anchor[key]);
        assert.deepEqual(idle.activated, anchor.activated);
        assert.deepEqual((await beat()).used, b.used, 'idle adds no beat');
        assert.equal((await beat()).cue, null);
        assert.equal(await page.locator('#action-feedback').isVisible(), false);
        await capture('quiet');
        await page.locator('#risk-mode').click();
        assert.equal(await page.locator('#objective').innerText(), (await read()).objective);
        assert.equal(await page.locator('.layer-controls .attention-action').count(), 0);
        await page.locator('#safe-mode').click();
        await assertAction();
        await page.keyboard.press('h');
        assert.equal(await page.locator('#friend-guide').isVisible(), true);
        assert.equal(await page.locator('#objective').isVisible(), false, 'H owns the visible instruction slot');
        assert.equal(await page.locator('#objective').textContent(), (await read()).objective);
        assert.equal(await page.locator('.layer-controls .attention-action').count(), 0);
        await page.waitForFunction(() => document.querySelector('#friend-guide').hidden);
        await assertAction();
      }
      // Follow the named layer using all existing input forms across viewports.
      if (width === 390) await page.keyboard.press(['z', 'x', 'c'][route.layer]);
      else if (width === 320) await page.locator('#w-slider').evaluate((el, value) => {
        el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
      }, route.w);
      else await page.locator(`#${actionId}`).click();
      const aligned = await read();
      assert.equal(aligned.node, 'relay'); assert.equal(aligned.w, route.w);
      assert.equal(aligned.selected, anchor.selected); assert.deepEqual(aligned.activated, anchor.activated);
      for (const axis of ['x', 'y', 'z']) assert.equal(aligned.nodes.find(n => n.id === 'relay').world[axis], anchor.nodes.find(n => n.id === 'relay').world[axis]);
      const edge = aligned.edges.find(e => e.open && e.visible && ((e.from === 'relay' && e.to === target.id) || (e.to === 'relay' && e.from === target.id)));
      assert.ok(edge && aligned.canMove, 'changing W reveals the actual next bridge');
      if (!baseline) {
        assert.deepEqual(await primary.evaluateAll(els => els.map(el => el.id)), ['move']);
        assert.equal(await page.locator('#objective').innerText(), `到${target.name} · 沿桥稳行`);
        assert.equal((await primary.innerText()).replace(/\s+/g, ' '), `到${target.name} ${width <= 480 ? '↗' : 'Space ↗'}`);
        assert.equal(await primary.evaluate(el => { const range = document.createRange(); range.selectNodeContents(el.firstChild); return range.getClientRects().length; }), 1);
        assert.ok(await primary.evaluate(el => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight));
      }
      await capture('bridge-ready');
      if (!baseline && width === 320) {
        await page.getByRole('button', { name: '前往归响台', exact: true }).click();
        assert.equal((await read()).selected, 'hub');
        assert.equal(await page.locator('#objective').innerText(), (await read()).objective);
        assert.equal(await page.locator('.layer-controls .attention-action').count(), 0);
        assert.equal((await page.locator('#move').innerText()).replace(/\s+/g, ' '), '稳行 Space ↗');
        await page.getByRole('button', { name: `前往${target.name}`, exact: true }).click();
        assert.equal(await page.locator('#objective').innerText(), (await read()).objective, 'deliberate selection retains normal controls');
      }
      await page.locator('#move').click();
      assert.equal(await page.locator('.layer-controls .attention-action').count(), 0);
      await page.waitForFunction(id => { const s = window.__courtyardSupplyState(); return s.node === id && !s.travel; }, target.id);
      assert.equal(await page.locator('#objective').innerText(), (await read()).objective, 'anchor handoff ends at the next mechanism');
      assert.deepEqual(await primary.evaluateAll(els => els.map(el => el.id)), ['interact']);
      assert.equal(await primary.isDisabled(), false);
      await capture('ready-to-activate');
      await page.keyboard.press('e');
      assert.equal((await read()).activated.length, anchor.activated.length + 1);
      assert.deepEqual((await beat()).used, b.used, 'layer change, crossing and E add no third beat');
      await page.waitForTimeout(650);
    }
    // Finish the authored chain, including the completion handoff to the gate.
    let completeAnchor = false;
    for (let index = 0; index < 18 && (await read()).phase === 'playing'; index++) {
      const s = await read();
      if (s.activated.length === 3 && s.node === 'relay') {
        completeAnchor = true;
        if (baseline) {
          assert.equal(await page.locator('.layer-controls .attention-action').count(), 0);
          assert.equal(await page.locator('#objective').innerText(), s.objective);
        } else {
          const g = s.companionGuide, target = s.nodes.find(n => n.id === g.node);
          assert.deepEqual(await primary.evaluateAll(els => els.map(el => el.id)), [g.aligned ? 'move' : `layer-${g.layer}`]);
          assert.equal(await primary.isDisabled(), false);
          assert.equal(await page.locator('#objective').innerText(), g.aligned ? `到${target.name} · 沿桥稳行`
            : `换到${'ⅠⅡⅢ'[g.layer]} ${s.layers[g.layer].name} · 显现通往${target.name}的桥`);
        }
        await capture('three-complete-anchor');
      }
      await routeStep();
    }
    const finished = await read();
    assert.equal(finished.node, 'exit'); assert.equal(finished.activated.length, 3);
    assert.equal(finished.phase, 'interlude'); assert.equal(completeAnchor, true);
    assert.equal(finished.carried, 0); assert.ok(finished.banked > 0, 'the existing courtyard exit banks the run');
    assert.equal(await page.locator('#choice-dialog.discovery-choice').count(), 0);
    await capture('courtyard-complete');
    assert.deepEqual((await beat()).conflicts, []); assert.deepEqual((await beat()).powerConflicts, []);
    await page.getByRole('button', { name: '选择缓落壳', exact: true }).click();
    await page.waitForFunction(() => window.__courtyardBeat().firstEntry === false);
    assert.equal((await read()).room, 1); assert.equal((await beat()).firstEntry, false);
    assert.equal(await page.locator('.layer-controls .attention-action').count(), 0);
    await page.reload();
    await page.getByRole('button', { name: '选择缓落壳', exact: true }).click();
    assert.equal((await beat()).firstEntry, false);
    assert.equal(await page.locator('.layer-controls .attention-action').count(), 0);
    receipt.checks.push({ width, seed, room, control: room === 'confluence', steps, passed: true });
    await context.close();
    await writeFile(`${out}/progress.json`, JSON.stringify({ completed: receipt.checks.length, last: { width, room } }, null, 2));
  }
  assert.deepEqual(receipt.errors, []); receipt.status = 'passed';
} catch (e) {
  receipt.status = 'failed'; receipt.failure = e.stack; receipt.actual = e.actual; receipt.expected = e.expected; process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile(`${out}/receipt.json`, JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({ status: receipt.status, checks: receipt.checks.length, failure: receipt.failure, out }));
}
