// DOM-free level runtime: everything here is testable under Node.
import { clampDial, dialToW, wToDial, sliceAtDial, corridorSections, sweptSections, moveCorridorToken, wChangeEngulfs, safeWToward, goalOpenAt } from './geometry.mjs';
import { PredictionSession } from './challenge.mjs';

export const WALK_SPEED = 1.55;
export const WIN_RADIUS = 0.3;
const round = (value, digits = 3) => Number(value.toFixed(digits));

// A walking level: the token moves on the floor, and only the current 3D
// section decides where it may go. W changes that would swallow the token
// are refused.
export class WalkRun {
  constructor(level, levelId, now = 0) {
    this.level = level;
    this.levelId = levelId;
    this.pos = [...level.start];
    this.dial = 0.5;
    this.createdAt = now;
    this.startedAt = 0;
    this.finishedAt = 0;
    this.won = false;
    this.distance = 0;
    this.blocked = 0;
    this.blockStreak = 0;
    this.blockedLast = false;
    this.wMoves = 0;
    this.refused = 0;
    this.refusing = false;
    this.hints = 0;
    this.peeks = 0;
    this.wMin = this.dial;
    this.wMax = this.dial;
  }

  sectionsAt(dial = this.dial) {
    return corridorSections(dialToW(dial), this.level);
  }

  canSetDial(to, from = this.dial) {
    return !wChangeEngulfs(this.level, this.pos, dialToW(from), dialToW(clampDial(to)));
  }

  setDial(to, now = 0) {
    const dial = clampDial(to);
    if (!this.canSetDial(dial)) {
      this.refused += 1;
      return false;
    }
    this.#apply(dial, now);
    return true;
  }

  // Like setDial, but an engulfing request stops just short of the wall.
  // Pushing into the wall again within one gesture counts one refusal.
  reachDial(to, now = 0) {
    const dial = clampDial(to);
    if (this.canSetDial(dial)) {
      this.#apply(dial, now);
      return { dial, clamped: false, won: this.won };
    }
    if (!this.refusing) this.refused += 1;
    this.refusing = true;
    const edge = wToDial(safeWToward(this.level, this.pos, dialToW(this.dial), dialToW(dial)));
    if (this.canSetDial(edge)) this.#apply(edge, now);
    return { dial: this.dial, clamped: true, won: this.won };
  }

  #apply(dial, now = 0) {
    this.dial = dial;
    this.wMin = Math.min(this.wMin, dial);
    this.wMax = Math.max(this.wMax, dial);
    if (now) this.#checkWin(now, dial);
  }

  atGoalSpot() {
    const [gx, gz] = this.level.goal;
    return Math.hypot(this.pos[0] - gx, this.pos[1] - gz) < WIN_RADIUS;
  }

  #checkWin(now, dial = this.dial) {
    if (this.won || !this.atGoalSpot()) return false;
    if (!goalOpenAt(this.level, dialToW(dial)) || !goalOpenAt(this.level, dialToW(this.dial))) return false;
    this.won = true;
    this.finishedAt = now;
    if (!this.startedAt) this.startedAt = now;
    return true;
  }

  // One finished W gesture (drag released, key released).
  noteWAdjust() {
    this.wMoves += 1;
    this.blockStreak = 0;
  }

  // Every W gesture ends here, whether or not it moved the dial.
  endWGesture() {
    this.refusing = false;
  }

  // dirX/dirZ is the held direction; dial is the W actually on screen (it may
  // lag the target while animating — every value in between is safe because
  // setDial checked the whole interval, and moves are checked against every
  // section between the shown W and the target).
  step(dirX, dirZ, delta, now, dial = this.dial) {
    if (this.won) {
      this.blockedLast = false;
      return { travelled: 0, newlyBlocked: false, won: false, goalOtherW: false };
    }
    const length = Math.hypot(dirX, dirZ);
    if (!length) {
      this.blockedLast = false;
      const won = this.#checkWin(now, dial);
      const goalOtherW = !won && this.atGoalSpot() && !goalOpenAt(this.level, dialToW(this.dial));
      return { travelled: 0, newlyBlocked: false, won, goalOtherW };
    }
    const scale = (WALK_SPEED * delta) / length;
    const sections = sweptSections(this.level, dialToW(dial), dialToW(this.dial));
    const move = moveCorridorToken(sections, this.pos, dirX * scale, dirZ * scale, this.level);
    const travelled = Math.hypot(move.x - this.pos[0], move.z - this.pos[1]);
    if (travelled && !this.startedAt) this.startedAt = now;
    this.distance += travelled;
    this.pos = [move.x, move.z];
    const jammed = travelled === 0;
    const newlyBlocked = jammed && !this.blockedLast;
    if (newlyBlocked) {
      this.blocked += 1;
      this.blockStreak += 1;
    }
    this.blockedLast = jammed;
    const won = this.#checkWin(now, dial);
    const goalOtherW = !won && this.atGoalSpot() && !goalOpenAt(this.level, dialToW(this.dial));
    return { travelled, newlyBlocked, won, goalOtherW };
  }

  seconds(now) {
    if (!this.startedAt) return 0;
    return Math.round(((this.won ? this.finishedAt : now) - this.startedAt) / 1000);
  }

  toJSON() {
    return {
      schemaVersion: 2,
      experiment: 'w-slice-game',
      level: this.levelId,
      kind: 'walk',
      completed: this.won,
      distance: round(this.distance),
      blocked: this.blocked,
      wAdjusts: this.wMoves,
      wRefused: this.refused,
      wRange: [round(dialToW(this.wMin)), round(dialToW(this.wMax))],
      hints: this.hints,
      mapPeeks: this.peeks,
      seconds: this.seconds(this.finishedAt),
    };
  }
}

// An observation level: a visitor passes through the slice. First the player
// reaches an observation goal by moving W, then answers inline predictions.
export class VisitRun {
  constructor(bodies, goal, trials, levelId) {
    this.bodies = bodies;
    this.goal = goal;
    this.levelId = levelId;
    this.phase = 'explore';
    this.sawVisible = false;
    this.session = new PredictionSession(trials);
    this.hints = 0;
    this.peeks = 0;
  }

  // Feed every settled W; returns true once the observation goal is met.
  observe(dial) {
    if (this.phase !== 'explore') return false;
    const visible = this.bodies.map((body) => sliceAtDial(body, dial).radius > 0);
    let met = false;
    if (this.goal === 'appear-vanish') {
      if (visible.some(Boolean)) this.sawVisible = true;
      else if (this.sawVisible) met = true;
    } else if (this.goal === 'together') {
      met = visible.every(Boolean);
    }
    if (met) this.phase = 'predict';
    return met;
  }

  submit(choice) {
    if (this.phase !== 'predict') throw new Error('Not predicting');
    return this.session.submit(choice);
  }

  // Returns false once the last prediction is done.
  next() {
    const more = this.session.next();
    if (!more) this.phase = 'done';
    return more;
  }

  get won() { return this.phase === 'done'; }

  toJSON() {
    return {
      schemaVersion: 2,
      experiment: 'w-slice-game',
      level: this.levelId,
      kind: 'visit',
      completed: this.won,
      hints: this.hints,
      mapPeeks: this.peeks,
      predictions: this.session.toJSON(),
    };
  }
}
