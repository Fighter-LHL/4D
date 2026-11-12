// End-to-end Playwright verification for cold-boot default Theater + First-Run onboarding.
// Launches its own ephemeral static server on a free port, starts with completely empty
// localStorage (zero overrides), and verifies desktop (1366x820) + mobile landscape (844x390) through
// full Room 0 playable completion using real canvas clicks and wheel layer shifts.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = await import('playwright').catch(() => require('playwright'));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVE_SCRIPT = path.resolve(__dirname, '../serve.js');
const OUT = process.env.OUT_DIR || '/tmp/wslice-theater-first-run';
await mkdir(OUT, { recursive: true });

const VIEWPORTS = [
  { label: 'desktop', width: 1366, height: 820, desktop: true, hasTouch: false, minCanvasRatio: 0.75, minWorldRatio: 0.50 },
  { label: 'mobile', width: 844, height: 390, desktop: false, hasTouch: true, minCanvasRatio: 0.65, minWorldRatio: 0.27 },
];

const observer = `
window.__g = () => structuredClone({
  state: model.snapshot(),
  time: model.time,
  stage: scene.onboardingStage,
  panelOpen,
  paused,
  autoPilot: autoPilot ? { targetNode: autoPilot.targetNode, altarTuning: !!autoPilot.altarTuning } : null,
  prompt: scene.pendingLayerPrompt ? {
    targetId: scene.pendingLayerPrompt.targetId,
    targetLayer: scene.pendingLayerPrompt.targetLayer,
    atNode: scene.pendingLayerPrompt.atNode,
    kind: scene.pendingLayerPrompt.kind,
  } : null,
  view: { scale: scene.scale, offsetX: scene.offsetX, offsetY: scene.offsetY },
});
window.__scene = scene;
`;

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(err => (err ? reject(err) : resolve(port)));
    });
  });
}

async function waitForServer(url, child, timeoutMs = 6000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`serve.js exited early with code ${child.exitCode}`);
    }
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 60));
  }
  throw new Error(`Timed out waiting for ephemeral server at ${url}`);
}

async function startServer() {
  if (process.env.BASE_URL) {
    return { baseUrl: process.env.BASE_URL.replace(/\/$/, ''), close: async () => {} };
  }
  const port = process.env.PORT ? Number(process.env.PORT) : await findFreePort();
  const child = spawn(process.execPath, [SERVE_SCRIPT], {
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForServer(`${baseUrl}/`, child);
  return {
    baseUrl,
    close: () => new Promise(resolve => {
      if (child.exitCode !== null) { resolve(); return; }
      const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} resolve(); }, 1500);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
      try { child.kill('SIGTERM'); } catch { clearTimeout(timer); resolve(); }
    }),
  };
}

const read = page => page.evaluate(() => window.__g());
const sceneBox = page => page.locator('#scene').boundingBox();
const toScreen = (g, box, p) => ({
  x: box.x + g.view.offsetX + p.x * g.view.scale,
  y: box.y + g.view.offsetY + p.y * g.view.scale,
});
const inside = (b, vp, pad = 1) => Boolean(
  b && b.x >= -pad && b.y >= -pad && b.x + b.width <= vp.width + pad && b.y + b.height <= vp.height + pad
);

async function clickNodeOnCanvas(page, nodeId) {
  const g = await read(page);
  const node = g.state.nodes.find(n => n.id === nodeId);
  assert.ok(node, `node "${nodeId}" exists in Room ${g.state.room}`);
  const box = await sceneBox(page);
  const pt = toScreen(g, box, node);
  assert.ok(inside({ x: pt.x, y: pt.y, width: 1, height: 1 }, { width: box.x + box.width, height: box.y + box.height }),
    `node "${nodeId}" screen point (${pt.x.toFixed(1)}, ${pt.y.toFixed(1)}) lies within #scene`);
  await page.mouse.click(pt.x, pt.y);
}

