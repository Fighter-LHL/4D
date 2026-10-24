import { sliceSolid, profileXZ, circleHitsShape, shapeCentroid, EPSILON } from './geometry.js';
import { guardPose, guardSees, lowerPrismGhosts, sightBlocked } from './perception.js';
import { FLATLAND_LEVELS } from './levels.js';
import { FLIP_DURATION, flipProgress, flippedPose, predictionChoices, quarterTurn } from './mirror.js';
import { ASCEND_BOXES, DIMENSION_DURATION, W_SLICE, boxPresent, roomBlocker, roomSections, sphereHitsBox, outsideRoom } from './ascend.js';
// Authoritative rules for chapter 0. Views consume snapshots and events only.
const STEP = 1 / 120;
const MAX_FRAME_TIME = .1;
const MAX_EVENTS = 128;
const MOVE_SPEED = 5;
const SLICE_SPEED = 1.2;
const SWEEP = .02;
const GESTURE_MIN = .3;
export const MATCH_HOLD = .35;
export const OBSERVE_HOLD = .25;
const OBSERVE_TOLERANCE = .12;
const BLOCK_REPEAT = .45;
export const RETURN_GRACE = 1.2;
const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));

export class FlatlandModel {
  constructor(index = 0, levels = FLATLAND_LEVELS) { this.levels = levels; this.events = []; this.load(index); }

