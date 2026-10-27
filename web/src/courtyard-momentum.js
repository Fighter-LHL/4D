import { reachablePlatforms } from './play-feedback.js';

const DELAY = .45, DURATION = 2.1;
const roomKey = s => `${s.seed}:${s.room}:${s.roomSignature}`;
const quiet = (s, guide) => s.phase === 'playing' && !s.travel && !s.wave && s.phaseStability === 1 && !guide.view(s);

// Finite presentation beats: welcome, safe footing, one invitation and its
// observed arrival. Never reveal another slice or advance an automatic route.
export class CourtyardMomentum {
  constructor({ arrival = false } = {}) {
    this.room = null; this.used = new Set(); this.cue = null;
    this.arrival = arrival; this.entryAge = 0; this.follow = null;
  }
  cancel() { this.cue = null; this.follow = null; this.arrival = false; }
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
    const room = roomKey(state);
    if (room !== this.room) {
      if (this.room !== null) this.arrival = false;
      this.room = room; this.used.clear(); this.cue = null; this.follow = null;
    }
    if (!active) return;
    const step = Math.max(0, Math.min(.1, dt));
    // One early opportunity, not a queued welcome after help or a crossing.
    if (this.arrival && state.phase === 'playing') {
      this.entryAge += step;
      if (state.travel || state.wave || guide.settled || this.entryAge >= 1.6) {
        this.arrival = false;
        if (quiet(state, guide) && !guide.settled && state.nodes.find(n => n.id === state.node)?.present) {
          this.cue = { beat: 'arrival', node: state.node, age: 0, duration: 1.1 };
          this.used.add('arrival');
        }
      }
    }
    // Remember only an actually visible invitation. Expiry does not nag or
    // erase it; help, another route, a failed crossing or another slice does.
    if (this.follow) {
      const f = this.follow;
      if (guide.view(state) || state.wave || state.phase !== 'playing') this.follow = null;
      else if (state.travel) {
        if (state.travel.from === f.from && state.travel.to === f.node) f.crossing = true;
        else this.follow = null;
      } else if (f.crossing) {
        this.follow = null;
        if (quiet(state, guide) && state.node === f.node && state.nodes.find(n => n.id === f.node)?.present) {
          this.cue = { beat: 'follow', node: f.node, age: -.12, duration: .85 };
          this.used.add('follow');
        }
      } else if (state.node !== f.from || !reachablePlatforms(state).includes(f.node)) this.follow = null;
    }
    const next = this.candidate(state, guide);
    if (this.cue && !this.valid(state, guide)) this.cue = null;
    if (!this.cue && next && !this.used.has(next.beat)) {
      this.used.add(next.beat);
      this.cue = { ...next, age: -DELAY, duration: DURATION };
    }
    if (this.cue) {
      this.cue.age += step;
      if (this.cue.beat === 'onward' && this.cue.age >= 0 && !this.follow) {
        this.follow = { node: this.cue.node, from: state.node, crossing: false };
      }
      if (this.cue.age >= this.cue.duration) this.cue = null;
    }
  }
  valid(state, guide) {
    const cue = this.cue;
    if (!cue) return false;
    if (cue.beat === 'arrival' || cue.beat === 'follow') {
      return quiet(state, guide) && state.node === cue.node && state.nodes.find(n => n.id === cue.node)?.present &&
        (cue.beat !== 'arrival' || !guide.settled);
    }
    const next = this.candidate(state, guide);
    return next?.node === cue.node && next.beat === cue.beat;
  }
  view(state, guide) {
    return roomKey(state) === this.room && this.cue?.age >= 0 && this.valid(state, guide) ? { ...this.cue } : null;
  }
}
