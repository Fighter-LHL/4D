import { clampDial, dialToW, sliceAtW, wFootprint, flatShape, blockedWIntervals, exclusionRadius, wChangeEngulfs, PREDICTIONS } from './geometry.mjs';
import { WalkRun, VisitRun } from './game.mjs';
import { CHAPTERS, LEVELS_LIST, levelById, nextLevel, isUnlocked } from './levels.mjs';
import { LAYERS, layerBlend, layerIndex, wColor, cssColor } from './layers.mjs';
import { SliceRenderer } from './renderer.mjs';
import { MapRenderer } from './map-renderer.mjs';
import { FlatRenderer } from './flat-renderer.mjs';
import { sfxInit, sfx, sfxSetMuted } from './sfx.mjs';

const $ = (id) => document.getElementById(id);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const MOVE_DIRS = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
  W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0],
};
const W_KEYS = { e: 1, E: 1, q: -1, Q: -1, PageUp: 1, PageDown: -1 };
const W_RATE = 0.32; // dial units per second while a W key is held
const TRAIL_MS = 1400;
const RIPPLE_MS = 900;
const PEEK_MS = 5000;
const NUDGE_MS = 1600;
const STORAGE_KEY = 'wslice-progress-v1';
const choiceButtons = [...document.querySelectorAll('[data-choice]')];

// ---------- Progress ----------
const progress = (() => {
  try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? []); } catch { return new Set(); }
})();
function saveProgress() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...progress])); } catch { /* private mode */ }
}

// ---------- Renderers ----------
let sliceOk = false;
let mapOk = false;
let slice = null;
let map = null;
try {
  slice = new SliceRenderer($('scene'), (failed) => { sliceOk = !failed; updateErrors(); });
  sliceOk = true;
} catch (error) { console.error('Slice view unavailable:', error); }
try {
  map = new MapRenderer($('map'), (failed) => { mapOk = !failed; updateErrors(); });
  mapOk = true;
} catch (error) { console.error('W map unavailable:', error); }
const flat = new FlatRenderer($('flat'));
let syncingOrbit = false;
if (slice && map) {
  slice.orbit.onChange = () => {
    slice.draw();
    if (!syncingOrbit && !isFlat() && mapVisible()) {
      syncingOrbit = true;
      map.orbit.yaw = slice.orbit.yaw;
      map.draw();
      syncingOrbit = false;
    }
  };
  map.orbit.onChange = () => {
    map.draw();
    if (!syncingOrbit && !isFlat()) {
      syncingOrbit = true;
      slice.orbit.yaw = map.orbit.yaw;
      slice.draw();
      syncingOrbit = false;
    }
  };
}

// ---------- State ----------
let level = null;
let run = null;
let current = 0.5;
let target = 0.5;
let frameId = 0;
let previousTime = 0;
const pressed = new Set();
let wHold = 0;
let heldWKey = null;
let gestureStart = null;
let reveal = null;
let choice = null;
let trialActive = false;
let trail = [];
const ripples = [];
let prevVisible = new Set();
let prevLayer = null;
let flash = 0;
let hintLevel = 0;
let mapPeeking = false;
let peekTimer = 0;
let nudge = null; // ids of bodies that just refused a W change
let nudgeTimer = 0;
let cardOpen = false;
let lastRefuse = 0;
let sandboxAll = false;
const introShown = new Set();

const isWalk = () => level?.kind === 'walk';
const isFlat = () => level?.view === 'flat';
const mapVisible = () => level?.map === 'shown' || mapPeeking;
const railLocked = () => cardOpen || !!reveal || (level?.kind === 'visit' && run.phase === 'predict' && run.session.state === 'predict');
const signed = (v) => `${v < -0.004 ? '−' : v > 0.004 ? '+' : ''}${Math.abs(v).toFixed(2)}`;

function updateErrors() {
  $('render-error').hidden = sliceOk || isFlat();
  $('map-error').hidden = mapOk;
}

