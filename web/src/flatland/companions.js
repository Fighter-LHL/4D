import { circleHitsShape, sliceSolid, EPSILON } from './geometry.js';
import { sightBlocked } from './perception.js';

export const PROBE_OFFSET = 1.5, PROBE_REACH = 2.4, PROBE_FLIGHT = .3, PROBE_STAY = 2;
export const COMPANION_HELP = Object.freeze({
  sprout: 'B：向前跳，捡光屑、碰花苞、引开守卫。C：切换上层 / 同层 / 下层。',
  lantern: '微光照出附近上下层。B：扩大光圈；虚线只是线索，换到那层才能碰到。',
  ribbon: 'B：开关镜像同步。找一对紫色花垫，和反反同时站稳，让花匣打开。',
  all: 'B：跳跳探层、灯光扩大、反反开关同步。C：切换跳跳方向。',
});

export function createCompanionState() {
  return { direction: 1, probe: null, mirror: false, glowUntil: 0, readyAt: 0,
    attention: new Map(), garden: { probeOpen: false, mirrorOpen: false, hold: 0 } };
}
export const companionsEnabled = m => m.exploration && (!m.ascend || m.ascend.stage === 'flat');
export const hasCompanion = (m, id) => companionsEnabled(m) && m.collection.found.includes(id) &&
  (m.collection.companion === id || m.collection.companion === 'all');

// Each level authors a different spatial relationship, reflection axis and drops.
export function gardenLayout(m) { return m.level.garden ? structuredClone(m.level.garden) : null; }
export function gardenSolids(m) {
  if (!companionsEnabled(m) || !m.level.garden) return [];
  const { bud } = gardenLayout(m);
  return [{ id: 'friend-bud', role: 'toy', kind: 'sphere', center: [bud.x, bud.y, bud.z], r: .45 }];
}
const wallsAt = (m, z) => m._solids().filter(s => s.solid).map(s => sliceSolid(s, z)).filter(Boolean);
const blocked = (m, x, y, z, r = .22) => wallsAt(m, z).some(s => circleHitsShape(x, y, r, s));
const within = (m, x, y, r = .22) => x >= r && y >= r && x <= m.level.bounds.w - r && y <= m.level.bounds.h - r;

export function resetCompanionAction(m) {
  m.companions.probe = null; m.companions.mirror = false; m.companions.glowUntil = 0;
  m.companions.garden.hold = 0;
}
export function useCompanions(m) {
  const c = m.companions;
  if (!companionsEnabled(m) || !m.collection.companion || m.phase !== 'playing' || m._frozen() || m.time < c.readyAt) return false;
  let used = false;
  if (hasCompanion(m, 'sprout')) {
    const target = m.s + c.direction * PROBE_OFFSET, { x, y, facing } = m.player;
    const inHeight = target >= m.level.slice.min - EPSILON && target <= m.level.slice.max + EPSILON;
    const z = Math.max(m.level.slice.min, Math.min(m.level.slice.max, target));
    if (inHeight && !blocked(m, x, y, z)) {
      // The hop crosses height; its forward leg sweeps the actual destination
      // slice. It may clear a low wall, but cannot tunnel through a tall one.
      let tx = x, ty = y;
      for (let d = .04; d <= PROBE_REACH + EPSILON; d += .04) {
        const nx = x + Math.cos(facing) * d, ny = y + Math.sin(facing) * d;
        if (!within(m, nx, ny) || blocked(m, nx, ny, z)) break;
        tx = nx; ty = ny;
      }
      c.probe = { x, y, z, fromX: x, fromY: y, toX: tx, toY: ty, born: m.time, r: .22 };
      used = true;
    } else m._emit('friend_blocked', { reason: !inHeight ? 'height' : 'wall' });
  }
  if (hasCompanion(m, 'lantern')) { c.glowUntil = m.time + 2; used = true; }
  if (hasCompanion(m, 'ribbon')) { c.mirror = !c.mirror; c.garden.hold = 0; used = true; }
  if (!used) return false;
  c.readyAt = m.time + (hasCompanion(m, 'sprout') && c.probe ? PROBE_FLIGHT + PROBE_STAY + .2 : .45);
  m.petUntil = m.time + .45;
  m._emit('friend_play', { id: m.collection.companion, x: m.player.x, y: m.player.y });
  return true;
}

