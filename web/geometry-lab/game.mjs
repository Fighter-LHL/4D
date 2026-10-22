// DOM-free level runtime: everything here is testable under Node.
import { clampDial, dialToW, wToDial, sliceAtDial, corridorSections, sweptSections, legalCorridorSpot, moveCorridorToken, wChangeEngulfs, safeWToward, goalOpenAt, fieldWithRadius, relayField } from './geometry.mjs';
import { PredictionSession } from './challenge.mjs';

export const WALK_SPEED = 1.55;
export const WIN_RADIUS = 0.3;
const round = (value, digits = 3) => Number(value.toFixed(digits));

// A walking level: the token moves on the floor, and only the current 3D
// section decides where it may go. W changes that would swallow the token
// (or a carried object) are refused.
export class WalkRun {
  constructor(level, levelId, now = 0) {
    this.level = level;
    this.field = level;
    this.carriedField = level.carriedRadius ? fieldWithRadius(level, level.carriedRadius) : level;
    this.relayLatched = false;
    this.socketUses = 0;
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
    this.carrying = false;
    this.pickups = 0;
    this.drops = 0;
    this.item = level.item
      ? { x: level.item.start[0], z: level.item.start[1], w: level.item.start[2] ?? 0 }
      : null;
  }

  activeField() {
    return this.carrying ? this.carriedField : this.field;
  }

  socketPowered() {
    const socket = this.level.relay?.socket;
    return Boolean(socket && this.item && !this.carrying
      && Math.hypot(this.item.x - socket.x, this.item.z - socket.z) < 1e-6
      && Math.abs(this.item.w - socket.w) < 1e-6);
  }

  relayState() {
    if (!this.level.relay) return null;
    const port = (id) => {
      const body = this.level.bodies.find((entry) => entry.id === id);
      return [body.center[0], body.center[2]];
    };
    return { ...this.level.relay, powered: this.socketPowered(), latched: this.relayLatched,
      powerPort: port(this.level.relay.poweredGate), returnPort: port(this.level.relay.shortcutGate) };
  }

