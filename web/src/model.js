// All game rules live here. The renderer and sound engine only consume snapshots/events.
export const RELICS = Object.freeze([
  Object.freeze({ id: 'prism', name: '回流棱镜', description: '首次冒险收获蓄一枚脉冲；回到中央释放，点亮机关并永久连通外环。' }),
  Object.freeze({ id: 'shadow', name: '留影扣', description: '在中央花费 1 点随身回响，留下影子压住机关，开启 7 秒外环捷径。每庭一次。' }),
  Object.freeze({ id: 'shell', name: '缓落壳', description: '每庭挡住一次坠落代价，保住随身回响和生命；连击与脉冲仍会失去。' }),
]);

export const ROOM_NAMES = Object.freeze(['露光前庭', '回流花庭', '折光守门庭']);
export const NODES = Object.freeze([
  Object.freeze({ id: 'hub', name: '归响台', x: 500, y: 390, kind: 'hub', center: .5 }),
  Object.freeze({ id: 'dew', name: '露珠机关', x: 230, y: 300, kind: 'mechanism', center: .28 }),
  Object.freeze({ id: 'bell', name: '回声铃', x: 720, y: 255, kind: 'mechanism', center: .72 }),
  Object.freeze({ id: 'bloom', name: '折光花', x: 670, y: 510, kind: 'mechanism', center: .52 }),
  Object.freeze({ id: 'exit', name: '庭门', x: 440, y: 125, kind: 'exit', center: .5 }),
]);

const MECHANISMS = ['dew', 'bell', 'bloom'];
const SAFE_WIDTH = .105;
const RISK_WIDTH = .048;
const RISK_SWAY = .075;
const MAX_EVENTS = 128;
const MAX_FRAME_TIME = .1;
const STEP = 1 / 120;
const EPSILON = 1e-9;

function normalizeSeed(seed) {
  return typeof seed === 'number' && Number.isFinite(seed) ? seed >>> 0 : 1;
}

function roomNodes(seed, room) {
  // Stateless keyed randomness makes resets/replays independent of input frequency.
  return NODES.map((node, index) => {
    if (node.kind !== 'mechanism') return { ...node };
    let hash = (seed ^ Math.imul(room + 1, 0x9e3779b9) ^ Math.imul(index + 1, 0x85ebca6b)) >>> 0;
    hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d);
    hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b);
    hash = (hash ^ (hash >>> 16)) >>> 0;
    return { ...node, center: node.center + (hash / 0xffffffff - .5) * .05 };
  });
}

export class GameModel {
  constructor(seed = 1) {
    this.events = [];
    this.restart(seed);
  }

  restart(seed = this.seed) {
    this.seed = normalizeSeed(seed);
    this.room = 0;
    this.phase = 'choose';
    this.banked = 0;
    this.lives = 3;
    this.stats = { risks: 0, failures: 0, chains: 0 };
    this.events = [];
    this._setupRoom();
    this._emit('restart');
    return true;
  }

  _setupRoom() {
    this.nodes = roomNodes(this.seed, this.room);
    this.node = 'hub';
    this.selected = 'dew';
    this.w = this.nodes.find(node => node.id === 'dew').center;
    this.riskMode = false;
    this.travel = null;
    this.carried = 0;
    this.combo = 0;
    this.relic = null;
    this.charge = 0;
    this.shield = false;
    this.activated = new Set();
    this.claims = new Set();
    this.bankedClaims = new Set();
    this.pulseClaims = new Set();
    this.permanentShortcut = false;
    this.shadowRemaining = 0;
    this.shadowUsed = false;
    this.roomScore = 0;
    this.time = 0;
    this.pending = [];
  }

  _emit(type, fields = {}) {
    // Input spam cannot accumulate unbounded feedback if the view is suspended.
    if (this.events.length >= MAX_EVENTS) this.events.shift();
    this.events.push({ type, room: this.room, ...fields });
  }

  drainEvents() {
    const events = this.events;
    this.events = [];
    return events;
  }

  chooseRelic(id) {
    if (!['choose', 'interlude'].includes(this.phase) || !RELICS.some(relic => relic.id === id)) return false;
    if (this.phase === 'interlude') {
      this.room += 1;
      this._setupRoom();
    }
    this.relic = id;
    this.shield = id === 'shell';
    this.phase = 'playing';
    this.pending = [];
    this.events = [];
    this._emit('room', { value: this.room + 1, relic: id });
    return true;
  }

