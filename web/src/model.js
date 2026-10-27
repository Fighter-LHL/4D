import { ROOM_TEMPLATES, createRoomPlan, roomMetadata, buildRoom } from './rooms.js';
// Authoritative authored XYZ + W sections. Views consume these gates and never invent routes.
export const RELICS = Object.freeze([
  Object.freeze({ id: 'prism', name: '回流棱镜', description: '新路线首次冒险或花匣避波成功时蓄能；在归响台或维度锚台释放，启动当前层已供能的机关。升阶增加蓄能上限。' }),
  Object.freeze({ id: 'shadow', name: '留影扣', description: '在已启动的机关花费 1 点随身回响，留下跨层压桥的影子。每庭一次，持续 12 / 18 / 24 秒。' }),
  Object.freeze({ id: 'coil', name: '接力线圈', description: '下游机关收齐能量后蓄势；站在锚台从另一实体层切入它所在层，自动接力启动。每阶每庭可接力一次。' }),
  Object.freeze({ id: 'weave', name: '织桥种', description: '新路线冒险或避波成功获得桥种；在已启动机关种出永久捷径。留影扣可让你在归响台或锚台远程种桥。升阶增加桥种容量。' }),
  Object.freeze({ id: 'shell', name: '缓落壳', description: '每阶每庭保护一次失手，保住随身回响和生命；连击、脉冲和影子仍会失去。' }),
]);
export const ROOM_NAMES = Object.freeze(ROOM_TEMPLATES.map(room => room.name));
export const LAYERS = Object.freeze([
  Object.freeze({ id: 'tide', name: '潮汐层', center: .18, color: '#62d8ee' }),
  Object.freeze({ id: 'echo', name: '回声层', center: .50, color: '#b3a0ff' }),
  Object.freeze({ id: 'bloom', name: '绽放层', center: .82, color: '#ffd582' }),
]);
// Compatibility preview only; each live run builds its own authored room plan.
export const NODES = Object.freeze(buildRoom(createRoomPlan(1)[0], LAYERS).nodes);
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
function nodeCopy(node) { return { ...node, world: { ...node.world }, required: [...node.required] }; }

export class GameModel {
  constructor(seed = 1) { this.events = []; this.restart(seed); }

  restart(seed = this.seed) {
    this.seed = normalizeSeed(seed);
    this.room = 0;
    this.roomPlan = createRoomPlan(this.seed);
    this.phase = 'choose';
    this.banked = 0;
    this.lives = 3;
    this.relic = null;
    this.relics = Object.fromEntries(RELICS.map(relic => [relic.id, 0]));
    this.stats = { risks: 0, failures: 0, chains: 0 };
    this.events = [];
    this._setupRoom();
    this._emit('restart');
    return true;
  }

