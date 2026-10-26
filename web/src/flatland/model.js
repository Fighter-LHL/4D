import { sliceSolid, profileXZ, circleHitsShape, shapeCentroid, shapeMatch, translateSolidXY, EPSILON } from './geometry.js';
import { guardPose, guardSees, lowerPrismGhosts, adjacentSliceGhosts, sightBlocked } from './perception.js';
import { FLATLAND_LEVELS } from './levels.js';
import { FLIP_DURATION, flipProgress, flippedPose, quarterTurn, keyShape } from './mirror.js';
import { ASCEND_BOXES, DIMENSION_DURATION, W_SLICE, boxPresent, roomBlocker, roomSections, sphereHitsBox, outsideRoom } from './ascend.js';
import { hazardSolid, hazardZ, spawnStormHazard } from './hazards.js';
import { createRandom, randomSeed } from './random.js';
import { createEncounter, encounterView, stepEncounter, normalizeCollection, FRIENDS } from './discoveries.js';
import { createCompanionState, resetCompanionAction, useCompanions, stepCompanions, companionView, gardenSolids, normalizeGardenMemories, collectGardenSeed, gardenCollection, hasCompanion } from './companions.js';
// Authoritative rules for chapter 0. Views consume snapshots and events only.
const STEP = 1 / 120;
const MAX_FRAME_TIME = .1;
const MAX_EVENTS = 256;
const MOVE_SPEED = 5;
const SLICE_MIN_SPEED = .55, SLICE_MAX_SPEED = 2.2, SLICE_ACCEL = 2.8;
const SWEEP = .02;
const GESTURE_MIN = .3;
const BLOCK_REPEAT = .45;
const COMBO_WINDOW = 4;
const SHARD_R = .38;
const GRAZE_MARGIN = .32, GRAZE_TRAVEL = .18, GRAZE_POINTS = 75;
export const RETURN_GRACE = 1.2;
export const RESPAWN_TIME = .7;
export const SAFE_TIME = 1;
const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
const approach = (value, target, step) => value < target ? Math.min(target, value + step) : Math.max(target, value - step);

export class FlatlandModel {
  constructor(index = 0, { seed, levels = FLATLAND_LEVELS, playStyle = 'challenge', collection, gardenMemories } = {}) {
    this.levels = levels; this.fixedSeed = seed; this.playStyle = playStyle;
    this.collection = normalizeCollection(collection); this.gardenMemories = normalizeGardenMemories(gardenMemories, levels); this.events = []; this.load(index);
  }

  load(index, seed = this.fixedSeed ?? randomSeed()) {
    if (!Number.isInteger(index) || index < 0 || index >= this.levels.length) return false;
    this.index = index;
    this.level = this.levels[index];
    this.exploration = this.playStyle === 'explore' && !this.level.endless;
    this.seed = seed >>> 0;
    this.encounter = createEncounter(this.level.id, this.seed);
    this.petUntil = 0;
    this.companions = createCompanionState();
    this.pokeUntil = 0;
    this.variant = this.level.build?.(createRandom(this.seed)) || {};
    this.stormRng = createRandom(this.seed ^ 0x9e3779b9);
    const { player, slice } = this.level;
    this.phase = 'intro';
    this.paused = false;
    this.precision = false;
    this.cleared = false;
    this.player = { x: player.x, y: player.y, r: player.r, facing: 0 };
    this.s = slice.start;
    this.input = { x: 0, y: 0, slice: 0 };
    this.sliceHold = 0;
    this.time = 0;
    this.idle = 0;
    this.hintIndex = 0;
    this.hint = null;
    this.gestureStart = null;
    this.lastBlock = null;
    this.carrying = null;
    this.collected = new Set();
    this.peek = false;
    this.returnUntil = 0;
    this.lastAlert = null;
    this.doorLocked = false;
    this.score = 0;
    this.combo = { count: 0, last: -Infinity, best: 0 };
    this.deaths = 0;
    this.dying = null;
    this.safeUntil = 0;
    this.keyChirality = 1;
    this.keyTurns = 0;
    this.flipMotion = null;
    this.lockContact = null;
    this.counters = { sliceMoves: 0, blockedCount: 0, hintsShown: 0, peekUses: 0, guardAlerts: 0, flips: 0, planarTurns: 0, reveals: 0 };
    this.goals = (this.level.goals || []).map(goal => ({ ...goal, done: false }));
    this.shards = (this.variant.shards || []).map((shard, i) => ({ id: `shard-${i}`, ...shard, z: [...shard.z], taken: false }));
    this.hazards = (this.level.hazards || []).map(h => ({ ...h }));
    this.grazes = new Map();
    this.lastGrazePose = { x: this.player.x, y: this.player.y, s: this.s };
    this.guards = (this.level.guards || []).map(def => guardPose(def, 0));
    this.ascend = this.level.dimensionLesson ? { stage: 'flat', elapsed: 0, flatComplete: false, leftRoom: false, position: { x: 10, y: .4, z: 6 } } : null;
    this.mirrorLocks = (this.variant.mirrorLocks || []).map(lock => ({ ...lock, open: false }));
    const rr = this.level.ringRules;
    this.rings = rr ? { list: [...this.variant.rings], index: 0, elapsed: 0, hold: 0, gap: .6, hits: 0, results: [], error: Infinity, orbit: 0, bob: 0 } : null;
    this.locks = this.level.lockRules ? { list: this.variant.locks.map((lock, i) => {
      const stamp = this.exploration ? this.level.stampPositions?.[i] : null;
      return { ...lock, stamp, shape: sliceSolid(stamp ? translateSolidXY(lock.solid, stamp[0] - 10, stamp[1] - 6) : lock.solid, lock.target) };
    }), index: 0, hold: 0, gap: 0, roundStart: 0, revealed: false, closeness: 0, times: [] } : null;
    const sr = this.level.stormRules;
    this.storm = sr ? { lives: sr.lives, level: 0, nextSpawn: 1.2, spawned: 0, nextShard: .4, shardsMade: 0, survival: 0, grazes: 0 } : null;
    this.stars = this.level.stars.map(() => false);
    this._refresh(false);
    this.events = [];
    this._emit('load', { level: this.level.id, index, seed: this.seed });
    return true;
  }
  restart() { return this.load(this.index, this.seed); }
  reroll() { const seed = randomSeed(); return this.load(this.index, seed === this.seed ? (seed + 1) >>> 0 : seed); }
  next() { return this.load(this.index + 1); }
  start() {
    if (this.phase !== 'intro') return false;
    this.phase = 'playing';
    this._emit('start', { level: this.level.id });
    if (this.rings) this.rings.gap = .6;
    return true;
  }

