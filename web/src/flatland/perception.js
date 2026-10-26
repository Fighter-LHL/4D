import { EPSILON, segmentHitsShape, sliceSolid, circleHitsShape } from './geometry.js';

export const sightBlocked = (from, to, walls) => walls.some(shape => segmentHitsShape(from, to, shape));

// Back-and-forth patrol, evaluated only from model time so pauses are stable.
export function guardPose(def, time) {
  const [a, b] = def.patrol, length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const distance = length ? ((time * def.speed + (def.offset || 0)) % (2 * length) + 2 * length) % (2 * length) : 0;
  const back = distance >= length, t = length ? (back ? 2 * length - distance : distance) / length : 0;
  return { id: def.id, label: def.label, x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t,
    facing: Math.atan2(b[1] - a[1], b[0] - a[0]) + (back ? Math.PI : 0),
    r: def.r, range: def.range, halfAngle: def.halfAngle, z: [...def.z] };
}

export function guardSees(guard, player, s, walls) {
  if (s < guard.z[0] - EPSILON || s > guard.z[1] + EPSILON) return false;
  const dx = player.x - guard.x, dy = player.y - guard.y, distance = Math.hypot(dx, dy);
  if (distance > guard.range + player.r || sightBlocked([guard.x, guard.y], [player.x, player.y], walls)) return false;
  const angle = Math.atan2(dy, dx) - guard.facing;
  return distance <= guard.r + player.r || Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))) <= guard.halfAngle;
}

export function sightFan(guard, walls) {
  const origin = [guard.x, guard.y], points = [origin];
  for (let i = 0; i <= 24; i++) {
    const angle = guard.facing - guard.halfAngle + guard.halfAngle * 2 * i / 24;
    const end = length => [guard.x + Math.cos(angle) * length, guard.y + Math.sin(angle) * length];
    let free = 0, hit = guard.range;
    if (!sightBlocked(origin, end(hit), walls)) free = hit;
    else for (let step = 0; step < 10; step++) {
      const mid = (free + hit) / 2;
      if (sightBlocked(origin, end(mid), walls)) hit = mid; else free = mid;
    }
    points.push(end(free));
  }
  return points;
}

// Every solid in the vault is an extrusion: all its lower sections have the
// same XY outline. Drawing that outline once is the exact lower-slice overlay,
// not a collision surface or a remotely collectable item.
export function lowerPrismGhosts(solids, s) {
  return solids.filter(solid => solid.kind === 'prism' && solid.z[0] < s - EPSILON).map(solid => {
    const top = Math.min(solid.z[1], s), height = (solid.z[0] + top) / 2;
    return { id: solid.id, role: solid.role, label: solid.label, shape: sliceSolid(solid, height), s: height, z: [...solid.z] };
  });
}

// Exact adjacent sections, clipped by the renderer to a local light circle.
// They carry no collision or pickup authority, including occluded items.
export function adjacentSliceGhosts(solids, s, player, radius, range) {
  if (!radius) return [];
  return [-1, 1].flatMap(direction => {
    const height = s + direction * 1.2;
    if (height < range.min || height > range.max) return [];
    return solids.flatMap(solid => {
      const shape = sliceSolid(solid, height);
      return shape && circleHitsShape(player.x, player.y, radius, shape)
        ? [{ id: solid.id, role: solid.role, shape, s: height, direction, lantern: true }] : [];
    });
  });
}
