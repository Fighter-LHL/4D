// Theater layout + handoff-2 browser verification.
// The observer appended to src/main.js only reads state and records; every clearly marked
// SETUP step below drives the model exclusively through public methods
// (select / move / setW / setRisk / interact / tuneMechanism / chooseRelic / update).
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173';
const OUT = process.env.ARTIFACT_DIR;
assert.ok(OUT, 'use a fresh explicit artifact directory');
await mkdir(OUT, { recursive: true });

const VIEWPORTS = (process.env.VIEWPORTS ? process.env.VIEWPORTS.split(',').map(v => v.split('x').map(Number))
  : [[1440, 900], [1280, 720], [844, 390], [667, 375]])
  .map(([w, h]) => ({ w, h, desktop: h > 500 && w >= 781, reduce: w === 667, touch: w === 844, target: h > 500 && w >= 781 ? (w >= 1400 ? .55 : .50) : .27 }));

const observer = `
window.__feelLog = []; window.__feelLost = 0; window.__frozenSeen = false;
{
  const _trigger = feel.trigger.bind(feel);
  feel.trigger = (kind, opts) => { const accepted = _trigger(kind, opts); window.__feelLog.push({ kind, accepted }); return accepted; };
  const _step = feel.step.bind(feel);
  feel.step = dt => { const r = _step(dt); window.__feelLost += Math.max(0, dt - r); return r; };
  const _render = scene.render.bind(scene);
  scene.render = dt => { if (feel.frozen) window.__frozenSeen = true; return _render(dt); };
}
window.__g = () => structuredClone({
  state: model.snapshot(), time: model.time,
  view: { scale: scene.scale, offsetX: scene.offsetX, offsetY: scene.offsetY },
  stage: scene.onboardingStage, ambient: !!audio.ambient,
  paused, panelOpen, feelLog: window.__feelLog, feelLost: window.__feelLost, frozenSeen: window.__frozenSeen,
});
window.__m = model; window.__scene = scene;`;

const receipt = { name: 'theater-feel', base: BASE, status: 'started', checks: [], errors: [] };
const RELIC_NAME = { shell: '缓落壳', shadow: '留影扣', prism: '回流棱镜', coil: '接力线圈', weave: '织桥种' };
const read = page => page.evaluate(() => window.__g());
const sceneBox = page => page.locator('#scene').boundingBox();
const toScreen = (g, box, p) => ({ x: box.x + g.view.offsetX + p.x * g.view.scale, y: box.y + g.view.offsetY + p.y * g.view.scale });
const inside = (b, vp, pad = 1) => b && b.x >= -pad && b.y >= -pad && b.x + b.width <= vp.w + pad && b.y + b.height <= vp.h + pad;

// Floating-chip assertions (theater only), run at every screenshot step:
// no two chips may intersect (1px tolerance), their union area over the canvas
// stays under the per-size cap, and none may cover the avatar's screen point.
const intersect = (a, b, tol = 1) => a.x < b.x + b.width - tol && b.x < a.x + a.width - tol && a.y < b.y + b.height - tol && b.y < a.y + a.height - tol;
async function snapFloats(page, vp, where) {
  const d = await page.evaluate(() => {
    const rect = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
    const vis = el => {
      if (!el || el.hidden) return false;
      const cs = getComputedStyle(el);
      return cs.display !== 'none' && cs.visibility !== 'hidden' && rect(el).width > 1 && rect(el).height > 1;
    };
    const chips = [];
    const df = document.querySelector('.dock-float');
    if (df && getComputedStyle(df).display !== 'contents')
      for (const el of df.children) if (vis(el)) chips.push({ sel: `.dock-float>.${[...el.classList].join('.') || el.id}`, ...rect(el) });
    for (const sel of ['#onboarding-desc', '#action-feedback', '#wave-warning']) {
      const el = document.querySelector(sel);
      if (vis(el)) chips.push({ sel, ...rect(el) });
    }
    const canvas = rect(document.getElementById('scene'));
    const p = window.__scene?.lastPlayer;
    const s = window.__scene;
    const avatar = p ? { x: canvas.x + s.offsetX + p.x * s.scale, y: canvas.y + s.offsetY + p.y * s.scale } : null;
    return { chips, canvas, avatar, theater: document.documentElement.classList.contains('theater') };
  });
  if (!d.theater) return;
  for (let i = 0; i < d.chips.length; i++) for (let j = i + 1; j < d.chips.length; j++)
    assert.ok(!intersect(d.chips[i], d.chips[j]), `${where}: chips overlap ${d.chips[i].sel} x ${d.chips[j].sel}`);
  let area = 0; // chips do not intersect each other (asserted above), so the sum approximates the union
  for (const c of d.chips) {
    area += Math.max(0, Math.min(c.x + c.width, d.canvas.x + d.canvas.width) - Math.max(c.x, d.canvas.x))
          * Math.max(0, Math.min(c.y + c.height, d.canvas.y + d.canvas.height) - Math.max(c.y, d.canvas.y));
  }
  const limit = vp.desktop ? .15 : .25;
  const pct = 100 * area / (d.canvas.width * d.canvas.height);
  assert.ok(pct <= limit * 100 + .5, `${where}: chip coverage ${pct.toFixed(1)}% over canvas <= ${limit * 100}%`);
  if (d.avatar) for (const c of d.chips)
    assert.ok(!(d.avatar.x >= c.x - 1 && d.avatar.x <= c.x + c.width + 1 && d.avatar.y >= c.y - 1 && d.avatar.y <= c.y + c.height + 1),
      `${where}: avatar point covered by ${c.sel}`);
}

