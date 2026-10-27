import { shapeCentroid } from './geometry.js';
import { sightFan } from './perception.js';
import { keyPoints, keyShape, flipVertices } from './mirror.js';
import { drawAscendScene, ascendScreenToWorld } from './ascend-scene.js';
import { FRIENDS } from './discoveries.js';
import { discoveryFeedback, nearbyDiscovery } from '../play-feedback.js';
import { drawEncounter, drawCompanions, drawCompanionToys, drawGardenPadHint } from './friends-scene.js';
// Draws the flat world (only sections at the current S) beside a side view of
// the whole 3D scene. Effects (particles, popups, shake) follow model events.
const TAU = Math.PI * 2;
const COLORS = { paper: '#eef0e7', card: '#f8f9f2', grid: '#e1e6da', ink: '#243b35', muted: '#75837a', line: '#d3dacc',
  slice: '#397d93', danger: '#c4553b', done: '#2b8a6a', amber: '#b47a2d', shard: '#2a93b0', gold: '#dd9a1c' };
const ROLES = {
  visitor: { fill: '#cfe6ee', stroke: '#397d93' },
  wall: { fill: '#c6dacb', stroke: '#2b6b59' },
  goal: { fill: '#f3e3bf', stroke: '#b47a2d' },
  item: { fill: '#f4d579', stroke: '#9b6b19' },
  door: { fill: '#f3e3bf', stroke: '#b47a2d' },
  pad: { fill: '#e4deee', stroke: '#78658f' },
  hazard: { fill: '#f1c2b4', stroke: '#c4553b' },
};
const role = id => ROLES[id] || ROLES.wall;
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const ease = t => 1 - (1 - clamp(t)) ** 3;
const mixColor = (a, b, t) => {
  const pa = a.match(/\w\w/g).map(h => parseInt(h, 16)), pb = b.match(/\w\w/g).map(h => parseInt(h, 16));
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(',')})`;
};
const APPEAR = .24, EXIT = .2, FLASH = .7;

function shapePath(ctx, shape) {
  ctx.beginPath();
  if (shape.type === 'circle') ctx.ellipse(shape.cx, shape.cy, Math.max(0, shape.r), Math.max(0, shape.r), 0, 0, TAU);
  else { shape.points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); }
}
function diamond(ctx, x, y, r) { ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r * .72, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r * .72, y); ctx.closePath(); }

export class FlatlandRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.state = null;
    this.appear = new Map();
    this.flash = new Map();
    this.exiting = [];
    this.bursts = [];
    this.particles = [];
    this.popups = [];
    this.trail = [];
    this.friendTrails = [];
    this.friendCheer = 0;
    this.shapes = new Map();
    this.shake = 0;
    this.shakeOffset = [0, 0];
    this.hurtFlash = 0;
    this.time = 0;
    this.lastS = null;
    this.squash = 0;
    const media = globalThis.window?.matchMedia?.('(prefers-reduced-motion: reduce)');
    this.reducedMotion = !!media?.matches;
    media?.addEventListener?.('change', event => { this.reducedMotion = event.matches; });
  }

  setState(state) { this.state = state; }
  burst(x, y, color, count = 14, speed = 4, size = .12) {
    if (this.reducedMotion) count = Math.ceil(count / 3);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU, v = speed * (.4 + Math.random() * .8);
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0, life: .5 + Math.random() * .4, color, size: size * (.6 + Math.random() * .8) });
    }
  }
  popup(x, y, text, color = COLORS.ink, big = false, options = {}) {
    this.popups.push({ x, y, text, color, big, age: 0, duration: 1.1, ...options });
    this.popups = this.popups.slice(-6);
  }
  pushEvents(events) {
    const narrow = this.canvas.getBoundingClientRect().width <= 480;
    for (const event of events) {
      const st = this.state;
      if (['load', 'dimension_start', 'dimension_ready'].includes(event.type)) { this.volumeOpacity = new Map(); this.dimensionView = null; }
      if (['load', 'guard_alert', 'respawn', 'lock_spawn'].includes(event.type)) { this.appear.clear(); this.exiting = []; this.shapes.clear(); this.trail = []; }
      if (event.type === 'load') { this.flash.clear(); this.bursts = []; this.particles = []; this.popups = []; this.friendTrails = []; this.friendCheer = 0; this.shake = 0; this.shakeOffset = [0, 0]; this.hurtFlash = 0; this.lastS = null; }
      if (st?.endless && st.phase === 'playing' && st.collection?.companion && (event.type === 'graze' || (event.type === 'score' && event.combo >= 3))) this.friendCheer = 1.1;
      if (['hurt', 'death', 'complete'].includes(event.type)) this.friendCheer = 0;
      if (event.type === 'section_enter') this.appear.set(event.id, 0);
      if (event.type === 'section_exit' && this.shapes.has(event.id)) this.exiting.push({ ...this.shapes.get(event.id), age: 0 });
      if (event.type === 'blocked') { this.flash.set(event.solid, 0); this.shake = Math.max(this.shake, .18); }
      if (event.type === 'lock_reject') { this.flash.set(event.id, 0); this.shake = Math.max(this.shake, .15); }
      if (event.type === 'score' && st && !st.exploration) {
        const label = event.kind === 'time' ? `时间 +${event.points}` : `+${event.points}${event.mult > 1 ? ` ×${event.mult}` : ''}`;
        this.popup(event.x, event.y - .6, label, event.kind === 'time' ? COLORS.slice : event.mult >= 2 ? COLORS.gold : COLORS.done, event.mult >= 2.5);
      }
      if (event.type === 'shard') { this.burst(event.x, event.y, event.golden ? COLORS.gold : COLORS.shard, event.golden ? 26 : 16, 4.5); this.bursts.push({ x: event.x, y: event.y, r: .4, age: 0, color: event.golden ? COLORS.gold : COLORS.shard }); }
      if (event.type === 'graze') { this.popup(event.x, event.y - .8, `险过 +${event.points}`, COLORS.gold); this.burst(event.x, event.y, COLORS.gold, 10, 3); }
      if (event.type === 'friend_hop') { this.burst(event.x, event.y, '#79a77a', 15, 2); this.friendTrails.push({ ...event, age: 0 }); }
      if (event.type === 'friend_wake') { this.popup(event.x, event.y - .8, '…？', COLORS.amber); this.burst(event.x, event.y, '#e8b74e', 18, 2); }
      if (event.type === 'visitor_poke') this.bursts.push({ x: event.x, y: event.y, r: .4, age: 0, color: COLORS.slice });
      if (event.type === 'discovery_near') {
        this.popup(event.x, event.y - 1.8, event.text, event.color, false, { duration: narrow ? 1.3 : 2.2, near: event });
      }
      const discovery = discoveryFeedback(event);
      if (discovery) {
        this.popups = this.popups.filter(p => !p.near && !p.discovery);
        this.popup(event.x, event.y - .9, discovery.text, discovery.color, false, { duration: narrow ? 1.35 : 1.8, discovery: true });
      }
      if (event.type === 'friend_found' && event.fresh) {
        const friend = FRIENDS.find(f => f.id === event.id);
        this.burst(event.x, event.y, friend.color, 30, 4);
        this.bursts.push({ x: event.x, y: event.y, r: .6, age: 0, color: friend.color, big: true });
      }
      if (event.type === 'friend_play') {
        const friends = event.id === 'all' ? FRIENDS : FRIENDS.filter(f => f.id === event.id);
        friends.forEach((friend, i) => this.burst(event.x + (i - 1) * .6, event.y, friend.color, 12, 2.5));
      }
      if (event.type === 'friend_garden') { this.popup(event.x, event.y - .8, event.kind === 'probe' ? '花苞醒了' : '花匣开了', '#4d9270'); this.burst(event.x, event.y, '#d8ae4d', 24, 3); }
      if (event.type === 'garden_bloom' && event.fresh) { this.popup(event.x, event.y + 1.2, '花园点亮了 ✿', '#4d9270', true); this.burst(event.x, event.y, '#79ad63', 32, 3); }
      if (event.type === 'gardens_complete' && st) { this.popup(st.bounds.w / 2, 1.6, '六座花园全部盛开 ✿', '#4d9270', true); this.burst(event.x, event.y, '#d6a63b', 30, 3); }
      if (event.type === 'friend_blocked' && st) this.popup(st.player.x, st.player.y - .8, event.reason === 'height' ? '到边缘了，换个方向' : '邻层有墙，挪一挪', '#4d9270');
      if (event.type === 'explore_clear') this.popup(event.x, event.y - .8, '路通啦', COLORS.done);
      if (event.type === 'ring_hit') { this.burst(event.x, event.y, COLORS.done, 30, 6, .14); this.bursts.push({ x: event.x, y: event.y, r: event.radius, age: 0, color: COLORS.done, big: true }); this.shake = Math.max(this.shake, .1); }
      if (event.type === 'ring_miss') { this.burst(event.x, event.y, COLORS.muted, 12, 2); this.popup(event.x, event.y - event.radius - .3, '错过', COLORS.danger); }
      if (event.type === 'lock_open') { this.burst(event.x, event.y, COLORS.amber, 34, 6, .15); this.bursts.push({ x: event.x, y: event.y, r: 1.4, age: 0, color: COLORS.amber, big: true }); this.shake = Math.max(this.shake, .14); }
      if (event.type === 'pickup' || event.type === 'unlock') { this.burst(event.x, event.y, COLORS.amber, 20, 4); this.bursts.push({ x: event.x, y: event.y, r: .6, age: 0, color: COLORS.amber }); }
      if (event.type === 'flip_end' && st) this.bursts.push({ x: 10, y: 6, r: 1.2, age: 0, color: COLORS.amber });
      if (event.type === 'death' || event.type === 'hurt') { this.burst(event.x, event.y, COLORS.danger, 28, 6, .16); this.shake = .45; this.hurtFlash = 1; }
      if (event.type === 'guard_alert') { this.burst(event.x, event.y, COLORS.danger, 18, 4); this.shake = .3; this.hurtFlash = .7; }
      if (event.type === 'combo_break' && st && !st.exploration) this.popup(st.player.x, st.player.y - 1, '连击中断', COLORS.muted);
      if (event.type === 'storm_level' && st) { this.popup(st.bounds.w / 2, 1.6, `第 ${event.level} 波`, COLORS.danger, true); this.shake = Math.max(this.shake, .12); }
      if (event.type === 'goal_done') { const p = st?.player; if (p) this.burst(p.x, p.y, COLORS.amber, 24, 5); }
      if (event.type === 'complete' && st) { this.bursts.push({ x: st.player.x, y: st.player.y, r: 1.4, age: 0, color: COLORS.amber, big: true }); if (event.cleared) this.burst(st.player.x, st.player.y, COLORS.gold, 40, 7); }
    }
  }

  layout() {
    const rect = this.canvas.getBoundingClientRect(), dpr = globalThis.window?.devicePixelRatio || 1;
    const width = Math.max(1, rect.width), height = Math.max(1, rect.height);
    if (this.canvas.width !== Math.round(width * dpr) || this.canvas.height !== Math.round(height * dpr)) {
      this.canvas.width = Math.round(width * dpr); this.canvas.height = Math.round(height * dpr);
    }
    const s = this.state, pad = 12, side = s?.sideView !== 'off';
    const wide = width / height > 1.25, bounds = s?.bounds || { w: 20, h: 12 };
    // Narrow screens: reserve readable height for the side view so 0..6 ticks do not collide.
    const minSideH = Math.max(88, Math.round((height - pad * 3) * .35));
    const narrowH = Math.max(112, Math.min(height - pad * 3 - minSideH, (width - pad * 2 - 20) * bounds.h / bounds.w + 36));
    const mainBox = !side ? { x: pad, y: pad, w: width - pad * 2, h: height - pad * 2 }
      : wide ? { x: pad, y: pad, w: (width - pad * 3) * .66, h: height - pad * 2 }
        : { x: pad, y: pad, w: width - pad * 2, h: narrowH };
    const sideBox = !side ? null : wide ? { x: mainBox.x + mainBox.w + pad, y: pad, w: width - mainBox.w - pad * 3, h: height - pad * 2 }
      : { x: pad, y: mainBox.y + mainBox.h + pad, w: width - pad * 2, h: height - mainBox.h - pad * 3 };
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
    if (this.state.paused) dt = 0;
    const s = this.state;
    this.time += dt;
    this.friendCheer = Math.max(0, this.friendCheer - dt);
    this.friendTrails.forEach(t => { t.age += dt; });
    this.friendTrails = this.friendTrails.filter(t => t.age < 3);
    for (const map of [this.appear, this.flash]) for (const [id, age] of map) map.set(id, age + dt);
    for (const item of [...this.exiting, ...this.bursts, ...this.popups]) item.age += dt;
    for (const p of this.particles) { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - dt * 3; p.vy *= 1 - dt * 3; }
    this.exiting = this.exiting.filter(item => item.age < EXIT);
    this.bursts = this.bursts.filter(item => item.age < (item.big ? 1.3 : .8));
    this.popups = this.popups.filter(item => item.age < item.duration && (!item.near || s.paused || nearbyDiscovery(s)?.key === item.near.key));
    this.particles = this.particles.filter(p => p.age < p.life);
    this.shake = Math.max(0, this.shake - dt * 1.4);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2.2);
    if (this.lastS !== null && dt > 0) this.squash += (clamp(Math.abs(s.s - this.lastS) / dt / 2.2) - this.squash) * Math.min(1, dt * 14);
    this.lastS = s.s;
    if (s.phase === 'playing' && !s.dying && dt > 0) {
      this.trail.push({ x: s.player.x, y: s.player.y, age: 0 });
      for (const t of this.trail) t.age += dt;
      this.trail = this.trail.filter(t => t.age < .35).slice(-24);
    }
    const view = this.view = this.layout(), ctx = this.ctx;
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = COLORS.paper; ctx.fillRect(0, 0, view.width, view.height);
    if (s.ascend && s.ascend.stage !== 'flat') { drawAscendScene(this, view, dt); return; }
    const amp = this.reducedMotion ? 0 : this.shake ** 2 * 26;
    if (dt > 0) this.shakeOffset = [(Math.random() - .5) * amp, (Math.random() - .5) * amp];
    ctx.save(); ctx.translate(...this.shakeOffset);
    this.drawMain(view.main);
    ctx.restore();
    if (view.side) this.drawSide(view.side);
    this.shapes = new Map(s.sections.map(section => [section.id, section]));
  }

  card(box, fill = COLORS.card) {
    const ctx = this.ctx;
    ctx.fillStyle = fill; ctx.strokeStyle = COLORS.line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(box.x, box.y, box.w, box.h, 10) : ctx.rect(box.x, box.y, box.w, box.h); ctx.fill(); ctx.stroke();
  }

  // Paper tint follows height: warm near the floor, cool near the top.
  tint() { const s = this.state, t = clamp((s.s - s.slice.min) / (s.slice.max - s.slice.min || 1)); return mixColor('#f9f3e6', '#e9f2f4', t); }

  drawMain(main) {
    const ctx = this.ctx, s = this.state, b = s.bounds, k = main.scale;
    this.card(main, this.tint());
    ctx.save(); ctx.translate(main.ox, main.oy); ctx.scale(k, k);
    ctx.strokeStyle = COLORS.grid; ctx.lineWidth = 1 / k; ctx.globalAlpha = .8;
    for (let x = 0; x <= b.w; x++) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, b.h); ctx.stroke(); }
    for (let y = 0; y <= b.h; y++) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(b.w, y); ctx.stroke(); }
    ctx.globalAlpha = 1; ctx.strokeStyle = COLORS.line; ctx.lineWidth = 2 / k; ctx.strokeRect(0, 0, b.w, b.h);

    for (const ghost of s.ghosts || []) this.drawGhost(ghost, k);
    drawCompanionToys(this, k);
    for (const guard of s.ghostGuards || []) this.drawGuard(guard, k, true);
    this.drawOffShards(k);
    for (const item of this.exiting) this.drawSection(item, 1 - ease(item.age / EXIT), k, .6);
    if (s.locks) this.drawLockTarget(k);
    for (const section of s.sections) {
      const age = this.appear.get(section.id);
      this.drawSection(section, age === undefined || this.reducedMotion ? 1 : ease(age / APPEAR), k, 1);
      if (section.label) this.drawLabel(section.label, section.shape, k);
    }
    for (const warning of s.warnings || []) this.drawWarning(warning, k);
    for (const hazard of s.hazards || []) this.drawHazard(hazard, k);
    const walls = s.sections.filter(section => section.solid).map(section => section.shape);
    for (const guard of s.guards || []) this.drawGuard(guard, k, false, walls);
    if (s.mirror) this.drawMirrorLocks(k);
    if (s.rings) this.drawRing(k);
    this.drawShards(k);
    if (s.rings && s.exploration) this.drawVisitorFace();
    drawEncounter(this, k);
    for (const trail of this.friendTrails) {
      ctx.save(); ctx.fillStyle = '#79a77a'; ctx.globalAlpha = .55 * (1 - trail.age / 3);
      for (let i = 1; i < 12; i++) { const t = i / 12; ctx.beginPath(); ctx.ellipse(trail.x + (trail.to.x - trail.x) * t, trail.y + (trail.to.y - trail.y) * t, .06, .1, t * 2, 0, TAU); ctx.fill(); }
      ctx.restore();
    }
    for (const burst of this.bursts) {
      const p = clamp(burst.age / (burst.big ? 1.3 : .8));
      ctx.globalAlpha = 1 - p; ctx.strokeStyle = burst.color; ctx.lineWidth = (burst.big ? 4 : 3) / k;
      const r = burst.r + (this.reducedMotion ? .3 : ease(p) * (burst.big ? 2.6 : 1.1));
      ctx.beginPath(); ctx.ellipse(burst.x, burst.y, r, r, 0, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    for (const p of this.particles) {
      ctx.globalAlpha = 1 - p.age / p.life; ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, p.size, p.size, 0, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    drawCompanions(this);
    this.drawPlayer(k);
    drawGardenPadHint(this, k);
    if (s.carrying && s.mirror) this.drawMirrorKey(k);
    else if (s.carrying) {
      ctx.strokeStyle = COLORS.amber; ctx.lineWidth = 2 / k;
      ctx.beginPath(); ctx.ellipse(s.player.x + .7, s.player.y - .3, .16, .16, 0, 0, TAU);
      ctx.moveTo(s.player.x + .86, s.player.y - .3); ctx.lineTo(s.player.x + 1.2, s.player.y - .3); ctx.lineTo(s.player.x + 1.2, s.player.y - .1); ctx.stroke();
    }
    for (const pop of this.popups) {
      const p = pop.age / pop.duration;
      if (pop.near) {
        ctx.globalAlpha = .22 * (1 - p); ctx.strokeStyle = pop.color; ctx.lineWidth = 2 / k;
        const r = .8 + (this.reducedMotion ? 0 : .12 * Math.sin(p * TAU));
        ctx.beginPath(); ctx.ellipse(pop.near.x, pop.near.y, r, r, 0, 0, TAU); ctx.stroke();
      }
      ctx.globalAlpha = 1 - p ** 2; ctx.fillStyle = pop.color;
      ctx.font = `700 ${(pop.big ? 20 : 14) / k * (1 + (this.reducedMotion ? 0 : .25 * (1 - ease(pop.age * 5))))}px system-ui, sans-serif`; ctx.textAlign = 'center';
      const maxWidth = b.w - 8 / k, halfWidth = Math.min(maxWidth, ctx.measureText(pop.text).width) / 2;
      const x = clamp(pop.x, halfWidth + 4 / k, b.w - halfWidth - 4 / k);
      const y = clamp(pop.y - (this.reducedMotion ? 0 : ease(p) * .9), 22 / k, b.h - 6 / k);
      ctx.strokeStyle = COLORS.card; ctx.lineWidth = 4 / k; ctx.lineJoin = 'round';
      ctx.strokeText(pop.text, x, y, maxWidth);
      ctx.fillText(pop.text, x, y, maxWidth);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    if (this.hurtFlash > 0) {
      const g = ctx.createRadialGradient(main.x + main.w / 2, main.y + main.h / 2, Math.min(main.w, main.h) * .3, main.x + main.w / 2, main.y + main.h / 2, Math.max(main.w, main.h) * .7);
      g.addColorStop(0, 'rgba(196,85,59,0)'); g.addColorStop(1, `rgba(196,85,59,${.35 * this.hurtFlash})`);
      ctx.fillStyle = g; ctx.fillRect(main.x, main.y, main.w, main.h);
    }
    this.drawHud(main);
  }

  drawHud(main) {
    const ctx = this.ctx, s = this.state, x = main.x + 16, y = main.y + 14;
    ctx.save(); ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    if (s.exploration) {
      ctx.font = '600 15px system-ui, sans-serif';
      (s.collection?.found || []).forEach((id, i) => { const friend = FRIENDS.find(f => f.id === id); ctx.fillStyle = friend.color; ctx.fillText(friend.icon, x + i * 23, y); });
      ctx.textAlign = 'right'; ctx.fillStyle = COLORS.slice; ctx.font = '600 11px system-ui, sans-serif';
      ctx.fillText(`S ${s.s.toFixed(2)}`, main.x + main.w - 16, main.y + main.h - 24);
      ctx.restore(); return;
    }
    ctx.fillStyle = COLORS.ink; ctx.font = '700 22px system-ui, sans-serif';
    ctx.fillText(String(s.score), x, y);
    const scoreWidth = ctx.measureText(String(s.score)).width;
    if (s.combo.count > 1) {
      ctx.fillStyle = s.combo.mult >= 2 ? COLORS.gold : COLORS.done; ctx.font = '700 14px system-ui, sans-serif';
      ctx.fillText(`×${s.combo.mult}`, x + scoreWidth + 8, y + 5);
      if (s.combo.remaining !== null) {
        ctx.fillStyle = COLORS.line; ctx.fillRect(x, y + 28, 70, 3);
        ctx.fillStyle = s.combo.mult >= 2 ? COLORS.gold : COLORS.done; ctx.fillRect(x, y + 28, 70 * clamp(s.combo.remaining / 4), 3);
      }
    }
    // Mode pips along the top edge.
    const pips = s.rings ? s.rings.results.map(r => r === 'hit' ? 'on' : 'off').concat(Array(s.rings.count - s.rings.results.length).fill(''))
      : s.locks ? Array.from({ length: s.locks.count }, (_, i) => i < s.locks.solved ? 'on' : '')
        : s.mirror ? s.mirror.locks.map(lock => lock.open ? 'on' : '')
          : s.storm ? Array.from({ length: s.storm.maxLives }, (_, i) => i < s.storm.lives ? 'heart' : 'lost')
            : s.shards.map(shard => shard.taken ? 'on' : '');
    const right = main.x + main.w - 16;
    pips.forEach((pip, i) => {
      const px = right - (pips.length - 1 - i) * 18, py = y + 10;
      ctx.beginPath();
      if (pip === 'heart' || pip === 'lost') { ctx.fillStyle = pip === 'heart' ? COLORS.danger : COLORS.line; ctx.ellipse(px, py, 6, 6, 0, 0, TAU); ctx.fill(); return; }
      if (s.shards.length && !s.rings && !s.locks && !s.mirror) diamond(ctx, px, py, 7); else ctx.ellipse(px, py, 6, 6, 0, 0, TAU);
      ctx.fillStyle = pip === 'on' ? (s.rings ? COLORS.done : s.locks || s.mirror ? COLORS.amber : COLORS.shard) : pip === 'off' ? '#e8c9bf' : 'transparent';
      ctx.fill(); ctx.strokeStyle = pip === 'off' ? COLORS.danger : COLORS.muted; ctx.lineWidth = 1.2; ctx.stroke();
    });
    if (s.storm) {
      ctx.textAlign = 'right'; ctx.fillStyle = COLORS.muted; ctx.font = '600 11px system-ui, sans-serif'; ctx.fillText(`第 ${s.storm.level} 波`, right - pips.length * 18 - 4, y + 4);
      if (s.storm.grazes) { ctx.fillStyle = COLORS.amber; ctx.fillText(`险过 ${s.storm.grazes}`, right, y + 29); }
    }
    if (s.mirror) { ctx.textAlign = 'right'; ctx.fillStyle = s.mirror.actions > s.mirror.par ? COLORS.danger : COLORS.muted; ctx.font = '600 11px system-ui, sans-serif'; ctx.fillText(`操作 ${s.mirror.actions} / ${s.mirror.par}`, right - pips.length * 18 - 4, y + 4); }
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillStyle = COLORS.slice; ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillText(`S ${s.s.toFixed(2)}`, right, main.y + main.h - 12);
    ctx.restore();
  }

  drawShards(k) {
    const ctx = this.ctx, s = this.state;
    for (const shard of s.shards) {
      if (shard.taken || !shard.visible) continue;
      const blink = shard.life !== null && shard.life < 2 && Math.floor(this.time * 8) % 2;
      if (blink) continue;
      const bob = this.reducedMotion ? 0 : Math.sin(this.time * 4 + shard.x) * .06, r = shard.golden ? .42 : .32;
      ctx.save(); ctx.translate(shard.x, shard.y + bob); ctx.rotate(this.reducedMotion ? 0 : Math.sin(this.time * 2 + shard.y) * .3);
      ctx.globalAlpha = .25; ctx.fillStyle = shard.golden ? COLORS.gold : COLORS.shard;
      ctx.beginPath(); ctx.ellipse(0, 0, r * 2, r * 2, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1; diamond(ctx, 0, 0, r); ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5 / k; ctx.stroke();
      ctx.restore();
    }
  }
  // Shards on other layers: a faint outline tagged with the height to go to;
  // it grows brighter as the player's slice gets closer.
  drawOffShards(k) {
    const ctx = this.ctx, s = this.state;
    for (const shard of s.shards) {
      if (shard.taken || shard.visible) continue;
      const mid = (shard.z[0] + shard.z[1]) / 2, near = clamp(1 - Math.abs(mid - s.s) / 4);
      ctx.save(); ctx.globalAlpha = .25 + near * .5; ctx.strokeStyle = ctx.fillStyle = shard.golden ? COLORS.gold : COLORS.shard; ctx.lineWidth = 1.2 / k;
      diamond(ctx, shard.x, shard.y, .18 + near * .12); ctx.stroke();
      ctx.font = `600 ${10 / k}px system-ui, sans-serif`; ctx.textAlign = 'center';
      ctx.fillText(mid.toFixed(1), shard.x, shard.y + .75);
      ctx.restore();
    }
  }

  drawHazard(hazard, k) {
    const ctx = this.ctx, pulse = this.reducedMotion ? 0 : (Math.sin(this.time * 10) + 1) * .5;
    ctx.save(); shapePath(ctx, hazard.shape);
    ctx.fillStyle = ROLES.hazard.fill; ctx.globalAlpha = .85; ctx.fill();
    ctx.globalAlpha = 1; ctx.strokeStyle = COLORS.danger; ctx.lineWidth = (2 + pulse * 1.5) / k; ctx.stroke();
    ctx.restore();
  }
  drawWarning(warning, k) {
    const ctx = this.ctx;
    ctx.save(); shapePath(ctx, warning.shape);
    ctx.globalAlpha = .7 - warning.eta * .5; ctx.strokeStyle = COLORS.danger; ctx.lineWidth = 1.5 / k; ctx.setLineDash([.2, .16]); ctx.stroke();
    ctx.restore();
  }

  drawRing(k) {
    const ctx = this.ctx, r = this.state.rings;
    if (!r.active || r.radius === null) return;
    const [x, y] = r.center, closeness = Number.isFinite(r.error) ? clamp(1 - r.error / .7) : 0, left = r.window === null ? 1 : clamp(1 - r.elapsed / r.window);
    const spawn = this.reducedMotion ? 1 : ease(r.elapsed * 4);
    ctx.save();
    ctx.strokeStyle = closeness > .86 ? COLORS.done : left < .3 ? COLORS.danger : COLORS.amber;
    ctx.globalAlpha = .5 + closeness * .5; ctx.lineWidth = (2 + closeness * 3) / k;
    ctx.setLineDash(closeness > .86 ? [] : [.25, .18]);
    ctx.beginPath(); ctx.ellipse(x, y, r.radius * spawn, r.radius * spawn, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    // Countdown arc just outside, hold progress on the ring itself.
    ctx.globalAlpha = .9; ctx.strokeStyle = left < .3 ? COLORS.danger : COLORS.muted; ctx.lineWidth = 2.5 / k;
    if (r.window !== null) { ctx.beginPath(); ctx.ellipse(x, y, r.radius + .35, r.radius + .35, 0, -Math.PI / 2, -Math.PI / 2 + TAU * left); ctx.stroke(); }
    if (r.hold > 0) { ctx.strokeStyle = COLORS.done; ctx.lineWidth = 6 / k; ctx.beginPath(); ctx.ellipse(x, y, r.radius, r.radius, 0, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(r.hold)); ctx.stroke(); }
    if (this.state.exploration) { ctx.fillStyle = COLORS.ink; ctx.font = `${12 / k}px system-ui`; ctx.textAlign = 'center'; ctx.fillText(r.near ? '换层接住' : '走到光环边', x, y - r.radius - .6); }
    ctx.restore();
  }

  drawVisitorFace() {
    const shape = this.state.sections.find(s => s.role === 'visitor')?.shape;
    if (!shape || shape.type !== 'circle' || shape.r < .45) return;
    const ctx = this.ctx, r = shape.r, happy = this.state.rings.hold > .1;
    ctx.save(); ctx.strokeStyle = ctx.fillStyle = '#397d93'; ctx.lineWidth = .05;
    for (const side of [-1, 1]) {
      const x = shape.cx + side * r * .27, y = shape.cy - r * .13;
      ctx.beginPath();
      if (happy) { ctx.arc(x, y, r * .08, Math.PI, TAU); ctx.stroke(); }
      else { ctx.ellipse(x, y, r * .055, r * .09, 0, 0, TAU); ctx.fill(); }
    }
    ctx.beginPath(); ctx.arc(shape.cx, shape.cy + r * .07, r * .16, .15, Math.PI - .15); ctx.stroke(); ctx.restore();
  }

  drawLockTarget(k) {
    const ctx = this.ctx, l = this.state.locks;
    for (const print of l.prints || []) { ctx.save(); shapePath(ctx, print); ctx.globalAlpha = .18; ctx.fillStyle = COLORS.done; ctx.fill(); ctx.restore(); }
    if (!l.target || !l.active) return;
    const c = l.closeness, wobble = this.reducedMotion ? 0 : Math.sin(this.time * 5) * .02;
    ctx.save(); shapePath(ctx, l.target);
    ctx.fillStyle = COLORS.amber; ctx.globalAlpha = .08 + clamp(l.hold) * .4; ctx.fill();
    ctx.globalAlpha = .55 + c * .45; ctx.strokeStyle = c > .9 ? COLORS.done : COLORS.amber; ctx.lineWidth = (2 + c * 3 + wobble * 40) / k;
    ctx.setLineDash(c > .9 ? [] : [.22, .14]); ctx.stroke();
    if (l.stamp) { const [x, y] = l.stamp; ctx.globalAlpha = 1; ctx.fillStyle = COLORS.ink; ctx.font = `${11 / k}px system-ui`; ctx.textAlign = 'center'; ctx.fillText('拓印点', x, y + 2.3); }
    ctx.restore();
  }

  mirrorVertices() {
    const m = this.state.mirror;
    if (!m.motion) return keyPoints(m.chirality, m.turns).map(([x, y]) => [x, y, 0]);
    const p = m.motion.progress;
    return flipVertices(m.motion.fromChirality, m.motion.fromTurns, this.reducedMotion ? p < .4 ? 0 : p < .6 ? .5 : 1 : p);
  }
  drawMirrorKey(k) {
    const ctx = this.ctx, s = this.state, at = s.mirror.motion || s.mirror.onPad ? [10, 6] : [s.player.x + 1.1, s.player.y - .5];
    const points = this.mirrorVertices().map(([x, y]) => [at[0] + x, at[1] + y]);
    ctx.save(); shapePath(ctx, { type: 'polygon', points });
    ctx.fillStyle = '#eed08a'; ctx.strokeStyle = COLORS.amber; ctx.lineWidth = 2 / k; ctx.fill(); ctx.stroke();
    if (s.mirror.motion) {
      ctx.setLineDash([.18, .12]); ctx.strokeStyle = COLORS.slice; ctx.lineWidth = 1 / k;
      ctx.beginPath(); ctx.moveTo(at[0] - 1.7, at[1]); ctx.lineTo(at[0] + 1.7, at[1]); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.restore();
  }
  drawMirrorLocks(k) {
    const ctx = this.ctx;
    for (const lock of this.state.mirror.locks) {
      const flash = this.flash.get(lock.id), jitter = flash !== undefined && flash < .3 && !this.reducedMotion ? Math.sin(flash * 80) * .12 : 0;
      ctx.save(); ctx.translate(jitter, 0); shapePath(ctx, keyShape(lock.x, lock.y, lock.chirality, lock.turns));
      ctx.fillStyle = lock.open ? '#cfe5d6' : '#e3e6dc'; ctx.fill();
      ctx.strokeStyle = lock.open ? COLORS.done : flash !== undefined && flash < FLASH ? COLORS.danger : '#5b7166';
      ctx.lineWidth = (lock.open ? 3 : 2) / k; ctx.setLineDash(lock.open ? [] : [.16, .1]); ctx.stroke();
      ctx.restore();
    }
  }
  drawMirrorSide(box) {
    const ctx = this.ctx, s = this.state;
    this.card(box);
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2, k = Math.max(1, Math.min((box.w - 48) / 4, (box.h - 60) / 4));
    ctx.save(); ctx.translate(cx, cy);
    ctx.strokeStyle = COLORS.grid; ctx.lineWidth = 1;
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(-2 * k, i * k); ctx.lineTo(2 * k, i * k); ctx.stroke(); }
    ctx.strokeStyle = COLORS.slice; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-2 * k, 0); ctx.lineTo(2 * k, 0); ctx.stroke();
    if (s.carrying) {
      ctx.setLineDash([4, 4]); ctx.strokeStyle = '#c7b7a0'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(0, 0, 1.4 * k, 1.4 * k, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      const points = this.mirrorVertices().map(([, y, z]) => [y * k, -z * k]);
      shapePath(ctx, { type: 'polygon', points }); ctx.strokeStyle = COLORS.amber; ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.stroke();
      ctx.fillStyle = COLORS.ink; ctx.beginPath(); ctx.ellipse(0, 0, 3, 3, 0, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  drawLabel(label, shape, k) {
    const ctx = this.ctx, [x] = shapeCentroid(shape);
    const top = shape.type === 'circle' ? shape.cy - shape.r : Math.min(...shape.points.map(point => point[1]));
    ctx.save(); ctx.fillStyle = COLORS.ink; ctx.font = `600 ${11 / k}px system-ui, sans-serif`; ctx.textAlign = 'center';
    ctx.fillText(label, x, top - .25); ctx.restore();
  }
  drawGhost(ghost, k) {
    const ctx = this.ctx;
    ctx.save(); shapePath(ctx, ghost.shape);
    ctx.fillStyle = ghost.role === 'item' ? '#ead08a' : '#b7adcb'; ctx.globalAlpha = .22; ctx.fill();
    ctx.globalAlpha = .75; ctx.strokeStyle = ghost.lantern ? ghost.direction > 0 ? '#bc872f' : '#528b9a' : '#78658f'; ctx.setLineDash([.16, .14]); ctx.lineWidth = 1.5 / k; ctx.stroke();
    ctx.restore();
  }
  drawGuard(guard, k, ghost, walls = []) {
    const ctx = this.ctx;
    ctx.save();
    if (!ghost) {
      shapePath(ctx, { type: 'polygon', points: sightFan(guard, walls) });
      ctx.fillStyle = guard.alert ? COLORS.danger : '#cd9a65'; ctx.globalAlpha = .22; ctx.fill();
    }
    ctx.globalAlpha = ghost ? .6 : 1; ctx.strokeStyle = ghost ? '#78658f' : guard.alert ? COLORS.danger : '#97643d';
    ctx.fillStyle = ghost ? '#ded7e9' : '#eacda7'; ctx.lineWidth = 2 / k;
    if (ghost) ctx.setLineDash([.12, .12]);
    ctx.beginPath(); ctx.ellipse(guard.x, guard.y, guard.r, guard.r, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(guard.x, guard.y);
    ctx.lineTo(guard.x + Math.cos(guard.facing) * .55, guard.y + Math.sin(guard.facing) * .55); ctx.stroke();
    if (guard.alert) { ctx.fillStyle = COLORS.danger; ctx.font = `800 ${16 / k}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.fillText('！', guard.x, guard.y - .6); }
    ctx.restore();
  }
  drawSection(section, scale, k, alpha) {
    if (scale <= 0) return;
    const ctx = this.ctx, colors = role(section.role), flash = this.flash.get(section.id);
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
  drawPlayer(k) {
    const ctx = this.ctx, s = this.state, p = s.player;
    if (s.dying) return;
    if (s.safe > 0 && Math.floor(this.time * 12) % 2 && !this.reducedMotion) return;
    for (const t of this.trail) {
      ctx.globalAlpha = (1 - t.age / .35) * .18; ctx.fillStyle = COLORS.ink;
      ctx.beginPath(); ctx.ellipse(t.x, t.y, p.r * (1 - t.age), p.r * (1 - t.age), 0, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (s.storm?.nearMiss) {
      ctx.strokeStyle = COLORS.gold; ctx.lineWidth = 2 / k;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r + .18, p.r + .18, 0, 0, TAU); ctx.stroke();
    }
    const bob = this.reducedMotion ? 0 : Math.sin(this.time * 3) * .03, squash = this.reducedMotion ? 0 : this.squash * .22;
    ctx.save(); ctx.translate(p.x, p.y);
    ctx.fillStyle = COLORS.ink; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2 / k;
    ctx.beginPath(); ctx.ellipse(0, 0, (p.r + bob) * (1 + squash), (p.r + bob) * (1 - squash), 0, 0, TAU); ctx.fill(); ctx.stroke();
    const ex = Math.cos(p.facing) * p.r * .42, ey = Math.sin(p.facing) * p.r * .42;
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(ex, ey, p.r * .24, p.r * .24, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = COLORS.ink; ctx.beginPath(); ctx.ellipse(ex + Math.cos(p.facing) * .04, ey + Math.sin(p.facing) * .04, p.r * .1, p.r * .1, 0, 0, TAU); ctx.fill();
    ctx.restore();
    if (s.returning > 0) {
      ctx.strokeStyle = COLORS.danger; ctx.lineWidth = 3 / k;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, .7, .7, 0, 0, TAU); ctx.stroke();
    }
  }

  // Side view (X across, S up). The storm stretches height up to 1.8x so
  // incoming hazards stay readable; strokes are drawn in screen pixels.
  drawSide(box) {
    const ctx = this.ctx, s = this.state, dpr = this.view.dpr;
    if (s.mirror) { this.drawMirrorSide(box); return; }
    this.card(box);
    const compact = box.h < 120;
    const top = box.y + (compact ? 10 : 22), left = box.x + 26, w = box.w - 38, h = Math.max(36, box.h - (compact ? 20 : 44));
    // Frame the X span that holds something; storms use the whole width.
    const xs = s.storm || s.sideView === 'player-only' ? [0, s.bounds.w] : [s.player.x - 1, s.player.x + 1, ...s.shards.flatMap(shard => [shard.x - 1, shard.x + 1])];
    for (const item of s.profiles) {
      if (item.profile.type === 'circle') xs.push(item.profile.cx - item.profile.r - 1, item.profile.cx + item.profile.r + 1);
      else for (const [x] of item.profile.points) xs.push(x - 1, x + 1);
    }
    let x0 = Math.max(0, Math.min(...xs)), x1 = Math.min(s.bounds.w, Math.max(...xs));
    if (x1 - x0 < 8) { const mid = (x0 + x1) / 2; x0 = Math.max(0, mid - 4); x1 = Math.min(s.bounds.w, x0 + 8); }
    const range = s.slice.max - s.slice.min;
    const kx = w / (x1 - x0), kz = Math.min(h / range, kx * (s.storm ? 1.8 : 1));
    const ox = left - x0 * kx, base = top + (h + range * kz) / 2;
    const toY = z => base - (z - s.slice.min) * kz;
    const screenStroke = (style, width) => { ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.strokeStyle = style; ctx.lineWidth = width; ctx.stroke(); ctx.restore(); };
    ctx.save();
    ctx.fillStyle = COLORS.muted; ctx.font = '500 9px system-ui, sans-serif'; ctx.textAlign = 'right';
    const tickStep = kz < 10 ? 2 : 1;
    for (let z = s.slice.min; z <= s.slice.max + 1e-9; z++) {
      ctx.strokeStyle = COLORS.grid; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(ox + x0 * kx, toY(z)); ctx.lineTo(ox + x1 * kx, toY(z)); ctx.stroke();
      if (Math.round(z - s.slice.min) % tickStep === 0 || Math.abs(z - s.slice.max) < 1e-6) {
        ctx.fillText(String(z), ox + x0 * kx - 6, toY(z) + 3);
      }
    }
    if (s.locks && !s.locks.revealed) {
      ctx.fillStyle = COLORS.line; ctx.font = `700 ${Math.round(range * kz * .45)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('?', ox + 10 * kx, toY(s.slice.min + range / 2)); ctx.textBaseline = 'alphabetic';
    }
    ctx.beginPath(); ctx.rect(ox + x0 * kx, toY(s.slice.max) - 4, (x1 - x0) * kx, range * kz + 8); ctx.clip();
    ctx.translate(ox, base); ctx.scale(kx, -kz); ctx.translate(0, -s.slice.min);
    const visible = new Set([...s.sections.map(section => section.id), ...(s.hazards || []).map(item => item.id)]);
    for (const item of s.profiles) {
      const colors = role(item.role), flash = this.flash.get(item.id);
      shapePath(ctx, item.profile);
      ctx.globalAlpha = visible.has(item.id) ? .9 : .45;
      ctx.fillStyle = colors.fill; ctx.fill();
      screenStroke(colors.stroke, 1.5);
      if (flash !== undefined && flash < FLASH) { ctx.globalAlpha = 1 - flash / FLASH; screenStroke(COLORS.danger, 4); }
    }
    ctx.globalAlpha = 1;
    for (const shard of s.shards) {
      if (shard.taken) continue;
      ctx.fillStyle = shard.golden ? COLORS.gold : COLORS.shard; ctx.globalAlpha = shard.visible ? 1 : .7;
      ctx.fillRect(shard.x - .22, shard.z[0], .44, shard.z[1] - shard.z[0]);
    }
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.moveTo(x0, s.s); ctx.lineTo(x1, s.s); screenStroke(COLORS.slice, 2);
    ctx.beginPath(); ctx.moveTo(s.player.x - s.player.r, s.s); ctx.lineTo(s.player.x + s.player.r, s.s); screenStroke(COLORS.ink, 5);
    ctx.restore();
  }
}
