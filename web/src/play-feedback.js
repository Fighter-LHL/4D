// Presentation copy only: none of these cues choose, move, or activate anything.
export const STARTER_RELICS = {
  prism: '冒险蓄能，在锚台释放脉冲启动机关。',
  shadow: '花 1 回响，在已启动机关留影压桥。',
  coil: '在锚台换层，接力启动已供能机关。',
  weave: '冒险收桥种，在已启动机关种捷径。',
  shell: '每庭接住一次失手，保住生命和回响。',
};

// Unsent branches of a partly lit multi-source receiver, not a solution path.
export function missingSupplySources(state) {
  const active = new Set(state.activated);
  const missing = new Set(state.nodes.flatMap(node =>
    node.required?.length > 1 && node.required.some(id => active.has(id))
      ? node.required.filter(id => !active.has(id)) : []));
  return state.nodes.filter(node => missing.has(node.id));
}

export function courtyardActions(state) {
  const current = state.nodes.find(node => node.id === state.node);
  const idle = state.phase === 'playing' && !state.travel && !state.wave;
  const activate = idle && state.interactAvailable && current?.kind === 'mechanism';
  return {
    primary: !idle ? null : activate ? 'interact' : state.canMove ? 'move' : state.interactAvailable ? 'interact' : null,
    interactDone: current?.kind === 'mechanism' && state.activated.includes(state.node),
    interactDisabled: !idle,
  };
}

export function reachablePlatforms(state) {
  if (state.phase !== 'playing' || state.travel || state.wave) return [];
  const current = state.nodes.find(node => node.id === state.node);
  if (!current?.present) return [];
  return state.availableNodes.filter(id => state.nodes.find(node => node.id === id)?.present &&
    state.edges.some(edge => edge.open && edge.visible && state.w >= edge.min && state.w <= edge.max &&
      ((edge.from === state.node && edge.to === id) || (edge.to === state.node && edge.from === id))));
}

export function mechanismFeedback(event, state) {
  const name = state.nodes.find(n => n.id === (event.to || event.node))?.name || '机关';
  if (event.type === 'interact_blocked') {
    const next = missingSupplySources(state)[0];
    if (state.phase === 'playing' && !state.travel && !state.wave &&
        state.nodes.find(node => node.id === state.node)?.present &&
        state.activated.includes(state.node) && next) return `这边已经亮了 · 去${next.name}`;
    return event.text;
  }
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