  _emit(type, fields = {}) {
    if (this.events.length >= MAX_EVENTS) this.events.shift();
    this.events.push({ type, level: this.level.id, ...fields });
  }
  drainEvents() { const events = this.events; this.events = []; return events; }

  setPaused(paused) {
    if (this.phase !== 'playing' || this.paused === Boolean(paused)) return false;
    this.endSliceGesture();
    this.setPeek(false);
    this.input = { x: 0, y: 0, slice: 0 };
    this.sliceHold = 0;
    this.precision = false;
    this.paused = Boolean(paused);
    this._emit(this.paused ? 'pause' : 'resume');
    return true;
  }
  setPrecision(active) { this.precision = Boolean(active) && this.canSlice(); }
  setCompanion(id) {
    if (!this.collection.found.includes(id) && !(id === 'all' && this.collection.found.length === FRIENDS.length)) return false;
    if (id !== this.collection.companion) resetCompanionAction(this);
    this.collection.companion = id;
    return true;
  }
  setProbeDirection(direction) {
    if (![1, 0, -1].includes(direction)) return false;
    this.companions.direction = direction;
    return true;
  }
  cycleProbeDirection() {
    if (!hasCompanion(this, 'sprout') || this.phase !== 'playing' || this._frozen()) return false;
    return this.setProbeDirection(this.companions.direction === 1 ? 0 : this.companions.direction === 0 ? -1 : 1);
  }
  petCompanion() { return useCompanions(this); }
  pokeVisitor(point = null) {
    const shape = this.visible.get(this.level.visitor?.id)?.shape;
    if (!this.exploration || !this.rings || !this.canSlice() || this.time < this.pokeUntil || !shape) return false;
    if (point && Math.hypot(point.x - shape.cx, point.y - shape.cy) > shape.r + .15) return false;
    this.pokeUntil = this.time + 1.2;
    this._emit('visitor_poke', { x: shape.cx, y: shape.cy });
    return true;
  }

  // ---- world -------------------------------------------------------------
  _visitorSolid() {
    const v = this.level.visitor, r = this.rings, t = this.time;
    const bounce = t < this.pokeUntil ? Math.sin((1 - (this.pokeUntil - t) / 1.2) * Math.PI) * .9 : 0;
    const center = [v.center[0] + Math.cos(t * Math.PI * 2 / 9) * 1.6 * r.orbit, v.center[1] + Math.sin(t * Math.PI * 2 / 9) * 1.1 * r.orbit, v.center[2] + Math.sin(t * Math.PI * 2 / 5) * .6 * r.bob + bounce];
    return { ...v, center };
  }
  _solids() {
    const toys = gardenSolids(this);
    if (this.rings) return [this._visitorSolid(), ...toys];
    if (this.locks) { const lock = this.locks.list[this.locks.index]; return [...(lock ? [lock.stamp ? translateSolidXY(lock.solid, this.player.x - 10, this.player.y - 6) : lock.solid] : []), ...toys]; }
    return [...(this.level.solids || []), ...toys];
  }
  _solid(id) { return this._solids().find(solid => solid.id === id); }
  _hazardSolids(time = this.time) { return this.hazards.map(h => hazardSolid(h, time)); }
  _sections(s = this.s) {
    const map = new Map();
    if (this.ascend?.stage === 'volume') return map;
    for (const solid of this._solids()) {
      if (this.collected.has(solid.id)) continue;
      const shape = sliceSolid(solid, s);
      if (shape) map.set(solid.id, { id: solid.id, role: solid.role, label: solid.label, solid: !!solid.solid, shape });
    }
    const walls = [...map.values()].filter(section => section.solid).map(section => section.shape);
    for (const [id, section] of map) {
      if (this._solid(id).occluded && sightBlocked([this.player.x, this.player.y], shapeCentroid(section.shape), walls)) map.delete(id);
    }
    return map;
  }
  _hazardSections(s = this.s) {
    const list = [];
    for (const solid of this._hazardSolids()) { const shape = sliceSolid(solid, s); if (shape) list.push({ id: solid.id, role: 'hazard', shape, golden: solid.golden }); }
    return list;
  }
  _collides(x, y, s) {
    const { r } = this.player;
    if (this.ascend?.stage === 'volume') return roomBlocker({ x, y: this.ascend.position.y, z: y }, r, s);
    for (const solid of this._solids()) {
      if (!solid.solid) continue;
      const shape = sliceSolid(solid, s);
      if (shape && circleHitsShape(x, y, r, shape)) return solid.id;
    }
    return null;
  }
  _inBounds(x, y) {
    const { r } = this.player, { w, h } = this.level.bounds;
    return x >= r && y >= r && x <= w - r && y <= h - r;
  }
  _refresh(emit = true) {
    const next = this._sections();
    if (emit) {
      for (const [id, section] of next) if (!this.visible?.has(id)) this._emit('section_enter', { id, role: section.role });
      for (const [id, section] of this.visible || []) if (!next.has(id)) this._emit('section_exit', { id, role: section.role });
    }
    this.visible = next;
    this.hazardShapes = this._hazardSections();
  }

