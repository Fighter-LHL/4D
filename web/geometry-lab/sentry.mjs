// Sentries: hyperspheres that patrol (x, z) inside their own W layer. They
// are never collision bodies. A sentry exists in your slice only while its W
// range contains your W, and only then can it see you. Line of sight is cut
// by the walls of the current 3D section. DOM-free, so it runs under Node.
import { hypersphere } from './geometry.mjs';

export const SENTRY = Object.freeze({
  fov: 0.55, // half-angle of the vision cone, radians
  range: 2.3,
  fillSeconds: 0.6, // continuous sight needed to be caught
  coolPerSecond: 1.2,
  graceSeconds: 1.4, // after a respawn nobody can spot you
});

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// Same convention as the courier: yaw = atan2(dx, dz).
const yawOf = (from, to) => Math.atan2(to[0] - from[0], to[1] - from[1]);

// A post: a sentry that stands still and sweeps its gaze, sometimes
// glancing over its shoulder (scan.back), so a watched gap is never safe
// for long and an unwatched one can suddenly be checked.
function postPose(sentry, t) {
  const [x, z] = sentry.path[0];
  const { center, amp = 0, period = 4, back = null } = sentry.scan;
  let yaw = center + amp * Math.sin((2 * Math.PI * t) / period);
  if (back) {
    // back = { every, hold }: turn 180° for `hold` seconds once per cycle.
    const phase = ((t + (back.offset ?? 0)) % back.every + back.every) % back.every;
    const turn = 0.45;
    const k = phase < turn ? phase / turn : phase < turn + back.hold ? 1 : phase < 2 * turn + back.hold ? 1 - (phase - turn - back.hold) / turn : 0;
    yaw += Math.PI * k * k * (3 - 2 * k);
  }
  return { x, z, yaw };
}

// Constant-speed loop through the waypoints. At each waypoint the sentry
// stands still and turns toward the next leg, which reads as looking around.
export function patrolPose(sentry, t) {
  if (sentry.scan) return postPose(sentry, t);
  const pts = sentry.path;
  const legs = pts.map((p, i) => {
    const q = pts[(i + 1) % pts.length];
    return { from: p, to: q, walk: Math.hypot(q[0] - p[0], q[1] - p[1]) / sentry.speed };
  });
  const cycle = legs.reduce((sum, leg) => sum + sentry.pause + leg.walk, 0);
  let left = ((t % cycle) + cycle) % cycle;
  for (let i = 0; i < legs.length; i += 1) {
    const leg = legs[i];
    const prev = legs[(i + legs.length - 1) % legs.length];
    const facing = yawOf(leg.from, leg.to);
    if (left < sentry.pause) {
      const k = left / sentry.pause;
      const from = yawOf(prev.from, prev.to);
      return { x: leg.from[0], z: leg.from[1], yaw: from + wrap(facing - from) * k * k * (3 - 2 * k) };
    }
    left -= sentry.pause;
    if (left < leg.walk) {
      const k = left / leg.walk;
      return { x: leg.from[0] + (leg.to[0] - leg.from[0]) * k, z: leg.from[1] + (leg.to[1] - leg.from[1]) * k, yaw: facing };
    }
    left -= leg.walk;
  }
  const last = legs.at(-1);
  return { x: last.to[0], z: last.to[1], yaw: yawOf(last.from, last.to) };
}

export const sentryBody = (sentry, pose) => hypersphere(sentry.id, [pose.x, sentry.y, pose.z, sentry.w], sentry.radius);
export const presentAt = (sentry, w) => Math.abs(w - sentry.w) < sentry.radius;

function segmentHitsRect(a, b, c, h) {
  // Slab test of segment a→b against the rectangle |p - c| <= h.
  let t0 = 0;
  let t1 = 1;
  for (let k = 0; k < 2; k += 1) {
    const d = b[k] - a[k];
    const lo = c[k] - h[k] - a[k];
    const hi = c[k] + h[k] - a[k];
    if (Math.abs(d) < 1e-9) { if (lo > 0 || hi < 0) return false; continue; }
    let u = lo / d;
    let v = hi / d;
    if (u > v) [u, v] = [v, u];
    t0 = Math.max(t0, u);
    t1 = Math.min(t1, v);
    if (t0 > t1) return false;
  }
  return true;
}