async function waitStepIdleOrGoal(page, goalFn, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let idlePolls = 0;
  while (Date.now() < deadline) {
    const g = await read(page);
    if (goalFn(g)) return g;
    const busy = Boolean(g.state.travel || g.state.wave || g.autoPilot);
    idlePolls = busy ? 0 : idlePolls + 1;
    if (idlePolls >= 3) return g;
    await page.waitForTimeout(120);
  }
  throw new Error('Timed out waiting for autopilot / travel to settle');
}

async function wheelSceneToLayer(page, targetLayer) {
  const box = await sceneBox(page);
  // Position cursor over clear upper-right sky of #scene away from bottom dock chips.
  await page.mouse.move(box.x + box.width * 0.82, box.y + box.height * 0.28);
  for (let step = 0; step < 4; step++) {
    const g = await read(page);
    if (g.state.layer === targetLayer) return;
    const deltaY = targetLayer > g.state.layer ? -120 : 120;
    const prevLayer = g.state.layer;
    await page.mouse.wheel(0, deltaY);
    await page.waitForFunction(prev => window.__g().state.layer !== prev, prevLayer, { timeout: 3000 });
    // Respect ProgressiveOnboarding's 220ms discrete-wheel step cooldown between notches.
    await page.waitForTimeout(340);
  }
  assert.equal((await read(page)).state.layer, targetLayer, `wheel reached target layer ${targetLayer}`);
}

async function driveTargetViaCanvasAndWheel(page, targetId) {
  if (targetId !== 'exit') {
    await page.waitForFunction(
      id => window.__g().state.powered.includes(id),
      targetId,
      { timeout: 8000 },
    );
  }
  let anchorShifts = 0;
  const trace = [];
  const isGoal = g => (targetId === 'exit'
    ? (g.state.phase !== 'playing' || g.state.room >= 1)
    : g.state.activated.includes(targetId) && !g.state.travel);

  await clickNodeOnCanvas(page, targetId);

  for (let round = 0; round < 10; round++) {
    const g = await waitStepIdleOrGoal(page, isGoal, 18000);
    trace.push({ node: g.state.node, layer: g.state.layer, activated: g.state.activated, prompt: g.prompt });
    if (isGoal(g)) return { anchorShifts, finalState: g.state };

    if (g.prompt && Number.isInteger(g.prompt.targetLayer) && g.prompt.targetLayer !== g.state.layer) {
      const currentNode = g.state.nodes.find(n => n.id === g.state.node);
      assert.ok(currentNode?.anchor, `stopped on an anchor (${g.state.node}) before wheel-shifting to layer ${g.prompt.targetLayer}`);
      await wheelSceneToLayer(page, g.prompt.targetLayer);
      anchorShifts += 1;
      // layerShiftAftermath schedules autoPilot resume at +700ms; wait for resume & arrival.
      await page.waitForTimeout(780);
      continue;
    }

    await clickNodeOnCanvas(page, targetId);
  }

  throw new Error(`Failed to complete target "${targetId}" via canvas click + wheel shift: ${JSON.stringify(trace)}`);
}

const server = await startServer();
const receipt = {
  name: 'theater-first-run',
  baseUrl: server.baseUrl,
  outDir: OUT,
  status: 'started',
  checks: [],
  consoleErrors: [],
  pageErrors: [],
};

const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}),
});
receipt.browserVersion = browser.version();