  // ---- input -------------------------------------------------------------
  _frozen() { return this.paused || this.time < this.returnUntil || !!this.dying || this._mirrorBusy() || this.ascend?.stage === 'transition'; }
  setMove(x, y) {
    if (![x, y].every(Number.isFinite)) return false;
    if (this.phase !== 'playing' || this._frozen()) { this.input.x = this.input.y = 0; return false; }
    const length = Math.hypot(x, y);
    this.input.x = length > 1 ? x / length : x;
    this.input.y = length > 1 ? y / length : y;
    return true;
  }
  setSliceVelocity(value) {
    if (!Number.isFinite(value)) return false;
    if (!this.canSlice() && value) { this.input.slice = 0; return false; }
    const previous = this.input.slice;
    this.input.slice = clamp(value, -1, 1);
    if (Math.sign(previous) !== Math.sign(this.input.slice)) this.sliceHold = 0;
    if (previous && !this.input.slice) this.endSliceGesture();
    return true;
  }
  canSlice() { return this.phase === 'playing' && !this.level.slice.fixed && !this._frozen(); }
  sliceRange() { return this.ascend?.stage === 'volume' ? W_SLICE : this.level.slice; }

  // Sweeps toward the target and stops flush against the first solid section
  // that would overlap the player, so a blocked change is visible and local.
  setSlice(target) {
    if (!this.canSlice() || !Number.isFinite(target)) return false;
    const { min, max } = this.sliceRange();
    target = clamp(target, min, max);
    if (Math.abs(target - this.s) <= EPSILON) return true;
    if (this.gestureStart === null) this.gestureStart = this.s;
    const { x, y } = this.player, direction = Math.sign(target - this.s);
    const sweep = this.ascend?.stage === 'volume' ? .005 : SWEEP;
    let s = this.s, blocker = null;
    while (Math.abs(target - s) > EPSILON) {
      const next = Math.abs(target - s) <= sweep ? target : s + direction * sweep;
      blocker = this._collides(x, y, next);
      if (blocker) {
        let free = s, hit = next;
        for (let i = 0; i < 12; i++) { const mid = (free + hit) / 2; if (this._collides(x, y, mid)) hit = mid; else free = mid; }
        s = free;
        break;
      }
      s = next;
    }
    if (Math.abs(s - this.s) > EPSILON) { this.s = s; this.idle = 0; this._refresh(); this._touchHazards(); }
    if (blocker) this._block(blocker);
    return !blocker;
  }
  endSliceGesture() {
    if (this.gestureStart === null) return false;
    const from = this.gestureStart;
    this.gestureStart = null;
    if (Math.abs(this.s - from) < (this.ascend?.stage === 'volume' ? .05 : GESTURE_MIN)) return false;
    this.counters.sliceMoves += 1;
    this._emit('slice_move', { from, to: this.s, count: this.counters.sliceMoves });
    return true;
  }
  _block(id) {
    const repeated = this.lastBlock?.id === id && this.time - this.lastBlock.time < BLOCK_REPEAT;
    this.lastBlock = { id, time: this.time };
    if (repeated) return;
    this.counters.blockedCount += 1;
    this._emit('blocked', { solid: id, s: this.s });
  }

  // ---- scoring -----------------------------------------------------------
  _addScore(base, at, kind, chain) {
    const window = this.level.stormRules?.comboWindow ?? COMBO_WINDOW;
    const chained = chain ?? (this.time - this.combo.last <= window);
    this.combo.count = chained ? this.combo.count + 1 : 1;
    this.combo.last = this.time;
    this.combo.best = Math.max(this.combo.best, this.combo.count);
    const mult = 1 + .5 * Math.min(this.combo.count - 1, 4), points = Math.round(base * mult);
    this.score += points;
    this._emit('score', { points, mult, combo: this.combo.count, kind, x: at[0], y: at[1] });
    return points;
  }
  _breakCombo() { if (this.combo.count > 1) this._emit('combo_break', { combo: this.combo.count }); this.combo.count = 0; this.combo.last = -Infinity; }
  comboMultiplier() { return 1 + .5 * Math.min(Math.max(this.combo.count - 1, 0), 4); }

  _collectShards(p = this.player, s = this.s) {
    for (const shard of this.shards) {
      if (shard.taken || s < shard.z[0] - EPSILON || s > shard.z[1] + EPSILON) continue;
      if (Math.hypot(p.x - shard.x, p.y - shard.y) >= SHARD_R + p.r) continue;
      shard.taken = true;
      const points = this._addScore(shard.golden ? 400 : 100, [shard.x, shard.y], 'shard');
      this._emit('shard', { id: shard.id, x: shard.x, y: shard.y, golden: !!shard.golden, points, combo: this.combo.count, taken: this.shards.filter(item => item.taken).length, total: this.shards.length });
      if (shard.bonus) collectGardenSeed(this);
    }
    if (this.storm) this.shards = this.shards.filter(shard => !shard.taken);
  }

