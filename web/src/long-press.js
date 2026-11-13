export const SKIP_HOLD_DURATION_MS = 700;

export function computeHoldProgress(elapsedMs, durationMs = SKIP_HOLD_DURATION_MS) {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 1;
  if (elapsedMs >= durationMs) return 1;
  return Math.min(1 - Number.EPSILON, elapsedMs / durationMs);
}

export function quantizeReducedMotionProgress(progress) {
  if (!Number.isFinite(progress) || progress <= 0) return 0;
  if (progress >= 1) return 1;
  if (progress >= 0.5) return 0.67;
  return 0.34;
}

export function isLongPressKey(key) {
  return key === 'Enter' || key === ' ' || key === 'Spacebar';
}

function normalizeKey(key) {
  return key === 'Spacebar' ? ' ' : key;
}

export class LongPressController {
  constructor({
    durationMs = SKIP_HOLD_DURATION_MS,
    now = () => performance.now(),
    onProgress = null,
    onComplete = null,
    onCancel = null,
  } = {}) {
    this.durationMs = durationMs;
    this.now = now;
    this.onProgress = onProgress;
    this.onComplete = onComplete;
    this.onCancel = onCancel;
    this.source = null;
    this.pointerId = null;
    this.key = null;
    this.startedAt = null;
    this.completed = false;
  }

  get active() {
    return this.startedAt !== null && !this.completed;
  }

  get holding() {
    return this.startedAt !== null;
  }

  progress(atMs = this.now()) {
    if (this.startedAt === null) return 0;
    if (this.completed) return 1;
    return computeHoldProgress(atMs - this.startedAt, this.durationMs);
  }

  startPointer(pointerId = 0, atMs = this.now()) {
    if (this.startedAt !== null) return false;
    this.source = 'pointer';
    this.pointerId = pointerId;
    this.key = null;
    this.startedAt = atMs;
    this.completed = false;
    this.onProgress?.(0, { active: true, completed: false, source: 'pointer' });
    if (this.durationMs <= 0) this.tick(atMs);
    return true;
  }

  startKey(key, atMs = this.now()) {
    if (!isLongPressKey(key)) return false;
    const norm = normalizeKey(key);
    if (this.source === 'key' && this.key === norm && this.startedAt !== null) {
      this.tick(atMs);
      return false;
    }
    if (this.startedAt !== null) return false;
    this.source = 'key';
    this.key = norm;
    this.pointerId = null;
    this.startedAt = atMs;
    this.completed = false;
    this.onProgress?.(0, { active: true, completed: false, source: 'key' });
    if (this.durationMs <= 0) this.tick(atMs);
    return true;
  }

  tick(atMs = this.now()) {
    if (this.startedAt === null) return 0;
    if (this.completed) return 1;
    const p = computeHoldProgress(atMs - this.startedAt, this.durationMs);
    if (p >= 1) {
      const source = this.source;
      this.completed = true;
      this.onProgress?.(1, { active: false, completed: true, source });
      this.onComplete?.({ source });
      return 1;
    }
    this.onProgress?.(p, { active: true, completed: false, source: this.source });
    return p;
  }

  endPointer(pointerId, atMs = this.now()) {
    if (this.source !== 'pointer') return false;
    if (pointerId !== undefined && this.pointerId !== null && pointerId !== this.pointerId) return false;
    if (!this.completed) this.tick(atMs);
    const wasCompleted = this.completed;
    this._clearState();
    this.onProgress?.(0, { active: false, completed: false, source: null });
    if (!wasCompleted) this.onCancel?.({ reason: 'release', source: 'pointer' });
    return wasCompleted;
  }

  endKey(key, atMs = this.now()) {
    if (!isLongPressKey(key)) return false;
    const norm = normalizeKey(key);
    if (this.source !== 'key' || this.key !== norm) return false;
    if (!this.completed) this.tick(atMs);
    const wasCompleted = this.completed;
    this._clearState();
    this.onProgress?.(0, { active: false, completed: false, source: null });
    if (!wasCompleted) this.onCancel?.({ reason: 'release', source: 'key' });
    return wasCompleted;
  }

  cancel(reason = 'cancel') {
    if (this.startedAt === null) return false;
    const wasCompleted = this.completed;
    const prevSource = this.source;
    this._clearState();
    this.onProgress?.(0, { active: false, completed: false, source: null });
    if (!wasCompleted) this.onCancel?.({ reason, source: prevSource });
    return !wasCompleted;
  }

  reset() {
    const hadState = this.startedAt !== null;
    this._clearState();
    if (hadState) this.onProgress?.(0, { active: false, completed: false, source: null });
  }

