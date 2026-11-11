// Canvas-only toys for the theatre pass: the W dial's grabbable bead, the ferry
// skiff, the relic-cast tether and the courtyard fireflies. All geometry lives
// here so scene.js keeps only call sites; every routine stays finite for any input.
import { ferryPosition } from './rooms.js';

const TAU = Math.PI * 2;
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const mix = (a, b, t) => a + (b - a) * t;
const COLORS = { gold: '#d79943', lightGold: '#ffedb0', weave: '#348d70', shadow: '#9c78ba' };
const RELIC_COLORS = { prism: '#5aa7d4', weave: COLORS.weave, shadow: COLORS.shadow };

function path(ctx, points, close = true) {
  ctx.beginPath();
  points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  if (close) ctx.closePath();
}

function ellipse(ctx, x, y, rx, ry, fill, stroke, width = 1) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(.01, rx), Math.max(.01, ry), 0, 0, TAU);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}

function line(ctx, ax, ay, bx, by, stroke, width = 1) {
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
  ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke();
}

function diamond(ctx, x, y, size, fill, stroke) {
  path(ctx, [[x, y - size], [x + size * .66, y], [x, y + size], [x - size * .66, y]]);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); }
}

// ---------------------------------------------------------------- W dial bead

export const DIAL = { rx: 51, ry: 27, dy: -2 };

export function dialBead(hub, w) {
  const a = clamp(w) * TAU - Math.PI / 2;
  return { x: hub.x + Math.cos(a) * DIAL.rx, y: hub.y + DIAL.dy + Math.sin(a) * DIAL.ry };
}

export function dialAngle(hub, x, y) {
  return Math.atan2((y - (hub.y + DIAL.dy)) / DIAL.ry, (x - hub.x) / DIAL.rx);
}

// Runs inside drawHub's island-local frame (origin = hub centre). Layer ticks are
// pure geometry; the bead only advertises its grab once the stage unlocks it.
export function drawDialBead(renderer) {
  const ctx = renderer.ctx, s = renderer.state;
  for (let i = 0; i < (s?.layers?.length ?? 3); i++) {
    const a = (s?.layers?.[i]?.center ?? [.18, .5, .82][i]) * TAU - Math.PI / 2;
    const color = renderer.palette(i).color;
    line(ctx, Math.cos(a) * 45, Math.sin(a) * 23.5 + DIAL.dy, Math.cos(a) * 52, Math.sin(a) * 27.5 + DIAL.dy, color, 2);
  }
  const a = renderer.currentW() * TAU - Math.PI / 2;
  const bx = Math.cos(a) * DIAL.rx, by = Math.sin(a) * DIAL.ry + DIAL.dy;
  if ((renderer.onboardingStage ?? 4) < 2) {
    ellipse(ctx, bx, by, 4, 3, COLORS.gold, '#ffefbf', 1);
    return;
  }
  const grabbed = renderer.grab?.kind === 'dial';
  const hot = grabbed || renderer.hoverGrab === 'dial';
  if (hot) ellipse(ctx, bx, by, 11.5, 9.5, 'rgba(255,239,191,.38)', null);
  ellipse(ctx, bx, by, 6, 4.6, COLORS.gold, grabbed ? '#ffffff' : '#ffefbf', grabbed ? 2 : 1.2);
}

// ---------------------------------------------------------------------- ferry

export function ferryTrackPoint(track, t) {
  const s = 1 - t;
  return {
    x: s * s * track.p0.x + 2 * s * t * track.c.x + t * t * track.p1.x,
    y: s * s * track.p0.y + 2 * s * t * track.c.y + t * t * track.p1.y,
  };
}

// Nearest Bezier parameter to a world point: coarse sweep then ternary refine.
export function ferryTrackNearest(track, x, y) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i <= 64; i++) {
    const t = i / 64, p = ferryTrackPoint(track, t);
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bestD) { bestD = d; best = t; }
  }
  let lo = Math.max(0, best - 1 / 64), hi = Math.min(1, best + 1 / 64);
  for (let i = 0; i < 24; i++) {
    const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
    const p1 = ferryTrackPoint(track, m1), p2 = ferryTrackPoint(track, m2);
    if ((p1.x - x) ** 2 + (p1.y - y) ** 2 < (p2.x - x) ** 2 + (p2.y - y) ** 2) hi = m2; else lo = m1;
  }
  return (lo + hi) / 2;
}

function smoothstepInv(u) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2;
    if (mid * mid * (3 - 2 * mid) < u) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// Dragging the skiff maps pointer -> track parameter -> raw W across the docks.
