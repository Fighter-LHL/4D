import { multiply, polytope, randomRotation } from './geometry.js';
// Moving 3D hazards. Their slice at the player's height is what can hurt.
const TAU = Math.PI * 2;
const rotateX = angle => [[1, 0, 0], [0, Math.cos(angle), -Math.sin(angle)], [0, Math.sin(angle), Math.cos(angle)]];
const CUBE = Array.from({ length: 8 }, (_, i) => [0, 1, 2].map(axis => (i >> axis & 1 ? .5 : -.5)));

export function hazardOffset(h, time) {
  const t = time - (h.born || 0), offset = [0, 0, 0];
  if (h.bob) offset[2] += h.bob.amp * Math.sin(TAU * t / h.bob.period + (h.bob.phase || 0));
  if (h.orbit) { const a = TAU * t / h.orbit.period + (h.orbit.phase || 0); offset[0] += Math.cos(a) * h.orbit.r; offset[1] += Math.sin(a) * h.orbit.r; }
  if (h.velocity) for (let i = 0; i < 3; i++) offset[i] += h.velocity[i] * t;
  return offset;
}

export function hazardSolid(h, time) {
  const offset = hazardOffset(h, time), center = h.center.map((value, i) => value + offset[i]);
  const base = { id: h.id, role: h.role || 'hazard', solid: false, golden: h.golden };
  if (h.kind === 'sphere') return { ...base, kind: 'sphere', center, r: h.r };
  if (h.kind === 'slab') {
    return { ...base, kind: 'prism', polygon: h.polygon.map(([x, y]) => [x + offset[0], y + offset[1]]), z: [center[2] - h.half, center[2] + h.half] };
  }
  if (h.kind === 'cube') {
    const t = time - (h.born || 0), matrix = h.spin ? multiply(h.matrix, rotateX(t * h.spin)) : h.matrix;
    return { ...base, ...polytope(h.id, { center, local: CUBE.map(v => v.map(x => x * h.size)), matrix }), role: base.role, solid: false };
  }
  throw new Error(`Unknown hazard kind: ${h.kind}`);
}

// Vertical extent at a given time, used to retire storm hazards after they pass through.
export function hazardZ(h, time) {
  const z = h.center[2] + hazardOffset(h, time)[2];
  const reach = h.kind === 'sphere' ? h.r : h.kind === 'slab' ? h.half : h.size * .87;
  return [z - reach, z + reach];
}

// Storm: each hazard enters from above or below the slice range and passes
// all the way through it, so it is always visible in the side view first.
export function spawnStormHazard(rng, { id, time, level, bounds, slice }) {
  const speed = (1.1 + rng.range(0, .8)) * (1 + level * .13);
  const down = rng.next() < .6, kinds = level < 1 ? ['sphere', 'sphere', 'slab'] : level < 3 ? ['sphere', 'slab', 'cube'] : ['sphere', 'slab', 'cube', 'cube'];
  const kind = rng.pick(kinds);
  const x = rng.range(2, bounds.w - 2), y = rng.range(2, bounds.h - 2);
  const make = (reach, extra) => {
    const z = down ? slice.max + reach + .05 : slice.min - reach - .05;
    return { id, kind, born: time, center: [x, y, z], velocity: [0, 0, down ? -speed : speed], ...extra };
  };
  if (kind === 'sphere') {
    const r = rng.range(.9, 1.6 + Math.min(level, 4) * .12);
    const drift = level >= 2 && rng.next() < .4 ? rng.range(-1, 1) : 0;
    const h = make(r, { r });
    if (drift) h.velocity = [drift, rng.range(-.6, .6), h.velocity[2]];
    return h;
  }
  if (kind === 'slab') {
    const vertical = rng.next() < .5, length = rng.range(4, 7 + Math.min(level, 4)), width = .55;
    const polygon = vertical
      ? [[x - width / 2, y - length / 2], [x + width / 2, y - length / 2], [x + width / 2, y + length / 2], [x - width / 2, y + length / 2]]
      : [[x - length / 2, y - width / 2], [x + length / 2, y - width / 2], [x + length / 2, y + width / 2], [x - length / 2, y + width / 2]];
    return { ...make(.35, { half: .35, polygon }), center: [0, 0, down ? slice.max + .4 : slice.min - .4] };
  }
  const size = rng.range(1.7, 2.5);
  return make(size * .87, { size, matrix: randomRotation(rng), spin: rng.range(.6, 1.4) * (rng.next() < .5 ? -1 : 1) });
}
