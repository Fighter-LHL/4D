import { clampDial, dialToW, wToDial, corridorSections, sliceAtW, wFootprint, flatShape, blockedWIntervals, exclusionRadius, wChangeEngulfs, goalSliceAtW, itemSectionAtW, itemFootprint, ITEM_TINT, PREDICTIONS } from './geometry.mjs';
import { WalkRun, VisitRun } from './game.mjs';
import { CHAPTERS, LEVELS_LIST, levelById, nextLevel, isUnlocked } from './levels.mjs';
import { screenToWorldMove, movementYaw, relayRailMarks, nearbyRailMark, railReleaseDial, WControl, W_PARAMS, studyConfig, nearbyTargets } from './controls.mjs';
import { StudySession, STUDY_CHAIN, studyLevel, readStudyBuild } from './study.mjs';
import { readStationSeals, rememberStationRun, stationNextAction } from './station-progress.mjs';
import { StationEffects } from './station-effects.mjs';
import { Patrol, sentryBody, presentAt, sees, SENTRY } from './sentry.mjs';
import { LAYERS, layerBlend, layerIndex, wColor, cssColor } from './layers.mjs';
import { SliceRenderer } from './renderer.mjs';
import { MapRenderer } from './map-renderer.mjs';
import { FlatRenderer } from './flat-renderer.mjs';
import { sfxInit, sfx, sfxSetMuted } from './sfx.mjs';

const $ = (id) => document.getElementById(id);
const study = studyConfig(location.search);
const wB = study.enabled && study.condition === 'b';
const wControl = new WControl();
const buildInfo = study.enabled ? await readStudyBuild() : {};
const session = study.enabled ? new StudySession(study, buildInfo) : null;
let studySealed = false;
let studySegment = 0;
const measuring = () => study.enabled && !studySealed;
document.body.classList.toggle('w-direction', wB);
// Product (non-study) pages drop the classroom framing; the study is frozen.
document.body.classList.toggle('product', !study.enabled);
document.body.classList.toggle('w-precise', study.precise);
$('w-buttons').hidden = !wB;
$('study-tools').hidden = !study.enabled;

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
  'gate-phase-wall': 2,
  'gate-orb': 7,
  'gate-orb-cold': 7,
  'station-power-door': 1,
  'station-phase-door': 2,
  'station-return-door': 3,
  'station-divider-n': 4,
  'station-divider-mid': 4,
  'station-divider-s': 4,
  'station-middle-door': 5,
  'station-channel-n': 6,
  'station-channel-s': 6,
  'station-exit-n': 7,
  'station-exit-s': 7,
});
const roleOf = (id) => BODY_ROLES[id] ?? 0;
const DEVICE_FEEDBACK = Object.freeze({
  'latch-other-w': '回廊开关',
  'socket-other-w': '插座',
  'socket-empty': '插座是空的',
  'latch-open': '回廊已打开',
});