  _clearState() {
    this.source = null;
    this.pointerId = null;
    this.key = null;
    this.startedAt = null;
    this.completed = false;
  }
}

export function bindLongPress(element, {
  durationMs = SKIP_HOLD_DURATION_MS,
  now = () => performance.now(),
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = id => clearTimeout(id),
  requestFrame = typeof requestAnimationFrame === 'function' ? fn => requestAnimationFrame(fn) : null,
  cancelFrame = typeof cancelAnimationFrame === 'function' ? id => cancelAnimationFrame(id) : null,
  isReducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  isEnabled = () => true,
  canStart = () => Boolean(element && !element.hidden && !element.disabled),
  onProgress = null,
  onComplete = null,
  onCancel = null,
  onShortActivate = null,
  slopPx = 12,
  targetWindow = typeof window !== 'undefined' ? window : null,
  targetDocument = typeof document !== 'undefined' ? document : null,
} = {}) {
  if (!element) {
    return { controller: null, reset() {}, dispose() {} };
  }

  let completeTimer = null;
  let stepTimer = null;
  let rafId = null;
  let startedInRect = false;

  const clearScheduled = () => {
    if (completeTimer !== null) {
      clearTimer(completeTimer);
      completeTimer = null;
    }
    if (stepTimer !== null) {
      clearTimer(stepTimer);
      stepTimer = null;
    }
    if (rafId !== null && cancelFrame) {
      cancelFrame(rafId);
      rafId = null;
    }
  };

  const applyVisual = (progress, meta) => {
    const show = (meta.active || meta.completed) && progress > 0;
    if (!show) {
      if (element.dataset) delete element.dataset.holding;
      element.style?.removeProperty?.('--hold-progress');
      onProgress?.(0, { ...meta, visualProgress: 0 });
      return;
    }
    const reduced = Boolean(isReducedMotion());
    const visualProgress = reduced ? quantizeReducedMotionProgress(progress) : progress;
    if (element.dataset) element.dataset.holding = 'true';
    element.style?.setProperty?.('--hold-progress', visualProgress.toFixed(4));
    onProgress?.(progress, { ...meta, visualProgress });
  };

  const releaseCapture = pointerId => {
    if (pointerId === null || pointerId === undefined) return;
    try {
      if (element.hasPointerCapture?.(pointerId)) {
        element.releasePointerCapture(pointerId);
      }
    } catch {}
  };

  const controller = new LongPressController({
    durationMs,
    now,
    onProgress: (p, meta) => {
      if (meta.active && p === 0 && isReducedMotion()) {
        // Under prefers-reduced-motion, display an immediate static hold indicator without sweeping.
        if (element.dataset) element.dataset.holding = 'true';
        const initialVisual = quantizeReducedMotionProgress(0.01);
        element.style?.setProperty?.('--hold-progress', initialVisual.toFixed(4));
        onProgress?.(0, { ...meta, visualProgress: initialVisual });
        return;
      }
      if (meta.active && p === 0) {
        if (element.dataset) element.dataset.holding = 'true';
        element.style?.setProperty?.('--hold-progress', '0');
        onProgress?.(0, { ...meta, visualProgress: 0 });
        return;
      }
      applyVisual(p, meta);
    },
    onComplete: info => {
      const capturedId = controller.pointerId;
      clearScheduled();
      onComplete?.(info);
      if (!canStart()) {
        releaseCapture(capturedId);
        controller.reset();
        applyVisual(0, { active: false, completed: false, source: null });
      }
    },
    onCancel: info => {
      clearScheduled();
      onCancel?.(info);
    },
  });

  const scheduleLoop = () => {
    clearScheduled();
    completeTimer = setTimer(() => {
      completeTimer = null;
      controller.tick(now());
    }, durationMs);

    if (isReducedMotion()) {
      stepTimer = setTimer(() => {
        stepTimer = null;
        if (controller.active) controller.tick(now());
      }, Math.ceil(durationMs * 0.5));
      return;
    }

    if (requestFrame) {
      const step = () => {
        rafId = null;
        if (!controller.active) return;
        controller.tick(now());
        if (controller.active && requestFrame) {
          rafId = requestFrame(step);
        }
      };
      rafId = requestFrame(step);
    }
  };

  const onPointerDown = e => {
    if (!isEnabled()) return;
    if (!canStart()) return;
    if (e.button !== undefined && e.button !== 0) return;
    if (controller.holding) return;
    const rect = element.getBoundingClientRect?.();
    startedInRect = Boolean(
      rect &&
      rect.width > 0 &&
      rect.height > 0 &&
      Number.isFinite(e.clientX) &&
      Number.isFinite(e.clientY) &&
      e.clientX >= rect.left - 2 &&
      e.clientX <= rect.right + 2 &&
      e.clientY >= rect.top - 2 &&
      e.clientY <= rect.bottom + 2,
    );
    try {
      element.setPointerCapture?.(e.pointerId);
    } catch {}
    if (controller.startPointer(e.pointerId ?? 0, now())) {
      scheduleLoop();
    }
  };

  const onPointerMove = e => {
    if (controller.source !== 'pointer') return;
    if (e.pointerId !== undefined && e.pointerId !== controller.pointerId) return;
    if (!startedInRect || !element.getBoundingClientRect) return;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const out =
      e.clientX < rect.left - slopPx ||
      e.clientX > rect.right + slopPx ||
      e.clientY < rect.top - slopPx ||
      e.clientY > rect.bottom + slopPx;
    if (out) {
      clearScheduled();
      releaseCapture(controller.pointerId);
      startedInRect = false;
      controller.cancel('pointerleave');
    }
  };

  const onPointerUp = e => {
    if (controller.source !== 'pointer') return;
    if (e.pointerId !== undefined && e.pointerId !== controller.pointerId) return;
    clearScheduled();
    releaseCapture(e.pointerId);
    startedInRect = false;
    controller.endPointer(e.pointerId, now());
  };

  const onPointerCancel = e => {
    if (controller.source !== 'pointer') return;
    if (e.pointerId !== undefined && e.pointerId !== controller.pointerId) return;
    clearScheduled();
    releaseCapture(e.pointerId);
    startedInRect = false;
    controller.cancel('pointercancel');
  };

  const onPointerLeave = e => {
    if (controller.source !== 'pointer') return;
    if (e.pointerId !== undefined && e.pointerId !== controller.pointerId) return;
    let captured = false;
    try {
      captured = Boolean(element.hasPointerCapture?.(e.pointerId));
    } catch {}
    if (!captured) {
      clearScheduled();
      startedInRect = false;
      controller.cancel('pointerleave');
    }
  };

  const onLostPointerCapture = e => {
    if (controller.source !== 'pointer') return;
    if (e.pointerId !== undefined && e.pointerId !== controller.pointerId) return;
    clearScheduled();
    startedInRect = false;
    controller.cancel('lostpointercapture');
  };

  const onKeyDown = e => {
    if (!isEnabled()) return;
    if (!isLongPressKey(e.key)) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    // Block native Enter/Space button click synthesis and global Space shortcuts.
    e.preventDefault?.();
    e.stopPropagation?.();
    if (!canStart()) return;
    if (e.repeat) {
      controller.tick(now());
      return;
    }
    if (controller.startKey(e.key, now())) {
      scheduleLoop();
    }
  };

  const onKeyUp = e => {
    if (!isEnabled()) return;
    if (!isLongPressKey(e.key)) return;
    e.preventDefault?.();
    e.stopPropagation?.();
    if (controller.source !== 'key') return;
    clearScheduled();
    controller.endKey(e.key, now());
  };

  const onClick = e => {
    if (!isEnabled()) {
      if (element && !element.hidden && !element.disabled) {
        onShortActivate?.(e);
      }
      return;
    }
    // Single click, tap, or synthesized keyboard click must never trigger skip.
    e.preventDefault?.();
    e.stopPropagation?.();
  };

  const onContextMenu = e => {
    if (!isEnabled()) return;
    e.preventDefault?.();
  };

  const onBlur = () => {
    clearScheduled();
    releaseCapture(controller.pointerId);
    startedInRect = false;
    controller.cancel('blur');
  };

  const onVisibilityChange = () => {
    if (targetDocument?.hidden) onBlur();
  };

  element.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('pointermove', onPointerMove);
  element.addEventListener('pointerup', onPointerUp);
  element.addEventListener('pointercancel', onPointerCancel);
  element.addEventListener('pointerleave', onPointerLeave);
  element.addEventListener('lostpointercapture', onLostPointerCapture);
  element.addEventListener('keydown', onKeyDown);
  element.addEventListener('keyup', onKeyUp);
  element.addEventListener('click', onClick);
  element.addEventListener('contextmenu', onContextMenu);
  element.addEventListener('blur', onBlur);
  targetWindow?.addEventListener?.('blur', onBlur);
  targetDocument?.addEventListener?.('visibilitychange', onVisibilityChange);

  const reset = () => {
    clearScheduled();
    releaseCapture(controller.pointerId);
    startedInRect = false;
    controller.reset();
    if (element.dataset) delete element.dataset.holding;
    element.style?.removeProperty?.('--hold-progress');
  };

  const dispose = () => {
    reset();
    element.removeEventListener('pointerdown', onPointerDown);
    element.removeEventListener('pointermove', onPointerMove);
    element.removeEventListener('pointerup', onPointerUp);
    element.removeEventListener('pointercancel', onPointerCancel);
    element.removeEventListener('pointerleave', onPointerLeave);
    element.removeEventListener('lostpointercapture', onLostPointerCapture);
    element.removeEventListener('keydown', onKeyDown);
    element.removeEventListener('keyup', onKeyUp);
    element.removeEventListener('click', onClick);
    element.removeEventListener('contextmenu', onContextMenu);
    element.removeEventListener('blur', onBlur);
    targetWindow?.removeEventListener?.('blur', onBlur);
    targetDocument?.removeEventListener?.('visibilitychange', onVisibilityChange);
  };

  return { controller, reset, dispose };
}

