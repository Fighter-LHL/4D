// Playtest regressions for the first courtyard (theater, seed=2):
// (a) a newcomer who only follows the onboarding hint clears the room
// (b) the Stage 1 wheel does not change layer or skip onboarding
// (c) Space after closing Help or cancelling Restart does not reopen the dialog
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = await import('playwright').catch(() => require('playwright'));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVE_SCRIPT = path.resolve(__dirname, '../serve.js');
const OUT = process.env.OUT_DIR || '/tmp/wslice-first-game-playtest';
await mkdir(OUT, { recursive: true });

const VIEWPORTS = [
  { label: 'desktop', width: 1280, height: 800, hasTouch: false, isMobile: false },
  { label: 'mobile', width: 844, height: 390, hasTouch: true, isMobile: true },
];
const BADGES = ['①', '②', '③', '④'];

const observer = `
window.__g = () => structuredClone({
  state: model.snapshot(),
  stage: scene.onboardingStage,
  autoPilot: autoPilot ? { targetNode: autoPilot.targetNode } : null,
  view: { scale: scene.scale, offsetX: scene.offsetX, offsetY: scene.offsetY },
});
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
    if (child.exitCode !== null) throw new Error(`serve.js exited early with code ${child.exitCode}`);
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 60));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function startServer() {
  if (process.env.BASE_URL) return { baseUrl: process.env.BASE_URL.replace(/\/$/, ''), close: async () => {} };
  const port = await findFreePort();
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

const server = await startServer();
const receipt = {
  name: 'first-game-playtest',
  baseUrl: server.baseUrl,
  outDir: OUT,
  status: 'started',
  checks: [],
  hints: [],
  consoleErrors: [],
  pageErrors: [],
};
const defaultChrome = existsSync('/usr/local/bin/google-chrome') ? '/usr/local/bin/google-chrome' : undefined;
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || defaultChrome;
const browser = await chromium.launch({
  headless: true,
  ...(executablePath ? { executablePath } : {}),
});
receipt.browserVersion = browser.version();

async function openCold(vp, seed = 2) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    hasTouch: vp.hasTouch,
    isMobile: Boolean(vp.isMobile),
  });
  await context.addInitScript(() => {
    localStorage.clear();
  });
  await context.route('**/src/main.js', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + observer });
  });
  const page = await context.newPage();
  const vpKey = `${vp.width}x${vp.height}`;
  page.on('pageerror', err => receipt.pageErrors.push({ viewport: vpKey, message: err.message }));
  page.on('console', msg => {
    if (msg.type() === 'error') receipt.consoleErrors.push({ viewport: vpKey, message: msg.text() });
  });
  await page.goto(`${server.baseUrl}/?seed=${seed}`);
  await page.waitForFunction(() => window.__g?.()?.state?.phase === 'playing', null, { timeout: 10000 });
  await page.waitForTimeout(250);
  return { context, page };
}

const read = page => page.evaluate(() => window.__g());
const hintOf = page => page.evaluate(() => {
  const banner = document.getElementById('onboarding-banner');
  return {
    title: document.getElementById('onboarding-title')?.textContent?.trim() || '',
    badge: document.getElementById('onboarding-badge')?.textContent?.trim() || '',
    desc: document.getElementById('onboarding-desc')?.textContent?.trim() || '',
    action: banner?.dataset.nextAction || '',
    goal: banner?.dataset.nextGoal || '',
    target: banner?.dataset.nextTarget || '',
    layer: banner?.dataset.nextLayer || '',
    stage: document.body.dataset.onboardingStage || '',
    collapsed: banner?.classList.contains('collapsed') ?? true,
    firstRunDone: localStorage.getItem('wslice-first-run-done'),
    firstRunAttr: document.body.dataset.firstRun || '',
    firstRunPending: document.body.classList.contains('first-run-pending'),
  };
});

async function clickNode(page, id, { tap = false } = {}) {
  const g = await read(page);
  const node = g.state.nodes.find(n => n.id === id);
  assert.ok(node, `node ${id} exists`);
  const box = await page.locator('#scene').boundingBox();
  const x = box.x + g.view.offsetX + node.x * g.view.scale;
  const y = box.y + g.view.offsetY + node.y * g.view.scale;
  if (tap) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

async function wheelTo(page, targetLayer) {
  const box = await page.locator('#scene').boundingBox();
  await page.mouse.move(box.x + box.width * 0.82, box.y + box.height * 0.22);
  for (let step = 0; step < 4; step++) {
    const g = await read(page);
    if (g.state.layer === targetLayer) return;
    const prev = g.state.layer;
    await page.mouse.wheel(0, targetLayer > prev ? -140 : 140);
    await page.waitForTimeout(380);
  }
}

async function waitSettled(page, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  let stable = 0;
  let last = '';
  while (Date.now() < deadline) {
    const g = await read(page);
    if (g.state.phase !== 'playing') return g;
    const busy = Boolean(g.state.travel || g.state.wave || g.autoPilot);
    const sig = `${g.state.node}|${g.state.layer}|${g.state.activated.join(',')}|${busy ? 1 : 0}`;
    stable = !busy && sig === last ? stable + 1 : 0;
    last = sig;
    if (!busy && stable >= 2) return g;
    await page.waitForTimeout(140);
  }
  throw new Error('timed out waiting for the hint follower to settle');
}

async function clearByHints(page, vp, { shot = false, tap = false, expectedRoom = 0 } = {}) {
  const vpKey = `${vp.width}x${vp.height}`;
  let sawBellHint = false;
  let stuck = 0;
  let lastSig = '';
  for (let turn = 0; turn < 32; turn++) {
    const settled = await waitSettled(page);
    if (settled.state.phase !== 'playing' || settled.state.room > expectedRoom) break;
    const hint = await hintOf(page);
    const g = await read(page);
    assert.ok(hint.title, `${vpKey} room ${expectedRoom} turn ${turn}: next-step hint is empty`);
    assert.equal(hint.collapsed, false, `${vpKey} room ${expectedRoom} turn ${turn}: onboarding banner stays expanded`);
    assert.notEqual(hint.action, '', `${vpKey} room ${expectedRoom} turn ${turn}: onboarding banner exposes nextAction`);
    assert.ok(!/点亮全部|先走到 ⚓/.test(hint.title),
      `${vpKey} room ${expectedRoom} turn ${turn}: title is concrete next step, not stage summary ("${hint.title}")`);
    assert.equal(hint.firstRunDone, null,
      `${vpKey} room ${expectedRoom} turn ${turn}: wslice-first-run-done stays unset while playing`);
    assert.equal(hint.firstRunAttr, 'true',
      `${vpKey} room ${expectedRoom} turn ${turn}: data-first-run stays "true" while playing`);
    if (hint.goal && hint.goal !== 'exit') {
      assert.ok(!g.state.activated.includes(hint.goal), `${vpKey} room ${expectedRoom} turn ${turn}: hint targets lit ${hint.goal}`);
      const badge = BADGES[g.state.mechanismOrder.indexOf(hint.goal)];
      assert.ok(hint.title.includes(badge), `${vpKey} room ${expectedRoom} turn ${turn}: "${hint.title}" does not name ${badge}`);
    }
    if (hint.goal === 'exit') {
      assert.ok(hint.title.includes('🚪') || hint.title.includes('出口'), `${vpKey} room ${expectedRoom} turn ${turn}: exit hint missing ("${hint.title}")`);
    }
    if (hint.action === 'move') {
      const target = g.state.nodes.find(node => node.id === hint.target);
      if (target && !target.anchor && target.layer === g.state.layer) {
        assert.equal(target.present, true, `${vpKey}: hint tells us to click ${hint.target} but it is not present`);
      }
    }
    if (expectedRoom === 0 && g.state.activated.length === 2 && hint.goal === 'bell') {
      assert.ok(hint.title.includes('③'), `${vpKey}: 2/3 hint must name ③ ("${hint.title}")`);
      assert.ok(!/点亮全部/.test(hint.title), `${vpKey}: 2/3 hint is still the generic stage line ("${hint.title}")`);
      if (hint.action === 'shift') {
        assert.ok(/上滚|下滚/.test(hint.title), `${vpKey}: 2/3 shift hint names a direction ("${hint.title}")`);
        assert.equal(hint.desc.includes('同一位置'), true, `${vpKey}: 2/3 explanation says ③ shares a position`);
      }
      if (shot && g.state.node === 'hub' && hint.action === 'shift') {
        await page.screenshot({ path: path.join(OUT, `${vpKey}-after-2of3-hint.png`) });
        sawBellHint = true;
      } else if (!shot) sawBellHint = true;
    }
    const sig = `${g.state.room}|${g.state.node}|${g.state.layer}|${g.state.activated.join(',')}|${hint.title}`;
    stuck = sig === lastSig ? stuck + 1 : 0;
    lastSig = sig;
    assert.ok(stuck < 3, `${vpKey} room ${expectedRoom}: hint follower stuck on "${hint.title}" at ${g.state.node}@${g.state.layer} lit ${g.state.activated.join(',')}`);
    receipt.hints.push({ viewport: vpKey, room: g.state.room, turn, node: g.state.node, layer: g.state.layer, activated: [...g.state.activated], ...hint });

    if (hint.action === 'shift') {
      const layer = Number(hint.layer);
      assert.ok(Number.isInteger(layer), `${vpKey}: shift hint has a layer`);
      if (vp.hasTouch) {
        if (tap) await page.locator(`#layer-${layer}`).tap();
        else await page.locator(`#layer-${layer}`).click();
      } else await wheelTo(page, layer);
    } else if (hint.action === 'move' || hint.action === 'done') {
      await clickNode(page, hint.target || hint.goal, { tap });
    } else if (hint.action === 'recover') {
      await page.keyboard.press(['z', 'x', 'c'][Number(hint.layer)] || 'c');
    } else if (hint.action === 'activate') {
      await page.waitForTimeout(900);
    } else {
      await page.waitForTimeout(400);
    }
  }
  const expectedDonePhase = expectedRoom >= 2 ? 'won' : 'interlude';
  await page.waitForFunction(({ expectedRoom, expectedDonePhase }) => {
    const s = window.__g().state;
    return s.phase === expectedDonePhase || s.room > expectedRoom;
  }, { expectedRoom, expectedDonePhase }, { timeout: 8000 });
  const done = await read(page);
  assert.equal(done.state.phase, expectedDonePhase, `${vpKey} room ${expectedRoom}: hint follower reaches ${expectedDonePhase}`);
  assert.equal(done.state.activated.length, 3, `${vpKey} room ${expectedRoom}: all three mechanisms were lit`);
  assert.equal(done.state.stats.failures, 0, `${vpKey} room ${expectedRoom}: hint follower took no failing routes`);
  if (shot && expectedRoom === 0) assert.ok(sawBellHint, `${vpKey}: captured the 2/3 hint`);
  return done;
}

