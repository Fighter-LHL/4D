import { shapeCentroid } from './geometry.js';
import { sightFan } from './perception.js';
import { keyPoints, flipVertices } from './mirror.js';
import { drawAscendScene, ascendScreenToWorld } from './ascend-scene.js';
// Draws the flat world (only sections at the current s) beside a side view
// that shows the full solids and the player's plane. Effects follow model events.
const TAU = Math.PI * 2;
const COLORS = { paper: '#eef0e7', card: '#f8f9f2', grid: '#e1e6da', ink: '#243b35', muted: '#75837a', line: '#d3dacc',
  slice: '#397d93', danger: '#bd6146', done: '#2b8a6a', amber: '#b47a2d' };
const ROLES = {
  visitor: { fill: '#cfe6ee', stroke: '#397d93' },
  wall: { fill: '#c6dacb', stroke: '#2b6b59' },
  goal: { fill: '#f3e3bf', stroke: '#b47a2d' },
  item: { fill: '#f4d579', stroke: '#9b6b19' },
  door: { fill: '#f3e3bf', stroke: '#b47a2d' },
  pad: { fill: '#e4deee', stroke: '#78658f' },
  lock: { fill: '#e1e6da', stroke: '#5b7166' },
};
const role = id => ROLES[id] || ROLES.wall;
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const ease = t => 1 - (1 - clamp(t)) ** 3;
const APPEAR = .24, EXIT = .2, FLASH = .7, BURST = .9;

function shapePath(ctx, shape) {
  ctx.beginPath();
  if (shape.type === 'circle') ctx.ellipse(shape.cx, shape.cy, Math.max(0, shape.r), Math.max(0, shape.r), 0, 0, TAU);
  else { shape.points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); }
}