async function openGame(page, relic = 'shell') {
  await page.goto(`${BASE}/?seed=123&ferry=first`);
  await page.waitForFunction(() => window.__g?.().state, null, { timeout: 10000 });
  if (await page.locator('#choice-dialog[open]').count()) {
    await page.getByRole('button', { name: `选择${RELIC_NAME[relic]}`, exact: true }).click();
  }
  await page.waitForFunction(() => window.__g().state.phase === 'playing');
  await page.waitForTimeout(700);
}

// SETUP: walk to a node through public methods only, retrying each leg until arrival.
async function walkTo(page, id, { risky = false, timeout = 60000 } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const s = (await read(page)).state;
    if (s.node === id && !s.travel) return s;
    assert.ok(Date.now() < deadline, `walkTo(${id}) timed out at ${s.node}`);
    const step = await page.evaluate(([id, risky]) => {
      const m = window.__m, s = m.snapshot();
      if (s.travel || s.wave || s.phase !== 'playing') return 'busy';
      m.setRisk(risky);
      if (m.select(id)) {
        const range = m.snapshot().range;
        if (range) m.setW(range.center);
        return m.move() ? 'moving' : 'blocked';
      }
      // Target is not on the current W slice: reposition via the hub anchor, the
      // same way the UI does (anchors span all layers).
      const target = s.nodes.find(n => n.id === id);
      const here = s.nodes.find(n => n.id === s.node);
      if (s.node !== 'hub' && s.nodes.some(n => n.id === 'hub') && m.select('hub')) {
        const range = m.snapshot().range;
        if (range) m.setW(range.center);
        return m.move() ? 'moving' : 'blocked';
      }
      if (!target || !here?.anchor) return 'stuck';
      m.setW(s.layers[target.layer ?? s.layer].center);
      return 'repositioned';
    }, [id, risky]);
    assert.notEqual(step, 'stuck', `cannot reach ${id}`);
    assert.notEqual(step, 'no-route', `no route to ${id}`);
    if (step === 'moving' && risky) {
      // Track the wobbling risk band through public setW so stability holds.
      const t0 = Date.now();
      while (Date.now() - t0 < 15000) {
        const done = await page.evaluate(() => {
          const m = window.__m, s = m.snapshot();
          if (!s.travel) return true;
          if (s.range) m.setW(s.range.center);
          return false;
        });
        if (done) break;
        await page.waitForTimeout(35);
      }
    }
    try {
      await page.waitForFunction(() => { const s = window.__g().state; return !s.travel && !s.wave; }, null, { timeout: 15000 });
    } catch { /* a wave or stalled leg retries */ }
    await page.waitForTimeout(80);
  }
}
// SETUP: activate a mechanism the player is standing on (public interact()).
async function activateHere(page) {
  await page.evaluate(() => window.__m.interact());
  await page.waitForTimeout(400);
}
async function activateMechanism(page, id) {
  await walkTo(page, id);
  await page.waitForFunction(mid => window.__g().state.powered.includes(mid), id, { timeout: 5000 });
  await activateHere(page);
  const s = (await read(page)).state;
  assert.ok(s.activated.includes(id), `${id} is activated`);
  return s;
}
const firstMechanism = page => page.evaluate(() => window.__g().state.mechanismOrder[0]);

