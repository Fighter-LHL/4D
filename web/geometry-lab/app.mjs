import { clampDial, dialToW, sliceAtW, wFootprint, flatShape, blockedWIntervals, exclusionRadius, wChangeEngulfs, goalSliceAtW, itemSectionAtW, itemFootprint, ITEM_TINT, PREDICTIONS } from './geometry.mjs';
import { WalkRun, VisitRun } from './game.mjs';
import { CHAPTERS, LEVELS_LIST, STATION_ROUTES_LEVEL, levelById, nextLevel, isUnlocked } from './levels.mjs';
import { screenToWorldMove } from './controls.mjs';
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
// Material roles for the renderer. These never affect collision; they only let
// the scene show which station body is a power gate, a phase wall or a latch.
const BODY_ROLES = Object.freeze({
  'station-power-door': 1,
  'station-phase-door': 2,
  'station-return-door': 3,
  'station-divider-n': 4,
  'station-divider-mid': 4,
  'station-divider-s': 4,
  'station-middle-door': 5,
  'station-channel-n': 4,
  'station-channel-s': 4,
});
const roleOf = (id) => BODY_ROLES[id] ?? 0;
const DEVICE_FEEDBACK = Object.freeze({
  'latch-other-w': '回廊开关不在当前 W。',
  'socket-other-w': '插座不在当前 W。',
  'socket-empty': '插座里还没有晶核。',
  'latch-open': '回廊已打开，会保持开启。',
});

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
    updateWorldTags();
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
      updateWorldTags();
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
let actorYaw = Math.PI / 2;
let actorBob = 0;
let walkPhase = 0;
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
  if (isWalk()) return run.activeField().bodies;
  return trialActive ? [run.session.trial.body] : level.bodies;
}
const frameBounds = () => (isWalk() ? level.field.bounds : { x: 2.8, z: 2.0 });

// Chapter 2 hides every W aid unless the player is peeking; a refused W change
// briefly shows only the floor outlines of the bodies that refused it.
const NO_AIDS = { ghost: () => 0, blocked: [] };
function wAids(now = performance.now()) {
  if (!isWalk() || !run) return NO_AIDS;
  const activeField = run.activeField();
  if (mapVisible()) return { ghost: () => 1, blocked: blockedWIntervals(activeField, run.pos) };
  if (!nudge || now >= nudge.until) { nudge = null; return NO_AIDS; }
  const rem = (nudge.until - now) / NUDGE_MS;
  const fade = reducedMotion.matches ? 1 : Math.min(1, rem / 0.35);
  return { ghost: (id) => (nudge.ids.has(id) ? fade : 0), blocked: [] };
}

function buildFrame() {
  const w = dialToW(current);
  const bodies = displayBodies();
  const activeField = isWalk() && run ? run.activeField() : (isWalk() ? level.field : null);
  const y = isWalk() ? level.field.tokenY : bodies[0].center[1];
  const now = performance.now();
  const tinted = bodies.map((body) => ({ body, tint: wColor(body.center[3]), foot: wFootprint(body, y) }));
  const maxR = (body, foot) => (isWalk() && body.type === 'sphere' ? exclusionRadius(body, activeField) : foot.radius ?? 0);
  const aids = wAids(now);
  const sections = tinted.map(({ body, tint, foot }) => ({ ...sliceAtW(body, w), role: roleOf(body.id), tint, maxR: maxR(body, foot), ghost: aids.ghost(body.id) }));
  const footprints = tinted.map(({ tint, foot }) => ({ ...foot, tint }));
  if (isWalk() && run?.item) {
    const itemSec = itemSectionAtW(level.field, run.itemState(), w);
    if (itemSec) sections.push({ ...itemSec, role: 0, ghost: mapVisible() ? itemSec.ghost : 0 });
    const itemFoot = itemFootprint(level.field, run.itemState());
    if (itemFoot) footprints.push(itemFoot);
  }
  const blend = layerBlend(w);
  while (trail.length && now - trail[0][2] > TRAIL_MS) trail.shift();
  while (ripples.length && now - ripples[0].t0 > RIPPLE_MS) ripples.shift();
  return {
    w,
    sections,
    shapes: sections.map((s) => { const f = flatShape(s, y); return f && { ...f, tint: s.tint }; }).filter(Boolean),
    footprints,
    field: activeField,
    blocked: aids.blocked,
    token: isWalk() ? { pos: run.pos, flash, won: run.won, carrying: run.carrying, yaw: actorYaw, bob: actorBob } : null,
    goal: isWalk() ? level.field.goal : null,
    goalState: isWalk() ? goalSliceAtW(level.field, w) : null,
    relay: isWalk() ? run.relayState() : null,
    bounds: frameBounds(),
    trail: trail.map(([x, z, t]) => [x, z, Math.max(0, 1 - (now - t) / TRAIL_MS) * 0.8]),
    ripples: ripples.map((r) => ({ x: r.x, z: r.z, tint: r.tint, progress: (now - r.t0) / RIPPLE_MS })),
    layer: { a: LAYERS[blend.a], b: LAYERS[blend.b], t: blend.t },
    planeTint: wColor(w),
    layerColors: LAYERS.map((l) => l.color),
  };
}