// ---------- Progress ----------
const progress = (() => {
  if (study.enabled) return new Set();
  try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? []); } catch { return new Set(); }
})();
function saveProgress() {
  if (study.enabled) return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...progress])); } catch { /* private mode */ }
}
let sealStorage = null;
try { if (!study.enabled) sealStorage = localStorage; } catch { /* storage may be unavailable */ }
let stationSeals = readStationSeals(sealStorage);
function sealMarkup() {
  return ['stone', 'copper'].map((key) => `<span class="route-seal ${key}" data-earned="${stationSeals[key]}" aria-label="${key === 'stone' ? '石印' : '铜印'}：${stationSeals[key] ? '已点亮' : '未点亮'}"><i aria-hidden="true"></i><span>${key === 'stone' ? '石印' : '铜印'}</span></span>`).join('');
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
const stationEffects = new StationEffects();
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
let introCueTimer = 0;
let introCueUntil = 0;
let lastRefuse = -Infinity;
let fieldEpoch = 0;
let gestureId = 0;
let gestureSource = null;
let gestureDistance = 0;
let gestureReversals = 0;
let lastWDirection = 0;
let wContactThisFrame = false;
let groundContactThisFrame = false;
let pulseUntil = 0;
const wPointers = new Map();
const railKeys = new Set();
let refusalNoted = false; // the W refusal sentence shows once per level
let guide = null; // { w, reach, until }: a W direction the controls point toward
let guideTimer = 0;
let goalNoteUntil = 0;
let highlightIds = new Set(); // bodies pointed at from the mechanism panel
const hudUsed = new Set();
// The W gauge beside the character (B and the normal entry; A keeps the
// original rail-only feedback). It appears while W changes and fades after.
const gaugeOn = wB || !study.enabled;
const GAUGE_MS = 1400;
let gaugeW = null;
let gaugeUntil = 0;
let gaugeTimer = 0;
let gaugeKey = '';
// Sentry levels: patrols run in level time; caught → back to a checkpoint.
let patrol = null;
let checkpointReached = false;

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

// Feedback that replaces sentences: the words still reach screen readers.
const announce = (text) => { $('sr-status').textContent = text; };
function pop(id, name = id.startsWith('mech-') ? 'flash' : 'pop') {
  const el = $(id);
  el.classList.remove(name);
  void el.offsetWidth;
  el.classList.add(name);
}
// Point the ±W controls toward a W for a moment (no sentence needed).
function guideToward(w, reach = 0.12, ms = 1800) {
  guide = { w, reach, until: performance.now() + ms };
  clearTimeout(guideTimer);
  guideTimer = setTimeout(() => { guide = null; if (level) render(); }, ms);
}

// ---------- Frame building ----------
function displayBodies() {
  if (isWalk()) return run.activeField().bodies;
  return trialActive ? [run.session.trial.body] : level.bodies;
}
const frameBounds = () => (isWalk() ? level.field.bounds : { x: 2.8, z: 2.0 });

// Chapter 2 hides every W aid unless the player is peeking; a refused W change
// briefly shows only the floor outlines of the bodies that refused it.
const NO_AIDS = { ghost: () => 0, blocked: [], marks: [] };
function wAids(now = performance.now()) {
  if (!isWalk() || !run) return NO_AIDS;
  const activeField = run.activeField();
  if (mapVisible()) return { ghost: () => 1, blocked: blockedWIntervals(activeField, run.pos), marks: relayRailMarks(level, true) };
  if (!nudge || now >= nudge.until) { nudge = null; return NO_AIDS; }
  const rem = (nudge.until - now) / NUDGE_MS;
  const fade = reducedMotion.matches ? 1 : Math.min(1, rem / 0.35);
  return { ghost: (id) => (nudge.ids.has(id) ? fade : 0), blocked: [], marks: [] };
}

function buildFrame() {
  const w = dialToW(current);
  const bodies = displayBodies();
  const activeField = isWalk() && run ? run.activeField() : (isWalk() ? level.field : null);
  const y = isWalk() ? level.field.tokenY : bodies[0].center[1];
  const now = performance.now();
  const relay = isWalk() ? run.relayState() : null;
  stationEffects.observe(relay, now, reducedMotion.matches);
  const tinted = bodies.map((body) => ({ body, tint: wColor(body.center[3]), foot: wFootprint(body, y) }));
  const maxR = (body, foot) => (isWalk() && body.type === 'sphere' ? exclusionRadius(body, activeField) : foot.radius ?? 0);
  const aids = wAids(now);
  const outline = (id) => (wB && nudge?.ids.has(id) && now < nudge.until ? 1 : highlightIds.has(id) ? -1 : 0);
  const sections = tinted.map(({ body, tint, foot }) => ({ ...sliceAtW(body, w), role: roleOf(body.id), tint, maxR: maxR(body, foot), ghost: aids.ghost(body.id), refused: outline(body.id) }));
  const footprints = tinted.map(({ tint, foot }) => ({ ...foot, tint }));
  if (isWalk() && run?.item) {
    const itemSec = itemSectionAtW(level.field, run.itemState(), w);
    if (itemSec) sections.push({ ...itemSec, role: 0, ghost: mapVisible() ? itemSec.ghost : 0 });
    const itemFoot = itemFootprint(level.field, run.itemState());
    if (itemFoot) footprints.push(itemFoot);
  }
  // Sentries are drawn as the hyperspheres they are: only the ones whose W
  // range holds this slice appear. Other layers' gaze shows only as faint
  // floor cones, and only where W aids are allowed.
  let sentries = null;
  if (patrol) {
    const ghosts = mapVisible();
    sentries = patrol.poses().map(({ sentry, pose, alert }) => {
      const body = sentryBody(sentry, pose);
      const tint = wColor(sentry.w);
      sections.push({ ...sliceAtW(body, w), role: 8, tint, maxR: 0, ghost: 0, refused: 0 });
      footprints.push({ ...wFootprint(body, y), tint });
      const presence = presentAt(sentry, w) ? 1 : ghosts ? 0.3 : 0;
      return { x: pose.x, z: pose.z, yaw: pose.yaw, alert, presence, tint, range: sentry.range ?? SENTRY.range, fov: sentry.fov ?? SENTRY.fov };
    });
  }
  const checkpoint = isWalk() && level.field.checkpoint ? { x: level.field.checkpoint.pos[0], z: level.field.checkpoint.pos[1], reached: checkpointReached } : null;
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
    token: isWalk() ? { pos: run.pos, flash, feedbackB: wB, won: run.won, carrying: run.carrying, yaw: actorYaw, bob: actorBob,
      arrival: run.won ? (reducedMotion.matches ? 1 : Math.min(1, (now - run.finishedAt) / 280)) : 0 } : null,
    goal: isWalk() ? level.field.goal : null,
    goalState: isWalk() ? goalSliceAtW(level.field, w) : null,
    relay,
    sentries,
    checkpoint,
    mechanismEffects: stationEffects.sample(now),
    station: level.id === 'station-routes' ? {
      airlock: run.airlockCleared, seals: stationSeals,
      cue: !reducedMotion.matches && now < introCueUntil ? Math.sin(Math.PI * (introCueUntil - now) / 900) : 0,
    } : null,
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
  const sealsEl = $('receiver-seals');
  sealsEl.hidden = true;
  socketEl.hidden = true;
  latchEl.hidden = true;
  if (!actorEl || !itemEl || !goalEl) return;
  if (!isWalk() || !run || !frame || cardOpen) {
    actorEl.hidden = true;
    itemEl.hidden = true;
    goalEl.hidden = true;
    $('w-gauge').hidden = true;
    updateSentryTags(null, null);
    return;
  }
  const view = isFlat() ? flat : slice;
  if (!view?.project) return;
  updateGauge(view, frame);
  updateSentryTags(view, frame);
  const moved = run.distance > 0.25;
  if (!moved) {
    const actorPt = view.project([run.pos[0], 0.88 + actorBob, run.pos[1]]);
    placeTag(actorEl, actorPt, '你', false);
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
    // Beside a device in another W, a faint dashed label says "right here,
    // another slice"; the action button's chip says which way.
    placeTag(socketEl, socketNear ? view.project([socket.x, 0.92, socket.z]) : null,
      powered ? '供电中' : '蓝层插座', !socketHere);
    placeTag(latchEl, latchNear ? view.project([latch.x, 0.92, latch.z]) : null,
      latched ? '回廊已打开' : '回廊开关', !latchHere);
  }

  if (level.field.item && run.item && !run.carrying && !run.won && !run.socketPowered()) {
    const itemSec = itemSectionAtW(level.field, run.itemState(), frame.w);
    const visible = itemSec && itemSec.radius > 0;
    const itemDist = Math.hypot(run.pos[0] - run.item.x, run.pos[1] - run.item.z);
    const nearSpot = itemDist <= level.field.item.pickupRadius;
    const itemPt = view.project([run.item.x, 0.62, run.item.z]);
    if (visible && (nearSpot || !moved)) {
      const tight = nearSpot && run.canInteract(current).reason === 'tight';
      placeTag(itemEl, itemPt, tight ? '空间不足' : '晶核', false);
    } else if (!visible && mapVisible() && (!moved || itemDist < 3.2)) {
      placeTag(itemEl, itemPt, wB && !study.precise ? '晶核' : `晶核 · W ${signed(run.item.w)}`, true);
    } else {
      itemEl.hidden = true;
    }
  } else {
    itemEl.hidden = true;
  }

  const [gx, gz] = level.field.goal;
  const goalOpen = frame.goalState ? frame.goalState.open : true;
  const goalDist = Math.hypot(run.pos[0] - gx, run.pos[1] - gz);
  if (level.id === 'station-routes' && goalDist < 1.7) {
    const pt = view.project([gx, 0.1, gz + 0.65]);
    if (pt) {
      sealsEl.hidden = false;
      // Keep both seals readable when orbiting near an edge. The canvas,
      // rather than the whole stage, excludes the mobile W rail.
      const width = view.canvas.clientWidth, height = view.canvas.clientHeight;
      const inset = sealsEl.offsetWidth / 2 + 8;
      sealsEl.style.left = `${Math.max(inset, Math.min(width - inset, pt.x * width / 100))}px`;
      sealsEl.style.top = `${Math.max(8, Math.min(height - sealsEl.offsetHeight - 8, pt.y * height / 100))}px`;
    }
  }
  if (!moved || goalDist < 1.7 || (!level.field.relay && !goalOpen)) {
    const goalPt = view.project([gx, 0.28, gz]);
    const goalName = level.field.item ? '接收台' : '出口';
    const note = performance.now() < goalNoteUntil ? ' · 需要晶核' : goalOpen ? '' : '（在中间层）';
    placeTag(goalEl, goalPt, goalName + note, !goalOpen);
  } else {
    goalEl.hidden = true;
  }
}

// "!" over a sentry that is watching you in your own slice.
function updateSentryTags(view, frame) {
  const host = $('world-tags');
  const tags = (view && frame?.sentries ? frame.sentries : []).map((s, i) => {
    let tag = $(`sentry-tag-${i}`);
    if (!tag || !tag.classList) {
      tag = document.createElement('span');
      tag.id = `sentry-tag-${i}`;
      tag.className = 'world-tag sentry-alert';
      host.append(tag);
    }
    const sentry = level.sentries[i];
    const pt = s.presence === 1 && s.alert > 0.02 ? view.project([s.x, sentry.y + sentry.radius + 0.25, s.z]) : null;
    placeTag(tag, pt, s.alert > 0.6 ? '!!' : '!');
    if (pt) tag.style.opacity = String(0.45 + 0.55 * s.alert);
    return tag;
  });
  for (const extra of host.querySelectorAll?.('.sentry-alert') ?? []) if (!tags.includes(extra)) extra.hidden = true;
}

function showGauge() {
  gaugeUntil = performance.now() + GAUGE_MS;
  clearTimeout(gaugeTimer);
  gaugeTimer = setTimeout(() => { if (level) render(); }, GAUGE_MS + 20);
}

// A small W scale floating beside the character: current W, the direction of
// motion, the exit layer, a pointed-at target and (only where wAids allows)
// the red engulf zones. Keyboard players never need to look at the side rail.
function updateGauge(view, frame) {
  const el = $('w-gauge');
  if (gaugeW !== null && frame.w !== gaugeW) showGauge();
  gaugeW = frame.w;
  const pointed = activeGuide(frame.w);
  // In a patrolled level choosing W is the whole game, so the gauge stays.
  const wanted = gaugeOn && !run.won && (!!patrol || performance.now() < gaugeUntil || !!wHold || !!pointed || wControl.state === 'BLOCKED');
  const pt = wanted ? view.project([run.pos[0], 0.62 + actorBob, run.pos[1]]) : null;
  el.hidden = !pt;
  if (!pt) return;
  el.style.left = `${pt.x.toFixed(1)}%`;
  el.style.top = `${pt.y.toFixed(1)}%`;
  el.dataset.move = String(Math.sign(wHold));
  $('wg-thumb').style.top = `${(1 - current) * 100}%`;
  const top = (w) => (1 - (w + 2) / 4) * 100;
  // Layers in which a sentry is looking at this very spot (a W aid, so
  // only where the map is visible): the gauge says which W would be seen.
  const field = run.activeField();
  const watched = patrol && mapVisible() ? patrol.poses().filter(({ sentry, pose }) =>
    sees(sentry, pose, run.pos, sentry.w, corridorSections(sentry.w, run.field), field.tokenY))
    .map(({ sentry }) => ['wg-watch', sentry.w - sentry.radius, sentry.w + sentry.radius]) : [];
  const bands = [
    ...watched,
    ...frame.blocked.map(([lo, hi]) => ['wg-block', lo, hi]),
    ...(level.field.goalW ? [['wg-goal', ...level.field.goalW]] : []),
    ...(pointed ? [['wg-guide', pointed.w, pointed.w]] : []),
  ];
  const key = bands.map((b) => b.join(':')).join('|');
  if (key === gaugeKey) return;
  gaugeKey = key;
  $('wg-marks').replaceChildren(...bands.map(([name, lo, hi]) => {
    const mark = document.createElement('span');
    mark.className = name;
    mark.style.top = `${top(hi)}%`;
    if (name === 'wg-guide') mark.style.color = cssColor(wColor(lo));
    else mark.style.bottom = `${100 - top(lo)}%`;
    return mark;
  }));
}

// Standing on a device that lives in another W (e.g. carrying the core onto
// the socket at W 0, where "drop" would leave it in the wrong slice). The
// button keeps its verb and gains a ±W chip; the matching W control glows.
function deviceGuide() {
  const relay = level?.field?.relay;
  if (!relay || !run || run.won) return null;
  const state = run.canInteract(current);
  const w = dialToW(current);
  for (const id of ['socket', 'latch']) {
    const device = relay[id];
    if ((id === 'latch' && run.relayLatched) || Math.abs(w - device.w) <= device.wReach
      || Math.hypot(run.pos[0] - device.x, run.pos[1] - device.z) > device.reach) continue;
    if (run.carrying ? state.action !== 'drop' : state.reason !== `${id}-other-w`) continue;
    const label = id === 'latch' ? '拉开回廊' : run.carrying ? '放入插座' : run.socketPowered() ? '取回晶核' : '插座';
    return { label, w: device.w, reach: device.wReach, dir: Math.sign(device.w - w) };
  }
  return null;
}

const dirLabel = (dir) => (dir > 0 ? '+W' : '−W');
function setAction(btn, label, { disabled = false, guideDir = 0, key = true } = {}) {
  btn.hidden = false;
  btn.disabled = disabled;
  btn.textContent = label;
  btn.dataset.key = guideDir ? dirLabel(guideDir) : key ? '空格' : '';
  btn.dataset.guide = guideDir ? String(guideDir) : '';
  btn.setAttribute('aria-label', guideDir ? `${label}：往 ${dirLabel(guideDir)} 移动` : key ? `${label}（空格 / F）` : label);
}

function updateActionButton() {
  const btn = $('action-btn');
  if (!btn) return;
  $('replay-btn').hidden = true;
  $('return-levels').hidden = true;
  if (!isWalk() || !run || cardOpen) {
    btn.hidden = true;
    return;
  }
  if (run.won) {
    const near = atReceiver();
    btn.hidden = !near;
    btn.disabled = false;
    btn.textContent = completionAction().label;
    if (btn.dataset) btn.dataset.key = btn.dataset.guide = '';
    $('return-levels').hidden = !near;
    $('replay-btn').hidden = !near || !['station', 'fetch'].includes(level.id);
    return;
  }
  if (!level.field.item) { btn.hidden = true; return; }
  const state = run.canInteract(current);
  const here = deviceGuide();
  if (state.action === 'latch' || state.action === 'dock') setAction(btn, state.action === 'latch' ? '拉开回廊' : '放入插座');
  else if (here) setAction(btn, here.label, { disabled: true, guideDir: here.dir });
  else if (run.carrying) setAction(btn, '放下晶核');
  else if (state.action === 'pickup') setAction(btn, run.socketPowered() ? '取回晶核' : '拿起晶核');
  else if (state.action === 'blocked') setAction(btn, '空间不足', { key: false });
  else if (DEVICE_FEEDBACK[state.reason]) setAction(btn, DEVICE_FEEDBACK[state.reason], { disabled: true, key: false });
  else btn.hidden = true;
}

function atReceiver() {
  return Math.hypot(run.pos[0] - level.field.goal[0], run.pos[1] - level.field.goal[1]) <= 0.85;
}

function completionAction() {
  if (measuring()) return { label: '继续', level: STUDY_CHAIN[studySegment + 1] };

  if (level.id === 'gate' || level.id === 'gate-blind') return { label: '下一关：中转站', level: 'station-routes' };
  if (level.id === 'station-routes') return stationNextAction(stationSeals);
  if (level.id === 'fetch') return { label: '下一关：旧中转站', level: 'station' };
  if (level.id === 'station') return { label: '下一关：中转站', level: 'station-routes' };
  const next = nextLevel(level.id);
  return { label: next ? '下一关' : '回到关卡', level: next?.id };
}

function handleInteract() {
  if (!isWalk() || !run || cardOpen) return;
  if (run.won) {
    if (!atReceiver()) return;
    if (measuring()) { advanceStudy(); return; }
    const next = completionAction().level;
    if (next) startLevel(next);
    else showTitle();
    return;
  }
  if (!level.field.item) return;
  sfxInit();
  const here = deviceGuide();
  if (here) {
    record('interaction', { reason: 'device-other-w' });
    sfx.blocked();
    $('w-rail').classList.add('pulse');
    guideToward(here.w, here.reach);
    announce(`${here.label}：往 ${dirLabel(here.dir)} 移动`);
    render();
    return;
  }
  const res = run.interact(performance.now(), current);
  if (['picked', 'dropped', 'docked', 'latched'].includes(res.action)) {
    fieldEpoch += 1;
    if (wB) {
      const docking = !!wControl.docking;
      wControl.invalidate();
      if (docking) { record('dock_cancel', { reason: 'state_changed' }); commitW(); }
    }
  }

  record('interaction', { reason: res.action ?? res.reason });
  if (res.action === 'docked' || res.action === 'latched') {
    sfx.appear();
    buildRailSpans();
    pop(res.action === 'docked' ? 'mech-power' : 'mech-latch');
    announce(res.action === 'docked' ? '插座接通了' : '回廊已打开');
  } else if (res.action === 'picked') {
    sfx.appear();
    buildRailSpans();
    if (res.won) win();
    else { pop('stats'); announce('拿起晶核'); }
  } else if (res.action === 'dropped') {
    sfx.vanish();
    buildRailSpans();
    if (res.won) win();
    else { pop('stats'); announce('晶核留在这一层'); }
  } else if (res.reason === 'tight') {
    flash = 1;
    sfx.refused();
    toast('空间不足', 'warn');
  } else if (DEVICE_FEEDBACK[res.reason]) {
    pop('action-btn');
    announce(DEVICE_FEEDBACK[res.reason]);
  } else if (res.reason === 'other-w') {
    sfx.blocked();
    pop('item-tag');
    if (run.item) guideToward(run.item.w, level.field.item.wReach);
    announce('晶核不在当前层');
  } else if (res.reason === 'far') {
    pop('item-tag');
    announce('靠近晶核后可拿起');
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
  if (stationEffects.isActive(now)) requestFrame();
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
  if (!level || (wB && document.hidden)) { previousTime = 0; return; }
  const delta = previousTime ? Math.min((time - previousTime) / 1000, 0.05) : 1 / 60;
  previousTime = time;
  wContactThisFrame = groundContactThisFrame = false;
  if (wB && isWalk() && !cardOpen) stepToken(delta, time);
  if (reveal) {
    const p = reducedMotion.matches ? 1 : Math.min(1, (time - reveal.started) / 1100);
    const ease = p * p * (3 - 2 * p);
    current = target = reveal.from + (reveal.to - reveal.from) * ease;
    if (p === 1) { reveal = null; finishReveal(); }
  } else if (wB) {
    if (!railLocked() && wControl.direction && wControl.shouldDrive(run)) {
      const next = isWalk() ? wControl.next(level, run, delta) : clampDial(current + wControl.direction * W_RATE * delta);
      if (next !== current) requestDial(next);
    } else if (!railLocked() && wControl.docking) {
      const dial = wControl.dockStep(level, run, delta);
      if (dial !== null) requestDial(dial, true, true);
      if (!wControl.docking) {
        record(dial === null ? 'dock_cancel' : 'dock_end', { reason: dial === null ? 'conditions_changed' : 'arrived' });
        commitW();
      }
    }
  } else {
    if (wHold && !railLocked()) {
      const next = clampDial(target + wHold * W_RATE * delta);
      if (next !== target && !requestDial(next)) wHold = 0;
    }
    if (reducedMotion.matches || Math.abs(current - target) < 1e-4) current = target;
    else current += (target - current) * (1 - Math.exp(-14 * delta));
  }
  if (!wB && isWalk() && !cardOpen) stepToken(delta, time);
  // A patrolled level is never idle: its sentries keep walking.
  const patrolling = !!patrol && !run.won && !cardOpen;
  if (patrolling) stepPatrol(delta);
  if (wB && groundContactThisFrame && !wContactThisFrame) sfx.blocked();
  if (wB && pulseUntil) { flash = Math.max(0, (pulseUntil - time) / W_PARAMS.pulseMs); if (!flash) pulseUntil = 0; }
  else if (flash > 0) flash = Math.max(0, flash - delta * 2.4);
  render();
  const arriving = isWalk() && run.won && !reducedMotion.matches && time < run.finishedAt + 280;
  if (patrolling || reveal || (wB && wControl.docking) || wHold || current !== target || ripples.length || pressed.size || flash > 0 || trail.length || nudge || time < introCueUntil || arriving || stationEffects.isActive(time)) requestFrame();
  else previousTime = 0;
}

function stepPatrol(delta) {
  const field = run.activeField();
  const res = patrol.step(delta, run.pos, dialToW(current), run.sectionsAt(current), field.tokenY, field.tokenRadius);
  if (res.spotted.length) { sfx.blocked(); buzz(); }
  const cp = level.field.checkpoint;
  if (cp && !checkpointReached && Math.hypot(run.pos[0] - cp.pos[0], run.pos[1] - cp.pos[1]) < 0.45) {
    checkpointReached = true;
    sfx.appear();
    announce('检查点');
  }
  if (res.caught) caught();
}

// Caught: no lives or score, just back to the last checkpoint with held
// input dropped (keys must be pressed again) and a short grace period.
function caught() {
  record('caught');
  sfx.refused();
  buzz();
  if (wB) cancelInputs('caught', true, false);
  else { pressed.clear(); wHold = 0; heldWKey = null; commitW('caught'); }
  const cp = checkpointReached ? level.field.checkpoint : { pos: level.field.start, w: 0 };
  run.respawn(cp.pos, wToDial(cp.w));
  current = target = run.dial;
  patrol.respawn();
  trail = [];
  flash = 1;
  pop('stage', 'caught');
  announce('被发现了，回到检查点');
}

let lastGoalHint = 0;
function stepToken(delta, now) {
  let dx = 0;
  let dz = 0;
  pressed.forEach((key) => { const d = MOVE_DIRS[key]; if (d) { dx += d[0]; dz += d[1]; } });
  [dx, dz] = screenToWorldMove(dx, dz, isFlat() ? 0 : movementYaw(slice?.orbit.yaw ?? 0));
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
    if (wB) groundContactThisFrame = true;
    else sfx.blocked();
    if (!run.carrying && run.blockStreak >= 3) $('w-rail').classList.add('pulse');
  }
  if (result.goalNeedsItem && result.travelled > 0 && now - lastGoalHint > 1800) {
    lastGoalHint = now;
    goalNoteUntil = performance.now() + 1800;
    setTimeout(() => { if (level) render(); }, 1850);
    announce('接收台还没有晶核');
  }
  if (result.goalOtherW && result.travelled > 0 && now - lastGoalHint > 1800) {
    lastGoalHint = now;
    $('w-rail').classList.add('pulse');
    const [lo, hi] = level.field.goalW;
    guideToward((lo + hi) / 2, (hi - lo) / 2);
    announce(level.field.item ? '接收台在另一层' : '出口在另一层');
  }
  if (result.won) win();
}

// ---------- W control ----------
function requestDial(value, immediate = false, automatic = false) {
  let dial = clampDial(value);
  let clamped = false;
  const before = wB ? current : target;
  if (isWalk()) {
    const from = run.dial;
    const fromW = dialToW(from);
    const hadAirlock = run.airlockCleared;
    // Automatic motion rejects the whole remaining interval before moving.
    if (automatic && !run.canSetDial(dial)) return false;
    ({ dial, clamped } = run.reachDial(dial));
    if (!hadAirlock && run.airlockCleared) sfx.appear();
    if (wB && !automatic) {
      const contact = wControl.accepted(run, from, clamped);
      if (contact.ended) record('w_contact_end', { actual_W: dialToW(dial), reason: 'safe_displacement' });
      if (contact.started) {
        record('w_contact_start', { actual_W: dialToW(dial), requested_W: dialToW(clampDial(value)), reason: 'engulf' });
        revealBlockers(fromW, dialToW(clampDial(value)));
        refuse();
      }
    } else if (clamped) revealBlockers(fromW, dialToW(clampDial(value)));
  }
  if (clamped && !wB) refuse();
  target = dial;
  const direction = Math.sign(dial - before);
  if (direction && gestureSource?.startsWith('rail-')) {
    if (lastWDirection && direction !== lastWDirection) gestureReversals += 1;
    if (direction !== lastWDirection) record('w_direction_change', { direction });
    lastWDirection = direction;
  }
  if (wB || immediate || reducedMotion.matches) {
    current = target;
    if (gestureStart !== null) gestureDistance += Math.abs(dialToW(dial) - dialToW(before));
    if (isWalk() && !run.won && run.step(0, 0, 0, performance.now(), current).won) win();
  }
  if (!wB && !immediate && !reducedMotion.matches && gestureStart !== null) gestureDistance += Math.abs(dialToW(dial) - dialToW(before));
  requestFrame();
  return !clamped;
}

// A short haptic tick on touch devices, rate-limited with the refusal sound.
const coarsePointer = window.matchMedia('(pointer: coarse)');
const buzz = () => { if (coarsePointer.matches) navigator.vibrate?.(25); };

// The sentence teaches once per level; after that the outline, foot ring,
// sound and haptic carry the refusal on their own.
function noteRefusal(text, ms) {
  if (refusalNoted) { announce(text); return; }
  refusalNoted = true;
  toast(text, 'warn', ms);
}

function refuse() {
  flash = 1;
  const now = performance.now();
  if (gaugeOn) { showGauge(); pop('w-gauge', 'hit'); }
  if (wB) {
    wContactThisFrame = true;
    pulseUntil = now + W_PARAMS.pulseMs;
    if (now - lastRefuse >= W_PARAMS.soundGapMs) {
      buzz();
      if (sfx.refused() !== false) lastRefuse = now;
    }
    noteRefusal(run?.carrying ? '晶核会碰到障碍' : '沿W会碰到障碍', W_PARAMS.toastMs);
  } else {
    if (now - lastRefuse > 700) {
      buzz();
      sfx.refused();
      noteRefusal(run?.carrying ? '这次换层会让晶核碰到障碍。' : '这次换层会碰到障碍。');
    }
    lastRefuse = now;
  }
  requestFrame();
}

function revealBlockers(fromW, toW) {
  if (mapVisible() && !wB) return;
  const field = run.activeField();
  const ids = field.bodies.filter((b) => wChangeEngulfs({ ...field, bodies: [b] }, run.pos, fromW, toW)).map((b) => b.id);
  if (!ids.length) return;
  nudge = { ids: new Set(ids), until: performance.now() + NUDGE_MS };
  clearTimeout(nudgeTimer);
  nudgeTimer = setTimeout(() => { nudge = null; if (level) render(); }, NUDGE_MS);
}

function record(type, extra = {}) {
  session?.record(type, { level: level?.id, run, dial: level ? current : null, source: gestureStart === null ? null : gestureSource,
    gesture: gestureStart === null ? null : gestureId, epoch: fieldEpoch }, extra);
}

function beginGesture(source = null) {
  if (gestureStart !== null) return;
  gestureStart = target;
  gestureSource = source;
  gestureId += 1;
  gestureDistance = gestureReversals = lastWDirection = 0;
  record('w_gesture_start');
}

function beginW(source, id, direction = 0) {
  if (!level || railLocked() || document.hidden) return false;
  if (wControl.docking) {
    record('dock_cancel', { reason: 'new_input' });
    wControl.cancel();
    commitW();
  }
  if (!wControl.press(source, id, direction)) return false;
  beginGesture(source);
  syncWDirection();
  return true;
}

function syncWDirection() {
  wHold = wControl.direction;
  if (wHold && lastWDirection && wHold !== lastWDirection) gestureReversals += 1;
  if (wHold !== lastWDirection) record('w_direction_change', { direction: wHold });
  if (wHold) lastWDirection = wHold;
  requestFrame();
}

function releaseW(source, id) {
  const ended = wControl.release(source, id, level, run);
  syncWDirection();
  if (!ended) return;
  if (wControl.contact) record('w_contact_end', { reason: 'release' });
  if (wControl.docking) record('dock_start', { requested_W: wControl.docking.w });
  else commitW();
  requestFrame();
}

function cancelInputs(reason, ground = true, locked = false) {
  if (wControl.docking) record('dock_cancel', { reason });
  if (wControl.contact) record('w_contact_end', { reason });
  wControl.cancel(locked);
  wHold = 0;
  heldWKey = null;
  railPointer = null;
  railKeys.clear();
  // Clear ownership BEFORE releasing capture: lostcapture is then a no-op.
  const pointers = [...wPointers];
  wPointers.clear();
  for (const [id, button] of pointers) {
    if (button.hasPointerCapture?.(id)) button.releasePointerCapture(id);
  }
  if (ground) pressed.clear();
  commitW(reason);
  if (locked) {
    previousTime = 0;
    flash = pulseUntil = 0;
    nudge = null;
    clearTimeout(nudgeTimer);
    clearTimeout(toastTimer);
    $('toast').classList.remove('show');
  }
}


function commitW(reason = 'release') {
  if (gestureStart === null) return;
  const moved = wB ? gestureDistance > 1e-6 : Math.abs(target - gestureStart) > 1e-6;
  record('w_gesture_end', { reason, distance_W: gestureDistance, reversals: gestureReversals });
  gestureStart = null;
  if (run && isWalk()) run.endWGesture();
  if (!moved || !run) return;
  if (isWalk()) {
    run.noteWAdjust();
    $('w-rail').classList.remove('pulse');
  } else if (reason === 'release' && run.observe(target)) {
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
let marksKey = '';
// The W direction the controls currently point toward: standing on a device
// in another W, or a moment after an "elsewhere in W" bump.
function activeGuide(w = dialToW(current)) {
  if (!level || !run || cardOpen) return null;
  const g = isWalk() ? deviceGuide() ?? (guide && performance.now() < guide.until ? guide : null) : null;
  return g && Math.abs(g.w - w) > g.reach ? { w: g.w, dir: Math.sign(g.w - w) } : null;
}

function updateRail(w = dialToW(current), blocked = wAids().blocked) {
  const rail = $('w-rail');
  const pointed = activeGuide(w);
  const marks = wB ? nearbyTargets(level, run, current) : wAids().marks;
  const mark = nearbyRailMark(current, marks);
  const shown = pointed ? [...marks, { w: pointed.w, label: '', guide: true }] : marks;
  const nextMarksKey = shown.map((m) => `${m.w}:${m.label}`).join('|');
  if (nextMarksKey !== marksKey) {
    marksKey = nextMarksKey;
    $('rail-marks').replaceChildren(...shown.map((m) => {
      const el = document.createElement('span');
      el.className = m.guide ? 'rail-mark guide' : 'rail-mark';
      el.style.top = `${(1 - (m.w + 2) / 4) * 100}%`;
      if (m.guide) el.style.color = cssColor(wColor(m.w));
      el.title = m.label;
      return el;
    }));
  }
  // Controls carry the W state (blocked / at an end / docking / pointing).
  const { body } = document;
  body.dataset.guide = pointed ? String(pointed.dir) : '';
  body.dataset.wstate = wB ? wControl.state.toLowerCase() : '';
  body.dataset.wmove = String(wControl.direction);
  body.dataset.wend = current >= 1 ? 'top' : current <= 0 ? 'bottom' : '';
  const btn = $('action-btn');
  $('key-hud').dataset.act = String(!btn.hidden && !btn.disabled);
  $('rail-thumb').style.top = `${(1 - current) * 100}%`;
  rail.setAttribute('aria-valuenow', w.toFixed(2));
  rail.setAttribute('aria-valuetext', `${isFlat() ? '高度' : 'W'} ${signed(w)}，第 ${LAYERS[layerIndex(w)].name} 层${mark ? `，${mark.label}` : ''}`);
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
  $('layer-name').textContent = wB ? (wHold > 0 ? '↑' : wHold < 0 ? '↓' : '') : `第 ${LAYERS[layerIndex(w)].name} 层`;
  $('w-value').textContent = `${isFlat() ? '高度' : 'W'} ${signed(w)}${mark ? ` · ${mark.label}` : ''}`;
  if (wB) rail.setAttribute('aria-valuetext', `W ${signed(w)}${mark ? `，${mark.label}` : ''}`);
  $('w-status').textContent = wControl.state === 'BLOCKED' ? '受阻' : current === 0 || current === 1 ? '已到端点' : wControl.state === 'DOCKING' ? '轻停靠' : '';
}

function railDial(event) {
  const rect = $('rail-track').getBoundingClientRect();
  return clampDial(1 - (event.clientY - rect.top) / rect.height);
}

let railPointer = null;
$('w-rail').addEventListener('pointerdown', (event) => {
  if (railLocked() || !event.isPrimary || railPointer !== null) return;
  if (wB && !beginW('rail-pointer', event.pointerId)) return;
  event.preventDefault();
  sfxInit();
  railPointer = event.pointerId;
  try { $('w-rail').setPointerCapture(event.pointerId); } catch { /* synthetic pointer */ }
  beginGesture('rail-pointer');
  if (wB) wPointers.set(event.pointerId, $('w-rail'));
  requestDial(railDial(event));
});
$('w-rail').addEventListener('pointermove', (event) => {
  if (railPointer !== event.pointerId || railLocked()) return;
  requestDial(railDial(event));
});
const railRelease = (event) => {
  if (railPointer !== event.pointerId) return;
  railPointer = null;
  if (wB) {
    wPointers.delete(event.pointerId);
    if (event.type === 'pointerup' && !railLocked()) releaseW('rail-pointer', event.pointerId);
    else cancelInputs(event.type, false);
    if (!cardOpen) focusStage();
    return;
  }
  if (event.type === 'pointerup' && !railLocked()) {
    const snapped = railReleaseDial(target, wAids().marks);
    if (snapped !== target) requestDial(snapped);
  }
  commitW();
  // Keep the keyboard on the stage so arrows keep walking after a drag.
  if (!cardOpen) focusStage();
};
$('w-rail').addEventListener('pointerup', railRelease);
$('w-rail').addEventListener('pointercancel', railRelease);
$('w-rail').addEventListener('lostpointercapture', railRelease);
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
  if (wB) {
    if (event.repeat && !railKeys.has(event.key)) return;
    if (!railKeys.has(event.key) && !beginW('rail-keyboard', event.key)) return;
    if (wControl.source !== 'rail-keyboard') return;
    railKeys.add(event.key);
  }
  sfxInit();
  beginGesture('rail-keyboard');
  requestDial(next);
});
$('w-rail').addEventListener('keyup', (event) => {
  if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) {
    event.stopPropagation();
    if (wB) { railKeys.delete(event.key); releaseW('rail-keyboard', event.key); }
    else commitW();
  }
});