  load(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.levels.length) return false;
    this.index = index;
    this.level = this.levels[index];
    const { player, slice } = this.level;
    this.phase = 'intro';
    this.player = { x: player.x, y: player.y, r: player.r, facing: 0 };
    this.s = slice.start;
    this.input = { x: 0, y: 0, slice: 0 };
    this.time = 0;
    this.matchedAt = null;
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
    this.lockReason = null;
    this.lockSignature = null;
    this.keyChirality = 1;
    this.keyTurns = 0;
    this.flipMotion = null;
    this.flipPrediction = null;
    this.ascend = this.level.dimensionLesson ? { stage: 'flat', elapsed: 0, flatComplete: false, leftRoom: false, position: { x: 10, y: .4, z: 6 } } : null;
    this.guards = (this.level.guards || []).map(def => guardPose(def, 0));
    this.counters = { sliceMoves: 0, blockedCount: 0, hintsShown: 0, quizWrong: 0, firstCorrect: 0, peekUses: 0, guardAlerts: 0, flips: 0, planarTurns: 0 };
    this.goals = this.level.goals.map(goal => ({ ...goal, done: false, hold: 0, sides: new Set(), error: Infinity }));
    this.quiz = this.level.quiz ? { ...this.level.quiz, answered: false, correct: false, choice: null } : null;
    this.stars = this.level.stars.map(() => false);
    this.roundIndex = 0;
    this.round = null;
    this.roundResults = [];
    if (this.level.rounds) this._loadRound();
    this.profiles = this._profiles();
    this.visible = this._sections();
    this.events = [];
    this._emit('load', { level: this.level.id, index });
    return true;
  }
  restart() { return this.load(this.index); }
  next() { return this.load(this.index + 1); }
  start() {
    if (this.phase !== 'intro') return false;
    this.phase = 'playing';
    this._emit('start', { level: this.level.id });
    return true;
  }

  _emit(type, fields = {}) {
    if (this.events.length >= MAX_EVENTS) this.events.shift();
    this.events.push({ type, level: this.level.id, ...fields });
  }
  drainEvents() { const events = this.events; this.events = []; return events; }
  _solids() { return this.level.rounds?.[this.roundIndex].solids || this.level.solids; }
  _solid(id) { return this._solids().find(solid => solid.id === id); }
  _profiles() { return this._solids().map(solid => ({ id: solid.id, role: solid.role, solid: !!solid.solid, profile: profileXZ(solid) })); }
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

  setMove(x, y) {
    if (![x, y].every(Number.isFinite)) return false;
    if (this.time < this.returnUntil || this._mirrorBusy() || this.ascend?.stage === 'transition') { this.input.x = this.input.y = 0; return false; }
    const length = Math.hypot(x, y);
    this.input.x = length > 1 ? x / length : x;
    this.input.y = length > 1 ? y / length : y;
    return true;
  }
  setSliceVelocity(value) {
    if (!Number.isFinite(value)) return false;
    if (this.time < this.returnUntil || this.level.slice.fixed || this._mirrorBusy() || this.ascend?.stage === 'transition') { this.input.slice = 0; return false; }
    const previous = this.input.slice;
    this.input.slice = clamp(value, -1, 1);
    if (previous && !this.input.slice) this.endSliceGesture();
    return true;
  }

  // Sweeps toward the target and stops flush against the first solid section
  // that would overlap the player, so a blocked change is visible and local.
  setSlice(target) {
    if (!this.canSlice() || !Number.isFinite(target)) return false;
    const { min, max } = this.ascend?.stage === 'volume' ? W_SLICE : this.level.slice;
    target = clamp(target, min, max);
    if (Math.abs(target - this.s) <= EPSILON) return true;
    if (this.gestureStart === null) this.gestureStart = this.s;
    const { x, y } = this.player, direction = Math.sign(target - this.s);
    let s = this.s, blocker = null;
    while (Math.abs(target - s) > EPSILON) {
      const sweep = this.ascend?.stage === 'volume' ? .005 : SWEEP;
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
    if (Math.abs(s - this.s) > EPSILON) { this.s = s; this.idle = 0; this._refresh(); }
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
  _refresh() {
    const next = this._sections();
    for (const [id, section] of next) if (!this.visible.has(id)) this._emit('section_enter', { id, role: section.role });
    for (const [id, section] of this.visible) if (!next.has(id)) this._emit('section_exit', { id, role: section.role });
    this.visible = next;
    if (this.round && ['observe', 'verify'].includes(this.round.stage)) {
      const def = this.level.rounds[this.roundIndex];
      const targets = this.round.stage === 'observe' ? def.observe : def.verify;
      if (Math.abs(this.s - targets[this.round.samples.length]) > OBSERVE_TOLERANCE) this.round.hold = 0;
    }
    for (const goal of this.goals) {
      if (goal.kind !== 'match') continue;
      const shape = next.get(goal.solid)?.shape;
      const side = this.s < this._solid(goal.solid).center[2] ? 'low' : 'high';
      if (!shape || Math.abs(shape.r - goal.radius) > goal.tolerance || goal.holdSide !== side) goal.hold = 0;
    }
  }

  // The basic visitor objective stays earned while the player explores the
  // second matching height. Only this explicit action opens its final quiz.
  finishObservation() {
    if (this.phase !== 'playing' || !this.quiz || !this.goals.every(goal => goal.done)) return false;
    this.endSliceGesture();
    this.phase = 'quiz';
    this.input = { x: 0, y: 0, slice: 0 };
    this._emit('quiz', { prompt: this.quiz.prompt });
    return true;
  }

  answerQuiz(choice) {
    if (this.phase !== 'quiz' || !Number.isInteger(choice) || choice < 0 || choice >= this.quiz.options.length) return false;
    const correct = choice === this.quiz.answer;
    if (!correct) this.counters.quizWrong += 1;
    Object.assign(this.quiz, { answered: true, correct, choice });
    this._emit('quiz_answer', { correct, choice });
    this._complete();
    return true;
  }

  canSlice() { return this.phase === 'playing' && this.ascend?.stage !== 'transition' && !this.level.slice.fixed && !this._mirrorBusy() && this.round?.stage !== 'predict' && this.time >= this.returnUntil; }

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
        this.matchedAt = null; this.lastBlock = null; this.hintIndex = 0; this.idle = 0; this.hint = null;
        this.visible = new Map(); this._emit('dimension_ready');
      }
      return;
    }
    this.idle += h;
    if (this.input.slice) this.setSlice(this.s + this.input.slice * .4 * h);
    const p = this.player;
    for (const [axis, value] of [['x', this.input.x], ['y', this.input.y]]) {
      if (!value) continue;
      const next = { x: p.x, y: p.y }; next[axis] += value * MOVE_SPEED * h;
      const blocker = this._collides(next.x, next.y, this.s);
      if (blocker) this._block(blocker);
      else if (this._inBounds(next.x, next.y)) { p[axis] = next[axis]; this.idle = 0; }
    }
    if (this.input.x || this.input.y) p.facing = Math.atan2(this.input.y, this.input.x);
    a.position.x = p.x; a.position.z = p.y;
    if (!a.leftRoom && this.s > .58 + EPSILON && outsideRoom(a.position, p.r)) { a.leftRoom = true; this._emit('dimension_escape'); }
    const gate = ASCEND_BOXES.find(box => box.role === 'goal');
    if (a.leftRoom && boxPresent(gate, this.s) && sphereHitsBox(a.position, p.r, gate)) {
      this.goals[0].done = true; this.endSliceGesture(); this._emit('goal_done', { goal: this.goals[0].id }); this._complete();
    }
    const hint = this.level.volumeHints[this.hintIndex];
    if (hint && this.idle >= hint.idle) { this.hint = hint.text; this.hintIndex++; this.counters.hintsShown++; this._emit('hint', { text: hint.text }); }
  }

  _mirrorBusy() { return !!this.flipMotion || this.flipPrediction?.choice === null; }
  _onFlipPad() {
    const shape = this.visible.get(this.level.flipPad)?.shape, p = this.player;
    return !!shape && circleHitsShape(p.x, p.y, p.r, shape);
  }
  canFlip() { return this.phase === 'playing' && !!this.level.abilities?.flip && !!this.carrying && this._onFlipPad() && !this._mirrorBusy(); }
  canRotateKey() { return this.phase === 'playing' && !!this.level.abilities?.flip && !!this.carrying && !this._mirrorBusy(); }

  requestFlip() {
    if (!this.canFlip()) return false;
    this.input = { x: 0, y: 0, slice: 0 }; this.idle = 0; this.hint = null;
    if (!this.flipPrediction) {
      this.flipPrediction = { choice: null, correct: null, options: predictionChoices(this.keyChirality, this.keyTurns) };
      this._emit('flip_predict');
    } else this._beginFlip();
    return true;
  }
  answerFlipPrediction(choice) {
    if (this.phase !== 'playing' || this.flipPrediction?.choice !== null || !Number.isInteger(choice) || choice < 0 || choice > 2) return false;
    this.flipPrediction.choice = choice;
    this.flipPrediction.correct = choice === 1;
    if (choice !== 1) this.counters.quizWrong++;
    // Reveal correctness after the physical flip, so a wrong prediction is an
    // observation opportunity and does not become a second guess for the star.
    this._beginFlip();
    return true;
  }
  _beginFlip() {
    this.flipMotion = { elapsed: 0, fromChirality: this.keyChirality, fromTurns: this.keyTurns };
    this.input = { x: 0, y: 0, slice: 0 }; this.idle = 0; this.hint = null;
    this._emit('flip_start');
  }
  rotateKey() {
    if (!this.canRotateKey()) return false;
    this.keyTurns = quarterTurn(this.keyTurns + 1); this.counters.planarTurns++;
    this.idle = 0; this.hint = null;
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

  _checkGuards() {
    if (!this.guards.length || this.time < this.returnUntil) return false;
    const walls = [...this.visible.values()].filter(section => section.solid).map(section => section.shape);
    const guard = this.guards.find(guard => guardSees(guard, this.player, this.s, walls));
    if (!guard) return false;
    const returnedKey = this.carrying !== null;
    this.counters.guardAlerts += 1;
    this.lastAlert = { id: guard.id, label: guard.label, returnedKey, time: this.time };
    this.endSliceGesture();
    this.setPeek(false);
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
    this._emit('guard_alert', { id: guard.id, returnedKey });
    return true;
  }

  _loadRound() {
    const def = this.level.rounds[this.roundIndex];
    this.s = def.start;
    this.input = { x: 0, y: 0, slice: 0 };
    this.gestureStart = null;
    this.idle = 0; this.hint = null; this.hintIndex = 0;
    this.round = { stage: def.mode, choice: null, correct: null, samples: [], hold: 0 };
    this.profiles = this._profiles();
    this.visible = this._sections();
  }

  answerRound(choice) {
    if (this.phase !== 'playing' || !['answer', 'predict'].includes(this.round?.stage)) return false;
    const def = this.level.rounds[this.roundIndex];
    if (!Number.isInteger(choice) || choice < 0 || choice >= def.options.length) return false;
    const correct = choice === def.answer;
    this.counters.firstCorrect += Number(correct);
    this.counters.quizWrong += Number(!correct);
    this.endSliceGesture();
    Object.assign(this.round, { stage: 'verify', choice, correct, samples: [], hold: 0 });
    this.idle = 0; this.hint = null;
    this._emit('quiz_answer', { id: def.id, correct, choice });
    return true;
  }

  _observeRound(h) {
    const round = this.round, def = this.level.rounds[this.roundIndex];
    if (!['observe', 'verify'].includes(round.stage)) return;
    const targets = round.stage === 'observe' ? def.observe : def.verify;
    const target = targets[round.samples.length];
    if (Math.abs(this.s - target) > OBSERVE_TOLERANCE) { round.hold = 0; return; }
    round.hold += h;
    if (round.hold + EPSILON < OBSERVE_HOLD) return;
    // Capture only a section actually held on screen, not a simulated sweep.
    round.samples.push({ s: this.s, shape: structuredClone(this.visible.values().next().value?.shape || null) });
    round.hold = 0;
    this._emit('observation', { id: def.id, index: round.samples.length - 1, s: this.s });
    if (round.samples.length !== targets.length) return;
    if (round.stage === 'observe') round.stage = 'answer';
    else {
      round.stage = 'review';
      this.roundResults.push({ id: def.id, correct: round.correct, choice: round.choice });
      this._emit('round_verified', { id: def.id });
    }
  }

  nextRound() {
    if (this.phase !== 'playing' || this.round?.stage !== 'review') return false;
    this.endSliceGesture();
    if (this.roundIndex + 1 === this.level.rounds.length) this._complete();
    else { this.roundIndex += 1; this._loadRound(); this._emit('round_start', { index: this.roundIndex }); }
    return true;
  }

  update(dtSeconds) {
    if (this.phase !== 'playing' || !Number.isFinite(dtSeconds) || dtSeconds <= 0) return;
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
    if (this.flipMotion) {
      this.flipMotion.elapsed = Math.min(FLIP_DURATION, this.flipMotion.elapsed + h);
      if (this.flipMotion.elapsed + EPSILON >= FLIP_DURATION) {
        const pose = flippedPose(this.flipMotion.fromChirality, this.flipMotion.fromTurns);
        this.keyChirality = pose.chirality; this.keyTurns = pose.turns;
        this.flipMotion = null; this.counters.flips++;
        this._emit('flip_end', { chirality: this.keyChirality, turns: this.keyTurns });
        if (this.counters.flips === 1) this._emit('quiz_answer', { id: 'flip-prediction', correct: this.flipPrediction.correct });
      }
      return;
    }
    if (this.flipPrediction?.choice === null) return;
    this.guards = (this.level.guards || []).map(def => guardPose(def, this.time));
    if (this.time < this.returnUntil) return;
    this.idle += h;
    if (this.input.slice) this.setSlice(this.s + this.input.slice * SLICE_SPEED * h);
    if (this.level.player.canMove && (this.input.x || this.input.y)) {
      const p = this.player, dx = this.input.x * MOVE_SPEED * h, dy = this.input.y * MOVE_SPEED * h;
      let moved = false;
      if (dx && this._inBounds(p.x + dx, p.y) && !this._collides(p.x + dx, p.y, this.s)) { p.x += dx; moved = true; }
      if (dy && this._inBounds(p.x, p.y + dy) && !this._collides(p.x, p.y + dy, this.s)) { p.y += dy; moved = true; }
      p.facing = Math.atan2(this.input.y, this.input.x);
      if (moved) {
        this.idle = 0;
        if (this.level.abilities?.peek) this._refresh();
      }
    }
    if (this._checkGuards()) return;
    if (this.round) this._observeRound(h);
    else this._checkGoals(h);
    const hint = this.level.hints[this.hintIndex];
    if (hint && this.idle >= hint.idle) {
      this.hint = hint.text;
      this.hintIndex += 1;
      this.counters.hintsShown += 1;
      this._emit('hint', { index: this.hintIndex - 1, text: hint.text });
    }
    if (!this.round && this.goals.length && this.goals.every(goal => goal.done)) {
      if (this.ascend?.stage === 'flat') { this._beginDimensionTransition(); return; }
      if (this.matchedAt === null) { this.matchedAt = this.time; this._emit('observation_ready'); }
      if (!this.quiz) { this.endSliceGesture(); this._complete(); }
    }
  }
  _checkGoals(h) {
    const p = this.player;
    this.doorLocked = false;
    this.lockReason = null;
    for (const goal of this.goals) {
      const shape = this.visible.get(goal.solid)?.shape;
      if (goal.kind === 'match') {
        goal.error = shape?.type === 'circle' ? Math.abs(shape.r - goal.radius) : Infinity;
        if (goal.error > goal.tolerance) { goal.hold = 0; continue; }
        const side = this.s < this._solid(goal.solid).center[2] ? 'low' : 'high';
        if (goal.holdSide !== side) goal.hold = 0;
        goal.holdSide = side;
        goal.hold = Math.min(MATCH_HOLD, goal.hold + h);
        if (goal.hold < MATCH_HOLD) continue;
        const newSide = !goal.sides.has(side);
        goal.sides.add(side);
        if (!goal.done) { goal.done = true; this._emit('goal_done', { goal: goal.id, side }); }
        else if (newSide) this._emit('goal_side', { goal: goal.id, side });
      } else if (goal.kind === 'reach' && !goal.done && shape && circleHitsShape(p.x, p.y, p.r, shape)) {
        goal.done = true;
        this._emit('goal_done', { goal: goal.id });
      } else if (goal.kind === 'pickup' && !goal.done && shape && circleHitsShape(p.x, p.y, p.r, shape)) {
        goal.done = true;
        this.carrying = goal.solid;
        this.collected.add(goal.solid);
        this.hint = null;
        this._emit('pickup', { id: goal.solid });
        this._refresh();
      } else if (goal.kind === 'unlock' && !goal.done && shape && circleHitsShape(p.x, p.y, p.r, shape)) {
        this.lockReason = this.carrying !== goal.requires ? 'missing-key'
          : goal.chirality !== undefined && this.keyChirality !== goal.chirality ? 'chirality'
            : goal.turns !== undefined && this.keyTurns !== goal.turns ? 'orientation' : null;
        this.doorLocked = this.lockReason !== null;
        if (this.level.abilities?.flip && this.doorLocked) {
          const signature = `${this.lockReason}:${this.keyChirality}:${this.keyTurns}`;
          if (signature !== this.lockSignature) this._emit('lock_reject', { reason: this.lockReason });
          this.lockSignature = signature;
        }
        if (!this.doorLocked) { goal.done = true; this._emit('unlock', { id: goal.solid }); }
      }
    }
    if (!this.doorLocked) this.lockSignature = null;
  }
  _star(def) {
    if (def.kind === 'complete') return true;
    if (def.kind === 'maxTime') return (this.matchedAt ?? this.time) <= def.value;
    if (def.kind === 'firstCorrect') return this.counters.firstCorrect >= def.value;
    if (def.kind === 'maxSliceMoves') return this.counters.sliceMoves <= def.value;
    if (def.kind === 'noBlocked') return this.counters.blockedCount === 0;
    if (def.kind === 'noAlerts') return this.counters.guardAlerts === 0;
    if (def.kind === 'maxPeekUses') return this.counters.peekUses <= def.value;
    if (def.kind === 'flipPrediction') return this.counters.flips > 0 && !!this.flipPrediction?.correct;
    if (def.kind === 'singleFlip') return this.counters.flips === 1;
    if (def.kind === 'quizCorrect') return !!this.quiz?.correct;
    if (def.kind === 'bothSides') return this.goals.find(goal => goal.id === def.goal)?.sides.size === 2;
    if (def.kind === 'all') return def.of.every(item => this._star(item));
    return false;
  }
  _complete() {
    this.setPeek(false);
    this.phase = 'complete';
    this.input = { x: 0, y: 0, slice: 0 };
    this.stars = this.level.stars.map(def => this._star(def));
    this._emit('complete', { stars: this.stars.filter(Boolean).length });
  }

  snapshot() {
    const { level } = this;
    const def = level.rounds?.[this.roundIndex], round = this.round;
    const concealed = !!def?.concealed && round.choice === null;
    const hideProfiles = concealed || level.sideView === 'player-only';
    const guards = this.guards.filter(guard => this.s >= guard.z[0] - EPSILON && this.s <= guard.z[1] + EPSILON)
      .map(guard => ({ ...guard, alert: this.lastAlert?.id === guard.id && this.time - this.lastAlert.time < 2 }));
    const ghosts = this.peek ? lowerPrismGhosts(this._solids().filter(solid => !this.collected.has(solid.id) && !this.visible.has(solid.id)), this.s) : [];
    const roundSnapshot = round && {
      index: this.roundIndex, count: level.rounds.length, id: def.id, title: def.title,
      stage: round.stage, prompt: def.prompt, knownShape: def.knownShape || null, icon: def.icon || null,
      options: structuredClone(def.options), choice: round.choice, correct: round.correct,
      explain: round.choice === null ? null : def.explain,
      targets: [...(['observe', 'answer'].includes(round.stage) ? def.observe : def.verify)],
      samples: structuredClone(round.samples), progress: Math.min(1, round.hold / OBSERVE_HOLD),
    };
    return {
      index: this.index, count: this.levels.length, levelId: level.id, title: level.title, intro: level.intro, concept: level.concept,
      phase: this.phase, time: this.time, matchedAt: this.matchedAt, s: this.s, slice: { ...(this.ascend?.stage === 'volume' ? W_SLICE : level.slice) }, bounds: { ...level.bounds },
      player: { ...this.player }, canMove: level.player.canMove && !this._mirrorBusy() && this.ascend?.stage !== 'transition', canSlice: this.canSlice(), sideView: this.ascend && this.ascend.stage !== 'flat' ? 'off' : concealed ? 'player-only' : level.sideView,
      sections: structuredClone([...this.visible.values()]), profiles: hideProfiles ? [] : structuredClone(this.profiles),
      abilities: { peek: !!level.abilities?.peek, flip: !!level.abilities?.flip }, peek: this.peek, ghosts,
      mirror: level.abilities?.flip ? {
        chirality: this.keyChirality, turns: this.keyTurns, onPad: this._onFlipPad(), canFlip: this.canFlip(), canRotate: this.canRotateKey(),
        motion: this.flipMotion && { ...this.flipMotion, progress: flipProgress(this.flipMotion.elapsed) },
        prediction: this.flipPrediction && { choice: this.flipPrediction.choice, correct: this.counters.flips > 0 ? this.flipPrediction.correct : null, options: structuredClone(this.flipPrediction.options) },
        lockReason: this.lockReason,
      } : null,
      guards: structuredClone(guards), ghostGuards: this.peek ? structuredClone(this.guards.filter(guard => guard.z[1] < this.s - EPSILON)) : [],
      carrying: this.carrying, doorLocked: this.doorLocked,
      ascend: this.ascend && { ...structuredClone(this.ascend), progress: this.ascend.elapsed / DIMENSION_DURATION, boxes: roomSections(this.ascend.stage === 'volume' ? this.s : W_SLICE.start), w: this.ascend.stage === 'volume' ? this.s : W_SLICE.start, blocked: this.lastBlock && this.time - this.lastBlock.time < 3 ? this.lastBlock.id : null, readyForCourtyard: this.phase === 'complete' },
      returning: Math.max(0, this.returnUntil - this.time),
      alert: this.lastAlert && this.time - this.lastAlert.time < 5 ? { ...this.lastAlert } : null,
      round: roundSnapshot, roundResults: structuredClone(this.roundResults),
      observationReady: this.phase === 'playing' && !!this.quiz && this.matchedAt !== null,
      goals: this.goals.map(goal => {
        const solid = this._solid(goal.solid);
        return { id: goal.id, kind: goal.kind, solid: goal.solid, done: goal.done, radius: goal.radius, error: goal.error,
          progress: goal.kind === 'match' ? goal.hold / MATCH_HOLD : goal.done ? 1 : 0, sides: [...goal.sides],
          center: solid.kind === 'sphere' ? [solid.center[0], solid.center[1]] : null };
      }),
      quiz: this.quiz && { prompt: this.quiz.prompt, options: [...this.quiz.options], answered: this.quiz.answered, correct: this.quiz.correct,
        choice: this.quiz.choice, explain: this.quiz.explain },
      stars: level.stars.map((def, i) => ({ label: def.label, earned: this.stars[i], kind: def.kind, value: def.value })),
      counters: { ...this.counters }, hint: this.hint,
    };
  }
}
