export const VISITOR_OBSERVATION_BEAT = 1.2;
export function visitorCue(state, pokedAt = null) {
  if (!state.exploration || !state.rings || state.phase !== 'playing') return '';
  if (pokedAt !== null) return state.time - pokedAt < VISITOR_OBSERVATION_BEAT
    ? '它跳起来了！拖 S 看截面怎么变' : '走到光环边找访客';
  if (!state.sections.some(section => section.role === 'visitor')) return '球藏在别的切片 · 拖 S / 按 E 找找';
  if (state.canPoke) return '戳一下球 · 点击 / Space';
  return '它跳起来了！拖 S 看截面怎么变';
}

// Presentation-only sequence. Game time freezes the beat during pause/pocket;
// discovery audio, floating labels and collection progress remain separate.
export class VisitorCueSequence {
  constructor() { this.pokedAt = null; this.arrivedAt = null; }
  receive(events, state) {
    for (const event of events) {
      if (event.type === 'load') {
        this.pokedAt = null;
        this.arrivedAt = state.exploration && state.levelId === 'escape' ? state.time : null;
      }
      if (event.type === 'visitor_poke') this.pokedAt = state.time;
    }
  }
  text(state) {
    if (state.exploration && state.phase === 'playing' && state.levelId === 'escape' &&
        this.arrivedAt !== null && state.time - this.arrivedAt < 4) return '墙那边有动静 · 换个切片看看';
    return visitorCue(state, this.pokedAt);
  }
}
