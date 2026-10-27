import { reachablePlatforms } from './play-feedback.js';

const DELAY = .45, DURATION = 2.1;
const roomKey = s => `${s.seed}:${s.room}:${s.roomSignature}`;
const quiet = (s, guide) => s.phase === 'playing' && !s.travel && !s.wave && s.phaseStability === 1 && !guide.view(s);

// The first discovery entry gets one invitation and its observed arrival.
// Other runs keep their finite landing/onward beats. Neither advances a route.
export class CourtyardMomentum {
  constructor({ arrival = false } = {}) {
    this.room = null; this.used = new Set(); this.cue = null;
    this.arrival = arrival; this.firstEntry = arrival; this.entryAge = 0; this.follow = null;
  }
  cancel() { this.cue = null; this.follow = null; this.arrival = false; }
  candidate(state, guide) {
    if (this.firstEntry) return null;
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
      if (this.room !== null) { this.arrival = false; this.firstEntry = false; }
      this.room = room; this.used.clear(); this.cue = null; this.follow = null;
    }
    if (!active) return;
    const step = Math.max(0, Math.min(.1, dt));
    // One reachable next step, never a welcome on the platform already occupied.
    if (this.arrival && state.phase === 'playing') {
      this.entryAge += step;
      if (state.travel || state.wave || guide.view(state) || guide.settled || this.entryAge >= 1.2) {
        this.arrival = false;
        const target = state.companionGuide;
        if (quiet(state, guide) && !guide.settled && target?.kind === 'move' && target.aligned &&
            state.selected === target.node && !state.riskMode && reachablePlatforms(state).includes(target.node)) {
          this.cue = { beat: 'arrival', node: target.node, age: 0, duration: DURATION };
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
        if (!state.travel.risky && state.travel.from === f.from && state.travel.to === f.node) f.crossing = true;
        else this.follow = null;
      } else if (f.crossing) {
        this.follow = null;
        if (quiet(state, guide) && state.node === f.node && state.nodes.find(n => n.id === f.node)?.present) {
          this.cue = { beat: 'follow', node: f.node, age: -.12, duration: .85 };
          this.used.add('follow');
        }
      } else if (state.node !== f.from || !reachablePlatforms(state).includes(f.node) ||
          (this.firstEntry && (state.selected !== f.node || state.riskMode))) this.follow = null;
    }
    const next = this.candidate(state, guide);
    if (this.cue && !this.valid(state, guide)) this.cue = null;
    if (!this.cue && next && !this.used.has(next.beat)) {
      this.used.add(next.beat);
      this.cue = { ...next, age: -DELAY, duration: DURATION };
    }
    if (this.cue) {
      this.cue.age += step;
      if (['arrival', 'onward'].includes(this.cue.beat) && this.cue.age >= 0 && !this.follow) {
        this.follow = { node: this.cue.node, from: state.node, crossing: false };
      }
      if (this.cue.age >= this.cue.duration) this.cue = null;
    }
  }
  valid(state, guide) {
    const cue = this.cue;
    if (!cue) return false;
    if (cue.beat === 'arrival') {
      return quiet(state, guide) && !guide.settled && !state.riskMode && state.selected === cue.node &&
        state.companionGuide?.kind === 'move' && state.companionGuide.node === cue.node &&
        state.companionGuide.aligned && reachablePlatforms(state).includes(cue.node);
    }
    if (cue.beat === 'follow') {
      return quiet(state, guide) && state.node === cue.node && state.nodes.find(n => n.id === cue.node)?.present;
    }
    const next = this.candidate(state, guide);
    return next?.node === cue.node && next.beat === cue.beat;
  }
  view(state, guide) {
    return roomKey(state) === this.room && this.cue?.age >= 0 && this.valid(state, guide) ? { ...this.cue } : null;
  }
}
