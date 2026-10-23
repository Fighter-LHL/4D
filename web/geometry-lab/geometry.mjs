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
    const margin = body.half[3] - distance;
    const exists = margin >= 0;
    const wEdge = exists ? Math.min(1, margin / Math.min(0.35, body.half[3])) : 0;
    const wGhost = !exists && margin > -0.32 ? 1 + margin / 0.32 : 0;
    return {
      id: body.id,
      type: 'box',
      alt: body.alt,
      center: body.center.slice(0, 3),
      half: body.half.slice(0, 3),
      radius: 0,
      kind: exists ? 'box' : 'empty',
      volume: exists ? 8 * body.half[0] * body.half[1] * body.half[2] : 0,
      wEdge,
      wGhost,
    };
  }

  // Factored form avoids cancellation near the tangency boundary.
  const radiusSquared = (body.radius - distance) * (body.radius + distance);
  const radius = Math.sqrt(Math.max(0, radiusSquared));
  const margin = body.radius - distance;
  const wEdge = margin > 0 ? Math.min(1, margin / Math.min(0.35, body.radius)) : 0;
  const wGhost = margin <= 0 && margin > -0.32 ? 1 + margin / 0.32 : 0;
  return {
    id: body.id,
    type: 'sphere',
    alt: body.alt,
    center: body.center.slice(0, 3),
    radius,
    kind: radiusSquared > 0 ? 'sphere' : (radiusSquared === 0 ? 'point' : 'empty'),
    volume: (4 / 3) * Math.PI * radius ** 3,
    wEdge,
    wGhost,
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
  goalW: Object.freeze([-0.25, 0.25]),
  bounds: Object.freeze({ x: 2.55, z: 1.12 }),
  tokenRadius: 0.22,
  tokenY: 0.22,
  bodies: Object.freeze([
    hyperbox('wall-near', [-1.3, 0.75, 0, -1.0], [0.14, 0.95, 1.3, 1.1]),
    hyperbox('wall-far', [1.3, 0.75, 0, 1.0], [0.14, 0.95, 1.3, 1.1], true),
    hypersphere('pillar', [0, 0.55, -0.55, 0], 0.5, true),
  ]),
});

// Chapter 1's 3D corridor keeps Flatland's (x, z, W) walls and north pillar,
// and adds a high-hovering 4D sphere on the south-east of the middle chamber:
// when W rises to open the near wall, the sphere descends from above to block
// the south shortcut, so the player must weave to the north-east pocket where
// the purple pillar has shrunk before lowering W.
export const CORRIDOR_3D = Object.freeze({
  ...CORRIDOR,
  bodies: Object.freeze([
    ...CORRIDOR.bodies,
    hypersphere('arch', [0.35, 0.78, 0.52, 0.42], 0.68, true),
  ]),
});