function segmentHitsCircle(a, b, c, r) {
  const ab = [b[0] - a[0], b[1] - a[1]];
  const len2 = ab[0] * ab[0] + ab[1] * ab[1] || 1;
  const t = Math.max(0, Math.min(1, ((c[0] - a[0]) * ab[0] + (c[1] - a[1]) * ab[1]) / len2));
  return Math.hypot(a[0] + ab[0] * t - c[0], a[1] + ab[1] * t - c[1]) < r;
}

// Sight runs at the courier's height through the walls that exist in the
// current section; walls in other W are not there to hide behind.
export function sightBlocked(sections, from, to, y) {
  return sections.some((s) => {
    if (s.kind === 'empty') return false;
    if (s.type === 'box') {
      return Math.abs(y - s.center[1]) <= s.half[1]
        && segmentHitsRect(from, to, [s.center[0], s.center[2]], [s.half[0], s.half[2]]);
    }
    const r2 = s.radius * s.radius - (y - s.center[1]) ** 2;
    return r2 > 0 && segmentHitsCircle(from, to, [s.center[0], s.center[2]], Math.sqrt(r2));
  });
}

export function sees(sentry, pose, pos, w, sections, y) {
  if (!presentAt(sentry, w)) return false;
  const d = Math.hypot(pos[0] - pose.x, pos[1] - pose.z);
  if (d > (sentry.range ?? SENTRY.range)) return false;
  if (d > 0.35 && Math.abs(wrap(yawOf([pose.x, pose.z], pos) - pose.yaw)) > (sentry.fov ?? SENTRY.fov)) return false;
  return !sightBlocked(sections, [pose.x, pose.z], pos, y);
}

// Walking (or phasing) into a sentry's ball in your own slice.
export function touches(sentry, pose, pos, w, y, tokenRadius) {
  const r2 = sentry.radius * sentry.radius - (w - sentry.w) ** 2;
  if (r2 <= 0) return false;
  return Math.hypot(pos[0] - pose.x, y - sentry.y, pos[1] - pose.z) < Math.sqrt(r2) + tokenRadius;
}

export class Patrol {
  constructor(sentries) {
    this.sentries = sentries;
    this.t = 0;
    this.alert = new Map(sentries.map((s) => [s.id, 0]));
    this.watching = new Set();
    this.grace = 0;
    this.caught = 0;
  }

  poses(t = this.t) {
    return this.sentries.map((sentry) => ({ sentry, pose: patrolPose(sentry, t), alert: this.alert.get(sentry.id) }));
  }

  // Advance time; returns the sentry that caught the courier, if any, and the
  // ids that started watching this step (for a one-shot cue).
  step(dt, pos, w, sections, y, tokenRadius) {
    this.t += dt;
    this.grace = Math.max(0, this.grace - dt);
    const spotted = [];
    this.watching.clear();
    let caught = null;
    for (const { sentry, pose } of this.poses()) {
      const before = this.alert.get(sentry.id);
      const seen = !this.grace && sees(sentry, pose, pos, w, sections, y);
      if (seen) this.watching.add(sentry.id);
      let next = seen ? Math.min(1, before + dt / SENTRY.fillSeconds) : Math.max(0, before - dt * SENTRY.coolPerSecond);
      if (!this.grace && touches(sentry, pose, pos, w, y, tokenRadius)) next = 1;
      this.alert.set(sentry.id, next);
      if (seen && before === 0) spotted.push(sentry.id);
      if (next >= 1 && !caught) caught = sentry.id;
    }
    if (caught) this.caught += 1;
    return { caught, spotted };
  }

  respawn() {
    for (const id of this.alert.keys()) this.alert.set(id, 0);
    this.watching.clear();
    this.grace = SENTRY.graceSeconds;
  }
}