export function ferryDragW(ferry, x, y) {
  const raw = smoothstepInv(ferryTrackNearest(ferry.track, x, y));
  return clamp(ferry.centerA + raw * (ferry.centerB - ferry.centerA));
}

// Faint dotted light rail plus two dock lanterns tinted by their W slice.
export function drawFerryRail(renderer) {
  const ctx = renderer.ctx, ferry = renderer.state?.ferry;
  if (!ferry?.track) return;
  ctx.save();
  ctx.setLineDash([2, 9]);
  ctx.globalAlpha = .32;
  ctx.beginPath();
  ctx.moveTo(ferry.track.p0.x, ferry.track.p0.y);
  ctx.quadraticCurveTo(ferry.track.c.x, ferry.track.c.y, ferry.track.p1.x, ferry.track.p1.y);
  ctx.strokeStyle = renderer.astralMode ? '#4c7488' : '#9db8ae';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.setLineDash([]);
  for (const [side, dock, layer] of [['a', ferry.track.p0, ferry.layerA], ['b', ferry.track.p1, ferry.layerB]]) {
    const pal = renderer.palette(layer);
    const lit = ferry.docked === side;
    ctx.globalAlpha = lit ? .92 : .42;
    line(ctx, dock.x, dock.y - 24, dock.x, dock.y - 6, renderer.astralMode ? '#39607a' : '#8aa79a', 1.6);
    diamond(ctx, dock.x, dock.y - 29, lit ? 7 : 5, lit ? pal.glow : null, pal.color);
    if (lit) { ctx.globalAlpha = .5; ellipse(ctx, dock.x, dock.y - 29, 12, 12, null, pal.glow, 1); }
  }
  ctx.restore();
}

// The crystalline skiff itself, drawn like an island (world coords), with a short
// gangplank reaching its dock while berthed. Never carries a name tag.
export function drawFerrySkiff(renderer, node) {
  const ctx = renderer.ctx, ferry = renderer.state?.ferry;
  if (!ferry) return;
  const w = renderer.currentW();
  const layer = ferry.docked === 'a' ? ferry.layerA : ferry.docked === 'b' ? ferry.layerB
    : (Math.abs(w - ferry.centerA) <= Math.abs(w - ferry.centerB) ? ferry.layerA : ferry.layerB);
  const pal = renderer.palette(layer);
  const dockNode = ferry.docked ? renderer.node(ferry.docked === 'a' ? ferry.a : ferry.b) : null;
  ctx.save();
  if (dockNode) {
    const dx = dockNode.x - node.x, dy = dockNode.y - node.y, len = Math.max(1, Math.hypot(dx, dy));
    const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
    const reach = Math.min(len - 62, 68);
    if (reach > 18) {
      const x0 = node.x + ux * 32, y0 = node.y + uy * 24;
      const x1 = node.x + ux * (32 + reach), y1 = node.y + uy * (24 + reach * dy / len);
      ctx.globalAlpha = .85;
      for (const side of [-1, 1]) {
        line(ctx, x0 + nx * 6 * side, y0 + ny * 6 * side, x1 + nx * 6 * side, y1 + ny * 6 * side,
          renderer.astralMode ? '#4d7f92' : '#a88f5f', 1.8);
      }
      const rungs = Math.max(2, Math.floor(reach / 16));
      for (let i = 1; i <= rungs; i++) {
        const t = i / (rungs + 1), px = mix(x0, x1, t), py = mix(y0, y1, t);
        line(ctx, px - nx * 6.5, py - ny * 6.5, px + nx * 6.5, py + ny * 6.5, renderer.astralMode ? '#3a6678' : '#93794c', 1.2);
      }
    }
  }
  ctx.translate(node.x, node.y);
  ellipse(ctx, 0, 18, 36, 9, 'rgba(40,70,64,.16)');
  path(ctx, [[-44, 2], [-30, 13], [0, 18], [32, 12], [44, 0], [30, -7], [-30, -9]]);
  ctx.fillStyle = renderer.astralMode ? '#1c3646' : '#dfe9dc';
  ctx.fill();
  ctx.strokeStyle = pal.color; ctx.lineWidth = 1.8; ctx.stroke();
  line(ctx, -30, -9, -30, 13, pal.color + '80', 1);
  line(ctx, 30, -7, 30, 12, pal.color + '80', 1);
  diamond(ctx, 0, -13, 10, pal.glow, pal.color);
  line(ctx, 0, -23, 0, -3, pal.color, 1.2);
  ctx.globalAlpha = .85;
  diamond(ctx, 0, 11, 5.5, pal.glow, null);
  ellipse(ctx, 0, 11, 10, 5, null, pal.glow, .9);
  ctx.restore();
}

// -------------------------------------------------------------- relic casting

