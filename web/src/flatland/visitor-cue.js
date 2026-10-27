export function visitorCue(state) {
  if (!state.exploration || !state.rings || state.phase !== 'playing') return '';
  if (!state.sections.some(section => section.role === 'visitor')) return '球藏在别的切片 · 拖 S / 按 E 找找';
  if (state.canPoke) return '戳一下球 · 点击 / Space';
  return '它跳起来了！拖 S 看截面怎么变';
}