  setW(value) {
    if (this.phase !== 'playing' || typeof value !== 'number' || !Number.isFinite(value)) return false;
    this.w = Math.max(0, Math.min(1, value));
    return true;
  }

  setRisk(value) {
    if (this.phase !== 'playing' || this.travel || typeof value !== 'boolean') return false;
    this.riskMode = value;
    return true;
  }

  _availableNodes() {
    if (this.phase !== 'playing' || this.travel) return [];
    if (this.node === 'hub') return this.activated.size === 3 ? [...MECHANISMS, 'exit'] : [...MECHANISMS];
    if (MECHANISMS.includes(this.node)) {
      return this._shortcut() ? ['hub', ...MECHANISMS.filter(id => id !== this.node)] : ['hub'];
    }
    return [];
  }

  _shortcut() {
    return this.permanentShortcut || this.shadowRemaining > 0;
  }

  select(id) {
    if (!this._availableNodes().includes(id)) return false;
    this.selected = id;
    this._emit('select', { node: id });
    return true;
  }

  _routeCenter(from, to) {
    const endpoint = to === 'hub' ? from : to;
    return this.nodes.find(node => node.id === endpoint).center;
  }

  _range() {
    const travel = this.travel;
    if (!travel && !this._availableNodes().includes(this.selected)) return null;
    const risky = travel ? travel.risky : this.riskMode;
    const center = travel
      ? travel.center + (risky ? Math.sin(travel.progress * Math.PI * 2) * RISK_SWAY : 0)
      : this._routeCenter(this.node, this.selected);
    const width = risky ? RISK_WIDTH : SAFE_WIDTH;
    return { min: center - width, max: center + width, center };
  }

  _inRange(range) {
    return !!range && this.w >= range.min - EPSILON && this.w <= range.max + EPSILON;
  }

  move() {
    if (!this._availableNodes().includes(this.selected) || !this._inRange(this._range())) return false;
    const from = this.node;
    const to = this.selected;
    this.travel = {
      from, to, progress: 0, duration: this.riskMode ? 2.5 : 1.35,
      risky: this.riskMode, stability: 1, center: this._routeCenter(from, to),
    };
    this._emit('move', { from, to, risky: this.riskMode });
    if (this.riskMode) this._emit('risk', { from, to, tier: Math.min(3, this.combo + 1) });
    return true;
  }

  _activate(id, via = 'touch') {
    if (!MECHANISMS.includes(id) || this.activated.has(id)) return false;
    this.activated.add(id);
    this.stats.chains += 1;
    this._emit('activate', { node: id, via, tier: this.activated.size });
    // These are bounded visual propagation cues. Activation/exit state is already committed.
    const path = [id, 'hub', 'exit'];
    path.forEach((node, index) => {
      const event = { type: 'chain', node, from: index === 0 ? id : path[index - 1], to: node, tier: index + 1, via };
      if (index === 0) this._emit(event.type, event);
      else this.pending.push({ at: this.time + index * .25, event });
    });
    if (this.activated.size === 3) this._emit('unlock', { node: 'exit', tier: 3 });
    return true;
  }

  _bank() {
    if (this.carried === 0 && this.claims.size === 0) return false;
    const value = this.carried;
    for (const claim of this.claims) this.bankedClaims.add(claim);
    this.claims.clear();
    this.carried = 0;
    this.banked += value;
    this.roomScore += value;
    this._emit('bank', { node: this.node, value });
    return true;
  }

  interact() {
    if (this.phase !== 'playing' || this.travel) return false;
    if (this.node === 'hub') return this._bank();
    return this._activate(this.node);
  }

  _abilityAvailable() {
    if (this.phase !== 'playing' || this.travel || this.node !== 'hub') return false;
    if (this.relic === 'prism') return this.charge === 1;
    if (this.relic === 'shadow') return !this.shadowUsed && this.carried >= 1;
    return false;
  }

  useAbility() {
    if (!this._abilityAvailable()) return false;
    if (this.relic === 'prism') {
      this.charge = 0;
      this.permanentShortcut = true;
      const target = MECHANISMS.find(id => !this.activated.has(id));
      this._emit('ability', { node: 'hub', to: target || 'hub', relic: 'prism', value: 1 });
      if (target) this._activate(target, 'prism');
      return true;
    }
    this.carried -= 1;
    this.shadowUsed = true;
    this.shadowRemaining = 7;
    this._emit('ability', { node: 'hub', relic: 'shadow', value: 7 });
    return true;
  }