// Stage D spike: a room sealed in 3D at W = 0. Four 4D box panels form the
// walls; all share the same W interval, so sliding |W| away removes the whole
// room at once. There is no 3D exit — the only way out is through the fourth
// dimension.
export const ROOM = Object.freeze({
  start: Object.freeze([0, 0]),
  goal: Object.freeze([3.1, 0]),
  goalW: Object.freeze([-0.25, 0.25]),
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

// Chapter 1's 3D room adds two hovering sentinel spheres outside the east wall
// at W = +-1.05: when the player shifts |W| > 0.9 to erase the room, the
// sentinel on that side descends into the yard between the room and the exit,
// so the player must curve around it before returning W to the middle layer.
export const ROOM_3D = Object.freeze({
  ...ROOM,
  bodies: Object.freeze([
    ...ROOM.bodies,
    hypersphere('room-orb-n', [2.3, 0.76, -0.55, 1.05], 0.78, true),
    hypersphere('room-orb-s', [2.3, 0.76, 0.55, -1.05], 0.78, false),
  ]),
});

// Chapter 2: a wall whose middle segment (the door) only exists for
// W <= 0.8, plus a second wall that only exists for W >= 0.4. The door is
// open exactly where the second wall stands, so the player must pass the
// door at high W and then lower W again — the door closes behind them.
export const GATE = Object.freeze({
  start: Object.freeze([-2.2, 0]),
  goal: Object.freeze([2.2, 0]),
  goalW: Object.freeze([-0.25, 0.25]),
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
// W < -0.4; the right room (goal) only opens for W > 0.4. Both stand at
// W = 0, so the player sees them both, but no single W opens both: step out,
// park between them and change W again.
const roomWalls = (prefix, cx, w, halfW, alt) => [
  hyperbox(`${prefix}-north`, [cx, 0.75, -0.85, w], [0.97, 0.95, 0.12, halfW], alt),
  hyperbox(`${prefix}-south`, [cx, 0.75, 0.85, w], [0.97, 0.95, 0.12, halfW], alt),
  hyperbox(`${prefix}-west`, [cx - 0.85, 0.75, 0, w], [0.12, 0.95, 0.97, halfW], alt),
  hyperbox(`${prefix}-east`, [cx + 0.85, 0.75, 0, w], [0.12, 0.95, 0.97, halfW], alt),
];
export const TWO_ROOMS = Object.freeze({
  start: Object.freeze([-1.9, 0]),
  goal: Object.freeze([1.9, 0]),
  goalW: Object.freeze([-0.25, 0.25]),
  bounds: Object.freeze({ x: 3.2, z: 1.4 }),
  tokenRadius: 0.22,
  tokenY: 0.22,
  bodies: Object.freeze([
    ...roomWalls('left', -1.9, 0.9, 1.3, false),
    ...roomWalls('right', 1.9, -0.9, 1.3, true),
  ]),
});

// Chapter 2: hyperspheres with staggered W centers. Each gate only opens in a
// middle W window (-0.82..-0.30 on the left, +0.30..+0.82 on the right):
// pulling W all the way to +-2 makes the deep guard spheres swell and seal the
// corridor again, so the player must tune W to the gap rather than slamming
// the slider to the ends.
export const TIDAL = Object.freeze({
  start: Object.freeze([-2.6, 0]),
  goal: Object.freeze([2.6, 0]),
  goalW: Object.freeze([-0.25, 0.25]),
  bounds: Object.freeze({ x: 3.0, z: 0.96 }),
  tokenRadius: 0.22,
  tokenY: 0.22,
  bodies: Object.freeze([
    hypersphere('tide-nw', [-1.4, 0.5, -0.52, 0.98], 1.24, true),
    hypersphere('tide-sw', [-1.4, 0.5, 0.52, 0.9], 1.18, true),
    hypersphere('tide-w-deep', [-1.4, 0.5, 0, -1.55], 0.88, false),
    hypersphere('tide-core', [0, 0.5, -0.35, 0], 0.5, false),
    hypersphere('tide-ne', [1.4, 0.5, -0.52, -0.9], 1.18, false),
    hypersphere('tide-se', [1.4, 0.5, 0.52, -0.98], 1.24, false),
    hypersphere('tide-e-deep', [1.4, 0.5, 0, 1.55], 0.88, true),
  ]),
});

// Chapter 2 finale: a three-chamber stepping-stone maze where every body is
// visible at W = 0. The west divider only opens on the south in +W and the
// east divider only opens on the north in -W, while the entry half of each
// chamber is guarded in the next W by an expanding sphere — forcing an S-curve
// across safe stepping-stone islands before each W shift.
export const ISLANDS = Object.freeze({
  start: Object.freeze([-2.35, -0.75]),
  goal: Object.freeze([2.25, 0.75]),
  goalW: Object.freeze([-0.25, 0.25]),
  bounds: Object.freeze({ x: 2.75, z: 1.35 }),
  tokenRadius: 0.22,
  tokenY: 0.22,
  bodies: Object.freeze([
    hypersphere('isl-nw-guard', [-1.65, 0.55, -0.68, 0.88], 0.94, true),
    hyperbox('isl-wall-wn', [-0.85, 0.75, -0.68, 0], [0.13, 0.95, 0.68, 2.2], false),
    hyperbox('isl-door-ws', [-0.85, 0.75, 0.68, -0.78], [0.13, 0.95, 0.68, 1.23], false),
    hypersphere('isl-sc-guard', [0, 0.55, 0.72, -0.85], 1.02, false),
    hypersphere('isl-core', [0, 0.55, 0, 0], 0.52, false),
    hyperbox('isl-door-en', [0.85, 0.75, -0.68, 0.78], [0.13, 0.95, 0.68, 1.23], true),
    hyperbox('isl-wall-es', [0.85, 0.75, 0.68, 0], [0.13, 0.95, 0.68, 2.2], false),
    hypersphere('isl-ne-guard', [1.75, 0.55, -0.68, 0.65], 0.88, true),
  ]),
});

// A small, independent slice toy before the station. The west yard stays
// outside every body's swept volume. Permanent side walls narrow the east
// passage: a warm-offset ball grows across it and a middle-W slab closes it.
// After passing the slab, the player must return to goalW beyond its footprint.
// No item, relay or authored route participates in collision.
export const GATE_ROOM = Object.freeze({
  start: Object.freeze([-2.35, 0]),
  goal: Object.freeze([2.85, 0]),
  goalW: Object.freeze([-0.25, 0.25]),
  bounds: Object.freeze({ x: 3.35, z: 1.65 }),
  tokenRadius: 0.22,
  tokenY: 0.22,
  bodies: Object.freeze([
    hyperbox('gate-north', [0.65, 0.65, -1.2, 0], [1.65, 0.85, 0.55, 2.2]),
    hyperbox('gate-south', [0.65, 0.65, 1.2, 0], [1.65, 0.85, 0.55, 2.2]),
    hypersphere('gate-orb', [0, 0.55, 0, 0.8], 0.95, true),
    hyperbox('gate-phase-wall', [1.55, 0.75, 0, 0], [0.13, 0.95, 0.66, 0.55]),
  ]),
});

// Standalone scenario "无门取物": the player starts in the west yard outside a
// sealed room containing a 4D object. The west door opens in -W, but its jambs
// leave a half-gap of 0.33: wide enough for an empty-handed player (r = 0.22),
// too narrow when carrying the object (r = 0.40). Inside, a +W guard sphere
// blocks shifting directly to +W at the pickup spot while carrying, so the
// player must step to the south side of the room (or set the object down first)
// before shifting to +W where the wide south wall opens.
export const FETCH_ROOM = Object.freeze({
  start: Object.freeze([-2.15, 0]),
  goal: Object.freeze([-1.85, 0.95]),
  goalW: Object.freeze([-0.25, 0.25]),
  bounds: Object.freeze({ x: 3.1, z: 2.15 }),
  tokenRadius: 0.22,
  carriedRadius: 0.40,
  tokenY: 0.22,
  item: Object.freeze({
    id: 'relic',
    start: Object.freeze([0.85, 0, 0]),
    y: 0.30,
    radius: 0.22,
    wReach: 0.75,
    pickupRadius: 0.58,
  }),
  bodies: Object.freeze([
    hyperbox('fetch-west-n', [-0.3, 0.75, -1.24, 0], [0.12, 0.95, 0.91, 2.2], false),
    hyperbox('fetch-west-s', [-0.3, 0.75, 0.70, 0], [0.12, 0.95, 0.37, 2.2], false),
    hyperbox('fetch-west-door', [-0.3, 0.75, 0, 0.80], [0.12, 0.95, 0.33, 1.35], false),
    hyperbox('fetch-north', [0.85, 0.75, -0.95, 0], [1.03, 0.95, 0.12, 2.2], false),
    hyperbox('fetch-east', [2.0, 0.75, -0.54, 0], [0.12, 0.95, 1.61, 2.2], false),
    hyperbox('fetch-south', [0.85, 0.75, 0.95, -0.65], [1.03, 0.95, 0.12, 1.35], true),
    hypersphere('fetch-room-orb', [0.85, 0.55, -0.73, 0.95], 0.50, true),
  ]),
});

// Relay station: two gaps in a divider that spans every W. The north gap
// needs power AND a +W slice; the south gap stays shut until its east-side
// latch is released. Both gates are actual bodies, removed when opened.
export const STATION_ROOM = Object.freeze({
  start: Object.freeze([-2.55, 0.9]),
  goal: Object.freeze([2.55, 1.25]),
  goalW: Object.freeze([-0.25, 0.25]),
  bounds: Object.freeze({ x: 3.35, z: 2.4 }),
  tokenRadius: 0.22,
  carriedRadius: 0.40,
  tokenY: 0.22,
  item: Object.freeze({ id: 'relay-core', start: Object.freeze([-1.8, 0.4, 0]), y: 0.30, radius: 0.22, wReach: 0.75, pickupRadius: 0.58 }),
  relay: Object.freeze({
    socket: Object.freeze({ x: -1.7, z: -1.2, w: -1.1, wReach: 0.25, reach: 0.58 }),
    latch: Object.freeze({ x: 1.15, z: 1.0, w: 0, wReach: 0.30, reach: 0.58 }),
    poweredGate: 'station-power-door',
    shortcutGate: 'station-return-door',
  }),
  bodies: Object.freeze([
    hyperbox('station-divider-n', [0, 0.75, -2.0, 0], [0.16, 0.95, 0.4, 2.2]),
    hyperbox('station-divider-mid', [0, 0.75, -0.1, 0], [0.16, 0.95, 0.5, 2.2]),
    hyperbox('station-divider-s', [0, 0.75, 2.0, 0], [0.16, 0.95, 0.4, 2.2]),
    hyperbox('station-power-door', [0, 0.75, -1.1, 0], [0.16, 0.95, 0.5, 2.2], true),
    hyperbox('station-phase-door', [0, 0.75, -1.1, -0.65], [0.17, 0.95, 0.5, 1.35]),
    hyperbox('station-return-door', [0, 0.75, 1.0, 0], [0.16, 0.95, 0.6, 2.2], true),
  ]),
});

// A separate station with two transport plans. The middle entrance and exit
// never open at the same W. Between them is a roomy, reversible W-change bay.
// The powered north passage / persistent south passage remain another plan.
// Collision still comes only from the actual sections, without route flags.
export const STATION_ROUTES_ROOM = Object.freeze({
  ...STATION_ROOM,
  start: Object.freeze([-1.9, 0.25]),
  goal: Object.freeze([3.0, 1.65]),
  bounds: Object.freeze({ x: 3.7, z: 2.8 }),
  item: Object.freeze({ ...STATION_ROOM.item, start: Object.freeze([-1.25, 0, 0]) }),
  relay: Object.freeze({
    ...STATION_ROOM.relay,
    socket: Object.freeze({ ...STATION_ROOM.relay.socket, x: -0.95, z: -1.65 }),
    latch: Object.freeze({ ...STATION_ROOM.relay.latch, x: 0.8, z: 1.65 }),
  }),
  bodies: Object.freeze([
    hyperbox('station-divider-n', [0, 0.75, -2.6, 0], [0.16, 0.95, 0.35, 2.2]),
    hyperbox('station-divider-s', [0, 0.75, 2.6, 0], [0.16, 0.95, 0.35, 2.2]),
    hyperbox('station-power-door', [0, 0.75, -1.65, 0], [0.16, 0.95, 0.6, 2.2], true),
    hyperbox('station-phase-door', [0, 0.75, -1.65, -0.65], [0.17, 0.95, 0.6, 1.35]),
    hyperbox('station-return-door', [0, 0.75, 1.65, 0], [0.16, 0.95, 0.6, 2.2], true),
    hyperbox('station-middle-door', [0, 0.75, 0, -0.65], [0.17, 0.95, 1.05, 1.35]),
    hyperbox('station-channel-n', [1.1, 0.75, -0.95, 0], [1.1, 0.95, 0.1, 2.2]),
    hyperbox('station-channel-s', [1.1, 0.75, 0.95, 0], [1.1, 0.95, 0.1, 2.2]),
    hypersphere('station-exit-n', [2.55, 0.55, -0.4, 1.35], 0.85, true),
    hypersphere('station-exit-s', [2.55, 0.55, 0.4, 1.35], 0.85, true),
  ]),
});

export function relayField(level, powered, latched) {
  if (!level.relay) return level;
  const { poweredGate, shortcutGate } = level.relay;
  return { ...level, bodies: level.bodies.filter((body) =>
    !(powered && body.id === poweredGate) && !(latched && body.id === shortcutGate)) };
}

export function fieldWithRadius(level, radius = level?.tokenRadius) {
  if (!level || !Number.isFinite(radius) || radius === level.tokenRadius) return level;
  return Object.freeze({ ...level, tokenRadius: radius });
}

export const ITEM_TINT = Object.freeze([0.28, 0.98, 0.76]);

export function itemSectionAtW(level, itemState, w) {
  const item = level?.item;
  if (!item || !itemState) return null;
  finite(w, 'W');
  const d = itemState.carrying ? 0 : Math.abs(w - itemState.w);
  const ratioSq = (item.wReach - d) * (item.wReach + d) / (item.wReach * item.wReach);
  const radius = ratioSq > 0 ? item.radius * Math.sqrt(ratioSq) : 0;
  const margin = item.wReach - d;
  const wEdge = margin > 0 ? Math.min(1, margin / Math.min(0.25, item.wReach)) : 0;
  const wGhost = margin <= 0 && margin > -0.45 ? 1 + margin / 0.45 : 0;
  return {
    id: item.id,
    type: 'sphere',
    isItem: true,
    alt: false,
    center: [itemState.x, itemState.carrying ? 0.52 : item.y, itemState.z],
    radius,
    maxR: item.radius,
    kind: ratioSq > 0 ? 'sphere' : (ratioSq === 0 ? 'point' : 'empty'),
    volume: (4 / 3) * Math.PI * radius ** 3,
    wEdge,
    wGhost,
    tint: ITEM_TINT,
    ghost: itemState.carrying ? 0 : 1,
  };
}

export function itemFootprint(level, itemState, y = level?.tokenY) {
  const item = level?.item;
  if (!item || !itemState) return null;
  // Like wFootprint, intersect at the map's physical Y height. The core has
  // different spatial and W semi-axes, so this is an ellipsoid, not a ball.
  finite(y, 'y');
  const centerY = itemState.carrying ? 0.52 : item.y;
  const dy = y - centerY;
  const factorSq = 1 - (dy / item.radius) ** 2;
  const factor = Math.sqrt(Math.max(0, factorSq));
  return {
    id: item.id,
    type: 'sphere',
    isItem: true,
    alt: false,
    center: [itemState.x, itemState.z, itemState.w],
    radius: item.radius * factor,
    wRadius: item.wReach * factor,
    exists: factorSq > 0,
    tint: ITEM_TINT,
  };
}

export const goalOpenAt = (level, w) => !level?.goalW || (w >= level.goalW[0] && w <= level.goalW[1]);

export function goalSliceAtW(level, w) {
  const [lo, hi] = level?.goalW ?? [-2, 2];
  const cw = (lo + hi) / 2;
  const halfW = (hi - lo) / 2;
  const margin = halfW - Math.abs(w - cw);
  const open = margin >= 0;
  const wEdge = open ? Math.min(1, margin / Math.min(0.25, halfW)) : 0;
  const wGhost = !open && margin > -1.8 ? 0.35 + 0.55 * (1 + margin / 1.8) : 0.35;
  return { open, lo, hi, wEdge, wGhost };
}

export const LEVELS = Object.freeze({ corridor: CORRIDOR, room: ROOM, gate: GATE, rooms: TWO_ROOMS, tidal: TIDAL, islands: ISLANDS, fetch: FETCH_ROOM });

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
    return { id: section.id, type: 'box', alt: section.alt, center: [section.center[0], section.center[2]], half: [section.half[0], section.half[2]], wEdge: section.wEdge ?? 1 };
  }
  const dy = Math.abs(y - section.center[1]);
  const radius = Math.sqrt(Math.max(0, (section.radius - dy) * (section.radius + dy)));
  return radius > 0 ? { id: section.id, type: 'sphere', alt: section.alt, center: [section.center[0], section.center[2]], radius, wEdge: section.wEdge ?? 1 } : null;
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
export function sweptSections(level, fromW, toW) {
  const low = Math.min(fromW, toW);
  const high = Math.max(fromW, toW);
  return level.bodies.map((body) => sliceAtW(body, Math.max(low, Math.min(high, body.center[3]))));
}

export function wChangeEngulfs(level, pos, fromW, toW) {
  return tokenInsideSection(sweptSections(level, fromW, toW), pos[0], pos[1], level);
}

// Exact W intervals in [-2, 2] where a body at pos=(x, z) would engulf the token.
export function blockedWIntervals(level, pos) {
  const [x, z] = pos;
  const out = [];
  for (const body of level.bodies) {
    const cw = body.center[3];
    if (body.type === 'box') {
      if (!sectionContains(sliceAtW(body, cw), x, z, level)) continue;
      const lo = Math.max(-2, cw - body.half[3]);
      const hi = Math.min(2, cw + body.half[3]);
      if (hi > lo) out.push([lo, hi]);
    } else {
      const d3 = Math.hypot(x - body.center[0], level.tokenY - body.center[1], z - body.center[2]);
      const minR = Math.max(0, d3 - level.tokenRadius);
      if (minR >= body.radius) continue;
      const span = Math.sqrt(body.radius * body.radius - minR * minR);
      const lo = Math.max(-2, cw - span);
      const hi = Math.min(2, cw + span);
      if (hi > lo) out.push([lo, hi]);
    }
  }
  return out;
}

// Floor radius of a sphere's danger zone: the token is safe at every W exactly
// when its whole disc lies outside this circle.
export function exclusionRadius(body, level) {
  const dy = level.tokenY - body.center[1];
  const reach = Math.sqrt(Math.max(0, (body.radius + level.tokenRadius) ** 2 - dy * dy));
  return Math.max(0, reach - level.tokenRadius);
}

export const wToDial = (w) => clampDial(w / DIAL_SPAN + 0.5);

const SAFE_EPS = 1e-4;
// Furthest W from fromW toward toW that never engulfs the token.
export function safeWToward(level, pos, fromW, toW) {
  if (!wChangeEngulfs(level, pos, fromW, toW)) return toW;
  const up = toW > fromW;
  let limit = toW;
  for (const [lo, hi] of blockedWIntervals(level, pos)) {
    if (up && hi > fromW && lo < limit) limit = Math.max(fromW, lo - SAFE_EPS);
    if (!up && lo < fromW && hi > limit) limit = Math.min(fromW, hi + SAFE_EPS);
  }
  return wChangeEngulfs(level, pos, fromW, limit) ? fromW : limit;
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