export function mirrorPose(m) {
  if (!hasCompanion(m, 'ribbon') || !m.companions.mirror) return null;
  const p = { x: 2 * (m.level.garden?.axis ?? m.level.bounds.w / 2) - m.player.x, y: m.player.y, z: m.s, r: .25 };
  return { ...p, outside: !within(m, p.x, p.y, p.r), blocked: !within(m, p.x, p.y, p.r) || blocked(m, p.x, p.y, p.z, p.r) };
}
function openGarden(m, kind, at) {
  const garden = m.companions.garden;
  if (garden[`${kind}Open`]) return;
  garden[`${kind}Open`] = true;
  const { left, drops } = gardenLayout(m);
  drops[kind].forEach((p, i) => m.shards.push({ id: `friend-${kind}-${i}`, x: p.x, y: p.y,
    z: [left.z - .3, left.z + .3], taken: false, golden: true, bonus: true }));
  m._emit('friend_garden', { kind, x: at.x, y: at.y, z: left.z });
}
export function stepCompanions(m, dt) {
  if (!companionsEnabled(m)) { resetCompanionAction(m); return; }
  const c = m.companions, probe = c.probe;
  if (probe) {
    const elapsed = m.time - probe.born;
    if (elapsed > PROBE_FLIGHT + PROBE_STAY) c.probe = null;
    else {
      const t = Math.min(1, elapsed / PROBE_FLIGHT);
      probe.x = probe.fromX + (probe.toX - probe.fromX) * t;
      probe.y = probe.fromY + (probe.toY - probe.fromY) * t;
      m._collectShards(probe, probe.z);
    }
  }
  steerGuards(m, dt);
  if (!m.level.garden) return;
  const { left, right, bud } = gardenLayout(m), p = m.player;
  const touch = (actor, target) => Math.abs(actor.z - target.z) <= .35 && Math.hypot(actor.x - target.x, actor.y - target.y) <= .6;
  if ((c.probe && touch(c.probe, bud)) || touch({ ...p, z: m.s }, bud)) openGarden(m, 'probe', bud);
  const mirror = mirrorPose(m);
  const paired = mirror && !mirror.blocked && ((touch({ ...p, z: m.s }, left) && touch(mirror, right)) ||
    (touch({ ...p, z: m.s }, right) && touch(mirror, left)));
  c.garden.hold = paired ? Math.min(.6, c.garden.hold + dt) : 0;
  if (c.garden.hold >= .6 - EPSILON) openGarden(m, 'mirror', { x: (left.x + right.x) / 2, y: left.y });
}

export function steerGuards(m, dt) {
  const c = m.companions, probe = c.probe, walls = probe ? wallsAt(m, probe.z) : [];
  for (const guard of m.guards) {
    let memory = c.attention.get(guard.id);
    const sees = probe && probe.z >= guard.z[0] - EPSILON && probe.z <= guard.z[1] + EPSILON &&
      Math.hypot(probe.x - guard.x, probe.y - guard.y) <= guard.range && !sightBlocked([guard.x, guard.y], [probe.x, probe.y], walls);
    if (sees) {
      memory ||= { facing: guard.facing };
      Object.assign(memory, { x: probe.x, y: probe.y, until: m.time + .8 }); c.attention.set(guard.id, memory);
    }
    if (!memory) continue;
    const searching = m.time <= memory.until;
    const target = searching ? Math.atan2(memory.y - guard.y, memory.x - guard.x) : guard.facing;
    const delta = Math.atan2(Math.sin(target - memory.facing), Math.cos(target - memory.facing));
    memory.facing += Math.max(-Math.PI * 1.5 * dt, Math.min(Math.PI * 1.5 * dt, delta));
    guard.facing = memory.facing; guard.distracted = searching; guard.recovering = !searching;
    if (!searching && Math.abs(delta) < .01) { c.attention.delete(guard.id); guard.recovering = false; }
  }
}

export function normalizeGardenMemories(value, levels) {
  return Object.fromEntries(levels.filter(l => l.garden && value?.[l.id] === true).map(l => [l.id, true]));
}

export function gardenCollection(value, levels) {
  const total = levels.filter(l => l.garden).length;
  const count = Object.keys(normalizeGardenMemories(value, levels)).length;
  return { count, total, complete: total > 0 && count === total };
}

export function collectGardenSeed(m) {
  if (!m.exploration || !m.level.garden) return;
  const petals = m.shards.filter(s => s.bonus && s.taken).length;
  m._emit('garden_seed', { petals });
  if (petals === 3) {
    const wasComplete = gardenCollection(m.gardenMemories, m.levels).complete;
    const fresh = !m.gardenMemories[m.level.id]; m.gardenMemories[m.level.id] = true;
    m._emit('garden_bloom', { fresh, x: m.level.garden.axis, y: m.level.garden.left.y });
    if (!wasComplete && gardenCollection(m.gardenMemories, m.levels).complete) {
      m._emit('gardens_complete', { x: m.player.x, y: m.player.y });
    }
  }
}

export function companionView(m) {
  const enabled = companionsEnabled(m), c = m.companions;
  const radius = hasCompanion(m, 'lantern') ? m.time < c.glowUntil ? 5 : 3.2 : 0;
  const probe = enabled && c.probe;
  return { enabled, direction: c.direction, cooldown: Math.max(0, c.readyAt - m.time),
    canAim: hasCompanion(m, 'sprout') && m.phase === 'playing' && !m._frozen(),
    canUse: enabled && !!m.collection.companion && m.phase === 'playing' && !m._frozen() && m.time >= c.readyAt,
    probe: probe ? { x: probe.x, y: probe.y, z: probe.z, remaining: Math.max(0, PROBE_FLIGHT + PROBE_STAY - (m.time - probe.born)) } : null,
    mirror: mirrorPose(m), radius, garden: enabled && m.level.garden ? { ...gardenLayout(m), ...c.garden, hold: c.garden.hold / .6,
      petals: m.shards.filter(s => s.bonus && s.taken).length, bloomed: !!m.gardenMemories[m.level.id] } : null };
}