try {
  for (const vp of VIEWPORTS) {
    const vpKey = `${vp.width}x${vp.height}`;
    const vpConsoleErrors = [];
    const vpPageErrors = [];
    const shot = name => page.screenshot({ path: path.join(OUT, `${vpKey}-${name}.png`) });

    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      hasTouch: vp.hasTouch,
    });
    // Cold-boot empty localStorage with ZERO key overrides.
    await context.addInitScript(() => {
      if (!sessionStorage.getItem('__wslice_cold_boot_cleared')) {
        sessionStorage.setItem('__wslice_cold_boot_cleared', '1');
        localStorage.clear();
      }
    });
    await context.route('**/src/main.js', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: await response.text() + observer });
    });

    const page = await context.newPage();
    page.on('pageerror', err => {
      const entry = { viewport: vpKey, message: err.message, stack: err.stack };
      vpPageErrors.push(entry);
      receipt.pageErrors.push(entry);
    });
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const entry = { viewport: vpKey, message: msg.text() };
        vpConsoleErrors.push(entry);
        receipt.consoleErrors.push(entry);
      }
    });

    // ---- (a) Cold boot in default theater + first-run auto-equip ------------------
    await page.goto(`${server.baseUrl}/?seed=2`);
    await page.waitForFunction(() => window.__g?.()?.state, null, { timeout: 10000 });
    await page.waitForTimeout(250);

    const coldBoot = await page.evaluate(() => {
      const rect = el => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      };
      const topbarEl = document.querySelector('.topbar');
      const navItems = [...document.querySelectorAll('.topbar nav > *')]
        .filter(el => !el.hidden && getComputedStyle(el).display !== 'none')
        .map(el => ({ id: el.id || el.tagName, ...rect(el) }));
      const openDialogs = [...document.querySelectorAll('dialog[open]')].map(d => d.id);
      const descEl = document.getElementById('onboarding-desc');
      const titleEl = document.getElementById('onboarding-title');
      const posEl = document.getElementById('position-readout');
      const captionEl = document.querySelector('.scene-caption');
      return {
        isTheater: document.documentElement.classList.contains('theater'),
        storedTheater: localStorage.getItem('wslice-theater'),
        storedFirstRunDone: localStorage.getItem('wslice-first-run-done'),
        firstRunAttr: document.body.dataset.firstRun,
        stageAttr: document.body.dataset.onboardingStage,
        openDialogs,
        runPanelInert: document.getElementById('run-panel').hasAttribute('inert'),
        onboardingDescDisplay: getComputedStyle(descEl).display,
        onboardingTitle: titleEl?.textContent?.trim() || '',
        chaptersOffsetParent: document.getElementById('open-chapters')?.offsetParent ?? null,
        codexOffsetParent: document.getElementById('open-codex')?.offsetParent ?? null,
        sceneCaptionDisplay: captionEl ? getComputedStyle(captionEl).display : 'none',
        posReadoutRect: rect(posEl),
        posReadoutText: posEl?.textContent || '',
        topbar: rect(topbarEl),
        navItems,
        canvas: rect(document.getElementById('scene')),
        scrollW: document.documentElement.scrollWidth,
        scrollH: document.documentElement.scrollHeight,
      };
    });
    const g0 = await read(page);

    assert.equal(coldBoot.storedTheater, null, `${vpKey}: wslice-theater is unset on cold boot`);
    assert.equal(coldBoot.storedFirstRunDone, null, `${vpKey}: wslice-first-run-done is unset on cold boot`);
    assert.equal(coldBoot.isTheater, true, `${vpKey}: cold boot lands in html.theater layout`);
    assert.equal(coldBoot.firstRunAttr, 'true', `${vpKey}: body[data-first-run="true"] set on cold boot`);
    assert.equal(coldBoot.stageAttr, '1', `${vpKey}: body[data-onboarding-stage="1"] set on cold boot`);
    assert.equal(coldBoot.onboardingDescDisplay, 'none', `${vpKey}: #onboarding-desc is NOT auto-popped on cold boot`);
    assert.ok(coldBoot.onboardingTitle.length > 0 && coldBoot.onboardingTitle.length <= 20,
      `${vpKey}: #onboarding-title length (${coldBoot.onboardingTitle.length}) <= 20 ("${coldBoot.onboardingTitle}")`);
    assert.ok(coldBoot.onboardingTitle.includes('①'), `${vpKey}: Stage 1 #onboarding-title references ①`);
    assert.equal(coldBoot.chaptersOffsetParent, null, `${vpKey}: #open-chapters hidden on cold-boot Stage 1`);
    assert.equal(coldBoot.codexOffsetParent, null, `${vpKey}: #open-codex hidden on cold-boot Stage 1`);
    assert.deepEqual(
      coldBoot.navItems.map(i => i.id),
      ['panel-toggle', 'sound', 'help', 'restart'],
      `${vpKey}: cold-boot Stage 1 topbar shows only 4 essential controls`,
    );
    assert.equal(coldBoot.sceneCaptionDisplay, 'none', `${vpKey}: .scene-caption hidden in theater mode`);
    assert.ok(coldBoot.posReadoutRect.width <= 1 && coldBoot.posReadoutRect.height <= 1,
      `${vpKey}: #position-readout visually clipped in theater mode`);
    assert.ok(coldBoot.posReadoutText.includes('W '), `${vpKey}: #position-readout retains live textContent`);
    assert.deepEqual(coldBoot.openDialogs, [], `${vpKey}: zero modal blockers on first-run cold boot`);
    assert.equal(g0.state.phase, 'playing', `${vpKey}: state.phase is immediately 'playing'`);
    assert.equal(g0.state.room, 0, `${vpKey}: starts in Room 0`);
    assert.equal(g0.state.relics.shell, 1, `${vpKey}: starter relic 'shell' auto-equipped`);
    assert.equal(coldBoot.runPanelInert, true, `${vpKey}: #run-panel has inert attribute`);
    assert.equal(g0.panelOpen, false, `${vpKey}: panelOpen starts false`);
    assert.ok(inside(coldBoot.canvas, vp), `${vpKey}: #scene fits inside viewport`);
    assert.ok(coldBoot.scrollW <= vp.width + 1, `${vpKey}: no horizontal document overflow (${coldBoot.scrollW})`);
    if (vp.desktop) {
      assert.ok(coldBoot.scrollH <= vp.height + 1, `${vpKey}: no vertical document overflow (${coldBoot.scrollH})`);
    } else {
      assert.ok(coldBoot.topbar.height <= 56, `${vpKey}: mobile .topbar height ${coldBoot.topbar.height}px <= 56px`);
      for (const item of coldBoot.navItems) {
        assert.ok(inside(item, vp), `${vpKey}: mobile topbar control fits viewport: ${JSON.stringify(item)}`);
      }
    }

    const canvasAreaRatio = (coldBoot.canvas.width * coldBoot.canvas.height) / (vp.width * vp.height);
    const worldAreaRatio = (g0.view.scale ** 2 * 650000) / (vp.width * vp.height);
    assert.ok(
      canvasAreaRatio >= vp.minCanvasRatio,
      `${vpKey}: canvas area ratio ${canvasAreaRatio.toFixed(3)} >= ${vp.minCanvasRatio}`,
    );
    assert.ok(
      worldAreaRatio >= vp.minWorldRatio,
      `${vpKey}: fitted 1000x650 world ratio ${worldAreaRatio.toFixed(3)} >= ${vp.minWorldRatio}`,
    );
    await shot('01-cold-boot-stage1');

    receipt.checks.push({
      viewport: vpKey,
      check: 'cold-boot-theater-first-run',
      canvasAreaRatio: +canvasAreaRatio.toFixed(4),
      worldAreaRatio: +worldAreaRatio.toFixed(4),
      topbarHeight: +coldBoot.topbar.height.toFixed(1),
      passed: true,
    });

    // ---- (b) Stage 1 progressive gating & non-shifting #run-panel drawer ----------
    assert.equal(g0.stage, 1, `${vpKey}: starts at Stage 1 before first mechanism`);
    assert.equal(await page.locator('#layer-controls').evaluate(el => el.hidden), true,
      `${vpKey}: #layer-controls has hidden=true at Stage 1`);
    assert.equal(await page.locator('#layer-controls').isVisible(), false,
      `${vpKey}: #layer-controls is not visible at Stage 1`);

    // Explicit click on .onboarding-main opens and closes #onboarding-desc cleanly
    await page.locator('#onboarding-banner .onboarding-main').click();
    assert.equal(
      await page.evaluate(() => getComputedStyle(document.getElementById('onboarding-desc')).display),
      'block',
      `${vpKey}: clicking .onboarding-main explicitly opens #onboarding-desc`,
    );
    await page.locator('#onboarding-banner .onboarding-main').click();
    assert.equal(
      await page.evaluate(() => getComputedStyle(document.getElementById('onboarding-desc')).display),
      'none',
      `${vpKey}: second click on .onboarding-main closes #onboarding-desc`,
    );

    const sceneBeforeDrawer = await sceneBox(page);
    await page.locator('#panel-toggle').click();
    await page.waitForFunction(
      () => window.__g().panelOpen === true && !document.getElementById('run-panel').hasAttribute('inert'),
      null,
      { timeout: 3000 },
    );
    await page.waitForTimeout(350);
    const openPanelBox = await page.locator('#run-panel').boundingBox();
    assert.ok(inside(openPanelBox, vp), `${vpKey}: opened #run-panel is inside viewport`);

    const sceneDuringDrawer = await sceneBox(page);
    for (const k of ['x', 'y', 'width', 'height']) {
      assert.ok(
        Math.abs(sceneDuringDrawer[k] - sceneBeforeDrawer[k]) <= 0.5,
        `${vpKey}: opening #run-panel did not shift #scene.${k} (${sceneBeforeDrawer[k]} -> ${sceneDuringDrawer[k]})`,
      );
    }
    await shot('02-stage1-drawer-open');

    await page.locator('#panel-toggle').click();
    await page.waitForFunction(
      () => window.__g().panelOpen === false && document.getElementById('run-panel').hasAttribute('inert'),
      null,
      { timeout: 3000 },
    );
    await page.waitForTimeout(350);
    const sceneAfterDrawer = await sceneBox(page);
    for (const k of ['x', 'y', 'width', 'height']) {
      assert.ok(
        Math.abs(sceneAfterDrawer[k] - sceneBeforeDrawer[k]) <= 0.5,
        `${vpKey}: closing #run-panel did not shift #scene.${k} (${sceneBeforeDrawer[k]} -> ${sceneAfterDrawer[k]})`,
      );
    }

    receipt.checks.push({
      viewport: vpKey,
      check: 'stage1-gating-and-drawer',
      passed: true,
    });

    // ---- (c) Full Room 0 playable completion via real canvas clicks + wheel -------
    const order = g0.state.mechanismOrder;
    assert.equal(order.length, 3, `${vpKey}: Room 0 has 3 mechanisms`);

    // 1. Click mechanism ① on #scene -> auto-walk & auto-activate -> Stage 2 unlocks #layer-controls
    const mech1 = order[0];
    await clickNodeOnCanvas(page, mech1);
    await page.waitForFunction(
      id => {
        const s = window.__g().state;
        return s.node === id && !s.travel && s.activated.includes(id);
      },
      mech1,
      { timeout: 15000 },
    );

    const gStage2 = await read(page);
    assert.ok(gStage2.stage >= 2, `${vpKey}: lighting mechanism ① advances onboarding to Stage >= 2 (got ${gStage2.stage})`);
    const stage2Hud = await page.evaluate(() => ({
      descDisplay: getComputedStyle(document.getElementById('onboarding-desc')).display,
      title: document.getElementById('onboarding-title')?.textContent?.trim() || '',
    }));
    assert.equal(stage2Hud.descDisplay, 'none', `${vpKey}: Stage 2 transition does not auto-pop #onboarding-desc`);
    assert.ok(stage2Hud.title.length > 0 && stage2Hud.title.length <= 20,
      `${vpKey}: Stage 2 #onboarding-title length (${stage2Hud.title.length}) <= 20 ("${stage2Hud.title}")`);
    assert.ok(!stage2Hud.title.includes('站在 ⚓ 归响台上滚轮'),
      `${vpKey}: Stage 2 title does not contain obsolete wheel prompt ("${stage2Hud.title}")`);
    assert.equal(await page.locator('#layer-controls').evaluate(el => el.hidden), false,
      `${vpKey}: #layer-controls is unhidden at Stage 2`);
    assert.equal(await page.locator('#layer-controls').isVisible(), true,
      `${vpKey}: #layer-controls is visible at Stage 2`);
    for (const layerIdx of [0, 1, 2]) {
      assert.equal(await page.locator(`#layer-${layerIdx}`).isVisible(), true,
        `${vpKey}: #layer-${layerIdx} button remains present and visible on W-ruler`);
    }
    const layerControlsBox = await page.locator('#layer-controls').boundingBox();
    assert.ok(inside(layerControlsBox, vp), `${vpKey}: #layer-controls fits inside viewport in theater mode`);
    await shot('03-stage2-unlocked');

    // 2. Complete remaining Room 0 mechanisms (② and ③) via canvas click -> anchor walk -> wheel shift -> activate
    let totalAnchorWheelShifts = 0;
    for (const mechId of order.slice(1)) {
      const res = await driveTargetViaCanvasAndWheel(page, mechId);
      totalAnchorWheelShifts += res.anchorShifts;
      assert.ok(res.finalState.activated.includes(mechId), `${vpKey}: mechanism "${mechId}" activated`);
    }
    assert.ok(totalAnchorWheelShifts >= 1, `${vpKey}: performed >= 1 real anchor wheel layer shift (got ${totalAnchorWheelShifts})`);

    const gAllLit = await read(page);
    assert.equal(gAllLit.state.activated.length, 3, `${vpKey}: all 3 Room 0 mechanisms activated`);
    assert.equal(gAllLit.state.stats.failures, 0, `${vpKey}: 0 failures during Room 0 completion`);
    await shot('04-all-mechanisms-lit');

    // 3. Click exit on #scene -> walk to exit -> reach interlude choice dialog & advance to Room 1
    const exitRes = await driveTargetViaCanvasAndWheel(page, 'exit');
    totalAnchorWheelShifts += exitRes.anchorShifts;

    await page.waitForFunction(
      () => {
        const s = window.__g().state;
        return s.phase === 'interlude' || s.room >= 1 || document.getElementById('choice-dialog')?.open;
      },
      null,
      { timeout: 10000 },
    );

    const gExit = await read(page);
    assert.equal(gExit.state.phase, 'interlude', `${vpKey}: reaching exit enters interlude relic choice`);
    assert.equal(await page.locator('#choice-dialog').evaluate(d => d.open), true,
      `${vpKey}: #choice-dialog opens after Room 0 exit`);
    const relicChoicesBox = await page.locator('#relic-choices').boundingBox();
    assert.ok(inside(relicChoicesBox, vp),
      `${vpKey}: #relic-choices fits completely inside viewport without clipping (${JSON.stringify(relicChoicesBox)})`);
    assert.equal(await page.evaluate(() => localStorage.getItem('wslice-first-run-done')), null,
      `${vpKey}: completing Room 0 leaves wslice-first-run-done unset until won`);
    assert.equal(await page.evaluate(() => document.body.dataset.firstRun), 'true',
      `${vpKey}: first-run protection remains active in Room 0 interlude`);
    await shot('05-room0-complete-interlude');

    await page.locator('#relic-choices button').first().click();
    await page.waitForFunction(
      () => {
        const s = window.__g().state;
        return s.phase === 'playing' && s.room === 1 && !document.getElementById('choice-dialog')?.open;
      },
      null,
      { timeout: 10000 },
    );
    const room1Hud = await page.evaluate(() => {
      const b = document.getElementById('onboarding-banner');
      return {
        firstRunDone: localStorage.getItem('wslice-first-run-done'),
        firstRunAttr: document.body.dataset.firstRun,
        firstRunPending: document.body.classList.contains('first-run-pending'),
        collapsed: b?.classList.contains('collapsed') ?? true,
        nextAction: b?.dataset.nextAction || '',
        title: document.getElementById('onboarding-title')?.textContent?.trim() || '',
      };
    });
    assert.equal(room1Hud.firstRunDone, null, `${vpKey}: entering Room 1 keeps wslice-first-run-done unset`);
    assert.equal(room1Hud.firstRunAttr, 'true', `${vpKey}: entering Room 1 keeps data-first-run="true"`);
    assert.equal(room1Hud.firstRunPending, true, `${vpKey}: entering Room 1 keeps first-run-pending`);
    assert.equal(room1Hud.collapsed, false, `${vpKey}: Room 1 onboarding banner stays expanded`);
    assert.notEqual(room1Hud.nextAction, '', `${vpKey}: Room 1 onboarding banner exposes describeNextStep action`);
    assert.ok(room1Hud.title.length > 0 && !/点亮全部/.test(room1Hud.title),
      `${vpKey}: Room 1 onboarding title shows concrete next step ("${room1Hud.title}")`);
    await shot('06-room1-entered');

    // ---- (d) Guarded synthetic PointerEvent check on #scene & #hyper-lab-canvas ---
    await page.evaluate(() => {
      const sceneEl = document.getElementById('scene');
      const s = window.__scene;
      const hub = s.state.nodes.find(n => n.id === 'hub');
      const a = s.currentW() * Math.PI * 2 - Math.PI / 2;
      const r = sceneEl.getBoundingClientRect();
      const bx = r.left + s.offsetX + (hub.x + Math.cos(a) * 51) * s.scale;
      const by = r.top + s.offsetY + (hub.y - 2 + Math.sin(a) * 27) * s.scale;
      // Synthetic pointerId without an active hardware pointer previously threw NotFoundError
      sceneEl.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 9999, button: 0, clientX: bx, clientY: by, bubbles: true }));
      sceneEl.dispatchEvent(new PointerEvent('pointerup', { pointerId: 9999, button: 0, clientX: bx, clientY: by, bubbles: true }));
    });
    await page.locator('#open-hyper-lab').click();
    await page.waitForFunction(() => document.getElementById('hyper-lab-dialog')?.open === true, null, { timeout: 3000 });
    await page.evaluate(() => {
      const labCanvas = document.getElementById('hyper-lab-canvas');
      const r = labCanvas.getBoundingClientRect();
      labCanvas.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 9998, button: 0, clientX: r.left + 40, clientY: r.top + 40, bubbles: true }));
      labCanvas.dispatchEvent(new PointerEvent('pointerup', { pointerId: 9998, button: 0, clientX: r.left + 45, clientY: r.top + 45, bubbles: true }));
    });
    await page.locator('[data-close-hyper-lab]').first().click();
    await page.waitForFunction(() => document.getElementById('hyper-lab-dialog')?.open === false, null, { timeout: 3000 });

    assert.deepEqual(vpConsoleErrors, [], `${vpKey}: 0 console errors`);
    assert.deepEqual(vpPageErrors, [], `${vpKey}: 0 uncaught pageerrors`);

    receipt.checks.push({
      viewport: vpKey,
      check: 'room0-full-completion-and-pointer-guard',
      anchorWheelShifts: totalAnchorWheelShifts,
      roomReached: 1,
      passed: true,
    });

    await context.close();
  }

  assert.deepEqual(receipt.consoleErrors, [], '0 console errors across all viewports');
  assert.deepEqual(receipt.pageErrors, [], '0 uncaught pageerrors across all viewports');
  receipt.status = 'passed';
} catch (error) {
  receipt.status = 'failed';
  receipt.failure = error?.stack || String(error);
  process.exitCode = 1;
} finally {
  await browser.close();
  await server.close();
  await writeFile(path.join(OUT, 'receipt.json'), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({
    name: receipt.name,
    status: receipt.status,
    checks: receipt.checks.length,
    consoleErrors: receipt.consoleErrors.length,
    pageErrors: receipt.pageErrors.length,
    failure: receipt.failure?.split('\n')[0] || null,
    outDir: OUT,
  }));
  if (receipt.failure) console.error(receipt.failure);
}