// Legal cast receptors in world space: prism/weave aim at target islands while
// shadow aims at the pad where drawGhost places the echo on the current island.
export function castReceptors(renderer) {
  const casts = renderer.state?.castTargets;
  if (!casts) return [];
  const out = [];
  for (const relic of ['prism', 'weave', 'shadow']) {
    for (const id of casts[relic] || []) {
      const node = renderer.node(id);
      if (!node) continue;
      out.push(relic === 'shadow'
        ? { relic, target: id, node, x: node.x - 21, y: node.y - 4 }
        : { relic, target: id, node, x: node.x, y: node.y - 18 });
    }
  }
  return out;
}

export function castSnap(renderer, cast) {
  if (!renderer.state?.castTargets) return null;
  for (const r of castReceptors(renderer)) {
    if (r.relic === 'shadow') {
      if (Math.hypot(cast.x - r.x, cast.y - r.y) <= 30
        && Math.hypot(cast.x - cast.ax, cast.y - cast.ay) >= 24) {
        return { relic: 'shadow', target: r.target };
      }
      continue;
    }
    const node = r.node, section = node.anchor ? 1 : (node.scale ?? 1);
    const rx = (node.id === 'hub' ? 112 : 81) * section * 1.15;
    const ry = (node.id === 'hub' ? 60 : 52) * section * 1.15;
    const dx = (cast.x - node.x) / rx, dy = (cast.y - node.y + 12 * section) / ry;
    if (dx * dx + dy * dy <= 1) return { relic: r.relic, target: r.target };
  }
  return null;
}

function drawReceptor(renderer, r, snapped) {
  const ctx = renderer.ctx;
  const grow = snapped ? 1.18 : 1;
  const color = RELIC_COLORS[r.relic];
  ctx.save();
  ctx.translate(r.x, r.y);
  ctx.scale(grow, grow);
  ctx.globalAlpha = snapped ? .95 : .55;
  if (r.relic === 'prism') {
    const spin = renderer.reducedMotion ? .4 : renderer.time * 1.7;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(0, 0, 30, 17, 0, spin + i * TAU / 3, spin + i * TAU / 3 + .9);
      ctx.strokeStyle = color; ctx.lineWidth = snapped ? 2.2 : 1.4; ctx.stroke();
    }
    diamond(ctx, 0, 0, 8, snapped ? '#eaf6ff' : null, color);
  } else if (r.relic === 'weave') {
    ellipse(ctx, 0, 0, 28, 15, null, color, snapped ? 2.2 : 1.3);
    for (const side of [-1, 1]) {
      ctx.save(); ctx.translate(side * 20, -3); ctx.rotate(side * .7);
      ellipse(ctx, 0, -3, 6.5, 3, '#c7e8ac', color, 1); ctx.restore();
    }
    diamond(ctx, 0, -4, snapped ? 6 : 4.5, '#e6f4cf', color);
  } else {
    ctx.setLineDash([4, 4]);
    ellipse(ctx, 0, 0, 24, 15, null, color, 1.4);
    ctx.setLineDash([]);
    diamond(ctx, 0, -3, 5, null, color);
  }
  ctx.restore();
}

function drawPrismTether(renderer, ax, ay, tip, snapped, color) {
  const ctx = renderer.ctx;
  const nx = -(tip.y - ay), ny = tip.x - ax;
  const len = Math.max(1, Math.hypot(nx, ny));
  const bx = (ax + tip.x) / 2 + (nx / len) * 14, by = (ay + tip.y) / 2 + (ny / len) * 14 - 6;
  line(ctx, ax, ay, bx, by, color, 2);
  line(ctx, bx, by, tip.x, tip.y, color, snapped ? 3 : 1.6);
  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(Math.atan2(tip.y - ay, tip.x - ax));
  path(ctx, [[-6, 4], [0, -6], [6, 4]]);
  ctx.strokeStyle = color; ctx.lineWidth = 1.4; ctx.stroke();
  ctx.restore();
  diamond(ctx, tip.x, tip.y, 4.5, '#eaf6ff', color);
}

function drawWeaveTether(renderer, ax, ay, tip, color) {
  const ctx = renderer.ctx;
  const mx = (ax + tip.x) / 2, my = (ay + tip.y) / 2;
  const sag = 26 + Math.hypot(tip.x - ax, tip.y - ay) * .06;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.quadraticCurveTo(mx, my + sag, tip.x, tip.y);
  ctx.strokeStyle = color; ctx.lineWidth = 1.8; ctx.stroke();
  for (const t of [.33, .55, .77]) {
    const qx = (1 - t) ** 2 * ax + 2 * (1 - t) * t * mx + t * t * tip.x;
    const qy = (1 - t) ** 2 * ay + 2 * (1 - t) * t * (my + sag) + t * t * tip.y;
    ctx.save(); ctx.translate(qx, qy); ctx.rotate(t * 2 - 1);
    ellipse(ctx, 0, -3, 5.5, 2.6, '#c9edb1', color, .9); ctx.restore();
  }
  diamond(ctx, tip.x, tip.y, 4, '#e6f4cf', color);
}