  // ---- hazards -----------------------------------------------------------
  _touchHazards() {
    if (this.phase !== 'playing' || this.dying || this.time < this.safeUntil || !this.hazardShapes?.length) return false;
    const p = this.player, hit = this.hazardShapes.find(section => circleHitsShape(p.x, p.y, p.r, section.shape));
    if (!hit) return false;
    this._hurt(hit.id);
    return true;
  }
  _hurt(id) {
    resetCompanionAction(this);
    this.endSliceGesture();
    this._breakCombo();
    this.input = { x: 0, y: 0, slice: 0 };
    if (this.storm) {
      // A hit cancels pending near misses; invulnerability cannot farm them.
      for (const graze of this.grazes.values()) graze.resolved = true;
      this.grazes.set(id, { resolved: true });
      this.storm.lives -= 1;
      this.safeUntil = this.time + this.level.stormRules.invulnerable;
      this._emit('hurt', { id, lives: this.storm.lives, x: this.player.x, y: this.player.y });
      if (this.storm.lives <= 0) this._complete(true);
      return;
    }
    this.deaths += 1;
    this.dying = { until: this.time + RESPAWN_TIME, x: this.player.x, y: this.player.y };
    this._emit('death', { id, x: this.player.x, y: this.player.y, deaths: this.deaths });
  }
  _respawn() {
    const { player, slice } = this.level;
    this.dying = null;
    this.player = { x: player.x, y: player.y, r: player.r, facing: 0 };
    this.s = slice.start;
    this.safeUntil = this.time + SAFE_TIME;
    this._refresh(false);
    this._emit('respawn');
  }
  // Predicted sections that will reach the player's plane within a moment.
  _warnings() {
    if (!this.hazards.length || this.phase !== 'playing') return [];
    const now = new Set(this.hazardShapes.map(section => section.id)), out = [];
    for (const h of this.hazards) {
      if (now.has(h.id)) continue;
      for (const eta of [.3, .6, .9]) {
        const shape = sliceSolid(hazardSolid(h, this.time + eta), this.s);
        if (shape) { out.push({ id: h.id, shape, eta }); break; }
      }
    }
    return out;
  }

  _stepGrazes() {
    const p = this.player, before = this.lastGrazePose;
    const travel = Math.hypot(p.x - before.x, p.y - before.y, this.s - before.s);
    this.lastGrazePose = { x: p.x, y: p.y, s: this.s };
    const live = new Set(this.hazards.map(h => h.id));
    for (const id of this.grazes.keys()) if (!live.has(id)) this.grazes.delete(id);
    if (this.time < this.safeUntil) {
      for (const graze of this.grazes.values()) graze.resolved = true;
      return;
    }
    const near = new Set(this.hazardShapes.filter(h => circleHitsShape(p.x, p.y, p.r + GRAZE_MARGIN, h.shape)).map(h => h.id));
    for (const id of near) {
      const graze = this.grazes.get(id) || { travel: 0, resolved: false };
      if (!graze.resolved) graze.travel += Math.min(travel, .06);
      this.grazes.set(id, graze);
    }
    for (const [id, graze] of this.grazes) {
      if (near.has(id) || graze.resolved) continue;
      if (graze.travel >= GRAZE_TRAVEL) {
        graze.resolved = true;
        this.storm.grazes += 1;
        this.score += GRAZE_POINTS;
        this._emit('graze', { id, points: GRAZE_POINTS, x: p.x, y: p.y, count: this.storm.grazes });
      } else this.grazes.delete(id);
    }
  }

  // ---- abilities ---------------------------------------------------------
  _mirrorBusy() { return !!this.flipMotion; }
  _onFlipPad() {
    const shape = this.visible.get(this.level.flipPad)?.shape, p = this.player;
    return !!shape && circleHitsShape(p.x, p.y, p.r, shape);
  }
  canFlip() { return this.phase === 'playing' && !this.paused && !!this.level.abilities?.flip && !!this.carrying && this._onFlipPad() && !this._mirrorBusy(); }
  canRotateKey() { return this.phase === 'playing' && !this.paused && !!this.level.abilities?.flip && !!this.carrying && !this._mirrorBusy(); }
  requestFlip() {
    if (!this.canFlip()) return false;
    this.input = { x: 0, y: 0, slice: 0 }; this.idle = 0; this.hint = null;
    this.flipMotion = { elapsed: 0, fromChirality: this.keyChirality, fromTurns: this.keyTurns };
    this._emit('flip_start');
    return true;
  }
  rotateKey() {
    if (!this.canRotateKey()) return false;
    this.keyTurns = quarterTurn(this.keyTurns + 1); this.counters.planarTurns++;
    this.idle = 0; this.hint = null; this.lockContact = null;
    this._emit('key_rotate', { turns: this.keyTurns });
    return true;
  }
  setPeek(active) {
    active = Boolean(active);
    if (active && (!this.level.abilities?.peek || !this.canSlice())) return false;
    if (active === this.peek) return true;
    this.peek = active;
    if (active) { this.counters.peekUses += 1; this.idle = 0; this.hint = null; }
    this._emit(active ? 'peek_start' : 'peek_end');
    return true;
  }
  reveal() {
    if (this.phase !== 'playing' || this.paused || !this.locks || this.locks.revealed || this.locks.gap > 0 || !this.level.abilities?.reveal) return false;
    this.locks.revealed = true; this.counters.reveals += 1; this.idle = 0; this.hint = null;
    this._emit('reveal');
    return true;
  }

  _checkGuards() {
    if (this.exploration && this.cleared) return false;
    if (!this.guards.length || this.time < this.returnUntil) return false;
    const walls = [...this.visible.values()].filter(section => section.solid).map(section => section.shape);
    const guard = this.guards.find(guard => guardSees(guard, this.player, this.s, walls));
    if (!guard) return false;
    resetCompanionAction(this);
    const returnedKey = this.carrying !== null;
    this.counters.guardAlerts += 1;
    this.lastAlert = { id: guard.id, label: guard.label, returnedKey, time: this.time, x: this.player.x, y: this.player.y };
    this.endSliceGesture();
    this.setPeek(false);
    this._breakCombo();
    this.carrying = null;
    this.collected.clear();
    for (const goal of this.goals) if (goal.kind === 'pickup' || goal.kind === 'unlock') goal.done = false;
    const { player, slice } = this.level;
    this.player = { x: player.x, y: player.y, r: player.r, facing: 0 };
    this.s = slice.start;
    this.input = { x: 0, y: 0, slice: 0 };
    this.returnUntil = this.time + RETURN_GRACE;
    this.doorLocked = false; this.idle = 0; this.hint = null;
    this._refresh();
    this._emit('guard_alert', { id: guard.id, returnedKey, x: this.lastAlert.x, y: this.lastAlert.y });
    return true;
  }

