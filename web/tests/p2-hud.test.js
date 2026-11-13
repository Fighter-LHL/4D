import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SKIP_HOLD_DURATION_MS,
  bindLongPress,
  syncRiskDecisionHud,
  formatResultStats,
} from '../src/long-press.js';

function createFakeClock(initialMs = 1000) {
  let current = initialMs;
  let nextId = 1;
  const timers = new Map();
  const frames = new Map();

  return {
    now: () => current,
    setTimer(fn, delayMs) {
      const id = nextId++;
      timers.set(id, { fn, due: current + Math.max(0, delayMs) });
      return id;
    },
    clearTimer(id) {
      timers.delete(id);
    },
    requestFrame(fn) {
      const id = nextId++;
      frames.set(id, fn);
      return id;
    },
    cancelFrame(id) {
      frames.delete(id);
    },
    frameCount: () => frames.size,
    advance(ms) {
      const target = current + ms;
      while (current < target) {
        const nextFrameAt = frames.size > 0 ? current + 16 : Infinity;
        let nextTimerDue = Infinity;
        for (const t of timers.values()) {
          if (t.due < nextTimerDue) nextTimerDue = t.due;
        }
        const stepTo = Math.min(target, nextFrameAt, nextTimerDue);
        current = stepTo;

        for (const [id, t] of [...timers.entries()]) {
          if (t.due <= current && timers.has(id)) {
            timers.delete(id);
            t.fn();
          }
        }
        if (stepTo === nextFrameAt && frames.size > 0) {
          const pending = [...frames.entries()];
          frames.clear();
          for (const [, fn] of pending) fn(current);
        }
      }
    },
  };
}

function createFakeElement({ rect = { left: 16, top: 700, right: 76, bottom: 738, width: 60, height: 38 } } = {}) {
  const listeners = new Map();
  const styles = new Map();
  const attrs = new Map();
  const captured = new Set();

  return {
    hidden: false,
    disabled: false,
    textContent: '',
    title: '',
    dataset: {},
    style: {
      setProperty(k, v) { styles.set(k, String(v)); },
      removeProperty(k) { styles.delete(k); },
      getPropertyValue(k) { return styles.get(k) || ''; },
    },
    setAttribute(k, v) { attrs.set(k, String(v)); },
    getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
    removeAttribute(k) { attrs.delete(k); },
    getBoundingClientRect: () => rect,
    setPointerCapture(id) { captured.add(id); },
    releasePointerCapture(id) { captured.delete(id); },
    hasPointerCapture(id) { return captured.has(id); },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      listeners.get(type)?.delete(fn);
    },
    emit(type, init = {}) {
      const event = {
        type,
        defaultPrevented: false,
        propagationStopped: false,
        preventDefault() { this.defaultPrevented = true; },
        stopPropagation() { this.propagationStopped = true; },
        ...init,
      };
      for (const fn of [...(listeners.get(type) || [])]) {
        fn(event);
      }
      return event;
    },
  };
}

function createRiskHudFixture({ initialTheater = true, reducedMotion = false } = {}) {
  let theater = initialTheater;
  let canAct = true;
  const clock = createFakeClock();
  const bar = createFakeElement();
  bar.hidden = true;
  const title = createFakeElement();
  const sub = createFakeElement();
  const riskBtn = createFakeElement();
  const safeBtn = createFakeElement();
  let crossings = 0;

  const riskHold = bindLongPress(riskBtn, {
    durationMs: SKIP_HOLD_DURATION_MS,
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    requestFrame: clock.requestFrame,
    cancelFrame: clock.cancelFrame,
    isReducedMotion: () => reducedMotion,
    isEnabled: () => theater,
    canStart: () => Boolean(theater && !bar.hidden && !riskBtn.hidden && !riskBtn.disabled && canAct),
    onComplete: () => { crossings += 1; },
    onShortActivate: () => {
      if (canAct && !bar.hidden) crossings += 1;
    },
  });

  const sync = ({ visible = true, riskPreview = { toName: '中庭岛', bonusLabel: '🌺唤醒花桥' } } = {}) => {
    if (!canAct) riskHold.reset();
    syncRiskDecisionHud(
      { bar, title, sub, riskBtn, safeBtn },
      { visible, theater, riskPreview, riskHold },
    );
  };

  return {
    clock,
    bar,
    title,
    sub,
    riskBtn,
    safeBtn,
    riskHold,
    sync,
    getCrossings: () => crossings,
    setTheater(v) {
      theater = Boolean(v);
      riskHold.reset();
    },
    setCanAct(v) {
      canAct = Boolean(v);
    },
  };
}

