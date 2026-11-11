// Onboarding / cognitive-load regressions found in the 2026-11-10 review, checked through real UI input.
// Each check pins one fix: risky crossings are not auto-steered, the starter relic is auto-equipped
// only on the first run, there is no mid-run relic switch, theme and 4D-lab wiring work, R (not Tab)
// toggles risk, wheel up / scroll right climbs towards Ⅲ, drags never switch layers, and the stage
// banner folds while the checklist reports state only.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.BASE_URL || 'http://127.0.0.1:4173';
const out = process.env.ARTIFACT_DIR;
assert.ok(out, 'use a fresh explicit artifact directory');
await mkdir(out, { recursive: true });
const receipt = { status: 'started', checks: [], errors: [] };
const observer = '\nwindow.__w = () => structuredClone(model.snapshot());';
const browser = await chromium.launch({ headless: true });
receipt.browserVersion = browser.version();

async function open({ firstRunDone = false, seed = 123 } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.route('**/src/main.js', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + observer });
  });
  await context.addInitScript(done => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.clear();
    try { localStorage.setItem('wslice-theater', 'classic'); } catch {}
    if (done) localStorage.setItem('wslice-first-run-done', 'yes');
  }, firstRunDone);
  const page = await context.newPage();
  page.on('pageerror', e => receipt.errors.push({ message: e.message }));
  page.on('console', m => { if (m.type() === 'error') receipt.errors.push({ message: m.text() }); });
  await page.goto(`${base}/?seed=${seed}`);
  await page.waitForFunction(() => window.__w?.());
  return { context, page, w: () => page.evaluate(() => window.__w()) };
}
const check = (name, ok, detail = {}) => { receipt.checks.push({ name, ok, ...detail }); assert.ok(ok, `${name}: ${JSON.stringify(detail)}`); };

