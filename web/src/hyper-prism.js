// 4D Polytope Projection, Hyperplane Slicing & In-Canvas Phase Resonance Engine.
// Pure presentation and interactive feedback layer; GameModel remains rule authority.

const TAU = Math.PI * 2;
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const mix = (a, b, t) => a + (b - a) * t;

function buildTesseract() {
  const vertices = [];
  for (let i = 0; i < 16; i++) {
    vertices.push([
      (i & 1) ? 1 : -1,
      (i & 2) ? 1 : -1,
      (i & 4) ? 1 : -1,
      (i & 8) ? 1 : -1,
    ]);
  }
  const edges = [];
  for (let i = 0; i < 16; i++) {
    for (let bit = 0; bit < 4; bit++) {
      const j = i ^ (1 << bit);
      if (i < j) edges.push([i, j]);
    }
  }
  return {
    id: 'tesseract',
    name: '超立方体 · 正八胞体',
    subtitle: '8 个正方体胞 · 16 顶点 · 32 棱',
    description: '四维空间中的正方体。当它沿对角线穿过三维切片 W 时，截面会从点→正四面体→正八面体→六边形柱体连续演化。',
    vertices,
    edges,
  };
}

function buildOrthoplex() {
  const vertices = [];
  for (let axis = 0; axis < 4; axis++) {
    for (const sign of [-1.35, 1.35]) {
      const v = [0, 0, 0, 0];
      v[axis] = sign;
      vertices.push(v);
    }
  }
  const edges = [];
  for (let i = 0; i < vertices.length; i++) {
    for (let j = i + 1; j < vertices.length; j++) {
      if ((i >> 1) !== (j >> 1)) edges.push([i, j]);
    }
  }
  return {
    id: 'orthoplex',
    name: '正十六胞体 · 十字多胞体',
    subtitle: '16 个正四面体胞 · 8 顶点 · 24 棱',
    description: '超立方体的四维对偶体。它在 W 切片中的截面常常呈现锐利的正八面体与交错三角晶格。',
    vertices,
    edges,
  };
}

function build24Cell() {
  const vertices = [];
  // 8 axis vertices (±1.2, 0, 0, 0) + 16 half-tesseract vertices (±0.6, ±0.6, ±0.6, ±0.6)
  for (let axis = 0; axis < 4; axis++) {
    for (const sign of [-1.2, 1.2]) {
      const v = [0, 0, 0, 0];
      v[axis] = sign;
      vertices.push(v);
    }
  }
  for (let i = 0; i < 16; i++) {
    vertices.push([
      (i & 1) ? .6 : -.6,
      (i & 2) ? .6 : -.6,
      (i & 4) ? .6 : -.6,
      (i & 8) ? .6 : -.6,
    ]);
  }
  const edges = [];
  for (let i = 0; i < vertices.length; i++) {
    for (let j = i + 1; j < vertices.length; j++) {
      const d2 = vertices[i].reduce((sum, val, k) => sum + (val - vertices[j][k]) ** 2, 0);
      if (Math.abs(d2 - 1.44) < .08) edges.push([i, j]);
    }
  }
  return {
    id: '24cell',
    name: '正二十四胞体 · 独有四维晶体',
    subtitle: '24 个正八面体胞 · 24 顶点 · 96 棱',
    description: '三维空间中没有对应物的四维独有正多胞体，自对偶结构，切面会绽放繁复的十二边形与星芒截面。',
    vertices,
    edges,
  };
}

export const POLYTOPES = Object.freeze({
  tesseract: buildTesseract(),
  orthoplex: buildOrthoplex(),
  '24cell': build24Cell(),
});

export function rotate4D([x, y, z, w], angles = {}) {
  const { xw = .4, yw = .25, zw = .3, xy = .2, xz = .35 } = angles;
  // XW rotation
  let cx = Math.cos(xw), sx = Math.sin(xw);
  let x1 = x * cx - w * sx, w1 = x * sx + w * cx;
  // YW rotation
  let cy = Math.cos(yw), sy = Math.sin(yw);
  let y1 = y * cy - w1 * sy, w2 = y * sy + w1 * cy;
  // ZW rotation
  let cz = Math.cos(zw), sz = Math.sin(zw);
  let z1 = z * cz - w2 * sz, w3 = z * sz + w2 * cz;
  // XY rotation
  let cxy = Math.cos(xy), sxy = Math.sin(xy);
  let x2 = x1 * cxy - y1 * sxy, y2 = x1 * sxy + y1 * cxy;
  // XZ rotation
  let cxz = Math.cos(xz), sxz = Math.sin(xz);
  let x3 = x2 * cxz - z1 * sxz, z2 = x2 * sxz + z1 * cxz;
  return [x3, y2, z2, w3];
}