const visibleIds = (sections) => new Set(sections.filter((s) => s.kind !== 'empty').map((s) => s.id));

function placeTag(el, pt, text, faint = false) {
  if (!el) return;
  if (!pt) { el.hidden = true; return; }
  el.hidden = false;
  el.textContent = text;
  el.classList.toggle('faint', faint);
  el.style.left = `${pt.x.toFixed(1)}%`;
  el.style.top = `${pt.y.toFixed(1)}%`;
}

function updateWorldTags(frame = slice?.frame ?? flat?.frame) {
  const actorEl = $('actor-tag');
  const itemEl = $('item-tag');
  const goalEl = $('goal-tag');
  const socketEl = $('socket-tag');
  const latchEl = $('latch-tag');
  socketEl.hidden = true;
  latchEl.hidden = true;
  if (!actorEl || !itemEl || !goalEl) return;
  if (!isWalk() || !run || !frame || cardOpen) {
    actorEl.hidden = true;
    itemEl.hidden = true;
    goalEl.hidden = true;
    return;
  }
  const view = isFlat() ? flat : slice;
  if (!view?.project) return;
  const moved = run.distance > 0.25;
  if (!moved) {
    const actorPt = view.project([run.pos[0], 0.88 + actorBob, run.pos[1]]);
    placeTag(actorEl, actorPt, '你 · WASD 移动', false);
  } else {
    actorEl.hidden = true;
  }

  if (frame.relay) {
    const { socket, latch, powered, latched } = frame.relay;
    const socketDist = Math.hypot(run.pos[0] - socket.x, run.pos[1] - socket.z);
    const latchDist = Math.hypot(run.pos[0] - latch.x, run.pos[1] - latch.z);
    const socketHere = Math.abs(frame.w - socket.w) <= socket.wReach;
    const latchHere = Math.abs(frame.w - latch.w) <= latch.wReach;
    // Labels are local: the mechanism itself carries the state at a distance.
    const socketNear = socketDist <= 1.55;
    const latchNear = latchDist <= 1.55;
    placeTag(socketEl, socketNear && socketHere ? view.project([socket.x, 0.92, socket.z]) : null,
      powered ? '供电中' : '蓝层插座');
    placeTag(latchEl, latchNear && latchHere ? view.project([latch.x, 0.92, latch.z]) : null,
      latched ? '回廊已打开' : '回廊开关');
  }

  if (level.field.item && run.item && !run.carrying && !run.won && !run.socketPowered()) {
    const itemSec = itemSectionAtW(level.field, run.itemState(), frame.w);
    const visible = itemSec && itemSec.radius > 0;
    const itemDist = Math.hypot(run.pos[0] - run.item.x, run.pos[1] - run.item.z);
    const nearSpot = itemDist <= level.field.item.pickupRadius;
    const itemPt = view.project([run.item.x, 0.62, run.item.z]);
    if (visible && (nearSpot || !moved)) {
      const interaction = run.canInteract(current);
      const label = interaction.action === 'pickup' ? '按 空格 拿起'
        : interaction.reason === 'tight' ? '这里空间不足' : '晶核';
      placeTag(itemEl, itemPt, nearSpot ? label : '晶核', false);
    } else if (!visible && mapVisible() && (!moved || itemDist < 3.2)) {
      placeTag(itemEl, itemPt, `留在 W ${signed(run.item.w)}`, true);
    } else {
      itemEl.hidden = true;
    }
  } else {
    itemEl.hidden = true;
  }

  const [gx, gz] = level.field.goal;
  const goalOpen = frame.goalState ? frame.goalState.open : true;
  const goalDist = Math.hypot(run.pos[0] - gx, run.pos[1] - gz);
  if (!moved || goalDist < 1.7 || (!level.field.relay && !goalOpen)) {
    const goalPt = view.project([gx, 0.28, gz]);
    const goalName = level.field.item ? '接收台' : '出口';
    placeTag(goalEl, goalPt, goalOpen ? goalName : `${goalName}（在中间层）`, !goalOpen);
  } else {
    goalEl.hidden = true;
  }
}

