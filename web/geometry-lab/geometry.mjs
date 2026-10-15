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

export function hypersphere(id, center, radius, alt = false) {
  if (!Array.isArray(center) || center.length !== 4) {
    throw new TypeError('center must contain four coordinates');
  }
  center.forEach((value) => finite(value, 'center coordinate'));
  if (finite(radius, 'radius') <= 0) throw new RangeError('radius must be positive');
  return Object.freeze({ id, type: 'sphere', center: Object.freeze([...center]), radius, alt });
}

export function hyperbox(id, center, half, alt = false) {
  if (!Array.isArray(center) || center.length !== 4) {
    throw new TypeError('center must contain four coordinates');
  }
  if (!Array.isArray(half) || half.length !== 4) {
    throw new TypeError('half extents must contain four coordinates');
  }
  center.forEach((value) => finite(value, 'center coordinate'));
  half.forEach((value) => {
    if (finite(value, 'half extent') <= 0) throw new RangeError('half extents must be positive');
  });
  return Object.freeze({ id, type: 'box', center: Object.freeze([...center]), half: Object.freeze([...half]), alt });
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
  if (body.type === 'box') {
    // A 4D box slice does not shrink: it is either the full 3D box or nothing.
    const exists = distance <= body.half[3];
    return {
      id: body.id,
      type: 'box',
      alt: body.alt,
      center: body.center.slice(0, 3),
      half: body.half.slice(0, 3),
      radius: 0,
      kind: exists ? 'box' : 'empty',
      volume: exists ? 8 * body.half[0] * body.half[1] * body.half[2] : 0,
    };
  }

  // Factored form avoids cancellation near the tangency boundary.
  const radiusSquared = (body.radius - distance) * (body.radius + distance);
  const radius = Math.sqrt(Math.max(0, radiusSquared));
  return {
    id: body.id,
    type: 'sphere',
    alt: body.alt,
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
// 3D sections alone. Two 4D box walls live on different W intervals, so no
// single slice opens both. A wandering sphere in the middle punishes careless
// W slides: it can grow over the token. A move is legal only when the token
// sphere does not intersect any section body.
export const CORRIDOR = Object.freeze({
  start: Object.freeze([-2.2, 0]),
  goal: Object.freeze([2.2, 0]),
  bounds: Object.freeze({ x: 2.55, z: 1.12 }),
  tokenRadius: 0.22,
  tokenY: 0.22,
  bodies: Object.freeze([
    hyperbox('wall-near', [-1.3, 0.75, 0, -1.0], [0.14, 0.95, 1.3, 1.1]),
    hyperbox('wall-far', [1.3, 0.75, 0, 1.0], [0.14, 0.95, 1.3, 1.1], true),
    hypersphere('pillar', [0, 0.55, -0.55, 0], 0.5, true),
  ]),
});

// Stage D spike: a room sealed in 3D at W = 0. Four 4D box panels form the
// walls; all share the same W interval, so sliding |W| away removes the whole
// room at once. There is no 3D exit — the only way out is through the fourth
// dimension.
export const ROOM = Object.freeze({
  start: Object.freeze([0, 0]),
  goal: Object.freeze([3.1, 0]),
  bounds: Object.freeze({ x: 3.4, z: 2.2 }),
  tokenRadius: 0.22,
  tokenY: 0.22,
  bodies: Object.freeze([
    hyperbox('room-north', [0, 0.75, -1.5, 0], [1.64, 0.95, 0.14, 0.9]),
    hyperbox('room-south', [0, 0.75, 1.5, 0], [1.64, 0.95, 0.14, 0.9]),
    hyperbox('room-west', [-1.5, 0.75, 0, 0], [0.14, 0.95, 1.64, 0.9]),
    hyperbox('room-east', [1.5, 0.75, 0, 0], [0.14, 0.95, 1.64, 0.9]),
  ]),
});

export const LEVELS = Object.freeze({ corridor: CORRIDOR, room: ROOM });

export function corridorSections(w, level = CORRIDOR) {
  return level.bodies.map((body) => sliceAtW(body, w));
}

// True when the token sphere overlaps a single section body in 3D.
export function sectionContains(section, x, z, level = CORRIDOR) {
  if (section.type === 'box') {
    if (section.kind !== 'box') return false;
    const qx = Math.max(section.center[0] - section.half[0], Math.min(section.center[0] + section.half[0], x));
    const qy = Math.max(section.center[1] - section.half[1], Math.min(section.center[1] + section.half[1], level.tokenY));
    const qz = Math.max(section.center[2] - section.half[2], Math.min(section.center[2] + section.half[2], z));
    const dx = x - qx;
    const dy = level.tokenY - qy;
    const dz = z - qz;
    return dx * dx + dy * dy + dz * dz < level.tokenRadius * level.tokenRadius;
  }
  if (section.radius <= 0) return false;
  const dx = x - section.center[0];
  const dy = level.tokenY - section.center[1];
  const dz = z - section.center[2];
  const limit = section.radius + level.tokenRadius;
  return dx * dx + dy * dy + dz * dz < limit * limit;
}

export function tokenInsideSection(sections, x, z, level = CORRIDOR) {
  return sections.some((section) => sectionContains(section, x, z, level));
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
