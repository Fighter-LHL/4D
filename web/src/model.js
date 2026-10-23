// Authoritative authored XYZ + W sections. Views consume these gates and never invent routes.
export const RELICS = Object.freeze([
  Object.freeze({ id: 'prism', name: '回流棱镜', description: '新路线首次冒险或花匣避波成功时蓄能；在归响台或维度锚台释放，启动当前层已供能的机关。升阶增加蓄能上限。' }),
  Object.freeze({ id: 'shadow', name: '留影扣', description: '在已启动的机关花费 1 点随身回响，留下跨层压桥的影子。每庭一次，持续 12 / 18 / 24 秒。' }),
  Object.freeze({ id: 'shell', name: '缓落壳', description: '每阶每庭保护一次失手，保住随身回响和生命；连击、脉冲和影子仍会失去。' }),
]);
export const ROOM_NAMES = Object.freeze(['露光前庭', '回流花庭', '折光守门庭']);
export const LAYERS = Object.freeze([
  Object.freeze({ id: 'tide', name: '潮汐层', center: .18, color: '#62d8ee' }),
  Object.freeze({ id: 'echo', name: '回声层', center: .50, color: '#b3a0ff' }),
  Object.freeze({ id: 'bloom', name: '绽放层', center: .82, color: '#ffd582' }),
]);
function authoredNode(id, name, kind, x, y, z, layer, anchor = false) {
  const center = LAYERS[layer ?? 1].center;
  return Object.freeze({ id, name, kind, x: 500 + (x - z) * 52, y: 350 + (x + z) * 27 - y * 50,
    center, layer, anchor, world: Object.freeze({ x, y, z, w: center }) });
}
export const NODES = Object.freeze([
  authoredNode('hub', '归响台', 'hub', 0, 0, 2, null, true),
  authoredNode('dew', '潮汐泵', 'mechanism', -4, 0, 0, 0),
  authoredNode('bell', '回声台', 'mechanism', -4, 0, 0, 1),
  authoredNode('relay', '维度锚台', 'relay', 0, 1, -2, null, true),
  authoredNode('bloom', '折光花', 'mechanism', 4, 1, 0, 2),
  authoredNode('exit', '庭门', 'exit', 2, 2, -4, 2),
  authoredNode('vault', '裂隙花匣', 'vault', 4, -.3, 3, 1, true),
]);
const MECHANISMS = ['dew', 'bell', 'bloom'];
const HALF_SECTION = .16;
const RISK_WIDTH = .048;
const RISK_SWAY = .075;
const MAX_EVENTS = 128;
const MAX_FRAME_TIME = .1;
const STEP = 1 / 120;
const EPSILON = 1e-9;
const SHADOW_LIFETIMES = [0, 12, 18, 24];
function normalizeSeed(seed) { return typeof seed === 'number' && Number.isFinite(seed) ? seed >>> 0 : 1; }
function section(w, center) { return Math.sqrt(Math.max(0, 1 - ((w - center) / HALF_SECTION) ** 2)); }
function nearestLayer(w) { return LAYERS.reduce((best, layer, index) => Math.abs(w - layer.center) < Math.abs(w - LAYERS[best].center) ? index : best, 0); }
function sameXYZ(a, b) { return a.world.x === b.world.x && a.world.y === b.world.y && a.world.z === b.world.z; }
function nodeCopy(node) { return { ...node, world: { ...node.world } }; }

export class GameModel {
  constructor(seed = 1) { this.events = []; this.restart(seed); }

  restart(seed = this.seed) {
    this.seed = normalizeSeed(seed);
    this.room = 0;
    this.phase = 'choose';
    this.banked = 0;
    this.lives = 3;
    this.relic = null;
    this.relics = { prism: 0, shadow: 0, shell: 0 };
    this.stats = { risks: 0, failures: 0, chains: 0 };
    this.events = [];
    this._setupRoom();
    this._emit('restart');
    return true;
  }