  // ---- simulation --------------------------------------------------------
  update(dtSeconds) {
    if (this.phase !== 'playing' || this.paused || !Number.isFinite(dtSeconds) || dtSeconds <= 0) return;
    let remaining = Math.min(dtSeconds, MAX_FRAME_TIME);
    while (remaining > EPSILON && this.phase === 'playing') {
      const h = Math.min(STEP, remaining);
      this._step(h);
      remaining -= h;
    }
  }
  _step(h) {
    this.time += h;
    if (this.ascend && this.ascend.stage !== 'flat') { this._stepDimension(h); return; }
    if (this.flipMotion) { this._stepFlip(h); return; }
    if (this.dying) { if (this.time >= this.dying.until) this._respawn(); return; }
    this.guards = (this.level.guards || []).map(def => guardPose(def, this.time));
    if (this.rings) this._stepVisitor(h);
    if (this.storm) this._stepStorm(h);
    if (this.time < this.returnUntil) { this._refresh(false); return; }
    this.idle += h;
    this._stepInput(h);
    this._refresh();
    if (this._touchHazards()) return;
    if (this.storm) this._stepGrazes();
    stepCompanions(this, h);
    if (this._checkGuards()) return;
    const follower = this.collection.companion;
    stepEncounter(this, h);
    if (follower !== this.collection.companion) resetCompanionAction(this);
    this._collectShards();
    if (this.rings) this._stepRings(h);
    else if (this.locks) this._stepLocks(h);
    else if (!this.storm) this._checkGoals();
    if (this.phase !== 'playing') return;
    this._stepHints(this.level.hints);
    if (this.mirrorLocks.length && this.mirrorLocks.every(lock => lock.open)) this._complete(true);
    else if (!this.mirrorLocks.length && this.goals.length && this.goals.every(goal => goal.done)) {
      if (this.ascend?.stage === 'flat') this._beginDimensionTransition();
      else this._complete(true);
    }
  }
  _stepInput(h) {
    if (this.input.slice) {
      this.sliceHold += h;
      const { min, max } = this.sliceRange(), scale = (max - min) / 6;
      const speed = (this.precision ? .35 : Math.min(SLICE_MAX_SPEED, SLICE_MIN_SPEED + this.sliceHold * SLICE_ACCEL)) * scale;
      this.setSlice(this.s + this.input.slice * speed * h);
    }
    if (!this.level.player.canMove || (!this.input.x && !this.input.y)) return;
    const p = this.player, dx = this.input.x * MOVE_SPEED * h, dy = this.input.y * MOVE_SPEED * h;
    let moved = false;
    for (const [ax, ay] of [[dx, 0], [0, dy]]) {
      if (!ax && !ay) continue;
      const blocker = this._collides(p.x + ax, p.y + ay, this.s);
      if (blocker) this._block(blocker);
      else if (this._inBounds(p.x + ax, p.y + ay)) { p.x += ax; p.y += ay; moved = true; }
    }
    p.facing = Math.atan2(this.input.y, this.input.x);
    if (moved) this.idle = 0;
  }
  _stepHints(hints = []) {
    const hint = hints[this.hintIndex];
    if (hint && this.idle >= hint.idle) {
      this.hint = hint.text; this.hintIndex += 1; this.counters.hintsShown += 1;
      this._emit('hint', { index: this.hintIndex - 1, text: hint.text });
    }
    if (this.hint && this.idle < .05 && this.hintIndex > 0) this.hint = null;
  }
  _checkGoals() {
    const p = this.player;
    this.doorLocked = false;
    for (const goal of this.goals) {
      const shape = this.visible.get(goal.solid)?.shape;
      if (goal.done || !shape || !circleHitsShape(p.x, p.y, p.r, shape)) continue;
      if (goal.kind === 'reach') { goal.done = true; this._emit('goal_done', { goal: goal.id }); }
      else if (goal.kind === 'pickup') {
        goal.done = true; this.carrying = goal.solid; this.collected.add(goal.solid); this.hint = null;
        this._emit('pickup', { id: goal.solid, x: p.x, y: p.y }); this._refresh();
      } else if (goal.kind === 'unlock') {
        this.doorLocked = this.carrying !== goal.requires;
        if (!this.doorLocked) { goal.done = true; this._emit('unlock', { id: goal.solid, x: p.x, y: p.y }); }
      }
    }
    if (this.mirrorLocks.length && this.carrying) this._checkMirrorLocks();
  }
  _checkMirrorLocks() {
    const p = this.player;
    const touching = this.mirrorLocks.find(lock => !lock.open && circleHitsShape(p.x, p.y, p.r + .25, keyShape(lock.x, lock.y, lock.chirality, lock.turns)));
    if (!touching) { this.lockContact = null; return; }
    if (touching.chirality === this.keyChirality && touching.turns === quarterTurn(this.keyTurns)) {
      touching.open = true; this.lockContact = null;
      const points = this._addScore(200, [touching.x, touching.y], 'lock');
      this._emit('lock_open', { id: touching.id, x: touching.x, y: touching.y, points, open: this.mirrorLocks.filter(lock => lock.open).length });
      return;
    }
    const signature = `${touching.id}:${this.keyChirality}:${this.keyTurns}`;
    if (signature !== this.lockContact) this._emit('lock_reject', { id: touching.id, reason: touching.chirality !== this.keyChirality ? 'chirality' : 'orientation' });
    this.lockContact = signature;
  }
  _stepFlip(h) {
    this.flipMotion.elapsed = Math.min(FLIP_DURATION, this.flipMotion.elapsed + h);
    if (this.flipMotion.elapsed + EPSILON < FLIP_DURATION) return;
    const pose = flippedPose(this.flipMotion.fromChirality, this.flipMotion.fromTurns);
    this.keyChirality = pose.chirality; this.keyTurns = pose.turns;
    this.flipMotion = null; this.counters.flips++; this.lockContact = null;
    this._emit('flip_end', { chirality: this.keyChirality, turns: this.keyTurns });
  }

