// Courtyard ambience simulation: swaying flora, dust motes and fireflies reacting
// to pointer, ripples and dashes. Pure math, fixed capacity, no allocation in the
// per-frame queries once the sway keys and dust indices are warm.
const MAX_SWAY = 150;
const MAX_DUST = 32;
const MAX_RIPPLES = 4;
const FLIES = 3;
const X0 = 20, X1 = 980, Y0 = 20, Y1 = 630;
const RIPPLE_SPEED = 520, RIPPLE_LIFE = 1.2;
const SWAY_W = 12, SWAY_Z = .55, SWAY_LIMIT = .6;
const DUST_W = 9, DUST_Z = .8;
const FLY_W = 6, FLY_Z = .75;

function hashText(text) {
  let h = 2166136261;
  for (const char of String(text)) { h ^= char.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function seededRng(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
const finite = (...values) => values.every(Number.isFinite);

export class CourtyardLife {
  constructor({ reducedMotion = false, seed = 1 } = {}) {
    this.reducedMotion = Boolean(reducedMotion);
    this.seed = Number.isFinite(seed) ? seed : 1;
    this._signature = undefined;
    this._time = 0;
    this._excite = 0;
    this._cheer = 0;
    this._pointer = { on: false, x: 0, y: 0, vx: 0, vy: 0 };
    // Sway springs, keyed lazily by caller-supplied names.
    this._swayKey = new Map();
    this._swayN = 0;
    this._sx = new Float32Array(MAX_SWAY);
    this._sy = new Float32Array(MAX_SWAY);
    this._sa = new Float32Array(MAX_SWAY);
    this._sv = new Float32Array(MAX_SWAY);
    this._srip = new Int32Array(MAX_SWAY).fill(-1);
    // Dust motes, keyed by integer index.
    this._dustSeen = new Uint8Array(MAX_DUST);
    this._dhx = new Float32Array(MAX_DUST);
    this._dhy = new Float32Array(MAX_DUST);
    this._ddx = new Float32Array(MAX_DUST);
    this._ddy = new Float32Array(MAX_DUST);
    this._dvx = new Float32Array(MAX_DUST);
    this._dvy = new Float32Array(MAX_DUST);
    this._drip = new Int32Array(MAX_DUST).fill(-1);
    this._dustOut = [];
    for (let i = 0; i < MAX_DUST; i++) this._dustOut.push({ dx: 0, dy: 0 });
    this._dustZero = { dx: 0, dy: 0 };
    // Expanding rings.
    this._ripples = [];
    for (let i = 0; i < MAX_RIPPLES; i++) this._ripples.push({ on: false, x: 0, y: 0, r: 0, prev: 0, age: 0, strength: 1, id: 0 });
    this._rippleId = 0;
    // Fireflies: public objects stay a stable shape; motion state lives in parallel arrays.
    this._flies = [];
    for (let i = 0; i < FLIES; i++) this._flies.push({ x: 0, y: 0, lookX: 0, lookY: 0, glow: 0, happy: false });
    this._fhx = new Float32Array(FLIES);
    this._fhy = new Float32Array(FLIES);
    this._fvx = new Float32Array(FLIES);
    this._fvy = new Float32Array(FLIES);
    this._fphase = new Float32Array(FLIES);
    this._ffreq = new Float32Array(FLIES);
    this._frip = new Int32Array(FLIES).fill(-1);
    this.setRoom(undefined, []);
  }

  setReducedMotion(flag) {
    this.reducedMotion = Boolean(flag);
    if (this.reducedMotion) {
      this._sa.fill(0); this._sv.fill(0);
      this._ddx.fill(0); this._ddy.fill(0); this._dvx.fill(0); this._dvy.fill(0);
      for (const ripple of this._ripples) ripple.on = false;
      for (let i = 0; i < FLIES; i++) { this._flies[i].x = this._fhx[i]; this._flies[i].y = this._fhy[i]; this._fvx[i] = 0; this._fvy[i] = 0; }
    }
  }

  setRoom(signature, nodes = []) {
    if (signature === this._signature) return;
    this._signature = signature;
    this._time = 0;
    this._excite = 0;
    this._cheer = 0;
    this._swayKey.clear();
    this._swayN = 0;
    this._sa.fill(0); this._sv.fill(0); this._srip.fill(-1);
    this._dustSeen.fill(0); this._ddx.fill(0); this._ddy.fill(0); this._dvx.fill(0); this._dvy.fill(0); this._drip.fill(-1);
    for (const out of this._dustOut) { out.dx = 0; out.dy = 0; }
    for (const ripple of this._ripples) ripple.on = false;
    this._fvx.fill(0); this._fvy.fill(0); this._frip.fill(-1);
    const rng = seededRng((this.seed ^ hashText(signature)) >>> 0);
    const list = Array.isArray(nodes) ? nodes : [];
    const find = id => list.find(node => node && node.id === id && finite(node.x, node.y));
    const third = find('exit') || find('vault') || find('rift') || list.find(node => node && node.kind !== 'mechanism' && !['hub', 'relay'].includes(node.id) && finite(node.x, node.y));
    const homes = [find('hub'), find('relay'), third];
    for (let i = 0; i < FLIES; i++) {
      const home = homes[i] || { x: 300 + i * 200, y: 320 };
      const angle = rng() * Math.PI * 2;
      const dist = 38 + rng() * 30;
      this._fhx[i] = clamp(home.x + Math.cos(angle) * dist, X0, X1);
      this._fhy[i] = clamp(home.y + Math.sin(angle) * dist, Y0, Y1);
      this._fphase[i] = rng() * Math.PI * 2;
      this._ffreq[i] = .8 + rng() * .5;
      const fly = this._flies[i];
      fly.x = this._fhx[i]; fly.y = this._fhy[i];
      fly.lookX = 0; fly.lookY = 0; fly.glow = .5; fly.happy = false;
    }
  }

  pointer(x, y, vx = 0, vy = 0) {
    if (x === null || x === undefined) { this._pointer.on = false; return; }
    if (!finite(x, y)) return;
    this._pointer.on = true;
    this._pointer.x = x;
    this._pointer.y = y;
    this._pointer.vx = finite(vx) ? vx : 0;
    this._pointer.vy = finite(vy) ? vy : 0;
  }

  ripple(x, y, strength = 1) {
    if (this.reducedMotion || !finite(x, y, strength)) return;
    let slot = this._ripples.find(ripple => !ripple.on);
    if (!slot) slot = this._ripples.reduce((oldest, ripple) => ripple.age > oldest.age ? ripple : oldest, this._ripples[0]);
    this._rippleId += 1;
    slot.on = true;
    slot.x = x; slot.y = y;
    slot.r = 0; slot.prev = 0; slot.age = 0;
    slot.strength = Math.max(0, strength);
    slot.id = this._rippleId;
    this._excite = 1;
  }

  dashPass(x, y, ux, uy) {
    if (this.reducedMotion || !finite(x, y, ux, uy)) return;
    this._applyDash(x, y, ux, uy);
    this._excite = 1;
  }

  _applyDash(x, y, ux, uy) {
    for (let i = 0; i < this._swayN; i++) {
      const dx = this._sx[i] - x, dy = this._sy[i] - y;
      const d = Math.hypot(dx, dy);
      if (d < 90) this._sv[i] += (1 - d / 90) * 2.6 * Math.sign(ux * (dy || 1) - uy * (dx || 1) || 1);
    }
    for (let i = 0; i < MAX_DUST; i++) {
      if (!this._dustSeen[i]) continue;
      const dx = this._dhx[i] + this._ddx[i] - x, dy = this._dhy[i] + this._ddy[i] - y;
      const d = Math.hypot(dx, dy);
      if (d < 90) {
        const push = (1 - d / 90) * 200;
        this._dvx[i] += ux * push;
        this._dvy[i] += uy * push;
      }
    }
    for (let i = 0; i < FLIES; i++) {
      const dx = this._flies[i].x - x, dy = this._flies[i].y - y;
      const d = Math.hypot(dx, dy);
      if (d < 90) {
        const push = (1 - d / 90) * 150;
        this._fvx[i] += ux * push;
        this._fvy[i] += uy * push;
      }
    }
  }

  cheer(seconds = 1.1) {
    if (!finite(seconds) || seconds <= 0) return;
    this._cheer = Math.max(this._cheer, seconds);
    this._excite = 1;
  }

  swayAngle(key, x, y) {
    if (this.reducedMotion) return 0;
    let index = this._swayKey.get(key);
    if (index === undefined) {
      if (this._swayN >= MAX_SWAY || !finite(x, y)) return 0;
      index = this._swayN++;
      this._swayKey.set(key, index);
      this._sx[index] = x;
      this._sy[index] = y;
      this._sa[index] = 0;
      this._sv[index] = 0;
    }
    return this._sa[index];
  }

  dustOffset(index, x, y) {
    if (this.reducedMotion || !Number.isInteger(index) || index < 0 || index >= MAX_DUST) return this._dustZero;
    if (!this._dustSeen[index]) {
      if (!finite(x, y)) return this._dustZero;
      this._dustSeen[index] = 1;
      this._dhx[index] = x;
      this._dhy[index] = y;
    }
    const out = this._dustOut[index];
    out.dx = this._ddx[index];
    out.dy = this._ddy[index];
    return out;
  }

  get fireflies() { return this._flies; }
  get cheering() { return this._cheer > 0; }

  update(dt, player) {
    if (!finite(dt) || dt <= 0) return;
    this._time += dt;
    if (this._cheer > 0) this._cheer = Math.max(0, this._cheer - dt);
    const target = player && finite(player.x, player.y) ? player : null;
    for (const ripple of this._ripples) {
      if (!ripple.on) continue;
      ripple.prev = ripple.r;
      ripple.r += RIPPLE_SPEED * dt;
      ripple.age += dt;
      if (ripple.age >= RIPPLE_LIFE) ripple.on = false;
    }
    this._excite = Math.max(0, this._excite - dt / 1.1);
    if (this._excite < 1e-3) this._excite = 0;
    const steps = Math.max(1, Math.ceil(dt / (1 / 60)));
    const h = dt / steps;
    for (let step = 0; step < steps; step++) this._substep(h, target);
    for (const fly of this._flies) fly.happy = this._cheer > 0;
    this._look(dt, target);
  }

  _look(dt, player) {
    if (!player) return;
    const blend = Math.min(1, dt * 6);
    for (const fly of this._flies) {
      const dx = player.x - fly.x, dy = player.y - fly.y;
      const d = Math.hypot(dx, dy);
      if (d < 1e-3) continue;
      fly.lookX = clamp(fly.lookX + (dx / d - fly.lookX) * blend, -1, 1);
      fly.lookY = clamp(fly.lookY + (dy / d - fly.lookY) * blend, -1, 1);
      if (Math.abs(dx / d - fly.lookX) < 1e-3) fly.lookX = dx / d;
      if (Math.abs(dy / d - fly.lookY) < 1e-3) fly.lookY = dy / d;
    }
  }

  _substep(h, player) {
    const p = this._pointer;
    const pSpeed = p.on ? Math.hypot(p.vx, p.vy) : 0;
    const swayK2 = 2 * SWAY_Z * SWAY_W, swayW2 = SWAY_W * SWAY_W;
    for (let i = 0; !this.reducedMotion && i < this._swayN; i++) {
      let force = -swayK2 * this._sv[i] - swayW2 * this._sa[i];
      if (p.on) {
        const dx = this._sx[i] - p.x, dy = this._sy[i] - p.y;
        const d = Math.hypot(dx, dy);
        if (d < 60 && d > 1e-3) force += (1 - d / 60) * pSpeed * .006 * Math.sign(p.vx * dy - p.vy * dx || 1);
      }
      if (player) {
        const dx = this._sx[i] - player.x, dy = this._sy[i] - player.y;
        const d = Math.hypot(dx, dy);
        if (d < 55 && d > 1e-3) force += (1 - d / 55) * .8 * Math.sign(dx || 1);
      }
      this._sv[i] += force * h;
      this._sa[i] = clamp(this._sa[i] + this._sv[i] * h, -SWAY_LIMIT, SWAY_LIMIT);
      if (Math.abs(this._sa[i]) < 1e-4 && Math.abs(this._sv[i]) < 1e-4) { this._sa[i] = 0; this._sv[i] = 0; }
    }
    const dustK2 = 2 * DUST_Z * DUST_W, dustW2 = DUST_W * DUST_W;
    for (let i = 0; !this.reducedMotion && i < MAX_DUST; i++) {
      if (!this._dustSeen[i]) continue;
      let fx = -dustK2 * this._dvx[i] - dustW2 * this._ddx[i];
      let fy = -dustK2 * this._dvy[i] - dustW2 * this._ddy[i];
      if (p.on) {
        const dx = this._dhx[i] + this._ddx[i] - p.x, dy = this._dhy[i] + this._ddy[i] - p.y;
        const d = Math.hypot(dx, dy);
        if (d < 110 && d > 1e-3) {
          const push = (1 - d / 110) * (60 + pSpeed * .12) / d;
          fx += dx * push;
          fy += dy * push;
        }
      }
      this._dvx[i] += fx * h;
      this._dvy[i] += fy * h;
      this._ddx[i] = clamp(this._ddx[i] + this._dvx[i] * h, -120, 120);
      this._ddy[i] = clamp(this._ddy[i] + this._dvy[i] * h, -120, 120);
      if (Math.abs(this._ddx[i]) < 1e-4 && Math.abs(this._ddy[i]) < 1e-4 && Math.abs(this._dvx[i]) < 1e-4 && Math.abs(this._dvy[i]) < 1e-4) {
        this._ddx[i] = 0; this._ddy[i] = 0; this._dvx[i] = 0; this._dvy[i] = 0;
      }
      const out = this._dustOut[i];
      out.dx = this._ddx[i]; out.dy = this._ddy[i];
    }
    const flyK2 = 2 * FLY_Z * FLY_W, flyW2 = FLY_W * FLY_W;
    for (let i = 0; i < FLIES; i++) {
      const fly = this._flies[i];
      if (this.reducedMotion) { fly.x = this._fhx[i]; fly.y = this._fhy[i]; this._fvx[i] = 0; this._fvy[i] = 0; continue; }
      let fx = (this._fhx[i] - fly.x) * flyW2 - this._fvx[i] * flyK2;
      let fy = (this._fhy[i] - fly.y) * flyW2 - this._fvy[i] * flyK2;
      if (this._excite > 0) {
        fx += Math.sin(this._time * this._ffreq[i] * 2 + this._fphase[i]) * 26 * this._excite;
        fy += Math.cos(this._time * this._ffreq[i] * 2.4 + this._fphase[i] * 1.7) * 26 * this._excite;
      }
      if (p.on) {
        let dx = fly.x - p.x, dy = fly.y - p.y;
        let d = Math.hypot(dx, dy);
        if (d < 95) {
          if (d < 1e-3) { dx = Math.cos(this._fphase[i]); dy = Math.sin(this._fphase[i]); d = 1; }
          const push = (1 - d / 95) * 1600 / d;
          fx += dx * push;
          fy += dy * push;
        }
      }
      this._fvx[i] += fx * h;
      this._fvy[i] += fy * h;
      fly.x += this._fvx[i] * h;
      fly.y += this._fvy[i] * h;
      if (p.on) {
        let dx = fly.x - p.x, dy = fly.y - p.y;
        let d = Math.hypot(dx, dy);
        if (d < 70) {
          if (d < 1e-3) { dx = Math.cos(this._fphase[i]); dy = Math.sin(this._fphase[i]); d = 1; }
          fly.x = p.x + dx / d * 70;
          fly.y = p.y + dy / d * 70;
        }
      }
      fly.x = clamp(fly.x, X0, X1);
      fly.y = clamp(fly.y, Y0, Y1);
      if (this._excite === 0 && Math.abs(this._fhx[i] - fly.x) < 1e-3 && Math.abs(this._fhy[i] - fly.y) < 1e-3
        && Math.abs(this._fvx[i]) < 1e-3 && Math.abs(this._fvy[i]) < 1e-3) {
        fly.x = this._fhx[i]; fly.y = this._fhy[i]; this._fvx[i] = 0; this._fvy[i] = 0;
      }
      fly.glow = clamp(.45 + .3 * Math.sin(this._time * this._ffreq[i] * 2 + this._fphase[i]) + (fly.happy ? .25 : 0), 0, 1);
    }
    // Ripple fronts kick each body exactly once as they pass.
    for (const ripple of this._ripples) {
      if (!ripple.on) continue;
      for (let i = 0; i < this._swayN; i++) {
        if (this._srip[i] === ripple.id) continue;
        let dx = this._sx[i] - ripple.x, dy = this._sy[i] - ripple.y;
        const d = Math.hypot(dx, dy);
        if (d <= ripple.r) {
          this._srip[i] = ripple.id;
          const dir = Math.max(d, 1e-3);
          this._sv[i] += ripple.strength * 2 * ((dx - dy) / dir || (i % 2 ? -1 : 1));
        }
      }
      for (let i = 0; i < MAX_DUST; i++) {
        if (!this._dustSeen[i] || this._drip[i] === ripple.id) continue;
        let dx = this._dhx[i] + this._ddx[i] - ripple.x, dy = this._dhy[i] + this._ddy[i] - ripple.y;
        const d = Math.hypot(dx, dy);
        if (d <= ripple.r) {
          this._drip[i] = ripple.id;
          const push = ripple.strength * 170;
          if (d < 1e-3) {
            this._dvx[i] += Math.cos(i * 2.399963) * push;
            this._dvy[i] += Math.sin(i * 2.399963) * push;
          } else {
            this._dvx[i] += dx / d * push;
            this._dvy[i] += dy / d * push;
          }
        }
      }
      for (let i = 0; i < FLIES; i++) {
        if (this._frip[i] === ripple.id) continue;
        let dx = this._flies[i].x - ripple.x, dy = this._flies[i].y - ripple.y;
        const d = Math.hypot(dx, dy);
        if (d <= ripple.r) {
          this._frip[i] = ripple.id;
          const push = ripple.strength * 150;
          if (d < 1e-3) {
            this._fvx[i] += Math.cos(this._fphase[i]) * push;
            this._fvy[i] += Math.sin(this._fphase[i]) * push;
          } else {
            this._fvx[i] += dx / d * push;
            this._fvy[i] += dy / d * push;
          }
        }
      }
    }
  }
}
