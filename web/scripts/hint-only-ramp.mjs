// Visible-hint-only 3-room run for the first theater game (W-ramp prototype).
// Follows ONLY #onboarding-title; records whether the ramp (斜桥) was walked and W samples.
//
//   node web/scripts/hint-only-ramp.mjs
//
// Env: BASE_URL (default http://127.0.0.1:4198; serve.js is started there if nothing answers),
// OUT_DIR (default ./hint-only-ramp-out), SEEDS (comma list), VIEWPORTS (desktop | phone | both),
// MAX_TURNS, PLAYWRIGHT_EXECUTABLE_PATH (Chrome binary), PLAYWRIGHT_MODULE (path to a playwright
// package when it is not resolvable from here or NODE_PATH).
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ONBOARDING_STAGES } from '../src/progressive-onboarding.js';

const require = createRequire(import.meta.url);
const { chromium } = process.env.PLAYWRIGHT_MODULE
  ? require(path.resolve(process.env.PLAYWRIGHT_MODULE))
  : await import('playwright').catch(() => require('playwright'));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let BASE = process.env.BASE_URL ? process.env.BASE_URL.replace(/\/$/, '') : '';
const OUT = path.resolve(process.env.OUT_DIR || 'hint-only-ramp-out');
const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CHROME = process.env.PLAYWRIGHT_EXECUTABLE_PATH || (existsSync(MAC_CHROME) ? MAC_CHROME : undefined);
const SEEDS = (process.env.SEEDS || '2,401491695,4097396765,5,777,31337,123456789,42,90210,2026111').split(',').map(Number);
const ALL_VIEWPORTS = {
  desktop: { key: 'desktop', width: 1280, height: 800, hasTouch: false },
  phone: { key: 'phone', width: 844, height: 390, hasTouch: true },
};
const VIEWPORTS = ALL_VIEWPORTS[process.env.VIEWPORTS] ? [ALL_VIEWPORTS[process.env.VIEWPORTS]] : Object.values(ALL_VIEWPORTS);
const MAX_TURNS = Number(process.env.MAX_TURNS || 90);

const BADGES = ['①', '②', '③', '④'];
const ROMAN = { 'Ⅰ': 0, 'Ⅱ': 1, 'Ⅲ': 2 };
const LAYER_KEYS = ['z', 'x', 'c'];
// Banners use short anchor names: "去归响走斜桥点②", "沿斜桥回维度点③", "先到花匣再点②".
const ANCHOR_RE = /(?:到|去|回)\s*「?⚓?\s*(归响|维度|花匣|星舟)/;
const ANCHOR_IDS = { 归响: 'hub', 维度: 'relay', 花匣: 'vault', 星舟: 'ferry' };
// Stage titles are shown when no concrete next step is available; they are not a route.
const GENERIC = ONBOARDING_STAGES.map(s => s.title);

const observer = `
window.__obs = () => {
  const s = model.snapshot();
  return structuredClone({
    phase: s.phase, seed: s.seed, room: s.room, roomTotal: s.roomTotal,
    roomId: s.roomId, roomName: s.roomName, node: s.node, layer: s.layer, w: s.w,
    activated: s.activated, powered: s.powered, mechanismOrder: s.mechanismOrder,
    availableNodes: s.availableNodes, lives: s.lives,
    failures: s.stats?.failures ?? 0,
    nodes: s.nodes.map(n => ({ id: n.id, name: n.name, x: n.x, y: n.y, layer: n.layer, present: n.present, anchor: n.anchor, kind: n.kind })),
    travel: s.travel ? { from: s.travel.from, to: s.travel.to, progress: s.travel.progress, layer: s.travel.layer, ramp: !!s.travel.ramp } : null,
    view: { scale: scene.scale, offsetX: scene.offsetX, offsetY: scene.offsetY },
    displayW: scene.displayW,
    wTween: scene.wTween ? { from: scene.wTween.from, to: scene.wTween.to } : null,
    autoPilot: autoPilot ? autoPilot.targetNode : null,
  });
};
`;

