import { FRIENDS, normalizeCollection } from './flatland/discoveries.js';
import { drawCreature } from './flatland/friends-scene.js';
import { gardenCollection } from './flatland/companions.js';
import { FLATLAND_LEVELS } from './flatland/levels.js';

export function courtyardFriends(saved, gardens) {
  const { found } = normalizeCollection(saved);
  const crowned = gardenCollection(gardens, FLATLAND_LEVELS).complete;
  return FRIENDS.filter(friend => found.includes(friend.id)).map(friend => ({ ...friend, crowned }));
}
export function friendGuideText(state, friends = []) {
  if (!state?.companionGuide) return '';
  const g = state.companionGuide, friend = friends[0];
  const targetName = state.nodes?.find(n => n.id === g.node)?.name || '目标平台';
  if (!friend) {
    if (!g.aligned) return `提示：切到${['Ⅰ', 'Ⅱ', 'Ⅲ'][g.layer]}层 · ${['Z', 'X', 'C'][g.layer]} 换层（${targetName}）`;
    return g.kind === 'activate' ? `提示：按 E 启动${targetName}`
      : g.kind === 'shift' ? `提示：保持当前位置，继续换层显现${targetName}`
        : `提示：前往${targetName} · 点平台预览，再点稳行`;
  }
  if (!g.aligned) return `${friend.name}在${['Ⅰ', 'Ⅱ', 'Ⅲ'][g.layer]}层招手 · ${['Z', 'X', 'C'][g.layer]} 换层`;
  return g.kind === 'activate' ? `${friend.name}围着脚下发光 · E 启动`
    : g.kind === 'shift' ? `${friend.name}在这里等你，继续换层`
      : `${friend.name}在前面等你 · 点平台预览，再点稳行`;
}

// Presentation only. Guide data comes from the same authored route that the
// game uses for its next step, including co-located mechanisms in other W layers.
export function drawCourtyardFriends(renderer) {
  renderer.friendTargets = [];
  const friends = renderer.friends || [], s = renderer.state;
  const ctx = renderer.ctx, p = renderer.playerPosition(), g = s?.companionGuide;
  if (!friends.length) {
    if (!g) return;
    ctx.save(); ctx.strokeStyle = '#2b6b59'; ctx.fillStyle = '#2b6b59';
    ctx.globalAlpha = .7; ctx.lineWidth = 2; ctx.setLineDash(g.aligned ? [] : [5, 6]);
    ctx.beginPath(); ctx.ellipse(g.x, g.y - 10, 58, 30, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(g.x, g.y - 10); ctx.globalAlpha = .25; ctx.stroke();
    ctx.globalAlpha = 1; ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(`${['Ⅰ', 'Ⅱ', 'Ⅲ'][g.layer]} · ${g.aligned ? '这边' : '换到这一层'}`, g.x, g.y - 53);
    ctx.restore();
    return;
  }
  const time = renderer.reducedMotion ? 0 : renderer.time;
  friends.forEach((friend, i) => {
    const guiding = i === 0 && g;
    const x = guiding ? g.x : p.x - 28 - i * 21;
    const y = guiding ? g.y - 53 : p.y + 10;
    renderer.friendTargets.push({ x, y });
    if (guiding) {
      ctx.save(); ctx.strokeStyle = friend.color; ctx.fillStyle = friend.color;
      ctx.globalAlpha = .7; ctx.lineWidth = 2; ctx.setLineDash(g.aligned ? [] : [5, 6]);
      ctx.beginPath(); ctx.ellipse(g.x, g.y - 10, 58, 30, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(g.x, g.y - 10); ctx.globalAlpha = .25; ctx.stroke();
      ctx.globalAlpha = 1; ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'center';
      ctx.fillText(`${['Ⅰ', 'Ⅱ', 'Ⅲ'][g.layer]} · ${g.aligned ? '这边' : '换到这一层'}`, x, y - 24);
      ctx.restore();
    }
    drawCreature(ctx, friend.id, x, y, time, { scale: 22, happy: !!guiding && g.aligned, ghost: false, crowned: friend.crowned });
  });
}