test('P2-1 theater mode: hides #safe-go-btn and renders compact ⚡+3 chip with SR long-press label and zero extra visible copy', () => {
  const hud = createRiskHudFixture({ initialTheater: true });

  hud.sync({ visible: true, riskPreview: { toName: '花庭', bonusLabel: '🌺唤醒花桥' } });
  assert.equal(hud.bar.hidden, false);
  assert.equal(hud.safeBtn.hidden, true, '#safe-go-btn must be hidden in theater mode');
  assert.equal(hud.title.textContent, '');
  assert.equal(hud.sub.textContent, '');
  assert.equal(hud.riskBtn.textContent, '⚡+3');
  assert.equal(hud.riskBtn.getAttribute('aria-label'), '长按冒险过桥 +3');
  assert.equal(hud.riskBtn.title, '按住冒险过桥 (+3◆ · 🌺唤醒花桥)');

  hud.sync({ visible: true, riskPreview: { chargesPrism: true, bonusLabel: '◇棱镜蓄能+1' } });
  assert.equal(hud.riskBtn.textContent, '⚡+3 ◇');
  assert.equal(hud.riskBtn.getAttribute('aria-label'), '长按冒险过桥 +3 ◇');

  hud.sync({ visible: true, riskPreview: { chargesWeave: true, bonusLabel: '❋桥种+1' } });
  assert.equal(hud.riskBtn.textContent, '⚡+3 ❋');
  assert.equal(hud.riskBtn.getAttribute('aria-label'), '长按冒险过桥 +3 ❋');
  assert.doesNotMatch(hud.riskBtn.textContent, /长按|按住|稳妥/);
});

test('P2-1 theater mode: #risk-go-btn ignores single click, short tap, and short Enter/Space, and fires once at >=700ms hold', () => {
  const hud = createRiskHudFixture({ initialTheater: true });
  hud.sync({ visible: true });

  // 1. Plain click
  const clickEv = hud.riskBtn.emit('click');
  assert.equal(clickEv.defaultPrevented, true);
  assert.equal(hud.getCrossings(), 0);

  // 2. Short mouse click (60ms) & touch tap (320ms, 690ms)
  for (const [pointerType, holdMs] of [['mouse', 60], ['touch', 320], ['touch', 690]]) {
    hud.riskBtn.emit('pointerdown', { pointerId: 1, pointerType, button: 0, clientX: 40, clientY: 720 });
    hud.clock.advance(holdMs);
    assert.equal(hud.riskBtn.dataset.holding, 'true');
    assert.ok(Number(hud.riskBtn.style.getPropertyValue('--hold-progress')) > 0);
    assert.ok(Number(hud.riskBtn.style.getPropertyValue('--hold-progress')) < 1);
    hud.riskBtn.emit('pointerup', { pointerId: 1, pointerType, button: 0, clientX: 40, clientY: 720 });
    hud.riskBtn.emit('click');
    hud.clock.advance(500);
    assert.equal(hud.getCrossings(), 0, `${pointerType} ${holdMs}ms tap must not trigger risky crossing`);
    assert.equal(hud.riskBtn.dataset.holding, undefined);
    assert.equal(hud.riskBtn.style.getPropertyValue('--hold-progress'), '');
  }

  // 3. Short keyboard Enter & Space presses
  for (const key of ['Enter', ' ']) {
    const kd = hud.riskBtn.emit('keydown', { key, repeat: false });
    assert.equal(kd.defaultPrevented, true);
    hud.clock.advance(120);
    hud.riskBtn.emit('keyup', { key });
    hud.riskBtn.emit('click');
    hud.clock.advance(700);
    assert.equal(hud.getCrossings(), 0, `short ${JSON.stringify(key)} press must not trigger risky crossing`);
  }

  // 4. Full 700ms touch hold fires risky crossing once
  hud.riskBtn.emit('pointerdown', { pointerId: 5, pointerType: 'touch', button: 0, clientX: 40, clientY: 720 });
  hud.clock.advance(350);
  assert.equal(hud.getCrossings(), 0);
  hud.clock.advance(350);
  assert.equal(hud.getCrossings(), 1, '700ms touch hold triggers risky crossing');
  hud.clock.advance(200);
  hud.riskBtn.emit('pointerup', { pointerId: 5, pointerType: 'touch', button: 0, clientX: 40, clientY: 720 });
  hud.riskBtn.emit('click');
  assert.equal(hud.getCrossings(), 1, 'continuing to hold or releasing does not double-fire');
  assert.equal(hud.riskBtn.dataset.holding, undefined);

  // 5. Full 700ms keyboard hold also fires once
  hud.riskBtn.emit('keydown', { key: 'Enter', repeat: false });
  hud.clock.advance(700);
  assert.equal(hud.getCrossings(), 2);
  hud.riskBtn.emit('keyup', { key: 'Enter' });
  assert.equal(hud.getCrossings(), 2);
});

