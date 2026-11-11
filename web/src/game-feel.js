// Hit-stop + spring feedback layer. Pure game-time logic: the renderer feeds real
// frame dt and gets back the dt the model should advance this frame.
export const HITSTOP_MS = { harmonic_burst: 32, phase_dash_perfect: 22, phase_graze: 28, bridge_landed: 18 };

const MAX_HITSTOP_MS = 35;
const FREEZE_GAP_S = .12;
const SPRING_Z = .55;
const SPRING_W = (2 * Math.PI / .28) / Math.sqrt(1 - SPRING_Z * SPRING_Z);
const SPRING_Z2W = 2 * SPRING_Z * SPRING_W;
const SPRING_LIMIT = .35;
const SUBSTEP = 1 / 120;
const PUNCH_GAIN = 1 / (() => {
  let x = 0, v = 1, peak = 0;
  for (let i = 0; i < 2000; i++) {
    v += (-SPRING_Z2W * v - SPRING_W * SPRING_W * x) * SUBSTEP;
    x += v * SUBSTEP;
    if (x < peak) break;
    peak = x;
  }
  return peak;
})();

export class GameFeel {
  constructor({ reducedMotion = false } = {}) {
    this.reducedMotion = Boolean(reducedMotion);
    this._freeze = 0;
    this._lastFreezeEnd = -Infinity;
    this._clock = 0;
    this._queue = [];
    this._springs = new Map();
  }

  setReducedMotion(flag) {
    this.reducedMotion = Boolean(flag);
    if (this.reducedMotion) { this._freeze = 0; this._queue = []; this._springs.clear(); }
  }

  get frozen() { return this._freeze > 0; }

  trigger(kind, { delay = 0, punches = [] } = {}) {
    if (this.reducedMotion || !HITSTOP_MS[kind]) return false;
    if (delay > 0) { this._queue.push({ kind, delay, punches }); return true; }
    const fired = this._startFreeze(kind);
    this._applyPunches(punches);
    return fired;
  }

  _applyPunches(punches) {
    if (!Array.isArray(punches)) return;
    for (const punch of punches) if (Array.isArray(punch)) this.punch(punch[0], punch[1]);
  }

  _startFreeze(kind) {
    const ms = Math.min(HITSTOP_MS[kind], MAX_HITSTOP_MS);
    if (this._freeze > 0 || this._clock - this._lastFreezeEnd < FREEZE_GAP_S - 1e-9) return false;
    this._freeze = ms / 1000;
    return true;
  }

  punch(key, amount) {
    if (this.reducedMotion || !Number.isFinite(amount)) return;
    let spring = this._springs.get(key);
    if (!spring) { spring = { x: 0, v: 0 }; this._springs.set(key, spring); }
    spring.v += amount * PUNCH_GAIN;
  }

  value(key) {
    const spring = this._springs.get(key);
    return spring ? Math.max(-SPRING_LIMIT, Math.min(SPRING_LIMIT, spring.x)) : 0;
  }

  step(realDt) {
    if (this.reducedMotion) return realDt;
    if (!(realDt > 0)) return 0;
    let gameDt = realDt;
    if (this._freeze > 0) {
      const consumed = Math.min(this._freeze, realDt);
      this._freeze -= consumed;
      gameDt = realDt - consumed;
      if (this._freeze <= 1e-12) { this._freeze = 0; this._lastFreezeEnd = this._clock + consumed; }
    }
    this._clock += realDt;
    if (this._queue.length) {
      const pending = [];
      for (const item of this._queue) {
        item.delay -= gameDt;
        if (item.delay <= 1e-9) { this._startFreeze(item.kind); this._applyPunches(item.punches); } else pending.push(item);
      }
      this._queue = pending;
    }
    if (gameDt > 0) this._integrate(gameDt);
    return gameDt;
  }

  _integrate(dt) {
    const steps = Math.max(1, Math.ceil(dt / SUBSTEP));
    const h = dt / steps;
    for (const [key, spring] of this._springs) {
      for (let i = 0; i < steps; i++) {
        spring.v += (-SPRING_Z2W * spring.v - SPRING_W * SPRING_W * spring.x) * h;
        spring.x += spring.v * h;
      }
      if (Math.abs(spring.x) < 1e-4 && Math.abs(spring.v) < 1e-4) this._springs.delete(key);
      else spring.x = Math.max(-SPRING_LIMIT, Math.min(SPRING_LIMIT, spring.x));
    }
  }

  reset() {
    this._freeze = 0;
    this._queue = [];
    this._springs.clear();
    this._lastFreezeEnd = -Infinity;
  }
}