export class FlatlandRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.state = null;
    this.appear = new Map();
    this.flash = new Map();
    this.exiting = [];
    this.bursts = [];
    this.shapes = new Map();
    this.time = 0;
    const media = globalThis.window?.matchMedia?.('(prefers-reduced-motion: reduce)');
    this.reducedMotion = !!media?.matches;
    media?.addEventListener?.('change', event => { this.reducedMotion = event.matches; });
  }

  setState(state) { this.state = state; }
  pushEvents(events) {
    for (const event of events) {
      if (['load','dimension_start','dimension_ready'].includes(event.type)) { this.volumeOpacity = new Map(); this.dimensionView = null; }
      if (event.type === 'load' || event.type === 'round_start' || event.type === 'guard_alert') { this.appear.clear(); this.flash.clear(); this.exiting = []; this.bursts = []; this.shapes.clear(); }
      if (event.type === 'section_enter') this.appear.set(event.id, 0);
      if (event.type === 'section_exit' && this.shapes.has(event.id)) this.exiting.push({ ...this.shapes.get(event.id), age: 0 });
      if (event.type === 'blocked') this.flash.set(event.solid, 0);
      if (event.type === 'lock_reject') this.flash.set('mirror-lock', 0);
      if (event.type === 'flip_end' && this.state) this.bursts.push({ x: 10, y: 6, r: 1.2, age: 0, color: COLORS.amber });
      if (event.type === 'pickup') {
        this.exiting = this.exiting.filter(section => section.id !== event.id);
        this.shapes.delete(event.id);
        this.bursts.push({ x: this.state.player.x, y: this.state.player.y, r: .6, age: 0, color: COLORS.amber });
      }
      if (event.type === 'goal_done' || event.type === 'goal_side') {
        const goal = this.state?.goals.find(item => item.id === event.goal);
        const section = this.state?.sections.find(item => item.id === goal?.solid);
        const at = goal?.center || (section ? shapeCentroid(section.shape) : null);
        if (at) this.bursts.push({ x: at[0], y: at[1], r: goal.radius || 1, age: 0, color: COLORS.done });
      }
      if (event.type === 'complete' && this.state) this.bursts.push({ x: this.state.player.x, y: this.state.player.y, r: 1.4, age: 0, color: COLORS.amber, big: true });
    }
  }

  layout() {
    const rect = this.canvas.getBoundingClientRect(), dpr = globalThis.window?.devicePixelRatio || 1;
    const width = Math.max(1, rect.width), height = Math.max(1, rect.height);
    if (this.canvas.width !== Math.round(width * dpr) || this.canvas.height !== Math.round(height * dpr)) {
      this.canvas.width = Math.round(width * dpr); this.canvas.height = Math.round(height * dpr);
    }
    const s = this.state, pad = 14, side = s?.sideView !== 'off';
    const wide = width / height > 1.25;
    const mainBox = !side ? { x: pad, y: pad, w: width - pad * 2, h: height - pad * 2 }
      : wide ? { x: pad, y: pad, w: (width - pad * 3) * .6, h: height - pad * 2 }
        : { x: pad, y: pad, w: width - pad * 2, h: (height - pad * 3) * .66 };
    const sideBox = !side ? null : wide ? { x: mainBox.x + mainBox.w + pad, y: pad, w: width - mainBox.w - pad * 3, h: height - pad * 2 }
      : { x: pad, y: mainBox.y + mainBox.h + pad, w: width - pad * 2, h: height - mainBox.h - pad * 3 };
    const bounds = s?.bounds || { w: 20, h: 12 };
    const scale = Math.min((mainBox.w - 20) / bounds.w, (mainBox.h - 20) / bounds.h);
    const main = { ...mainBox, scale, ox: mainBox.x + (mainBox.w - bounds.w * scale) / 2, oy: mainBox.y + (mainBox.h - bounds.h * scale) / 2 };
    return { width, height, dpr, main, side: sideBox };
  }

  screenToWorld(clientX, clientY) {
    if (!this.view) return null;
    if (this.state.ascend && this.state.ascend.stage !== 'flat') return ascendScreenToWorld(this, clientX, clientY);
    const rect = this.canvas.getBoundingClientRect(), { main } = this.view, b = this.state.bounds;
    const x = (clientX - rect.left - main.ox) / main.scale, y = (clientY - rect.top - main.oy) / main.scale;
    return x >= 0 && y >= 0 && x <= b.w && y <= b.h ? { x, y } : null;
  }

  render(dt = 0) {
    if (!this.state) return;
    this.time += dt;
    for (const map of [this.appear, this.flash]) for (const [id, age] of map) map.set(id, age + dt);
    for (const item of [...this.exiting, ...this.bursts]) item.age += dt;
    this.exiting = this.exiting.filter(item => item.age < EXIT);
    this.bursts = this.bursts.filter(item => item.age < BURST * (item.big ? 1.6 : 1));
    const view = this.view = this.layout(), ctx = this.ctx;
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = COLORS.paper; ctx.fillRect(0, 0, view.width, view.height);
    if (this.state.ascend && this.state.ascend.stage !== 'flat') { drawAscendScene(this, view, dt); return; }
    this.drawMain(view.main);
    if (view.side) this.drawSide(view.side);
    this.shapes = new Map(this.state.sections.map(section => [section.id, section]));
  }

  card(box, label) {
    const ctx = this.ctx;
    ctx.fillStyle = COLORS.card; ctx.strokeStyle = COLORS.line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(box.x, box.y, box.w, box.h, 8) : ctx.rect(box.x, box.y, box.w, box.h); ctx.fill(); ctx.stroke();
    if (label) { ctx.fillStyle = COLORS.muted; ctx.font = '600 10px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillText(label, box.x + 12, box.y + 18); }
  }

  drawMain(main) {
    const ctx = this.ctx, s = this.state, b = s.bounds, k = main.scale;
    this.card(main, s.mirror?.motion ? '翻转投影示意 · 钥匙暂时离开平面' : s.peek ? `俯视透视 · 虚线是 S < ${s.s.toFixed(2)} 的下方世界` : `平面世界 · 你只能看到 S = ${s.s.toFixed(2)} 的截面`);
    ctx.save(); ctx.translate(main.ox, main.oy); ctx.scale(k, k);
    ctx.strokeStyle = COLORS.grid; ctx.lineWidth = 1 / k;
    for (let x = 0; x <= b.w; x++) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, b.h); ctx.stroke(); }
    for (let y = 0; y <= b.h; y++) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(b.w, y); ctx.stroke(); }
    ctx.strokeStyle = COLORS.line; ctx.lineWidth = 2 / k; ctx.strokeRect(0, 0, b.w, b.h);

    for (const ghost of s.ghosts || []) this.drawGhost(ghost, k);
    for (const guard of s.ghostGuards || []) this.drawGuard(guard, k, true);
    for (const item of this.exiting) this.drawSection(item, 1 - ease(item.age / EXIT), k, .6);
    for (const section of s.sections) {
      const age = this.appear.get(section.id);
      this.drawSection(section, age === undefined || this.reducedMotion ? 1 : ease(age / APPEAR), k, 1);
      if (section.label) this.drawLabel(section.role === 'lock' && s.phase === 'complete' ? '镜之锁 · 已开' : section.label, section.shape, k, !!s.mirror);
    }
    const walls = s.sections.filter(section => section.solid).map(section => section.shape);
    for (const guard of s.guards || []) this.drawGuard(guard, k, false, walls);
    // Target rings sit above sections so a ring inside a larger circle stays readable.
    s.goals.filter(goal => goal.kind === 'match').forEach((goal, i) => this.drawRing(goal, k, i));
    for (const burst of this.bursts) {
      const p = clamp(burst.age / (BURST * (burst.big ? 1.6 : 1)));
      ctx.globalAlpha = 1 - p; ctx.strokeStyle = burst.color; ctx.lineWidth = (burst.big ? 4 : 3) / k;
      const r = burst.r + (this.reducedMotion ? .3 : p * (burst.big ? 3 : 1.2));
      ctx.beginPath(); ctx.ellipse(burst.x, burst.y, r, r, 0, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    this.drawPlayer(k);
    if (s.carrying && s.mirror) this.drawMirrorKey(k);
    else if (s.carrying) {
      ctx.strokeStyle = COLORS.amber; ctx.lineWidth = 2 / k;
      ctx.beginPath(); ctx.ellipse(s.player.x + .7, s.player.y - .3, .16, .16, 0, 0, TAU);
      ctx.moveTo(s.player.x + .86, s.player.y - .3); ctx.lineTo(s.player.x + 1.2, s.player.y - .3); ctx.lineTo(s.player.x + 1.2, s.player.y - .1); ctx.stroke();
    }
    if (s.returning > 0) {
      ctx.strokeStyle = COLORS.danger; ctx.lineWidth = 3 / k;
      ctx.beginPath(); ctx.ellipse(s.player.x, s.player.y, .7, .7, 0, 0, TAU); ctx.stroke();
    }
    ctx.restore();
    if (!s.sections.length && !s.peek && s.phase === 'playing') {
      ctx.fillStyle = COLORS.muted; ctx.font = '500 13px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('这个高度什么也没有', main.x + main.w / 2, main.y + main.h - 18);
    }
  }

  mirrorVertices() {
    const m = this.state.mirror;
    if (!m.motion) return keyPoints(m.chirality, m.turns).map(([x, y]) => [x, y, 0]);
    const p = m.motion.progress;
    // Reduced motion retains the three teaching poses, without a continuous spin.
    return flipVertices(m.motion.fromChirality, m.motion.fromTurns, this.reducedMotion ? p < .4 ? 0 : p < .6 ? .5 : 1 : p);
  }

  drawMirrorKey(k) {
    const ctx = this.ctx, s = this.state, at = s.phase === 'complete' ? [17, 6] : s.mirror.onPad ? [10, 6] : [s.player.x + 1.1, s.player.y - .5];
    const points = this.mirrorVertices().map(([x, y]) => [at[0] + x, at[1] + y]);
    ctx.save(); shapePath(ctx, { type: 'polygon', points });
    ctx.fillStyle = '#eed08a'; ctx.strokeStyle = COLORS.amber; ctx.lineWidth = 2 / k; ctx.fill(); ctx.stroke();
    if (s.mirror.motion) {
      ctx.setLineDash([.18, .12]); ctx.strokeStyle = COLORS.slice; ctx.lineWidth = 1 / k;
      ctx.beginPath(); ctx.moveTo(at[0] - 1.7, at[1]); ctx.lineTo(at[0] + 1.7, at[1]); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = COLORS.slice; ctx.font = `500 ${10 / k}px system-ui, sans-serif`; ctx.textAlign = 'center';
      ctx.fillText('X · 翻转轴', at[0], at[1] + 1.8);
    }
    ctx.restore();
  }

  drawMirrorSide(box) {
    const ctx = this.ctx, s = this.state, m = s.mirror;
    this.card(box, '侧视图 · Y–Z 平面（从 X 轴方向看）');
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2, k = Math.max(1, Math.min((box.w - 48) / 4, (box.h - 92) / 4));
    ctx.save(); ctx.translate(cx, cy);
    ctx.strokeStyle = COLORS.grid; ctx.lineWidth = 1;
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(-2 * k, i * k); ctx.lineTo(2 * k, i * k); ctx.stroke(); }
    ctx.strokeStyle = COLORS.slice; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-2 * k, 0); ctx.lineTo(2 * k, 0); ctx.stroke();
    ctx.fillStyle = COLORS.slice; ctx.font = '500 10px system-ui, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('S=3 · 你的平面', -2 * k, 17); ctx.fillText('Y →', 1.5 * k, -8); ctx.fillText('Z ↑', -2 * k, -1.7 * k);
    if (s.carrying) {
      ctx.setLineDash([4, 4]); ctx.strokeStyle = '#c7b7a0'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(0, 0, 1.4 * k, 1.4 * k, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      const points = this.mirrorVertices().map(([, y, z]) => [y * k, -z * k]);
      shapePath(ctx, { type: 'polygon', points }); ctx.strokeStyle = COLORS.amber; ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.stroke();
      ctx.fillStyle = COLORS.ink; ctx.beginPath(); ctx.ellipse(0, 0, 3, 3, 0, 0, TAU); ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = COLORS.muted; ctx.font = '500 11px system-ui, sans-serif'; ctx.textAlign = 'center';
    const p = m.motion?.progress;
    const label = !s.carrying ? '拿起钥匙后，在这里观察翻转' : p !== undefined ? `绕 X 轴 · ${Math.round(p * 180)}° / 180°` : m.chirality === 1 ? '钥匙仍在平面里' : '镜像钥匙回到了平面里';
    ctx.fillText(label, cx, box.y + box.h - 20);
  }

  drawLabel(label, shape, k, above = false) {
    const ctx = this.ctx, [x, y] = shapeCentroid(shape);
    const labelY = above ? (shape.type === 'circle' ? shape.cy - shape.r : Math.min(...shape.points.map(point => point[1]))) - .3 : y - .65;
    ctx.save(); ctx.fillStyle = COLORS.ink; ctx.font = `600 ${11 / k}px system-ui, sans-serif`; ctx.textAlign = 'center';
    ctx.fillText(label, x, labelY); ctx.restore();
  }

  drawGhost(ghost, k) {
    const ctx = this.ctx;
    ctx.save(); shapePath(ctx, ghost.shape);
    ctx.fillStyle = ghost.role === 'item' ? '#ead08a' : '#b7adcb'; ctx.globalAlpha = .22; ctx.fill();
    ctx.globalAlpha = .75; ctx.strokeStyle = '#78658f'; ctx.setLineDash([.16, .14]); ctx.lineWidth = 1.5 / k; ctx.stroke();
    ctx.restore();
    if (ghost.label) this.drawLabel(`${ghost.label} · S ${ghost.z[0]}–${ghost.z[1]}`, ghost.shape, k);
  }

  drawGuard(guard, k, ghost, walls = []) {
    const ctx = this.ctx;
    ctx.save();
    if (!ghost) {
      shapePath(ctx, { type: 'polygon', points: sightFan(guard, walls) });
      ctx.fillStyle = guard.alert ? COLORS.danger : '#cd9a65'; ctx.globalAlpha = .2; ctx.fill();
    }
    ctx.globalAlpha = ghost ? .6 : 1; ctx.strokeStyle = ghost ? '#78658f' : guard.alert ? COLORS.danger : '#97643d';
    ctx.fillStyle = ghost ? '#ded7e9' : '#eacda7'; ctx.lineWidth = 2 / k;
    if (ghost) ctx.setLineDash([.12, .12]);
    ctx.beginPath(); ctx.ellipse(guard.x, guard.y, guard.r, guard.r, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(guard.x, guard.y);
    ctx.lineTo(guard.x + Math.cos(guard.facing) * .55, guard.y + Math.sin(guard.facing) * .55); ctx.stroke();
    ctx.fillStyle = ghost ? '#78658f' : COLORS.ink; ctx.font = `500 ${10 / k}px system-ui, sans-serif`; ctx.textAlign = 'center';
    ctx.fillText(guard.alert ? '啊！' : ghost ? '下方守卫' : guard.label, guard.x, guard.y - .65);
    ctx.restore();
  }

  drawSection(section, scale, k, alpha) {
    if (scale <= 0) return;
    const ctx = this.ctx, colors = section.role === 'lock' && this.state.phase === 'complete' ? { fill: '#c6dacb', stroke: COLORS.done } : role(section.role), flash = this.flash.get(section.id);
    const [cx, cy] = shapeCentroid(section.shape);
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.translate(cx, cy); ctx.scale(scale, scale); ctx.translate(-cx, -cy);
    shapePath(ctx, section.shape);
    ctx.fillStyle = colors.fill; ctx.fill();
    ctx.strokeStyle = colors.stroke; ctx.lineWidth = 2 / k; ctx.stroke();
    if (flash !== undefined && flash < FLASH) {
      ctx.globalAlpha = 1 - flash / FLASH; ctx.strokeStyle = COLORS.danger; ctx.lineWidth = 5 / k; ctx.stroke();
    }
    ctx.restore();
  }

  drawRing(goal, k, index) {
    const ctx = this.ctx, [x, y] = goal.center;
    const closeness = Number.isFinite(goal.error) ? clamp(1 - goal.error / .6) : 0;
    ctx.save();
    ctx.setLineDash(goal.done ? [] : [.25, .2]);
    ctx.strokeStyle = goal.done ? COLORS.done : closeness > .83 ? COLORS.amber : COLORS.muted;
    ctx.globalAlpha = goal.done ? .95 : .45 + closeness * .5;
    ctx.lineWidth = (goal.done ? 3 : 1.5 + closeness * 2) / k;
    ctx.beginPath(); ctx.ellipse(x, y, goal.radius, goal.radius, 0, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    if (!goal.done && goal.progress > 0) {
      ctx.strokeStyle = COLORS.done; ctx.globalAlpha = 1; ctx.lineWidth = 4 / k;
      ctx.beginPath(); ctx.ellipse(x, y, goal.radius, goal.radius, 0, -Math.PI / 2, -Math.PI / 2 + TAU * goal.progress); ctx.stroke();
    }
    // Concentric rings: stagger label angles so they never stack.
    const angle = -Math.PI / 2 + .35 + index * .6;
    ctx.globalAlpha = 1; ctx.fillStyle = goal.done ? COLORS.done : COLORS.muted;
    ctx.font = `600 ${12 / k}px system-ui, sans-serif`; ctx.textAlign = 'left';
    ctx.fillText(`${goal.done ? '✓ ' : ''}r ${goal.radius}`, x + Math.cos(angle) * goal.radius + .15, y + Math.sin(angle) * goal.radius - .1);
    ctx.restore();
  }

  drawPlayer(k) {
    const ctx = this.ctx, p = this.state.player, bob = this.reducedMotion ? 0 : Math.sin(this.time * 3) * .03;
    ctx.save();
    ctx.fillStyle = COLORS.ink; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2 / k;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r + bob, p.r + bob, 0, 0, TAU); ctx.fill(); ctx.stroke();
    const ex = p.x + Math.cos(p.facing) * p.r * .45, ey = p.y + Math.sin(p.facing) * p.r * .45;
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(ex, ey, p.r * .22, p.r * .22, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = COLORS.ink; ctx.font = `600 ${12 / k}px system-ui, sans-serif`; ctx.textAlign = 'center';
    ctx.fillText('你', p.x, p.y - p.r - .25);
    ctx.restore();
  }

  drawSide(box) {
    const ctx = this.ctx, s = this.state;
    if (s.mirror) { this.drawMirrorSide(box); return; }
    this.card(box, s.sideView === 'player-only' ? s.abilities?.peek ? '侧视图 · 只显示你的高度（X–S）' : '侧视图 · 立体暂时遮住了，先观察左边' : '侧视图 · 从旁边看整个立体（X–S）');
    const top = box.y + 30, left = box.x + 30, w = box.w - 44, h = box.h - 52;
    // Frame the X span that actually holds solids and the player, so the side
    // view stays legible in a narrow panel. Scale is uniform: circles stay round.
    const xs = [s.player.x - 1, s.player.x + 1, ...(s.sideView === 'player-only' ? [7, 13] : [])];
    for (const item of s.profiles) {
      if (item.profile.type === 'circle') xs.push(item.profile.cx - item.profile.r, item.profile.cx + item.profile.r);
      else for (const [x] of item.profile.points) xs.push(x);
    }
    const x0 = Math.max(0, Math.min(...xs) - 1), x1 = Math.min(s.bounds.w, Math.max(...xs) + 1);
    const range = s.slice.max - s.slice.min, k = Math.min(w / (x1 - x0), h / range);
    const ox = left + (w - (x1 - x0) * k) / 2 - x0 * k, base = top + (h + range * k) / 2;
    const toY = z => base - (z - s.slice.min) * k;
    ctx.save();
    ctx.fillStyle = COLORS.muted; ctx.font = '500 9px system-ui, sans-serif'; ctx.textAlign = 'right';
    for (let z = s.slice.min; z <= s.slice.max + 1e-9; z++) {
      ctx.strokeStyle = COLORS.grid; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(ox + x0 * k, toY(z)); ctx.lineTo(ox + x1 * k, toY(z)); ctx.stroke();
      ctx.fillText(String(z), ox + x0 * k - 6, toY(z) + 3);
    }
    ctx.beginPath(); ctx.rect(ox + x0 * k, toY(s.slice.max) - 4, (x1 - x0) * k, range * k + 8); ctx.clip();
    ctx.translate(ox, base); ctx.scale(k, -k); ctx.translate(0, -s.slice.min);
    const visible = new Set(s.sections.map(section => section.id));
    for (const item of s.profiles) {
      const colors = role(item.role), flash = this.flash.get(item.id);
      shapePath(ctx, item.profile);
      ctx.globalAlpha = visible.has(item.id) ? .9 : .4;
      ctx.fillStyle = colors.fill; ctx.fill();
      ctx.strokeStyle = colors.stroke; ctx.lineWidth = 1.5 / k; ctx.stroke();
      if (flash !== undefined && flash < FLASH) { ctx.globalAlpha = 1 - flash / FLASH; ctx.strokeStyle = COLORS.danger; ctx.lineWidth = 4 / k; ctx.stroke(); }
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = COLORS.slice; ctx.lineWidth = 2 / k;
    ctx.beginPath(); ctx.moveTo(x0, s.s); ctx.lineTo(x1, s.s); ctx.stroke();
    // The flat player is itself a segment in the side view.
    ctx.strokeStyle = COLORS.ink; ctx.lineWidth = 5 / k;
    ctx.beginPath(); ctx.moveTo(s.player.x - s.player.r, s.s); ctx.lineTo(s.player.x + s.player.r, s.s); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = COLORS.slice; ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'left';
    const labelY = clamp(toY(s.s) - 6, top + 10, base - 4);
    ctx.fillText(`S ${s.s.toFixed(2)} · 你的平面`, ox + x0 * k + 4, labelY);
  }
}