  // ---- visitor: catch the rings -----------------------------------------
  _stepVisitor(h) {
    const r = this.rings;
    r.orbit = approach(r.orbit, r.index >= 2 ? 1 : 0, h * .8);
    r.bob = approach(r.bob, r.index >= 4 ? 1 : 0, h * .8);
  }
  _stepRings(h) {
    const r = this.rings, rules = this.level.ringRules;
    if (r.index >= r.list.length) return;
    if (r.gap > 0) {
      r.gap -= h;
      if (r.gap <= 0) { r.gap = 0; r.elapsed = 0; r.hold = 0; this._emit('ring_spawn', { index: r.index, radius: r.list[r.index] }); }
      return;
    }
    const target = r.list[r.index], window = rules.windows[r.index], shape = this.visible.get(this.level.visitor.id)?.shape;
    r.elapsed += h;
    r.error = shape ? Math.abs(shape.r - target) : Infinity;
    const center = this._visitorSolid().center;
    r.near = !this.exploration || Math.abs(Math.hypot(this.player.x - center[0], this.player.y - center[1]) - target) <= this.player.r + .25;
    r.hold = r.error <= rules.tolerance && r.near ? r.hold + h : 0;
    if (r.hold + EPSILON >= rules.hold) {
      r.hits += 1; r.results.push('hit');
      const points = this._addScore(100 + 100 * Math.max(0, 1 - r.elapsed / window), center, 'ring', true);
      this._emit('ring_hit', { index: r.index, radius: target, points, combo: this.combo.count, x: center[0], y: center[1] });
      this._nextRing();
    } else if (!this.exploration && r.elapsed >= window) {
      r.results.push('miss'); this._breakCombo();
      this._emit('ring_miss', { index: r.index, radius: target, x: center[0], y: center[1] });
      this._nextRing();
    }
  }
  _nextRing() {
    const r = this.rings, rules = this.level.ringRules;
    r.index += 1; r.hold = 0; r.error = Infinity;
    if (r.index >= r.list.length) { this.endSliceGesture(); this._complete(r.hits >= rules.need); return; }
    r.gap = rules.gap;
  }

  // ---- shape locks --------------------------------------------------------
  _stepLocks(h) {
    const l = this.locks, rules = this.level.lockRules;
    if (this.cleared) return;
    if (l.gap > 0) {
      l.gap -= h;
      if (l.gap <= 0) { l.gap = 0; l.index += 1; l.hold = 0; l.revealed = false; l.roundStart = this.time; this._refresh(); this._emit('lock_spawn', { index: l.index }); }
      return;
    }
    const lock = l.list[l.index], m = lock.stamp ? shapeMatch(sliceSolid(lock.solid, this.s), sliceSolid(lock.solid, lock.target)) : shapeMatch(this.visible.get(lock.solid.id)?.shape, lock.shape);
    const distance = lock.stamp ? Math.hypot(this.player.x - lock.stamp[0], this.player.y - lock.stamp[1]) : 0;
    l.closeness = m.closeness * Math.max(0, 1 - distance / 4);
    l.hold = m.match && distance <= .35 ? l.hold + h : 0;
    if (l.hold + EPSILON < rules.hold) return;
    const roundTime = this.time - l.roundStart;
    l.times.push(roundTime);
    const [x, y] = lock.stamp || [10, 6];
    const points = this._addScore(150 + Math.max(0, 12 - roundTime) * 15, [x, y], 'lock', roundTime <= 10);
    this._emit('lock_open', { index: l.index, points, x, y, open: l.times.length });
    this.endSliceGesture();
    if (l.index + 1 >= l.list.length) this._complete(true);
    else { l.gap = rules.gap; l.hold = 0; l.closeness = 0; }
  }

  // ---- storm ---------------------------------------------------------------
  _stepStorm(h) {
    const st = this.storm, rules = this.level.stormRules, rng = this.stormRng, { bounds, slice } = this.level;
    const level = Math.floor(this.time / rules.levelEvery);
    if (level > st.level) { st.level = level; this._emit('storm_level', { level: level + 1 }); }
    st.survival += h * 5;
    if (st.survival >= 1) { const add = Math.floor(st.survival); this.score += add; st.survival -= add; }
    st.nextSpawn -= h;
    if (st.nextSpawn <= 0) {
      const count = level >= 2 && rng.next() < .25 + level * .04 ? 2 : 1;
      for (let i = 0; i < count; i++) this.hazards.push(spawnStormHazard(rng, { id: `storm-${st.spawned++}`, time: this.time, level, bounds, slice }));
      st.nextSpawn = Math.max(.32, 1.4 - .13 * level) * rng.range(.75, 1.25);
    }
    this.hazards = this.hazards.filter(hz => {
      const [lo, hi] = hazardZ(hz, this.time), down = hz.velocity[2] < 0;
      return down ? hi > slice.min - .1 : lo < slice.max + .1;
    });
    for (const shard of this.shards) if (this.time - shard.born >= rules.shardLife) { shard.expired = true; this._emit('shard_expire', { id: shard.id }); }
    this.shards = this.shards.filter(shard => !shard.expired);
    st.nextShard -= h;
    if (st.nextShard <= 0 && this.shards.length < rules.maxShards) {
      let x, y;
      for (let i = 0; i < 20; i++) { x = rng.range(1.5, bounds.w - 1.5); y = rng.range(1.5, bounds.h - 1.5); if (Math.hypot(x - this.player.x, y - this.player.y) > 3) break; }
      const z0 = rng.range(slice.min + .2, slice.max - .9), golden = ++st.shardsMade % 6 === 0;
      this.shards.push({ id: `shard-${st.shardsMade}`, x, y, z: [z0, z0 + .7], taken: false, golden, born: this.time });
      st.nextShard = rng.range(.6, 1.6);
    }
  }

