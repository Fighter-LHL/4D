import { projectFloor, unprojectFloor } from './ascend.js';
import { FRIENDS } from './discoveries.js';
import { drawCreature } from './friends-scene.js';
const mix = (a, b, t) => a + (b - a) * t;
function polygon(ctx, points, fill, stroke) {
  ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}

export function drawAscendScene(renderer, view, dt) {
  const ctx = renderer.ctx, state = renderer.state, a = state.ascend;
  const moving = a.stage === 'transition';
  const t = moving ? a.progress : 1;
  const blend = renderer.reducedMotion ? Number(t >= .5) : t * t * (3 - 2 * t);
  const box = { x: 14, y: 14, w: view.width - 28, h: view.height - 28 };
  renderer.card(box);
  const raw = (x, y, z) => { const [u, v] = projectFloor(x, z, blend); return [u, v - y * blend]; };
  const extent = [[0,0,0],[20,0,0],[20,0,12],[0,0,12],[7,3.35,3.5],[13,3.35,8.5]].map(p => raw(...p));
  const minX = Math.min(...extent.map(p => p[0])), maxX = Math.max(...extent.map(p => p[0]));
  const minY = Math.min(...extent.map(p => p[1])), maxY = Math.max(...extent.map(p => p[1]));
  const k = Math.max(.1, Math.min((box.w - 48) / (maxX - minX), (box.h - 78) / (maxY - minY)));
  const ox = box.x + box.w / 2 - (minX + maxX) / 2 * k, oy = box.y + 38 + (box.h - 78) / 2 - (minY + maxY) / 2 * k;
  const project = (x, y, z) => { const [u, v] = raw(x, y, z); return [ox + u * k, oy + v * k]; };
  renderer.dimensionView = { ox, oy, k, blend };
  renderer.volumeOpacity ||= new Map();
  const prism = (item, opacity) => {
    const [x0, y0, z0] = item.min, [x1, y1, z1] = item.max;
    const colors = item.role === 'goal' ? ['#efdba6','#cfb57a','#f9ebc8'] : item.role === 'floor' ? ['#d9e3d2','#afc7b3','#e9efdf'] : ['#b7d1c5','#8daea2','#d8e7dc'];
    ctx.save(); ctx.globalAlpha = opacity;
    polygon(ctx, [project(x0,y0,z1),project(x1,y0,z1),project(x1,y1,z1),project(x0,y1,z1)], colors[0], '#6d9385');
    polygon(ctx, [project(x1,y0,z0),project(x1,y0,z1),project(x1,y1,z1),project(x1,y1,z0)], colors[1], '#6d9385');
    polygon(ctx, [project(x0,y1,z0),project(x1,y1,z0),project(x1,y1,z1),project(x0,y1,z1)], colors[2], '#6d9385');
    if (renderer.flash.has(item.id) && renderer.flash.get(item.id) < .7) {
      ctx.globalAlpha = 1; ctx.lineWidth = 3;
      ctx.strokeStyle = '#bd6146'; ctx.stroke();
    }
    ctx.restore();
  };
  prism(a.boxes.find(item => item.role === 'floor'), 1);
  ctx.save(); ctx.strokeStyle = '#cfdaca'; ctx.lineWidth = .7;
  for (let x = 0; x <= 20; x++) { ctx.beginPath(); ctx.moveTo(...project(x,0,0)); ctx.lineTo(...project(x,0,12)); ctx.stroke(); }
  for (let z = 0; z <= 12; z++) { ctx.beginPath(); ctx.moveTo(...project(0,0,z)); ctx.lineTo(...project(20,0,z)); ctx.stroke(); }
  ctx.restore();
  for (const item of a.boxes.filter(item => item.role !== 'floor' && item.role !== 'roof')) {
    const desired = item.present ? 1 : 0, before = renderer.volumeOpacity.get(item.id) ?? desired;
    const opacity = renderer.reducedMotion ? desired : before + (desired - before) * Math.min(1, dt * 12);
    renderer.volumeOpacity.set(item.id, opacity);
    if (opacity > .01) prism(item, opacity * (item.role === 'wall' ? .65 : 1));
    // A swept W change stops just before the wall exists. Briefly reveal that
    // impending volume so its absence does not hide the collision feedback.
    if (!item.present && renderer.flash.has(item.id) && renderer.flash.get(item.id) < .7) prism(item, .3);
    if (!item.present) {
      ctx.save(); ctx.globalAlpha = .5; ctx.setLineDash([4,4]);
      polygon(ctx, [project(item.min[0],0,item.min[2]),project(item.max[0],0,item.min[2]),project(item.max[0],0,item.max[2]),project(item.min[0],0,item.max[2])], null, '#889d91'); ctx.restore();
    }
  }
  const player = moving ? { x: mix(a.fromPlayer.x, 10, blend), y: .4 * blend, z: mix(a.fromPlayer.y, 6, blend) } : a.position;
  const [px, py] = project(player.x, player.y, player.z), [sx, sy] = project(player.x, 0, player.z);
  ctx.save(); ctx.fillStyle = '#28483b26'; ctx.beginPath(); ctx.ellipse(sx, sy, .65 * k, .24 * k, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#294b46'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(px, py, .4*k, .4*k, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(px+.12*k,py-.12*k,.11*k,.11*k,0,0,Math.PI*2); ctx.fill(); ctx.restore();
  const friends = state.collection?.companion === 'all' ? FRIENDS : FRIENDS.filter(f => f.id === state.collection?.companion);
  friends.forEach((friend, i) => {
    const [x, y] = project(Math.max(.6, player.x - .9 - i * .65), player.y, player.z + .45);
    drawCreature(ctx, friend.id, x, y, renderer.reducedMotion ? 0 : renderer.time, { scale: k * .7, happy: state.petting > 0, crowned: state.gardenCollection?.complete });
  });
  const roof = a.boxes.find(item => item.role === 'roof');
  if (roof.present && blend > 0) prism(roof, .22 * blend);
  const [gx, gy] = project(17, 1.1, 6);
  ctx.fillStyle = '#8b6527'; ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'center';
  if (a.boxes.find(item => item.role === 'goal').present) ctx.fillText(state.phase === 'complete' ? '✓' : '出口', gx, gy - 12);
  ctx.textAlign = 'right'; ctx.font = '600 22px system-ui, sans-serif'; ctx.fillStyle = '#397d93';
  ctx.globalAlpha = 1 - blend; ctx.fillText('Z',box.x+box.w-24,box.y+32);
  ctx.globalAlpha = blend; ctx.fillText('W',box.x+box.w-24,box.y+32); ctx.globalAlpha = 1;
  if (!moving) { ctx.font = '600 12px system-ui, sans-serif'; ctx.fillText(state.s.toFixed(2), box.x + box.w - 24, box.y + 50); }
}

export function ascendScreenToWorld(renderer, clientX, clientY) {
  if (!renderer.dimensionView || renderer.state.ascend.stage !== 'volume') return null;
  const rect = renderer.canvas.getBoundingClientRect(), { ox, oy, k, blend } = renderer.dimensionView;
  const point = unprojectFloor((clientX - rect.left - ox) / k, (clientY - rect.top - oy) / k, blend);
  return point.x >= 0 && point.x <= 20 && point.y >= 0 && point.y <= 12 ? point : null;
}
