import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SKIP_HOLD_DURATION_MS,
  computeHoldProgress,
  quantizeReducedMotionProgress,
  LongPressController,
  bindLongPress,
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

function createFakeButton({ rect = { left: 100, top: 200, right: 144, bottom: 244, width: 44, height: 44 } } = {}) {
  const listeners = new Map();
  const styles = new Map();
  const captured = new Set();

  return {
    hidden: false,
    disabled: false,
    dataset: {},
    style: {
      setProperty(k, v) { styles.set(k, String(v)); },
      removeProperty(k) { styles.delete(k); },
      getPropertyValue(k) { return styles.get(k) || ''; },
    },
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

test('SKIP_HOLD_DURATION_MS is within 600-800ms and computeHoldProgress stays in [0, 1], < 1 before duration, and 1 at duration', () => {
  assert.ok(SKIP_HOLD_DURATION_MS >= 600 && SKIP_HOLD_DURATION_MS <= 800);
  assert.equal(SKIP_HOLD_DURATION_MS, 700);

  assert.equal(computeHoldProgress(-50, 700), 0);
  assert.equal(computeHoldProgress(0, 700), 0);
  assert.equal(computeHoldProgress(Number.NaN, 700), 0);

  for (const elapsed of [1, 100, 350, 699, 699.999]) {
    const p = computeHoldProgress(elapsed, 700);
    assert.ok(p > 0 && p < 1, `progress at ${elapsed}ms should be in (0, 1), got ${p}`);
  }

  assert.equal(computeHoldProgress(700, 700), 1);
  assert.equal(computeHoldProgress(950, 700), 1);
});

test('short click, tap, and early release before duration do not trigger completion', () => {
  const clock = createFakeClock();
  const btn = createFakeButton();
  let completions = 0;

  bindLongPress(btn, {
    durationMs: 700,
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    requestFrame: clock.requestFrame,
    cancelFrame: clock.cancelFrame,
    isReducedMotion: () => false,
    onComplete: () => { completions += 1; },
  });

  // 1. Plain synthetic click
  const clickEv = btn.emit('click');
  assert.equal(clickEv.defaultPrevented, true);
  assert.equal(completions, 0);

  // 2. Quick mouse click (40ms)
  btn.emit('pointerdown', { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 120, clientY: 220 });
  clock.advance(40);
  btn.emit('pointerup', { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 120, clientY: 220 });
  btn.emit('click');
  clock.advance(1000);
  assert.equal(completions, 0);
  assert.equal(btn.dataset.holding, undefined);
  assert.equal(btn.style.getPropertyValue('--hold-progress'), '');

  // 3. Touch tap & mid-hold early release (320ms and 680ms)
  for (const holdMs of [320, 680]) {
    btn.emit('pointerdown', { pointerId: 2, pointerType: 'touch', button: 0, clientX: 120, clientY: 220 });
    clock.advance(holdMs);
    assert.ok(Number(btn.style.getPropertyValue('--hold-progress')) > 0);
    assert.ok(Number(btn.style.getPropertyValue('--hold-progress')) < 1);
    btn.emit('pointerup', { pointerId: 2, pointerType: 'touch', button: 0, clientX: 120, clientY: 220 });
    clock.advance(800);
    assert.equal(completions, 0, `releasing at ${holdMs}ms must not complete`);
    assert.equal(btn.style.getPropertyValue('--hold-progress'), '');
  }

  // 4. Right-click (button 2) held past duration is ignored
  btn.emit('pointerdown', { pointerId: 3, pointerType: 'mouse', button: 2, clientX: 120, clientY: 220 });
  clock.advance(900);
  btn.emit('pointerup', { pointerId: 3, pointerType: 'mouse', button: 2, clientX: 120, clientY: 220 });
  assert.equal(completions, 0);
});

test('holding pointer (mouse, touch, pen) for >= 700ms triggers completion callback exactly once', () => {
  for (const pointerType of ['mouse', 'touch', 'pen']) {
    const clock = createFakeClock();
    const btn = createFakeButton();
    const completedSources = [];
    const progressLog = [];

    const { controller } = bindLongPress(btn, {
      durationMs: 700,
      now: clock.now,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
      requestFrame: clock.requestFrame,
      cancelFrame: clock.cancelFrame,
      isReducedMotion: () => false,
      onProgress: p => progressLog.push(p),
      onComplete: ({ source }) => completedSources.push(source),
    });

    btn.emit('pointerdown', { pointerId: 7, pointerType, button: 0, clientX: 122, clientY: 222 });
    clock.advance(350);
    assert.ok(controller.progress() > 0.45 && controller.progress() < 0.55);
    assert.equal(completedSources.length, 0);

    clock.advance(350);
    assert.equal(controller.progress(), 1);
    assert.deepEqual(completedSources, ['pointer'], `${pointerType} completed at 700ms`);

    // Continuing to hold past 700ms and then releasing must NOT fire completion a second time.
    clock.advance(250);
    btn.emit('pointerup', { pointerId: 7, pointerType, button: 0, clientX: 122, clientY: 222 });
    btn.emit('click');
    assert.equal(completedSources.length, 1, `${pointerType} fired completion only once`);
    assert.equal(controller.progress(), 0, 'progress resets to 0 after release');
    assert.equal(btn.dataset.holding, undefined);
    assert.equal(btn.style.getPropertyValue('--hold-progress'), '');
    assert.ok(progressLog.includes(1));
  }
});

test('keyboard Enter and Space require full hold and block synthesized short-press clicks', () => {
  for (const key of ['Enter', ' ']) {
    const clock = createFakeClock();
    const btn = createFakeButton();
    let completions = 0;

    bindLongPress(btn, {
      durationMs: 700,
      now: clock.now,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
      requestFrame: clock.requestFrame,
      cancelFrame: clock.cancelFrame,
      isReducedMotion: () => false,
      onComplete: () => { completions += 1; },
    });

    // Short press + browser's synthesized click on keydown/keyup must NOT complete.
    const kdShort = btn.emit('keydown', { key, repeat: false });
    assert.equal(kdShort.defaultPrevented, true, `${JSON.stringify(key)} keydown prevents default click synthesis`);
    assert.equal(kdShort.propagationStopped, true);
    clock.advance(90);
    const kuShort = btn.emit('keyup', { key });
    assert.equal(kuShort.defaultPrevented, true, `${JSON.stringify(key)} keyup prevents default click synthesis`);
    const synthClick = btn.emit('click');
    assert.equal(synthClick.defaultPrevented, true);
    clock.advance(800);
    assert.equal(completions, 0, `short press of ${JSON.stringify(key)} must not skip`);

    // Long press with OS key auto-repeat events must NOT restart timer and must complete once at 700ms.
    btn.emit('keydown', { key, repeat: false });
    for (let elapsed = 0; elapsed < 650; elapsed += 50) {
      clock.advance(50);
      btn.emit('keydown', { key, repeat: true });
    }
    assert.equal(completions, 0, `at 650ms ${JSON.stringify(key)} has not yet completed`);
    clock.advance(50);
    assert.equal(completions, 1, `at 700ms ${JSON.stringify(key)} completes once`);

    clock.advance(150);
    btn.emit('keyup', { key });
    btn.emit('click');
    assert.equal(completions, 1, `releasing ${JSON.stringify(key)} does not fire again`);
    assert.equal(btn.dataset.holding, undefined);
    assert.equal(btn.style.getPropertyValue('--hold-progress'), '');
  }
});

test('pointercancel, lostpointercapture, pointerleave, drag-out, and blur reset progress and allow subsequent long-press to succeed', () => {
  const clock = createFakeClock();
  const btn = createFakeButton();
  let completions = 0;
  const cancelReasons = [];

  const { controller } = bindLongPress(btn, {
    durationMs: 700,
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    requestFrame: clock.requestFrame,
    cancelFrame: clock.cancelFrame,
    isReducedMotion: () => false,
    onComplete: () => { completions += 1; },
    onCancel: ({ reason }) => cancelReasons.push(reason),
  });

  // 1. pointercancel mid-hold
  btn.emit('pointerdown', { pointerId: 10, pointerType: 'touch', button: 0, clientX: 120, clientY: 220 });
  clock.advance(400);
  assert.ok(controller.progress() > 0.5);
  btn.emit('pointercancel', { pointerId: 10 });
  assert.equal(controller.progress(), 0);
  assert.equal(btn.dataset.holding, undefined);
  clock.advance(500);
  assert.equal(completions, 0);

  // 2. lostpointercapture mid-hold
  btn.emit('pointerdown', { pointerId: 11, pointerType: 'pen', button: 0, clientX: 120, clientY: 220 });
  clock.advance(350);
  btn.emit('lostpointercapture', { pointerId: 11 });
  assert.equal(controller.progress(), 0);
  clock.advance(500);
  assert.equal(completions, 0);

  // 3. pointermove dragged well outside button bounds
  btn.emit('pointerdown', { pointerId: 12, pointerType: 'mouse', button: 0, clientX: 120, clientY: 220 });
  clock.advance(300);
  btn.emit('pointermove', { pointerId: 12, clientX: 20, clientY: 220 });
  assert.equal(controller.progress(), 0);
  clock.advance(500);
  assert.equal(completions, 0);

  // 4. uncaptured pointerleave
  btn.releasePointerCapture(13);
  const uncapturedBtn = createFakeButton();
  uncapturedBtn.hasPointerCapture = () => false;
  const sub = bindLongPress(uncapturedBtn, {
    durationMs: 700,
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    requestFrame: clock.requestFrame,
    cancelFrame: clock.cancelFrame,
    isReducedMotion: () => false,
    onComplete: () => { completions += 1; },
  });
  uncapturedBtn.emit('pointerdown', { pointerId: 13, pointerType: 'mouse', button: 0 });
  clock.advance(300);
  uncapturedBtn.emit('pointerleave', { pointerId: 13 });
  assert.equal(sub.controller.progress(), 0);
  clock.advance(500);
  assert.equal(completions, 0);

  // 5. blur during keyboard hold
  btn.emit('keydown', { key: 'Enter', repeat: false });
  clock.advance(420);
  btn.emit('blur');
  assert.equal(controller.progress(), 0);
  clock.advance(500);
  assert.equal(completions, 0);
  assert.deepEqual(cancelReasons, ['pointercancel', 'lostpointercapture', 'pointerleave', 'blur']);

  // 6. Subsequent full long-press after cancellations succeeds cleanly!
  btn.emit('pointerdown', { pointerId: 14, pointerType: 'mouse', button: 0, clientX: 120, clientY: 220 });
  clock.advance(700);
  assert.equal(completions, 1);
  btn.emit('pointerup', { pointerId: 14, pointerType: 'mouse', button: 0, clientX: 120, clientY: 220 });
  assert.equal(controller.progress(), 0);
});

test('prefers-reduced-motion avoids continuous RAF loop and uses discrete static steps that clear on release', () => {
  const clock = createFakeClock();
  const btn = createFakeButton();
  let completions = 0;

  assert.equal(quantizeReducedMotionProgress(0), 0);
  assert.equal(quantizeReducedMotionProgress(0.2), 0.34);
  assert.equal(quantizeReducedMotionProgress(0.6), 0.67);
  assert.equal(quantizeReducedMotionProgress(1), 1);

  bindLongPress(btn, {
    durationMs: 700,
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    requestFrame: clock.requestFrame,
    cancelFrame: clock.cancelFrame,
    isReducedMotion: () => true,
    onComplete: () => { completions += 1; },
  });

  btn.emit('pointerdown', { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 120, clientY: 220 });
  assert.equal(clock.frameCount(), 0, 'no continuous requestAnimationFrame scheduled under reduced motion');
  assert.equal(btn.style.getPropertyValue('--hold-progress'), '0.3400');

  clock.advance(360);
  assert.equal(clock.frameCount(), 0);
  assert.equal(btn.style.getPropertyValue('--hold-progress'), '0.6700');

  btn.emit('pointerup', { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 120, clientY: 220 });
  assert.equal(btn.style.getPropertyValue('--hold-progress'), '', 'progress disappears immediately on release');
  assert.equal(completions, 0);

  // Full hold under reduced motion still completes at 700ms.
  btn.emit('keydown', { key: ' ', repeat: false });
  clock.advance(700);
  assert.equal(completions, 1);
  btn.emit('keyup', { key: ' ' });
  assert.equal(btn.style.getPropertyValue('--hold-progress'), '');
});

test('CSS & markup invariants: #9BE7F5 progress, >=44x32 hit box, non-shifting Stage 1 drawer slot, and SR-only long-press label', () => {
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const mainJs = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

  assert.match(css, /#9BE7F5/i, 'progress uses #9BE7F5');
  assert.match(css, /\.unlock-all-btn\{[^}]*min-width:44px;min-height:32px/, 'base button keeps >=44x32 hit area');
  assert.match(css, /html\.theater #unlock-all-btn\{[^}]*width:44px;min-width:44px;height:44px;min-height:44px/, 'desktop theater is 44x44');
  assert.match(css, /html\.theater #unlock-all-btn\{width:44px;min-width:44px;height:34px;min-height:34px/, 'short-landscape mobile is 44x34');
  assert.match(
    css,
    /html\.theater body\[data-first-run="true"\]\[data-onboarding-stage="1"\] \.advanced-drawer\{visibility:hidden;pointer-events:none\}/,
    'Stage 1 advanced-drawer keeps layout slot without displaying or receiving pointer input',
  );
  assert.doesNotMatch(
    css,
    /html\.theater body\[data-first-run="true"\]\[data-onboarding-stage="1"\] \.advanced-drawer\{display:none\}/,
  );

  assert.match(html, /id="unlock-all-btn"[^>]*aria-label="长按[^"]+"[^>]*>🔓 展开全部高阶<\/button>/);
  assert.match(mainJs, /setAttribute\('aria-label',\s*'长按跳过引导'\)/);
  assert.doesNotMatch(mainJs, /setHTML\('unlock-all-btn',[^)]*长按/);
  assert.doesNotMatch(mainJs, /setText\('unlock-all-btn',[^)]*长按/);
});