const obs = page => page.evaluate(() => window.__obs());

function parseTitle(title, g) {
  const t = title || '';
  if (/回中心/.test(t)) {
    const m = t.match(/按\s*([ZXC])/i);
    return { type: 'recover', key: m ? m[1].toLowerCase() : (LAYER_KEYS[g.layer] || 'z') };
  }
  const tapLayer = t.match(/点\s*([ⅠⅡⅢ])/);
  if (tapLayer) {
    return { type: 'shift', layer: ROMAN[tapLayer[1]] };
  }
  if (/上滚|下滚/.test(t)) {
    let layer = null;
    for (const [sym, i] of Object.entries(ROMAN)) if (t.includes(sym)) layer = i;
    if (!Number.isInteger(layer)) layer = /上滚/.test(t) ? Math.min(2, g.layer + 1) : Math.max(0, g.layer - 1);
    return { type: 'shift', layer };
  }
  const anchor = t.match(ANCHOR_RE);
  if (anchor) return { type: 'click', id: ANCHOR_IDS[anchor[1]] };
  // "到②换层点③": walk to the lit badge first.
  const via = t.match(/^(?:先)?到([①②③④])/);
  if (via) return { type: 'click', id: g.mechanismOrder[BADGES.indexOf(via[1])] };
  if (t.includes('🚪') && /点击|走向|去|过关|走上/.test(t)) return { type: 'click', id: 'exit' };
  for (let i = 0; i < BADGES.length; i++) {
    if (t.includes(BADGES[i]) && /点击|走过去点亮|斜桥/.test(t)) return { type: 'click', id: g.mechanismOrder[i] };
  }
  if (/点亮脚下|稍候|供能/.test(t)) return { type: 'wait' };
  return { type: 'unknown' };
}

const isGeneric = title => !title || GENERIC.includes(title);
const visibleHint = page => page.evaluate(() => ({
  title: (document.getElementById('onboarding-title')?.textContent || '').trim(),
  desc: (document.getElementById('onboarding-desc')?.textContent || '').trim(),
}));