try {
  // 1. First run: no picker, starter shell equipped, no mid-run switch button.
  {
    const { context, page, w } = await open();
    const s = await w();
    check('first run auto-equips the starter shell', s.phase === 'playing' && s.relics.shell === 1,
      { phase: s.phase, relics: s.relics });
    check('choice dialog stays closed on the first run', !(await page.$eval('#choice-dialog', d => d.open)));
    check('no mid-run relic switch button', !(await page.$('#switch-relic-btn')));

    // 2. Wheel direction on the hub: up climbs, down descends, right = up, left = down.
    const box = await page.locator('#scene').boundingBox();
    await page.mouse.move(box.x + box.width * .95, box.y + box.height * .9);
    const layers = [(await w()).layer];
    for (const [dx, dy] of [[0, -120], [0, -120], [0, -120], [0, 120], [120, 0], [-120, 0], [-120, 0]]) {
      await page.mouse.wheel(dx, dy);
      await page.waitForTimeout(450);
      layers.push((await w()).layer);
    }
    check('wheel up climbs towards Ⅲ and scroll right matches it', JSON.stringify(layers) === JSON.stringify([0, 1, 2, 2, 1, 2, 1, 0]), { layers });

    // 3. A horizontal drag never switches layers.
    await page.mouse.move(box.x + box.width * .6, box.y + box.height * .92);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * .82, box.y + box.height * .92, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    check('drag does not change layer', (await w()).layer === 0, { layer: (await w()).layer });

    // 4. Stage 1 banner stays expanded; after ① the checklist is status-only and the banner folds.
    check('stage 1 banner stays expanded', !(await page.$eval('#onboarding-banner', b => b.classList.contains('collapsed'))));
    await page.locator('[data-mechanism]').first().click();
    await page.waitForFunction(() => window.__w().activated.length === 1, null, { timeout: 15000 });
    await page.waitForTimeout(5200);
    const settled = await page.evaluate(() => ({
      collapsed: document.getElementById('onboarding-banner').classList.contains('collapsed'),
      checklist: [...document.querySelectorAll('[data-mechanism] small')].map(el => el.textContent),
      description: document.getElementById('room-description').textContent,
    }));
    check('later stage banner folds after the announcement', settled.collapsed, settled);
    check('checklist reports state without instructions', settled.checklist.every(t => !/点我|前往/.test(t)), settled);
    check('room description is the template description', !settled.description.includes('核心玩法'), settled);
    await page.click('#onboarding-badge');
    check('clicking the folded badge reopens the stage instruction',
      !(await page.$eval('#onboarding-banner', b => b.classList.contains('collapsed'))));

    // 5. R toggles risk; Tab only moves focus.
    await page.locator('#scene').focus();
    const riskBefore = (await w()).riskMode;
    await page.keyboard.press('r');
    const riskAfterR = (await w()).riskMode;
    await page.keyboard.press('Tab');
    const riskAfterTab = (await w()).riskMode;
    check('R toggles risk and Tab leaves it alone', riskAfterR === !riskBefore && riskAfterTab === riskAfterR,
      { riskBefore, riskAfterR, riskAfterTab });
    await page.keyboard.press('r');

    // 6. Theme toggle repaints the canvas; the 4D lab readout follows its slider and × closes it.
    const pixel = () => page.evaluate(() => {
      const c = document.getElementById('scene');
      return [...c.getContext('2d').getImageData(Math.floor(c.width * .97), Math.floor(c.height * .5), 1, 1).data].slice(0, 3);
    });
    const darkPixel = await pixel();
    await page.click('#theme-toggle');
    await page.waitForTimeout(250);
    const lightPixel = await pixel();
    const luma = ([r, g, b]) => .3 * r + .59 * g + .11 * b;
    check('theme toggle repaints the canvas', luma(lightPixel) - luma(darkPixel) > 100, { darkPixel, lightPixel });
    await page.click('#open-hyper-lab');
    await page.locator('#hyper-lab-w').evaluate(el => { el.value = '0.8'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    check('4D lab readout follows its slider', (await page.$eval('#hyper-lab-w-value', el => el.textContent)) === '0.800');
    await page.click('[data-close-hyper-lab]');
    check('4D lab × closes the dialog', !(await page.$eval('#hyper-lab-dialog', d => d.open)));
    await context.close();
  }

  // 7. A hands-off one-click risky crossing is not auto-steered: it fails (the shell absorbs it).
  {
    const { context, page, w } = await open({ seed: 123 });
    await page.locator('[data-mechanism]').first().click();
    await page.waitForFunction(() => window.__w().activated.length === 1, null, { timeout: 15000 });
    await page.click('#unlock-all-btn');
    await page.waitForSelector('#risk-go-btn:visible');
    const before = await w();
    await page.click('#risk-go-btn');
    await page.waitForFunction(() => window.__w().stats.failures > 0 || !window.__w().travel, null, { timeout: 8000 });
    await page.waitForFunction(() => !window.__w().travel || window.__w().stats.failures > 0, null, { timeout: 8000 });
    const after = await w();
    check('hands-off risky crossing fails instead of being auto-steered',
      after.stats.failures === before.stats.failures + 1 && after.stats.risks === before.stats.risks,
      { failuresBefore: before.stats.failures, failuresAfter: after.stats.failures, shieldBefore: before.shieldUses, shieldAfter: after.shieldUses });
    await context.close();
  }

  // 8. Returning player: the relic picker opens on load and again for a new run.
  {
    const { context, page } = await open({ firstRunDone: true, seed: 456 });
    check('returning player sees the relic picker', await page.$eval('#choice-dialog', d => d.open));
    await page.locator('#choice-dialog .relic-choice').first().click();
    await page.click('#restart');
    await page.click('#confirm-restart');
    await page.waitForTimeout(400);
    check('a new run opens the relic picker again', await page.$eval('#choice-dialog', d => d.open));
    await context.close();
  }

  // 9. 4D curiosities and phase rating are authoritative in GameModel, best score, result settlement and restart.
  {
    const { context, page, w } = await open({ seed: 123 });
    await page.click('#unlock-all-btn');
    await page.waitForSelector('#radar-anomaly-card:visible');
    const s0 = await w();
    const offAnom = s0.anomalies.find(a => a.layer !== s0.layer);
    const onAnom = s0.anomalies.find(a => a.layer === s0.layer) || s0.anomalies[0];
    if (offAnom && !s0.anomalies[0].materialized) {
      await page.click('#radar-anomaly-card');
      const afterOff = await w();
      check('off-layer curio click prompts layer shift without awarding score',
        afterOff.banked === 0 && afterOff.stats.anomalies === 0,
        { banked: afterOff.banked, anomalies: afterOff.stats.anomalies });
    }
    const targetAnom = (await w()).anomalies.find(a => !a.collected);
    await page.click(`.layer-controls [data-layer="${targetAnom.layer}"]`);
    await page.click('#radar-anomaly-card');
    const afterCollect = await w();
    const hudBanked = Number(await page.$eval('#banked', el => el.textContent));
    const bestStored = Number(await page.evaluate(() => localStorage.getItem('wslice-best')));
    const loreVisible = !(await page.$eval('#anomaly-lore-box', el => el.hidden));
    check('collecting a materialized curio credits model.banked (+2), HUD and best score',
      afterCollect.banked === 2 && afterCollect.stats.anomalies === 1 && hudBanked === 2 && bestStored >= 2 && loreVisible,
      { banked: afterCollect.banked, anomalies: afterCollect.stats.anomalies, hudBanked, bestStored, loreVisible });

    // Switch back to ①'s layer on hub and exhaust remaining lives via hands-off risky crossings to verify settlement dialog
    const mech1 = afterCollect.nodes.find(n => n.id === afterCollect.mechanismOrder[0]);
    await page.click(`.layer-controls [data-layer="${mech1.layer}"]`);
    await page.waitForSelector('#risk-go-btn:visible');
    for (let attempt = 0; attempt < 5 && (await w()).phase === 'playing'; attempt++) {
      const prevFailures = (await w()).stats.failures;
      await page.click('#risk-go-btn');
      await page.waitForFunction(prev => window.__w().stats.failures > prev || window.__w().phase !== 'playing',
        prevFailures, { timeout: 6000 });
    }
    await page.waitForFunction(() => window.__w().phase === 'lost', null, { timeout: 5000 });
    const lostState = await w();
    const resultScore = Number(await page.$eval('#result-score', el => el.textContent));
    const resultStats = await page.$eval('#result-stats', el => el.textContent);
    check('settlement dialog score and stats include authoritative curio and phase rating',
      resultScore === lostState.banked && resultScore >= 2 &&
      resultStats.includes('收录奇物 1 件') && resultStats.includes('共鸣评级'),
      { resultScore, banked: lostState.banked, resultStats });

    await page.click('#play-again');
    await page.waitForTimeout(300);
    if (await page.$eval('#choice-dialog', d => d.open)) {
      await page.locator('#choice-dialog .relic-choice').first().click();
    }
    const resetState = await w();
    const loreHiddenAfterRestart = await page.$eval('#anomaly-lore-box', el => el.hidden);
    check('restarting resets curio progress, phase resonance and lore box',
      resetState.banked === 0 && resetState.stats.anomalies === 0 &&
      resetState.anomalyProgress.done === 0 && resetState.phaseResonance.rank === 'B' && loreHiddenAfterRestart,
      { banked: resetState.banked, anomalies: resetState.stats.anomalies, rank: resetState.phaseResonance.rank, loreHiddenAfterRestart });
    await context.close();
  }

  check('no page or console errors', receipt.errors.length === 0, { errors: receipt.errors });
  receipt.status = 'passed';
} catch (error) {
  receipt.status = 'failed';
  receipt.failure = String(error?.stack || error);
  process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile(`${out}/receipt.json`, JSON.stringify(receipt, null, 2));
  console.log(`${receipt.status}: ${receipt.checks.filter(c => c.ok).length}/${receipt.checks.length} checks`);
  if (receipt.failure) console.log(receipt.failure);
}