test('P2-1 theater mode: cancels cleanly on pointercancel, blur, hiding bar, room reset, or layout switch', () => {
  const hud = createRiskHudFixture({ initialTheater: true });
  hud.sync({ visible: true });

  // 1. pointercancel mid-hold
  hud.riskBtn.emit('pointerdown', { pointerId: 2, pointerType: 'touch', button: 0, clientX: 40, clientY: 720 });
  hud.clock.advance(420);
  hud.riskBtn.emit('pointercancel', { pointerId: 2 });
  hud.clock.advance(500);
  assert.equal(hud.getCrossings(), 0);
  assert.equal(hud.riskBtn.dataset.holding, undefined);

  // 2. blur mid-hold
  hud.riskBtn.emit('keydown', { key: ' ', repeat: false });
  hud.clock.advance(400);
  hud.riskBtn.emit('blur');
  hud.clock.advance(500);
  assert.equal(hud.getCrossings(), 0);

  // 3. Hiding #risk-decision-bar mid-hold cancels scheduled completion
  hud.riskBtn.emit('pointerdown', { pointerId: 3, pointerType: 'mouse', button: 0, clientX: 40, clientY: 720 });
  hud.clock.advance(450);
  assert.equal(hud.riskBtn.dataset.holding, 'true');
  hud.sync({ visible: false });
  assert.equal(hud.bar.hidden, true);
  assert.equal(hud.riskBtn.dataset.holding, undefined);
  assert.equal(hud.riskBtn.style.getPropertyValue('--hold-progress'), '');
  hud.clock.advance(500);
  assert.equal(hud.getCrossings(), 0, 'hiding bar mid-hold must cancel pending timer');

  // 4. Room change / pause reset mid-hold cancels cleanly and allows next 700ms hold
  hud.sync({ visible: true });
  hud.riskBtn.emit('pointerdown', { pointerId: 4, pointerType: 'mouse', button: 0, clientX: 40, clientY: 720 });
  hud.clock.advance(300);
  hud.riskHold.reset();
  hud.clock.advance(600);
  assert.equal(hud.getCrossings(), 0);

  hud.riskBtn.emit('pointerdown', { pointerId: 6, pointerType: 'mouse', button: 0, clientX: 40, clientY: 720 });
  hud.clock.advance(700);
  assert.equal(hud.getCrossings(), 1);
  hud.riskBtn.emit('pointerup', { pointerId: 6, pointerType: 'mouse', button: 0, clientX: 40, clientY: 720 });
});