  _setupRoom() {
    this.nodes = NODES.map(nodeCopy);
    this.node = 'hub';
    this.selected = 'dew';
    this.selectionExplicit = false;
    this.w = LAYERS[0].center;
    this.lastAnchor = 'hub';
    this.anchorW = this.w;
    this.riskMode = false;
    this.travel = null;
    this.carried = 0;
    this.combo = 0;
    this.charge = 0;
    this.shieldUses = this.relics.shell;
    this.activated = new Set();
    this.powered = new Set(['dew']);
    this.claims = new Set();
    this.bankedClaims = new Set();
    this.pulseClaims = new Set();
    this.ghost = null;
    this.shadowUsed = false;
    this.wave = null;
    this.vaultStatus = 'available';
    this.phaseStability = 1;
    this.roomScore = 0;
    this.time = 0;
    this.pending = [];
    // First courtyard is identical for everyone. Later bridge tolerances vary by seed.
    let hash = Math.imul(this.seed ^ Math.imul(this.room + 1, 0x9e3779b9), 0x85ebca6b) >>> 0;
    hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d) >>> 0;
    this.safeWidth = this.room === 0 ? .105 : .099 + (hash / 0xffffffff) * .012;
  }

  _emit(type, fields = {}) {
    if (this.events.length >= MAX_EVENTS) this.events.shift();
    this.events.push({ type, room: this.room, ...fields });
  }
  drainEvents() { const events = this.events; this.events = []; return events; }
  _node(id = this.node) { return this.nodes.find(node => node.id === id); }
  _supported(node = this._node()) { return node.anchor || section(this.w, node.center) >= .5 - EPSILON; }
  _inLayer(layer) { return section(this.w, LAYERS[layer].center) >= .5 - EPSILON; }

  chooseRelic(id) {
    if (!['choose', 'interlude'].includes(this.phase) || !RELICS.some(relic => relic.id === id)) return false;
    if (this.phase === 'interlude') { this.room += 1; this._setupRoom(); }
    this.relics[id] = Math.min(3, this.relics[id] + 1);
    this.relic = id;
    this.shieldUses = this.relics.shell;
    this.phase = 'playing';
    this.events = [];
    this._emit('room', { value: this.room + 1, relic: id, rank: this.relics[id] });
    return true;
  }

  setW(value) {
    if (this.phase !== 'playing' || typeof value !== 'number' || !Number.isFinite(value)) return false;
    const fromLayer = nearestLayer(this.w);
    this.w = Math.max(0, Math.min(1, value));
    const toLayer = nearestLayer(this.w);
    if (fromLayer !== toLayer) this._emit('layer_shift', { fromLayer, toLayer, node: this.node });
    if (!this.travel) {
      this._tryPhaseTransfer();
      if (this._node().anchor && this._inLayer(toLayer)) this.anchorW = this.w;
    }
    return true;
  }

  _tryPhaseTransfer() {
    const current = this._node();
    if (current.anchor || this._supported(current)) return;
    const target = this.nodes.find(node => node.id !== current.id && !node.anchor && sameXYZ(current, node) && this._supported(node));
    if (!target) return;
    this.node = target.id;
    this.phaseStability = 1;
    this._chooseTarget();
    this._emit('phase_transfer', { from: current.id, to: target.id, node: target.id, layer: target.layer });
  }

  setRisk(value) {
    if (this.phase !== 'playing' || this.travel || this.wave || typeof value !== 'boolean') return false;
    this.riskMode = value;
    return true;
  }

  _edges() {
    const bellActive = this.activated.has('bell');
    const bloomActive = this.activated.has('bloom');
    // A caught but unpowered bell still has an escape bridge. Expose the same
    // direction-effective gate to rendering and movement.
    const bellBridgeOpen = this.powered.has('bell') || this.node === 'bell';
    const width = this.safeWidth;
    const make = (id, from, to, layer, open, kind = 'normal', reason = '') => ({ id, from, to, layer,
      min: LAYERS[layer].center - width, max: LAYERS[layer].center + width, open,
      visible: this._inLayer(layer), kind, ...(reason ? { reason } : {}) });
    const edges = [
      make('hub-dew', 'hub', 'dew', 0, true),
      make('hub-bell', 'hub', 'bell', 1, bellBridgeOpen, 'normal', bellBridgeOpen ? '' : '先在潮汐层启动泵'),
      make('hub-relay', 'hub', 'relay', 1, bellActive, 'normal', bellActive ? '' : '回声台尚未锁定桥梁'),
      make('relay-bloom', 'relay', 'bloom', 2, bellActive, 'normal', bellActive ? '' : '先启动回声台'),
      make('relay-exit', 'relay', 'exit', 2, bloomActive, 'normal', bloomActive ? '' : '折光花尚未打开庭门'),
      make('hub-vault', 'hub', 'vault', 1, bellActive && !this.wave, 'vault', this.wave ? '回波期间桥梁收起' : bellActive ? '' : '先启动回声台'),
    ];
    // The shadow holds a shortcut only after bell has latched the permanent
    // hub/relay escape route. Otherwise expiry could strand a player on relay.
    if (this.ghost?.node === 'dew' || this.ghost?.node === 'bell') edges.push(make('shadow-bell-relay', 'bell', 'relay', 1, bellActive, 'shadow', bellActive ? '' : '先启动回声台，再沿留影捷径前往锚台'));
    if (this.ghost?.node === 'bloom') edges.push(make('shadow-bloom-exit', 'bloom', 'exit', 2, true, 'shadow'));
    if (this.travel?.kind === 'shadow' && !edges.some(edge => edge.id === this.travel.edgeId)) {
      const { edgeId: id, from, to, layer, min, max, kind } = this.travel;
      edges.push({ id, from, to, layer, min, max, kind, open: false, visible: true, committed: true, reason: '保留本次已踏上的桥段' });
    } else if (this.travel) {
      const edge = edges.find(item => item.id === this.travel.edgeId);
      if (edge) edge.committed = true;
    }
    return edges;
  }

  _edgeAllowed(edge) { return edge.open; }
  _availableNodes() {
    if (this.phase !== 'playing' || this.travel || this.wave) return [];
    return this._edges().filter(edge => (edge.from === this.node || edge.to === this.node) && this._edgeAllowed(edge))
      .map(edge => edge.from === this.node ? edge.to : edge.from);
  }
  _selectedEdge() {
    return this._edges().find(edge => (edge.from === this.node && edge.to === this.selected) || (edge.to === this.node && edge.from === this.selected));
  }
  _chooseTarget({ passive = false } = {}) {
    const available = this._availableNodes();
    // World events may recommend newly opened routes, but must not steal a
    // still-valid destination the player deliberately selected.
    if (passive && this.selectionExplicit && available.includes(this.selected)) return;
    this.selectionExplicit = false;
    const preference = this.node === 'hub'
      ? (!this.activated.has('dew') ? ['dew', 'bell', 'relay'] : !this.activated.has('bell') ? ['bell', 'dew', 'relay'] : ['relay', 'bell', 'dew'])
      : this.node === 'bell' ? ['relay', 'hub']
      : this.node === 'relay' ? (this.activated.has('bloom') ? ['exit', 'bloom', 'hub'] : ['bloom', 'hub'])
      : this.node === 'bloom' ? ['exit', 'relay'] : ['hub'];
    this.selected = preference.find(id => available.includes(id)) || available[0] || null;
  }
  select(id) {
    if (!this._availableNodes().includes(id)) return false;
    this.selected = id;
    this.selectionExplicit = true;
    this._emit('select', { node: id });
    return true;
  }
  _range() {
    if (this.travel) {
      const { layer, risky, progress, min, max } = this.travel;
      const center = LAYERS[layer].center + (risky ? Math.sin(progress * Math.PI * 2) * RISK_SWAY : 0);
      const width = risky ? RISK_WIDTH : (max - min) / 2;
      return { min: center - width, max: center + width, center, layer };
    }
    if (!this._availableNodes().includes(this.selected)) return null;
    const edge = this._selectedEdge();
    const center = LAYERS[edge.layer].center;
    const width = this.riskMode ? RISK_WIDTH : (edge.max - edge.min) / 2;
    return { min: center - width, max: center + width, center, layer: edge.layer };
  }
  _inRange(range) { return !!range && this.w >= range.min - EPSILON && this.w <= range.max + EPSILON; }
  _canMove() {
    return this._availableNodes().includes(this.selected) && this._supported() && this._inRange(this._range());
  }
  move() {
    if (!this._canMove()) return false;
    const edge = this._selectedEdge();
    this.travel = { from: this.node, to: this.selected, progress: 0, duration: this.riskMode ? 2.5 : 1.35,
      risky: this.riskMode, stability: 1, center: LAYERS[edge.layer].center, layer: edge.layer,
      edgeId: edge.id, kind: edge.kind, min: edge.min, max: edge.max, source: { node: this.node, w: this.w } };
    this._emit('move', { from: this.node, to: this.selected, risky: this.riskMode, layer: edge.layer });
    if (this.riskMode) this._emit('risk', { from: this.node, to: this.selected, tier: Math.min(3, this.combo + 1) });
    return true;
  }

  _activate(id, via = 'touch') {
    if (!MECHANISMS.includes(id) || !this.powered.has(id) || this.activated.has(id) || !this._inLayer(this._node(id).layer)) return false;
    this.activated.add(id);
    this.stats.chains += 1;
    const layer = this._node(id).layer;
    this._emit('activate', { node: id, via, layer, tier: this.activated.size });
    this._emit('chain', { node: id, from: id, to: id, layer, tier: this.activated.size, via });
    const target = id === 'dew' ? 'bell' : id === 'bell' ? 'bloom' : null;
    if (target) this.pending.push({ at: this.time + .5, kind: 'power', from: id, to: target });
    if (id === 'bloom') this._emit('unlock', { node: 'exit', from: id, to: 'exit', layer: 2, tier: 3 });
    this._chooseTarget();
    return true;
  }
  _bank() {
    if (this.wave || (this.carried === 0 && this.claims.size === 0)) return false;
    const value = this.carried;
    for (const claim of this.claims) this.bankedClaims.add(claim);
    this.claims.clear();
    this.carried = 0;
    this.banked += value;
    this.roomScore += value;
    this._emit('bank', { node: this.node, value });
    return true;
  }
  _interactAvailable() {
    if (this.phase !== 'playing' || this.travel || this.wave || !this._supported()) return false;
    if (this.node === 'hub') return this.carried > 0 || this.claims.size > 0;
    if (this.node === 'vault') return this.activated.has('bell') && this.vaultStatus === 'available' && this._inLayer(1);
    return MECHANISMS.includes(this.node) && this.powered.has(this.node) && !this.activated.has(this.node);
  }
  interact() {
    if (!this._interactAvailable()) return false;
    if (this.node === 'hub') return this._bank();
    if (this.node === 'vault') {
      this.vaultStatus = 'warning';
      this.wave = { node: 'vault', layer: 1, remaining: 2.4, duration: 2.4 };
      this._emit('warning', { node: 'vault', layer: 1, duration: 2.4 });
      this.selected = null;
      return true;
    }
    return this._activate(this.node);
  }

  _prismTarget() {
    if (!['hub', 'relay'].includes(this.node)) return null;
    return MECHANISMS.find(id => this.powered.has(id) && !this.activated.has(id) && this._inLayer(this._node(id).layer)) || null;
  }
  _abilityAvailable(id) {
    if (this.phase !== 'playing' || this.travel || this.wave || !this._supported() || !this.relics[id]) return false;
    if (id === 'prism') return this.charge > 0 && !!this._prismTarget();
    if (id === 'shadow') return MECHANISMS.includes(this.node) && this.activated.has(this.node) && !this.shadowUsed && this.carried >= 1;
    return false;
  }
  useAbility(id) {
    const selected = id ?? ['prism', 'shadow'].find(relic => this._abilityAvailable(relic));
    if (!this._abilityAvailable(selected)) return false;
    if (selected === 'prism') {
      const target = this._prismTarget();
      this.charge -= 1;
      this._emit('ability', { node: this.node, to: target, relic: 'prism', value: 1, layer: nearestLayer(this.w) });
      this._activate(target, 'prism');
      return true;
    }
    this.carried -= 1;
    this.shadowUsed = true;
    const duration = SHADOW_LIFETIMES[this.relics.shadow];
    this.ghost = { node: this.node, layer: this._node().layer, remaining: duration, duration };
    this._emit('ability', { node: this.node, relic: 'shadow', value: duration, layer: this._node().layer });
    this._chooseTarget();
    return true;
  }

  _reward(key, value, risky, fields = {}) {
    const novel = !this.claims.has(key) && !this.bankedClaims.has(key);
    if (risky) { this.stats.risks += 1; if (novel) this.combo = Math.min(3, this.combo + 1); }
    if (!novel) return false;
    this.claims.add(key);
    this.carried += value;
    if (risky && !this.pulseClaims.has(key)) {
      this.pulseClaims.add(key);
      if (this.relics.prism > 0) this.charge = Math.min(this.relics.prism, this.charge + 1);
    }
    this._emit('reward', { node: this.node, value, risky, tier: risky ? this.combo : 0, ...fields });
    return true;
  }
  _arrive() {
    const travel = this.travel;
    this.travel = null;
    this.node = travel.to;
    this.phaseStability = 1;
    if (this._node().anchor) { this.lastAnchor = this.node; this.anchorW = this.w; }
    this._reward(`${travel.from}>${travel.to}`, travel.risky ? 3 : 1, travel.risky, { from: travel.from, to: travel.to, layer: travel.layer });
    this._chooseTarget();
    if (this.node === 'exit') {
      this.pending = [];
      this._bank();
      this.phase = this.room === 2 ? 'won' : 'interlude';
      this._emit(this.phase === 'won' ? 'win' : 'room', { node: 'exit', completed: true, value: this.phase === 'won' ? this.banked : this.room + 1 });
    }
  }
  _finishWave() {
    const wave = this.wave;
    this.wave = null;
    const layer = nearestLayer(this.w);
    if (layer === 1 || !this._inLayer(layer)) {
      this.vaultStatus = 'failed';
      this._fail('wave');
      return;
    }
    this.vaultStatus = 'escaped';
    this._reward('vault:escape', 4, true, { challenge: 'vault', layer });
    this._emit('evade', { node: 'vault', value: 4, tier: this.combo, layer, fromLayer: wave.layer });
    this._chooseTarget();
  }
  _fail(reason = 'travel') {
    const source = this.travel?.source;
    const from = this.travel?.from || this.node;
    const to = this.travel?.to || this.node;
    const protectedFall = this.shieldUses > 0;
    const lost = protectedFall ? 0 : this.carried;
    this.travel = null;
    this.node = reason === 'travel' && source ? source.node : this.lastAnchor;
    this.w = reason === 'travel' && source ? source.w : this.anchorW;
    this.phaseStability = 1;
    this.pending = this.pending.filter(cue => cue.kind === 'power');
    // Power is a committed world effect. Only presentation celebrations are cancelled.
    this.events = this.events.filter(event => !['chain', 'reward', 'unlock', 'activate', 'evade'].includes(event.type));
    this.combo = 0;
    this.charge = 0;
    this.ghost = null;
    if (this.wave) { this.vaultStatus = 'failed'; this.wave = null; }
    this.stats.failures += 1;
    if (protectedFall) this.shieldUses -= 1;
    else { this.carried = 0; this.claims.clear(); this.lives -= 1; }
    this._chooseTarget();
    this._emit('fail', { from, to, node: this.node, value: lost, protected: protectedFall, reason });
    if (protectedFall) this._emit('shield', { node: this.node });
    if (this.lives === 0) { this.phase = 'lost'; this._emit('lose', { node: this.node, value: this.banked }); }
  }

  update(dtSeconds) {
    if (this.phase !== 'playing' || typeof dtSeconds !== 'number' || !Number.isFinite(dtSeconds) || dtSeconds <= 0) return false;
    let remaining = Math.min(MAX_FRAME_TIME, dtSeconds);
    while (remaining > EPSILON && this.phase === 'playing') {
      const dt = Math.min(STEP, remaining);
      remaining -= dt;
      this.time += dt;
      if (this.ghost) {
        this.ghost.remaining = Math.max(0, this.ghost.remaining - dt);
        if (this.ghost.remaining <= EPSILON) { this.ghost = null; if (!this.travel && !this.wave) this._chooseTarget({ passive: true }); }
      }
      const ready = this.pending.filter(cue => cue.at <= this.time + EPSILON);
      this.pending = this.pending.filter(cue => cue.at > this.time + EPSILON);
      for (const cue of ready) {
        if (cue.kind === 'power') {
          this.powered.add(cue.to);
          this._emit('power', { from: cue.from, to: cue.to, node: cue.to, layer: this._node(cue.to).layer });
          if (!this.travel && !this.wave) this._chooseTarget({ passive: true });
        }
      }
      if (this.wave) {
        this.wave.remaining = Math.max(0, this.wave.remaining - dt);
        if (this.wave.remaining <= EPSILON) this._finishWave();
      } else if (this.travel) {
        this.travel.progress = Math.min(1, this.travel.progress + dt / this.travel.duration);
        this.travel.stability = this._inRange(this._range())
          ? Math.min(1, this.travel.stability + dt * .28)
          : Math.max(0, this.travel.stability - dt / .65);
        if (this.travel.stability <= EPSILON) this._fail('travel');
        // A nearly completed crossing still has to land in its actual slice.
        // Grace permits correction, but cannot award/finish through an absent platform.
        else if (this.travel.progress >= 1 - EPSILON && this._inRange(this._range()) && this._supported(this._node(this.travel.to))) this._arrive();
      } else if (!this._supported()) {
        this.phaseStability = Math.max(0, this.phaseStability - dt / .9);
        if (this.phaseStability <= EPSILON) this._fail('phase');
      } else this.phaseStability = Math.min(1, this.phaseStability + dt * 2);
    }
    return true;
  }

  _objective() {
    if (this.phase === 'choose') return '选一件遗物，进入四维庭院';
    if (this.phase === 'interlude') return '保留已有能力，再选一件或升阶，进入下一庭';
    if (this.phase === 'won') return '三庭已展开；换一种遗物组合再次挑战';
    if (this.phase === 'lost') return '归响结已用尽；重新开始一局';
    if (this.wave) return '回波锁定回声层：切到潮汐层或绽放层，留在台座上躲开';
    if (this.travel) return this.travel.risky ? '沿着窄光带调整 W，完成冒险穿越' : '保持当前切片，沿实体桥前行';
    if (!this._supported()) return '脚下切片正在消失：回到平台所在层，或切入同位置的另一座台';
    if (this.node === 'vault') {
      if (this.vaultStatus === 'available') return this._inLayer(1)
        ? '花匣会引来回声层冲击；可以启动后切层躲避，或原路返回'
        : '花匣和返回桥在回声层；台座跨层安全，切回后可开匣或返回';
      return this._inRange({ min: .5 - this.safeWidth, max: .5 + this.safeWidth })
        ? '返回桥已恢复；沿回声层的桥回到归响台，存入随身回响'
        : '花匣本庭已结束；先切回回声层，才能沿返回桥回到归响台';
    }
    if (!this.activated.has('dew')) return this.node === 'dew' ? '启动潮汐泵，把能量送往同一位置的回声台' : this.node === 'bell' ? '原地切回潮汐层，先启动同一位置的潮汐泵' : '在潮汐层前往潮汐泵，启动跨层供能';
    if (!this.activated.has('bell')) return this.node === 'dew' ? '保持 XYZ 位置，切到回声层：潮汐泵会变成回声台' : this.node === 'bell' ? this.powered.has('bell') ? '启动回声台，锁定锚台桥并为绽放层供能' : '跨层能量正在抵达，等待回声台点亮' : '切到回声层，前往已供能的回声台';
    if (!this.activated.has('bloom')) {
      if (this.node === 'bloom') return this.powered.has('bloom') ? '启动折光花，打开通往庭门的实体桥' : '等待跨层供能抵达折光花';
      if (this.node === 'relay') return this._inLayer(2) ? '折光花已在这一层显现；沿绽放层的光桥前往，启动最后一环' : '锚台跨 W 稳定：在这里切到绽放层，走向折光花';
      if (this.node === 'bell') return this._availableNodes().includes('relay') ? '影子托住跨层捷径；沿桥前往维度锚台，再切到绽放层' : '先沿回声层返回归响台，再走已接通的桥前往维度锚台';
      return '沿回声层的桥前往维度锚台，再在那里切到绽放层';
    }
    if (this.node === 'relay') return this._inLayer(2) ? '庭门已打开；沿绽放层的桥走向出口' : '庭门已打开；在锚台切到绽放层，沿桥离庭';
    return this.node === 'bloom' && this.ghost?.node === 'bloom' ? '影子托住捷径：保持绽放层，直接穿向庭门' : '庭门已打开；经维度锚台沿绽放层的桥离庭';
  }

  snapshot() {
    const range = this._range();
    const nodes = this.nodes.map(node => {
      const visibility = node.anchor ? 1 : section(this.w, node.center);
      return { ...nodeCopy(node), visibility, scale: visibility, present: visibility >= .5 - EPSILON,
        powered: this.powered.has(node.id), locked: MECHANISMS.includes(node.id) ? !this.powered.has(node.id) : node.id === 'exit' ? !this.activated.has('bloom') : node.id === 'vault' ? !this.activated.has('bell') || this.vaultStatus !== 'available' : false,
        ...(node.id === 'vault' ? { chestPresent: this._inLayer(1), chestVisibility: section(this.w, node.center) } : {}) };
    });
    const abilities = RELICS.map(relic => ({ id: relic.id, rank: this.relics[relic.id], available: this._abilityAvailable(relic.id),
      label: relic.id === 'prism' ? '释放跨层脉冲' : relic.id === 'shadow' ? '留下压桥影子' : '缓落壳自动保护',
      detail: !this.relics[relic.id] ? '尚未获得' : relic.id === 'prism' ? `蓄能 ${this.charge}/${this.relics.prism} · 在锚台启动当前层已供能机关`
        : relic.id === 'shadow' ? this.ghost ? `影子剩余 ${Math.ceil(this.ghost.remaining)} 秒` : this.shadowUsed ? '本庭已使用' : `需已启动的机关与 1 点回响 · 持续 ${SHADOW_LIFETIMES[this.relics.shadow]} 秒`
        : `本庭剩余 ${this.shieldUses} 次保护` }));
    const primaryAbility = abilities.find(ability => ability.available) || abilities.find(ability => ability.id === this.relic) || abilities[0];
    const interactLabel = this.node === 'hub' ? '存入随身回响'
      : this.node === 'vault' ? this.vaultStatus === 'available' ? '开启花匣 · 躲避回波' : this.wave ? '回波倒计时 · 换层躲避' : '花匣本庭已结束'
      : this.node === 'relay' ? '锚台跨层支撑'
      : this.node === 'exit' ? '抵达庭门'
      : this.activated.has(this.node) ? `${this._node().name}已启动` : `启动${this._node().name}`;
    return {
      phase: this.phase, seed: this.seed, room: this.room, roomName: ROOM_NAMES[this.room],
      nodes, node: this.node, selected: this.selected, layers: LAYERS.map(layer => ({ ...layer })), layer: nearestLayer(this.w),
      w: this.w, riskMode: this.riskMode, range, canMove: this._canMove(), availableNodes: this._availableNodes(), edges: this._edges(),
      travel: this.travel ? { ...this.travel, source: { ...this.travel.source } } : null,
      carried: this.carried, banked: this.banked, lives: this.lives, combo: this.combo,
      relic: this.relic, relics: { ...this.relics }, choices: RELICS.map(relic => ({ ...relic, rank: this.relics[relic.id], nextRank: Math.min(3, this.relics[relic.id] + 1) })),
      charge: this.charge, shield: this.shieldUses > 0, shieldUses: this.shieldUses,
      activated: [...this.activated], powered: [...this.powered], shortcut: !!this.ghost, shadowRemaining: this.ghost?.remaining || 0,
      ghost: this.ghost ? { ...this.ghost } : null, wave: this.wave ? { ...this.wave } : null, vaultStatus: this.vaultStatus,
      phaseStability: this.phaseStability, lastAnchor: this.lastAnchor,
      abilities, abilityAvailable: abilities.some(ability => ability.available), abilityLabel: primaryAbility.label,
      interactAvailable: this._interactAvailable(), interactLabel, objective: this._objective(),
      stats: { ...this.stats }, roomScore: this.roomScore,
    };
  }
}