export function projectPolytope4D(polytopeId = 'tesseract', { w = .5, time = 0, tiltX = 0, tiltY = 0, radius = 1 } = {}) {
  const poly = POLYTOPES[polytopeId] || POLYTOPES.tesseract;
  const targetW = (clamp(w, 0, 1) - .5) * 2.1; // map [0, 1] -> [-1.05, 1.05]
  const angles = {
    xw: time * .32 + tiltX * .65 + w * 1.1,
    yw: time * .23 + tiltY * .55,
    zw: time * .19 + (w - .5) * .9,
    xy: .28 + tiltX * .25,
    xz: .42 + time * .14 + tiltY * .3,
  };
  const projected = poly.vertices.map((v, index) => {
    const [rx, ry, rz, rw] = rotate4D(v, angles);
    const persp4 = 1 / Math.max(1.35, 2.85 - rw * .55);
    const x3 = rx * persp4, y3 = ry * persp4, z3 = rz * persp4;
    const persp3 = 1 / Math.max(1.2, 2.5 - z3 * .45);
    const sx = x3 * persp3 * radius;
    const sy = (y3 * .82 - z3 * .32) * persp3 * radius;
    const sliceProximity = clamp(1 - Math.abs(rw - targetW) / .75, 0, 1);
    return { index, x: sx, y: sy, z: z3, w: rw, proximity: sliceProximity };
  });

  // Compute exact 4D hyperplane slice intersections along edges where rw crosses targetW
  const intersections = [];
  for (const [aIdx, bIdx] of poly.edges) {
    const a = projected[aIdx], b = projected[bIdx];
    const da = a.w - targetW, db = b.w - targetW;
    if ((da <= 0 && db >= 0) || (da >= 0 && db <= 0)) {
      const denom = Math.abs(b.w - a.w);
      const t = denom < 1e-6 ? .5 : clamp((targetW - a.w) / (b.w - a.w), 0, 1);
      intersections.push({
        x: mix(a.x, b.x, t),
        y: mix(a.y, b.y, t),
        z: mix(a.z, b.z, t),
        edge: [aIdx, bIdx],
      });
    }
  }

  // Order intersection points around their 2D centroid to form a clean slice polygon
  let sliceHull = [];
  if (intersections.length >= 3) {
    const cx = intersections.reduce((s, p) => s + p.x, 0) / intersections.length;
    const cy = intersections.reduce((s, p) => s + p.y, 0) / intersections.length;
    sliceHull = [...intersections].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  }

  return { vertices: projected, edges: poly.edges, sliceHull, intersections, targetW };
}

export const MECHANISM_POLYTOPES = Object.freeze({
  dew: 'tesseract',
  bell: 'orthoplex',
  bloom: '24cell',
  crown: '24cell',
});

export function wrapSignedAngle(rad = 0) {
  if (!Number.isFinite(rad)) return 0;
  let a = ((rad + Math.PI) % TAU + TAU) % TAU - Math.PI;
  if (a === -Math.PI) a = Math.PI;
  return a;
}

export function wrapHalfTurnAngle(rad = 0) {
  if (!Number.isFinite(rad)) return 0;
  let a = ((rad + Math.PI * .5) % Math.PI + Math.PI) % Math.PI - Math.PI * .5;
  if (a === -Math.PI * .5) a = Math.PI * .5;
  return a;
}

export function magnetizeLensW(rawW = .5, layerCenters = [.18, .50, .82], { magnetRadius = .062, strength = .76 } = {}) {
  const safeRaw = clamp(Number.isFinite(rawW) ? rawW : .5, .06, .94);
  let nearestIdx = 0;
  let nearestDist = Infinity;
  for (let i = 0; i < layerCenters.length; i++) {
    const d = Math.abs(safeRaw - layerCenters[i]);
    if (d < nearestDist) {
      nearestDist = d;
      nearestIdx = i;
    }
  }
  const center = layerCenters[nearestIdx] ?? .5;
  const radius = Math.max(.01, magnetRadius);
  const detent = nearestDist <= radius;
  const pull = detent ? (1 - (nearestDist / radius) ** 2) * clamp(strength, 0, 1) : 0;
  const w = clamp(mix(safeRaw, center, pull), .06, .94);
  return {
    rawW: safeRaw,
    w,
    snappedLayer: nearestIdx,
    center,
    detent,
    proximity: clamp(1 - nearestDist / .18, 0, 1),
  };
}