test('P2-1 theater mode: prefers-reduced-motion uses discrete quantized progress steps with zero RAF loop', () => {
  const hud = createRiskHudFixture({ initialTheater: true, reducedMotion: true });
  hud.sync({ visible: true });

  hud.riskBtn.emit('pointerdown', { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 40, clientY: 720 });
  assert.equal(hud.clock.frameCount(), 0, 'no continuous RAF scheduled under prefers-reduced-motion');
  assert.equal(hud.riskBtn.style.getPropertyValue('--hold-progress'), '0.3400');

  hud.clock.advance(360);
  assert.equal(hud.clock.frameCount(), 0);
  assert.equal(hud.riskBtn.style.getPropertyValue('--hold-progress'), '0.6700');

  hud.riskBtn.emit('pointerup', { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 40, clientY: 720 });
  assert.equal(hud.riskBtn.style.getPropertyValue('--hold-progress'), '');
  assert.equal(hud.getCrossings(), 0);

  hud.riskBtn.emit('pointerdown', { pointerId: 2, pointerType: 'mouse', button: 0, clientX: 40, clientY: 720 });
  hud.clock.advance(700);
  assert.equal(hud.getCrossings(), 1);
  hud.riskBtn.emit('pointerup', { pointerId: 2, pointerType: 'mouse', button: 0, clientX: 40, clientY: 720 });
  assert.equal(hud.riskBtn.style.getPropertyValue('--hold-progress'), '');
});

test('P2-1 classic layout (?layout=classic): keeps #safe-go-btn visible and preserves immediate single-click on #risk-go-btn', () => {
  const hud = createRiskHudFixture({ initialTheater: false });
  hud.sync({
    visible: true,
    riskPreview: { toName: '第二庭', bonusLabel: '🌺唤醒花桥', awakensFlowerBridge: true },
  });

  assert.equal(hud.bar.hidden, false);
  assert.equal(hud.safeBtn.hidden, false, '#safe-go-btn stays visible in classic layout');
  assert.equal(hud.safeBtn.textContent, '🛡️ 稳妥走 (+1◆)');
  assert.equal(hud.riskBtn.textContent, '⚡ 冒险冲过去 (+3◆ · 🌺唤醒花桥)');
  assert.equal(hud.riskBtn.getAttribute('aria-label'), null, 'classic button is single-click, no long-press aria-label');
  assert.match(hud.title.textContent, /通往「第二庭」新桥/);

  // Immediate single click triggers risky crossing without waiting 700ms
  const clickEv = hud.riskBtn.emit('click');
  assert.equal(clickEv.defaultPrevented, false);
  assert.equal(hud.getCrossings(), 1);

  // Disabled or hidden button in classic mode does not fire
  hud.riskBtn.disabled = true;
  hud.riskBtn.emit('click');
  assert.equal(hud.getCrossings(), 1);
  hud.riskBtn.disabled = false;

  // Dynamic toggle back to theater mode re-enables 700ms long-press and hides #safe-go-btn
  hud.setTheater(true);
  hud.sync({ visible: true, riskPreview: { toName: '第二庭', bonusLabel: '🌺唤醒花桥' } });
  assert.equal(hud.safeBtn.hidden, true);
  hud.riskBtn.emit('click');
  assert.equal(hud.getCrossings(), 1, 'single click blocked once switched to theater');
});