function updateActionButton() {
  const btn = $('action-btn');
  if (!btn) return;
  if (!isWalk() || !level?.field?.item || !run || run.won || cardOpen) {
    btn.hidden = true;
    return;
  }
  const state = run.canInteract(current);
  if (state.action === 'latch' || state.action === 'dock') {
    btn.hidden = false;
    btn.disabled = false;
    btn.textContent = state.action === 'latch' ? '拉开回廊 (空格 / F)' : '放入插座 (空格 / F)';
  } else if (run.carrying) {
    btn.hidden = false;
    btn.disabled = false;
    btn.textContent = '放下晶核 (空格 / F)';
  } else if (state.action === 'pickup') {
    btn.hidden = false;
    btn.disabled = false;
    btn.textContent = run.socketPowered() ? '取回晶核 (空格 / F)' : '拿起晶核 (空格 / F)';
  } else if (state.action === 'blocked') {
    btn.hidden = false;
    btn.disabled = false;
    btn.textContent = '这里容不下你和晶核';
  } else if (DEVICE_FEEDBACK[state.reason]) {
    btn.hidden = false;
    btn.disabled = true;
    btn.textContent = DEVICE_FEEDBACK[state.reason];
  } else {
    btn.hidden = true;
  }
}

function handleInteract() {
  if (!isWalk() || !level?.field?.item || !run || run.won || cardOpen) return;
  sfxInit();
  const res = run.interact(performance.now(), current);
  if (res.action === 'docked' || res.action === 'latched') {
    sfx.appear();
    buildRailSpans();
    toast(res.action === 'docked' ? '插座接通了。' : '回廊已打开。', 'good');
  } else if (res.action === 'picked') {
    sfx.appear();
    buildRailSpans();
    if (res.won) win();
    else toast('拿起晶核。', 'good');
  } else if (res.action === 'dropped') {
    sfx.vanish();
    buildRailSpans();
    if (res.won) win();
    else toast('晶核留在这一层。');
  } else if (res.reason === 'tight') {
    flash = 1;
    sfx.refused();
    toast('这里容不下你和晶核。', 'warn');
  } else if (DEVICE_FEEDBACK[res.reason]) {
    toast(DEVICE_FEEDBACK[res.reason]);
  } else if (res.reason === 'other-w') {
    sfx.blocked();
    toast('晶核不在当前层。', 'warn');
  } else if (res.reason === 'far') {
    toast('靠近晶核后可拿起。');
  }
  render();
}

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
  updateWorldTags(frame);
  updateActionButton();
  updateRail(frame.w, frame.blocked);
  updateStats();
}

// ---------- Loop ----------
function requestFrame() {
  if (level && !frameId && !document.hidden) frameId = requestAnimationFrame(tick);
}