  // ---- ascend ---------------------------------------------------------------
  _beginDimensionTransition() {
    this.endSliceGesture();
    this.ascend.stage = 'transition'; this.ascend.elapsed = 0; this.ascend.flatComplete = true;
    this.ascend.fromPlayer = { ...this.player };
    this.input = { x: 0, y: 0, slice: 0 }; this.idle = 0; this.hint = null;
    this._emit('dimension_start');
  }
  _stepDimension(h) {
    const a = this.ascend;
    if (a.stage === 'transition') {
      a.elapsed = Math.min(DIMENSION_DURATION, a.elapsed + h);
      if (a.elapsed + EPSILON >= DIMENSION_DURATION) {
        a.stage = 'volume'; a.elapsed = DIMENSION_DURATION; this.s = W_SLICE.start;
        this.player = { x: a.position.x, y: a.position.z, r: .4, facing: 0 };
        this.input = { x: 0, y: 0, slice: 0 }; this.gestureStart = null;
        this.goals.forEach(goal => { goal.done = false; });
        this.lastBlock = null; this.hintIndex = 0; this.idle = 0; this.hint = null;
        this.visible = new Map(); this._emit('dimension_ready');
      }
      return;
    }
    this.idle += h;
    this._stepInput(h);
    const p = this.player;
    a.position.x = p.x; a.position.z = p.y;
    if (!a.leftRoom && this.s > .58 + EPSILON && outsideRoom(a.position, p.r)) { a.leftRoom = true; this._emit('dimension_escape'); }
    const gate = ASCEND_BOXES.find(box => box.role === 'goal');
    if (!this.cleared && a.leftRoom && boxPresent(gate, this.s) && sphereHitsBox(a.position, p.r, gate)) {
      this.goals[0].done = true; this.endSliceGesture(); this._emit('goal_done', { goal: this.goals[0].id }); this._complete(true);
      return;
    }
    this._stepHints(this.level.volumeHints);
  }

  // ---- result ---------------------------------------------------------------
  _star(def) {
    if (def.kind === 'score') return this.score >= def.value;
    if (!this.cleared) return false;
    if (def.kind === 'complete') return true;
    if (def.kind === 'perfectRings') return this.rings?.hits === this.rings?.list.length;
    if (def.kind === 'parTime') return this.time <= def.value;
    if (def.kind === 'allShards') return this.shards.length > 0 && this.shards.every(shard => shard.taken);
    if (def.kind === 'noReveal') return this.counters.reveals === 0;
    if (def.kind === 'noAlerts') return this.counters.guardAlerts === 0;
    if (def.kind === 'noDeaths') return this.deaths === 0;
    if (def.kind === 'parActions') return this.counters.flips + this.counters.planarTurns <= this.variant.parActions;
    if (def.kind === 'maxSliceMoves') return this.counters.sliceMoves <= def.value;
    return false;
  }
  // Live status shown while playing: earned, failed, or still open.
  _starStatus(def, i) {
    if (this.phase === 'complete') return this.stars[i] ? 'earned' : 'failed';
    const c = this.counters;
    if (def.kind === 'score') return this.score >= def.value ? 'earned' : '';
    if (def.kind === 'perfectRings') return this.rings.results.includes('miss') ? 'failed' : '';
    if (def.kind === 'parTime') return this.time > def.value ? 'failed' : '';
    if (def.kind === 'allShards') return this.shards.every(shard => shard.taken) ? 'earned' : '';
    if (def.kind === 'noReveal') return c.reveals ? 'failed' : '';
    if (def.kind === 'noAlerts') return c.guardAlerts ? 'failed' : '';
    if (def.kind === 'noDeaths') return this.deaths ? 'failed' : '';
    if (def.kind === 'parActions') return c.flips + c.planarTurns > this.variant.parActions ? 'failed' : '';
    if (def.kind === 'maxSliceMoves') return c.sliceMoves > def.value ? 'failed' : '';
    return '';
  }
  _complete(cleared) {
    if (this.cleared || this.phase === 'complete') return;
    if (this.exploration) {
      this.cleared = cleared;
      if (cleared) this._emit('explore_clear', { level: this.level.id, x: this.player.x, y: this.player.y });
      return;
    }
    this.setPeek(false);
    this.endSliceGesture();
    this.cleared = cleared;
    const par = this.level.stars.find(def => def.kind === 'parTime')?.value;
    if (cleared && par && this.time < par) {
      const bonus = Math.ceil(par - this.time) * 25;
      this.score += bonus;
      this._emit('score', { points: bonus, mult: 1, combo: 0, kind: 'time', x: this.player.x, y: this.player.y });
    }
    this.phase = 'complete';
    this.input = { x: 0, y: 0, slice: 0 };
    this.stars = this.level.stars.map(def => this._star(def));
    this._emit('complete', { stars: this.stars.filter(Boolean).length, cleared, score: this.score });
  }

