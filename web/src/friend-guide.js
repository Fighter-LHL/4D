export const GUIDE_IDLE = 6, GUIDE_DURATION = 4;
const signature = s => `${s.seed}:${s.room}:${s.companionGuide?.kind}:${s.companionGuide?.node}:${s.companionGuide?.layer}`;
const available = s => s.phase === 'playing' && !s.travel && !s.wave && !!s.companionGuide;

// A hint is a short-lived photograph of ONE step, never an advancing route.
export class FriendGuide {
  constructor() { this.activity(); this.room = null; this.settled = false; this.crossing = null; }
  activity() { this.idle = 0; this.remaining = 0; this.used = false; this.target = null; }
  enterRoom(state) {
    const room = `${state.seed}:${state.room}`;
    if (room === this.room) return;
    this.activity(); this.room = room; this.settled = false; this.crossing = null;
  }
  request(state) {
    if (!available(state)) return false;
    this.enterRoom(state);
    this.target = { ...state.companionGuide }; this.key = signature(state);
    this.remaining = GUIDE_DURATION; this.used = true; return true;
  }
  update(dt, state, active = true, allowIdleHint = true) {
    this.enterRoom(state);
    if (!active) return;
    // A completed safe crossing retires this room's unsolicited walkthrough.
    // Failed/risky crossings do not count; H still offers the full one-step hint.
    if (this.crossing && !this.crossing.risky && !state.travel && state.node === this.crossing.to && state.phaseStability === 1) {
      this.settled = true; this.activity();
    }
    this.crossing = state.travel ? { ...state.travel } : null;
    if (!available(state)) { this.activity(); return; }
    if (this.target && signature(state) !== this.key) { this.target = null; this.remaining = 0; this.used = true; }
    this.remaining = Math.max(0, this.remaining - Math.min(.1, Math.max(0, dt)));
    this.idle += Math.min(.1, Math.max(0, dt));
    if (allowIdleHint && !this.settled && !this.used && this.idle >= GUIDE_IDLE) this.request(state);
  }
  view(state) { return available(state) && this.remaining > 0 && this.key === signature(state) ? { ...this.target, aligned: state.companionGuide.aligned } : null; }
  present(state) { return { ...state, companionGuide: this.view(state) }; }
}