export function projectPolytopeLock(nodeId = 'dew', { w = .5, offsetAngle = 0, time = 0, radius = 32, snapThreshold = .26 } = {}) {
  const polytopeId = MECHANISM_POLYTOPES[nodeId] || 'tesseract';
  const wrapped = wrapHalfTurnAngle(offsetAngle);
  const absErr = Math.abs(wrapped);
  const snapped = absErr <= snapThreshold;
  const effectiveOffset = snapped ? 0 : wrapped;
  const alignment = snapped ? 1 : clamp(1 - absErr / 1.45, 0, 1);
  const safeTime = Number.isFinite(time) ? time : 0;
  const baseW = clamp(Number.isFinite(w) ? w : .5, .14, .86);
  const target = projectPolytope4D(polytopeId, {
    w: baseW,
    time: safeTime * .35,
    tiltX: .22,
    tiltY: -.18,
    radius,
  });
  const phase2 = effectiveOffset * 2;
  const live = projectPolytope4D(polytopeId, {
    w: clamp(baseW + Math.sin(phase2) * .16, .08, .92),
    time: safeTime * .35 + Math.sin(phase2) * 1.35,
    tiltX: .22 + Math.sin(phase2) * .85,
    tiltY: -.18 + (1 - Math.cos(phase2)) * .45,
    radius,
  });
  return {
    polytopeId,
    targetHull: target.sliceHull,
    targetVertices: target.vertices,
    live,
    alignment,
    snapped,
    offsetAngle: effectiveOffset,
  };
}

export const RHYTHM_GATES = Object.freeze([.26, .54, .82]);

export class PhaseResonanceController {
  constructor() {
    this.reset();
  }

  reset() {
    this.streak = 0;
    this.maxStreak = 0;
    this.perfectBeats = 0;
    this.goodBeats = 0;
    this.grazes = 0;
    this.syncTime = 0;
    this.riskyTime = 0;
    this.lastW = null;
    this.lastRoom = -1;
    this.lastSeed = -1;
    this.gateStates = ['pending', 'pending', 'pending'];
    this.activeTravelEdge = null;
    this.grazeStepTriggered = null;
    this.ripples = [];
    this.floatingBeats = [];
    this.modelSummary = null;
  }

  corridor(state) {
    if (!state || state.phase !== 'playing') return null;
    const range = state.range;
    if (!range) return null;
    const width = Math.max(.01, (range.max - range.min) / 2);
    const delta = state.w - range.center;
    const drift = clamp(delta / width, -2, 2);
    const locked = Math.abs(delta) <= width + 1e-6;
    const sweetSpot = Math.abs(delta) <= width * .58 + 1e-6;
    const accuracy = clamp(1 - Math.abs(delta) / width, 0, 1);
    const gateSource = state.travel?.gates || this.gateStates;
    return {
      center: range.center,
      min: range.min,
      max: range.max,
      width,
      delta,
      drift,
      locked,
      sweetSpot,
      accuracy,
      layer: range.layer,
      risky: !!(state.travel?.risky || state.riskMode),
      traversing: !!state.travel,
      progress: state.travel?.progress ?? 0,
      gates: RHYTHM_GATES.map((at, i) => ({
        at,
        status: state.travel?.risky ? (gateSource[i] || 'pending') : 'preview',
      })),
    };
  }