// ---------- Toast / objective ----------
let toastTimer = 0;
function toast(text, tone = '', ms = 2600) {
  const el = $('toast');
  el.textContent = text;
  el.className = `toast show ${tone}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}
const setObjective = (text) => { $('objective').textContent = text; };

// ---------- Frame building ----------
function displayBodies() {
  if (isWalk()) return level.field.bodies;
  return trialActive ? [run.session.trial.body] : level.bodies;
}
const frameBounds = () => (isWalk() ? level.field.bounds : { x: 2.8, z: 2.0 });

// Chapter 2 hides every W aid unless the player is peeking; a refused W change
// briefly shows only the bodies that refused it.
const NO_AIDS = { ghost: () => false, blocked: [] };
function wAids() {
  if (!isWalk() || !run) return NO_AIDS;
  if (mapVisible()) return { ghost: () => true, blocked: blockedWIntervals(level.field, run.pos) };
  if (!nudge) return NO_AIDS;
  const bodies = level.field.bodies.filter((b) => nudge.has(b.id));
  return { ghost: (id) => nudge.has(id), blocked: blockedWIntervals({ ...level.field, bodies }, run.pos) };
}

function buildFrame() {
  const w = dialToW(current);
  const bodies = displayBodies();
  const y = isWalk() ? level.field.tokenY : bodies[0].center[1];
  const tinted = bodies.map((body) => ({ body, tint: wColor(body.center[3]), foot: wFootprint(body, y) }));
  const maxR = (body, foot) => (isWalk() && body.type === 'sphere' ? exclusionRadius(body, level.field) : foot.radius ?? 0);
  const aids = wAids();
  const sections = tinted.map(({ body, tint, foot }) => ({ ...sliceAtW(body, w), tint, maxR: maxR(body, foot), ghost: aids.ghost(body.id) }));
  const blend = layerBlend(w);
  const now = performance.now();
  while (trail.length && now - trail[0][2] > TRAIL_MS) trail.shift();
  while (ripples.length && now - ripples[0].t0 > RIPPLE_MS) ripples.shift();
  return {
    w,
    sections,
    shapes: sections.map((s) => { const f = flatShape(s, y); return f && { ...f, tint: s.tint }; }).filter(Boolean),
    footprints: tinted.map(({ tint, foot }) => ({ ...foot, tint })),
    field: isWalk() ? level.field : null,
    blocked: aids.blocked,
    token: isWalk() ? { pos: run.pos, flash, won: run.won } : null,
    goal: isWalk() ? level.field.goal : null,
    bounds: frameBounds(),
    trail: trail.map(([x, z, t]) => [x, z, Math.max(0, 1 - (now - t) / TRAIL_MS) * 0.8]),
    ripples: ripples.map((r) => ({ x: r.x, z: r.z, tint: r.tint, progress: (now - r.t0) / RIPPLE_MS })),
    layer: { a: LAYERS[blend.a], b: LAYERS[blend.b], t: blend.t },
    planeTint: wColor(w),
    layerColors: LAYERS.map((l) => l.color),
  };
}

const visibleIds = (sections) => new Set(sections.filter((s) => s.kind !== 'empty').map((s) => s.id));

function render() {
  if (!level) return;
  let frame = buildFrame();
  const now = performance.now();
  let rippled = false;
  for (const s of frame.sections) {
    if (s.kind !== 'empty' && !prevVisible.has(s.id)) {
      sfx.appear();
      ripples.push({ x: s.center[0], z: s.center[2], tint: s.tint, t0: now });
      if (ripples.length > 4) ripples.shift();
      rippled = true;
    } else if (s.kind === 'empty' && prevVisible.has(s.id)) sfx.vanish();
  }
  prevVisible = visibleIds(frame.sections);
  if (rippled) { frame = buildFrame(); requestFrame(); }
  // A single drag can pass through "appear" and "vanish", so watch every frame.
  if (level.kind === 'visit' && level.goal === 'appear-vanish' && run.phase === 'explore') {
    if (frame.sections.some((s) => s.radius > 0)) run.sawVisible = true;
    if (!railPointer && !wHold && run.observe(current)) onObserved();
  }
  const li = layerIndex(frame.w);
  if (li !== prevLayer) { sfx.layer(li); prevLayer = li; }
  if (isFlat()) flat.render(frame);
  else if (sliceOk) slice.render(frame);
  if (mapVisible() && mapOk) map.render(frame);
  $('empty-notice').hidden = isWalk() || frame.sections.some((s) => s.kind !== 'empty');
  updateRail(frame.w, frame.blocked);
  updateStats();
}

// ---------- Loop ----------
function requestFrame() {
  if (!frameId && !document.hidden) frameId = requestAnimationFrame(tick);
}

function tick(time) {
  frameId = 0;
  const delta = previousTime ? Math.min((time - previousTime) / 1000, 0.05) : 1 / 60;
  previousTime = time;
  if (reveal) {
    const p = reducedMotion.matches ? 1 : Math.min(1, (time - reveal.started) / 1100);
    const ease = p * p * (3 - 2 * p);
    current = target = reveal.from + (reveal.to - reveal.from) * ease;
    if (p === 1) { reveal = null; finishReveal(); }
  } else {
    if (wHold && !railLocked()) {
      const next = clampDial(target + wHold * W_RATE * delta);
      if (next !== target && !requestDial(next)) wHold = 0;
    }
    if (reducedMotion.matches || Math.abs(current - target) < 1e-4) current = target;
    else current += (target - current) * (1 - Math.exp(-14 * delta));
  }
  if (isWalk() && !cardOpen && !run.won) stepToken(delta, time);
  if (flash > 0) flash = Math.max(0, flash - delta * 2.4);
  render();
  if (reveal || wHold || current !== target || ripples.length || pressed.size || flash > 0 || trail.length) requestFrame();
  else previousTime = 0;
}

function stepToken(delta, now) {
  let dx = 0;
  let dz = 0;
  pressed.forEach((key) => { const d = MOVE_DIRS[key]; if (d) { dx += d[0]; dz += d[1]; } });
  const result = run.step(dx, dz, delta, now, current);
  if (result.travelled) {
    const last = trail.at(-1);
    if (!last || Math.hypot(run.pos[0] - last[0], run.pos[1] - last[1]) > 0.08) {
      trail.push([run.pos[0], run.pos[1], now]);
      if (trail.length > 16) trail.shift();
    }
  }
  if (result.newlyBlocked) {
    flash = 1;
    sfx.blocked();
    if (run.blockStreak >= 3) {
      $('w-rail').classList.add('pulse');
      if (run.blockStreak === 3 && level.chapter < 2) {
        toast(isFlat() ? '被挡住了？试试把你的这一层上下移动。' : '被挡住了？试试改变 W。');
      }
    }
  }
  if (result.won) win();
}

// ---------- W control ----------
function requestDial(value, immediate = false) {
  let dial = clampDial(value);
  let clamped = false;
  if (isWalk()) {
    const fromW = dialToW(run.dial);
    ({ dial, clamped } = run.reachDial(dial));
    if (clamped) revealBlockers(fromW, dialToW(clampDial(value)));
  }
  if (clamped) refuse();
  target = dial;
  if (immediate || reducedMotion.matches) current = target;
  requestFrame();
  return !clamped;
}

function refuse() {
  flash = 1;
  const now = performance.now();
  if (now - lastRefuse > 700) {
    sfx.refused();
    toast(isFlat() ? '换到那一层，墙会出现在光点身上——先挪开光点。' : '这个 W 会把光点包进墙里——先挪开光点。', 'warn');
  }
  lastRefuse = now;
  requestFrame();
}

function revealBlockers(fromW, toW) {
  if (mapVisible()) return;
  const { field } = level;
  const ids = field.bodies.filter((b) => wChangeEngulfs({ ...field, bodies: [b] }, run.pos, fromW, toW)).map((b) => b.id);
  if (!ids.length) return;
  nudge = new Set(ids);
  clearTimeout(nudgeTimer);
  nudgeTimer = setTimeout(() => { nudge = null; if (level) render(); }, NUDGE_MS);
}

function beginGesture() { if (gestureStart === null) gestureStart = target; }
function commitW() {
  if (gestureStart === null) return;
  const moved = Math.abs(target - gestureStart) > 1e-6;
  gestureStart = null;
  if (run && isWalk()) run.endWGesture();
  if (!moved || !run) return;
  if (isWalk()) {
    run.noteWAdjust();
    $('w-rail').classList.remove('pulse');
  } else if (run.observe(target)) {
    onObserved();
  }
}

function buildRailSpans() {
  const host = $('rail-spans');
  if (!host || !level) return;
  const seen = new Set();
  const spans = [];
  for (const body of displayBodies()) {
    const halfW = body.type === 'box' ? body.half[3] : body.radius;
    const lo = Math.max(-2, body.center[3] - halfW);
    const hi = Math.min(2, body.center[3] + halfW);
    const key = `${lo.toFixed(2)}:${hi.toFixed(2)}`;
    if (hi <= lo || seen.has(key)) continue;
    seen.add(key);
    spans.push({ lo, hi, color: cssColor(wColor(body.center[3])) });
  }
  host.replaceChildren(...spans.map((s, idx) => {
    const el = document.createElement('span');
    el.className = 'rail-span';
    el.dataset.lo = String(s.lo);
    el.dataset.hi = String(s.hi);
    const topPct = (1 - (s.hi + 2) / 4) * 100;
    const bottomPct = ((s.lo + 2) / 4) * 100;
    el.style.top = `${topPct}%`;
    el.style.bottom = `${bottomPct}%`;
    el.style.left = `${(idx % 2) * 4}px`;
    el.style.color = s.color;
    return el;
  }));
}

let blocksKey = '';
function updateRail(w = dialToW(current), blocked = wAids().blocked) {
  const rail = $('w-rail');
  $('rail-thumb').style.top = `${(1 - current) * 100}%`;
  rail.setAttribute('aria-valuenow', w.toFixed(2));
  rail.setAttribute('aria-valuetext', `${isFlat() ? '高度' : 'W'} ${signed(w)}，第 ${LAYERS[layerIndex(w)].name} 层`);
  rail.classList.toggle('locked', railLocked());
  const trialTarget = level?.kind === 'visit' && run.phase === 'predict' ? run.session.trial.to : null;
  $('rail-target').hidden = trialTarget === null;
  if (trialTarget !== null) $('rail-target').style.top = `${(1 - trialTarget) * 100}%`;
  const spansHost = $('rail-spans');
  if (spansHost) {
    spansHost.hidden = !mapVisible();
    for (const el of spansHost.children) {
      const lo = Number(el.dataset.lo);
      const hi = Number(el.dataset.hi);
      el.classList.toggle('active', w >= lo && w <= hi);
    }
  }
  const blocksHost = $('rail-blocks');
  const key = blocked.map(([lo, hi]) => `${lo.toFixed(3)}:${hi.toFixed(3)}`).join('|');
  if (blocksHost && key !== blocksKey) {
    blocksKey = key;
    blocksHost.hidden = blocked.length === 0;
    const hintEl = $('legend-block-hint');
    if (hintEl) hintEl.hidden = blocked.length === 0;
    blocksHost.replaceChildren(...blocked.map(([lo, hi]) => {
      const el = document.createElement('span');
      el.className = 'rail-block';
      el.style.top = `${(1 - (hi + 2) / 4) * 100}%`;
      el.style.bottom = `${((lo + 2) / 4) * 100}%`;
      return el;
    }));
  }
  const color = cssColor(wColor(w));
  $('layer-swatch').style.color = color;
  $('layer-name').textContent = `第 ${LAYERS[layerIndex(w)].name} 层`;
  $('w-value').textContent = `${isFlat() ? '高度' : 'W'} ${signed(w)}`;
}

function railDial(event) {
  const rect = $('rail-track').getBoundingClientRect();
  return clampDial(1 - (event.clientY - rect.top) / rect.height);
}

let railPointer = null;
$('w-rail').addEventListener('pointerdown', (event) => {
  if (railLocked() || !event.isPrimary) return;
  event.preventDefault();
  sfxInit();
  railPointer = event.pointerId;
  try { $('w-rail').setPointerCapture(event.pointerId); } catch { /* synthetic pointer */ }
  beginGesture();
  requestDial(railDial(event));
});
$('w-rail').addEventListener('pointermove', (event) => {
  if (railPointer !== event.pointerId || railLocked()) return;
  requestDial(railDial(event));
});
const railRelease = (event) => {
  if (railPointer !== event.pointerId) return;
  railPointer = null;
  commitW();
  // Keep the keyboard on the stage so arrows keep walking after a drag.
  if (!cardOpen) focusStage();
};
$('w-rail').addEventListener('pointerup', railRelease);
$('w-rail').addEventListener('pointercancel', railRelease);
$('w-rail').addEventListener('keydown', (event) => {
  const steps = { ArrowUp: 0.02, ArrowDown: -0.02, PageUp: 0.1, PageDown: -0.1 };
  let next = null;
  if (event.key in steps) next = target + steps[event.key];
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = 1;
  if (next === null) return;
  event.preventDefault();
  event.stopPropagation();
  if (railLocked()) return;
  sfxInit();
  beginGesture();
  requestDial(next);
});
$('w-rail').addEventListener('keyup', (event) => {
  if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) {
    event.stopPropagation();
    commitW();
  }
});

// ---------- Screens ----------
function renderChapters() {
  const list = $('chapter-list');
  list.replaceChildren(...CHAPTERS.map((chapter) => {
    const levels = LEVELS_LIST.filter((l) => l.chapter === chapter.id);
    const el = document.createElement('section');
    const chapterOpen = sandboxAll || isUnlocked(levels[0].id, progress);
    el.className = `chapter${chapterOpen ? '' : ' locked'}`;
    el.innerHTML = `<p class="kicker">第 ${chapter.id} 章 · ${chapter.tag}</p><h2>${chapter.name}</h2><p>${chapter.blurb}</p>`;
    const box = document.createElement('div');
    box.className = 'levels';
    for (const l of levels) {
      const button = document.createElement('button');
      button.className = 'level-button';
      const open = sandboxAll || isUnlocked(l.id, progress);
      button.disabled = !open;
      button.innerHTML = `<span class="num">${l.id}</span><span>${l.title}</span><span class="mark">${progress.has(l.id) ? '✓' : (open ? '→' : '·')}</span>`;
      button.setAttribute('aria-label', `${l.id} ${l.title}${progress.has(l.id) ? '，已完成' : (open ? '' : '，未解锁')}`);
      button.addEventListener('click', () => startLevel(l.id));
      box.append(button);
    }
    el.append(box);
    return el;
  }));
  const fresh = progress.size === 0;
  $('play').firstChild.textContent = fresh ? '开始 ' : '继续 ';
  const unlockBtn = $('unlock-all');
  if (unlockBtn) {
    unlockBtn.setAttribute('aria-pressed', String(sandboxAll));
    unlockBtn.textContent = sandboxAll ? '已解锁全部关卡' : '解锁全部关卡';
  }
}

const firstOpenLevel = () => LEVELS_LIST.find((l) => !progress.has(l.id) && isUnlocked(l.id, progress)) ?? LEVELS_LIST[0];

function leaveLevel() {
  pressed.clear();
  wHold = 0;
  heldWKey = null;
  gestureStart = null;
  reveal = null;
  clearTimeout(peekTimer);
  mapPeeking = false;
  clearTimeout(nudgeTimer);
  nudge = null;
  hideCard(false);
}

function showTitle() {
  leaveLevel();
  level = null;
  $('game-screen').hidden = true;
  $('title-screen').hidden = false;
  renderChapters();
  $('play').focus({ preventScroll: true });
}

function keysHelp() {
  const w = isFlat() ? '换层' : '移动 W';
  return isWalk()
    ? `<kbd>↑↓←→</kbd> / <kbd>WASD</kbd> 移动 · <kbd>Q</kbd> <kbd>E</kbd> 或拖动滑轨${w} · <kbd>H</kbd> 提示 · 拖动画面可以转视角`
    : `<kbd>↑</kbd> <kbd>↓</kbd> / <kbd>Q</kbd> <kbd>E</kbd> 或拖动滑轨${w} · <kbd>H</kbd> 提示`;
}

function startLevel(id, { skipIntro = false } = {}) {
  leaveLevel();
  level = levelById(id);
  const chapter = CHAPTERS[level.chapter];
  run = isWalk() ? new WalkRun(level.field, level.id, performance.now()) : new VisitRun(level.bodies, level.goal, level.trials, level.id);
  current = target = isWalk() ? 0.5 : level.startDial;
  trail = [];
  ripples.length = 0;
  flash = 0;
  hintLevel = 0;
  choice = null;
  trialActive = false;
  $('title-screen').hidden = true;
  $('game-screen').hidden = false;
  $('level-chapter').textContent = `${level.id} · ${chapter.name}`;
  $('level-title').textContent = level.title;
  const flatView = isFlat();
  $('scene').hidden = flatView;
  $('flat').hidden = !flatView;
  $('reset-view').hidden = flatView;
  $('stage-tag').textContent = flatView ? '你的世界 · 二维俯视 (X-Z)' : '你的世界 · 三维截面 (X-Y-Z)';
  $('map-title').textContent = flatView ? '全貌 (3D)' : 'W 地图';
  $('map-sub').textContent = flatView ? '竖直方向 = 高度（第三维）' : '竖直方向 = W（第四维，非高度）';
  $('rail-top').textContent = flatView ? '上' : '+W';
  $('rail-bottom').textContent = flatView ? '下' : '−W';
  if ($('leg-token')) $('leg-token').hidden = !isWalk();
  if ($('leg-goal')) $('leg-goal').hidden = !isWalk();
  $('w-rail').setAttribute('aria-label', flatView ? '把你的这一层上下移动' : '沿 W 移动这一片');
  $('w-rail').classList.remove('pulse');
  $('dpad').hidden = !isWalk();
  $('predict').hidden = true;
  $('keys').innerHTML = keysHelp();
  setObjective(level.objective);
  updateHintButton();
  updateErrors();
  prevVisible = visibleIds(displayBodies().map((b) => sliceAtW(b, dialToW(current))));
  prevLayer = layerIndex(dialToW(current));
  buildRailSpans();
  updateMapVisibility();
  map?.fitTo(frameBounds(), flatView ? 0.16 : 0.45);
  slice?.resetView({ distance: isWalk() && level.field.bounds.x > 3 ? 8.8 : 7.6, yaw: 0.45 });
  render();
  const firstOfChapter = LEVELS_LIST.find((l) => l.chapter === level.chapter) === level;
  if (firstOfChapter && !skipIntro && !introShown.has(level.chapter)) {
    introShown.add(level.chapter);
    showCard({ ...chapter.intro, actions: [['开始', 'primary', () => hideCard()]] });
  } else focusStage();
}

const focusStage = () => $(isFlat() ? 'flat' : 'scene').focus({ preventScroll: true });

function updateMapVisibility() {
  $('map-veil').hidden = mapVisible() || !mapOk;
  updateRail();
  if (level) render();
}

function updateStats() {
  if (!run) return;
  if (isWalk()) {
    $('stats').textContent = `被挡 ${run.blocked} · W 调整 ${run.wMoves}${level.map === 'hidden' ? ` · 窥视 ${run.peeks}` : ''}`;
  } else {
    $('stats').textContent = run.phase === 'explore' ? '观察中' : `预测 ${run.session.records.length} / ${run.session.trials.length}`;
  }
}

// ---------- Cards ----------
function showCard({ kicker, title, body = '', formula = '', stats = '', actions }) {
  pressed.clear();
  wHold = 0;
  $('card-kicker').textContent = kicker;
  $('card-title').textContent = title;
  $('card-body').textContent = body;
  $('card-body').hidden = !body;
  $('card-formula').textContent = formula;
  $('card-formula').hidden = !formula;
  $('card-stats').textContent = stats;
  $('card-stats').hidden = !stats;
  $('card-actions').replaceChildren(...actions.map(([label, kind, handler]) => {
    const button = document.createElement('button');
    button.className = kind;
    button.textContent = label;
    button.addEventListener('click', handler);
    return button;
  }));
  $('card-layer').hidden = false;
  cardOpen = true;
  updateRail();
  $('card-actions').firstChild?.focus({ preventScroll: true });
}

function hideCard(refocus = true) {
  $('card-layer').hidden = true;
  cardOpen = false;
  if (level) updateRail();
  if (refocus && level) focusStage();
}

function win() {
  progress.add(level.id);
  saveProgress();
  sfx.win();
  pressed.clear();
  wHold = 0;
  $('w-rail').classList.remove('pulse');
  const now = performance.now();
  let stats;
  if (isWalk()) {
    stats = `用时 ${run.seconds(now)} 秒 · 移动 ${run.distance.toFixed(1)} · 被挡 ${run.blocked} 次 · W 调整 ${run.wMoves} 次 · 提示 ${run.hints}`;
    if (level.map === 'hidden') stats += ` · 窥视地图 ${run.peeks} 次`;
  } else {
    stats = `预测 ${run.session.score} / ${run.session.trials.length} 正确 · 提示 ${run.hints}`;
    $('predict').hidden = true;
  }
  const next = nextLevel(level.id);
  const chapterEnd = !next || next.chapter !== level.chapter;
  const actions = [[chapterEnd ? '继续 →' : '下一关 →', 'primary', () => (chapterEnd ? showWhy() : startLevel(next.id))]];
  actions.push(['再来一次', 'ghost', () => startLevel(level.id, { skipIntro: true })]);
  if (isWalk()) actions.push(['留在这里看看', 'ghost', () => hideCard()]);
  actions.push(['保存记录 ↓', 'ghost', download]);
  showCard({ kicker: '完成', title: level.done, stats, actions });
  setObjective(!isWalk() ? '已完成。' : `已完成——${isFlat() ? '把这一层移回去' : '把 W 滑回去'}，看看墙还在不在。`);
}

function showWhy() {
  const chapter = CHAPTERS[level.chapter];
  const next = nextLevel(level.id);
  showCard({ ...chapter.why, actions: [[next ? '下一章 →' : '回到章节', 'primary', () => (next ? startLevel(next.id) : showTitle())]] });
}

function download() {
  const data = { ...run.toJSON(), exportedAt: new Date().toISOString() };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `w-slice-${level.id}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- Hints & map peek ----------
function updateHintButton() {
  $('hint-count').textContent = `${hintLevel}/3`;
}
function showHint() {
  if (!level || cardOpen) return;
  if (hintLevel < level.hints.length) {
    hintLevel += 1;
    run.hints += 1;
  }
  toast(level.hints[Math.max(0, hintLevel - 1)], '', 6000);
  updateHintButton();
}
$('hint').addEventListener('click', showHint);
$('peek').addEventListener('click', () => {
  if (!run || mapPeeking) return;
  run.peeks += 1;
  mapPeeking = true;
  updateMapVisibility();
  updateStats();
  clearTimeout(peekTimer);
  peekTimer = setTimeout(() => { mapPeeking = false; updateMapVisibility(); }, PEEK_MS);
});

// ---------- Predictions (visit levels) ----------
function onObserved() {
  sfx.win();
  toast('做到了。接下来：先猜，再看。', 'good');
  setTimeout(beginTrial, reducedMotion.matches ? 0 : 500);
}

function beginTrial() {
  if (!level || level.kind !== 'visit' || run.phase !== 'predict') return;
  const trial = run.session.trial;
  choice = null;
  trialActive = true;
  $('predict').hidden = false;
  $('predict-count').textContent = `${run.session.index + 1} / ${run.session.trials.length}`;
  $('predict-question').textContent = trial.prompt;
  $('predict-feedback').hidden = true;
  $('reveal').hidden = false;
  $('reveal').disabled = true;
  $('next-trial').hidden = true;
  choiceButtons.forEach((button) => {
    button.disabled = false;
    button.setAttribute('aria-pressed', 'false');
    button.classList.remove('answer');
  });
  setObjective(`${level.predictObjective}金色虚线是要去的位置。`);
  buildRailSpans();
  current = target = trial.from;
  render();
  choiceButtons[0].focus({ preventScroll: true });
  $('predict').scrollIntoView({ block: 'nearest', behavior: reducedMotion.matches ? 'auto' : 'smooth' });
}

function explain(answer) {
  const piece = isFlat() ? '圆' : '球';
  const whole = isFlat() ? '球' : '超球';
  return {
    appear: `这一层碰到了${whole}，${piece}出现了。`,
    grow: `这一层更靠近${whole}的中心，${piece}变大了。`,
    shrink: `这一层离${whole}的中心更远，${piece}变小了。`,
    disappear: `这一层离开了${whole}，${piece}消失了。`,
    same: '起点和终点离中心一样远，所以一样大——途中它先变大，再变小。',
  }[answer];
}

function finishReveal() {
  const result = run.session.records.at(-1);
  const feedback = $('predict-feedback');
  feedback.hidden = false;
  feedback.classList.toggle('wrong', !result.correct);
  feedback.textContent = `${result.correct ? '猜对了。' : `实际是「${PREDICTIONS[result.answer]}」。`}${explain(result.answer)}`;
  choiceButtons.forEach((button) => button.classList.toggle('answer', button.dataset.choice === result.answer));
  $('reveal').hidden = true;
  $('next-trial').hidden = false;
  $('next-trial').firstChild.textContent = run.session.index === run.session.trials.length - 1 ? '完成 ' : '下一题 ';
  $('next-trial').focus({ preventScroll: true });
  updateRail();
  updateStats();
}

choiceButtons.forEach((button) => button.addEventListener('click', () => {
  if (level?.kind !== 'visit' || run.phase !== 'predict' || reveal || run.session.state !== 'predict') return;
  choice = button.dataset.choice;
  choiceButtons.forEach((option) => option.setAttribute('aria-pressed', String(option === button)));
  $('reveal').disabled = false;
}));
$('reveal').addEventListener('click', () => {
  if (!choice || reveal || run.session.state !== 'predict') return;
  sfxInit();
  run.submit(choice);
  choiceButtons.forEach((button) => { button.disabled = true; });
  $('reveal').disabled = true;
  const trial = run.session.trial;
  reveal = { from: trial.from, to: trial.to, started: performance.now() };
  requestFrame();
});
$('next-trial').addEventListener('click', () => {
  if (reveal || run.session.state !== 'result') return;
  if (run.next()) beginTrial();
  else win();
});

// ---------- Input ----------
window.addEventListener('keydown', (event) => {
  if (!level || $('game-screen').hidden || cardOpen) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const key = event.key;
  if (event.target.closest?.('#w-rail') && ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(key)) return;
  if (key === 'h' || key === 'H') { showHint(); return; }
  const visitArrow = !isWalk() && (key === 'ArrowUp' || key === 'ArrowDown');
  if (key in W_KEYS || visitArrow) {
    event.preventDefault();
    if (event.repeat || railLocked()) return;
    sfxInit();
    wHold = W_KEYS[key] ?? (key === 'ArrowUp' ? 1 : -1);
    heldWKey = key;
    beginGesture();
    requestFrame();
    return;
  }
  if (isWalk() && MOVE_DIRS[key]) {
    event.preventDefault();
    sfxInit();
    pressed.add(key);
    requestFrame();
  }
});
window.addEventListener('keyup', (event) => {
  if (heldWKey && event.key.toLowerCase() === heldWKey.toLowerCase()) {
    wHold = 0;
    heldWKey = null;
    commitW();
  }
  for (const key of [...pressed]) if (key.toLowerCase() === event.key.toLowerCase()) pressed.delete(key);
});
window.addEventListener('blur', () => {
  pressed.clear();
  if (heldWKey) { wHold = 0; heldWKey = null; commitW(); }
});
document.addEventListener('visibilitychange', () => { if (!document.hidden && level) render(); });

document.querySelectorAll('#dpad button').forEach((button) => {
  const dir = button.dataset.dir;
  button.addEventListener('pointerdown', (event) => {
    if (!isWalk() || cardOpen) return;
    event.preventDefault();
    sfxInit();
    try { button.setPointerCapture(event.pointerId); } catch { /* synthetic pointer */ }
    pressed.add(dir);
    requestFrame();
  });
  const release = () => pressed.delete(dir);
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', release);
});

$('play').addEventListener('click', () => { sfxInit(); startLevel(firstOpenLevel().id); });
$('unlock-all')?.addEventListener('click', () => { sandboxAll = !sandboxAll; renderChapters(); });
$('back').addEventListener('click', showTitle);
$('reset-view').addEventListener('click', () => {
  slice?.resetView();
  if (level) map?.fitTo(frameBounds(), isFlat() ? 0.16 : 0.45);
});
$('sound').addEventListener('click', () => {
  const on = $('sound').getAttribute('aria-pressed') !== 'true';
  $('sound').setAttribute('aria-pressed', String(on));
  sfxSetMuted(!on);
});
document.addEventListener('pointerdown', sfxInit, { once: true });

// ?level=1-2 opens a level directly (for playtests and shared links).
const requested = levelById(new URLSearchParams(location.search).get('level') ?? '');
if (requested) startLevel(requested.id);
else showTitle();