function drawShadowTether(renderer, ax, ay, tip) {
  const ctx = renderer.ctx;
  ctx.save();
  ctx.setLineDash([3, 5]);
  line(ctx, ax, ay, tip.x, tip.y, COLORS.shadow, 1.2);
  ctx.setLineDash([]);
  ctx.globalAlpha = .55;
  renderer.drawAvatar(tip.x, tip.y + 14, COLORS.shadow, true);
  ctx.restore();
}

// Relic-cast affordance: a breathing halo on the avatar, per-target receptors and
// a relic-styled tether to the pointer. All feedback is geometry, never text.
export function drawRelicCast(renderer) {
  const ctx = renderer.ctx;
  const receptors = renderer.state?.castTargets ? castReceptors(renderer) : [];
  const cast = renderer.cast;
  if (!receptors.length && !cast) return;
  const player = renderer.playerPosition();
  const ax = player.x, ay = player.y - 14;
  if (receptors.length) {
    const pulse = renderer.reducedMotion ? .5 : .5 + .5 * Math.sin(renderer.time * 2.1);
    ctx.save();
    ctx.globalAlpha = .16 + .14 * pulse;
    ellipse(ctx, ax, ay + 3, 25 + 3 * pulse, 16 + 2 * pulse, null, '#f4d488', 1.6);
    ctx.restore();
  }
  if (!cast) return;
  const snap = cast.snap;
  const snapReceptor = snap ? receptors.find(r => r.relic === snap.relic && r.target === snap.target) : null;
  let near = snapReceptor;
  if (!near) {
    let best = Infinity;
    for (const r of receptors) {
      const d = Math.hypot(cast.x - r.x, cast.y - r.y);
      if (d < best) { best = d; near = r; }
    }
  }
  const relic = snap?.relic || near?.relic || 'prism';
  const color = snap?.relic === 'prism' && snapReceptor ? renderer.palette(snapReceptor.node.layer).color : RELIC_COLORS[relic];
  const tip = cast.retract ? { x: mix(cast.x, ax, cast.retract), y: mix(cast.y, ay, cast.retract) } : { x: cast.x, y: cast.y };
  const alpha = 1 - (cast.retract || 0) * .75;
  ctx.save();
  for (const r of receptors) drawReceptor(renderer, r, r === snapReceptor);
  ctx.globalAlpha = alpha;
  if (relic === 'weave') drawWeaveTether(renderer, ax, ay, tip, color);
  else if (relic === 'shadow') drawShadowTether(renderer, ax, ay, tip);
  else drawPrismTether(renderer, ax, ay, tip, !!snapReceptor, color);
  ctx.restore();
}

// ------------------------------------------------------------------- fireflies

export function drawFireflies(renderer) {
  const ctx = renderer.ctx, flies = renderer.life?.fireflies;
  if (!flies?.length) return;
  const reduced = renderer.reducedMotion;
  for (let i = 0; i < flies.length; i++) {
    const fly = flies[i];
    if (!Number.isFinite(fly.x) || !Number.isFinite(fly.y)) continue;
    const glow = clamp(fly.glow ?? .7, 0, 1.5);
    const hop = fly.happy && !reduced ? Math.abs(Math.sin(renderer.time * 9 + i * 2)) * 4 : 0;
    const flutter = reduced ? 0 : Math.sin(renderer.time * 11 + i * 2.7) * 1.4;
    ctx.save();
    ctx.translate(fly.x, fly.y - 16 - hop);
    ctx.globalAlpha = .13 + .14 * glow;
    ellipse(ctx, 0, 0, 12, 9, '#ffe9a8');
    ctx.globalAlpha = .55;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * 5.2, -2.6 - flutter, 5.4, 2.4, side * (.5 + flutter * .06), 0, TAU);
      ctx.strokeStyle = '#fdf2bf'; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.globalAlpha = .92;
    diamond(ctx, 0, 0, 4.4, fly.happy ? '#fff3bd' : '#f7e6ae', '#d9a13c');
    for (const side of [-1, 1]) {
      ellipse(ctx, side * 1.7 + (fly.lookX || 0) * 1.5, -4 + (fly.lookY || 0) * 1.3, .8, .8, '#3f2f16');
    }
    ctx.restore();
  }
}