function setNodeText(el, text) {
  if (!el) return;
  const value = String(text);
  if (el.textContent !== value) el.textContent = value;
}

export function syncRiskDecisionHud(
  { bar, title, sub, riskBtn, safeBtn } = {},
  { visible = false, theater = true, riskPreview = {}, riskHold = null } = {},
) {
  if (bar) bar.hidden = !visible;
  if (safeBtn) safeBtn.hidden = Boolean(theater);
  if (!visible || !theater) {
    riskHold?.reset?.();
  }
  if (!visible) return;

  if (theater) {
    setNodeText(title, '');
    setNodeText(sub, '');
    const riskMark = riskPreview.chargesPrism ? ' ◇' : riskPreview.chargesWeave ? ' ❋' : '';
    setNodeText(riskBtn, `⚡+3${riskMark}`);
    if (riskBtn) {
      const aria = `长按冒险过桥 +3${riskMark}`;
      if (typeof riskBtn.setAttribute === 'function') riskBtn.setAttribute('aria-label', aria);
      else riskBtn.ariaLabel = aria;
      riskBtn.title = `按住冒险过桥 (+3◆${riskPreview.bonusLabel ? ` · ${riskPreview.bonusLabel}` : ''})`;
    }
    return;
  }

  setNodeText(title, `通往「${riskPreview.toName || '目标'}」新桥 · 首通⚡冒险 ${riskPreview.bonusLabel || ''}`);
  setNodeText(sub, `首次⚡冒险过桥可获：${riskPreview.bonusLabel || ''}（过桥时顺着金色波浪微调滚轮）`);
  const extraTag = riskPreview.chargesPrism
    ? ' · ◇蓄能+1'
    : riskPreview.chargesWeave
      ? ' · ❋桥种+1'
      : riskPreview.awakensFlowerBridge
        ? ' · 🌺唤醒花桥'
        : '';
  setNodeText(riskBtn, `⚡ 冒险冲过去 (+3◆${extraTag})`);
  if (riskBtn) {
    if (typeof riskBtn.removeAttribute === 'function') riskBtn.removeAttribute('aria-label');
    else delete riskBtn.ariaLabel;
    riskBtn.title = `冒险过桥 (+3◆${riskPreview.bonusLabel ? ` · ${riskPreview.bonusLabel}` : ''})`;
  }
  setNodeText(safeBtn, '🛡️ 稳妥走 (+1◆)');
  if (safeBtn) safeBtn.title = '稳妥过桥 (+1◆)';
}

export function formatResultStats(state, pr, { theater = true } = {}) {
  const stats = state?.stats || {};
  const chains = stats.chains ?? 0;
  const risks = stats.risks ?? 0;
  const anomalies = stats.anomalies || 0;
  const rank = pr?.rank ?? 'B';

  if (theater) {
    const parts = [`✓点亮 ${chains}`];
    if (risks > 0) parts.push(`⚡冒险 ${risks}`);
    if (anomalies > 0) parts.push(`✦奇物 ${anomalies}`);
    parts.push(`评级 ${rank}`);
    return parts.join('  ·  ');
  }

  const tactileSummary = (stats.harmonicLocks || stats.perfectDashes)
    ? ` · 超频锁 ${stats.harmonicLocks || 0} 次 · 踏浪冲刺 ${stats.perfectDashes || 0} 次`
    : '';
  return `冒险成功 ${risks} 次 · 点亮机关 ${chains} 次 · 收录奇物 ${anomalies} 件${tactileSummary} · 完美同频 ${pr?.perfectBeats ?? 0} 次 · 刹那折光 ${pr?.grazes ?? 0} 次 · 共鸣评级 ${rank}`;
}
