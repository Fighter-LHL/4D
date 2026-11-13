// Optional local Playwright check. Isolated profiles, no storage preload or model writes.
// Instrumentation only copies snapshots/events and observes actual oscillator starts.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { courtyardFlowObserver, chooseDiscoveryStarter, followGuidance, readFlow, waitSettled, resolveCourtyardViewports } from './courtyard-first-beat.mjs';

const { chromium } = await import('playwright').catch(() => createRequire(import.meta.url)('playwright'));

const baseURL = process.env.BASE_URL || 'http://127.0.0.1:4173';
const out = process.env.ARTIFACT_DIR || fileURLToPath(new URL(`../artifacts/play-fun-top5-20261027/browser-${Date.now()}/`, import.meta.url));
await mkdir(out, { recursive: true });
const viewports = resolveCourtyardViewports().map(vp => ({
  ...vp,
  muted: Boolean(vp.reducedMotion),
}));
const receipt = { status: 'started', baseURL, viewports, checks: [], errors: [], instrumentation: 'read-only snapshot/event observer; Web Audio start observer; real range/pointer/key inputs' };
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
receipt.browserVersion = browser.version();
try {
  for (const vp of viewports) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      hasTouch: vp.hasTouch,
      isMobile: vp.isMobile,
      reducedMotion: vp.reducedMotion ? 'reduce' : 'no-preference',
    });
    await context.addInitScript(() => { try { localStorage.setItem('wslice-theater', 'classic'); } catch {} });
    await context.addInitScript(() => {
      window.__top5Labels = [];
      window.__top5EchoBounds = [];
      window.__top5EchoPaint = [];
      for (const method of ['fill', 'stroke']) {
        const original = CanvasRenderingContext2D.prototype[method];
        CanvasRenderingContext2D.prototype[method] = function (...args) {
          if (window.__top5DrawingEcho) {
            const t = this.getTransform();
            window.__top5EchoPaint.push({ method, alpha: this.globalAlpha, color: String(this[method + 'Style']), strokePx: this.lineWidth * t.a / (devicePixelRatio || 1) });
          }
          return original.apply(this, args);
        };
      }
      const ellipse = CanvasRenderingContext2D.prototype.ellipse;
      CanvasRenderingContext2D.prototype.ellipse = function (x, y, rx, ry, ...rest) {
        if (window.__top5DrawingEcho) {
          const t = this.getTransform(), dpr = devicePixelRatio || 1;
          window.__top5EchoBounds.push({ bottom: (t.d * (y + ry + this.lineWidth / 2) + t.f) / dpr });
        }
        return ellipse.call(this, x, y, rx, ry, ...rest);
      };
      const fillText = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (text, x, y, ...rest) {
        if (/^(收下花种|跳跳跟上来了|花苞醒了|走到光环边|S .*s$)/.test(text)) {
          const t = this.getTransform(), m = this.measureText(text), dpr = devicePixelRatio || 1;
          const baseline = (t.b * x + t.d * y + t.f) / dpr;
          window.__top5Labels.push({ text, baseline, top: baseline - t.d * m.actualBoundingBoxAscent / dpr,
            bottom: baseline + t.d * m.actualBoundingBoxDescent / dpr });
        }
        return fillText.call(this, text, x, y, ...rest);
      };
      window.__top5Notes = [];
      const proto = (window.AudioContext || window.webkitAudioContext).prototype;
      const create = proto.createOscillator;
      proto.createOscillator = function (...args) {
        const osc = create.apply(this, args), start = osc.start, setFrequency = osc.frequency.setValueAtTime;
        let frequency = osc.frequency.value;
        osc.frequency.setValueAtTime = function (...values) { frequency = values[0]; return setFrequency.apply(this, values); };
        osc.start = function (...times) { window.__top5Notes.push({ frequency, at: times[0] }); return start.apply(this, times); };
        return osc;
      };
    });
    await context.route('**/src/flatland/main.js', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: await response.text() + `
window.__top5Events = [];
window.__top5Near = [];
window.__top5CueConflicts = [];
const top5Push = scene.pushEvents.bind(scene);
scene.pushEvents = events => {
  window.__top5Events.push(...structuredClone(events));
  for (const event of events.filter(e => e.type === 'discovery_near')) {
    window.__top5Near.push({ key: event.key, time: model.time, duringArrival: visitorCues.arrivalActive(model.snapshot()) });
  }
  top5Push(events);
};
const top5Render = scene.render.bind(scene);
const top5Echo = scene.drawDiscoveryEchoes.bind(scene);
scene.drawDiscoveryEchoes = k => {
  window.__top5DrawingEcho = true;
  try { top5Echo(k); } catch (error) { throw new Error(error.message + JSON.stringify({ k, view: scene.view, echoes: scene.discoveryEchoes })); } finally { window.__top5DrawingEcho = false; }
};
scene.render = dt => {
  window.__top5Labels = [];
  window.__top5EchoBounds = [];
  window.__top5EchoPaint = [];
  top5Render(dt);
  const arrival = document.querySelector('#visitor-goal').textContent.includes('墙那边有动静');
  const announcedNear = window.__top5Events.some(e => e.type === 'discovery_near' && e.text === document.querySelector('#announcement').textContent);
  if (arrival && (scene.popups.some(p => p.near) || announcedNear)) window.__top5CueConflicts.push({ time: model.time });
};
window.__top5Read = () => structuredClone({ state: model.snapshot(), popups: scene.popups, echoes: scene.discoveryEchoes, echoBounds: window.__top5EchoBounds, echoPaint: window.__top5EchoPaint, view: scene.view, reduced: scene.reducedMotion, audioState: audio.context?.state, labels: window.__top5Labels });
` });
    });
    await context.route('**/src/main.js', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: await response.text() + `
window.__top5EntryConflicts = [];
const top5CourtyardRender = scene.render.bind(scene);
scene.render = dt => {
  if (scene.state?.courtyardMomentum && scene.state?.companionGuide) window.__top5EntryConflicts.push(model.time);
  top5CourtyardRender(dt);
};
window.__top5Courtyard = () => ({ time: model.time, settled: guide.settled, friends: scene.friends.length, cue: scene.state?.courtyardMomentum, used: [...momentum.used] });
${courtyardFlowObserver}
` });
    });
    const page = await context.newPage();
    page.on('pageerror', error => receipt.errors.push({ viewport: vp.key, message: error.message, stack: error.stack }));
    page.on('console', message => { if (['error', 'warning'].includes(message.type())) receipt.errors.push({ viewport: vp.key, message: message.text() }); });
    const read = () => page.evaluate(() => window.__top5Read());
    const ready = () => page.waitForFunction(() => window.__top5Read?.().view);
    const screenshot = name => page.screenshot({ path: `${out}/${vp.key}-${name}.png`, fullPage: true });
    const afterglowAt1500 = async name => {
      await page.waitForFunction(() => window.__top5Read().echoes[0]?.age >= 1.5);
      const echo = await read();
      assert.ok(echo.echoes[0].age < 1.65, 'sample near 1.5 seconds');
      assert.ok(echo.echoPaint[0].alpha >= .32 - .001, 'warm fill still held at 1.5 seconds');
      const rim = echo.echoPaint.find(p => p.method === 'stroke');
      assert.ok(rim.alpha >= .85 - .001); assert.equal(rim.color.toLowerCase(), '#d4a04a');
      assert.ok(rim.strokePx >= 3 - .001);
      await screenshot(name + '-afterglow-1500ms');
      return { age: echo.echoes[0].age, paint: echo.echoPaint };
    };
    const slice = async value => {
      // DOM range input uses the same input/change handlers as dragging the slider.
      await page.locator('#s-slider').evaluate((el, value) => { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, value);
      await page.waitForFunction(value => Math.abs(window.__top5Read().state.s - value) < .02, value);
    };
    const go = async (x, y) => {
      await page.locator('#scene').scrollIntoViewIfNeeded();
      const { view } = await read(), box = await page.locator('#scene').boundingBox();
      await page.mouse.move(box.x + view.main.ox + x * view.main.scale, box.y + view.main.oy + y * view.main.scale);
      await page.mouse.down();
      try { await page.waitForFunction(({ x, y }) => { const p = window.__top5Read().state.player; return Math.hypot(p.x - x, p.y - y) < .22; }, { x, y }, { timeout: 8000 }); }
      finally { await page.mouse.up(); }
    };
    await page.goto(`${baseURL}/flatland.html?play=explore&seed=42`); await ready();
    assert.equal(await page.locator('#title').innerText(), '越墙');
    assert.match(await page.locator('#levels [aria-current=true]').innerText(), /越墙/);
    assert.equal(await page.locator('#garden-count').innerText(), '0/6');
    assert.equal(await page.locator('#garden-petals').innerText(), '0/3');
    await screenshot('arrival');
    await page.waitForFunction(() => window.__top5Read().state.time >= 4.2);
    assert.equal((await page.evaluate(() => window.__top5Events)).some(e => e.type === 'discovery_near'), false,
      'standing on the starting slice stays quiet even after narration ends');
    assert.deepEqual((await read()).echoes, [], 'standing still cannot trigger a discovery echo');
    await screenshot('idle-after-arrival');
    await slice(4.7);
    await page.waitForFunction(() => window.__top5Read().state.time >= 5);
    assert.equal((await read()).state.encounter.visible, true);
    assert.equal((await page.evaluate(() => window.__top5Events)).some(e => e.type === 'discovery_near'), false,
      'even a visible friend needs a step closer from the spawn point');
    await screenshot('visible-idle-after-arrival');
    // Replay through real controls, deliberately approaching a visible friend during narration.
    await page.keyboard.press('r'); await slice(4.7);
    await go(9.7, 5);
    const approached = (await read()).state;
    assert.ok(Math.hypot(approached.player.x - approached.encounter.x, approached.player.y - approached.encounter.y) < 1.35);
    assert.equal(approached.encounter.step, 0, 'approach cue does not need to advance the chase');
    await page.waitForFunction(() => window.__top5Read().state.time >= 1);
    assert.equal((await read()).state.encounter.visible, true);
    assert.match(await page.locator('#visitor-goal').innerText(), /墙那边有动静/);
    assert.equal((await page.evaluate(() => window.__top5Events)).some(e => e.type === 'discovery_near'), false);
    assert.equal(await page.locator('#announcement').innerText(), '');
    await screenshot('arrival-visible-friend');
    await page.locator('#pause').click();
    const arrivalPausedAt = (await read()).state.time;
    await page.waitForTimeout(250);
    assert.equal((await read()).state.time, arrivalPausedAt);
    assert.match(await page.locator('#visitor-goal').innerText(), /墙那边有动静/);
    await page.locator('#resume').click();
    await page.waitForFunction(() => window.__top5Read().popups.some(p => p.near));
    const approach = await read(), approachPopup = approach.popups.find(p => p.near);
    const nearEvents = await page.evaluate(() => window.__top5Near);
    assert.equal(nearEvents.length, 1);
    assert.equal(nearEvents[0].duringArrival, false); assert.ok(nearEvents[0].time >= 4);
    assert.equal(await page.locator('#visitor-goal').isVisible(), false);
    assert.ok(approach.view.width > 480, 'landscape phone and desktop canvases use wide layout');
    assert.equal(approachPopup.duration, 2.2);
    await screenshot('approach');
    await page.locator('#pause').click();
    const pausedCue = (await read()).popups;
    assert.ok(pausedCue.some(p => p.near));
    await page.waitForTimeout(250);
    assert.deepEqual((await read()).popups, pausedCue, 'approach cue also freezes while paused');
    await page.locator('#resume').click();
    await page.waitForFunction(() => !window.__top5Read().popups.some(p => p.near));
    const approachClearedAt = (await read()).state.time;
    assert.ok(approachClearedAt - nearEvents[0].time <= approachPopup.duration + .25);
    assert.equal((await read()).state.encounter.step, 0, 'cue expires while the encounter is still present');
    await screenshot('approach-cleared');
    await page.locator('#scene').click({ position: { x: 15, y: 15 } }); // user gesture unlocks audio, outside the world
    if (vp.muted) await page.locator('#sound').click();
    const notesBefore = await page.evaluate(() => window.__top5Notes.length);
    for (const [step, height] of [[0, 4.7], [1, 2.7], [2, .6]]) {
      if (step === 0) await slice(height);
      const e = (await read()).state.encounter;
      await go(e.x, e.y);
      if (step) await slice(height);
      await page.waitForFunction(step => { const e = window.__top5Read().state.encounter; return e.kind === 'home' || e.step > step; }, step);
    }
    await page.waitForFunction(() => window.__top5Read().popups.some(p => p.text === '跳跳跟上来了'));
    const found = await read(); assert.deepEqual(found.state.collection.found, ['sprout']);
    const discoveryDuration = found.popups.find(p => p.discovery).duration;
    assert.equal(discoveryDuration, 1.8);
    assert.equal(found.echoes.length, 1);
    const echoDuration = found.echoes[0].duration;
    assert.equal(echoDuration, 3);
    assert.equal((await page.evaluate(() => window.__top5Events)).filter(e => e.type === 'friend_found' && e.fresh).length, 1, 'one delivery of the first discovery');
    assert.equal(found.state.phase, 'playing'); assert.equal(found.state.paused, false);
    assert.equal(await page.locator('dialog[open]').count(), 0);
    if (vp.muted) assert.equal(await page.evaluate(() => window.__top5Notes.length), notesBefore, 'muted discovery produces no oscillator');
    else assert.ok(await page.evaluate(() => window.__top5Notes.some(n => n.frequency === 1047)), 'discovery melody scheduled after user gesture');
    await screenshot('friend-found');
    await page.keyboard.press('p');
    const frozen = await read();
    await page.waitForTimeout(250);
    assert.deepEqual((await read()).popups, frozen.popups);
    assert.deepEqual((await read()).echoes, frozen.echoes, 'pause freezes the wordless tail too');
    await page.locator('#resume').click();
    const friendAt1500 = await afterglowAt1500('friend');
    await page.waitForFunction(() => !window.__top5Read().popups.some(p => p.discovery));
    assert.equal((await read()).echoes.length, 1, 'echo remains briefly after the label');
    await screenshot('friend-afterglow');
    await page.waitForFunction(() => !window.__top5Read().echoes.length);
    await screenshot('friend-found-cleared');
    assert.equal((await page.evaluate(() => window.__top5Near)).filter(e => e.key === 'escape:friend:sprout').length, 1);
    await page.locator('[data-level="0"]').click();
    const visitorSeed = (await read()).state.seed;
    assert.equal(await page.locator('#title').innerText(), '访客');
    assert.match(await page.locator('#levels [aria-current=true]').innerText(), /访客/);
    // Integration smoke: visitor sequence and discovery consumers share one event drain.
    await slice(3); await page.locator('#poke').click();
    assert.match(await page.locator('#visitor-goal').innerText(), /跳起来了/);
    await page.waitForFunction(() => document.querySelector('#visitor-goal').textContent === '走到光环边找访客');
    await slice(2.1); await go(6.5, 9);
    // Face east with a brief native key input, then use Sprout's upper-layer hop.
    await page.keyboard.down('d'); await page.waitForTimeout(30); await page.keyboard.up('d');
    await page.locator('#pet').click();
    await page.waitForFunction(() => window.__top5Events.some(e => e.type === 'friend_garden' && e.kind === 'probe'));
    const budFeedback = await read(), budLabel = budFeedback.labels.find(l => l.text === '花苞醒了');
    if (vp.phone || vp.height <= 500) {
      const probeLabel = budFeedback.labels.find(l => /^S .*s$/.test(l.text));
      assert.ok(budLabel && probeLabel, 'observe simultaneous bud and probe labels on landscape phone');
      assert.equal(budFeedback.popups.some(p => p.near), false, 'acting on the bud retires the near label');
      for (const lbl of budFeedback.labels) {
        assert.ok(lbl.top >= -2 && lbl.bottom <= budFeedback.view.height + 2, `canvas label stays inside canvas height: ${JSON.stringify(lbl)}`);
      }
      const sceneBox = await page.locator('#scene').boundingBox();
      assert.ok(sceneBox && sceneBox.x >= -1 && sceneBox.x + sceneBox.width <= vp.width + 1, 'Flatland canvas fits horizontally within landscape viewport');
    }
    await screenshot('bud-probe');
    await go(10, 9.8);
    await page.waitForFunction(() => window.__top5Read().popups.some(p => p.text === '收下花种 · 1/3'));
    assert.equal(await page.locator('#garden-petals').innerText(), '1/3');
    assert.equal(await page.locator('#garden-count').innerText(), '0/6', 'one seed is not a completed garden');
    assert.equal(await page.locator('#visitor-goal').innerText(), '走到光环边找访客', 'seed discovery does not reset the visitor beat');
    assert.equal((await read()).popups.filter(p => p.discovery).length, 1, 'one discovery label alongside the visitor goal');
    assert.equal((await read()).popups.find(p => p.discovery).duration, discoveryDuration);
    const seedFeedback = await read(), seedLayout = seedFeedback.labels;
    assert.equal(seedFeedback.echoes.length, 1);
    assert.equal(seedFeedback.popups.some(p => p.garden || p.near), false, 'one short find label');
    assert.equal(seedLayout.some(l => l.text === '走到光环边'), false, 'ring text yields to the find');
    if (vp.phone || vp.height <= 500) {
      const seedLabel = seedLayout.find(l => l.text.startsWith('收下花种'));
      assert.ok(seedLabel, 'observe seed discovery label on landscape phone');
      for (const lbl of seedLayout) {
        assert.ok(lbl.top >= -2 && lbl.bottom <= seedFeedback.view.height + 2, `seed-phase label stays inside canvas height: ${JSON.stringify(lbl)}`);
      }
      assert.ok(seedFeedback.echoBounds.length > 0, 'observe the rendered echo footprint');
      assert.ok(seedFeedback.echoBounds.every(b => b.bottom <= seedFeedback.view.height + 4), 'echo stays inside landscape phone canvas');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow during landscape phone discovery');
    }
    await screenshot('seed-found');
    const seedAt1500 = await afterglowAt1500('seed');
    await page.waitForFunction(() => !window.__top5Read().popups.some(p => p.discovery));
    assert.equal((await read()).echoes.length, 1);
    await screenshot('seed-afterglow');
    await page.waitForFunction(() => !window.__top5Read().echoes.length);
    const firstSeed = (await page.evaluate(() => window.__top5Events)).find(e => e.type === 'garden_seed');
    assert.equal(firstSeed.fresh, true);
    assert.equal((await page.evaluate(() => window.__top5Events)).filter(e => e.type === 'garden_seed' && e.fresh).length, 1, 'one delivery of the first seed');
    assert.deepEqual(await page.evaluate(() => window.__top5CueConflicts), [], 'arrival never shares a frame with near text or its announcement');
    await page.reload(); await ready();
    assert.deepEqual((await read()).state.collection.found, ['sprout']);
    assert.equal(await page.locator('#garden-petals').innerText(), '1/3');
    assert.equal((await read()).popups.filter(p => p.discovery).length, 0);
    assert.deepEqual((await read()).echoes, [], 'saved discoveries do not replay after reload');
    await page.keyboard.press('r');
    assert.equal((await read()).state.seed, visitorSeed);
    assert.equal(await page.locator('#garden-petals').innerText(), '1/3');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const hud = await page.locator('#garden-progress').boundingBox(), canvas = await page.locator('#scene').boundingBox();
    assert.ok(hud.y + hud.height <= canvas.y, 'HUD sits above gameplay');
    await screenshot('saved-progress');
    await page.locator('#style-toggle').click();
    assert.equal(await page.locator('#garden-progress').isVisible(), false, 'challenge keeps its own HUD');
    await page.locator('#start').click();
    // Real handoff link, using the freshly earned collection and untouched storage.
    await page.getByRole('link', { name: '去庭院 ↗', exact: true }).first().click();
    await page.waitForFunction(() => window.__flow?.());
    const courtyardEntry = await chooseDiscoveryStarter(page, out, vp.key);
    // The arrival invitation appears before the player acts (acting first cancels it by design).
    await page.waitForFunction(() => window.__flow().momentum.cue?.beat === 'arrival');
    // First activation by following only what the game shows, then the quiet that follows it.
    await followGuidance(page, (await readFlow(page)).state.mechanismOrder[0]);
    const landed = await waitSettled(page);
    assert.equal(landed.friends.length, 1, 'test the idle guide with the genuinely earned companion');
    assert.equal(landed.state.activated.length, 1);
    assert.equal(await page.locator('#friend-guide').isVisible(), false);
    await screenshot('courtyard-first-activation');
    await page.locator('#pause').click();
    const frozenAt = (await readFlow(page)).time;
    await page.waitForTimeout(250);
    assert.equal((await readFlow(page)).time, frozenAt, 'pause freezes the courtyard');
    await page.locator('#resume').click();
    await page.waitForFunction(time => window.__flow().time >= time + 6.2, landed.time);
    const idle = await readFlow(page);
    assert.equal(await page.locator('#friend-guide').isVisible(), false, 'no automatic guide at the old six-second idle trigger');
    assert.equal(idle.momentum.cue, null, 'first-entry glints expire and do not loop');
    assert.equal(idle.state.node, landed.state.node, 'idling never moves the player');
    assert.equal(idle.state.layer, landed.state.layer, 'idling never shifts for the player');
    await screenshot('courtyard-settled-quiet');
    await page.locator('#scene').focus();
    await page.keyboard.press('h');
    assert.equal(await page.locator('#friend-guide').isVisible(), true);
    await page.waitForFunction(() => document.querySelector('#friend-guide').hidden, null, { timeout: 12000 });
    await screenshot('courtyard-requested-help-cleared');
    const glintUsed = idle.momentum.used;
    assert.deepEqual(glintUsed, ['arrival', 'follow'], 'the first entry plays its two beats once');
    assert.deepEqual(await page.evaluate(() => window.__top5EntryConflicts), [], 'an entry beat never shares the frame with companion help');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    receipt.checks.push({ viewport: vp.key, width: vp.width, height: vp.height, phone: vp.phone, hasTouch: vp.hasTouch, reducedMotion: vp.reducedMotion, muted: vp.muted, friendFound: true, seedFound: true, savedAfterReloadAndRetry: true, levelHighlightSynced: true, noOverflow: true, visitorAndDiscoveryCoexist: true, discoveryDeliveredOnce: true, earnedCollectionToCourtyardCTA: true,
      arrivalAndNearExclusive: true, idleAfterArrivalQuiet: true, nearOnce: nearEvents, approachDuration: approachPopup.duration, approachClearedAfter: approachClearedAt - nearEvents[0].time, discoveryDuration,
      seedLayout, budLayout: budFeedback.labels, courtyardEntry, firstEntryOnceAndRevisitQuiet: true, echoDuration, friendAt1500, seedAt1500, seedEchoBounds: seedFeedback.echoBounds, echoesPauseExpireAndDoNotReplay: true, glintUsed,
      courtyardGuideRetiredAfterLanding: true, companionIdleQuietSeconds: 6.2, explicitHelpStillExpires: true });
    console.log(`passed ${vp.key}: discovery, seed, pause, saved progress, HUD, visitor beat and courtyard CTA`);
    await context.close();
  }
  assert.deepEqual(receipt.errors, []);
  receipt.status = 'passed';
} catch (error) {
  receipt.status = 'failed'; receipt.failure = error.stack; process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile(`${out}/receipt.json`, JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({ ...receipt, output: out }));
}
