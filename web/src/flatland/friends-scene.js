import { FRIENDS } from './discoveries.js';
import { keyShape } from './mirror.js';
const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function drawCreature(ctx, id, x, y, time, { scale = 1, lookX = 0, lookY = 0, asleep = false, happy = false, ghost = false, crowned = false } = {}) {
  const friend = FRIENDS.find(f => f.id === id);
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
  ctx.globalAlpha = ghost ? .35 : 1;
  ctx.fillStyle = friend.color; ctx.strokeStyle = '#fffdf0'; ctx.lineWidth = .05;
  const bob = Math.sin(time * 4) * .04;
  ctx.translate(0, bob);
  if (id === 'sprout') {
    ctx.beginPath(); ctx.ellipse(-.18, -.47, .13, .31, -.3, 0, TAU); ctx.ellipse(.18, -.47, .13, .31, .3, 0, TAU); ctx.fill();
  } else if (id === 'lantern') {
    ctx.globalAlpha = ghost ? .12 : .12 + .06 * Math.sin(time * 3);
    ctx.beginPath(); ctx.ellipse(0, 0, .9, .9, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = ghost ? .35 : 1;
    ctx.beginPath(); ctx.moveTo(0, -.65); ctx.lineTo(.12, -.38); ctx.lineTo(-.12, -.38); ctx.closePath(); ctx.fill();
  } else {
    ctx.beginPath(); ctx.moveTo(.25, .15); ctx.bezierCurveTo(1, .5, .9, -.8, .35, -.6); ctx.bezierCurveTo(.7, -.4, .55, .2, .25, -.05); ctx.fill();
  }
  ctx.beginPath(); ctx.ellipse(0, 0, .37, id === 'lantern' ? .41 : .32, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = ctx.fillStyle = '#fffdf0'; ctx.lineWidth = .045;
  for (const dx of [-.13, .13]) {
    ctx.beginPath();
    if (asleep || happy) { ctx.moveTo(dx - .06, -.03); ctx.quadraticCurveTo(dx, happy ? -.14 : .02, dx + .06, -.03); ctx.stroke(); }
    else { ctx.ellipse(dx + lookX * .035, -.05 + lookY * .025, .045, .065, 0, 0, TAU); ctx.fill(); }
  }
  if (happy) { ctx.beginPath(); ctx.arc(0, .06, .09, 0, Math.PI); ctx.stroke(); }
  if (crowned) {
    const top = id === 'sprout' ? -.78 : -.55;
    ctx.strokeStyle = '#4c8b62'; ctx.lineWidth = .055;
    ctx.beginPath(); ctx.moveTo(-.3, top); ctx.quadraticCurveTo(0, top - .18, .3, top); ctx.stroke();
    for (const dx of [-.24, 0, .24]) {
      const fy = top - (dx === 0 ? .11 : .03);
      ctx.fillStyle = '#fff4d9';
      for (let i = 0; i < 5; i++) {
        const a = i * TAU / 5;
        ctx.beginPath(); ctx.ellipse(dx + Math.cos(a) * .075, fy + Math.sin(a) * .075, .065, .045, a, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = '#d6a63b'; ctx.beginPath(); ctx.arc(dx, fy, .04, 0, TAU); ctx.fill();
    }
  }
  ctx.restore();
}

export function drawEncounter(renderer, k) {
  const s = renderer.state, e = s.encounter, ctx = renderer.ctx;
  if (!e) return;
  const time = renderer.reducedMotion ? 0 : renderer.time;
  ctx.save();
  if (e.kind === 'home') {
    for (let i = 0; i < 7; i++) {
      const a = i * TAU / 7, x = e.x + Math.cos(a) * .8, y = e.y + Math.sin(a) * .5;
      ctx.fillStyle = i % 2 ? '#cfa24b' : '#79a77a'; ctx.beginPath(); ctx.ellipse(x, y, .12, .2, a, 0, TAU); ctx.fill();
    }
  } else if (e.visible || e.peeking) {
    const d = Math.max(.01, Math.hypot(s.player.x - e.x, s.player.y - e.y));
    drawCreature(ctx, e.id, e.x, e.y, time, { lookX: (s.player.x - e.x) / d, lookY: (s.player.y - e.y) / d,
      asleep: e.kind === 'peek' && e.step === 0, ghost: e.peeking, happy: e.hold > .1 });
    if (e.kind === 'peek' && e.step === 0) {
      ctx.fillStyle = '#a28656'; ctx.font = `${12 / k}px system-ui`; ctx.fillText('z z', e.x + .3, e.y - .7);
    }
    if (e.kind === 'mirror') {
      const shape = keyShape(0, 0, e.chirality, e.turns);
      shape.points = shape.points.map(([x, y]) => [e.x + x * .55, e.y + 1 + y * .55]);
      ctx.strokeStyle = '#9673af'; ctx.lineWidth = 1.7 / k; ctx.setLineDash([.12, .1]); ctx.beginPath();
      shape.points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.stroke();
    }
    if (e.hold > 0) { ctx.strokeStyle = '#e3b348'; ctx.lineWidth = 3 / k; ctx.beginPath(); ctx.arc(e.x, e.y, .65, -Math.PI / 2, -Math.PI / 2 + TAU * e.hold); ctx.stroke(); }
  } else if (e.trace) {
    ctx.strokeStyle = '#77a88a'; ctx.lineWidth = 1.5 / k; ctx.globalAlpha = e.nearby ? .8 : .45;
    // A pair of ears and a drifting speck invite investigation, without a target number.
    for (const dx of [-.14, .14]) { ctx.beginPath(); ctx.ellipse(e.x + dx, e.y, .09, .19, dx, 0, TAU); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(e.x - .12, e.y - e.direction * .6); ctx.lineTo(e.x, e.y - e.direction * .78); ctx.lineTo(e.x + .12, e.y - e.direction * .6); ctx.stroke();
  }
  ctx.restore();
}

export function drawCompanions(renderer) {
  const s = renderer.state, ctx = renderer.ctx, selected = s.collection?.companion;
  if (!selected) return;
  const friends = selected === 'all' ? FRIENDS : FRIENDS.filter(f => f.id === selected);
  friends.forEach((friend, i) => {
    if ((friend.id === 'sprout' && s.companions?.probe) || (friend.id === 'ribbon' && s.companions?.mirror)) return;
    const trail = renderer.trail[Math.max(0, renderer.trail.length - 8 - i * 6)] || s.player;
    const a = s.player.facing + Math.PI + (i - (friends.length - 1) / 2) * .8;
    const cheer = s.endless ? renderer.friendCheer || 0 : 0;
    const happy = s.petting > 0 || cheer > 0, play = happy && !renderer.reducedMotion;
    const x = clamp(trail.x + Math.cos(a) * (.8 + i * .25), .6, s.bounds.w - .6);
    const y = clamp(trail.y + Math.sin(a) * (.8 + i * .25) - (play ? Math.abs(Math.sin((cheer || s.petting) * 7 + i)) * .55 : 0), .7, s.bounds.h - .5);
    drawCreature(ctx, friend.id, x, y, renderer.reducedMotion ? 0 : renderer.time, { scale: .75, happy, crowned: s.gardenCollection?.complete });
    if (friend.id === 'sprout') for (const [j, t] of renderer.trail.entries()) {
      if (j % 5) continue;
      ctx.save(); ctx.globalAlpha = .3 * (1 - t.age / .35); ctx.fillStyle = friend.color;
      ctx.beginPath(); ctx.ellipse(t.x, t.y + .2, .07, .15, j, 0, TAU); ctx.fill(); ctx.restore();
    }
  });
}

export function gardenPadHint(s) {
  const g = s.companions?.garden;
  if (g?.bloomed) return '花园点亮了';
  if (g?.mirrorOpen) return '花匣开了';
  if (!s.collection?.found?.includes('ribbon')) return '需要一位\n懂倒影的朋友';
  if (!['ribbon', 'all'].includes(s.collection.companion)) return '在「朋友」里\n带上反反';
  return s.companions.mirror ? '和反反一起站稳' : '按 B 同步\n和反反一起站稳';
}

// Draw the nearby instruction after world shapes so a large section cannot hide it.
export function drawGardenPadHint(renderer, k) {
  const s = renderer.state, g = s.companions?.garden;
  if (!g || Math.abs(s.s - g.left.z) > .35) return;
  const pad = [g.left, g.right].find(p => Math.hypot(s.player.x - p.x, s.player.y - p.y) < 2);
  if (!pad) return;
  const ctx = renderer.ctx, lines = gardenPadHint(s).split('\n');
  ctx.save(); ctx.font = `${11 / k}px system-ui`; ctx.textAlign = 'center';
  const width = Math.max(...lines.map(line => ctx.measureText(line).width)) + 10 / k;
  const x = clamp(pad.x, width / 2, s.bounds.w - width / 2), bottom = pad.y - .8;
  ctx.globalAlpha = .94; ctx.fillStyle = '#f8f9f2';
  ctx.fillRect(x - width / 2, bottom - (lines.length * 13 - 1) / k, width, (lines.length * 13 + 4) / k);
  ctx.globalAlpha = 1; ctx.fillStyle = '#78658f';
  lines.forEach((line, i) => ctx.fillText(line, x, bottom - (lines.length - 1 - i) * 13 / k));
  ctx.restore();
}

export function drawCompanionToys(renderer, k) {
  const s = renderer.state, ctx = renderer.ctx, c = s.companions;
  if (!c?.enabled) return;
  const time = renderer.reducedMotion ? 0 : renderer.time;
  ctx.save();
  if (c.radius) {
    ctx.beginPath(); ctx.rect(0, 0, s.bounds.w, s.bounds.h); ctx.clip();
    ctx.beginPath(); ctx.arc(s.player.x, s.player.y, c.radius, 0, TAU);
    ctx.fillStyle = '#e8c767'; ctx.globalAlpha = .08; ctx.fill();
    ctx.globalAlpha = .5; ctx.strokeStyle = '#bc872f'; ctx.lineWidth = 1 / k; ctx.setLineDash([.08, .15]); ctx.stroke();
    ctx.clip(); ctx.globalAlpha = 1;
    for (const ghost of s.lanternGhosts) renderer.drawGhost(ghost, k);
  }
  ctx.restore();
  const g = c.garden;
  if (!g) return;
  ctx.save(); ctx.lineWidth = 2 / k;
  if (c.mirror) {
    ctx.save(); ctx.globalAlpha = .35; ctx.strokeStyle = '#8c6cad'; ctx.setLineDash([.18, .18]);
    ctx.beginPath(); ctx.moveTo(g.axis, .8); ctx.lineTo(g.axis, s.bounds.h - .8); ctx.stroke();
    ctx.font = `${10 / k}px system-ui`; ctx.fillStyle = '#8c6cad'; ctx.textAlign = 'center'; ctx.fillText('镜面线', g.axis, .6); ctx.restore();
  }
  const visible = Math.abs(s.s - g.left.z) <= .35;
  for (const [i, pad] of [g.left, g.right].entries()) {
    if (g.petals || g.bloomed) {
      ctx.save(); ctx.globalAlpha = visible ? 1 : .35;
      for (let n = 0; n < (g.bloomed ? 9 : g.petals * 2); n++) {
        const a = n * TAU / 9, x = pad.x + Math.cos(a) * .95, y = pad.y + Math.sin(a) * .65;
        ctx.fillStyle = n % 2 ? '#e5b649' : '#69a975'; ctx.beginPath(); ctx.ellipse(x, y, .1, .18, a, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
    ctx.globalAlpha = visible ? 1 : .22;
    ctx.strokeStyle = g.mirrorOpen ? '#4d9270' : '#8c6cad';
    ctx.fillStyle = g.mirrorOpen ? '#d2e8bd' : '#ece0f2';
    ctx.setLineDash(visible ? [] : [.12, .15]);
    ctx.beginPath(); ctx.ellipse(pad.x, pad.y, .65, .42, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.font = `${15 / k}px system-ui`; ctx.textAlign = 'center'; ctx.fillStyle = '#8c6cad';
    ctx.fillText(g.mirrorOpen ? '✿' : i ? '❧' : '◇', pad.x, pad.y + .13);
    if (g.hold && !g.mirrorOpen) {
      ctx.setLineDash([]); ctx.beginPath(); ctx.arc(pad.x, pad.y, .75, -Math.PI / 2, -Math.PI / 2 + TAU * g.hold); ctx.stroke();
    }
  }
  const budVisible = Math.abs(s.s - g.bud.z) <= .45;
  ctx.globalAlpha = budVisible ? 1 : .25; ctx.fillStyle = '#4d9270';
  ctx.font = `${22 / k}px system-ui`; ctx.fillText(g.probeOpen ? '✿' : '♧', g.bud.x, g.bud.y + .2);
  ctx.restore();
  if (c.probe) {
    const p = c.probe, ghost = Math.abs(p.z - s.s) > .35;
    ctx.save(); ctx.strokeStyle = '#4d9270'; ctx.lineWidth = 1.5 / k; ctx.setLineDash([.1, .18]);
    ctx.beginPath(); ctx.moveTo(s.player.x, s.player.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    drawCreature(ctx, 'sprout', p.x, p.y, time, { scale: .8, ghost, happy: true, crowned: s.gardenCollection?.complete });
    ctx.font = `${11 / k}px system-ui`; ctx.textAlign = 'center'; ctx.fillStyle = '#386f53';
    ctx.fillText(`S ${p.z.toFixed(1)} · ${p.remaining.toFixed(1)}s`, p.x, p.y - .85); ctx.restore();
  }
  if (c.mirror && !c.mirror.outside) {
    const p = c.mirror;
    drawCreature(ctx, 'ribbon', p.x, p.y, time, { scale: .9, ghost: p.blocked, happy: g.hold > 0, crowned: s.gardenCollection?.complete });
    ctx.save(); ctx.font = `${11 / k}px system-ui`; ctx.textAlign = 'center'; ctx.fillStyle = '#8c6cad';
    ctx.fillText(p.blocked ? '这一侧有墙' : '同步中', p.x, p.y - .8); ctx.restore();
  }
}
