// Playtest regressions for the first courtyard (theater, seed=2):
// (a) a newcomer who only follows the onboarding hint clears the room
// (b) the Stage 1 wheel does not change layer or skip onboarding
// (c) Space after closing Help or cancelling Restart does not reopen the dialog
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
const OUT = process.env.OUT_DIR || '/tmp/wslice-first-game-playtest';
await mkdir(OUT, { recursive: true });

const VIEWPORTS = [
  { label: 'desktop', width: 1280, height: 800, hasTouch: false },
  { label: 'mobile', width: 390, height: 844, hasTouch: true },
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
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || '/usr/local/bin/google-chrome',
});
receipt.browserVersion = browser.version();

async function openCold(vp) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    hasTouch: vp.hasTouch,
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
  await page.goto(`${server.baseUrl}/?seed=2`);
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
  };
});

async function clickNode(page, id) {
  const g = await read(page);
  const node = g.state.nodes.find(n => n.id === id);
  assert.ok(node, `node ${id} exists`);
  const box = await page.locator('#scene').boundingBox();
  await page.mouse.click(box.x + g.view.offsetX + node.x * g.view.scale, box.y + g.view.offsetY + node.y * g.view.scale);
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
      receipt.checks.push({ viewport: vpKey, check: 'stage1-wheel', layer: after.state.layer, stage: after.stage, passed: true });
      await context.close();
    }

    // (a) Hint-following newcomer clears the first game.
    {
      const { context, page } = await openCold(vp);
      let shot = false;
      const trace = [];
      let stuck = 0;
      let lastSig = '';
      for (let turn = 0; turn < 28; turn++) {
        const settled = await waitSettled(page);
        if (settled.state.phase === 'interlude' || settled.state.room >= 1) break;
        const hint = await hintOf(page);
        const g = await read(page);
        assert.ok(hint.title, `${vpKey} turn ${turn}: next-step hint is empty`);
        if (hint.goal && hint.goal !== 'exit') {
          assert.ok(!g.state.activated.includes(hint.goal), `${vpKey} turn ${turn}: hint targets lit ${hint.goal}`);
          const badge = BADGES[g.state.mechanismOrder.indexOf(hint.goal)];
          assert.ok(hint.title.includes(badge), `${vpKey} turn ${turn}: "${hint.title}" does not name ${badge}`);
        }
        if (hint.goal === 'exit') {
          assert.ok(hint.title.includes('🚪') || hint.title.includes('出口'), `${vpKey} turn ${turn}: exit hint missing ("${hint.title}")`);
        }
        if (g.state.activated.length === 2 && hint.goal === 'bell') {
          assert.ok(hint.title.includes('③'), `${vpKey}: 2/3 hint must name ③ ("${hint.title}")`);
          assert.ok(!/点亮全部/.test(hint.title), `${vpKey}: 2/3 hint is still the generic stage line ("${hint.title}")`);
          if (hint.action === 'shift') {
            assert.ok(/上滚|下滚/.test(hint.title), `${vpKey}: 2/3 shift hint names a direction ("${hint.title}")`);
            assert.equal(hint.desc.includes('同一位置'), true, `${vpKey}: 2/3 explanation says ③ shares a position`);
          }
          if (!shot && g.state.node === 'hub' && hint.action === 'shift') {
            await page.screenshot({ path: path.join(OUT, `${vpKey}-after-2of3-hint.png`) });
            shot = true;
          }
        }
        const sig = `${g.state.node}|${g.state.layer}|${g.state.activated.join(',')}|${hint.title}`;
        stuck = sig === lastSig ? stuck + 1 : 0;
        lastSig = sig;
        assert.ok(stuck < 3, `${vpKey}: hint follower stuck on "${hint.title}" at ${g.state.node}@${g.state.layer} lit ${g.state.activated.join(',')}`);
        trace.push({ turn, node: g.state.node, layer: g.state.layer, activated: [...g.state.activated], ...hint });
        receipt.hints.push({ viewport: vpKey, ...trace[trace.length - 1] });

        if (hint.action === 'shift') {
          const layer = Number(hint.layer);
          assert.ok(Number.isInteger(layer), `${vpKey}: shift hint has a layer`);
          if (vp.hasTouch) await page.locator(`#layer-${layer}`).click();
          else await wheelTo(page, layer);
        } else if (hint.action === 'move' || hint.action === 'done') {
          await clickNode(page, hint.target || hint.goal);
        } else if (hint.action === 'activate') {
          await page.waitForTimeout(900);
        } else {
          await page.waitForTimeout(400);
        }
      }
      await page.waitForFunction(() => {
        const s = window.__g().state;
        return s.phase === 'interlude' || s.room >= 1;
      }, null, { timeout: 8000 });
      const done = await read(page);
      assert.equal(done.state.phase, 'interlude', `${vpKey}: hint follower reaches the relic choice`);
      assert.equal(done.state.activated.length, 3, `${vpKey}: all three mechanisms were lit`);
      assert.equal(done.state.stats.failures, 0, `${vpKey}: hint follower took no failing routes`);
      assert.ok(shot, `${vpKey}: captured the 2/3 hint`);
      receipt.checks.push({
        viewport: vpKey,
        check: 'hint-follower-clears-room0',
        turns: trace.length,
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
