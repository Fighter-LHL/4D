// Finite, render-only responses to actual mechanism transitions. No timers,
// input locks, collision changes or continuously advancing ambient clock.
const DURATIONS = { power: 900, latch: 700 };
const ease = (t) => t * t * (3 - 2 * t);

export class StationEffects {
  constructor() { this.clear(); }

  clear() {
    this.state = null;
    this.events = { power: null, latch: null };
  }

  observe(relay, now, reducedMotion = false) {
    if (!relay) { this.clear(); return; }
    const next = { power: Number(relay.powered), latch: Number(relay.latched) };
    if (!this.state || reducedMotion) {
      this.state = next;
      this.events = { power: null, latch: null };
      return;
    }
    const previous = this.sample(now);
    for (const key of ['power', 'latch']) {
      if (next[key] !== this.state[key]) {
        // A quick retrieval reverses from the current contact position;
        // it does not jump back to the beginning of an older animation.
        this.events[key] = { at: now, from: previous[key].pose, to: next[key] };
      }
    }
    this.state = next;
  }

  sample(now) {
    const result = {};
    for (const key of ['power', 'latch']) {
      const event = this.events[key];
      const phase = event ? Math.max(0, (now - event.at) / DURATIONS[key]) : 1;
      const active = phase < 1;
      result[key] = {
        progress: active ? phase : -1,
        strength: active ? Math.sin(Math.PI * phase) : 0,
        pose: active ? event.from + (event.to - event.from) * ease(phase) : (this.state?.[key] ?? 0),
      };
    }
    return result;
  }

  isActive(now) {
    return Object.entries(this.events).some(([key, event]) => event && now < event.at + DURATIONS[key]);
  }
}