  _setupRoom() {
    this.roomConfig = buildRoom(this.roomPlan[this.room], LAYERS);
    this.nodes = this.roomConfig.nodes.map(nodeCopy);
    this.node = 'hub';
    this.selected = this.roomConfig.start;
    this.selectionExplicit = false;
    this.w = this._node(this.roomConfig.start).center;
    this.lastAnchor = 'hub';
    this.anchorW = this.w;
    this.riskMode = false;
    this.travel = null;
    this.carried = 0;
    this.combo = 0;
    this.charge = 0;
    this.weaveCharge = 0;
    this.woven = new Set();
    this.coilArmed = new Set();
    this.coilUsed = 0;
    this.lastActualLayer = this._actualLayer();
    this.resonance = { stage: 0, triggered: false, from: null };
    this.hiddenProgress = Object.fromEntries(this.roomConfig.hiddenRoutes.map(route => [route.id, 0]));
    this.hiddenUnlocked = new Set();
    this.remoteActivation = false;
    this.remoteWeave = false;
    this.riftStatus = 'available';
    this.ascension = 0;
    this.shieldUses = this.relics.shell;
    this.activated = new Set();
    this.powered = new Set(MECHANISMS.filter(id => !this.roomConfig.requires[id].length));
    this.received = Object.fromEntries(MECHANISMS.map(id => [id, new Set()]));
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
    // Width variation is secondary to seeded topology, layer mapping and layout.
    let hash = Math.imul(this.seed ^ Math.imul(this.room + 1, 0x9e3779b9), 0x85ebca6b) >>> 0;
    hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d) >>> 0;
    this.safeWidth = .099 + (hash / 0xffffffff) * .012;
  }

  _emit(type, fields = {}) {
    if (this.events.length >= MAX_EVENTS) this.events.shift();
    this.events.push({ type, room: this.room, ...fields });
  }
  drainEvents() { const events = this.events; this.events = []; return events; }
  _node(id = this.node) { return this.nodes.find(node => node.id === id); }
  _supported(node = this._node()) { return node.anchor || section(this.w, node.center) >= .5 - EPSILON; }
  _actualLayer() { return LAYERS.findIndex((_, index) => this._inLayer(index)); }
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
    const previousActualLayer = this.lastActualLayer;
    this.w = Math.max(0, Math.min(1, value));
    const actualLayer = this._actualLayer();
    // Gaps never count as a visited entity layer. Record real entries even while
    // travelling or dodging so neither ending those states nor gap flicker fires a coil.
    if (actualLayer !== -1) this.lastActualLayer = actualLayer;
    const toLayer = nearestLayer(this.w);
    if (fromLayer !== toLayer) this._emit('layer_shift', { fromLayer, toLayer, node: this.node });
    if (!this.travel) {
      this._tryPhaseTransfer();
      if (this._node().anchor && this._inLayer(toLayer)) this.anchorW = this.w;
      if (actualLayer !== -1 && previousActualLayer !== -1 && actualLayer !== previousActualLayer) {
        if (this.wave?.variant === 'rift' && this.wave.safeLayers.includes(actualLayer)) this.wave.entered = true;
        if (!this.wave) { this._tryCoil(actualLayer); this._trySecretSeal(actualLayer); }
      }
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

  _allActivated() { return MECHANISMS.every(id => this.activated.has(id)); }
  _gateOpen(config) {
    if (config.to === 'exit' || config.from === 'exit') return this._allActivated();
    const gate = config.gate || {};
    if (gate.escape === this.node) return true;
    return (!gate.active || gate.active.every(id => this.activated.has(id))) && (!gate.power || this.powered.has(gate.power));
  }
  _edges() {
    const make = (config, kind = 'normal') => {
      const { id, from, to, layer } = config;
      const touchesTrial = ['vault', 'rift'].includes(from) || ['vault', 'rift'].includes(to);
      const open = this._gateOpen(config) && !(touchesTrial && this.wave);
      const needs = (config.gate?.active || []).filter(node => !this.activated.has(node));
      const reason = touchesTrial && this.wave ? '回波期间桥梁收起' : (to === 'exit' || from === 'exit') && !open ? '还需完成本庭的全部机关'
        : config.gate?.power && !this.powered.has(config.gate.power) ? `等待${this._node(config.gate.power).name}供能`
        : needs.length ? `先启动${needs.map(id => this._node(id).name).join('与')}` : '';
      return { id, from, to, layer, min: LAYERS[layer].center - this.safeWidth, max: LAYERS[layer].center + this.safeWidth,
        open, visible: this._inLayer(layer), kind, ...(reason ? { reason } : {}) };
    };
    const edges = this.roomConfig.edges.map(config => make(config, config.to === 'vault' ? 'vault' : 'normal'));
    for (const weave of this.roomConfig.weaves) if (this.woven.has(weave.node)) edges.push(make(weave.edge, 'weave'));
    if (this.resonance.stage === 3) edges.push(make(this.roomConfig.resonance, 'resonance'));
    for (const route of this.roomConfig.hiddenRoutes) if (this.hiddenUnlocked.has(route.id)) edges.push(make(route.edge, 'secret'));
    if (this.ascension === 3) edges.push(make(this.roomConfig.rift.exitEdge, 'ascension'));
    if (this.ghost) for (const shadow of this.roomConfig.shadows) {
      if (shadow.sources.includes(this.ghost.node)) edges.push(make(shadow.edge, 'shadow'));
    }
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
    return [...new Set(this._edges().filter(edge => (edge.from === this.node || edge.to === this.node) && this._edgeAllowed(edge))
      .map(edge => edge.from === this.node ? edge.to : edge.from))];
  }
  _selectedEdge() {
    const candidates = this._edges().filter(edge => (edge.from === this.node && edge.to === this.selected) || (edge.to === this.node && edge.from === this.selected));
    return candidates.find(edge => edge.open && this._inLayer(edge.layer)) || candidates.find(edge => edge.open) || candidates[0];
  }
  _chooseTarget({ passive = false } = {}) {
    const available = this._availableNodes();
    // World events may recommend newly opened routes, but must not steal a
    // still-valid destination the player deliberately selected.
    if (passive && this.selectionExplicit && available.includes(this.selected)) return;
    this.selectionExplicit = false;
    const route = this._nextRoute();
    this.selected = route?.[0]?.type === 'move' && available.includes(route[0].to) ? route[0].to : available[0] || null;
  }
  _routeTo(target) {
    const queue = [{ id: this.node, path: [] }], visited = new Set([this.node]);
    const edges = this._edges().filter(edge => edge.open && edge.kind !== 'vault');
    while (queue.length) {
      const { id, path } = queue.shift();
      if (id === target) return path;
      const current = this._node(id);
      const steps = edges.filter(edge => edge.from === id || edge.to === id).map(edge => ({ type: 'move', to: edge.from === id ? edge.to : edge.from, layer: edge.layer }));
      if (!current.anchor) for (const node of this.nodes) {
        if (!node.anchor && node.id !== id && sameXYZ(current, node)) steps.push({ type: 'shift', to: node.id, layer: node.layer });
      }
      for (const step of steps) if (!visited.has(step.to)) { visited.add(step.to); queue.push({ id: step.to, path: [...path, step] }); }
    }
    return null;
  }
  _nextRoute() {
    const targets = this._allActivated() ? ['exit'] : this.roomConfig.order.filter(id => !this.activated.has(id) && this.powered.has(id));
    return targets.map(id => this._routeTo(id)).find(path => path !== null) || null;
  }

  select(id) {
    if (!this._availableNodes().includes(id)) return false;
    this.selected = id;
    this.selectionExplicit = true;
    this._emit('select', { node: id });
    return true;
  }
  selectOrMove(id) {
    if (!this._availableNodes().includes(id)) return false;
    // An automatically suggested target still needs a first click to preview.
    // Repeated clicks use the real safe bridge range, even if risk was selected.
    if (id === this.selected && this.selectionExplicit) {
      const edge = this._selectedEdge();
      if (edge && this._supported() && this._inRange(edge)) {
        this.setRisk(false);
        return this.move();
      }
    }
    return this.select(id);
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
    if (via === 'prism' || via === 'coil') this.remoteActivation = true;
    this.coilArmed.delete(id);
    this.stats.chains += 1;
    const layer = this._node(id).layer;
    this._emit('activate', { node: id, via, layer, tier: this.activated.size });
    this._emit('chain', { node: id, from: id, to: id, layer, tier: this.activated.size, via });
    for (const target of MECHANISMS) if (this.roomConfig.requires[target].includes(id)) {
      this.pending.push({ at: this.time + .5, kind: 'power', from: id, to: target });
    }
    if (this._allActivated()) this._emit('unlock', { node: 'exit', from: id, to: 'exit', layer: this._node('exit').layer, tier: 3 });
    this._chooseTarget({ passive: via === 'coil' });
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
    if (this.node === 'vault') return this._gateOpen(this.roomConfig.edges.find(edge => edge.to === 'vault')) && this.vaultStatus === 'available' && this._inLayer(this.roomConfig.challenge.entryLayer);
    if (this.node === 'rift') return this._riftAvailable();
    return MECHANISMS.includes(this.node) && this.powered.has(this.node) && !this.activated.has(this.node);
  }
  _interactReason() {
    if (this._interactAvailable()) return '';
    if (this.phase !== 'playing') return '先选一件遗物，再出发';
    if (this.travel) return '还在穿越，落稳后再按 E';
    if (this.wave) return '回流中，先换到安全层';
    if (!this._supported()) return `脚下没站稳，切回${LAYERS[this._node().layer].name}`;
    if (this.node === 'hub') return this._allActivated() ? '还没有回响可存 · 庭门已经打开'
      : this.activated.size ? '还没有回响可存 · 沿桥继续探索' : '还没有回响可存 · 先去发光的供能源';
    if (MECHANISMS.includes(this.node)) {
      if (this.activated.has(this.node)) return '这座已启动 · 看看能量送向哪里';
      const missing = this.roomConfig.requires[this.node].filter(id => !this.received[this.node].has(id));
      if (missing.every(id => this.activated.has(id))) return '能量正在路上，等供能槽亮起';
      return `还缺${missing.filter(id => !this.activated.has(id)).map(id => this._node(id).name).join('、')}供能`;
    }
    if (this.node === 'vault') return this.vaultStatus !== 'available' ? '花匣已结束，沿桥返回'
      : !this._inLayer(this.roomConfig.challenge.entryLayer) ? `开匣先切到${LAYERS[this.roomConfig.challenge.entryLayer].name}` : '花匣还未接通，先启动供能机关';
    if (this.node === 'rift') return this.riftStatus !== 'available' ? '本庭试炼已结束，沿桥返回'
      : this._actualLayer() === -1 ? '层间隙不能入场 · 先切到实体层' : '需要 2 枚随身回响才能入场';
    return '这里没有可启动机关 · 点平台继续走';
  }
  interact() {
    if (!this._interactAvailable()) {
      if (this.phase === 'playing') this._emit('interact_blocked', { node: this.node, text: this._interactReason() });
      return false;
    }
    if (this.node === 'hub') return this._bank();
    if (this.node === 'vault') {
      this.vaultStatus = 'warning';
      this._startWave(1, this.roomConfig.challenge.entryLayer);
      this.selected = null;
      return true;
    }
    if (this.node === 'rift') {
      this.carried -= this.roomConfig.rift.stake;
      this.riftStatus = 'warning';
      this._emit('rift_start', { node: 'rift', stake: this.roomConfig.rift.stake });
      this._startRiftWave(1);
      this.selected = null;
      return true;
    }
    return this._activate(this.node);
  }

  _prismTarget() {
    if (!['hub', 'relay'].includes(this.node)) return null;
    return MECHANISMS.find(id => this.powered.has(id) && !this.activated.has(id) && this._inLayer(this._node(id).layer)) || null;
  }
  _hiddenEligible(route) {
    if (!route.requires.every(id => this.relics[id] > 0)) return false;
    if (route.id === 'prism-coil') return this.remoteActivation;
    if (route.id === 'shadow-weave') return this.remoteWeave;
    return this.woven.size > 0 && this.vaultStatus === 'escaped';
  }
  _trySecretSeal(layer) {
    if (!this._node().anchor || !this._supported()) return;
    for (const route of this.roomConfig.hiddenRoutes) {
      if (route.entry !== this.node || this.hiddenUnlocked.has(route.id) || !this._hiddenEligible(route)) continue;
      const progress = this.hiddenProgress[route.id];
      const stage = layer === route.sequence[progress] ? progress + 1 : layer === route.sequence[0] ? 1 : 0;
      this.hiddenProgress[route.id] = stage;
      if (stage) this._emit('secret_seal', { id: route.id, stage, from: route.entry, to: 'rift', node: route.entry, layer });
      if (stage === 3) {
        this.hiddenUnlocked.add(route.id);
        this._emit('secret_open', { id: route.id, from: route.entry, to: 'rift', node: 'rift', layer: route.edge.layer, edgeId: route.edge.id });
        this._chooseTarget({ passive: true });
      }
    }
  }
  _riftAvailable() {
    return this.phase === 'playing' && this.node === 'rift' && !this.travel && !this.wave && this._actualLayer() !== -1
      && this.riftStatus === 'available' && this.hiddenUnlocked.size > 0 && this.carried >= this.roomConfig.rift.stake;
  }
  _tryCoil(layer) {
    if (!this.relics.coil || this.coilUsed >= this.relics.coil || !this._node().anchor || !this._supported()) return false;
    const target = this.roomConfig.order.find(id => this.coilArmed.has(id) && this._node(id).layer === layer && this.powered.has(id) && !this.activated.has(id));
    if (!target) return false;
    this.coilUsed += 1;
    if (this.coilUsed >= this.relics.coil) this.coilArmed.clear();
    this._emit('coil', { from: this.node, to: target, node: target, layer });
    return this._activate(target, 'coil');
  }
  _weaveTarget() {
    const local = MECHANISMS.includes(this.node) && this.activated.has(this.node);
    const source = local ? this.node : ['hub', 'relay'].includes(this.node) ? this.ghost?.node : null;
    if (!source || !this.activated.has(source) || this.woven.has(source)) return null;
    const config = this.roomConfig.weaves.find(item => item.node === source);
    return config ? { node: source, edge: { ...config.edge }, remote: !local } : null;
  }
  _abilityAvailable(id) {
    if (this.phase !== 'playing' || this.travel || this.wave || !this._supported() || !this.relics[id]) return false;
    if (id === 'prism') return this.charge > 0 && !!this._prismTarget();
    if (id === 'weave') return this.weaveCharge > 0 && !!this._weaveTarget();
    if (id === 'shadow') return MECHANISMS.includes(this.node) && this.activated.has(this.node) && !this.shadowUsed && this.carried >= 1;
    return false;
  }
  useAbility(id) {
    const selected = id ?? ['prism', 'shadow', 'weave'].find(relic => this._abilityAvailable(relic));
    if (!this._abilityAvailable(selected)) return false;
    if (selected === 'prism') {
      const target = this._prismTarget();
      this.charge -= 1;
      this._emit('ability', { node: this.node, to: target, relic: 'prism', value: 1, layer: nearestLayer(this.w) });
      this._activate(target, 'prism');
      return true;
    }
    if (selected === 'weave') {
      const target = this._weaveTarget();
      this.weaveCharge -= 1;
      this.woven.add(target.node);
      if (target.remote) this.remoteWeave = true;
      this._emit('weave', { from: target.node, to: target.edge.to, node: target.node, layer: target.edge.layer, edgeId: target.edge.id, remote: target.remote });
      this._chooseTarget();
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
      if (this.relics.weave > 0) this.weaveCharge = Math.min(this.relics.weave, this.weaveCharge + 1);
      if (!this.resonance.triggered) {
        this.resonance = { stage: 0, triggered: true, from: this.node };
        for (const [index, delay] of [.25, .6, 1].entries()) this.pending.push({ at: this.time + delay, kind: 'resonance', stage: index + 1, from: this.node });
      }
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
  _startWave(step, dangerLayer) {
    const challenge = this.roomConfig.challenge;
    const dangerLayers = challenge.variant === 'lock' ? [0, 1, 2].filter(layer => layer !== challenge.lockSafeLayer) : [dangerLayer];
    const safeLayers = [0, 1, 2].filter(layer => !dangerLayers.includes(layer));
    this.wave = { node: 'vault', layer: dangerLayers[0], dangerLayers, safeLayers, remaining: challenge.duration,
      duration: challenge.duration, step, steps: challenge.steps, variant: challenge.variant };
    this._emit('warning', { ...this.wave, dangerLayers: [...dangerLayers], safeLayers: [...safeLayers] });
  }
  _startRiftWave(step) {
    const challenge = this.roomConfig.rift;
    const safeLayers = [challenge.sequence[step - 1]], dangerLayers = [0, 1, 2].filter(layer => !safeLayers.includes(layer));
    this.wave = { node: 'rift', layer: dangerLayers[0], dangerLayers, safeLayers, remaining: challenge.duration,
      duration: challenge.duration, step, steps: challenge.steps, variant: 'rift', entered: false };
    this._emit('warning', { ...this.wave, dangerLayers: [...dangerLayers], safeLayers: [...safeLayers] });
  }
  _finishWave() {
    const wave = this.wave;
    const layer = nearestLayer(this.w);
    if (!wave.safeLayers.includes(layer) || !this._inLayer(layer) || (wave.variant === 'rift' && !wave.entered)) {
      this.wave = null;
      if (wave.variant === 'rift') this.riftStatus = 'failed'; else this.vaultStatus = 'failed';
      this._fail(wave.variant === 'rift' ? 'rift' : 'wave');
      return;
    }
    if (wave.step < wave.steps) {
      this._emit('dodge', { node: wave.node, variant: wave.variant, step: wave.step, steps: wave.steps, layer });
      if (wave.variant === 'rift') this._startRiftWave(wave.step + 1); else this._startWave(wave.step + 1, layer);
      return;
    }
    this.wave = null;
    if (wave.variant === 'rift') {
      this.riftStatus = 'cleared';
      const value = this.roomConfig.rift.reward;
      this._emit('rift_clear', { node: 'rift', value, tier: Math.min(3, this.combo + 1), layer, steps: wave.steps });
      this._reward('rift:escape', value, true, { challenge: 'rift', variant: 'rift', steps: wave.steps, layer });
      for (const [index, delay] of [.2, .65, 1.1].entries()) this.pending.push({ at: this.time + delay, kind: 'ascension', stage: index + 1 });
      this._chooseTarget();
      return;
    }
    this.vaultStatus = 'escaped';
    const value = this.roomConfig.challenge.reward;
    this._reward('vault:escape', value, true, { challenge: 'vault', variant: wave.variant, steps: wave.steps, layer });
    this._emit('evade', { node: 'vault', value, tier: this.combo, layer, fromLayer: wave.layer, variant: wave.variant, steps: wave.steps });
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
    this.pending = this.pending.filter(cue => ['power', 'resonance', 'ascension'].includes(cue.kind));
    this.lastActualLayer = this._actualLayer();
    // Power and scene growth are committed world effects. Only presentation celebrations are cancelled.
    this.events = this.events.filter(event => !['chain', 'reward', 'unlock', 'activate', 'evade', 'rift_clear'].includes(event.type));
    this.combo = 0;
    this.charge = 0;
    this.weaveCharge = 0;
    this.ghost = null;
    if (this.wave) { if (this.wave.variant === 'rift') this.riftStatus = 'failed'; else this.vaultStatus = 'failed'; this.wave = null; }
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
          this.received[cue.to].add(cue.from);
          const completedNow = !this.powered.has(cue.to) && this.roomConfig.requires[cue.to].every(id => this.received[cue.to].has(id));
          if (completedNow) {
            this.powered.add(cue.to);
            if (this.relics.coil > this.coilUsed && !this.activated.has(cue.to) && this.roomConfig.requires[cue.to].length) this.coilArmed.add(cue.to);
          }
          this._emit('power', { from: cue.from, to: cue.to, node: cue.to, layer: this._node(cue.to).layer, complete: this.powered.has(cue.to), received: this.received[cue.to].size, required: this.roomConfig.requires[cue.to].length });
          if (!this.travel && !this.wave) this._chooseTarget({ passive: true });
        } else if (cue.kind === 'resonance') {
          this.resonance.stage = cue.stage;
          const to = ['hub', 'vault', 'relay'][cue.stage - 1];
          const edge = this.roomConfig.resonance;
          this._emit('resonance', { stage: cue.stage, from: cue.from, to, node: to, layer: edge.layer, edgeId: edge.id });
          if (!this.travel && !this.wave) this._chooseTarget({ passive: true });
        } else if (cue.kind === 'ascension') {
          this.ascension = cue.stage;
          const to = ['hub', 'relay', 'exit'][cue.stage - 1], edge = this.roomConfig.rift.exitEdge;
          this._emit('ascension', { stage: cue.stage, from: 'rift', to, node: to, layer: cue.stage === 3 ? edge.layer : this.roomConfig.rift.sequence[cue.stage - 1], edgeId: edge.id });
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
    if (this.phase === 'choose') return '选一件遗物，进入这次随机展开的四维庭院';
    if (this.phase === 'interlude') return '保留已有能力，再选一件或升阶，进入下一种机关组合';
    if (this.phase === 'won') return '三庭已展开；换一局路线与遗物组合再次挑战';
    if (this.phase === 'lost') return '归响结已用尽；重新开始一局';
    if (this.wave?.variant === 'rift') return `隐星试炼 ${this.wave.step}/${this.wave.steps}：${this.wave.entered ? '已换入' : '本波需从另一实体层切入'}${LAYERS[this.wave.safeLayers[0]].name}，撑过冲击`;
    if (this.wave) return `第 ${this.wave.step}/${this.wave.steps} 波：切到${this.wave.safeLayers.map(layer => LAYERS[layer].name).join('或')}，留在台座上避开回流`;
    if (this.travel) return this.travel.risky ? '沿着窄光带调整 W，完成冒险穿越' : '保持当前切片，沿实体桥前行';
    if (!this._supported()) return '脚下切片正在消失：回到平台所在层，或切入同位置的另一座台';
    if (this.node === 'rift') {
      if (this.riftStatus === 'available') return `隐星试炼：投入 2 点随身回响，连续三波换入唯一安全层；成功获 9 点并唤醒升庭连锁。${this.carried < 2 ? '先返回收集入场回响。' : '入场回响不会退还。'}`;
      if (this.riftStatus === 'failed') return '隐星试炼本庭已失败；隐藏桥仍在，沿原桥返回继续机关链';
      return this.ascension < 3 ? '试炼已完成，星光正在逐台传递，等待升庭桥成形'
        : this._allActivated() ? `升庭桥已长到庭门，切入${LAYERS[this.roomConfig.rift.exitEdge.layer].name}继续下一庭`
          : '升庭桥已成形；仍需返回完成本庭全部机关，庭门才会回应';
    }
    const ritual = this.roomConfig.hiddenRoutes.find(route => route.entry === this.node && this._hiddenEligible(route) && !this.hiddenUnlocked.has(route.id));
    if (ritual) return `${ritual.name} ${this.hiddenProgress[ritual.id]}/3：在此锚台从另一实体层切入${LAYERS[ritual.sequence[this.hiddenProgress[ritual.id]]].name}，唤醒下一枚星印`;
    const entry = this.roomConfig.challenge.entryLayer;
    if (this.node === 'vault') {
      if (this.vaultStatus === 'available') return this._inLayer(entry)
        ? `${this.roomConfig.challenge.name}：${this.roomConfig.challenge.description}`
        : `花匣和返回桥在${LAYERS[entry].name}；台座跨层安全，切回后可开匣或返回`;
      if (this.resonance.stage === 3 && this._gateOpen(this.roomConfig.resonance)) return `连锁已长出${LAYERS[this.roomConfig.resonance.layer].name}的花匣—锚台桥；换层走新路，或沿原桥回归响台`;
      return this._inLayer(entry) ? '返回桥已恢复；沿桥回到归响台，存入随身回响'
        : `花匣本庭已结束；先切回${LAYERS[entry].name}，再沿返回桥回到归响台`;
    }
    if (MECHANISMS.includes(this.node)) {
      if (!this.activated.has(this.node) && this.powered.has(this.node)) return `启动${this._node().name}（按 E）；${this._mechanismHint(this.node)}`;
      if (this.activated.has(this.node)) return `${this._node().name}已启动（${this.activated.size}/3）；${this._allActivated() ? '三座机关全部共鸣，通往庭门的实体桥已开放' : '观察供能槽，切层或沿桥前往下一处机关'}`;
      return `${this._node().name}尚未供能：${this._mechanismHint(this.node)}`;
    }
    if (this.pending.some(cue => cue.kind === 'power')) return '跨层能量正在抵达，等待目标机关点亮';
    if (this._allActivated()) return '三座机关已全部启动，通往庭门的实体桥已开放';
    const ready = this.roomConfig.order.filter(id => this.powered.has(id) && !this.activated.has(id)).map(id => this._node(id).name);
    return ready.length ? `已供能待启动：${ready.join('、')}（机关 ${this.activated.size}/3）` : `机关 ${this.activated.size}/3 已启动；观察各层机关的供能连线，在安全锚台换层探索`;
  }
  _mechanismHint(id) {
    const incoming = this.roomConfig.requires[id];
    const outgoing = MECHANISMS.filter(target => this.roomConfig.requires[target].includes(id));
    if (!this.powered.has(id)) return `需要${incoming.map(source => this._node(source).name).join('与')}供能（${this.received[id].size}/${incoming.length}）`;
    const gates = this.roomConfig.edges.filter(edge => edge.gate?.active?.includes(id) && edge.to !== 'vault');
    return outgoing.length ? `向${outgoing.map(target => this._node(target).name).join('与')}发送能量${gates.length ? '，同时锁定桥梁' : ''}`
      : gates.length ? '锁定通向锚台的桥梁；三机关完成后开门' : '完成这一环，三机关全部启动后开门';
  }
  _shadowDescription() {
    const source = this.ghost?.node || this.node;
    const shadow = this.roomConfig.shadows.find(item => item.sources.includes(source));
    if (!shadow) return '在已启动的机关留下影子，压住本庭配置的捷径';
    const edge = shadow.edge;
    return `影子托住${LAYERS[edge.layer].name}的${this._node(edge.from).name}—${this._node(edge.to).name}捷径${this._gateOpen(edge) ? '' : '（永久返程接通后可用）'}`;
  }

  _companionGuide() {
    if (this.phase !== 'playing' || this.travel || this.wave) return null;
    let step;
    if (MECHANISMS.includes(this.node) && this.powered.has(this.node) && !this.activated.has(this.node)) {
      step = { type: 'activate', to: this.node, layer: this._node().layer };
    } else step = this._nextRoute()?.[0];
    if (!step) return null;
    const target = this._node(step.to);
    return { kind: step.type, node: step.to, layer: step.layer, w: LAYERS[step.layer].center,
      x: target.x, y: target.y, aligned: this._inLayer(step.layer) };
  }

  snapshot() {
    const range = this._range();
    const nodes = this.nodes.map(node => {
      const visibility = node.anchor ? 1 : section(this.w, node.center);
      return { ...nodeCopy(node), visibility, scale: visibility, present: visibility >= .5 - EPSILON,
        powered: this.powered.has(node.id), received: [...(this.received[node.id] || [])], mechanismHint: MECHANISMS.includes(node.id) ? this._mechanismHint(node.id) : '',
        locked: MECHANISMS.includes(node.id) ? !this.powered.has(node.id) : node.id === 'exit' ? !this._allActivated() : node.id === 'rift' ? this.hiddenUnlocked.size === 0 : node.id === 'vault' ? !this._gateOpen(this.roomConfig.edges.find(edge => edge.to === 'vault')) || this.vaultStatus !== 'available' : false,
        ...(node.id === 'vault' ? { chestPresent: this._inLayer(this.roomConfig.challenge.entryLayer), chestVisibility: section(this.w, node.center) } : {}) };
    });
    const weaveTarget = this._weaveTarget();
    const weaveDescription = weaveTarget ? `${weaveTarget.remote ? '影子代种：' : ''}${this._node(weaveTarget.node).name} → ${this._node(weaveTarget.edge.to).name} · ${LAYERS[weaveTarget.edge.layer].name}` : '在已启动机关种桥；有机关影子时可在归响台或锚台远程种桥';
    const coilRemaining = Math.max(0, this.relics.coil - this.coilUsed);
    const labels = { prism: '释放跨层脉冲', shadow: '留下压桥影子', shell: '缓落壳自动保护', coil: '换层自动接力', weave: weaveTarget?.remote ? '借影远程织桥' : '种出永久捷径' };
    const details = {
      prism: `蓄能 ${this.charge}/${this.relics.prism} · 在锚台启动当前层已供能机关`,
      shadow: this.ghost ? `影子剩余 ${Math.ceil(this.ghost.remaining)} 秒` : this.shadowUsed ? '本庭已使用' : `需已启动的机关与 1 点回响 · 持续 ${SHADOW_LIFETIMES[this.relics.shadow]} 秒`,
      shell: `本庭剩余 ${this.shieldUses} 次保护`,
      coil: coilRemaining === 0 ? '本庭接力已用尽，下一庭恢复' : `本庭剩余 ${coilRemaining} 次 · ${this.coilArmed.size ? [...this.coilArmed].map(id => `${this._node(id).name}·${LAYERS[this._node(id).layer].name}`).join('、') + '已蓄势，在锚台从另一实体层切入' : '等待下游机关收齐能量'}`,
      weave: `桥种 ${this.weaveCharge}/${this.relics.weave} · ${weaveDescription}`,
    };
    const abilities = RELICS.map(relic => ({ id: relic.id, rank: this.relics[relic.id], active: ['prism', 'shadow', 'weave'].includes(relic.id), available: this._abilityAvailable(relic.id), label: labels[relic.id], detail: this.relics[relic.id] ? details[relic.id] : '尚未获得' }));
    const primaryAbility = abilities.find(ability => ability.available) || abilities.find(ability => ability.id === this.relic) || abilities[0];
    const interactLabel = this.node === 'hub' ? '存入随身回响'
      : this.node === 'vault' ? this.vaultStatus === 'available' ? `开启花匣 · ${this.roomConfig.challenge.name}` : this.wave ? '回波倒计时 · 换层躲避' : '花匣本庭已结束'
      : this.node === 'rift' ? this.riftStatus === 'available' ? '投入 2 回响 · 开启隐星试炼' : this.riftStatus === 'warning' ? '三重回波 · 每波重新换层' : this.riftStatus === 'cleared' ? '隐星试炼已完成' : '隐星试炼本庭已失败'
      : this.node === 'relay' ? '锚台跨层支撑'
      : this.node === 'exit' ? '抵达庭门'
      : this.activated.has(this.node) ? `${this._node().name}已启动` : `启动${this._node().name}`;
    return {
      phase: this.phase, seed: this.seed, room: this.room, roomId: this.roomPlan[this.room].template.id, roomName: this.roomPlan[this.room].template.name,
      roomDescription: this.roomPlan[this.room].template.description, roomSignature: this.roomPlan[this.room].signature,
      roomPlan: this.roomPlan.map(roomMetadata), nextRoom: this.roomPlan[this.room + 1] ? roomMetadata(this.roomPlan[this.room + 1]) : null,
      mechanismOrder: [...this.roomConfig.order], roomChallenge: { ...this.roomConfig.challenge }, shadowDescription: this._shadowDescription(),
      companionGuide: this._companionGuide(),
      nodes, node: this.node, selected: this.selected, layers: LAYERS.map(layer => ({ ...layer })), layer: nearestLayer(this.w),
      w: this.w, riskMode: this.riskMode, range, canMove: this._canMove(), availableNodes: this._availableNodes(), edges: this._edges(),
      travel: this.travel ? { ...this.travel, source: { ...this.travel.source } } : null,
      carried: this.carried, banked: this.banked, lives: this.lives, combo: this.combo,
      relic: this.relic, relics: { ...this.relics }, choices: RELICS.map(relic => ({ ...relic, rank: this.relics[relic.id], nextRank: Math.min(3, this.relics[relic.id] + 1) })),
      weaveCharge: this.weaveCharge, weaveTarget, weaveDescription, coilArmed: [...this.coilArmed], coilRemaining,
      woven: this.roomConfig.weaves.filter(item => this.woven.has(item.node)).map(item => ({ node: item.node, edge: { ...item.edge } })),
      resonance: { ...this.resonance, edge: { id: this.roomConfig.resonance.id, from: 'vault', to: 'relay', layer: this.roomConfig.resonance.layer } },
      hiddenRoutes: this.roomConfig.hiddenRoutes.map(route => ({ id: route.id, name: route.name, requires: [...route.requires], entry: route.entry,
        sequence: [...route.sequence], progress: this.hiddenProgress[route.id], unlocked: this.hiddenUnlocked.has(route.id), eligible: this._hiddenEligible(route),
        requirement: route.requirement, edge: { id: route.edge.id, from: route.edge.from, to: route.edge.to, layer: route.edge.layer } })),
      rift: { status: this.riftStatus, stake: this.roomConfig.rift.stake, reward: this.roomConfig.rift.reward, canStart: this._riftAvailable(),
        sequence: [...this.roomConfig.rift.sequence], ascension: this.ascension, exitEdge: { ...this.roomConfig.rift.exitEdge } },
      charge: this.charge, shield: this.shieldUses > 0, shieldUses: this.shieldUses,
      activated: [...this.activated], powered: [...this.powered], shortcut: !!this.ghost, shadowRemaining: this.ghost?.remaining || 0,
      ghost: this.ghost ? { ...this.ghost } : null, wave: this.wave ? { ...this.wave, dangerLayers: [...this.wave.dangerLayers], safeLayers: [...this.wave.safeLayers] } : null, vaultStatus: this.vaultStatus,
      phaseStability: this.phaseStability, lastAnchor: this.lastAnchor,
      abilities, abilityAvailable: abilities.some(ability => ability.available), abilityLabel: primaryAbility.label,
      interactAvailable: this._interactAvailable(), interactReason: this._interactReason(), interactLabel, objective: this._objective(),
      stats: { ...this.stats }, roomScore: this.roomScore,
    };
  }
}
