// Axis-aligned 4D prisms cut by w = W produce actual 3D boxes.
// The introductory room keeps walking on Y=.4; W never moves the player in XYZ.
export const DIMENSION_DURATION = 4;
export const W_SLICE = Object.freeze({ min: 0, max: 1, start: .18 });
const freeze = object => { Object.values(object).forEach(value => { if (value && typeof value === 'object') freeze(value); }); return Object.freeze(object); };
const box = (id, min, max, w, role = 'wall') => ({ id, min, max, w, role, solid: role !== 'goal' });
export const ASCEND_BOXES = freeze([
  box('floor', [0, -.3, 0], [20, 0, 12], [0, 1], 'floor'),
  box('room-n', [7, 0, 3.5], [13, 3, 3.9], [0, .58]),
  box('room-w', [7, 0, 3.5], [7.4, 3, 8.5], [0, .58]),
  box('room-e', [12.6, 0, 3.5], [13, 3, 8.5], [0, .58]),
  box('room-s', [7, 0, 8.1], [13, 3, 8.5], [0, .58]),
  box('roof', [7, 3, 3.5], [13, 3.35, 8.5], [0, .58], 'roof'),
  box('courtyard-gate', [16.6, 0, 5.6], [17.4, 1.1, 6.4], [0, .32], 'goal'),
]);
export const boxPresent = (box, w) => w >= box.w[0] - 1e-9 && w <= box.w[1] + 1e-9;
export function sphereHitsBox(position, radius, box) {
  const xyz = [position.x, position.y, position.z];
  const distance2 = xyz.reduce((sum, value, i) => sum + (value - Math.max(box.min[i], Math.min(box.max[i], value))) ** 2, 0);
  return distance2 < radius ** 2 - 1e-9;
}
export function roomBlocker(position, radius, w) {
  return ASCEND_BOXES.find(box => box.solid && boxPresent(box, w) && sphereHitsBox(position, radius, box))?.id || null;
}
export function outsideRoom(position, radius) {
  return position.x - radius > 13 || position.x + radius < 7 || position.z - radius > 8.5 || position.z + radius < 3.5;
}
export function roomSections(w) { return ASCEND_BOXES.map(box => ({ ...structuredClone(box), present: boxPresent(box, w) })); }
export function projectFloor(x, z, blend = 1) {
  x -= 10; z -= 6;
  return [(1 - .1 * blend) * x - .9 * blend * z, .42 * blend * x + (1 - .58 * blend) * z];
}
export function unprojectFloor(u, v, blend = 1) {
  const a = 1 - .1 * blend, b = -.9 * blend, c = .42 * blend, d = 1 - .58 * blend, determinant = a * d - b * c;
  return { x: (d * u - b * v) / determinant + 10, y: (-c * u + a * v) / determinant + 6 };
}