const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
receipt.browserVersion = browser.version();
try {
  for (const vp of VIEWPORTS) {
    const shotName = label => `${OUT}/${vp.w}x${vp.h}-${label}.png`;
    const context = await browser.newContext({
      viewport: { width: vp.w, height: vp.h },
      reducedMotion: vp.reduce ? 'reduce' : 'no-preference',
      ...(vp.touch ? { hasTouch: true } : {}),
    });
    await context.addInitScript(() => { try { localStorage.setItem('wslice-first-run-done', 'yes'); } catch {} });
    await context.route('**/src/main.js', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: await response.text() + observer });
    });
    const page = await context.newPage();
    const label = () => receipt.checks.at(-1)?.label || 'setup';
    page.on('pageerror', e => receipt.errors.push({ vp: `${vp.w}x${vp.h}`, check: label(), message: e.message }));
    page.on('console', m => { if (['error', 'warning'].includes(m.type())) receipt.errors.push({ vp: `${vp.w}x${vp.h}`, check: label(), message: m.text() }); });
    const check = (label, data = {}) => receipt.checks.push({ viewport: `${vp.w}x${vp.h}`, label, ...data, passed: true });
    // Every screenshot step also runs the floating-chip assertions.
    const snap = async name => { await snapFloats(page, vp, name); await page.screenshot({ path: shotName(name) }); };

    // ---- 1. layout ---------------------------------------------------------------
    await openGame(page);
    const ly = await page.evaluate(() => {
      const r = document.getElementById('scene').getBoundingClientRect();
      return {
        theater: document.documentElement.classList.contains('theater'),
        canvas: { x: r.x, y: r.y, width: r.width, height: r.height },
        scrollW: document.documentElement.scrollWidth, scrollH: document.documentElement.scrollHeight,
      };
    });
    assert.ok(ly.theater, 'html.theater is set by default');
    assert.ok(inside(ly.canvas, vp), `canvas fully inside viewport: ${JSON.stringify(ly.canvas)}`);
    assert.ok(ly.scrollW <= vp.w + 1, `no horizontal overflow: ${ly.scrollW}`);
    if (vp.desktop) assert.ok(ly.scrollH <= vp.h + 1, `no vertical document scroll: ${ly.scrollH}`);
    const g1 = await read(page);
    const theaterRatio = g1.view.scale ** 2 * 650000 / (vp.w * vp.h);
    assert.ok(theaterRatio >= vp.target, `world-area ratio ${theaterRatio.toFixed(3)} >= ${vp.target}`);
    await snap('layout');
    // stage >= 2 → the layer buttons sit inside the first viewport together with the canvas.
    await activateMechanism(page, await firstMechanism(page));
    const layerBox = await page.locator('#layer-controls').boundingBox();
    assert.ok(inside(layerBox, vp), `#layer-controls inside viewport: ${JSON.stringify(layerBox)}`);
    const cv = await sceneBox(page);
    assert.ok(inside(cv, vp), 'canvas still inside viewport at stage >= 2');
    await snap('layout-controls');
    // Theater at phone widths: the topbar is exactly one row of icon buttons.
    if (!vp.desktop) {
      const tb = await page.evaluate(() => {
        const t = document.querySelector('.topbar').getBoundingClientRect();
        const controls = [...document.querySelectorAll('.topbar nav > *')].map(el => {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        });
        return { h: t.height, controls };
      });
      assert.ok(tb.h <= 56, `one-row topbar: height ${tb.h}px <= 56`);
      for (const c of tb.controls) assert.ok(inside(c, vp), `nav control inside viewport: ${JSON.stringify(c)}`);
    }
    // Classic opt-out stays byte-identical in effect.
    await page.goto(`${BASE}/?seed=123&ferry=first&layout=classic`);
    await page.waitForFunction(() => window.__g?.().state);
    const cl = await page.evaluate(() => {
      const r = document.getElementById('scene').getBoundingClientRect();
      const scale = Math.min(r.width / 1000, r.height / 650);
      const panel = getComputedStyle(document.getElementById('run-panel'));
      return { theater: document.documentElement.classList.contains('theater'), position: panel.position, ratio: scale * scale * 650000 / (innerWidth * innerHeight) };
    });
    assert.equal(cl.theater, false, '?layout=classic has no theater class');
    assert.equal(cl.position, 'static', 'classic .run-panel stays in normal flow');
    await snap('classic');
    await page.evaluate(() => { try { localStorage.setItem('wslice-theater', 'theater'); } catch {} });
    check('layout', { theaterRatio: +theaterRatio.toFixed(4), classicRatio: +cl.ratio.toFixed(4), target: vp.target });

    // ---- 2. drawer ----------------------------------------------------------------
    await openGame(page);
    // Desktop check needs the dock's layer buttons, which appear at stage >= 2.
    if (vp.desktop) await activateMechanism(page, await firstMechanism(page));
    const panel = page.locator('#run-panel');
    assert.equal(await panel.getAttribute('inert'), '', 'drawer starts inert');
    assert.ok(!inside(await panel.boundingBox(), vp), 'drawer starts outside the viewport');
    const cvs0 = await sceneBox(page);
    await page.locator('#panel-toggle').click();
    await page.waitForTimeout(450);
    assert.equal(await panel.getAttribute('inert'), null, 'drawer opened');
    assert.ok(inside(await panel.boundingBox(), vp), 'open drawer inside the viewport');
    const cvs1 = await sceneBox(page);
    for (const k of ['x', 'y', 'width', 'height']) {
      assert.ok(Math.abs(cvs1[k] - cvs0[k]) <= .5, `canvas ${k} unchanged by drawer: ${cvs0[k]} -> ${cvs1[k]}`);
    }
    const t0 = (await read(page)).time;
    await page.waitForTimeout(400);
    assert.ok((await read(page)).time > t0, 'model time advances while the drawer is open');
    await snap('drawer-open');
    // The open drawer must stop above the dock: every layer button stays visible
    // and hit-testable (elementFromPoint returns it or one of its descendants).
    if (vp.desktop) {
      const btns = await page.evaluate(() => [...document.querySelectorAll('#layer-controls button')].map(b => {
        const r = b.getBoundingClientRect();
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return { r: { x: r.x, y: r.y, width: r.width, height: r.height }, hit: hit === b || b.contains(hit) };
      }));
      assert.ok(btns.length === 3, 'three layer buttons present');
      for (const b of btns) {
        assert.ok(inside(b.r, vp), `layer button fully visible with drawer open: ${JSON.stringify(b.r)}`);
        assert.ok(b.hit, 'layer button clickable with drawer open');
      }
    }
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__g().panelOpen === false);
    await page.keyboard.press('p');
    await page.waitForFunction(() => window.__g().panelOpen === true);
    // Keep clear of the drawer: right edge on desktop, bottom sheet on mobile —
    // the top-left corner of the canvas element stays uncovered at both.
    const cb = await sceneBox(page);
    await page.mouse.click(cb.x + 24, cb.y + 18);
    await page.waitForFunction(() => window.__g().panelOpen === false, null, { timeout: 3000 });
    await page.waitForFunction(() => document.getElementById('run-panel').hasAttribute('inert'), null, { timeout: 3000 });
    await page.waitForTimeout(vp.reduce ? 250 : 400); // let the slide/fade finish
    assert.equal(await panel.getAttribute('inert'), '', 'drawer inert after canvas close');
    assert.ok(!inside(await panel.boundingBox(), vp), 'closed drawer off-screen');
    await snap('drawer-closed');
    if (vp.w === 1280 && vp.h === 720) {
      // SETUP: light all mechanisms so the vault gate opens, then stand on the vault.
      const order = await page.evaluate(() => window.__g().state.mechanismOrder);
      for (const id of order) await activateMechanism(page, id);
      await walkTo(page, 'vault');
      await page.locator('#panel-toggle').click();
      await page.waitForFunction(() => window.__g().panelOpen === true);
      await page.evaluate(() => window.__m.interact()); // SETUP: opens the vault → warning wave
      await page.waitForFunction(() => !window.__g().panelOpen, null, { timeout: 3000 });
      await snap('drawer-warning');
    }
    check('drawer');

    // ---- 3. dial scrub --------------------------------------------------------------
    await openGame(page);
    await activateMechanism(page, await firstMechanism(page));
    await walkTo(page, 'hub');
    const dial = await page.evaluate(() => {
      const s = window.__scene, hub = s.state.nodes.find(n => n.id === 'hub');
      const a = s.currentW() * Math.PI * 2 - Math.PI / 2;
      return { x: hub.x + Math.cos(a) * 51, y: hub.y - 2 + Math.sin(a) * 27, hx: hub.x, hy: hub.y - 2 };
    });
    const g3 = await read(page);
    const d0 = toScreen(g3, await sceneBox(page), dial);
    await page.mouse.move(d0.x, d0.y);
    await page.mouse.down();
    let ang = Math.atan2((dial.y - dial.hy) / 27, (dial.x - dial.hx) / 51);
    // The grab owns the gesture after ≥8 client px of movement; sample W once it
    // has engaged (at small scales that takes a few moves).
    const ws = [];
    for (let i = 1; i <= 14 && ws.length < 8; i++) {
      ang += .14;
      const p = toScreen(g3, await sceneBox(page), { x: dial.hx + Math.cos(ang) * 51, y: dial.hy + Math.sin(ang) * 27 });
      await page.mouse.move(p.x, p.y, { steps: 2 });
      if (await page.evaluate(() => !!window.__scene.grab)) ws.push((await read(page)).state.w);
    }
    assert.ok(new Set(ws.map(w => w.toFixed(4))).size >= 6, `>= 6 distinct W samples: ${ws}`);
    for (let i = 1; i < ws.length; i++) assert.ok(ws[i] > ws[i - 1], `W strictly monotone during dial drag: ${ws}`);
    assert.ok(ws.at(-1) > ws[0], 'clockwise drag raises W');
    await snap('dial-mid');
    await page.mouse.up();
    const centers = (await read(page)).state.layers.map(l => l.center);
    const settle = () => page.waitForFunction(cs => {
      const w = window.__g().state.w;
      return cs.some(c => Math.abs(w - c) < 1e-6);
    }, centers, { timeout: 1500, polling: vp.reduce ? 5 : 30 });
    if (vp.reduce) { await page.waitForTimeout(50); }
    await settle();
    const afterDial = (await read(page)).state;
    assert.equal(afterDial.node, 'hub', 'still on the hub after the dial scrub');
    assert.equal(afterDial.phaseStability, 1, 'phaseStability intact');
    check('dial', { samples: ws.length });

    // ---- 4. ferry ride --------------------------------------------------------------
    await openGame(page);
    const fA = (await read(page)).state.ferry;
    assert.ok(fA, 'ferry present');
    await walkTo(page, fA.a);
    const g4 = await read(page);
    const pFerry = toScreen(g4, await sceneBox(page), { x: g4.state.ferry.x, y: g4.state.ferry.y });
    await page.mouse.click(pFerry.x, pFerry.y);
    await page.waitForFunction(() => window.__g().state.node === 'ferry' && !window.__g().state.travel, null, { timeout: 20000 });
    const g5 = await read(page);
    const start = { x: g5.state.ferry.x, y: g5.state.ferry.y };
    const farDock = g5.state.ferry.docked === 'b' ? 'a' : 'b';
    const to = farDock === 'b' ? g5.state.ferry.track.p1 : g5.state.ferry.track.p0;
    const s0 = toScreen(g5, await sceneBox(page), start);
    await page.mouse.move(s0.x, s0.y);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) {
      const f = (await read(page)).state.ferry;
      const src = { x: f.x, y: f.y };
      const p = toScreen(await read(page), await sceneBox(page), { x: src.x + (to.x - src.x) * i / 12, y: src.y + (to.y - src.y) * i / 12 });
      await page.mouse.move(p.x, p.y, { steps: 2 });
      await page.waitForTimeout(30);
    }
    await snap('ferry-mid');
    await page.mouse.up();
    await page.waitForFunction(d => window.__g().state.ferry.docked === d, farDock, { timeout: 3000 });
    const fEnd = (await read(page)).state.ferry;
    assert.ok(Math.hypot(fEnd.x - start.x, fEnd.y - start.y) > 100, `skiff moved > 100 world px (${Math.hypot(fEnd.x - start.x, fEnd.y - start.y).toFixed(0)})`);
    assert.equal((await read(page)).state.node, 'ferry', 'still riding the skiff');
    // The badge interpolates between the dock nodes — never the sentinel 99s.
    const readout = await page.locator('#position-readout').textContent();
    assert.ok(!readout.includes('99'), `ferry position readout has no sentinel: "${readout}"`);
    await snap('ferry-far');
    const g6 = await read(page);
    const bNode = g6.state.nodes.find(n => n.id === fA.b);
    const pB = toScreen(g6, await sceneBox(page), bNode);
    await page.mouse.click(pB.x, pB.y);
    await page.waitForFunction(id => window.__g().state.node === id && !window.__g().state.travel, fA.b, { timeout: 20000 });
    // Landing on an unlit mechanism opens the ~680ms altar-snap window, which
    // consumes the next canvas click — wait for it to expire before boarding.
    await page.waitForFunction(() => !window.__scene.altarWindow, null, { timeout: 4000 });
    const g7 = await read(page);
    const pSkiff = toScreen(g7, await sceneBox(page), { x: g7.state.ferry.x, y: g7.state.ferry.y });
    await page.mouse.click(pSkiff.x, pSkiff.y);
    await page.waitForFunction(() => window.__g().state.node === 'ferry' && !window.__g().state.travel, null, { timeout: 20000 });
    assert.equal((await read(page)).state.stats.failures, 0, 'no fail event during the ferry ride');
    await snap('ferry-return');
    check('ferry', { dock: farDock });

    // ---- 5. casts ------------------------------------------------------------------
    const castCheck = async (relic, setup, dropTarget, verify) => {
      await openGame(page, relic);
      await setup();
      const g = await read(page);
      const ids = g.state.castTargets[relic];
      assert.ok(ids.length > 0, `castTargets.${relic} non-empty`);
      const me = g.state.nodes.find(n => n.id === g.state.node);
      const avatar = toScreen(g, await sceneBox(page), { x: me.x, y: me.y - 14 });
      const before = g.state;
      // Invalid release first: drag out of the avatar, drop on the emptiest spot.
      const empty = await page.evaluate(() => {
        const s = window.__g().state;
        let best = { x: 60, y: 60 }, bd = -1;
        for (let x = 50; x <= 950; x += 60) for (let y = 50; y <= 600; y += 60) {
          const d = Math.min(...s.nodes.map(n => Math.hypot(n.x - x, n.y - y)));
          if (d > bd) { bd = d; best = { x, y }; }
        }
        return best;
      });
      const emptyPt = toScreen(g, await sceneBox(page), empty);
      await page.mouse.move(avatar.x, avatar.y);
      await page.mouse.down();
      await page.mouse.move(emptyPt.x, emptyPt.y, { steps: 6 });
      await page.mouse.up();
      await page.waitForTimeout(vp.reduce ? 80 : 350); // tether retracts
      const afterMiss = (await read(page)).state;
      for (const k of ['carried', 'charge', 'weaveCharge']) assert.equal(afterMiss[k], before[k], `${k} unchanged by an invalid release`);
      assert.equal(afterMiss.ghost, null, 'no ghost after invalid release');
      assert.equal(afterMiss.woven.length, before.woven.length, 'woven unchanged');
      assert.deepEqual(afterMiss.activated, before.activated, 'activated unchanged');
      // Valid drag onto the legal target.
      await page.mouse.move(avatar.x, avatar.y);
      await page.mouse.down();
      await page.mouse.move(avatar.x - 60, avatar.y + 40, { steps: 4 });
      await page.waitForTimeout(60);
      const target = toScreen(await read(page), await sceneBox(page), dropTarget(g));
      await page.mouse.move(target.x, target.y, { steps: 6 });
      await page.waitForTimeout(140);
      const snap = await page.evaluate(() => window.__scene.cast?.snap);
      assert.ok(snap && snap.relic === relic, `drag snapped to a ${relic} receptor: ${JSON.stringify(snap)}`);
      await page.screenshot({ path: shotName(`cast-${relic}-mid`) });
      await page.mouse.up();
      await page.waitForTimeout(400);
      await verify((await read(page)).state, before, snap.target);
      return { targets: ids.length, snapped: snap.target };
    };
    await castCheck('shadow', async () => {
      const mech = await firstMechanism(page);
      await activateMechanism(page, mech); // SETUP: activation banks the carried charge
    }, g => {
      // The shadow receptor pad sits (x-21, y-4); the snap also needs the pointer
      // >=24px from the avatar anchor (x, y-14), so drop just past the pad.
      const n = g.state.nodes.find(n => n.id === g.state.node);
      return { x: n.x - 24, y: n.y - 5 };
    }, async (after, before) => {
      assert.equal(after.ghost?.node, before.node, 'shadow cast leaves a ghost on the island');
      assert.equal(after.carried, before.carried - 1, 'carried -1');
    });
    check('cast-shadow');
    await castCheck('weave', async () => {
      const mech = await firstMechanism(page);
      await walkTo(page, mech, { risky: true }); // SETUP: a tracked risky crossing earns the weave charge
      await activateHere(page);
    }, g => {
      const n = g.state.nodes.find(n => n.id === g.state.castTargets.weave[0]);
      return { x: n.x, y: n.y };
    }, async (after, before) => {
      assert.equal(after.woven.length, before.woven.length + 1, 'woven gained the source island');
      assert.ok(after.woven.some(w => w.node === before.node), 'woven includes the drop source');
      assert.equal(after.weaveCharge, before.weaveCharge - 1, 'weaveCharge -1');
    });
    check('cast-weave');
    const prismRec = await castCheck('prism', async () => {
      const mech = await firstMechanism(page);
      await walkTo(page, mech, { risky: true }); // SETUP: risky crossing earns the prism charge
      await activateHere(page);
      await walkTo(page, 'hub');
      // SETUP: move W onto a layer that still holds powered, unlit mechanisms.
      await page.evaluate(() => {
        const m = window.__m, s = m.snapshot();
        const layer = s.nodes.find(n => n.kind === 'mechanism' && s.powered.includes(n.id) && !s.activated.includes(n.id))?.layer;
        if (layer != null) m.setW(s.layers[layer].center);
      });
    }, g => {
      const ids = g.state.castTargets.prism;
      const n = g.state.nodes.find(n => n.id === ids[ids.length - 1]);
      return { x: n.x, y: n.y };
    }, async (after, before, snappedTarget) => {
      assert.equal(after.charge, before.charge - 1, 'charge -1');
      assert.ok(after.activated.includes(snappedTarget), `the dropped-on target ${snappedTarget} activated`);
    });
    check('cast-prism', { targets: prismRec.targets, snapped: prismRec.snapped });

    // ---- 6. feel ---------------------------------------------------------------------
    await openGame(page);
    const mech6 = await firstMechanism(page);
    await page.evaluate(id => window.__m.tuneMechanism(id), mech6); // SETUP: arm the harmonic lock
    const lost0 = (await read(page)).feelLost;
    await walkTo(page, mech6);
    await activateHere(page);
    await page.waitForFunction(() => window.__g().feelLog.some(e => e.kind === 'harmonic_burst'), null, { timeout: 5000 });
    const feelG = await read(page);
    const burst = feelG.feelLog.filter(e => e.kind === 'harmonic_burst');
    if (vp.reduce) {
      assert.ok(feelG.feelLog.every(e => e.accepted === false), 'reduced motion rejects every hit-stop');
      assert.equal(await page.evaluate(() => window.__scene.feel.value('camera')), 0, 'no camera punch under reduced motion');
    } else {
      assert.ok(burst.some(e => e.accepted), 'harmonic_burst hit-stop accepted');
      assert.ok(feelG.frozenSeen, 'a frame rendered while the feel clock was frozen');
      const lost = (feelG.feelLost - lost0) * 1000;
      assert.ok(lost <= 35.5, `hit-stop froze ${lost.toFixed(1)}ms of game time (<= 35ms)`);
    }
    await snap('feel');
    check('feel', { bursts: burst.length });

    // ---- 7. ambient -------------------------------------------------------------------
    await openGame(page);
    const hubPt = toScreen(await read(page), await sceneBox(page), (await read(page)).state.nodes.find(n => n.id === 'hub'));
    await page.mouse.click(hubPt.x, hubPt.y); // real gesture unlocks audio
    await page.waitForFunction(() => window.__g().ambient, null, { timeout: 1000 });
    await page.locator('#pause').click();
    await page.waitForFunction(() => !window.__g().ambient, null, { timeout: 1000 });
    await page.locator('#resume').click();
    await page.waitForFunction(() => window.__g().ambient, null, { timeout: 1500 });
    await page.locator('#sound').click();
    await page.waitForFunction(() => !window.__g().ambient, null, { timeout: 1000 });
    check('ambient');

    // ---- 8. touch scroll guard (844x390 landscape mobile) ------------------------------
    if (vp.touch) {
      await openGame(page, 'shadow');
      await activateMechanism(page, await firstMechanism(page)); // SETUP: legal cast state
      const guard = await page.evaluate(() => {
        const s = window.__scene, v = window.__g().view;
        const node = s.state.nodes.find(n => n.id === s.state.node);
        const fire = (wx, wy) => {
          const r = s.canvas.getBoundingClientRect();
          const t = new Touch({ identifier: 1, target: s.canvas, clientX: r.left + v.offsetX + wx * v.scale, clientY: r.top + v.offsetY + wy * v.scale });
          const ev = new TouchEvent('touchstart', { touches: [t], targetTouches: [t], changedTouches: [t], cancelable: true, bubbles: true });
          s.canvas.dispatchEvent(ev);
          return ev.defaultPrevented;
        };
        return { avatar: fire(node.x, node.y - 14), empty: fire(950, 60) };
      });
      assert.equal(guard.avatar, true, 'touchstart on a castable avatar is captured');
      assert.equal(guard.empty, false, 'touchstart on empty canvas scrolls as before');
      check('touch-guard');
    }
    await snap('final');
    await context.close();
  }

  // Astral theme reference shot at 1440x900.
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript(() => { try { localStorage.setItem('wslice-first-run-done', 'yes'); localStorage.setItem('wslice-theme', 'astral'); } catch {} });
    await context.route('**/src/main.js', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: await response.text() + observer });
    });
    const page = await context.newPage();
    page.on('pageerror', e => receipt.errors.push({ check: 'astral', message: e.message }));
    page.on('console', m => { if (['error', 'warning'].includes(m.type())) receipt.errors.push({ check: 'astral', message: m.text() }); });
    await openGame(page);
    const themeVp = { w: 1440, h: 900, desktop: true };
    await snapFloats(page, themeVp, 'astral');
    await page.screenshot({ path: `${OUT}/1440x900-astral.png` });
    // And with the drawer open for material coverage.
    await page.locator('#panel-toggle').click();
    await page.waitForTimeout(450);
    await snapFloats(page, themeVp, 'astral-drawer');
    await page.screenshot({ path: `${OUT}/1440x900-astral-drawer.png` });
    await context.close();
  }
  // Paper theme reference shot at 1440x900 (astral is the stored default).
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript(() => { try { localStorage.setItem('wslice-first-run-done', 'yes'); localStorage.setItem('wslice-theme', 'paper'); } catch {} });
    await context.route('**/src/main.js', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: await response.text() + observer });
    });
    const page = await context.newPage();
    page.on('pageerror', e => receipt.errors.push({ check: 'paper', message: e.message }));
    page.on('console', m => { if (['error', 'warning'].includes(m.type())) receipt.errors.push({ check: 'paper', message: m.text() }); });
    await openGame(page);
    const themeVp2 = { w: 1440, h: 900, desktop: true };
    await snapFloats(page, themeVp2, 'paper');
    await page.screenshot({ path: `${OUT}/1440x900-paper.png` });
    await page.locator('#panel-toggle').click();
    await page.waitForTimeout(450);
    await snapFloats(page, themeVp2, 'paper-drawer');
    await page.screenshot({ path: `${OUT}/1440x900-paper-drawer.png` });
    await context.close();
  }

  assert.deepEqual(receipt.errors, [], 'no page errors or console errors/warnings');
  receipt.status = 'passed';
} catch (error) {
  receipt.status = 'failed'; receipt.failure = error.stack; receipt.actual = error.actual; receipt.expected = error.expected;
  process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile(`${OUT}/receipt.json`, JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({ name: receipt.name, status: receipt.status, checks: receipt.checks.length, failure: receipt.failure?.split('\n')[0], out: OUT }));
}
