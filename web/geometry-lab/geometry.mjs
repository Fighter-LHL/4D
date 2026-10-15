// A normalized dial maps to the physical fourth coordinate W in [-2, 2].
// Every visible sphere is the intersection of a fixed 4D ball with W = constant.
export const DIAL_SPAN = 4;

function finite(value, name) {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  return value;
}

export function clampDial(value) {
  return Math.max(0, Math.min(1, finite(value, 'dial')));
}

export function dialToW(value) {
  return (clampDial(value) - 0.5) * DIAL_SPAN;
}

export function hypersphere(id, center, radius) {
  if (!Array.isArray(center) || center.length !== 4) {
    throw new TypeError('center must contain four coordinates');
  }
  center.forEach((value) => finite(value, 'center coordinate'));
  if (finite(radius, 'radius') <= 0) throw new RangeError('radius must be positive');
  return Object.freeze({ id, center: Object.freeze([...center]), radius });
}

export const SINGLE = hypersphere('single', [0, 1.65, 0, 0], 1.5);
export const TRANSFER = hypersphere('offset', [0, 1.65, 0, 0.45], 1.15);
export const TWINS = Object.freeze([
  hypersphere('left', [-1.2, 1.45, 0, -0.65], 1.15),
  hypersphere('right', [1.2, 1.45, 0, 0.65], 1.15),
]);

export function sliceAtW(body, w) {
  finite(w, 'W');
  const distance = Math.abs(w - body.center[3]);
  // Factored form avoids cancellation near the tangency boundary.
  const radiusSquared = (body.radius - distance) * (body.radius + distance);
  const radius = Math.sqrt(Math.max(0, radiusSquared));
  return {
    id: body.id,
    center: body.center.slice(0, 3),
    radius,
    kind: radiusSquared > 0 ? 'sphere' : (radiusSquared === 0 ? 'point' : 'empty'),
    volume: (4 / 3) * Math.PI * radius ** 3,
  };
}

export function sliceAtDial(body, dial) {
  return sliceAtW(body, dialToW(dial));
}

// Stage C spike: a corridor whose walkable space is decided by the current
// 3D sections alone. Two rows of hyperspheres form walls; each row is centered
// on a different W, so no single slice opens both. A move is legal only when
// the token sphere does not intersect any section sphere.
const WALL_X = 1.3;
const WALL_W = 1.0;
const wall = (id, x, z, w) => hypersphere(id, [x, 0.55, z, w], 1.15);
export const CORRIDOR = Object.freeze({
  start: Object.freeze([-2.2, 0]),
  goal: Object.freeze([2.2, 0]),
  bounds: Object.freeze({ x: 2.55, z: 1.12 }),
  tokenRadius: 0.22,
  tokenY: 0.22,
  bodies: Object.freeze([
    wall('wall-near-left', -WALL_X, -1.05, -WALL_W),
    wall('wall-near-mid', -WALL_X, 0, -WALL_W),
    wall('wall-near-right', -WALL_X, 1.05, -WALL_W),
    wall('wall-far-left', WALL_X, -1.05, WALL_W),
    wall('wall-far-mid', WALL_X, 0, WALL_W),
    wall('wall-far-right', WALL_X, 1.05, WALL_W),
  ]),
});

export function corridorSections(w, level = CORRIDOR) {
  return level.bodies.map((body) => sliceAtW(body, w));
}

// True when the token sphere overlaps any section sphere in 3D.
export function tokenInsideSection(sections, x, z, level = CORRIDOR) {
  const reach = level.tokenRadius;
  return sections.some((section) => {
    if (section.radius <= 0) return false;
    const dx = x - section.center[0];
    const dy = level.tokenY - section.center[1];
    const dz = z - section.center[2];
    const limit = section.radius + reach;
    return dx * dx + dy * dy + dz * dz < limit * limit;
  });
}

export function legalCorridorSpot(sections, x, z, level = CORRIDOR) {
  const marginX = level.bounds.x - level.tokenRadius;
  const marginZ = level.bounds.z - level.tokenRadius;
  if (Math.abs(x) > marginX || Math.abs(z) > marginZ) return false;
  return !tokenInsideSection(sections, x, z, level);
}

// Attempts a move with axis-separated sliding. Returns the furthest legal
// position plus which component (if any) was blocked.
export function moveCorridorToken(sections, from, dx, dz, level = CORRIDOR) {
  if (legalCorridorSpot(sections, from[0] + dx, from[1] + dz, level)) {
    return { x: from[0] + dx, z: from[1] + dz, blocked: null };
  }
  if (dx !== 0 && legalCorridorSpot(sections, from[0] + dx, from[1], level)) {
    return { x: from[0] + dx, z: from[1], blocked: 'z' };
  }
  if (dz !== 0 && legalCorridorSpot(sections, from[0], from[1] + dz, level)) {
    return { x: from[0], z: from[1] + dz, blocked: 'x' };
  }
  return { x: from[0], z: from[1], blocked: 'both' };
}

export const PREDICTIONS = Object.freeze({
  appear: '出现', grow: '变大', shrink: '变小', disappear: '消失', same: '不变',
});

export function classifyChange(before, after) {
  const beforeVisible = before.radius > 0;
  const afterVisible = after.radius > 0;
  if (!beforeVisible && afterVisible) return 'appear';
  if (beforeVisible && !afterVisible) return 'disappear';
  if (Math.abs(before.radius - after.radius) < 1e-9) return 'same';
  return after.radius > before.radius ? 'grow' : 'shrink';
}

export function surfacePoint(section, latitude, longitude) {
  return [
    section.center[0] + section.radius * Math.cos(latitude) * Math.cos(longitude),
    section.center[1] + section.radius * Math.sin(latitude),
    section.center[2] + section.radius * Math.cos(latitude) * Math.sin(longitude),
  ];
}