  #refreshField() {
    this.field = relayField(this.level, this.socketPowered(), this.relayLatched);
    this.carriedField = fieldWithRadius(this.field, this.level.carriedRadius);
  }

  #atDevice(device, dial) {
    return Math.hypot(this.pos[0] - device.x, this.pos[1] - device.z) <= device.reach
      && Math.abs(dialToW(dial) - device.w) <= device.wReach
      && Math.abs(dialToW(this.dial) - device.w) <= device.wReach;
  }

  #unavailableInteraction(reason, dial) {
    // Explain a failed pickup in terms of the nearby device. Reachable cores
    // are checked first, so a device never hides a valid pickup.
    const relay = this.level.relay;
    if (relay) {
      for (const name of ['latch', 'socket']) {
        const device = relay[name];
        if (Math.hypot(this.pos[0] - device.x, this.pos[1] - device.z) > device.reach) continue;
        if (name === 'latch' && this.relayLatched) return { action: null, reason: 'latch-open' };
        return { action: null, reason: this.#atDevice(device, dial) ? 'socket-empty' : `${name}-other-w` };
      }
    }
    return { action: null, reason };
  }

  itemState() {
    if (!this.item) return null;
    return { ...this.item, carrying: this.carrying };
  }

  sectionsAt(dial = this.dial) {
    return corridorSections(dialToW(dial), this.field);
  }

  canSetDial(to, from = this.dial) {
    return !wChangeEngulfs(this.activeField(), this.pos, dialToW(from), dialToW(clampDial(to)));
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
    const edge = wToDial(safeWToward(this.activeField(), this.pos, dialToW(this.dial), dialToW(dial)));
    if (this.canSetDial(edge)) this.#apply(edge, now);
    return { dial: this.dial, clamped: true, won: this.won };
  }

  #apply(dial, now = 0) {
    this.dial = dial;
    this.wMin = Math.min(this.wMin, dial);
    this.wMax = Math.max(this.wMax, dial);
    if (this.carrying && this.item) {
      this.item.w = dialToW(dial);
    }
    if (now) this.#checkWin(now, dial);
  }

  canInteract(dial = this.dial) {
    const spec = this.level.item;
    if (!spec || !this.item || this.won) return { action: null, reason: 'none' };
    const relay = this.level.relay;
    if (relay && !this.relayLatched && this.#atDevice(relay.latch, dial)) return { action: 'latch', reason: null };
    if (this.carrying && relay && this.#atDevice(relay.socket, dial)) return { action: 'dock', reason: null };
    if (this.carrying) return { action: 'drop', reason: null };
    const w = dialToW(dial);
    if (Math.abs(w - this.item.w) >= spec.wReach) return this.#unavailableInteraction('other-w', dial);
    if (Math.hypot(this.pos[0] - this.item.x, this.pos[1] - this.item.z) > spec.pickupRadius) {
      return this.#unavailableInteraction('far', dial);
    }
    // Picking up a docked core cuts power. Test the geometry AFTER that
    // change, including the whole visible/target W interval, before committing.
    const pickupField = fieldWithRadius(relayField(this.level, false, this.relayLatched), this.level.carriedRadius);
    const sections = sweptSections(pickupField, w, dialToW(this.dial));
    if (!legalCorridorSpot(sections, this.pos[0], this.pos[1], pickupField)) {
      return { action: 'blocked', reason: 'tight' };
    }
    return { action: 'pickup', reason: null };
  }

  interact(now = 0, dial = this.dial) {
    const check = this.canInteract(dial);
    if (check.action === 'latch') {
      this.relayLatched = true;
      this.#refreshField();
      return { action: 'latched', won: false };
    }
    if (check.action === 'dock') {
      const { x, z, w } = this.level.relay.socket;
      this.carrying = false;
      this.item = { x, z, w };
      this.drops += 1;
      this.socketUses += 1;
      this.#refreshField();
      return { action: 'docked', won: false };
    }
    if (check.action === 'drop') {
      const w = dialToW(dial);
      this.carrying = false;
      this.drops += 1;
      this.item = { x: this.pos[0], z: this.pos[1], w };
      this.#refreshField();
      const won = this.#checkWin(now, dial);
      return { action: 'dropped', item: { ...this.item }, won };
    }
    if (check.action === 'pickup') {
      if (!this.startedAt && now) this.startedAt = now;
      this.carrying = true;
      this.pickups += 1;
      this.item = { x: this.pos[0], z: this.pos[1], w: dialToW(this.dial) };
      this.#refreshField();
      const won = this.#checkWin(now, dial);
      return { action: 'picked', item: { ...this.item }, won };
    }
    return { action: check.action, reason: check.reason, won: false };
  }

  atGoalSpot() {
    const [gx, gz] = this.level.goal;
    if (this.level.item) {
      if (!this.item) return false;
      const targetPos = this.carrying ? this.pos : [this.item.x, this.item.z];
      return Math.hypot(targetPos[0] - gx, targetPos[1] - gz) < WIN_RADIUS;
    }
    return Math.hypot(this.pos[0] - gx, this.pos[1] - gz) < WIN_RADIUS;
  }

  #checkWin(now, dial = this.dial) {
    if (this.won || !this.atGoalSpot()) return false;
    const w = dialToW(this.dial);
    if (!goalOpenAt(this.level, dialToW(dial)) || !goalOpenAt(this.level, w)) return false;
    if (this.level.item) {
      const itemW = this.carrying ? w : this.item.w;
      if (!goalOpenAt(this.level, itemW)) return false;
      this.carrying = false;
      this.item = { x: this.level.goal[0], z: this.level.goal[1], w };
    }
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
      return { travelled: 0, newlyBlocked: false, won: false, goalOtherW: false, goalNeedsItem: false };
    }
    const active = this.activeField();
    const length = Math.hypot(dirX, dirZ);
    if (!length) {
      this.blockedLast = false;
      const won = this.#checkWin(now, dial);
      const goalOtherW = !won && this.atGoalSpot() && !goalOpenAt(this.level, dialToW(this.dial));
      const goalNeedsItem = !won && Boolean(this.level.item) && !this.atGoalSpot()
        && Math.hypot(this.pos[0] - this.level.goal[0], this.pos[1] - this.level.goal[1]) < WIN_RADIUS;
      return { travelled: 0, newlyBlocked: false, won, goalOtherW, goalNeedsItem };
    }
    const scale = (WALK_SPEED * delta) / length;
    const sections = sweptSections(this.field, dialToW(dial), dialToW(this.dial));
    const move = moveCorridorToken(sections, this.pos, dirX * scale, dirZ * scale, active);
    const travelled = Math.hypot(move.x - this.pos[0], move.z - this.pos[1]);
    if (travelled && !this.startedAt) this.startedAt = now;
    this.distance += travelled;
    this.pos = [move.x, move.z];
    if (this.carrying && this.item) {
      this.item.x = move.x;
      this.item.z = move.z;
    }
    const jammed = travelled === 0;
    const newlyBlocked = jammed && !this.blockedLast;
    if (newlyBlocked) {
      this.blocked += 1;
      this.blockStreak += 1;
    }
    this.blockedLast = jammed;
    const won = this.#checkWin(now, dial);
    const goalOtherW = !won && this.atGoalSpot() && !goalOpenAt(this.level, dialToW(this.dial));
    const goalNeedsItem = !won && Boolean(this.level.item) && !this.atGoalSpot()
      && Math.hypot(this.pos[0] - this.level.goal[0], this.pos[1] - this.level.goal[1]) < WIN_RADIUS;
    return { travelled, newlyBlocked, won, goalOtherW, goalNeedsItem };
  }

  seconds(now) {
    if (!this.startedAt) return 0;
    return Math.round(((this.won ? this.finishedAt : now) - this.startedAt) / 1000);
  }

  toJSON() {
    const out = {
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
    if (this.level.item) {
      out.pickups = this.pickups;
      out.drops = this.drops;
      out.item = { x: round(this.item.x), z: round(this.item.z), w: round(this.item.w), carrying: this.carrying };
    }
    if (this.level.relay) out.relay = { powered: this.socketPowered(), latched: this.relayLatched, socketUses: this.socketUses };
    return out;
  }
}

// An observation level: a visitor passes through the slice. When trials are
// omitted (main flow), meeting the observation goal completes the level
// directly; when trials are provided (Principle Lab), it enters prediction.
export class VisitRun {
  constructor(bodies, goal, trials = [], levelId = '') {
    this.bodies = bodies;
    this.goal = goal;
    this.levelId = levelId;
    this.phase = 'explore';
    this.sawVisible = false;
    this.session = trials?.length ? new PredictionSession(trials) : null;
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
    if (met) this.phase = this.session ? 'predict' : 'done';
    return met;
  }

  submit(choice) {
    if (this.phase !== 'predict' || !this.session) throw new Error('Not predicting');
    return this.session.submit(choice);
  }

  // Returns false once the last prediction is done.
  next() {
    if (!this.session) {
      this.phase = 'done';
      return false;
    }
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
      predictions: this.session ? this.session.toJSON() : null,
    };
  }
}