  snapshot() {
    const { level } = this;
    const volume = this.ascend?.stage === 'volume';
    const concealed = !!this.locks && !this.locks.revealed;
    const sideView = this.ascend && this.ascend.stage !== 'flat' ? 'off' : concealed ? 'player-only' : level.sideView === 'concealed' ? 'full' : level.sideView;
    const solids = volume ? [] : this._solids().filter(solid => !this.collected.has(solid.id));
    const hazardSolids = this._hazardSolids();
    const profiles = sideView === 'full' ? [...solids, ...hazardSolids].map(solid => ({ id: solid.id, role: solid.role, solid: !!solid.solid, profile: profileXZ(solid) })) : [];
    const guards = this.guards.filter(guard => this.s >= guard.z[0] - EPSILON && this.s <= guard.z[1] + EPSILON)
      .map(guard => ({ ...guard, alert: this.lastAlert?.id === guard.id && this.time - this.lastAlert.time < 2 }));
    const ghosts = this.peek ? lowerPrismGhosts(this._solids().filter(solid => !this.collected.has(solid.id) && !this.visible.has(solid.id)), this.s) : [];
    const companions = companionView(this);
    const lanternSolids = [...solids, ...this.shards.filter(shard => !shard.taken).map(shard => ({
      id: shard.id, role: 'item', kind: 'prism', z: shard.z,
      polygon: [[shard.x, shard.y - .3], [shard.x + .3, shard.y], [shard.x, shard.y + .3], [shard.x - .3, shard.y]],
    }))];
    const lanternGhosts = adjacentSliceGhosts(lanternSolids, this.s, this.player, companions.radius, level.slice);
    const r = this.rings, l = this.locks, st = this.storm;
    const lock = l?.list[l.index];
    return {
      index: this.index, count: this.levels.length, levelId: level.id, title: level.title, tagline: level.tagline, mode: level.mode, endless: !!level.endless, seed: this.seed,
      phase: this.phase, exploration: this.exploration, paused: this.paused, precision: this.precision, cleared: this.cleared, time: this.time, s: this.s, slice: { ...this.sliceRange() }, bounds: { ...level.bounds },
      encounter: encounterView(this.encounter, this), collection: normalizeCollection(this.collection), gardenMemories: { ...this.gardenMemories }, gardenCollection: gardenCollection(this.gardenMemories, this.levels), companions, lanternGhosts, petting: Math.max(0, this.petUntil - this.time),
      canPoke: this.exploration && !!this.rings && this.canSlice() && this.time >= this.pokeUntil && this.visible.has(this.level.visitor?.id),
      player: { ...this.player }, canMove: level.player.canMove && !this._frozen(), canSlice: this.canSlice(), sideView,
      sections: structuredClone([...this.visible.values()]), hazards: structuredClone(this.hazardShapes), warnings: this._warnings(), profiles,
      shards: this.shards.map(shard => ({ id: shard.id, x: shard.x, y: shard.y, z: [...shard.z], taken: shard.taken, golden: !!shard.golden,
        visible: this.s >= shard.z[0] - EPSILON && this.s <= shard.z[1] + EPSILON, life: shard.born === undefined ? null : Math.max(0, level.stormRules.shardLife - (this.time - shard.born)) })),
      score: this.score, combo: { count: this.combo.count, mult: this.comboMultiplier(), best: this.combo.best,
        remaining: this.rings ? null : Math.max(0, (level.stormRules?.comboWindow ?? COMBO_WINDOW) - (this.time - this.combo.last)) },
      deaths: this.deaths, dying: this.dying && { ...this.dying, progress: 1 - (this.dying.until - this.time) / RESPAWN_TIME },
      safe: Math.max(0, this.safeUntil - this.time),
      abilities: { peek: !!level.abilities?.peek, flip: !!level.abilities?.flip, reveal: !!level.abilities?.reveal }, peek: this.peek, ghosts,
      guards: structuredClone(guards), ghostGuards: this.peek ? structuredClone(this.guards.filter(guard => guard.z[1] < this.s - EPSILON)) : [],
      carrying: this.carrying, doorLocked: this.doorLocked,
      returning: Math.max(0, this.returnUntil - this.time),
      alert: this.lastAlert && this.time - this.lastAlert.time < 3 ? { ...this.lastAlert } : null,
      goals: this.goals.map(goal => ({ id: goal.id, kind: goal.kind, solid: goal.solid, done: goal.done })),
      rings: r && { index: r.index, count: r.list.length, radius: r.list[r.index] ?? null, active: r.gap <= 0 && r.index < r.list.length,
        window: this.exploration ? null : level.ringRules.windows[r.index] ?? 1, elapsed: r.elapsed, hold: r.hold / level.ringRules.hold, error: r.error, hits: r.hits, results: [...r.results],
        center: (() => { const c = this._visitorSolid().center; return [c[0], c[1]]; })(), near: !!r.near, need: level.ringRules.need, tolerance: level.ringRules.tolerance },
      locks: l && { index: l.index, count: l.list.length, active: !this.cleared && l.gap <= 0, target: lock ? structuredClone(lock.shape) : null, closeness: l.closeness,
        stamp: lock?.stamp ? [...lock.stamp] : null, prints: this.exploration ? structuredClone(l.list.slice(0, l.times.length).map(item => item.shape)) : [],
        hold: l.hold / level.lockRules.hold, revealed: l.revealed, solved: l.times.length, roundTime: this.time - l.roundStart },
      mirror: level.abilities?.flip ? {
        chirality: this.keyChirality, turns: this.keyTurns, onPad: this._onFlipPad(), canFlip: this.canFlip(), canRotate: this.canRotateKey(),
        motion: this.flipMotion && { ...this.flipMotion, progress: flipProgress(this.flipMotion.elapsed) },
        locks: this.mirrorLocks.map(item => ({ ...item, rejecting: !!this.lockContact?.startsWith(`${item.id}:`) })),
        actions: this.counters.flips + this.counters.planarTurns, par: this.variant.parActions,
      } : null,
      storm: st && { lives: st.lives, maxLives: level.stormRules.lives, level: st.level + 1, grazes: st.grazes,
        nearMiss: [...this.grazes.values()].some(g => !g.resolved && g.travel >= GRAZE_TRAVEL) },
      ascend: this.ascend && { ...structuredClone(this.ascend), progress: this.ascend.elapsed / DIMENSION_DURATION, boxes: roomSections(volume ? this.s : W_SLICE.start), w: volume ? this.s : W_SLICE.start,
        blocked: this.lastBlock && this.time - this.lastBlock.time < 1.5 ? this.lastBlock.id : null, readyForCourtyard: this.cleared },
      stars: level.stars.map((def, i) => ({ label: def.label.replace('{par}', this.variant.parActions), earned: this.stars[i], kind: def.kind, value: def.value, status: this._starStatus(def, i) })),
      counters: { ...this.counters }, hint: this.hint,
    };
  }
}