  update(dt, state, { active = true } = {}) {
    const emitted = [];
    if (!state) return emitted;
    if (state.phaseResonance) {
      this.modelSummary = state.phaseResonance;
    }
    if (state.seed !== this.lastSeed) {
      this.reset();
      this.lastSeed = state.seed;
      this.lastRoom = state.room;
      this.lastW = state.w;
      if (state.phaseResonance) this.modelSummary = state.phaseResonance;
    } else if (state.room !== this.lastRoom) {
      this.lastRoom = state.room;
      this.gateStates = ['pending', 'pending', 'pending'];
      this.activeTravelEdge = null;
      this.grazeStepTriggered = null;
      this.ripples.length = 0;
      this.floatingBeats.length = 0;
    }

    // Detect continuous W shift to spawn chromatic prism ripples
    if (this.lastW !== null && Math.abs(state.w - this.lastW) >= .008) {
      const velocity = state.w - this.lastW;
      this.ripples.push({
        w: state.w,
        layer: state.layer ?? 0,
        velocity,
        age: 0,
        duration: .65,
      });
      if (this.ripples.length > 8) this.ripples.shift();
    }
    this.lastW = state.w;

    if (!active || dt <= 0) return emitted;

    for (const ripple of this.ripples) ripple.age += dt;
    this.ripples = this.ripples.filter(r => r.age < r.duration);

    for (const beat of this.floatingBeats) beat.age += dt;
    this.floatingBeats = this.floatingBeats.filter(b => b.age < b.duration);

    // Track risky crossing rhythm gates
    const travel = state.travel;
    if (travel && travel.risky) {
      if (this.activeTravelEdge !== travel.edgeId) {
        this.activeTravelEdge = travel.edgeId;
        this.gateStates = ['pending', 'pending', 'pending'];
      }
      const info = this.corridor(state);
      this.riskyTime += dt;
      if (info?.locked) this.syncTime += dt * (info.sweetSpot ? 1 : .7);

      RHYTHM_GATES.forEach((gatePos, index) => {
        if (this.gateStates[index] === 'pending' && travel.progress >= gatePos) {
          if (info?.sweetSpot) {
            this.gateStates[index] = 'perfect';
            this.streak += 1;
            this.maxStreak = Math.max(this.maxStreak, this.streak);
            this.perfectBeats += 1;
            const beat = {
              type: 'phase_beat',
              rating: 'perfect',
              gateIndex: index,
              progress: gatePos,
              streak: this.streak,
              text: this.streak >= 3 ? `✦ 完美同频 ×${this.streak}` : '✦ 完美同频',
              age: 0,
              duration: 1.05,
            };
            this.floatingBeats.push(beat);
            emitted.push(beat);
          } else if (info?.locked) {
            this.gateStates[index] = 'good';
            this.streak += 1;
            this.maxStreak = Math.max(this.maxStreak, this.streak);
            this.goodBeats += 1;
            const beat = {
              type: 'phase_beat',
              rating: 'good',
              gateIndex: index,
              progress: gatePos,
              streak: this.streak,
              text: '◎ 相位契合',
              age: 0,
              duration: .9,
            };
            this.floatingBeats.push(beat);
            emitted.push(beat);
          } else {
            this.gateStates[index] = 'missed';
            this.streak = 0;
          }
        }
      });
    } else {
      this.activeTravelEdge = null;
      this.gateStates = ['pending', 'pending', 'pending'];
    }

    // Track last-second wave graze (shifting into safe slice with <= 0.78s remaining)
    const wave = state.wave;
    if (wave) {
      const currentLayer = state.layers?.[state.layer];
      const inSafe = wave.safeLayers?.includes(state.layer)
        && currentLayer
        && Math.abs(state.w - currentLayer.center) <= Math.sqrt(.75) * .16 + 1e-9
        && (wave.variant !== 'rift' || wave.entered);
      const stepKey = `${wave.node}:${wave.step}`;
      if (!inSafe) {
        // Arm graze if player is still in danger when remaining time is low
        if (wave.remaining <= .82 && this.grazeStepTriggered !== stepKey) {
          this.grazeArmed = stepKey;
        }
      } else if (this.grazeArmed === stepKey && this.grazeStepTriggered !== stepKey && wave.remaining > .02 && wave.remaining <= .82) {
        this.grazeStepTriggered = stepKey;
        this.grazeArmed = null;
        this.grazes += 1;
        this.streak += 1;
        this.maxStreak = Math.max(this.maxStreak, this.streak);
        const graze = {
          type: 'phase_graze',
          node: wave.node,
          remaining: wave.remaining,
          streak: this.streak,
          text: `⚡ 刹那折光 ${wave.remaining.toFixed(2)}s`,
          age: 0,
          duration: 1.2,
        };
        this.floatingBeats.push(graze);
        emitted.push(graze);
      }
    } else {
      this.grazeArmed = null;
      this.grazeStepTriggered = null;
    }

    return emitted;
  }

  pushBeat(text, rating = 'perfect', duration = 1.05, type = 'phase_beat') {
    if (!text) return null;
    const beat = { type, rating, text, age: 0, duration };
    this.floatingBeats.push(beat);
    if (this.floatingBeats.length > 8) this.floatingBeats.shift();
    return beat;
  }

  onFail() {
    this.streak = 0;
    this.gateStates = ['pending', 'pending', 'pending'];
  }

  summary() {
    if (this.modelSummary && this.perfectBeats === 0 && this.goodBeats === 0 && this.grazes === 0) {
      return { ...this.modelSummary };
    }
    const perfectBeats = Math.max(this.perfectBeats, this.modelSummary?.perfectBeats || 0);
    const goodBeats = Math.max(this.goodBeats, this.modelSummary?.goodBeats || 0);
    const grazes = Math.max(this.grazes, this.modelSummary?.grazes || 0);
    const maxStreak = Math.max(this.maxStreak, this.modelSummary?.maxStreak || 0);
    const streak = this.modelSummary ? this.modelSummary.streak : this.streak;
    const syncPercent = this.modelSummary
      ? this.modelSummary.syncPercent
      : (this.riskyTime > .1 ? Math.round(clamp(this.syncTime / this.riskyTime, 0, 1) * 100) : 100);
    const score = perfectBeats * 3 + goodBeats + grazes * 3 + maxStreak;
    const rank = score >= 12 ? 'S+' : score >= 7 ? 'S' : score >= 3 ? 'A' : 'B';
    return {
      streak,
      maxStreak,
      perfectBeats,
      goodBeats,
      grazes,
      syncPercent,
      rank,
    };
  }
}
