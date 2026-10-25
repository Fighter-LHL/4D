import { clampDial, dialToW, wToDial } from './geometry.mjs';

// Screen right and screen down projected onto the floor. The flat view keeps
// its original axes; a 3D camera's yaw rotates both movement vectors together.
export function screenToWorldMove(right, down, yaw = 0) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [right * c + down * s, -right * s + down * c];
}

// Every walking layout is axis-aligned, so ground input follows the world axis
// nearest to the camera's screen axes (classic isometric control). A single
// key or d-pad button then runs straight along corridors instead of drifting
// diagonally into wall ends; two keys still give the 45° world diagonals.
export const movementYaw = (yaw = 0) => Math.round(yaw / (Math.PI / 2)) * (Math.PI / 2);
export const RAIL_SNAP_W = 0.12;

// These marks identify devices, not safe W ranges. Chapter 2 never adds them.
export function relayRailMarks(level, aidsVisible) {
  if (!aidsVisible || level?.chapter === 2 || !level?.field?.relay) return [];
  const { socket, latch } = level.field.relay;
  return [{ w: socket.w, label: '插座' }, { w: latch.w, label: '回廊' }];
}

export function nearbyRailMark(dial, marks) {
  const w = dialToW(clampDial(dial));
  return marks.reduce((nearest, mark) => {
    const distance = Math.abs(w - mark.w);
    return distance <= RAIL_SNAP_W + 1e-9 && (!nearest || distance < Math.abs(w - nearest.w)) ? mark : nearest;
  }, null);
}

// Only a released pointer gesture uses this. The caller still asks WalkRun
// to accept the entire W change, so snapping cannot bypass engulf checks.
export function railReleaseDial(dial, marks) {
  const mark = nearbyRailMark(dial, marks);
  return mark ? wToDial(mark.w) : clampDial(dial);
}


// Physical W remains continuous. Product controls share Study B's rates but
// disable release docking. These parameters are not validated player outcomes;
// freeze/version the study before formal use.
// rampFloor/rampMs: a held direction starts at 35% speed and reaches full
// speed after 450 ms, so a short tap is a fine step and a long hold travels.
// goalReach: floor distance at which the exit/receiver W window slows/docks.
export const W_PARAMS = Object.freeze({ rateW: 1.28, nearRateW: 0.50, captureW: 0.12,
  dockMs: 120, rearmW: 0.02, pulseMs: 200, outlineMs: 1600, soundGapMs: 700, toastMs: 1200,
  rampFloor: 0.35, rampMs: 450, goalReach: 1.2 });

export function studyConfig(search) {
  const params = new URLSearchParams(search);
  const enabled = params.get('study') === 'w1';
  return Object.freeze({ enabled, condition: enabled && params.get('wcontrol') === 'b' ? 'b' : 'a',
    requested: params.get('wcontrol'), precise: params.get('wprecise') === '1' });
}

export function nearbyDevices(level, run, dial = run?.dial) {
  if (level?.map !== 'shown' || level.chapter === 2 || !level.field?.relay || !run || run.won) return [];
  const w = dialToW(dial);
  return ['socket', 'latch'].flatMap((id) => {
    const device = level.field.relay[id];
    if (!device || Math.abs(w - device.w) > device.wReach
      || Math.hypot(run.pos[0] - device.x, run.pos[1] - device.z) > device.reach) return [];
    const action = run.canInteract(dial).action;
    const useful = id === 'latch' ? !run.relayLatched
      : run.carrying || (run.socketPowered() && action !== 'blocked');
    return useful ? [{ id, ...device, dial: wToDial(device.w), label: id === 'socket' ? '插座' : '回廊' }] : [];
  });
}

// The exit / receiver W window is public information (its label already says
// "在中间层"), so it may slow and dock even when the map is hidden. It only
// counts while the goal is still meaningful and the player stands near it.
export function nearbyGoal(level, run, dial = run?.dial) {
  const field = level?.field;
  if (level?.kind !== 'walk' || !field?.goalW || !run || run.won || (field.item && !run.carrying)) return null;
  if (Math.hypot(run.pos[0] - field.goal[0], run.pos[1] - field.goal[1]) > W_PARAMS.goalReach) return null;
  const [lo, hi] = field.goalW;
  const w = (lo + hi) / 2;
  const capture = (hi - lo) / 2 + W_PARAMS.captureW;
  if (Math.abs(dialToW(dial) - w) > capture) return null;
  return { id: 'goal', w, capture, dial: wToDial(w), label: field.item ? '接收台' : '出口' };
}

export function nearbyTargets(level, run, dial = run?.dial) {
  const goal = nearbyGoal(level, run, dial);
  return goal ? [...nearbyDevices(level, run, dial), goal] : nearbyDevices(level, run, dial);
}