// ---------- Screens ----------
// The title screen is a level select: names, completion marks and route
// seals. No instructions about what to play first or what each room teaches.
const JOURNEY = ['gate', 'station-routes', 'sentry', 'fetch'];
function renderChapters() {
  const list = $('chapter-list');
  const featured = document.createElement('section');
  featured.className = 'chapter featured';
  featured.innerHTML = '<h2>旅程</h2>';
  const journey = document.createElement('div');
  journey.className = 'levels';
  for (const id of JOURNEY) {
    const l = levelById(id);
    const button = document.createElement('button');
    button.className = 'level-button';
    const seals = id === 'station-routes' ? `<span class="route-seals">${sealMarkup()}</span>` : '';
    button.innerHTML = `<span>${l.title}</span>${seals}<span class="mark">${progress.has(id) ? '✓' : '→'}</span>`;
    button.setAttribute('aria-label', `${l.title}${progress.has(id) ? '，已完成' : ''}`);
    button.addEventListener('click', () => startLevel(id));
    journey.append(button);
  }
  featured.append(journey);

  const cards = CHAPTERS.map((chapter) => {
    const levels = LEVELS_LIST.filter((l) => l.chapter === chapter.id);
    const el = document.createElement('section');
    const chapterOpen = sandboxAll || isUnlocked(levels[0].id, progress);
    el.className = `chapter${chapterOpen ? '' : ' locked'}`;
    el.innerHTML = `<h2>${chapter.name}</h2>`;
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
  const unlockBtn = $('unlock-all');
  if (unlockBtn) {
    unlockBtn.setAttribute('aria-pressed', String(sandboxAll));
    unlockBtn.textContent = sandboxAll ? '已解锁全部' : '解锁全部';
  }
}


function leaveLevel() {
  if (!wB && gestureStart !== null) record('w_gesture_end', { reason: 'leave_level', distance_W: gestureDistance, reversals: gestureReversals });
  if (wB) cancelInputs('leave_level', true, true);
  record('level_leave');
  stationEffects.clear();
  if (frameId) cancelAnimationFrame(frameId);
  frameId = 0;
  previousTime = 0;
  trail = [];
  ripples.length = 0;
  flash = pulseUntil = 0;
  clearTimeout(introCueTimer);
  introCueUntil = 0;
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
  if (measuring()) configureStudyTitle();
  $('play').focus({ preventScroll: true });
}

// The key HUD replaces the written key list: caps light up with the real
// keys, and fade once the player has both walked and moved in W.
const HUD_KEYS = { w: 'w', arrowup: 'w', a: 'a', arrowleft: 'a', s: 's', arrowdown: 's', d: 'd', arrowright: 'd',
  q: 'q', pagedown: 'q', e: 'e', pageup: 'e', ' ': 'space', f: 'space' };
function hudKey(key, on) {
  let cap = HUD_KEYS[key.toLowerCase()];
  if (!cap || !level) return;
  if (!isWalk() && (cap === 'w' || cap === 's')) cap = cap === 'w' ? 'e' : 'q';
  document.querySelector(`#key-hud kbd[data-k="${cap}"]`)?.classList.toggle('on', on);
  if (!on) return;
  hudUsed.add('wasd'.includes(cap) ? 'move' : cap === 'space' ? 'act' : 'w');
  $('key-hud').classList.toggle('learned', hudUsed.has('w') && (hudUsed.has('move') || !isWalk()));
}
const hudRelease = () => document.querySelectorAll('#key-hud kbd.on').forEach((el) => el.classList.remove('on'));

function resetCamera() {
  map?.fitTo(frameBounds(), isFlat() ? 0.16 : 0.66);
  slice?.resetView({ distance: isWalk() && level.field.bounds.x > 3 ? 13.4 : 11.8, yaw: 0.66, pitch: 0.58 });
}

function startLevel(id, { skipIntro = false } = {}) {
  leaveLevel();
  level = studyLevel(levelById(id), measuring());
  if (measuring() && studySegment >= 3) level = { ...level, objective: '请把晶核放进插座。' };
  fieldEpoch = 0;
  const chapter = CHAPTERS[level.chapter];
  const trials = level.forceTrials ? level.trials : [];
  run = isWalk() ? new WalkRun(level.field, level.id, performance.now()) : new VisitRun(level.bodies, level.goal, trials, level.id);
  current = target = isWalk() ? 0.5 : level.startDial;
  trail = [];
  ripples.length = 0;
  flash = 0;
  lastGoalHint = 0;
  lastRefuse = wB ? -Infinity : 0;
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
  $('level-chapter').textContent = level.standalone ? '旅程' : `${level.id} · ${chapter.name}`;
  $('level-title').textContent = level.title;
  const flatView = isFlat();
  $('scene').hidden = flatView;
  $('flat').hidden = !flatView;
  $('reset-view').hidden = flatView;
  $('stage-tag').textContent = flatView ? '二维俯视' : '三维截面';
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
  $('receiver-seals').innerHTML = sealMarkup();
  $('predict').hidden = true;
  if (wB) $('map-note').textContent = '按住 Q / E 或 ±W 移动，松手停下；滑轨可拖动。';
  if (isWalk()) $('map-note').textContent += ' 拖动画面转视角，R 重来，H 提示。';
  $('key-hud').hidden = false;
  $('key-hud').dataset.mode = isWalk() ? 'walk' : 'visit';
  patrol = level.sentries ? new Patrol(level.sentries) : null;
  checkpointReached = false;
  refusalNoted = false;
  gaugeW = null;
  gaugeUntil = 0;
  guide = null;
  goalNoteUntil = 0;
  highlightIds = new Set();
  record('level_enter', { segment: studySegment });
  // Outside the study the goal is a word or two; the room explains the rest.
  const shortGoal = level.sentries ? '避开守卫，到达出口' : level.field?.item ? '送达晶核' : '到达出口';
  setObjective(study.enabled || !isWalk() ? level.objective : shortGoal);
  updateHintButton();
  updateErrors();
  prevVisible = visibleIds(displayBodies().map((b) => sliceAtW(b, dialToW(current))));
  prevLayer = layerIndex(dialToW(current));
  buildRailSpans();
  updateMapVisibility();
  resetCamera();
  render();
  if (level.id === 'station-routes' && !reducedMotion.matches) {
    introCueTimer = setTimeout(() => {
      if (level?.id !== 'station-routes' || reducedMotion.matches) return;
      introCueUntil = performance.now() + 900;
      requestFrame();
    }, 2000);
  }
  if (level.forceTrials) {
    run.phase = 'predict';
    beginTrial();
    return;
  }
  const firstOfChapter = !level.standalone && LEVELS_LIST.find((l) => l.chapter === level.chapter) === level;
  if (!measuring() && firstOfChapter && !skipIntro && !introShown.has(level.chapter)) {
    introShown.add(level.chapter);
    // A chapter opens on its name and one line, not a lecture.
    showCard({ kicker: chapter.name, title: chapter.intro.title, actions: [['开始', 'primary', () => hideCard()]] });
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
      stats.textContent = run.won ? '晶核已送达' : run.carrying ? '携带晶核' : (powered ? '插座供电中' : '空手');
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
  if (wB) cancelInputs('card', true, true);
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
  if (wB) cancelInputs('complete', true, true);
  record('complete');
  // A previous W/obstacle notice no longer describes the delivered core.
  clearTimeout(toastTimer);
  $('toast').classList.remove('show');
  progress.add(level.id);
  saveProgress();
  sfx.win();
  pressed.clear();
  wHold = 0;
  $('w-rail').classList.remove('pulse');
  // Result cards report how the run went instead of explaining the principle.
  const statLine = isWalk() && run.seconds
    ? `用时 ${run.seconds(run.finishedAt)} 秒 · 换 W ${run.wMoves} 次${level.sentries ? ` · 被发现 ${patrol.caught} 次` : ''}` : undefined;
  if (isWalk()) {
    if (measuring()) {
      setObjective(level.done);
      showCard({ kicker: '完成', title: level.done, actions: [['继续', 'primary', advanceStudy]] });
      return;
    }
    if (level.id === 'gate' || level.id === 'gate-blind') {
      const next = completionAction();
      const actions = [[next.label, 'primary', () => startLevel(next.level)]];
      if (level.id === 'gate') {
        actions.push(['盲走一次', 'ghost', () => startLevel('gate-blind')]);
      }
      setObjective('已到达出口。');
      showCard({ kicker: '到达出口', title: level.title, stats: statLine, actions });
      updateActionButton();
      return;
    }
    if (level.sentries) {
      setObjective('已到达出口。');
      showCard({ kicker: level.done, title: level.title, stats: statLine,
        actions: [['再来一次', 'primary', () => startLevel(level.id)], ['回到关卡', 'ghost', () => showTitle()]] });
      return;
    }
    stationSeals = rememberStationRun(sealStorage, stationSeals, run);
    $('receiver-seals').innerHTML = sealMarkup();
    updateActionButton();
    setObjective(level.field.item ? '晶核已送达。可以留在这里走走。' : '已到达出口。可以留在这里走走。');
    toast(statLine ? `${level.field.item ? '晶核已送达' : '到达出口'} · ${statLine}` : level.done, 'good');
    return;
  }
  updateActionButton();
  let stats = '';
  if (!isWalk()) {
    if (run.session) stats = `完成 ${run.session.trials.length} 组截面实验`;
    $('predict').hidden = true;
  }
  const next = nextLevel(level.id);
  const chapterEnd = !level.standalone && (!next || next.chapter !== level.chapter);
  const actions = [];
  if (level.id === 'lab') {
    actions.push(['查看截面公式', 'primary', () => showWhy()]);
    actions.push(['再来一次', 'ghost', () => startLevel(level.id, { skipIntro: true })]);
    actions.push(['回到章节', 'ghost', () => showTitle()]);
  } else {
    actions.push([next ? '下一关 →' : '回到章节', 'primary', () => (next ? startLevel(next.id) : showTitle())]);
    if (chapterEnd) actions.push(['为什么？', 'ghost', () => showWhy()]);
    actions.push(['再来一次', 'ghost', () => startLevel(level.id, { skipIntro: true })]);
  }
  actions.push(['保存记录 ↓', 'ghost', download]);
  showCard({ kicker: '完成', title: level.done, stats, actions });
  setObjective(level.field?.item ? '晶核已送达。' : '已完成。');
}

function showWhy() {
  const chapter = CHAPTERS[level.chapter];
  const next = nextLevel(level.id);
  showCard({ ...chapter.why, actions: [[next ? '下一章 →' : '回到章节', 'primary', () => (next ? startLevel(next.id) : showTitle())]] });
}

function download() {
  if (study.enabled) { exportStudy(); return; }
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
  record('hint_open', { hint: hintLevel + 1 });
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
  $('hint-next').textContent = measuring() ? '再看一条提示' : hintLevel === level.hints.length - 1 ? '直接告诉我' : '再给一点';
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
  record('map_peek');
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
  if (!level || $('game-screen').hidden || cardOpen || (wB && document.hidden)) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const key = event.key;
  hudKey(key, true);
  if (wB && key === 'Escape') cancelInputs('escape', false);
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
  if (key === 'r' || key === 'R') { if (!event.repeat) { record('restart'); startLevel(level.id, { skipIntro: true }); } return; }
  if (isWalk() && (level?.field?.item || run.won) && (key === ' ' || key === 'f' || key === 'F')) {
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
    if (wB) {
      beginW('keyboard-hold', key.toLowerCase(), W_KEYS[key] ?? (key === 'ArrowUp' ? 1 : -1));
      return;
    }
    wHold = W_KEYS[key] ?? (key === 'ArrowUp' ? 1 : -1);
    heldWKey = key;
    beginGesture('keyboard-hold');
    if (lastWDirection && wHold !== lastWDirection) gestureReversals += 1;
    record('w_direction_change', { direction: wHold });
    lastWDirection = wHold;
    requestFrame();
    return;
  }
  if (isWalk() && MOVE_DIRS[key]) {
    event.preventDefault();
    if (wB && event.repeat && !pressed.has(key)) return;
    focusStage();
    sfxInit();
    pressed.add(key);
    requestFrame();
  }
});
window.addEventListener('keyup', (event) => {
  hudKey(event.key, false);
  if (wB && wControl.source === 'keyboard-hold' && wControl.inputs.has(event.key.toLowerCase())) releaseW('keyboard-hold', event.key.toLowerCase());
  if (wB && wControl.source === 'touch-w-button' && wControl.inputs.has(`button:${event.key}`)) releaseW('touch-w-button', `button:${event.key}`);
  if (wB && wControl.source === 'rail-keyboard' && railKeys.delete(event.key)) releaseW('rail-keyboard', event.key);
  if (heldWKey && event.key.toLowerCase() === heldWKey.toLowerCase()) {
    wHold = 0;
    heldWKey = null;
    commitW();
  }
  for (const key of [...pressed]) if (key.toLowerCase() === event.key.toLowerCase()) pressed.delete(key);
});
window.addEventListener('blur', () => {
  record('pause', { reason: 'blur' });
  if (wB) cancelInputs('blur', true, true);
  pressed.clear();
  hudRelease();
  if (heldWKey) { wHold = 0; heldWKey = null; commitW(); }
});
window.addEventListener('focus', () => record('resume', { reason: 'focus' }));
document.addEventListener('visibilitychange', () => {
  if (document.hidden && wB) cancelInputs('hidden', true, true);
  record(document.hidden ? 'pause' : 'resume', { reason: 'visibility' });
  if (!document.hidden && level) { render(); requestFrame(); }
});

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


// Direction buttons accept a second touch alongside the ground d-pad.
for (const button of document.querySelectorAll('[data-wdir]')) {
  button.addEventListener('pointerdown', (event) => {
    if (!wB || !beginW('touch-w-button', event.pointerId, Number(button.dataset.wdir))) return;
    event.preventDefault();
    sfxInit();
    wPointers.set(event.pointerId, button);
    try { button.setPointerCapture(event.pointerId); } catch { /* synthetic pointer */ }
  });
  const release = (event) => {
    if (wPointers.get(event.pointerId) !== button) return;
    wPointers.delete(event.pointerId);
    if (event.type === 'pointerup') releaseW('touch-w-button', event.pointerId);
    else cancelInputs(event.type, false);
  };
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, release);
  button.addEventListener('keydown', (event) => {
    if (![' ', 'Enter'].includes(event.key)) return;
    event.preventDefault();
    if (!event.repeat) beginW('touch-w-button', `button:${event.key}`, Number(button.dataset.wdir));
  });
  button.addEventListener('keyup', (event) => {
    if ([' ', 'Enter'].includes(event.key)) { event.preventDefault(); releaseW('touch-w-button', `button:${event.key}`); }
  });
}

// Map notes and legends on demand instead of always on screen.
$('map-info-toggle').addEventListener('click', (event) => {
  const open = !document.querySelector('.map-panel').classList.contains('info-open');
  document.querySelector('.map-panel').classList.toggle('info-open', open);
  $('map-info-toggle').setAttribute('aria-pressed', String(open));
  if (event.detail > 0 && level) focusStage();
});

// Pointing at a mechanism row outlines its door on the floor of the scene.
let highlightTimer = 0;
function pointAt(id, ms = 0) {
  highlightIds = id ? new Set([id]) : new Set();
  clearTimeout(highlightTimer);
  if (ms) highlightTimer = setTimeout(() => pointAt(null), ms);
  if (level) render();
}
for (const row of document.querySelectorAll('.mech-row')) {
  row.addEventListener('pointerenter', () => pointAt(row.dataset.body));
  row.addEventListener('pointerleave', () => pointAt(null));
  row.addEventListener('focus', () => pointAt(row.dataset.body));
  row.addEventListener('blur', () => { if (!highlightTimer) pointAt(null); });
  // A tap (touch has no hover) keeps the outline briefly, then hands
  // the keyboard back to the stage so Space keeps operating the game.
  row.addEventListener('click', (event) => {
    pointAt(row.dataset.body, 1600);
    if (event.detail > 0) focusStage();
  });
}

function configureStudyTitle() {
  for (const id of ['unlock-all', 'chapter-list']) $(id).hidden = true;
  document.querySelector('.tagline').textContent = '请按画面目标试着玩，界面里的帮助可以自己使用。';
  $('play').textContent = '开始体验';
}

function advanceStudy() {
  if (!measuring()) return;
  if (studySegment < 2) {
    studySegment += 1;
    startLevel(STUDY_CHAIN[studySegment], { skipIntro: true });
  } else if (studySegment < 4) {
    studySegment += 1;
    startLevel('station-routes', { skipIntro: true });
  } else {
    showCard({ kicker: '观察结束', title: '请完成观察记录', body: '记录完成后，可结束并导出本次记录。',
      actions: [['回到画面', 'ghost', () => hideCard()]] });
  }
}
function exportStudy() {
  const data = session.export();
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `w1-${session.id}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('study-next').addEventListener('click', () => {
  record('research_transition', { reason: run?.won ? 'completed' : 'unfinished', segment: studySegment });
  advanceStudy();
});
$('study-export').addEventListener('click', exportStudy);
$('study-end').addEventListener('click', () => {
  if (studySealed) { exportStudy(); return; }
  showCard({ kicker: '观察员', title: '结束并封存本次记录',
    body: '请先在观察表中记录 G1–G4 的证据、未到达和缺失项。封存后开放自由体验；后续操作不再计入本次记录。',
    actions: [['记录已封存，结束并导出', 'primary', () => {
      if (wB) cancelInputs('session_end', true, true);
      record('level_leave', { reason: 'session_end' });
      session.finish({ level: level?.id, run, dial: current });
      studySealed = true;
      exportStudy();
      for (const id of ['unlock-all', 'chapter-list']) $(id).hidden = false;
      $('study-next').disabled = true;
      $('play').textContent = '开始';
      showTitle();
    }], ['继续观察', 'ghost', () => hideCard()]] });
});
record('session_start', { userAgent: navigator.userAgent, viewport: [innerWidth, innerHeight] });

$('play').addEventListener('click', () => { sfxInit(); if (measuring()) studySegment = 0; startLevel('gate'); });

$('action-btn')?.addEventListener('click', () => { handleInteract(); if (level) focusStage(); });
$('replay-btn').addEventListener('click', () => startLevel(level.id, { skipIntro: true }));
$('return-levels').addEventListener('click', showTitle);
$('unlock-all')?.addEventListener('click', () => { sandboxAll = !sandboxAll; renderChapters(); });
$('back').addEventListener('click', showTitle);
$('restart').addEventListener('click', () => { record('restart'); if (level) startLevel(level.id, { skipIntro: true }); });
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
const narrowStage = window.matchMedia('(max-width: 820px)');
const railHome = $('w-rail').parentElement;
const readout = document.querySelector('.layer-readout');
function placeRail() {
  $('stage-rail').hidden = !narrowStage.matches;
  if (narrowStage.matches) $('stage-rail').append($('w-rail'), readout);
  else {
    railHome.append($('w-rail'));
    $('color-legend').before(readout);
  }
  if (level) render();
}
narrowStage.addEventListener('change', placeRail);
placeRail();
const requestedId = new URLSearchParams(location.search).get('level') ?? '';
const requested = levelById(!measuring() || [...STUDY_CHAIN, 'fetch'].includes(requestedId) ? requestedId : '');
if (measuring() && requested && STUDY_CHAIN.includes(requested.id)) studySegment = STUDY_CHAIN.indexOf(requested.id);
if (requested) startLevel(requested.id);
else showTitle();