  _arrive() {
    const travel = this.travel;
    this.travel = null;
    this.node = travel.to;
    const key = `${travel.from}>${travel.to}`;
    const novel = !this.claims.has(key) && !this.bankedClaims.has(key);
    if (travel.risky) {
      if (novel) this.combo = Math.min(3, this.combo + 1);
      this.stats.risks += 1;
    }
    if (novel) {
      const value = travel.risky ? 3 : 1;
      this.claims.add(key);
      this.carried += value;
      if (travel.risky && !this.pulseClaims.has(key)) {
        this.pulseClaims.add(key);
        if (this.relic === 'prism') this.charge = 1;
      }
      this._emit('reward', { node: this.node, from: travel.from, to: travel.to, value, tier: travel.risky ? this.combo : 0, risky: travel.risky });
    }
    this.selected = this.node === 'hub'
      ? (MECHANISMS.find(id => !this.activated.has(id)) || 'exit')
      : 'hub';
    if (this.node === 'exit') {
      this.pending = [];
      this._bank();
      this.phase = this.room === 2 ? 'won' : 'interlude';
      if (this.phase === 'won') this._emit('win', { node: 'exit', value: this.banked });
      else this._emit('room', { node: 'exit', completed: true, value: this.room + 1 });
    }
  }

  _fail() {
    const { from, to } = this.travel;
    const protectedFall = this.relic === 'shell' && this.shield;
    const lost = protectedFall ? 0 : this.carried;
    this.travel = null;
    this.node = from;
    this.selected = to;
    this.pending = [];
    // Cancel any just-emitted success effects before the view/audio sees this batch.
    this.events = this.events.filter(event => !['chain', 'reward', 'unlock', 'activate'].includes(event.type));
    this.combo = 0;
    this.charge = 0;
    this.shadowRemaining = 0;
    this.stats.failures += 1;
    if (protectedFall) this.shield = false;
    else {
      this.carried = 0;
      this.claims.clear();
      this.lives -= 1;
    }
    this._emit('fail', { from, to, node: from, value: lost, protected: protectedFall });
    if (protectedFall) this._emit('shield', { node: from });
    if (this.lives === 0) {
      this.phase = 'lost';
      this._emit('lose', { node: from, value: this.banked });
    }
  }

  update(dtSeconds) {
    if (this.phase !== 'playing' || typeof dtSeconds !== 'number' || !Number.isFinite(dtSeconds) || dtSeconds <= 0) return false;
    let remaining = Math.min(MAX_FRAME_TIME, dtSeconds);
    while (remaining > EPSILON && this.phase === 'playing') {
      const dt = Math.min(STEP, remaining);
      remaining -= dt;
      this.time += dt;
      this.shadowRemaining = Math.max(0, this.shadowRemaining - dt);
      if (this.travel) {
        this.travel.progress = Math.min(1, this.travel.progress + dt / this.travel.duration);
        this.travel.stability = this._inRange(this._range())
          ? Math.min(1, this.travel.stability + dt * .28)
          : Math.max(0, this.travel.stability - dt / .65);
        if (this.travel.stability <= EPSILON) this._fail();
        else if (this.travel.progress >= 1 - EPSILON) this._arrive();
      }
      // _fail/_arrive may have cancelled the pending array.
      const ready = this.pending.filter(cue => cue.at <= this.time + EPSILON);
      this.pending = this.pending.filter(cue => cue.at > this.time + EPSILON);
      for (const cue of ready) this._emit(cue.event.type, cue.event);
    }
    return true;
  }

  snapshot() {
    const range = this._range();
    const availableNodes = this._availableNodes();
    const abilityLabel = this.relic === 'prism' ? '释放脉冲'
      : this.relic === 'shadow' ? '留影开桥' : '缓落壳自动保护';
    return {
      phase: this.phase, seed: this.seed, room: this.room, roomName: ROOM_NAMES[this.room],
      nodes: this.nodes.map(node => ({ ...node })), node: this.node, selected: this.selected,
      w: this.w, riskMode: this.riskMode, range,
      canMove: availableNodes.includes(this.selected) && this._inRange(range),
      availableNodes, travel: this.travel ? { ...this.travel } : null,
      carried: this.carried, banked: this.banked, lives: this.lives, combo: this.combo,
      relic: this.relic, charge: this.charge, shield: this.shield,
      activated: [...this.activated], shortcut: this._shortcut(), shadowRemaining: this.shadowRemaining,
      abilityAvailable: this._abilityAvailable(), abilityLabel,
      stats: { ...this.stats }, roomScore: this.roomScore,
    };
  }
}
