import { reachablePlatforms } from './play-feedback.js';

const DELAY = .45, DURATION = 2.1;

// Two quiet, finite beats per room: acknowledge safe footing, then invite the
// first onward step. Never reveal another slice or advance an automatic route.
export class CourtyardMomentum {
  constructor() { this.room = null; this.used = new Set(); this.cue = null; }
  candidate(state, guide) {
    if (!guide.settled || guide.view(state) || state.phase !== 'playing' || state.travel || state.wave || state.phaseStability !== 1) return null;
    const g = state.companionGuide;
    const node = state.nodes.find(n => n.id === g?.node);
    if (!g?.aligned || !node?.present || node.locked) return null;
    if (g.kind === 'activate' && node.id === state.node && !state.activated.includes(node.id)) return { beat: 'landing', node: node.id };
    if (g.kind === 'move' && reachablePlatforms(state).includes(node.id)) return { beat: 'onward', node: node.id };
    return null;
  }
  update(dt, state, guide, active = true) {
    const room = `${state.seed}:${state.room}:${state.roomSignature}`;
    if (room !== this.room) { this.room = room; this.used.clear(); this.cue = null; }
    if (!active) return;
    const next = this.candidate(state, guide);
    if (this.cue && (!next || next.node !== this.cue.node || next.beat !== this.cue.beat)) this.cue = null;
    if (!this.cue && next && !this.used.has(next.beat)) {
      this.used.add(next.beat);
      this.cue = { ...next, age: -DELAY, duration: DURATION };
    }
    if (this.cue) {
      this.cue.age += Math.max(0, Math.min(.1, dt));
      if (this.cue.age >= this.cue.duration) this.cue = null;
    }
  }
  view(state, guide) {
    if (`${state.seed}:${state.room}:${state.roomSignature}` !== this.room) return null;
    const next = this.candidate(state, guide), cue = this.cue;
    return cue && cue.age >= 0 && next?.node === cue.node && next.beat === cue.beat ? { ...cue } : null;
  }
}