test('P2-3 theater showResult #result-stats: 2-char Chinese labels and omits 0-count branch stats while preserving classic output', () => {
  // 1. Standard 0-risk, 0-curio clear
  assert.equal(
    formatResultStats(
      { stats: { risks: 0, chains: 9, anomalies: 0 } },
      { rank: 'B', perfectBeats: 0, grazes: 0 },
      { theater: true },
    ),
    '✓点亮 9  ·  评级 B',
  );

  // 2. Non-zero risks and curiosities
  assert.equal(
    formatResultStats(
      { stats: { risks: 2, chains: 9, anomalies: 1 } },
      { rank: 'S', perfectBeats: 4, grazes: 1 },
      { theater: true },
    ),
    '✓点亮 9  ·  ⚡冒险 2  ·  ✦奇物 1  ·  评级 S',
  );

  // 3. Only risks > 0 (anomalies omitted)
  assert.equal(
    formatResultStats(
      { stats: { risks: 3, chains: 9, anomalies: 0 } },
      { rank: 'A', perfectBeats: 2, grazes: 0 },
      { theater: true },
    ),
    '✓点亮 9  ·  ⚡冒险 3  ·  评级 A',
  );

  // 4. Only anomalies > 0 (risks omitted; undefined anomalies handled cleanly too)
  assert.equal(
    formatResultStats(
      { stats: { risks: 0, chains: 12, anomalies: 2 } },
      { rank: 'A', perfectBeats: 1, grazes: 0 },
      { theater: true },
    ),
    '✓点亮 12  ·  ✦奇物 2  ·  评级 A',
  );
  assert.equal(
    formatResultStats(
      { stats: { risks: 0, chains: 6 } },
      { rank: 'C' },
      { theater: true },
    ),
    '✓点亮 6  ·  评级 C',
  );

  // 5. Classic (!theater) output preserved verbatim for verify-onboarding-load.mjs compatibility
  const classicStats = formatResultStats(
    { stats: { risks: 1, chains: 9, anomalies: 1, harmonicLocks: 0, perfectDashes: 0 } },
    { rank: 'A', perfectBeats: 2, grazes: 1 },
    { theater: false },
  );
  assert.equal(
    classicStats,
    '冒险成功 1 次 · 点亮机关 9 次 · 收录奇物 1 件 · 完美同频 2 次 · 刹那折光 1 次 · 共鸣评级 A',
  );

  const classicWithTactile = formatResultStats(
    { stats: { risks: 2, chains: 9, anomalies: 1, harmonicLocks: 1, perfectDashes: 2 } },
    { rank: 'S', perfectBeats: 3, grazes: 0 },
    { theater: false },
  );
  assert.match(classicWithTactile, /超频锁 1 次 · 踏浪冲刺 2 次/);
  assert.match(classicWithTactile, /收录奇物 1 件/);
  assert.match(classicWithTactile, /共鸣评级 S$/);
});

test('P2-1 & P2-3 markup, CSS, and main.js wiring invariants', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  const mainJs = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

  // #risk-decision-bar is placed outside .dock-float inside .controls so bottom-left anchoring is never trapped by .dock-float translateX(-50%)
  const riskIdx = html.indexOf('id="risk-decision-bar"');
  const dockFloatIdx = html.indexOf('<div class="dock-float">');
  assert.ok(riskIdx > 0 && dockFloatIdx > riskIdx, '#risk-decision-bar sits before .dock-float as a direct child of .controls');
  assert.match(html, /id="risk-go-btn"[^>]*aria-label="长按冒险过桥 \+3"/);

  // CSS hides #safe-go-btn in theater, anchors #risk-decision-bar bottom-left with >=24px clearance, and keeps >=44x36 hitbox + hold ring
  assert.match(css, /html\.theater #safe-go-btn/);
  assert.match(css, /html\.theater #risk-decision-bar[^{]*\{[^}]*position:absolute;left:0;bottom:calc\(100% \+ 28px\)/);
  assert.match(css, /html\.theater #risk-decision-bar[^{]*\{bottom:calc\(100% \+ 26px\);left:0\}/);
  assert.match(css, /html\.theater #risk-go-btn\{[^}]*min-width:54px;height:38px;min-height:38px/);
  assert.match(css, /html\.theater #risk-go-btn\{min-width:48px;height:36px;min-height:36px/);
  assert.match(css, /html\.theater #risk-go-btn\[data-holding="true"\]::after\{[^}]*conic-gradient\([^)]*--hold-progress/);

  // main.js wires bindLongPress on #risk-go-btn, syncRiskDecisionHud, and formatResultStats
  assert.match(mainJs, /bindLongPress\(\$\('risk-go-btn'\)/);
  assert.match(mainJs, /syncRiskDecisionHud\(/);
  assert.match(mainJs, /formatResultStats\(state,\s*pr,\s*\{\s*theater\s*\}\)/);
});
