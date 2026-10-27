// Presentation copy only: none of these cues choose, move, or activate anything.
export const STARTER_RELICS = {
  prism: '冒险蓄能，在锚台释放脉冲启动机关。',
  shadow: '花 1 回响，在已启动机关留影压桥。',
  coil: '在锚台换层，接力启动已供能机关。',
  weave: '冒险收桥种，在已启动机关种捷径。',
  shell: '每庭接住一次失手，保住生命和回响。',
};

export function mechanismFeedback(event, state) {
  const name = state.nodes.find(n => n.id === (event.to || event.node))?.name || '机关';
  if (event.type === 'interact_blocked') return event.text;
  if (event.type === 'activate') return `${name}已启动 · ${event.tier}/3`;
  if (event.type === 'power') return event.complete
    ? `${name}供能到齐 · 到台上按 E`
    : `${name}供能 ${event.received}/${event.required} · 还差一路`;
  return '';
}

export function contextualHelp(state, topic = 'next') {
  const node = state.nodes.find(n => n.id === state.node);
  if (state.wave) return `回流来了：切到${state.wave.safeLayers.map(i => state.layers[i].name).join('或')}。`;
  if (state.travel) return state.travel.risky ? '穿越中：微调 W，让光点留在移动光带里。' : '穿越中：保持当前切片，等脚下落稳。';
  if (topic === 'slice') return node?.anchor
    ? '这里有跨层支撑：拖动 W 或按 Z / X / C，看看什么显现了。'
    : `脚下平台在${state.layers[node?.layer]?.name || '另一层'}；淡轮廓还不能踩。`;
  if (topic === 'action') return state.interactAvailable
    ? `${state.interactLabel} · 按 E。`
    : state.interactReason || '先靠近平台，再按 E 试一下。';
  const g = state.companionGuide;
  if (!g) return '看看脚下与相邻平台；需要线索时按 H。';
  const target = state.nodes.find(n => n.id === g.node)?.name || '前方平台';
  if (!g.aligned) return `先切到${state.layers[g.layer].name}，看看${target}。`;
  if (g.kind === 'activate') return `已站在${target}：按 E 试一下。`;
  if (g.kind === 'shift') return '位置不用变，换层看看脚下。';
  return `点${target}预览，再点同一平台稳行。`;
}
