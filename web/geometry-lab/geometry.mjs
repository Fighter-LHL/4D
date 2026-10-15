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

// Chapter 2: a wall whose middle segment (the door) only exists for
// W <= 0.8, plus a second wall that only exists for W >= 0.4. The door is
// open exactly where the second wall stands, so the player must pass the
// door at high W and then lower W again — the door closes behind them.
export const GATE = Object.freeze({
  start: Object.freeze([-2.2, 0]),
  goal: Object.freeze([2.2, 0]),
  bounds: Object.freeze({ x: 2.55, z: 1.12 }),
  tokenRadius: 0.22,
  tokenY: 0.22,
  bodies: Object.freeze([
    hyperbox('gate-north', [0, 0.75, -0.88, 0], [0.14, 0.95, 0.53, 2.2]),
    hyperbox('gate-south', [0, 0.75, 0.88, 0], [0.14, 0.95, 0.53, 2.2]),
    hyperbox('gate-door', [0, 0.75, 0, -0.65], [0.14, 0.95, 0.36, 1.45], true),
    hyperbox('gate-back', [1.4, 0.75, 0, 1.3], [0.14, 0.95, 1.3, 0.9], true),
  ]),
});

// Chapter 2: two sealed rooms. The left room (start) only opens for
// W < -0.8; the right room (goal) only opens for W > -0.4. No single W opens
// both, so the player must step out, park between them and change W again.
const roomWalls = (prefix, cx, w, halfW, alt) => [
  hyperbox(`${prefix}-north`, [cx, 0.75, -0.85, w], [0.97, 0.95, 0.12, halfW], alt),
  hyperbox(`${prefix}-south`, [cx, 0.75, 0.85, w], [0.97, 0.95, 0.12, halfW], alt),
  hyperbox(`${prefix}-west`, [cx - 0.85, 0.75, 0, w], [0.12, 0.95, 0.97, halfW], alt),
  hyperbox(`${prefix}-east`, [cx + 0.85, 0.75, 0, w], [0.12, 0.95, 0.97, halfW], alt),
];
export const TWO_ROOMS = Object.freeze({
  start: Object.freeze([-1.9, 0]),
  goal: Object.freeze([1.9, 0]),
  bounds: Object.freeze({ x: 3.2, z: 1.4 }),
  tokenRadius: 0.22,
  tokenY: 0.22,
  bodies: Object.freeze([
    ...roomWalls('left', -1.9, 0.7, 1.5, false),
    ...roomWalls('right', 1.9, -1.3, 0.9, true),
  ]),
});

export const LEVELS = Object.freeze({ corridor: CORRIDOR, room: ROOM, gate: GATE, rooms: TWO_ROOMS });

// The Flatland chapter reuses a level's (x, z, W) layout but lives entirely
// at the walking height, so each drawn 2D shape is exactly the collision shape.
export function flatVariant(level) {
  const y = level.tokenY;
  const lift = (body) => {
    const center = [body.center[0], y, body.center[2], body.center[3]];
    return body.type === 'box'
      ? hyperbox(body.id, center, [...body.half], body.alt)
      : hypersphere(body.id, center, body.radius, body.alt);
  };
  return Object.freeze({ ...level, flat: true, bodies: Object.freeze(level.bodies.map(lift)) });
}

// The W map: every body cut at a fixed height y, kept over all W. The result
// lives in (x, z, W) and is a plain 3D box or ball, so it can be drawn whole.
export function wFootprint(body, y) {
  finite(y, 'y');
  const [cx, cy, cz, cw] = body.center;
  if (body.type === 'box') {
    return {
      id: body.id, type: 'box', alt: body.alt,
      center: [cx, cz, cw], half: [body.half[0], body.half[2], body.half[3]],
      exists: Math.abs(y - cy) <= body.half[1],
    };
  }
  const dy = Math.abs(y - cy);
  const radiusSquared = (body.radius - dy) * (body.radius + dy);
  return {
    id: body.id, type: 'sphere', alt: body.alt,
    center: [cx, cz, cw], radius: Math.sqrt(Math.max(0, radiusSquared)),
    exists: radiusSquared > 0,
  };
}

// 2D shape of a 3D section at height y (what a Flatlander standing there sees).
export function flatShape(section, y) {
  if (section.kind === 'empty') return null;
  if (section.type === 'box') {
    if (Math.abs(y - section.center[1]) > section.half[1]) return null;
    return { id: section.id, type: 'box', alt: section.alt, center: [section.center[0], section.center[2]], half: [section.half[0], section.half[2]] };
  }
  const dy = Math.abs(y - section.center[1]);
  const radius = Math.sqrt(Math.max(0, (section.radius - dy) * (section.radius + dy)));
  return radius > 0 ? { id: section.id, type: 'sphere', alt: section.alt, center: [section.center[0], section.center[2]], radius } : null;
}

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

// The token may never end up inside a section. For each body, the W in the
// crossed interval closest to its center gives its largest section.
export function wChangeEngulfs(level, pos, fromW, toW) {
  const low = Math.min(fromW, toW);
  const high = Math.max(fromW, toW);
  return level.bodies.some((body) => {
    const w = Math.max(low, Math.min(high, body.center[3]));
    return tokenInsideSection([sliceAtW(body, w)], pos[0], pos[1], level);
  });
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
