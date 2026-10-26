// Shared bots for the flatland tests. Moves are made through the public model API.
import { FlatlandModel } from '../src/flatland/model.js';
import { FLATLAND_LEVELS } from '../src/flatland/levels.js';
import { FLIP_DURATION } from '../src/flatland/mirror.js';

export const DT = 1 / 60;
export const levelIndex = id => FLATLAND_LEVELS.findIndex(level => level.id === id);
export function play(id, seed = 7) { const m = new FlatlandModel(levelIndex(id), { seed }); m.start(); m.drainEvents(); return m; }
export function wait(m, seconds) { for (let t = 0; t < seconds - 1e-9; t += .05) m.update(Math.min(.05, seconds - t)); }
export function slide(m, target) { const reached = m.setSlice(target); m.endSliceGesture(); return reached; }
export function walk(m, x, y, seconds) { m.setMove(x, y); wait(m, seconds); m.setMove(0, 0); }
export const types = m => m.drainEvents().map(event => event.type);

// Walk straight toward a point without overshooting it.
export function goto(m, x, y, limit = 8) {
  for (let t = 0; t < limit && m.phase === 'playing'; t += DT) {
    const dx = x - m.player.x, dy = y - m.player.y, d = Math.hypot(dx, dy);
    if (d < .02) break;
    const speed = Math.min(1, d / (5 * DT));
    m.setMove(dx / d * speed, dy / d * speed); m.update(DT);
  }
  m.setMove(0, 0);
}

// A quick, precise player for the visitor: reacts, then drags to the nearer matching height.
export function playVisitor(m, { reaction = .45, speed = 3.5, skip = [] } = {}) {
  let react = 0, last = -1;
  while (m.phase === 'playing' && !m.cleared && m.time < 90) {
    const r = m.rings;
    if (m.exploration) {
      const c = m._visitorSolid().center, dx = c[0] - r.list[r.index] - m.player.x, dy = c[1] - m.player.y;
      m.setMove(dx * 2, dy * 2);
    }
    if (r.gap <= 0 && r.index !== last) { last = r.index; react = reaction; }
    if (react > 0) react -= DT;
    else if (r.gap <= 0 && skip.includes(r.index)) {
      const center = m._visitorSolid().center[2], radius = s => Math.sqrt(Math.max(0, 2.5 ** 2 - (s - center) ** 2));
      m.setSlice([0, 6, center].sort((a, b) => Math.abs(radius(b) - r.list[r.index]) - Math.abs(radius(a) - r.list[r.index]))[0]);
    } else if (r.gap <= 0) {
      const center = m._visitorSolid().center[2], target = r.list[r.index], d = Math.sqrt(2.5 ** 2 - target ** 2);
      const goal = [center - d, center + d].filter(s => s >= 0 && s <= 6).sort((a, b) => Math.abs(a - m.s) - Math.abs(b - m.s))[0];
      m.setSlice(m.s + Math.max(-speed * DT, Math.min(speed * DT, goal - m.s)));
    }
    m.update(DT);
  }
  m.endSliceGesture();
  m.setMove(0, 0);
  return m;
}

export function solveLocks(m) {
  while (m.phase === 'playing' && !m.cleared && m.time < 120) {
    const stamp = m.locks.list[m.locks.index].stamp;
    if (stamp) m.setMove((stamp[0] - m.player.x) * 2, (stamp[1] - m.player.y) * 2);
    if (m.locks.gap <= 0) m.setSlice(m.locks.list[m.locks.index].target);
    m.update(DT);
  }
  m.setMove(0, 0);
  return m;
}

// Mirror: pick up the key, then visit every lock in the cheapest order.
export function solveMirror(m) {
  goto(m, 5, 6);
  const orders = list => list.length <= 1 ? [list] : list.flatMap((item, i) => orders([...list.slice(0, i), ...list.slice(i + 1)]).map(rest => [item, ...rest]));
  const turn = n => (n % 4 + 4) % 4;
  // Same hand: rotate forward. Other hand: rotate before or after the flip, whichever is shorter.
  const plan = (from, to) => from.chirality === to.chirality ? { before: 0, after: turn(to.turns - from.turns), flip: false }
    : turn(-to.turns - from.turns) < turn(to.turns + from.turns) ? { before: turn(-to.turns - from.turns), after: 0, flip: true } : { before: 0, after: turn(to.turns + from.turns), flip: true };
  const cost = (from, to) => { const p = plan(from, to); return p.before + p.after + Number(p.flip); };
  const best = orders(m.mirrorLocks).map(order => ({ order, total: order.reduce((sum, lock, i) => sum + cost(i ? order[i - 1] : { chirality: 1, turns: 0 }, lock), 0) }))
    .sort((a, b) => a.total - b.total)[0].order;
  for (const lock of best) {
    if (lock.open) continue;
    const p = plan({ chirality: m.keyChirality, turns: m.keyTurns }, lock);
    for (let i = 0; i < p.before; i++) m.rotateKey();
    if (p.flip) { goto(m, 10, 6); m.requestFlip(); wait(m, FLIP_DURATION + .05); }
    for (let i = 0; i < p.after; i++) m.rotateKey();
    goto(m, lock.x, lock.y);
  }
  return m;
}

// Collects whichever shard variant this seed rolled, then touches the flag.
export function runEscape(m) {
  const [a, b, c] = m.shards;
  if (a.x === 8.4) { slide(m, .7); goto(m, a.x, a.y); }
  slide(m, 4.7);
  if (b.x === 11.7) goto(m, b.x, b.y);
  if (a.x === 2) { goto(m, 2, 10.4); slide(m, .6); m.update(DT); slide(m, 4.7); }
  if (b.x === 4) { goto(m, 4, 1.8); slide(m, 2.7); m.update(DT); slide(m, 4.7); }
  if (c.x === 17.8) { goto(m, 13.8, 1); goto(m, 17.8, 1); goto(m, 17.8, 2); }
  else { goto(m, 13.8, 11.1); goto(m, 18.4, 11.1); slide(m, 4); goto(m, 18.4, 10.4); }
  slide(m, 1); goto(m, 17.9, 5); goto(m, 17.7, 6);
  return m;
}