// No ghost, color center, free core or geometry-event candidates.
// Reject ambiguity BEFORE checking safety; never search for a safer second point.
export function dockingCandidate(level, run, dial = run?.dial) {
  const candidates = nearbyTargets(level, run, dial)
    .filter((d) => Math.abs(dialToW(dial) - d.w) <= (d.capture ?? W_PARAMS.captureW) + 1e-9);
  return candidates.length === 1 && run.canSetDial(candidates[0].dial, dial) ? candidates[0] : null;
}
const stateSignature = (run) => JSON.stringify([run.carrying, run.carrying ? null : run.item, run.relayLatched, run.socketUses, run.won]);

export class WControl {
  source = null;
  inputs = new Map();
  direction = 0;
  state = 'IDLE';
  docking = null;
  eligible = true;
  contact = false;
  safeTravel = 0;
  blockedAt = null;
  heldFor = 0;

  constructor({ dockOnRelease = true } = {}) {
    this.dockOnRelease = dockOnRelease;
  }

  press(source, id, direction = 0) {
    if (this.source !== null && this.source !== source) return false;
    if (this.inputs.has(id)) return false;
    if (this.source === null) {
      this.cancel();
      this.source = source;
    }
    this.inputs.set(id, Math.sign(direction));
    this.updateDirection();
    return true;
  }

  updateDirection() {
    const directions = new Set(this.inputs.values());
    const direction = directions.has(1) && directions.has(-1) ? 0 : directions.has(1) ? 1 : directions.has(-1) ? -1 : 0;
    if (direction !== this.direction) this.heldFor = 0;
    this.direction = direction;
    this.state = this.direction ? 'DRIVING' : 'NEUTRAL';
    this.blockedAt = null;
  }

  next(level, run, seconds, dial = run.dial) {
    this.heldFor += seconds;
    const { rampFloor, rampMs, rateW, nearRateW } = W_PARAMS;
    const rate = rateW * Math.min(1, rampFloor + (1 - rampFloor) * this.heldFor * 1000 / rampMs);
    const speed = nearbyTargets(level, run).length ? Math.min(rate, nearRateW) : rate;
    return clampDial(dial + this.direction * speed / 4 * seconds);
  }

  shouldDrive(run) {
    const b = this.blockedAt;
    return !!this.direction && (!b || b.field !== run.activeField() || b.x !== run.pos[0] || b.z !== run.pos[1] || b.dial !== run.dial || b.direction !== this.direction);
  }

  accepted(run, from, clamped) {
    this.safeTravel += Math.abs(dialToW(run.dial) - dialToW(from));
    let ended = false;
    if (this.contact && this.safeTravel >= W_PARAMS.rearmW - 1e-9) {
      this.contact = false;
      ended = true;
    }
    const started = clamped && !this.contact;
    if (clamped) {
      this.state = 'BLOCKED';
      this.contact = true;
      this.safeTravel = 0;
      this.blockedAt = { field: run.activeField(), x: run.pos[0], z: run.pos[1], dial: run.dial, direction: this.direction };
    } else {
      this.state = this.direction ? 'DRIVING' : 'NEUTRAL';
      this.blockedAt = null;
    }
    return { started, ended };
  }

  release(source, id, level, run) {
    if (this.source !== source || !this.inputs.delete(id)) return false;
    if (this.inputs.size) { this.updateDirection(); return false; }
    this.source = null;
    this.direction = this.heldFor = 0;
    const candidate = this.dockOnRelease && this.eligible ? dockingCandidate(level, run) : null;
    this.docking = candidate && Math.abs(candidate.dial - run.dial) > 1e-9
      ? { ...candidate, from: run.dial, elapsed: 0, signature: stateSignature(run), field: run.activeField() } : null;
    this.state = this.docking ? 'DOCKING' : 'IDLE';
    return true;
  }

  invalidate() {
    this.eligible = false;
    this.docking = null;
    this.blockedAt = null;
    this.state = this.source ? (this.direction ? 'DRIVING' : 'NEUTRAL') : 'IDLE';
  }

  cancel(locked = false) {
    this.source = null;
    this.inputs.clear();
    this.direction = this.heldFor = 0;
    this.docking = null;
    this.eligible = true;
    this.contact = false;
    this.safeTravel = 0;
    this.blockedAt = null;
    this.state = locked ? 'LOCKED' : 'IDLE';
  }

  dockStep(level, run, seconds) {
    const dock = this.docking;
    if (!dock) return null;
    const candidate = dockingCandidate(level, run);
    if (dock.signature !== stateSignature(run) || dock.field !== run.activeField()
      || !candidate || candidate.id !== dock.id || candidate.dial !== dock.dial) {
      this.docking = null;
      this.state = 'IDLE';
      return null;
    }
    dock.elapsed += seconds;
    const t = Math.min(1, dock.elapsed * 1000 / W_PARAMS.dockMs);
    const dial = dock.from + (dock.dial - dock.from) * (t * t * (3 - 2 * t));
    if (t === 1) { this.docking = null; this.state = 'IDLE'; }
    return dial;
  }
}