async function clickNode(page, id) {
  const g = await obs(page);
  const node = g.nodes.find(n => n.id === id);
  if (!node) throw new Error(`node ${id} not in snapshot`);
  const box = await page.locator('#scene').boundingBox();
  if (!box) throw new Error('no #scene box');
  const x = box.x + g.view.offsetX + node.x * g.view.scale;
  const y = box.y + g.view.offsetY + node.y * g.view.scale;
  if (page.__touch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

async function shiftLayer(page, targetLayer) {
  // The visible W-ruler buttons are what the hint points at.
  const loc = page.locator(`#layer-${targetLayer}`);
  if (await loc.isVisible().catch(() => false)) {
    await (page.__touch ? loc.tap({ timeout: 2000 }) : loc.click({ timeout: 2000 })).catch(() => {});
    await page.waitForTimeout(450);
    if ((await obs(page)).layer === targetLayer) return true;
  }
  if (!page.__touch) {
    const box = await page.locator('#scene').boundingBox();
    await page.mouse.move(box.x + box.width * 0.82, box.y + box.height * 0.18);
    for (let step = 0; step < 8; step++) {
      const g = await obs(page);
      if (g.layer === targetLayer) return true;
      await page.mouse.wheel(0, targetLayer > g.layer ? -160 : 160);
      await page.waitForTimeout(200);
    }
  } else {
    await page.keyboard.press(LAYER_KEYS[targetLayer]);
    await page.waitForTimeout(400);
  }
  return (await obs(page)).layer === targetLayer;
}

async function waitTravelAndSample(page, route) {
  const samples = [];
  const deadline = Date.now() + 8000;
  let sawTravel = false, usedRamp = false, hadTween = false;
  while (Date.now() < deadline) {
    const g = await obs(page);
    if (g.travel) {
      sawTravel = true;
      if (g.travel.ramp) usedRamp = true;
      if (g.wTween) hadTween = true;
      samples.push({ p: +g.travel.progress.toFixed(3), w: +g.w.toFixed(4), displayW: +Number(g.displayW).toFixed(4), layer: g.layer, ramp: g.travel.ramp, from: g.travel.from, to: g.travel.to });
    } else if (sawTravel) break;
    await page.waitForTimeout(40);
  }
  for (let i = 0; i < 12; i++) {
    const g = await obs(page);
    if (!g.travel && !g.autoPilot) break;
    await page.waitForTimeout(120);
  }
  if (usedRamp) {
    route.rampTrips.push({ samples, hadTween });
    if (hadTween) route.issues.push('wTween ran during ramp travel (should skip)');
  }
}

async function perform(page, action, route) {
  if (action.type === 'shift') {
    if (!await shiftLayer(page, action.layer)) route.issues.push(`shift to layer ${action.layer} failed (now ${(await obs(page)).layer})`);
  } else if (action.type === 'recover') {
    await page.keyboard.press(action.key);
    await page.waitForTimeout(250);
  } else if (action.type === 'wait') {
    await page.waitForTimeout(800);
  } else {
    await clickNode(page, action.id);
    await page.waitForTimeout(180);
    const g = await obs(page);
    if (!g.travel && g.node !== action.id && (g.availableNodes || []).includes(action.id)) await clickNode(page, action.id);
    await waitTravelAndSample(page, route);
  }
}

async function pickRelic(page) {
  await page.waitForTimeout(400);
  if (!await page.evaluate(() => !!document.getElementById('choice-dialog')?.open)) return null;
  const btn = page.locator('#choice-dialog button:not([disabled])').first();
  if (!await btn.count()) return null;
  const label = await btn.textContent();
  await (page.__touch ? btn.tap() : btn.click());
  await page.waitForFunction(() => window.__obs?.()?.phase === 'playing', null, { timeout: 8000 });
  return (label || '').trim();
}

async function openPage(browser, vp, seed) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
    reducedMotion: 'no-preference',
    hasTouch: vp.hasTouch,
    isMobile: vp.hasTouch,
  });
  await context.addInitScript(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} });
  await context.route('**/src/main.js', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + observer });
  });
  const page = await context.newPage();
  page.__touch = vp.hasTouch;
  await page.goto(`${BASE}/?seed=${seed}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => ['playing', 'choose', 'interlude'].includes(window.__obs?.()?.phase), null, { timeout: 15000 });
  await page.waitForTimeout(350);
  return { context, page };
}

async function playSeed(browser, seed, vp) {
  const route = { seed, viewport: vp.key, issues: [], trace: [], rampTrips: [], won: false, usedRamp: false };
  const { context, page } = await openPage(browser, vp, seed);
  const t0 = Date.now();
  try {
    let g = await obs(page);
    route.roomId0 = g.roomId;
    if (g.phase === 'choose') await pickRelic(page);
    let lastSig = '', stuck = 0;
    for (let turn = 1; turn <= MAX_TURNS; turn++) {
      g = await obs(page);
      if (g.phase === 'won') { route.won = true; route.trace.push('WON'); break; }
      if (g.phase === 'lost') throw new Error(`lost in room ${g.room}`);
      if (g.phase === 'interlude' || g.phase === 'choose') {
        route.trace.push(`${g.phase} room=${g.room} picked=${await pickRelic(page)}`);
        continue;
      }
      if (g.phase !== 'playing') throw new Error(`unexpected phase ${g.phase}`);
      const { title, desc } = await visibleHint(page);
      if (isGeneric(title)) throw new Error(`turn ${turn}: generic/empty hint "${title}"`);
      if (vp.hasTouch && /上滚|下滚|滚轮/.test(`${title} ${desc}`)) {
        throw new Error(`turn ${turn}: touch hint still mentions wheel ("${title}" / "${desc}")`);
      }
      const action = parseTitle(title, g);
      if (action.type === 'unknown') throw new Error(`turn ${turn}: unparsed "${title}"`);
      if (!vp.hasTouch && action.type === 'shift' && !/上滚|下滚/.test(title)) {
        throw new Error(`turn ${turn}: desktop shift hint lost wheel wording ("${title}")`);
      }
      route.trace.push(`r${g.room} ${g.node}@L${g.layer} w=${g.w.toFixed(3)} "${title}" -> ${action.type}${action.id ? ':' + action.id : ''}${Number.isInteger(action.layer) ? ':L' + action.layer : ''}`);
      const sig = `${g.room}|${g.node}|${g.layer}|${g.activated.join(',')}|${title}`;
      stuck = sig === lastSig ? stuck + 1 : 0;
      lastSig = sig;
      if (stuck >= 5) throw new Error(`stuck on "${title}" at r${g.room} ${g.node}@${g.layer}`);
      await perform(page, action, route);
    }
    const done = await obs(page);
    route.final = { phase: done.phase, room: done.room, node: done.node, layer: done.layer, failures: done.failures, lives: done.lives, activated: done.activated };
    route.won = done.phase === 'won';
    if (!route.won) route.issues.push(`did not win (phase=${done.phase} room=${done.room} turns=${route.trace.length})`);
  } catch (e) {
    route.issues.push(String(e.message || e));
  } finally {
    route.ms = Date.now() - t0;
    await context.close();
  }
  route.usedRamp = route.rampTrips.length > 0;
  if (!route.usedRamp) route.issues.push('ramp was never walked on the route');
  const s = route.rampTrips[0]?.samples;
  if (s?.length) {
    route.wAt = [0, 0.25, 0.5, 0.75, 1].map(t => {
      const hit = s.find(x => x.p >= t) || s.at(-1);
      return { want: t, p: hit.p, w: hit.w, displayW: hit.displayW };
    });
    if (s.length >= 2 && Math.abs(s[0].w - s.at(-1).w) > 0.45 && !s.some(x => Math.abs(x.w - 0.5) < 0.08)) {
      route.issues.push('large Δw ramp did not pass near 0.50 (wrap?)');
    }
  }
  route.ok = route.won && route.usedRamp && route.issues.length === 0;
  return route;
}

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

async function ensureServer() {
  if (BASE) return () => {};
  const port = await findFreePort();
  BASE = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [path.resolve(__dirname, '../serve.js')], {
    env: { ...process.env, PORT: String(port) }, stdio: 'ignore',
  });
  for (let i = 0; i < 100 && !await fetch(`${BASE}/`).then(r => r.ok, () => false); i++) {
    if (child.exitCode !== null) throw new Error(`serve.js exited with code ${child.exitCode}`);
    await new Promise(r => setTimeout(r, 60));
  }
  return () => child.kill();
}

await mkdir(OUT, { recursive: true });
const stopServer = await ensureServer();
const browser = await chromium.launch({ headless: true, ...(CHROME ? { executablePath: CHROME } : {}) });
const results = [];
try {
  for (const seed of SEEDS) {
    for (const vp of VIEWPORTS) {
      const r = await playSeed(browser, seed, vp);
      results.push(r);
      console.log(r.ok ? 'OK' : 'FAIL', 'seed', seed, vp.key, r.roomId0, 'won', r.won, 'ramp', r.usedRamp,
        'trips', r.rampTrips.length, 'wAt', JSON.stringify(r.wAt), 'issues', r.issues.join(' | ') || '-');
    }
  }
} finally {
  await browser.close();
  stopServer();
}
const failed = results.filter(r => !r.ok);
const summary = {
  base: BASE, viewports: VIEWPORTS.map(v => `${v.width}x${v.height}`), failed: failed.length, total: results.length,
  ok: results.filter(r => r.ok).map(r => `${r.seed}-${r.viewport}`),
  fail: failed.map(r => ({ id: `${r.seed}-${r.viewport}`, issues: r.issues, final: r.final })),
};
await writeFile(path.join(OUT, 'hint-only-results.json'), JSON.stringify({ summary, results }, null, 2));
console.log('SUMMARY failed', failed.length, 'of', results.length, '->', path.join(OUT, 'hint-only-results.json'));
process.exit(failed.length ? 1 : 0);