function tick(time) {
  frameId = 0;
  if (!level) { previousTime = 0; return; }
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
  if (reveal || wHold || current !== target || ripples.length || pressed.size || flash > 0 || trail.length || nudge) requestFrame();
  else previousTime = 0;
}

let lastGoalHint = 0;
function stepToken(delta, now) {
  let dx = 0;
  let dz = 0;
  pressed.forEach((key) => { const d = MOVE_DIRS[key]; if (d) { dx += d[0]; dz += d[1]; } });
  [dx, dz] = screenToWorldMove(dx, dz, isFlat() ? 0 : (slice?.orbit.yaw ?? 0));
  if (dx || dz) {
    actorYaw = Math.atan2(dx, dz);
  }
  const result = run.step(dx, dz, delta, now, current);
  if (result.travelled) {
    walkPhase += result.travelled * 9.5;
    actorBob = reducedMotion.matches ? 0 : Math.abs(Math.sin(walkPhase)) * 0.04;
    const last = trail.at(-1);
    if (!last || Math.hypot(run.pos[0] - last[0], run.pos[1] - last[1]) > 0.08) {
      trail.push([run.pos[0], run.pos[1], now]);
      if (trail.length > 16) trail.shift();
    }
  } else {
    actorBob = 0;
  }
  if (result.newlyBlocked) {
    flash = 1;
    sfx.blocked();
    if (run.carrying) {
      toast('前方有障碍，过不去。', 'warn');
    } else if (run.blockStreak >= 3) {
      $('w-rail').classList.add('pulse');
    }
  }
  if (result.goalNeedsItem && result.travelled > 0 && now - lastGoalHint > 1800) {
    lastGoalHint = now;
    toast('接收台还没有晶核。');
  }
  if (result.goalOtherW && result.travelled > 0 && now - lastGoalHint > 1800) {
    lastGoalHint = now;
    $('w-rail').classList.add('pulse');
    toast(level.field.item ? '接收台在另一层。' : '出口在另一层。');
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
  if (immediate || reducedMotion.matches) {
    current = target;
    if (isWalk() && !run.won && run.step(0, 0, 0, performance.now(), current).won) win();
  }
  requestFrame();
  return !clamped;
}

function refuse() {
  flash = 1;
  const now = performance.now();
  if (now - lastRefuse > 700) {
    sfx.refused();
    if (run?.carrying) {
      toast('这次换层会让晶核碰到障碍。', 'warn');
    } else {
      toast('这次换层会碰到障碍。', 'warn');
    }
  }
  lastRefuse = now;
  requestFrame();
}

function revealBlockers(fromW, toW) {
  if (mapVisible()) return;
  const field = run.activeField();
  const ids = field.bodies.filter((b) => wChangeEngulfs({ ...field, bodies: [b] }, run.pos, fromW, toW)).map((b) => b.id);
  if (!ids.length) return;
  nudge = { ids: new Set(ids), until: performance.now() + NUDGE_MS };
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
  if (isWalk() && level.field.goalW) {
    const [glo, ghi] = level.field.goalW;
    spans.push({ lo: glo, hi: ghi, color: 'var(--gold)', goal: true });
  }
  if (isWalk() && level.field.item && run?.item && !run.carrying) {
    const reach = level.field.item.wReach;
    const ilo = Math.max(-2, run.item.w - reach);
    const ihi = Math.min(2, run.item.w + reach);
    if (ihi > ilo) spans.push({ lo: ilo, hi: ihi, color: cssColor(ITEM_TINT), goal: true });
  }
  host.replaceChildren(...spans.map((s, idx) => {
    const el = document.createElement('span');
    el.className = `rail-span${s.goal ? ' goal' : ''}`;
    el.dataset.lo = String(s.lo);
    el.dataset.hi = String(s.hi);
    const topPct = (1 - (s.hi + 2) / 4) * 100;
    const bottomPct = ((s.lo + 2) / 4) * 100;
    el.style.top = `${topPct}%`;
    el.style.bottom = `${bottomPct}%`;
    el.style.left = s.goal ? '32px' : `${(idx % 2) * 4}px`;
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
    spansHost.hidden = false;
    const showAll = mapVisible();
    for (const el of spansHost.children) {
      const isGoal = el.classList.contains('goal');
      el.hidden = !isGoal && !showAll;
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
  const featured = document.createElement('section');
  featured.className = 'chapter featured';
  featured.innerHTML = `
    <div class="featured-copy">
      <p class="kicker">新关卡 · 空间解谜</p>
      <h2>${STATION_ROUTES_LEVEL.title}</h2>
      <p>${STATION_ROUTES_LEVEL.objective}</p>
    </div>
    <div class="featured-actions">
      <button type="button" class="primary" data-start="station-routes">${progress.has('station-routes') ? '再玩一次：两种办法 →' : '开始：两种办法 →'}</button>
      <button type="button" class="ghost" data-start="station">原版中转站 →</button>
      <button type="button" class="ghost" data-start="fetch">无门取物 →</button>
    </div>
  `;
  featured.querySelector('[data-start="fetch"]').addEventListener('click', () => startLevel('fetch'));
  featured.querySelector('[data-start="station"]').addEventListener('click', () => startLevel('station'));
  featured.querySelector('[data-start="station-routes"]').addEventListener('click', () => startLevel('station-routes'));

  const cards = CHAPTERS.map((chapter) => {
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
  });
  list.replaceChildren(featured, ...cards);
  $('play').firstChild.textContent = '试玩两种办法 ';
  const unlockBtn = $('unlock-all');
  if (unlockBtn) {
    unlockBtn.setAttribute('aria-pressed', String(sandboxAll));
    unlockBtn.textContent = sandboxAll ? '已解锁全部关卡' : '解锁全部关卡';
  }
}

const firstOpenLevel = () => LEVELS_LIST.find((l) => !progress.has(l.id) && isUnlocked(l.id, progress)) ?? LEVELS_LIST[0];

function leaveLevel() {
  if (frameId) cancelAnimationFrame(frameId);
  frameId = 0;
  previousTime = 0;
  trail = [];
  ripples.length = 0;
  flash = 0;
  railPointer = null;
  pressed.clear();
  wHold = 0;
  heldWKey = null;
  gestureStart = null;
  reveal = null;
  clearTimeout(peekTimer);
  mapPeeking = false;
  clearTimeout(nudgeTimer);
  nudge = null;
  clearTimeout(toastTimer);
  $('toast').classList.remove('show');
  $('toast').textContent = '';
  $('hint-panel').hidden = true;
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
  const itemKey = isWalk() && level?.field?.item ? '<br><kbd>空格</kbd> / <kbd>F</kbd> 拿放晶核 / 操作机关' : '';
  return isWalk()
    ? `<kbd>↑↓←→</kbd> / <kbd>WASD</kbd> 按画面方向移动<br><kbd>Q</kbd> <kbd>E</kbd> 或拖动滑轨${w}${itemKey}<br>拖动画面转视角 · 滚轮缩放 · <kbd>R</kbd> 重来 · <kbd>H</kbd> 提示`
    : `<kbd>↑</kbd> <kbd>↓</kbd> / <kbd>Q</kbd> <kbd>E</kbd> 或拖动滑轨${w} · <kbd>H</kbd> 提示`;
}

function resetCamera() {
  map?.fitTo(frameBounds(), isFlat() ? 0.16 : 0.66);
  slice?.resetView({ distance: isWalk() && level.field.bounds.x > 3 ? 13.4 : 11.8, yaw: 0.66, pitch: 0.58 });
}

function startLevel(id, { skipIntro = false } = {}) {
  leaveLevel();
  level = levelById(id);
  const chapter = CHAPTERS[level.chapter];
  const trials = level.forceTrials ? level.trials : [];
  run = isWalk() ? new WalkRun(level.field, level.id, performance.now()) : new VisitRun(level.bodies, level.goal, trials, level.id);
  current = target = isWalk() ? 0.5 : level.startDial;
  trail = [];
  ripples.length = 0;
  flash = 0;
  lastGoalHint = 0;
  lastRefuse = 0;
  actorBob = 0;
  walkPhase = 0;
  if (isWalk()) {
    const targetPt = level.field.item ? level.field.item.start : level.field.goal;
    actorYaw = Math.atan2(targetPt[0] - level.field.start[0], targetPt[1] - level.field.start[1]);
  }
  hintLevel = 0;
  choice = null;
  trialActive = false;
  $('title-screen').hidden = true;
  $('game-screen').hidden = false;
  $('level-chapter').textContent = level.standalone ? '独立场景' : `${level.id} · ${chapter.name}`;
  $('level-title').textContent = level.title;
  const flatView = isFlat();
  $('scene').hidden = flatView;
  $('flat').hidden = !flatView;
  $('reset-view').hidden = flatView;
  $('stage-tag').textContent = flatView ? '你的世界 · 二维俯视 (X-Z)' : '你的世界 · 三维截面 (X-Y-Z)';
  $('map-title').textContent = flatView ? '全貌 (3D)' : 'W 地图';
  $('map-kicker').textContent = flatView ? '三维全貌' : '四维全貌';
  $('map-sub').textContent = flatView ? '竖直方向 = 高度（第三维）' : '竖直方向 = W（第四维，非高度）';
  $('map-note').textContent = isWalk() ? '拖动滑轨换层 · 红区表示当前截面会把角色包进墙里' : '拖动滑轨观察截面变化';
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
  resetCamera();
  render();
  if (level.forceTrials) {
    run.phase = 'predict';
    beginTrial();
    return;
  }
  const firstOfChapter = !level.standalone && LEVELS_LIST.find((l) => l.chapter === level.chapter) === level;
  if (firstOfChapter && !skipIntro && !introShown.has(level.chapter)) {
    introShown.add(level.chapter);
    showCard({ ...chapter.intro, actions: [['开始', 'primary', () => hideCard()]] });
  } else focusStage();
}

const focusStage = () => $(isFlat() ? 'flat' : 'scene').focus({ preventScroll: true });

function updateMapVisibility() {
  $('map-veil').hidden = mapVisible() || !mapOk;
  $('map-note').hidden = !mapVisible();
  updateRail();
  if (level) render();
}

function updateStats() {
  if (!run) return;
  updateMechanisms();
  const stats = $('stats');
  if (isWalk()) {
    if (level.field?.item) {
      const powered = run.socketPowered();
      stats.textContent = run.carrying ? '携带晶核' : (powered ? '插座供电中' : '空手');
      stats.dataset.state = run.carrying ? 'carry' : (powered ? 'power' : 'empty');
    } else {
      stats.textContent = '';
      stats.dataset.state = 'empty';
    }
  } else if (run.session) {
    stats.textContent = run.phase === 'explore' ? '观察中' : `实验 ${run.session.records.length} / ${run.session.trials.length}`;
    stats.dataset.state = 'empty';
  } else {
    stats.textContent = '自由观察';
    stats.dataset.state = 'empty';
  }
}

function updateMechanisms() {
  const panel = $('mechanisms');
  if (!panel) return;
  if (!isWalk() || !level?.field?.relay || !run) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  const powered = run.socketPowered();
  const latched = run.relayLatched;
  const phase = level.field.bodies.find((body) => body.id === 'station-phase-door');
  const phaseOpen = phase ? sliceAtW(phase, dialToW(current)).kind === 'empty' : false;
  const power = $('mech-power');
  const phaseRow = $('mech-phase');
  const latch = $('mech-latch');
  power.dataset.state = powered ? 'on' : 'off';
  power.querySelector('.mech-val').textContent = powered ? '已接通' : '未接通';
  phaseRow.dataset.state = phaseOpen ? 'open' : 'solid';
  phaseRow.querySelector('.mech-name').textContent = level.id === 'station-routes' ? '北门相位墙' : '相位墙';
  phaseRow.querySelector('.mech-val').textContent = phaseOpen ? '已让开' : '实心';
  latch.dataset.state = latched ? 'latched' : 'closed';
  latch.querySelector('.mech-val').textContent = latched ? '已锁存' : '关闭';
  const middle = level.field.bodies.find((body) => body.id === 'station-middle-door');
  const middleRow = $('mech-middle');
  middleRow.hidden = !middle;
  if (middle) {
    const open = sliceAtW(middle, dialToW(current)).kind === 'empty';
    middleRow.dataset.state = open ? 'open' : 'solid';
    middleRow.querySelector('.mech-val').textContent = open ? '已让开' : '实心';
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
  updateActionButton();
  let stats = '';
  if (!isWalk()) {
    if (run.session) stats = `完成 ${run.session.trials.length} 组截面实验`;
    $('predict').hidden = true;
  }
  const next = nextLevel(level.id);
  const chapterEnd = !level.standalone && (!next || next.chapter !== level.chapter);
  const actions = [];
  if (level.id === 'fetch') {
    actions.push(['下一站：中转站 →', 'primary', () => startLevel('station')]);
    actions.push(['再来一次', 'ghost', () => startLevel(level.id, { skipIntro: true })]);
    actions.push(['留在这里看看', 'ghost', () => hideCard()]);
  } else if (level.id === 'station') {
    actions.push(['下一站：两种办法 →', 'primary', () => startLevel('station-routes')]);
    actions.push(['再玩一次', 'ghost', () => startLevel('station', { skipIntro: true })]);
    actions.push(['回到关卡', 'ghost', showTitle]);
  } else if (level.id === 'station-routes') {
    actions.push(['试试另一种办法', 'primary', () => startLevel('station-routes', { skipIntro: true })]);
    actions.push(['留在这里看看', 'ghost', () => hideCard()]);
    actions.push(['回到关卡', 'ghost', showTitle]);
  } else if (level.id === 'lab') {
    actions.push(['查看截面公式', 'primary', () => showWhy()]);
    actions.push(['再来一次', 'ghost', () => startLevel(level.id, { skipIntro: true })]);
    actions.push(['回到章节', 'ghost', () => showTitle()]);
  } else {
    actions.push([next ? '下一关 →' : '回到章节', 'primary', () => (next ? startLevel(next.id) : showTitle())]);
    if (chapterEnd) actions.push(['原理说明（可选）', 'ghost', () => showWhy()]);
    actions.push(['再来一次', 'ghost', () => startLevel(level.id, { skipIntro: true })]);
    if (isWalk()) actions.push(['留在这里看看', 'ghost', () => hideCard()]);
  }
  actions.push(['保存记录 ↓', 'ghost', download]);
  const body = level.id === 'station-routes'
    ? (run.socketUses ? '这次使用了插座。下一次，试试不供电就把晶核送过去。' : '这次没有使用插座。也可以先把回廊准备好，再回来运送。')
    : level.id === 'station' ? '接收台亮了，晶核已经送达。' : '';
  showCard({ kicker: '完成', title: level.done, body, stats, actions });
  setObjective(level.field?.item ? '晶核已送达。' : '已完成。');
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
  const open = !$('hint-panel').hidden;
  $('hint-count').textContent = `${hintLevel}/${level?.hints.length ?? 3}`;
  $('hint-label').textContent = open ? '收起提示' : hintLevel ? '重看提示' : '观察提示';
  $('hint').setAttribute('aria-expanded', String(open));
}
function revealHint() {
  if (!level || cardOpen) return;
  if (hintLevel < level.hints.length) {
    hintLevel += 1;
    run.hints += 1;
  }
  $('hint-history').replaceChildren(...level.hints.slice(0, hintLevel).map((text) => {
    const item = document.createElement('li');
    item.textContent = text;
    return item;
  }));
  $('hint-panel').hidden = false;
  $('hint-next').hidden = hintLevel >= level.hints.length;
  $('hint-next').textContent = hintLevel === level.hints.length - 1 ? '查看完整解法' : '再给一点提示';
  updateHintButton();
}
function showHint() {
  if (!level || cardOpen) return;
  if (!hintLevel) { revealHint(); return; }
  $('hint-panel').hidden = !$('hint-panel').hidden;
  updateHintButton();
}
$('hint').addEventListener('click', (event) => {
  const fromPointer = event.detail > 0;
  showHint();
  // A mouse click must hand movement back to the stage. Keyboard activation
  // keeps focus on the button so Tab / Enter / Space still work normally.
  if (fromPointer) focusStage();
});
$('hint-next').addEventListener('click', (event) => {
  revealHint();
  if (event.detail > 0 || $('hint-next').hidden) focusStage();
});
$('hint-close').addEventListener('click', () => {
  $('hint-panel').hidden = true;
  updateHintButton();
  focusStage();
});
$('peek').addEventListener('click', () => {
  if (!run || mapPeeking) return;
  run.peeks += 1;
  mapPeeking = true;
  updateMapVisibility();
  updateStats();
  clearTimeout(peekTimer);
  peekTimer = setTimeout(() => { mapPeeking = false; updateMapVisibility(); }, PEEK_MS);
});

// ---------- Predictions (Principle Lab / optional trials) ----------
function onObserved() {
  if (run.won) {
    win();
    return;
  }
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
  if (key === 'Escape' && !$('hint-panel').hidden) {
    event.preventDefault();
    $('hint-panel').hidden = true;
    updateHintButton();
    focusStage();
    return;
  }
  if (event.target.closest?.('button') && (key === ' ' || key === 'Enter')) return;
  if (event.target.closest?.('#w-rail') && ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(key)) return;
  if (key === 'h' || key === 'H') { if (!event.repeat) showHint(); return; }
  if (key === 'r' || key === 'R') { if (!event.repeat) startLevel(level.id, { skipIntro: true }); return; }
  if (isWalk() && level?.field?.item && (key === ' ' || key === 'f' || key === 'F')) {
    event.preventDefault();
    if (!event.repeat) handleInteract();
    return;
  }
  const visitArrow = !isWalk() && (key === 'ArrowUp' || key === 'ArrowDown');
  if (key in W_KEYS || visitArrow) {
    event.preventDefault();
    if (event.repeat || railLocked()) return;
    focusStage();
    sfxInit();
    wHold = W_KEYS[key] ?? (key === 'ArrowUp' ? 1 : -1);
    heldWKey = key;
    beginGesture();
    requestFrame();
    return;
  }
  if (isWalk() && MOVE_DIRS[key]) {
    event.preventDefault();
    focusStage();
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

$('play').addEventListener('click', () => { sfxInit(); startLevel('station-routes'); });
$('play-fetch').addEventListener('click', () => { sfxInit(); startLevel('fetch'); });
$('play-chapters')?.addEventListener('click', () => { sfxInit(); startLevel(firstOpenLevel().id); });
$('open-lab')?.addEventListener('click', () => { sfxInit(); startLevel('lab'); });
$('action-btn')?.addEventListener('click', () => { handleInteract(); focusStage(); });
$('unlock-all')?.addEventListener('click', () => { sandboxAll = !sandboxAll; renderChapters(); });
$('back').addEventListener('click', showTitle);
$('restart').addEventListener('click', () => { if (level) startLevel(level.id, { skipIntro: true }); });
$('reset-view').addEventListener('click', () => { if (level) { resetCamera(); focusStage(); } });
$('sound').addEventListener('click', () => {
  const on = $('sound').getAttribute('aria-pressed') !== 'true';
  $('sound').setAttribute('aria-pressed', String(on));
  sfxSetMuted(!on);
});
for (const id of ['scene', 'flat']) {
  $(id).addEventListener('pointerdown', () => { if (!cardOpen) focusStage(); });
}
document.addEventListener('pointerdown', sfxInit, { once: true });

// ?level=1-2 opens a level directly (for playtests and shared links).
const requested = levelById(new URLSearchParams(location.search).get('level') ?? '');
if (requested) startLevel(requested.id);
else showTitle();
