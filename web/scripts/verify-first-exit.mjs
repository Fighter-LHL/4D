// First courtyard completion, earned through real discovery and ordinary UI input.
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
  for (const width of widths) for (const [seed, room] of [[10, 'cascade'], [0, 'split'], [2, 'confluence'], [7, 'return']]) {
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
    // Setup reads the model's route and sends real UI input. The completed
    // courtyard below follows the visible controls, without changing authority.
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
    assert.equal((await read()).roomId, room);
    for (let i = 0; i < 18 && (await read()).activated.length < 3; i++) await routeStep();
    assert.equal((await read()).activated.length, 3, 'all three mechanisms activated through UI');
    await page.waitForTimeout(3000); // Let the existing unlock feedback finish.
    const used = (await beat()).used;
    const routeStates = [];
    let expectedBank;
    for (let index = 0; index < 8 && (await read()).phase === 'playing'; index++) {
      const s = await read(), g = s.companionGuide;
      assert.equal(g.kind, 'move');
      assert.equal(s.selected, g.node, 'follow the existing authored route');
      const target = s.nodes.find(n => n.id === g.node);
      const before = await capture(`exit-${index}-${s.node}`);
      routeStates.push({ node: s.node, target: target.id, aligned: g.aligned, primary: before.primary });
      if (baseline) {
        assert.equal(before.objective, s.objective, 'baseline names no next departure');
        assert.equal(await page.locator('.layer-controls .attention-action').count(), 0);
      } else {
        const expected = g.aligned ? 'move' : `layer-${g.layer}`;
        assert.deepEqual(before.primary.map(p => p.id), [expected], 'one available next action');
        assert.equal(before.primary[0].disabled, false);
        assert.equal(before.objective, g.aligned ? `到${target.name} · 沿桥稳行`
          : `换到${'ⅠⅡⅢ'[g.layer]} ${s.layers[g.layer].name} · 显现通往${target.name}的桥`);
        for (const id of ['objective', expected]) {
          assert.ok(await page.locator(`#${id}`).evaluate(el => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight), `${id} fits`);
        }
        const box = await primary.boundingBox();
        assert.ok(box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= page.viewportSize().height, 'primary action fits first screen');
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        if (g.aligned) {
          assert.equal((await page.locator('#move').innerText()).split(/\s+/)[0], `到${target.name}`);
          assert.ok(await page.locator('#move').evaluate(el => {
            const range = document.createRange(); range.selectNode(el.firstChild);
            return range.getClientRects().length === 1;
          }), 'destination stays on one line');
        }
      }
      if (!g.aligned) {
        if (baseline) await page.locator(`#layer-${g.layer}`).click();
        else if (width === 390) await page.keyboard.press(['z', 'x', 'c'][g.layer]);
        else if (width === 320) {
          await page.locator('#w-slider').evaluate((el, value) => { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); }, s.layers[g.layer].center);
        } else await primary.click();
        const aligned = await read();
        assert.equal(aligned.node, s.node, 'changing W does not move the player');
        assert.equal(aligned.selected, s.selected);
        assert.deepEqual(aligned.activated, s.activated);
        assert.ok(aligned.canMove);
        if (!baseline) {
          assert.deepEqual(await primary.evaluateAll(els => els.map(el => el.id)), ['move']);
          assert.equal(await page.locator('#objective').innerText(), `到${target.name} · 沿桥稳行`);
        }
        await capture(`bridge-${index}-${s.node}`);
      }
      if (index === 0) {
        const frozen = await read();
        await page.waitForTimeout(6200);
        const idle = await read();
        for (const key of ['node', 'w', 'selected', 'activated', 'carried', 'banked']) assert.deepEqual(idle[key], frozen[key], `idle preserves ${key}`);
        assert.deepEqual((await beat()).used, used, 'no extra beat while idle');
        assert.equal((await beat()).cue, null);
        await page.locator('#pause').click();
        await page.waitForFunction(selector => document.querySelectorAll(selector).length === 0, controls);
        assert.equal(await primary.count(), 0, 'pause withdraws the primary action');
        const time = (await beat()).time;
        await page.waitForTimeout(250);
        assert.equal((await beat()).time, time);
        await page.locator('#resume').click();
        if (!baseline) {
          await page.waitForFunction(() => document.querySelector('#move').classList.contains('attention-action'));
          await page.locator('#risk-mode').click();
          assert.equal(await page.locator('#objective').innerText(), (await read()).objective, 'risk retains ordinary controls');
          assert.equal(await page.locator('.layer-controls .attention-action').count(), 0);
          await page.locator('#safe-mode').click();
          assert.equal(await page.locator('#objective').innerText(), `到${target.name} · 沿桥稳行`);
          await page.keyboard.press('h');
          assert.equal(await page.locator('#friend-guide').isVisible(), true);
          assert.equal(await page.locator('#objective').isVisible(), false, 'H owns the instruction');
          assert.equal(await page.locator('.layer-controls .attention-action').count(), 0);
          await page.waitForFunction(() => document.querySelector('#friend-guide').hidden);
          assert.equal(await page.locator('#objective').innerText(), `到${target.name} · 沿桥稳行`);
        }
        await capture('quiet-after-boundaries');
      }
      if (!baseline && index > 0 && width === 320) {
        const alternate = s.availableNodes.find(id => id !== target.id);
        if (alternate) {
          const other = s.nodes.find(n => n.id === alternate);
          await page.getByRole('button', { name: `前往${other.name}`, exact: true }).click();
          assert.equal((await read()).selected, alternate);
          assert.equal(await page.locator('#objective').innerText(), (await read()).objective);
          assert.equal(await page.locator('.layer-controls .attention-action').count(), 0);
          await page.getByRole('button', { name: `前往${target.name}`, exact: true }).click();
          assert.equal(await page.locator('#objective').innerText(), (await read()).objective, 'explicit re-selection stays ordinary');
          assert.equal((await page.locator('#move').innerText()).replace(/\s+/g, ' '), '稳行 Space ↗');
          assert.equal((await read()).node, s.node, 'preview does not move');
        }
      }
      if (target.id === 'exit') expectedBank = s.banked + s.carried + 1; // First safe gate crossing earns one.
      // Once offered, the real button or Space must actually reach that node.
      if (width === 390) {
        await page.locator('#w-slider').focus();
        await page.keyboard.press('Space');
      } else await page.locator('#move').click();
      assert.ok((await read()).travel);
      assert.equal(await primary.count(), 0, 'no departure instruction during travel');
      await page.waitForFunction(id => { const s = window.__courtyardSupplyState(); return !s.travel && s.node === id; }, target.id);
    }
    const finished = await read();
    assert.equal(finished.phase, 'interlude');
    assert.equal(finished.node, 'exit');
    assert.equal(finished.carried, 0); assert.equal(finished.banked, expectedBank, 'gate banks all carried echoes plus the real crossing reward');
    assert.equal(await page.locator('#choice-dialog.discovery-choice').count(), 0);
    assert.equal(await page.locator('#relic-choices button:visible').count(), finished.choices.length);
    assert.deepEqual((await beat()).used, used, 'finishing the courtyard adds no third beat');
    await capture('courtyard-complete');
    await page.getByRole('button', { name: '选择缓落壳', exact: true }).click();
    await page.waitForFunction(() => window.__courtyardBeat().firstEntry === false);
    const next = await read();
    assert.equal(next.room, 1); assert.equal(next.banked, finished.banked);
    assert.equal(next.relics.shell, 2, 'existing relic upgrades normally');
    assert.equal(await page.locator('#objective').innerText(), next.objective);
    await capture('next-courtyard');
    // Completing mechanisms in the next room must not re-arm first-entry UI.
    for (let i = 0; i < 20 && (await read()).activated.length < 3; i++) await routeStep();
    assert.equal((await read()).activated.length, 3);
    assert.equal((await beat()).firstEntry, false);
    assert.equal(await page.locator('#objective').innerText(), (await read()).objective);
    assert.equal(await page.locator('.layer-controls .attention-action').count(), 0);
    await capture('next-three-complete');
    assert.deepEqual((await beat()).conflicts, []);
    assert.deepEqual((await beat()).powerConflicts, []);
    await page.reload();
    await page.getByRole('button', { name: '选择缓落壳', exact: true }).click();
    assert.equal((await beat()).firstEntry, false, 'revisit keeps ordinary UI');
    // Ordinary entry briefly shows requested companion help over the objective.
    assert.equal(await page.locator('#objective').textContent(), (await read()).objective);
    receipt.checks.push({ width, seed, room, routeStates, banked: finished.banked, passed: true });
    console.log(`PASS ${width} ${room}${baseline ? ' baseline' : ''}`);
    await context.close();
  }
  assert.deepEqual(receipt.errors, []); receipt.status = 'passed';
} catch (e) {
  receipt.status = 'failed'; receipt.failure = e.stack; receipt.actual = e.actual; receipt.expected = e.expected; process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile(`${out}/receipt.json`, JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({ status: receipt.status, checks: receipt.checks.length, failure: receipt.failure, out }));
}