try {
  for (const vp of VIEWPORTS) {
    const vpKey = `${vp.width}x${vp.height}`;

    // (c) Space after closing Help or cancelling Restart does not reopen the dialog.
    for (const spec of [
      { name: 'help-close', open: '#help', dialog: '#help-dialog', dismiss: '#close-help' },
      { name: 'help-done', open: '#help', dialog: '#help-dialog', dismiss: '#help-done' },
      { name: 'restart-cancel', open: '#restart', dialog: '#restart-dialog', dismiss: '#cancel-restart' },
    ]) {
      const { context, page } = await openCold(vp);
      await page.locator(spec.open).click();
      await page.locator(`${spec.dialog}[open]`).waitFor();
      await page.locator(spec.dismiss).click();
      await page.waitForTimeout(80);
      assert.equal(await page.locator('dialog[open]').count(), 0, `${vpKey} ${spec.name}: dialog stays closed`);
      const focusId = await page.evaluate(() => document.activeElement?.id || '');
      assert.ok(!['help', 'close-help', 'help-done', 'restart', 'cancel-restart'].includes(focusId),
        `${vpKey} ${spec.name}: focus left the dialog buttons (got #${focusId})`);
      await page.keyboard.press('Space');
      await page.waitForTimeout(120);
      assert.equal(await page.locator(spec.dialog).evaluate(el => el.open), false,
        `${vpKey} ${spec.name}: Space does not reopen the dialog`);
      receipt.checks.push({ viewport: vpKey, check: spec.name, focusId, passed: true });
      await context.close();
    }

    // (b) Stage 1 wheel does not change layer or advance onboarding.
    {
      const { context, page } = await openCold(vp);
      const before = await read(page);
      const beforeHint = await hintOf(page);
      assert.equal(before.stage, 1, `${vpKey}: starts at stage 1`);
      assert.equal(before.state.layer, 2, `${vpKey}: seed 2 starts on the top layer, so a downward wheel is a real change`);
      const box = await page.locator('#scene').boundingBox();
      await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.35);
      await page.mouse.wheel(0, 160);
      await page.waitForTimeout(450);
      const after = await read(page);
      const afterHint = await hintOf(page);
      assert.equal(after.state.layer, before.state.layer, `${vpKey}: Stage 1 wheel does not change layer`);
      assert.equal(after.state.w, before.state.w, `${vpKey}: Stage 1 wheel does not change W`);
      assert.equal(after.stage, 1, `${vpKey}: Stage 1 wheel does not advance onboarding (stage ${after.stage})`);
      assert.equal(afterHint.stage, '1', `${vpKey}: onboarding stage attribute stays 1`);
      assert.ok(afterHint.badge.startsWith('1/4'), `${vpKey}: badge stays on step 1 (${afterHint.badge})`);
      assert.ok(afterHint.title.includes('①'), `${vpKey}: Stage 1 hint still targets ① ("${afterHint.title}")`);
      assert.equal(await page.locator('#layer-controls').evaluate(el => el.hidden), true, `${vpKey}: layer controls stay hidden`);
      for (const key of ['z', 'x', 'c']) {
        await page.keyboard.press(key);
        await page.waitForTimeout(120);
      }
      const keyed = await read(page);
      const keyedHint = await hintOf(page);
      assert.equal(keyed.state.layer, before.state.layer, `${vpKey}: Z/X/C do not change layer in Stage 1`);
      assert.equal(keyed.state.w, before.state.w, `${vpKey}: Z/X/C do not change W in Stage 1`);
      assert.equal(keyed.stage, 1, `${vpKey}: layer keys do not advance onboarding`);
      assert.equal(keyedHint.stage, '1');
      assert.ok(keyedHint.badge.startsWith('1/4'), keyedHint.badge);
      for (let i = 0; i < 60; i++) await page.keyboard.press('a');
      for (let i = 0; i < 60; i++) await page.keyboard.press('d');
      await page.waitForTimeout(80);
      if (vp.label === 'desktop') {
        await page.screenshot({ path: path.join(OUT, 'after-stage1-many-a-d.png') });
      }
      const nudged = await read(page);
      const nudgedHint = await hintOf(page);
      const firstId = before.state.mechanismOrder[0];
      const firstNode = nudged.state.nodes.find(node => node.id === firstId);
      assert.equal(nudged.state.layer, before.state.layer, `${vpKey}: A/D cannot cross into another layer in Stage 1`);
      assert.equal(nudged.stage, 1, `${vpKey}: A/D does not advance onboarding`);
      assert.equal(firstNode.present, true, `${vpKey}: ① stays present after A/D (w=${nudged.state.w})`);
      assert.equal(nudged.state.canMove, true, `${vpKey}: the bridge to ① stays walkable after A/D`);
      assert.equal(nudgedHint.action, 'move', `${vpKey}: hint still says to click ① ("${nudgedHint.title}")`);
      assert.ok(nudgedHint.title.includes('①'), nudgedHint.title);
      await page.locator('#w-slider').evaluate(el => {
        el.value = '0';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.value = '1';
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await page.waitForTimeout(80);
      const slid = await read(page);
      const slidNode = slid.state.nodes.find(node => node.id === firstId);
      assert.equal(slid.stage, 1, `${vpKey}: slider does not advance onboarding`);
      assert.equal(slid.state.layer, before.state.layer, `${vpKey}: slider stays on the starting layer`);
      assert.equal(slidNode.present, true, `${vpKey}: ① stays present after the slider (w=${slid.state.w})`);
      assert.equal(slid.state.canMove, true, `${vpKey}: bridge stays walkable after the slider`);

      await clickNode(page, before.state.mechanismOrder[0]);
      await page.waitForFunction(id => {
        const g = window.__g();
        return g.state.activated.includes(id) && !g.state.travel && g.stage >= 2;
      }, before.state.mechanismOrder[0], { timeout: 15000 });
      if ((await read(page)).state.node !== 'hub') {
        await clickNode(page, 'hub');
        await page.waitForFunction(() => window.__g().state.node === 'hub' && !window.__g().state.travel, null, { timeout: 10000 });
      }
      const taught = await read(page);
      await page.keyboard.press('z');
      await page.waitForTimeout(250);
      const switched = await read(page);
      assert.equal(switched.state.layer, 0, `${vpKey}: after Stage 2, Z still switches to layer 0`);
      assert.ok(switched.stage >= 2, `${vpKey}: Z after the lesson keeps stage ${switched.stage}`);
      assert.notEqual(switched.state.layer, taught.state.layer);
      receipt.checks.push({ viewport: vpKey, check: 'stage1-layer-inputs', stageBefore: 1, stageAfter: switched.stage, passed: true });
      await clearByHints(page, vp);
      receipt.checks.push({ viewport: vpKey, check: 'stage1-ad-then-clear', passed: true });
      await context.close();
    }

    // Two anchors: the hint names the other one, and switches once you are standing on it.
    {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        hasTouch: vp.hasTouch,
      });
      await context.addInitScript(() => localStorage.clear());
      await context.route('**/src/main.js', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: await response.text() + observer });
      });
      const page = await context.newPage();
      page.on('pageerror', err => receipt.pageErrors.push({ viewport: vpKey, message: err.message }));
      await page.goto(`${server.baseUrl}/?seed=401491695`);
      await page.waitForFunction(() => window.__g?.()?.state?.phase === 'playing', null, { timeout: 10000 });
      await page.waitForTimeout(200);
      const room = await read(page);
      assert.equal(room.state.roomId, 'split', `${vpKey}: seed 401491695 is 分源架桥庭`);
      const dew = room.state.mechanismOrder[0];
      await clickNode(page, dew);
      await page.waitForFunction(id => window.__g().state.activated.includes(id) && !window.__g().state.travel, dew, { timeout: 15000 });
      await clickNode(page, 'relay');
      await page.waitForFunction(() => window.__g().state.node === 'relay' && !window.__g().state.travel && !window.__g().autoPilot, null, { timeout: 15000 });
      const onRelay = await hintOf(page);
      assert.equal(onRelay.action, 'move', `${vpKey}: on 维度锚台 the next step is to leave (${onRelay.title})`);
      assert.equal(onRelay.target, 'hub');
      assert.ok(onRelay.title.includes('归响'), `${vpKey}: hint distinguishes 归响, got "${onRelay.title}"`);
      assert.match(onRelay.desc, /归响台/);
      assert.ok(!onRelay.title.includes('先回⚓台'), onRelay.title);
      assert.ok(onRelay.title.includes('②'), onRelay.title);
      await clickNode(page, 'hub');
      await page.waitForFunction(() => window.__g().state.node === 'hub' && !window.__g().state.travel && !window.__g().autoPilot, null, { timeout: 15000 });
      const onHub = await hintOf(page);
      assert.equal(onHub.action, 'move', `${vpKey}: on 归响台 the hint boards the W-ramp (${onHub.title})`);
      assert.equal(onHub.target, 'bell');
      assert.equal(onHub.title, '走上斜桥点亮②');
      await clickNode(page, 'bell');
      await page.waitForFunction(() => window.__g().state.activated.includes('bell') && !window.__g().state.travel && !window.__g().autoPilot, null, { timeout: 15000 });
      await clickNode(page, 'relay');
      await page.waitForFunction(() => window.__g().state.node === 'relay' && !window.__g().state.travel && !window.__g().autoPilot, null, { timeout: 15000 });
      const onRelayShift = await hintOf(page);
      assert.equal(onRelayShift.action, 'shift', `${vpKey}: on 维度锚台 for ③ the hint switches layers (${onRelayShift.title})`);
      assert.match(onRelayShift.title, /上滚|下滚/);
      assert.ok(onRelayShift.title.includes('③'), onRelayShift.title);
      assert.match(onRelayShift.desc, /就在维度锚台/);
      receipt.checks.push({ viewport: vpKey, check: 'named-anchor-hint', onRelay: onRelay.title, onHub: onHub.title, onRelayShift: onRelayShift.title, passed: true });
      await context.close();
    }

    // Stage 2 drifted W: after lighting ①, pressing D past the bridge range (~0.93+) must NOT
    // falsely claim off-layer ② is on the current layer, and clearByHints still clears Room 0.
    {
      const { context, page } = await openCold(vp);
      const initial = await read(page);
      const firstId = initial.state.mechanismOrder[0];
      await clickNode(page, firstId);
      await page.waitForFunction(id => {
        const g = window.__g();
        return g.state.activated.includes(id) && !g.state.travel && !g.autoPilot && g.stage >= 2;
      }, firstId, { timeout: 15000 });
      for (let i = 0; i < 9; i++) await page.keyboard.press('d');
      await page.waitForTimeout(80);
      const drifted = await read(page);
      const driftedHint = await hintOf(page);
      const secondId = drifted.state.mechanismOrder[1];
      const secondNode = drifted.state.nodes.find(node => node.id === secondId);
      assert.ok(drifted.stage >= 2, `${vpKey}: in Stage >= 2 after lighting ① (got ${drifted.stage})`);
      assert.ok(drifted.state.w >= 0.93, `${vpKey}: repeated D pushed W >= 0.93 (got ${drifted.state.w})`);
      assert.equal(drifted.state.layer, 2, `${vpKey}: still in layer 2 at w=${drifted.state.w}`);
      assert.notEqual(secondNode.layer, drifted.state.layer, `${vpKey}: ② is on another layer (${secondNode.layer})`);
      assert.equal(secondNode.present, false, `${vpKey}: ② is not present at w=${drifted.state.w}`);
      assert.notEqual(driftedHint.action, 'recover', `${vpKey}: must not emit recover for off-layer ② ("${driftedHint.title}")`);
      assert.doesNotMatch(driftedHint.title, /回中心见②/, `${vpKey}: title must not say 回中心见② ("${driftedHint.title}")`);
      assert.doesNotMatch(driftedHint.desc, /②还在这一层|还在这一层/, `${vpKey}: desc must not claim ②还在这一层 ("${driftedHint.desc}")`);
      assert.ok(driftedHint.title.includes('②'), `${vpKey}: hint still names ② ("${driftedHint.title}")`);
      assert.ok(driftedHint.title.length <= 20, `${vpKey}: banner <= 20 chars ("${driftedHint.title}")`);
      receipt.checks.push({
        viewport: vpKey,
        check: 'stage2-drifted-w-off-layer-goal',
        w: +drifted.state.w.toFixed(3),
        layer: drifted.state.layer,
        title: driftedHint.title,
        action: driftedHint.action,
        passed: true,
      });
      await clearByHints(page, vp);
      receipt.checks.push({ viewport: vpKey, check: 'stage2-drifted-w-then-clear', passed: true });
      await context.close();
    }

    // (a) Hint-following newcomer clears all 3 courtyards of the first game,
    // first-run-done stays unset until won (and never on interlude or lost),
    // and returning players revert to the non-tutorial collapsible HUD.
    {
      const { context, page } = await openCold(vp);
      await clearByHints(page, vp, { shot: true, tap: vp.hasTouch, expectedRoom: 0 });
      const interlude0 = await hintOf(page);
      assert.equal(interlude0.firstRunDone, null, `${vpKey}: Room 0 interlude keeps wslice-first-run-done unset`);
      assert.equal(interlude0.firstRunAttr, 'true', `${vpKey}: Room 0 interlude keeps data-first-run="true"`);
      assert.equal(interlude0.firstRunPending, true, `${vpKey}: Room 0 interlude keeps first-run-pending`);
      receipt.checks.push({ viewport: vpKey, check: 'hint-follower-clears-room0', passed: true });

      // Enter Room 1 (第 2 庭) and wait past the 4.5s stage-announcement window: banner must stay expanded with concrete next step.
      await page.locator('#relic-choices button').first().click();
      await page.waitForFunction(
        () => window.__g().state.phase === 'playing' && window.__g().state.room === 1 && !document.getElementById('choice-dialog')?.open,
        null,
        { timeout: 10000 },
      );
      await page.waitForTimeout(4800);
      const room1Entry = await hintOf(page);
      assert.equal(room1Entry.collapsed, false, `${vpKey}: Room 1 entry banner stays expanded past 4.5s`);
      assert.notEqual(room1Entry.action, '', `${vpKey}: Room 1 entry banner exposes describeNextStep action`);
      assert.ok(room1Entry.title.length > 0 && room1Entry.title.length <= 20, `${vpKey}: Room 1 entry title length valid ("${room1Entry.title}")`);
      assert.ok(!/点亮全部|先走到 ⚓/.test(room1Entry.title), `${vpKey}: Room 1 entry shows concrete hint, not stage summary ("${room1Entry.title}")`);
      assert.equal(room1Entry.firstRunDone, null, `${vpKey}: Room 1 entry keeps wslice-first-run-done unset`);
      await page.screenshot({ path: path.join(OUT, `after-room2-entry-${vp.width}.png`) });

      await clearByHints(page, vp, { tap: vp.hasTouch, expectedRoom: 1 });
      const interlude1 = await hintOf(page);
      assert.equal(interlude1.firstRunDone, null, `${vpKey}: Room 1 interlude keeps wslice-first-run-done unset`);
      assert.equal(interlude1.firstRunAttr, 'true', `${vpKey}: Room 1 interlude keeps data-first-run="true"`);
      receipt.checks.push({ viewport: vpKey, check: 'hint-follower-clears-room1', entryHint: room1Entry.title, passed: true });

      // Enter Room 2 (第 3 庭, where onboarding stage is 4) and wait past 4.5s: banner must still stay expanded with concrete next step.
      await page.locator('#relic-choices button').first().click();
      await page.waitForFunction(
        () => window.__g().state.phase === 'playing' && window.__g().state.room === 2 && !document.getElementById('choice-dialog')?.open,
        null,
        { timeout: 10000 },
      );
      await page.waitForTimeout(4800);
      const room2Entry = await hintOf(page);
      assert.equal(room2Entry.stage, '4', `${vpKey}: Room 2 starts at onboarding stage 4`);
      assert.equal(room2Entry.collapsed, false, `${vpKey}: Room 2 entry banner stays expanded past 4.5s`);
      assert.notEqual(room2Entry.action, '', `${vpKey}: Room 2 entry banner exposes describeNextStep action`);
      assert.ok(room2Entry.title.length > 0 && room2Entry.title.length <= 20, `${vpKey}: Room 2 entry title length valid ("${room2Entry.title}")`);
      assert.ok(!/点亮全部/.test(room2Entry.title), `${vpKey}: Room 2 entry shows concrete hint, not Stage 4 summary ("${room2Entry.title}")`);
      assert.equal(room2Entry.firstRunDone, null, `${vpKey}: Room 2 entry keeps wslice-first-run-done unset`);
      await page.screenshot({ path: path.join(OUT, `after-room3-entry-${vp.width}.png`) });

      await clearByHints(page, vp, { tap: vp.hasTouch, expectedRoom: 2 });
      await page.locator('#result-dialog[open]').waitFor({ timeout: 5000 });
      const wonHud = await hintOf(page);
      assert.equal(wonHud.firstRunDone, 'yes', `${vpKey}: winning Room 2 sets wslice-first-run-done="yes"`);
      assert.equal(wonHud.firstRunAttr, 'false', `${vpKey}: winning clears data-first-run to "false"`);
      assert.equal(wonHud.firstRunPending, false, `${vpKey}: winning clears first-run-pending`);
      receipt.checks.push({ viewport: vpKey, check: 'hint-follower-clears-room2-to-won', entryHint: room2Entry.title, passed: true });

      // Returning player (#play-again after won): opens relic picker, uses non-tutorial HUD, aligns Stage 2 copy, and folds after 4.5s.
      await page.locator('#play-again').click();
      await page.locator('#choice-dialog[open]').waitFor({ timeout: 5000 });
      await page.locator('#relic-choices button').first().click();
      await page.waitForFunction(
        () => window.__g().state.phase === 'playing' && !document.getElementById('choice-dialog')?.open,
        null,
        { timeout: 10000 },
      );
      const retStart = await hintOf(page);
      assert.equal(retStart.firstRunDone, 'yes', `${vpKey}: returning run keeps wslice-first-run-done="yes"`);
      assert.equal(retStart.firstRunAttr, 'false', `${vpKey}: returning run has data-first-run="false"`);
      assert.equal(retStart.firstRunPending, false, `${vpKey}: returning run does not set first-run-pending`);
      assert.equal(retStart.action, '', `${vpKey}: returning run does not show tutorial next-step action`);
      const retFirstMech = (await read(page)).state.mechanismOrder[0];
      await clickNode(page, retFirstMech, { tap: vp.hasTouch });
      await page.waitForFunction(id => window.__g().state.activated.includes(id) && !window.__g().state.travel, retFirstMech, { timeout: 15000 });
      const retStage2 = await hintOf(page);
      assert.equal(retStage2.stage, '2', `${vpKey}: returning run enters Stage 2 after ①`);
      assert.equal(retStage2.action, '', `${vpKey}: returning run Stage 2 shows stage summary instead of tutorial hint`);
      assert.equal(await page.locator('#layer-controls').evaluate(el => el.hidden), false,
        `${vpKey}: returning run Stage 2 reveals #layer-controls`);
      for (const layerIdx of [0, 1, 2]) {
        assert.equal(await page.locator(`#layer-${layerIdx}`).isVisible(), true,
          `${vpKey}: returning run #layer-${layerIdx} visible`);
      }
      assert.ok(!retStage2.title.includes('站在 ⚓ 归响台上滚轮'),
        `${vpKey}: Stage 2 fixed title no longer says 站在 ⚓ 归响台上滚轮 ("${retStage2.title}")`);
      assert.ok(retStage2.title.includes('⚓') && retStage2.title.includes('W尺'),
        `${vpKey}: Stage 2 fixed title names ⚓ and W尺 ("${retStage2.title}")`);
      assert.ok(retStage2.desc.includes('⚓ 归响台'),
        `${vpKey}: Stage 2 detail names ⚓ 归响台 ("${retStage2.desc}")`);
      assert.ok(!retStage2.title.includes('换层台') && !retStage2.desc.includes('换层台'),
        `${vpKey}: Stage 2 copy never says 换层台 ("${retStage2.title}" / "${retStage2.desc}")`);
      await page.waitForTimeout(4800);
      const retStage2Folded = await hintOf(page);
      assert.equal(retStage2Folded.collapsed, true, `${vpKey}: returning run Stage 2 banner folds after announcement window`);
      receipt.checks.push({ viewport: vpKey, check: 'returning-player-non-tutorial-hud', stage2Title: retStage2.title, passed: true });
      await context.close();
    }

    // Cold first-run loss (phase === 'lost') must NOT mark wslice-first-run-done='yes'.
    if (vp.label === 'desktop') {
      const { context, page } = await openCold(vp);
      await page.locator('#scene').focus();
      await page.keyboard.press('r');
      assert.equal((await read(page)).state.riskMode, true, `${vpKey}: R enables riskMode`);
      for (let attempt = 0; attempt < 4; attempt++) {
        await page.keyboard.press('1');
        await page.keyboard.press('Enter');
        await page.waitForFunction(
          () => !window.__g().state.travel || window.__g().state.phase === 'lost',
          null,
          { timeout: 8000 },
        );
      }
      const lostG = await read(page);
      const lostHud = await hintOf(page);
      assert.equal(lostG.state.phase, 'lost', `${vpKey}: 4 failed risky crossings reach phase === 'lost'`);
      assert.equal(await page.locator('#result-dialog').evaluate(d => d.open), true, `${vpKey}: result dialog opens on loss`);
      assert.equal(lostHud.firstRunDone, null, `${vpKey}: losing first run leaves wslice-first-run-done unset`);
      assert.equal(lostHud.firstRunAttr, 'true', `${vpKey}: losing first run keeps data-first-run="true"`);
      receipt.checks.push({ viewport: vpKey, check: 'first-run-lost-keeps-first-run-unset', passed: true });
      await context.close();
    }

    // Seed 4097396765 (同位接力庭, cascade): ③ bloom at (292, 192) sits near the scaled top-left
    // WStack on mobile; tapping/clicking ③ must walk & light ③ instead of shifting WStack to layer 0.
    {
      const { context, page } = await openCold(vp, 4097396765);
      const initial = await read(page);
      assert.equal(initial.state.roomId, 'cascade', `${vpKey}: seed 4097396765 is 同位接力庭`);
      await clearByHints(page, vp, { tap: vp.hasTouch });
      receipt.checks.push({
        viewport: vpKey,
        check: 'seed-4097396765-cascade-hint-clear',
        tap: vp.hasTouch,
        passed: true,
      });
      await context.close();
    }

    // Seeds 42, 90210 (同位接力庭, cascade) and 2026111 (分源架桥庭, split): ① dew (Ⅲ) and ② bell (Ⅰ)
    // share XYZ across non-adjacent layers; hints must route via 归响台 instead of looping at 1/3.
    for (const spec of [
      { seed: 42, roomId: 'cascade' },
      { seed: 90210, roomId: 'cascade' },
      { seed: 2026111, roomId: 'split' },
    ]) {
      const { context, page } = await openCold(vp, spec.seed);
      const initial = await read(page);
      assert.equal(initial.state.roomId, spec.roomId, `${vpKey}: seed ${spec.seed} room is ${spec.roomId}`);
      const hintStart = receipt.hints.length;
      await clearByHints(page, vp, { tap: vp.hasTouch });
      const runHints = receipt.hints.slice(hintStart);
      assert.ok(
        !runHints.some(h => /站①.*显现②/.test(h.title) || /回Ⅲ站稳/.test(h.title)),
        `${vpKey} seed ${spec.seed}: no non-adjacent same_xyz / recover 2-cycle hints`,
      );
      assert.ok(
        runHints.some(h => h.node === 'dew' && h.action === 'move' && h.target === 'hub' && h.title.includes('归响')),
        `${vpKey} seed ${spec.seed}: standing on dew routes via 归响 (归响台) before changing layer`,
      );
      receipt.checks.push({
        viewport: vpKey,
        check: `seed-${spec.seed}-${spec.roomId}-hint-clear`,
        seed: spec.seed,
        roomId: spec.roomId,
        turns: runHints.length,
        tap: vp.hasTouch,
        passed: true,
      });
      await context.close();
    }
  }

  assert.deepEqual(receipt.consoleErrors, [], '0 console errors');
  assert.deepEqual(receipt.pageErrors, [], '0 page errors');
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
