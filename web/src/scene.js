import { drawCourtyardFriends } from './courtyard-friends.js';
import { missingSupplySources, reachablePlatforms } from './play-feedback.js';
const WORLD_W = 1000;
const WORLD_H = 650;
const TAU = Math.PI * 2;
const COLORS = {
  paper: '#eaf1eb', ink: '#294b46', mute: '#80968b', teal: '#24968d',
  mint: '#baf9df', gold: '#d79943', lightGold: '#ffedb0', danger: '#d36d59',
  stone: '#e5e8d7', edge: '#b2c5b1', darkStone: '#75988a',
  weave: '#348d70', resonance: '#b58b36', coil: '#a568b7',
  secret: '#8563b3', ascension: '#c5942e',
};
const LAYER_PALETTES = [
  { color: '#378d9c', pale: '#dbf0ef', glow: '#a0f1f1', stone: '#e1e9dd', side: '#96b7ad' },
  { color: '#8c6bb4', pale: '#eee5f4', glow: '#e2c5ff', stone: '#e8e2df', side: '#aaa4bf' },
  { color: '#b28b32', pale: '#f7efd9', glow: '#fff0ae', stone: '#eee9d4', side: '#bdb592' },
];
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const mix = (a, b, t) => a + (b - a) * t;
const ease = t => 1 - (1 - clamp(t)) ** 3;

function path(ctx, points, close = true) {
  ctx.beginPath();
  points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  if (close) ctx.closePath();
}

function ellipse(ctx, x, y, rx, ry, fill, stroke, width = 1) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(.01, rx), Math.max(.01, ry), 0, 0, TAU);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}

function line(ctx, ax, ay, bx, by, stroke, width = 1) {
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
  ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke();
}

function diamond(ctx, x, y, size, fill, stroke) {
  path(ctx, [[x, y - size], [x + size * .66, y], [x, y + size], [x - size * .66, y]]);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); }
}

function hash(n) {
  const f = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return f - Math.floor(f);
}

/** Canvas presentation only. The model remains the sole rule authority. */
export class SceneRenderer {
  constructor(canvas, { onSelect, onFriend, hasSupplySlots = () => false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onSelect = typeof onSelect === 'function' ? onSelect : () => {};
    this.onFriend = typeof onFriend === 'function' ? onFriend : () => {};
    this.hasSupplySlots = hasSupplySlots;
    this.state = null;
    this.time = 0;
    this.effects = [];
    this.particles = [];
    this.hover = null;
    this.shake = 0;
    this.flash = 0;
    this.flashColor = COLORS.mint;
    this.lastPlayer = { x: 500, y: 390 };
    this.scale = 1;
    this.offsetX = this.offsetY = 0;
    this.width = WORLD_W;
    this.height = WORLD_H;
    this.disposed = false;
    this.seed = 301;
    this.motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    this.reducedMotion = !!this.motionQuery?.matches;
    this.motionChange = event => { this.reducedMotion = event.matches; };
    this.motionQuery?.addEventListener?.('change', this.motionChange);
    if (!canvas.style.width) canvas.style.width = '100%';
    if (!canvas.style.aspectRatio) canvas.style.aspectRatio = `${WORLD_W} / ${WORLD_H}`;
    canvas.style.display = 'block';
    canvas.style.touchAction = 'manipulation';
    this.pointerMove = event => {
      const node = this.hitTest(event);
      this.hover = node?.id ?? null;
      canvas.style.cursor = node || this.hitFriend(event) ? 'pointer' : 'default';
    };
    this.pointerLeave = () => { this.hover = null; canvas.style.cursor = 'default'; };
    this.pointerDown = event => {
      if (event.button !== undefined && event.button !== 0) return;
      if (this.hitFriend(event)) { this.onFriend(); return; }
      const node = this.hitTest(event);
      if (node) this.onSelect(node.id);
    };
    canvas.addEventListener('pointermove', this.pointerMove);
    canvas.addEventListener('pointerleave', this.pointerLeave);
    canvas.addEventListener('pointerdown', this.pointerDown);
    this.resizeHandler = () => this.resize();
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(this.resizeHandler);
      this.resizeObserver.observe(canvas);
    } else window.addEventListener('resize', this.resizeHandler);
    this.resize();
  }

  resize() {
    if (this.disposed) return;
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, rect.width || this.canvas.clientWidth || WORLD_W);
    this.height = Math.max(1, rect.height || this.width * WORLD_H / WORLD_W);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(this.width * this.dpr), h = Math.round(this.height * this.dpr);
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    this.scale = Math.min(this.width / WORLD_W, this.height / WORLD_H);
    this.offsetX = (this.width - WORLD_W * this.scale) / 2;
    this.offsetY = (this.height - WORLD_H * this.scale) / 2;
  }

  hitFriend(event) {
    if (!this.state || this.state.phase !== 'playing' || this.state.travel || this.state.wave) return false;
    const rect = this.canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left - this.offsetX) / this.scale;
    const y = (event.clientY - rect.top - this.offsetY) / this.scale;
    return (this.friendTargets || []).some(p => Math.hypot(x - p.x, y - p.y) <= 18);
  }

  hitTest(event) {
    if (!this.state || this.state.phase !== 'playing' || this.disposed) return null;
    const rect = this.canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left - this.offsetX) / this.scale;
    const y = (event.clientY - rect.top - this.offsetY) / this.scale;
    // Match the painted island top and mechanism, never its generous label box.
    return [...this.state.nodes].reverse().find(node => {
      if (!node.present || (!node.anchor && node.scale < .5)) return false;
      if (node.id === 'rift' && (node.locked || !this.state.availableNodes.includes(node.id))) return false;
      const section = node.anchor ? 1 : node.scale;
      const rx = (node.id === 'hub' ? 112 : 81) * section;
      const ry = (node.id === 'hub' ? 60 : 52) * section;
      return ((x - node.x) / rx) ** 2 + ((y - node.y + 12 * section) / ry) ** 2 <= 1;
    }) ?? null;
  }

  setState(snapshot) {
    // A new generated room invalidates every delayed presentation cue.
    if (this.state && (this.state.room !== snapshot.room || this.state.roomSignature !== snapshot.roomSignature || this.state.seed !== snapshot.seed)) {
      this.effects.length = 0; this.particles.length = 0; this.shake = 0; this.flash = 0;
    }
    this.state = snapshot;
  }

  node(id) { return this.state?.nodes.find(node => node.id === id); }

  palette(layer = this.state?.layer ?? 0) { return LAYER_PALETTES[layer] || LAYER_PALETTES[0]; }

  random() { return hash(this.seed++); }

  addEffect(kind, position, options = {}) {
    this.effects.push({ kind, x: position.x, y: position.y, age: 0, duration: 1, color: COLORS.teal, ...options });
    if (this.effects.length > 36) this.effects.splice(0, this.effects.length - 36);
  }

  burst(position, color, count = 20, power = 1, { delay = 0, celebration = false } = {}) {
    const total = this.reducedMotion ? Math.min(6, count) : count;
    for (let i = 0; i < total; i++) {
      const angle = this.random() * TAU;
      const speed = (40 + this.random() * 110) * power;
      this.particles.push({
        x: position.x, y: position.y - 12, vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * .65 - 35, age: -delay, celebration,
        duration: .45 + this.random() * .9, size: 2 + this.random() * 3,
        color, spin: this.random() * TAU,
      });
    }
    if (this.particles.length > 220) this.particles.splice(0, this.particles.length - 220);
  }

  celebrate(target, event) {
    const tier = clamp(event.tier || 1, 1, 3);
    const color = COLORS.gold;
    const shared = { color, tier, celebration: true };
    // Anticipation, release, and a small return to the player form one earned beat.
    this.addEffect('gather', target, { ...shared, duration: .18, radius: 56 + tier * 9 });
    this.addEffect('petals', target, { ...shared, delay: .16, duration: 1.1, radius: 90 + tier * 23 });
    this.addEffect('ring', target, { ...shared, delay: .16, duration: 1.15, radius: 95 + tier * 24 });
    this.addEffect('crown', target, { ...shared, delay: .2, duration: 1.15 });
    this.addEffect('value', target, { ...shared, delay: .2, duration: 1.25, value: event.value });
    this.addEffect('collect', target, { ...shared, delay: .73, duration: .55, radius: 70 + tier * 16 });
    this.burst(target, COLORS.lightGold, 22 + tier * 9, .9 + tier * .2, { delay: .16, celebration: true });
    // Resonance follows only actual, open world bridges. It never changes a gate.
    const neighbors = this.connections().filter(edge => edge.open && (edge.from === target.id || edge.to === target.id)).slice(0, tier + 1);
    for (const edge of neighbors) {
      const to = edge.from === target.id ? edge.b : edge.a;
      const bridgeColor = this.palette(edge.layer).color;
      this.addEffect('bridge_echo', target, { ...shared, delay: .28, duration: .65, color: bridgeColor,
        edgeId: edge.id, layer: edge.layer, to: { x: to.x, y: to.y } });
      this.addEffect('resonance', to, { ...shared, delay: .88, duration: .65, radius: 58 + tier * 8,
        layer: edge.layer, color: bridgeColor });
    }
    // Local light carries the impact; camera motion must not obscure the next W choice.
  }

  pushEvents(events = []) {
    if (this.disposed) return;
    for (const event of events) {
      const target = this.node(event.to) || this.node(event.node) || this.node(this.state?.node) || this.lastPlayer;
      const color = event.type === 'risk' || event.risky ? COLORS.gold : this.palette(target.layer ?? this.state?.layer).color;
      if (['fail', 'restart', 'room'].includes(event.type)) {
        this.effects.length = 0;
        this.particles.length = 0;
        this.shake = 0;
        this.flash = 0;
      }
      if (event.type === 'select') {
        this.addEffect('ring', target, { duration: .35, color: COLORS.gold, radius: 42 });
      } else if (event.type === 'move') {
        this.addEffect('ring', this.node(event.from) || this.lastPlayer, { duration: .55, radius: 30, color });
      } else if (event.type === 'risk') {
        // This event is a commitment, not an earned reward. Anticipation stays at departure.
        this.addEffect('ring', this.node(event.from) || this.lastPlayer, { duration: .65, radius: 36, color: COLORS.gold });
      } else if (event.type === 'reward') {
        if (event.risky) this.celebrate(target, event);
        else {
          this.addEffect('ring', target, { duration: .55, radius: 58, color });
          this.burst(target, color, 8, .55);
        }
      } else if (event.type === 'layer_shift' || event.type === 'phase_transfer') {
        const layer = event.layer ?? event.toLayer ?? this.state?.layer ?? 0;
        const at = event.type === 'phase_transfer' ? this.node(event.to) || target : this.playerPosition();
        this.addEffect('section', at, { duration: .7, color: this.palette(layer).color, radius: 90 });
        if (event.type === 'phase_transfer') this.burst(at, this.palette(layer).glow, 16, .5);
      } else if (event.type === 'power') {
        const from = this.node(event.from) || target, to = this.node(event.to) || target;
        if (event.complete || !this.hasSupplySlots(event.to))
          this.addEffect('note', to, { duration: this.width <= 480 ? 1.25 : 2.2, supply: true, text: event.complete ? '供能到齐 · 等你启动' : `供能 ${event.received}/${event.required}`, color: COLORS.teal });
        this.addEffect('power', from, { to: { x: to.x, y: to.y }, duration: 1.4,
          fromLayer: from.layer ?? this.state.layer, toLayer: to.layer ?? event.layer,
          color: this.palette(to.layer ?? event.layer).color, sourceColor: this.palette(from.layer).color });
        this.addEffect('ring', to, { delay: .8, duration: .75, radius: 75, color: this.palette(to.layer ?? event.layer).color });
        this.burst(to, this.palette(to.layer ?? event.layer).glow, 14, .5);
      } else if (event.type === 'warning') {
        this.effects = this.effects.filter(effect => !effect.celebration);
        this.particles = this.particles.filter(particle => !particle.celebration);
        this.addEffect('ring', target, { duration: .45, radius: 95, color: COLORS.danger, tier: 2 });
      } else if (event.type === 'dodge') {
        const layer = event.layer ?? this.state?.layer;
        this.addEffect('section', target, { duration: .38, radius: 65, color: this.palette(layer).glow });
      } else if (event.type === 'evade') {
        // The model emits one reward as well; avoid a second celebration burst.
        this.addEffect('section', target, { duration: 1.1, radius: 130, color: this.palette().color });
      } else if (event.type === 'activate') {
        this.addEffect('note', target, { duration: 2.2, text: `启动！${event.tier}/3`, color: COLORS.teal });
        this.addEffect('ring', target, { duration: 1.2, radius: 110, color, tier: 2 });
        this.addEffect('bloom', target, { duration: 1, radius: 85, color });
        this.burst(target, this.palette(target.layer ?? this.state?.layer).glow, 28, 1.25);
      } else if (event.type === 'resonance') {
        const from = this.node(event.from) || target;
        this.addEffect('growth_signal', from, { to: { x: target.x, y: target.y }, layer: event.layer,
          stage: event.stage, duration: .7, color: COLORS.resonance, celebration: true });
        this.addEffect('garden_bloom', target, { delay: .12, duration: 1.35, stage: event.stage,
          layer: event.layer, color: COLORS.resonance, celebration: true });
        this.burst(target, COLORS.lightGold, 14 + event.stage * 6, .65, { delay: .12, celebration: true });
        if (event.stage === 3) this.growBridge(event.edgeId, COLORS.resonance);
      } else if (event.type === 'weave') {
        const source = this.node(event.from) || this.node(event.node) || target;
        this.addEffect('garden_bloom', source, { duration: 1.2, stage: 2, layer: event.layer, color: COLORS.weave, celebration: true });
        this.growBridge(event.edgeId, COLORS.weave);
        this.burst(source, COLORS.mint, 22, .7, { celebration: true });
      } else if (event.type === 'coil') {
        const from = this.node(event.from) || target;
        this.addEffect('coil_arc', from, { to: { x: target.x, y: target.y }, duration: .8,
          fromLayer: this.state.layer, toLayer: event.layer, layer: event.layer, color: COLORS.coil });
        this.addEffect('section', target, { duration: .9, radius: 95, color: this.palette(event.layer).color });
      } else if (event.type === 'secret_seal') {
        const entry = this.node(event.from) || target;
        this.addEffect('seal_turn', entry, { duration: .7, stage: event.stage, layer: event.layer, color: this.palette(event.layer).color });
        this.addEffect('section', entry, { duration: .55, radius: 65, color: this.palette(event.layer).color });
      } else if (event.type === 'secret_open') {
        const entry = this.node(event.from) || target;
        this.addEffect('astral_bridge', entry, { to: { x: target.x, y: target.y }, duration: 1.45,
          edgeId: event.edgeId, layer: event.layer, color: COLORS.secret, celebration: true });
        this.addEffect('rift_unfold', target, { delay: .22, duration: 1.55, tier: 1, color: COLORS.secret, celebration: true });
        this.burst(target, '#dfceff', 28, .75, { delay: .22, celebration: true });
      } else if (event.type === 'rift_clear') {
        this.addEffect('gather', target, { duration: .25, radius: 100, color: COLORS.ascension, celebration: true });
        this.addEffect('rift_unfold', target, { delay: .2, duration: 2.2, tier: 3, color: COLORS.ascension, celebration: true });
        this.burst(target, COLORS.lightGold, 54, 1.25, { delay: .22, celebration: true });
      } else if (event.type === 'ascension') {
        const source = this.node(event.from) || this.node('rift') || target;
        this.addEffect('ascension_signal', source, { to: { x: target.x, y: target.y }, duration: 1.25,
          fromLayer: this.state.layer, toLayer: event.layer, layer: event.layer, stage: event.stage,
          color: this.palette(event.layer).color, celebration: true });
        this.addEffect('pillar_wake', target, { delay: .28, duration: 1.4, stage: event.stage,
          layer: event.layer, color: COLORS.ascension, celebration: true });
        this.burst(target, this.palette(event.layer).glow, 16 + event.stage * 4, .8, { delay: .28, celebration: true });
        if (event.stage === 3) {
          const edge = this.connections().find(item => item.id === event.edgeId);
          if (edge) this.addEffect('astral_bridge', edge.a, { to: { x: edge.b.x, y: edge.b.y }, duration: 1.8,
            edgeId: edge.id, layer: edge.layer, color: COLORS.ascension, celebration: true });
        }
      } else if (event.type === 'chain') {
        const from = this.node(event.from) || target;
        const to = this.node(event.to) || this.node('exit') || target;
        this.addEffect('pulse', from, { to: { x: to.x, y: to.y }, duration: .75, color: COLORS.mint, tier: event.tier || 1 });
        this.addEffect('ring', to, { delay: .5, duration: .9, radius: 60, color: COLORS.teal });
      } else if (event.type === 'unlock') {
        const exit = this.node('exit') || target;
        this.addEffect('bloom', exit, { duration: 1.35, radius: 130, color: COLORS.lightGold });
        this.addEffect('ring', exit, { duration: 1.4, radius: 155, tier: 3, color: COLORS.gold });
        this.burst(exit, COLORS.lightGold, 48, 1.65);
        this.flash = .16; this.flashColor = COLORS.lightGold;
      } else if (event.type === 'bank') {
        if ((event.value ?? 1) > 0) {
          this.addEffect('bank', target, { duration: 1.2, color: COLORS.gold });
          this.burst(target, COLORS.lightGold, 28, .85);
        }
      } else if (event.type === 'fail') {
        const at = { ...this.lastPlayer };
        this.addEffect('break', at, { duration: .85, radius: 80, color: COLORS.danger });
        this.addEffect('ring', this.node(event.from) || target, { duration: .8, radius: 48, color: event.protected ? COLORS.teal : COLORS.danger });
        this.burst(at, event.protected ? COLORS.teal : COLORS.danger, 26, 1.1);
        this.flash = .10; this.flashColor = COLORS.danger; this.shake = .28;
      } else if (event.type === 'shield') {
        this.addEffect('shield', target, { duration: 1, color: COLORS.mint });
        this.burst(target, COLORS.mint, 22, .65);
      } else if (event.type === 'ability') {
        this.addEffect('ring', target, { duration: 1.15, radius: 145, color: COLORS.gold, tier: 2 });
        this.burst(target, COLORS.gold, 24, 1.1);
      } else if (event.type === 'win') {
        for (const node of this.state?.nodes || []) {
          this.addEffect('ring', node, { duration: 1.6, radius: 110, color: COLORS.gold, tier: 3 });
          this.burst(node, COLORS.lightGold, 30, 1.4);
        }
        this.flash = .17; this.flashColor = COLORS.lightGold;
      } else if (event.type === 'room' || event.type === 'restart') {
        this.addEffect('ring', event.completed ? target : this.node('hub') || target,
          { duration: 1.2, radius: 120, color: event.completed ? COLORS.gold : COLORS.teal });
        if (event.completed) this.burst(target, COLORS.lightGold, 32, 1.2);
      }
    }
  }

  growBridge(edgeId, color) {
    const edge = this.connections().find(item => item.id === edgeId);
    if (!edge) return;
    this.addEffect('root_growth', edge.a, { to: { x: edge.b.x, y: edge.b.y }, edgeId, layer: edge.layer,
      duration: 1.25, color, celebration: true });
  }

  render(dtSeconds = 0) {
    if (this.disposed || !this.ctx) return;
    const dt = clamp(Number.isFinite(dtSeconds) ? dtSeconds : 0, 0, .1);
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt);
    this.flash = Math.max(0, this.flash - dt * .35);
    for (const effect of this.effects) effect.age += dt;
    this.effects = this.effects.filter(effect => effect.age < effect.duration + (effect.delay || 0));
    for (const particle of this.particles) {
      particle.age += dt;
      if (!this.reducedMotion && particle.age >= 0) {
        particle.x += particle.vx * dt; particle.y += particle.vy * dt;
        particle.vy += 85 * dt; particle.vx *= Math.exp(-1.2 * dt);
      }
    }
    this.particles = this.particles.filter(particle => particle.age < particle.duration);
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.fillStyle = COLORS.paper; ctx.fillRect(0, 0, this.width, this.height);
    ctx.save();
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.scale, this.scale);
    if (!this.reducedMotion && this.shake) {
      ctx.translate(Math.sin(this.time * 93) * this.shake * 7, Math.cos(this.time * 81) * this.shake * 4);
    }
    this.drawBackground();
    if (this.state) {
      this.drawAscensionCanopy();
      this.drawSliceVolumes();
      this.drawDependencies();
      this.drawDormantGrowth();
      this.drawHiddenRoutes();
      this.drawConnections();
      this.labelZones = [];
      const nodes = [...this.state.nodes].sort((a, b) => a.y - b.y);
      for (const node of nodes) this.drawIsland(node);
      this.drawMomentum();
      this.drawSceneCues();
      this.drawEffects(false);
      this.drawGhost();
      this.drawWave();
      this.drawPlayer();
      drawCourtyardFriends(this);
      this.drawEffects(true);
      this.drawParticles();
      this.drawAtmosphere();
      this.drawWStack();
    }
    ctx.restore();
    if (this.flash && !this.reducedMotion) {
      ctx.save(); ctx.globalAlpha = this.flash; ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, this.width, this.height); ctx.restore();
    }
  }

  drawBackground() {
    const ctx = this.ctx;
    const gradient = ctx.createLinearGradient(0, 0, 0, WORLD_H);
    gradient.addColorStop(0, this.palette().pale); gradient.addColorStop(.6, '#edf1e5'); gradient.addColorStop(1, '#e1ebe1');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    // Quiet topographic circles establish depth without competing with paths.
    ctx.save(); ctx.globalAlpha = .22;
    for (let i = 0; i < 8; i++) {
      ellipse(ctx, 485, 338, 230 + i * 48, 105 + i * 30, null, '#b4cab9', 1);
    }
    ctx.restore();
    const glow = ctx.createRadialGradient(495, 260, 30, 495, 300, 440);
    glow.addColorStop(0, '#ffffff70'); glow.addColorStop(1, '#ffffff00');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    for (let i = 0; i < 23; i++) {
      const x = hash(i + 11) * WORLD_W;
      const y = 30 + hash(i + 78) * 560;
      const offset = this.reducedMotion ? 0 : Math.sin(this.time * .35 + i) * 5;
      ellipse(ctx, x, y + offset, 1.5, 1.5, '#ffffffa8');
    }
    this.drawDistantStone(96, 147, .65, .32);
    this.drawDistantStone(872, 420, .9, .25);
    this.drawDistantStone(139, 555, .45, .3);
    this.drawDistantStone(835, 85, .35, .25);
  }

  drawDistantStone(x, y, size, opacity) {
    const ctx = this.ctx;
    ctx.save(); ctx.translate(x, y); ctx.scale(size, size); ctx.globalAlpha = opacity;
    path(ctx, [[-45, 0], [12, -20], [45, -6], [38, 20], [-18, 26]]);
    ctx.fillStyle = '#abc5b1'; ctx.fill();
    path(ctx, [[-45, 0], [-18, 26], [38, 20], [10, 53], [-20, 38]]);
    ctx.fillStyle = '#8cae9b'; ctx.fill(); ctx.restore();
  }

  connections() {
    // Every route and lock comes from the authoritative model, including committed crossings.
    return (this.state.edges || []).map(edge => ({ ...edge, a: this.node(edge.from), b: this.node(edge.to) }))
      .filter(edge => edge.a && edge.b);
  }

  drawDormantGrowth() {
    const growth = this.state.resonance;
    if (!growth?.edge || growth.stage >= 3) return;
    const a = this.node(growth.edge.from), b = this.node(growth.edge.to);
    if (!a || !b) return;
    const ctx = this.ctx, visible = this.state.layer === growth.edge.layer;
    ctx.save(); ctx.globalAlpha = visible ? .24 : .1;
    ctx.setLineDash([1, 12]); line(ctx, a.x, a.y + 7, b.x, b.y + 7, COLORS.resonance, 1.5); ctx.setLineDash([]);
    // A closed bud previews a possible route, never a walkable surface.
    const x = mix(a.x, b.x, .5), y = mix(a.y, b.y, .5);
    ctx.globalAlpha = visible ? .65 : .25;
    line(ctx, x, y + 9, x, y - 3, COLORS.weave, 2);
    diamond(ctx, x, y - 5, growth.stage === 2 ? 10 : 6, '#edf1e5', COLORS.resonance);
    for (let i = 0; i <= growth.edge.layer; i++) ellipse(ctx, x + (i - growth.edge.layer / 2) * 7, y + 17, 1.8, 1.8, this.palette(growth.edge.layer).color);
    if (growth.stage > 0) {
      ctx.globalAlpha = visible ? .65 : .22;
      this.drawVine(a, { x: mix(a.x, b.x, growth.stage * .24), y: mix(a.y, b.y, growth.stage * .24) }, COLORS.resonance, 2, growth.stage * 2);
    }
    ctx.restore();
  }

  drawHiddenRoutes() {
    const ctx = this.ctx;
    for (const route of this.state.hiddenRoutes || []) {
      if (route.unlocked) continue;
      const a = this.node(route.edge.from), b = this.node(route.edge.to);
      if (!a || !b) continue;
      const current = this.state.layer === route.edge.layer;
      // Empty glyphs and broken threads are a promise, never a stone bridge.
      ctx.save(); ctx.globalAlpha = route.eligible ? current ? .4 : .22 : .11;
      ctx.setLineDash([1, 15]);
      line(ctx, a.x, a.y + 7, b.x, b.y + 7, COLORS.secret, route.eligible ? 1.7 : 1);
      ctx.setLineDash([]);
      for (const fraction of [.36, .64]) {
        const x = mix(a.x, b.x, fraction), y = mix(a.y, b.y, fraction);
        diamond(ctx, x, y, 7, null, COLORS.secret);
        line(ctx, x - 10, y + 11, x + 10, y - 11, COLORS.secret, 1);
      }
      ctx.restore();
    }
  }

  drawSecretSeals(node, width, height) {
    const route = (this.state.hiddenRoutes || []).find(item => item.entry === node.id);
    if (!route) return;
    const ctx = this.ctx, sequence = route.sequence || [];
    const x = width * .65, y = -height * .45;
    ctx.save(); ctx.translate(x, y);
    ctx.globalAlpha = route.unlocked ? .95 : route.eligible ? 1 : .35;
    ellipse(ctx, 0, -21, 23, 32, null, route.unlocked ? COLORS.ascension : COLORS.secret, route.eligible ? 2 : 1);
    line(ctx, -9, 12, -9, -49, COLORS.secret, 1);
    line(ctx, 9, 12, 9, -49, COLORS.secret, 1);
    for (let i = 0; i < 3; i++) {
      const layer = sequence[i] ?? route.edge.layer;
      const complete = route.unlocked || i < route.progress;
      const next = route.eligible && !route.unlocked && i === route.progress;
      const cy = -42 + i * 21;
      diamond(ctx, 0, cy, next ? 10 : 8, complete ? this.palette(layer).glow : '#edf1e5', this.palette(layer).color);
      if (complete) {
        line(ctx, -3, cy, 0, cy + 3, this.palette(layer).color, 1.7);
        line(ctx, 0, cy + 3, 4, cy - 4, this.palette(layer).color, 1.7);
      }
      for (let pip = 0; pip <= layer; pip++) ellipse(ctx, 16 + pip * 4, cy, 1.4, 1.4, this.palette(layer).color);
      if (next) ellipse(ctx, 0, cy, 14, 14, null, this.palette(layer).color, 1.3);
    }
    ctx.restore();
  }

  drawAscensionCanopy() {
    const stage = this.state.rift?.ascension || 0;
    const shrine = this.node('rift');
    if (!stage || !shrine) return;
    const ctx = this.ctx;
    // This suspended canopy persists in the model's earned state. Its arcs sit
    // above the islands; only drawConnections ever paints a walkable surface.
    ctx.save();
    for (let i = 0; i < stage; i++) {
      const target = this.node(['hub', 'relay', 'exit'][i]);
      if (!target) continue;
      const top = Math.max(27, Math.min(shrine.y, target.y) - 135 - i * 10);
      const layer = i === 2 ? this.state.rift.exitEdge.layer : this.state.rift.sequence?.[i] ?? i;
      const color = this.palette(layer).color;
      ctx.globalAlpha = .12;
      ctx.beginPath(); ctx.moveTo(shrine.x, shrine.y - 65);
      ctx.quadraticCurveTo(mix(shrine.x, target.x, .5), top, target.x, target.y - 82);
      ctx.strokeStyle = color; ctx.lineWidth = 13; ctx.stroke();
      ctx.globalAlpha = .43;
      ctx.lineWidth = 1.5; ctx.stroke();
      for (let star = 1; star < 8; star++) {
        const t = star / 8;
        const x = mix(shrine.x, target.x, t);
        const y = (1 - t) ** 2 * (shrine.y - 65) + 2 * (1 - t) * t * top + t ** 2 * (target.y - 82);
        const float = this.reducedMotion ? 0 : Math.sin(this.time * .45 + star + i) * 1.5;
        diamond(ctx, x, y + float, star % 2 ? 4 : 2.6, this.palette(layer).glow, color);
      }
    }
    ctx.restore();
  }

  drawAscendedArchitecture(node, width) {
    const stage = this.state.rift?.ascension || 0;
    const required = { hub: 1, relay: 2, exit: 3 }[node.id];
    if (!required || stage < required) return;
    const ctx = this.ctx, height = Math.min(node.id === 'exit' ? 101 : 74, node.y - 43);
    const sideX = width * .72;
    for (const side of [-1, 1]) {
      const x = side * sideX;
      path(ctx, [[x - 8, 13], [x - 6, -height], [x + 6, -height], [x + 9, 13], [x, 19]]);
      ctx.fillStyle = '#ead8a4'; ctx.fill(); ctx.strokeStyle = COLORS.ascension; ctx.lineWidth = 1.6; ctx.stroke();
      line(ctx, x - 3, 7, x - 3, -height + 8, '#fff9dd', 2.8);
      for (let i = 0; i < 3; i++) {
        ellipse(ctx, x, -height + 16 + i * 16, 11, 5.5, null, this.palette(i).color, 1.5);
      }
      const layer = required === 3 ? this.state.rift.exitEdge.layer : this.state.rift.sequence?.[required - 1] ?? required - 1;
      diamond(ctx, x, -height - 6, 12, this.palette(layer).glow, COLORS.ascension);
    }
    ctx.beginPath(); ctx.moveTo(-sideX, -height + 1);
    ctx.quadraticCurveTo(0, -height - 38, sideX, -height + 1);
    ctx.strokeStyle = COLORS.ascension; ctx.lineWidth = node.id === 'exit' ? 5 : 2.2; ctx.stroke();
    if (node.id === 'exit') {
      ctx.beginPath(); ctx.moveTo(-sideX + 4, -height + 6); ctx.quadraticCurveTo(0, -height - 25, sideX - 4, -height + 6);
      ctx.strokeStyle = '#fff4c6'; ctx.lineWidth = 2; ctx.stroke();
      diamond(ctx, 0, -height - 18, 15, '#fff3b5', COLORS.ascension);
    }
  }

  drawRiftSilhouette(node) {
    const ctx = this.ctx;
    ctx.save(); ctx.translate(node.x, node.y); ctx.globalAlpha = .3;
    ctx.setLineDash([3, 10]);
    ellipse(ctx, 0, 0, 77, 40, null, COLORS.secret, 1.5);
    ellipse(ctx, 0, -43, 34, 44, null, COLORS.secret, 1.5);
    for (const side of [-1, 1]) line(ctx, side * 53, 0, side * 27, -68, COLORS.secret, 1);
    ctx.setLineDash([]);
    diamond(ctx, 0, -43, 13, null, COLORS.secret);
    line(ctx, -7, -50, 7, -36, COLORS.secret, 1.5); line(ctx, 7, -50, -7, -36, COLORS.secret, 1.5);
    ctx.restore();
  }

  drawRift(node) {
    const ctx = this.ctx, stage = this.state.rift?.ascension || 0;
    const awakened = stage > 0;
    const danger = this.state.wave?.node === node.id;
    const color = danger ? COLORS.danger : awakened ? COLORS.ascension : COLORS.secret;
    ellipse(ctx, 0, 4, 53, 28, '#ddd2e4', color, 2);
    ellipse(ctx, 0, 1, 43, 22, '#eee5f0', '#fffaf2', 2);
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * (awakened ? 42 : 24), height = awakened ? Math.min(77, node.y - 30) - Math.abs(i - 1) * 17 : 48;
      path(ctx, [[x - 6, 0], [x - 5, -height], [x, -height - 9], [x + 5, -height], [x + 6, 0]]);
      ctx.fillStyle = awakened ? '#ead8a4' : '#c8bbd7'; ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
      diamond(ctx, x, -height - 12, awakened ? 10 : 7, this.palette(i).glow, this.palette(i).color);
    }
    // Three intersecting section rings become a much larger permanent halo.
    const haloY = awakened ? -Math.min(52, node.y * .23) : -35;
    const haloHeight = awakened ? Math.min(79, node.y + haloY - 12) : 37;
    for (let i = 0; i < 3; i++) {
      ctx.save(); ctx.translate(0, haloY); ctx.rotate((i - 1) * .78);
      ellipse(ctx, 0, 0, awakened ? haloHeight * .74 : 27, haloHeight, null, this.palette(i).color, awakened ? 2.5 : 1.4);
      const phase = this.reducedMotion ? -.7 + i : this.time * .18 + i * 2;
      diamond(ctx, Math.cos(phase) * (awakened ? haloHeight * .74 : 27), Math.sin(phase) * haloHeight, awakened ? 6 : 3, this.palette(i).glow, this.palette(i).color);
      ctx.restore();
    }
    if (awakened) {
      for (const side of [-1, 1]) {
        path(ctx, [[side * 35, -9], [side * 89, -46], [side * 69, -7], [side * 40, 10]]);
        ctx.fillStyle = '#fff1c6'; ctx.fill(); ctx.strokeStyle = COLORS.ascension; ctx.lineWidth = 1.7; ctx.stroke();
        line(ctx, side * 42, -2, side * 77, -31, '#d8bc6e', 2);
      }
      diamond(ctx, 0, haloY, 20, '#fff8d2', COLORS.ascension);
    } else diamond(ctx, 0, -35, 12, danger ? '#f1bcac' : '#e5d0fa', color);
  }

  drawVine(from, to, color, width = 2, leaves = 5) {
    const ctx = this.ctx, dx = to.x - from.x, dy = to.y - from.y, length = Math.hypot(dx, dy);
    if (length < 1) return;
    const nx = -dy / length, ny = dx / length;
    ctx.beginPath(); ctx.moveTo(from.x, from.y);
    ctx.bezierCurveTo(mix(from.x, to.x, .3) + nx * 9, mix(from.y, to.y, .3) + ny * 9,
      mix(from.x, to.x, .7) - nx * 9, mix(from.y, to.y, .7) - ny * 9, to.x, to.y);
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
    for (let i = 1; i <= leaves; i++) {
      const t = i / (leaves + 1), side = i % 2 ? 1 : -1;
      const x = mix(from.x, to.x, t), y = mix(from.y, to.y, t);
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(dy, dx) + side * .7);
      path(ctx, [[0, 0], [6, -4 * side], [15, -2 * side], [6, 3 * side]]);
      ctx.fillStyle = '#d5e8bd'; ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
    }
  }

  bridgeColor(edge) {
    return edge.kind === 'weave' ? COLORS.weave : edge.kind === 'resonance' ? COLORS.resonance
      : edge.kind === 'secret' ? COLORS.secret : edge.kind === 'ascension' ? COLORS.ascension
      : edge.kind === 'vault' ? COLORS.danger : edge.kind === 'shadow' ? '#9c78ba' : this.palette(edge.layer).color;
  }

  drawDependencies() {
    const ctx = this.ctx;
    for (const target of this.state.nodes) {
      for (const sourceId of target.required || []) {
        const source = this.node(sourceId);
        if (!source) continue;
        const received = (target.received || []).includes(sourceId);
        const samePosition = Math.hypot(target.x - source.x, target.y - source.y) < 2;
        ctx.save();
        ctx.globalAlpha = received ? .32 : .17;
        ctx.setLineDash([1, 7]);
        ctx.beginPath(); ctx.moveTo(source.x, source.y - 39);
        if (samePosition) ctx.bezierCurveTo(source.x - 66, source.y - 135, target.x + 66, target.y - 135, target.x, target.y - 39);
        else ctx.quadraticCurveTo((source.x + target.x) / 2, Math.min(source.y, target.y) - 100, target.x, target.y - 39);
        ctx.strokeStyle = this.palette(source.layer).color; ctx.lineWidth = received ? 1.6 : 1; ctx.stroke();
        ctx.setLineDash([]);
        diamond(ctx, target.x, target.y - 39, 3, received ? this.palette(source.layer).color : null, this.palette(source.layer).color);
        ctx.restore();
      }
    }
  }

  drawConnections() {
    const ctx = this.ctx, s = this.state;
    for (const edge of this.connections()) {
      const { a, b } = edge;
      const selected = (s.node === a.id && s.selected === b.id) || (s.node === b.id && s.selected === a.id);
      const traversing = s.travel?.edgeId === edge.id;
      const relevant = selected || traversing;
      const range = relevant && s.range?.layer === edge.layer ? s.range : edge;
      const fits = edge.visible && s.w >= range.min && s.w <= range.max;
      const solid = edge.open && fits || traversing;
      const color = this.bridgeColor(edge);
      const grown = ['weave', 'resonance'].includes(edge.kind);
      const astral = ['secret', 'ascension'].includes(edge.kind);
      const dx = b.x - a.x, dy = b.y - a.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 1) continue;
      const nx = -dy / distance, ny = dx / distance;
      const steps = Math.max(5, Math.floor(distance / 25));
      ctx.save();
      ctx.globalAlpha = edge.visible ? (relevant ? .65 : .36) : .13;
      ctx.setLineDash([3, 8]); line(ctx, a.x, a.y + 5, b.x, b.y + 5, color, 1.5); ctx.setLineDash([]);
      if (solid) {
        ctx.globalAlpha = relevant ? .17 : .08;
        line(ctx, a.x, a.y, b.x, b.y, color, relevant ? 23 : 15);
        for (let i = 1; i < steps; i++) {
          const t = i / steps, x = mix(a.x, b.x, t), y = mix(a.y, b.y, t);
          const width = relevant ? 13 : 10, length = 6;
          const vx = dx / distance * length, vy = dy / distance * length;
          ctx.globalAlpha = relevant ? .95 : .7;
          path(ctx, [[x + nx * width - vx, y + ny * width - vy], [x + nx * width + vx, y + ny * width + vy], [x - nx * width + vx, y - ny * width + vy], [x - nx * width - vx, y - ny * width - vy]]);
          ctx.fillStyle = astral ? edge.kind === 'secret' ? '#e9dafa' : '#fff0b8'
            : grown ? edge.kind === 'weave' ? '#e3f0cc' : '#f9eab6' : '#f7f4e5';
          ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = relevant ? 1.5 : .8; ctx.stroke();
          if (grown && i % 2 === 0) {
            for (const side of [-1, 1]) {
              const px = x + nx * width * side, py = y + ny * width * side;
              diamond(ctx, px, py - 4, 6, this.palette(edge.layer).glow, color);
            }
          }
          if (relevant && i % 2 === 0) diamond(ctx, x, y, 2.2, color);
          if (astral && i % 3 === 0) {
            for (const side of [-1, 1]) diamond(ctx, x + nx * 17 * side, y + ny * 17 * side - 6, 7, '#fffaf0', color);
          }
        }
        if (grown) {
          ctx.globalAlpha = relevant ? .95 : .75;
          for (const side of [-1, 1]) this.drawVine({ x: a.x + nx * 14 * side, y: a.y + ny * 14 * side },
            { x: b.x + nx * 14 * side, y: b.y + ny * 14 * side }, color, 2.2, 5);
          const midpoint = { x: mix(a.x, b.x, .5), y: mix(a.y, b.y, .5) };
          for (let pip = 0; pip <= edge.layer; pip++) ellipse(ctx, midpoint.x + (pip - edge.layer / 2) * 7, midpoint.y - 18, 2, 2, this.palette(edge.layer).color);
        }
        if (astral) {
          ctx.globalAlpha = relevant ? .9 : .64;
          for (const side of [-1, 1]) {
            line(ctx, a.x + nx * 17 * side, a.y + ny * 17 * side, b.x + nx * 17 * side, b.y + ny * 17 * side, color, edge.kind === 'ascension' ? 3 : 1.8);
          }
          const x = mix(a.x, b.x, .5), y = mix(a.y, b.y, .5);
          for (let pip = 0; pip <= edge.layer; pip++) diamond(ctx, x + (pip - edge.layer / 2) * 9, y - 23, 3.2, this.palette(edge.layer).glow, color);
        }
      }
      if (relevant && solid) {
        ctx.globalAlpha = .7;
        for (const side of [-1, 1]) line(ctx, a.x + nx * 19 * side, a.y + ny * 19 * side, b.x + nx * 19 * side, b.y + ny * 19 * side, color, 1);
        if (!this.reducedMotion) {
          const t = (this.time * .42) % 1;
          const from = s.node === b.id ? b : a, to = s.node === b.id ? a : b;
          ellipse(ctx, mix(from.x, to.x, t), mix(from.y, to.y, t), 3, 3, this.palette(edge.layer).glow);
        }
      } else if (!edge.open && edge.visible) {
        ctx.globalAlpha = .65;
        const x = mix(a.x, b.x, .5), y = mix(a.y, b.y, .5);
        ellipse(ctx, x, y, 10, 10, '#edf1e5', color);
        line(ctx, x - 4, y - 4, x + 4, y + 4, color, 1.5);
        line(ctx, x + 4, y - 4, x - 4, y + 4, color, 1.5);
      }
      ctx.restore();
    }
  }

  drawSliceVolumes() {
    const ctx = this.ctx, s = this.state;
    // These are neighboring W-volume silhouettes, never playable platforms.
    for (const node of s.nodes) {
      if (node.anchor) continue;
      const color = this.palette(node.layer).color;
      const delta = (node.world?.w ?? node.center) - s.w;
      const lift = delta * 95;
      ctx.save(); ctx.translate(node.x, node.y - lift);
      ctx.globalAlpha = node.present ? .1 : .25;
      ctx.setLineDash([4, 7]);
      ellipse(ctx, 0, 0, 86, 46, null, color, 1.2);
      ellipse(ctx, 0, -50, 48, 25, null, color, 1);
      for (const side of [-1, 1]) line(ctx, side * 86, 0, side * 48, -50, color, 1);
      ctx.setLineDash([]);
      // A hollow layer token distinguishes an out-of-slice silhouette from a destination.
      if (!node.present) {
        diamond(ctx, 0, -66, 6, null, color);
        for (let i = 0; i <= node.layer; i++) ellipse(ctx, (i - node.layer / 2) * 8, -78, 1.7, 1.7, color);
        if (s.coilArmed?.includes(node.id)) {
          ctx.setLineDash([]); ctx.globalAlpha = .65;
          this.drawCoilMark(0, -66, 13, color);
        }
      }
      ctx.restore();
    }
    ctx.save(); ctx.globalAlpha = .12;
    const y = 395 - s.w * 75;
    path(ctx, [[95, y - 60], [475, y - 235], [925, y - 25], [540, y + 210]]);
    ctx.fillStyle = this.palette().color; ctx.fill();
    ctx.globalAlpha = .2; ctx.strokeStyle = this.palette().color; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
  }

  drawWStack() {
    const ctx = this.ctx, s = this.state;
    if (!s.layers?.length) return;
    ctx.save(); ctx.translate(62, 88);
    const miniScale = clamp(.45 / this.scale, 1, 1.2);
    ctx.scale(miniScale, miniScale);
    const corners = [[0, 25], [67, -5], [128, 22], [60, 53]];
    const at = (point, layer) => ({ x: 63 + (point.x - 500) * .105, y: 24 + (point.y - 340) * .06 + (2 - layer) * 29 });
    const danger = s.wave?.dangerLayers || (s.wave ? [s.wave.layer] : []);
    for (let i = 0; i < s.layers.length; i++) {
      const y = (2 - i) * 29, color = danger.includes(i) ? COLORS.danger : this.palette(i).color;
      ctx.globalAlpha = i === s.layer ? .88 : .36;
      path(ctx, corners.map(([x, cy]) => [x, cy + y]));
      ctx.fillStyle = this.palette(i).pale; ctx.fill(); ctx.strokeStyle = color;
      ctx.lineWidth = danger.includes(i) ? 2.5 : i === s.layer ? 2 : 1; ctx.stroke();
      // Actual mirrored room geometry appears on each W plane, including its bridges.
      for (const edge of this.connections().filter(edge => edge.layer === i && edge.open)) {
        const a = at(edge.a, i), b = at(edge.b, i);
        const grown = ['weave', 'resonance', 'secret', 'ascension'].includes(edge.kind);
        line(ctx, a.x, a.y, b.x, b.y, grown ? this.bridgeColor(edge) : color, grown ? 2.3 : .75);
        if (grown) diamond(ctx, mix(a.x, b.x, .5), mix(a.y, b.y, .5), 2.7, this.bridgeColor(edge));
      }
      for (const node of s.nodes.filter(node => node.anchor || node.layer === i)) {
        const point = at(node, i);
        if (node.id === 'rift') {
          diamond(ctx, point.x, point.y, node.locked ? 2.6 : 4, node.locked ? null : this.palette(i).glow,
            s.rift?.ascension ? COLORS.ascension : COLORS.secret);
          continue;
        }
        ellipse(ctx, point.x, point.y, node.anchor ? 2 : 2.6, node.anchor ? 1.3 : 2.6,
          node.anchor || s.activated.includes(node.id) ? color : this.palette(i).pale, color, .8);
        if (s.coilArmed?.includes(node.id) && node.layer === i) this.drawCoilMark(point.x, point.y, 5, COLORS.coil);
        if (s.woven?.some(item => item.node === node.id) && node.layer === i) diamond(ctx, point.x, point.y - 4, 3, COLORS.weave, '#ffffff');
      }
      const player = at(this.playerPosition(), i);
      if (i === s.layer) { ctx.globalAlpha = 1; diamond(ctx, player.x, player.y, 5, color, '#ffffff'); }
      ctx.globalAlpha = .8;
      for (let dot = 0; dot <= i; dot++) ellipse(ctx, 140 + dot * 7, 22 + y, 2, 2, color);
      if (danger.includes(i)) {
        line(ctx, 132, 14 + y, 158, 32 + y, COLORS.danger, 1.7);
        line(ctx, 132, 32 + y, 158, 14 + y, COLORS.danger, 1.7);
      } else if (s.wave?.safeLayers?.includes(i)) ellipse(ctx, 146, 23 + y, 19, 12, null, '#299c80', 1.7);
    }
    for (const effect of this.effects) {
      if (effect.age < (effect.delay || 0)) continue;
      const p = clamp((effect.age - (effect.delay || 0)) / effect.duration);
      if (effect.kind === 'power' || effect.kind === 'coil_arc' || effect.kind === 'ascension_signal') {
        const from = at(effect, effect.fromLayer), to = at(effect.to, effect.toLayer);
        ctx.globalAlpha = 1 - p;
        line(ctx, from.x, from.y, to.x, to.y, effect.color, 2);
        diamond(ctx, mix(from.x, to.x, this.reducedMotion ? .5 : p), mix(from.y, to.y, this.reducedMotion ? .5 : p), 4, effect.color, '#ffffff');
      } else if (['resonance', 'garden_bloom', 'root_growth', 'growth_signal'].includes(effect.kind)) {
        const point = at(effect, effect.layer);
        ctx.globalAlpha = (1 - p) * .8;
        ellipse(ctx, point.x, point.y, 5 + p * 16, 3 + p * 8, null, effect.color, 1.8);
        if (effect.to) {
          const to = at(effect.to, effect.layer);
          line(ctx, point.x, point.y, to.x, to.y, effect.color, 2);
        }
      }
    }
    if (s.ghost) {
      const node = this.node(s.ghost.node);
      if (node) { const point = at(node, s.ghost.layer); ctx.globalAlpha = .7; diamond(ctx, point.x, point.y, 4, null, this.palette(s.ghost.layer).color); }
    }
    ctx.globalAlpha = .75;
    const cutY = 58 * (1 - s.w);
    ctx.setLineDash([4, 3]);
    path(ctx, corners.map(([x, y]) => [x, y + cutY])); ctx.strokeStyle = this.palette().color; ctx.lineWidth = 1.2; ctx.stroke(); ctx.setLineDash([]);
    const labelSize = clamp(10 / (this.scale * miniScale), 12, 22);
    ctx.font = `500 ${labelSize}px system-ui, sans-serif`; ctx.textAlign = 'left'; ctx.fillStyle = COLORS.ink;
    ctx.fillText(`W  ${s.w.toFixed(2)}`, 10, 128);
    ctx.restore();
  }

  drawGhost() {
    const s = this.state, ghost = s.ghost;
    if (!ghost) return;
    const node = this.node(ghost.node);
    if (!node) return;
    const ctx = this.ctx, color = this.palette(ghost.layer).color;
    ctx.save(); ctx.globalAlpha = .55;
    this.drawAvatar(node.x - 21, node.y - 4, color, true);
    ctx.beginPath(); ctx.ellipse(node.x, node.y, 55, 29, 0, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(ghost.remaining / ghost.duration));
    ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.stroke();
    ctx.setLineDash([3, 5]); ellipse(ctx, node.x, node.y - 10, 32, 40, null, color, 1); ctx.setLineDash([]);
    ctx.restore();
  }

  drawWave() {
    const s = this.state, wave = s.wave;
    if (!wave) return;
    const node = this.node(wave.node);
    if (!node) return;
    const ctx = this.ctx, p = clamp(1 - wave.remaining / wave.duration);
    const danger = wave.dangerLayers || [wave.layer];
    const safe = (wave.safeLayers || s.layers.map((_, i) => i).filter(i => !danger.includes(i)))
      .some(layer => Math.abs(s.w - s.layers[layer].center) <= .16 * Math.sqrt(.75) + 1e-9)
      && (wave.variant !== 'rift' || wave.entered);
    ctx.save(); ctx.translate(node.x, node.y);
    if (wave.variant === 'rift') {
      // Separate the high-stakes shrine warning from a chest wave with four
      // fixed teeth. Layer rings and the countdown remain the safety authority.
      for (const side of [-1, 1]) {
        for (const height of [-55, 35]) {
          path(ctx, [[side * 115, height - 18], [side * 103, height], [side * 115, height + 18]]);
          ctx.strokeStyle = COLORS.danger; ctx.lineWidth = 3; ctx.stroke();
        }
      }
    }
    const radius = this.reducedMotion ? 108 : 35 + 160 * (1 - p);
    for (const layer of danger) {
      const lift = (s.layers[layer].center - s.w) * 85;
      ctx.globalAlpha = safe ? .3 : layer === s.layer ? .9 : .55;
      ellipse(ctx, 0, -lift, radius, radius * .55, '#d36d5910', COLORS.danger, 2.5);
      for (let i = 0; i < (this.reducedMotion ? 4 : 8); i++) {
        const a = i * TAU / (this.reducedMotion ? 4 : 8);
        diamond(ctx, Math.cos(a) * radius, Math.sin(a) * radius * .55 - lift, 4, COLORS.danger);
      }
      // Layer pips identify each simultaneous blocked slice without covering the player.
      for (let pip = 0; pip <= layer; pip++) ellipse(ctx, (pip - layer / 2) * 9, -radius * .55 - lift - 9, 2.6, 2.6, COLORS.danger);
    }
    ctx.globalAlpha = safe ? .85 : 1;
    ctx.beginPath(); ctx.ellipse(0, 0, 95, 52, 0, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - p));
    ctx.strokeStyle = safe ? '#299c80' : COLORS.danger; ctx.lineWidth = 5; ctx.stroke();
    ctx.font = `600 ${clamp(12 / this.scale, 18, 30)}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.fillStyle = safe ? '#247b65' : '#9f4938';
    ctx.fillText(wave.remaining.toFixed(1), 0, -92);
    for (let stage = 0; stage < (wave.steps || 1); stage++) {
      const done = stage < (wave.step || 1) - 1;
      diamond(ctx, (stage - ((wave.steps || 1) - 1) / 2) * 13, -72, 3.8, done ? '#299c80' : stage === (wave.step || 1) - 1 ? COLORS.danger : null, done ? '#299c80' : COLORS.danger);
    }
    ctx.restore();
  }

  momentumNode() {
    const cue = this.state.courtyardMomentum, node = cue && this.node(cue.node);
    return node?.present && cue.age >= 0 && cue.age < cue.duration && !this.state.companionGuide &&
      !this.state.travel && !this.state.wave && this.state.phase === 'playing' ? node : null;
  }

  drawMomentum() {
    const node = this.momentumNode(), cue = this.state.courtyardMomentum;
    if (!node) return;
    const ctx = this.ctx, p = clamp(cue.age / cue.duration);
    const opacity = Math.min(1, cue.age / .25) * (1 - ease((p - .55) / .45));
    const narrow = this.width <= 480, follow = cue.beat === 'follow' || cue.beat === 'mechanism-follow';
    const pulse = this.reducedMotion ? 1 : .5 - .5 * Math.cos(TAU * cue.age / 1.4);
    const width = node.id === 'hub' ? 91 : 64;
    const swell = this.reducedMotion ? 0 : width * .06 * pulse;
    const section = node.anchor ? 1 : node.scale, pixel = 1 / (this.scale * section);
    ctx.save(); ctx.translate(node.x, node.y);
    ctx.scale(section, section);
    ctx.globalAlpha = (follow ? .23 : .28) * opacity;
    const rimY = narrow ? -5 : 5, rimHeight = narrow ? 20 : 24;
    ellipse(ctx, 0, rimY, width + swell, rimHeight + swell * .2, '#E8B45A');
    ctx.globalAlpha = (follow ? .85 : .70) * opacity;
    // A shallow rim glint stays on the platform, clear of the name below it.
    ctx.strokeStyle = '#D4A04A'; ctx.lineWidth = (narrow ? 4 : 3) * pixel;
    ctx.beginPath(); ctx.ellipse(0, rimY, width + swell, rimHeight + swell * .2, 0, .15 * Math.PI, .85 * Math.PI); ctx.stroke();
    ctx.globalAlpha = .35 * opacity; ctx.setLineDash([6 * pixel, 4 * pixel]);
    ellipse(ctx, 0, rimY - 3 * pixel, width + swell, rimHeight, null, '#D4A04A', (narrow ? 3 : 2) * pixel);
    ctx.setLineDash([]);
    // One finite sparkle; no idle particle emitter or extra label.
    ctx.globalAlpha = (.45 + .30 * pulse) * opacity * (1 - clamp(cue.age / .8) ** 2);
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * (.15 + .7 * i / 4), dot = (narrow ? 4 : 3) * pixel / 2;
      ellipse(ctx, Math.cos(a) * (width + swell), rimY - Math.sin(a) * rimHeight, dot, dot, '#F0C56A');
    }
    ctx.restore();
  }

  drawSceneCues() {
    const s = this.state, ctx = this.ctx;
    if (s.phase !== 'playing' || s.travel || s.wave) return;
    const reachable = new Set(this.momentumNode() ? [] : reachablePlatforms(s));
    const missing = new Set(missingSupplySources(s).map(node => node.id));
    const pulse = this.reducedMotion ? .65 : .5 + .5 * Math.sin(this.time * 3);
    for (const node of s.nodes) {
      const available = reachable.has(node.id), waiting = missing.has(node.id);
      if (!available && !waiting) continue;
      const color = available ? COLORS.gold : this.palette(node.layer).color;
      const width = node.id === 'hub' ? 110 : node.anchor ? 82 : 90;
      ctx.save(); ctx.translate(node.x, node.y);
      // Off-slice sources stay hollow and dashed; the cue never creates footing.
      const section = node.present ? (node.anchor ? 1 : node.scale) : 1;
      ctx.scale(section, section);
      ctx.globalAlpha = available ? .55 + pulse * .35 : .28 + pulse * .23;
      ctx.setLineDash(node.present ? [] : [7, 7]);
      ellipse(ctx, 0, 1, width + 8 + pulse * 4, 52 + pulse * 3, null, color, (available ? 2.4 : 1.5) / this.scale);
      ctx.restore();
      if (waiting) {
        ctx.save(); ctx.fillStyle = color; ctx.textAlign = 'center';
        ctx.font = `500 ${clamp(11 / this.scale, 16, 38)}px system-ui, sans-serif`;
        ctx.fillText(`${node.name} · ${s.layers[node.layer].name}`, node.x, node.y - 108);
        ctx.restore();
      }
    }
  }

  drawIsland(node) {
    const ctx = this.ctx, s = this.state;
    if (node.id === 'rift' && node.locked) { this.drawRiftSilhouette(node); return; }
    const hub = node.id === 'hub', exit = node.id === 'exit';
    const section = node.anchor ? 1 : clamp(node.scale);
    if (section <= .01) return;
    const palette = this.palette(node.layer ?? s.layer);
    const active = s.activated.includes(node.id);
    const selected = s.selected === node.id && s.phase === 'playing';
    const adjacent = s.availableNodes.includes(node.id);
    const width = hub ? 110 : exit ? 86 : node.anchor ? 82 : 90;
    const height = hub ? 57 : 46;
    const thickness = hub ? 30 : 25;
    const points = [[-width, -height * .16], [-width * .68, -height * .77], [-width * .13, -height], [width * .65, -height * .68], [width, -.02 * height], [width * .66, height * .7], [-width * .1, height], [-width * .79, height * .6]];
    ctx.save(); ctx.translate(node.x, node.y);
    ctx.save(); ctx.scale(section, section);
    ctx.globalAlpha = node.anchor ? 1 : clamp(.15 + node.visibility * .85);
    if (node.anchor) {
      // An anchored column spans the W stack; its top remains solid while slices change.
      path(ctx, [[-width * .52, 9], [-width * .4, 81], [0, 104], [width * .4, 81], [width * .52, 9]]);
      ctx.fillStyle = '#9db5a14a'; ctx.fill();
      for (let i = 0; i < 3; i++) {
        ellipse(ctx, 0, 40 + i * 22, width * (.49 - i * .05), 19 - i * 2, null, this.palette(i).color + '70', 1.5);
      }
      for (const side of [-1, 1]) line(ctx, side * width * .5, 10, side * width * .4, 81, '#96aa9270', 1);
    }
    ellipse(ctx, 4, 57, width * 1.1, height * .62, '#3f756712');
    ellipse(ctx, 4, 51, width * .8, height * .42, '#34655212');
    if (selected || this.hover === node.id) {
      ellipse(ctx, 0, 2, width + 12, height + 8, selected ? '#d7994310' : '#24968d0b', selected ? '#d7994385' : '#24968d45', 1.7);
      if (selected) {
        const float = this.reducedMotion ? 0 : Math.sin(this.time * 3) * 3;
        path(ctx, [[-6, -height - 17 + float], [6, -height - 17 + float], [0, -height - 10 + float]]);
        ctx.fillStyle = COLORS.gold; ctx.fill();
      }
    }
    // Cut stone side facets are deterministic; decorations never imply triggers.
    for (let i = 3; i < points.length; i++) {
      const p = points[i], q = points[(i + 1) % points.length];
      if (p[1] < 0 && q[1] < 0) continue;
      path(ctx, [p, q, [q[0] * .85, q[1] + thickness], [p[0] * .85, p[1] + thickness]]);
      ctx.fillStyle = i % 2 ? palette.side : '#b8c6b2'; ctx.fill();
      line(ctx, p[0], p[1] + 2, p[0] * .85, p[1] + thickness, '#7fa28e70', 1);
    }
    path(ctx, points); ctx.fillStyle = palette.stone; ctx.fill();
    ctx.strokeStyle = '#faffee'; ctx.lineWidth = 2; ctx.stroke();
    path(ctx, points.map(([x, y]) => [x * .89, y * .84]));
    ctx.strokeStyle = '#c4d0b7'; ctx.lineWidth = 1; ctx.stroke();
    // Small paving seams, moss, and botanics preserve a crafted garden character.
    line(ctx, -width * .9, 5, width * .89, 5, '#bdccb257', 1);
    line(ctx, -width * .45, -height * .8, -width * .33, height * .85, '#bdccb257', 1);
    line(ctx, width * .4, -height * .77, width * .32, height * .8, '#bdccb257', 1);
    for (let i = 0; i < 5; i++) {
      const angle = i * 1.39 + (hub ? .3 : 1);
      const x = Math.cos(angle) * width * .77, y = Math.sin(angle) * height * .7;
      ellipse(ctx, x, y, 11 + hash(i + node.x) * 10, 4, '#6da48440');
      this.drawPlant(x, y, active, i + node.x);
    }
    // The rim belongs to this W section, making the same XYZ visibly change material.
    ellipse(ctx, 0, 1, width * .82, height * .76, null, palette.color + '60', 1.5);
    this.drawGardenGrowth(node, width, height);
    this.drawAscendedArchitecture(node, width);
    if (hub) this.drawHub();
    else if (exit) this.drawGate(node);
    else if (node.id === 'relay') this.drawAnchor();
    else if (node.id === 'vault') this.drawVault(node);
    else if (node.id === 'rift') this.drawRift(node);
    else { this.drawMechanism(node, active); this.drawInputSlots(node); }
    this.drawSecretSeals(node, width, height);
    if (node.powered && !active && !node.locked && !node.anchor) {
      const h = node.id === 'bell' ? -74 : -54;
      diamond(ctx, 0, h, 7, palette.glow, palette.color);
      ellipse(ctx, 0, h, 13, 13, null, palette.color + '70', 1);
    }
    if (active) {
      ctx.save(); ctx.globalAlpha = .45;
      ellipse(ctx, 0, 2, width * .73, height * .56, null, palette.color, 1.2); ctx.restore();
    }
    if (s.coilArmed?.includes(node.id)) this.drawCoilMark(0, -52, 23, COLORS.coil);
    if (s.woven?.some(item => item.node === node.id)) {
      line(ctx, -47, 20, -47, -8, COLORS.weave, 2.8);
      for (const side of [-1, 1]) {
        ctx.save(); ctx.translate(-47, 9); ctx.rotate(side * .65);
        ellipse(ctx, side * 6, -5, 7, 3.5, '#c7e8ac', COLORS.weave, 1.2); ctx.restore();
      }
      diamond(ctx, -47, -12, 8, this.palette(node.layer).glow, COLORS.weave);
    }
    if (adjacent && !exit) {
      diamond(ctx, 0, height + thickness + 14, 3.5, selected ? COLORS.gold : '#739d88');
    }
    ctx.restore();
    if (!node.present) { ctx.restore(); return; }
    const labelY = Math.min((height + thickness) * section + 29, WORLD_H - node.y - 25);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // Labels retain a useful screen size when the whole garden fits a phone.
    const labelSize = clamp(11 / this.scale, 16, 38);
    ctx.font = `${selected ? 600 : 500} ${labelSize}px system-ui, -apple-system, sans-serif`;
    const name = node.name || { hub: '归息台', dew: '凝露坛', bell: '回声铃', bloom: '映光花', exit: '折光门' }[node.id] || node.id;
    const textWidth = ctx.measureText(name).width;
    ctx.fillStyle = '#edf2e9dd';
    const labelHeight = labelSize + 8;
    this.labelZones?.push({ left: node.x - textWidth / 2 - 8, right: node.x + textWidth / 2 + 8, top: node.y + labelY - labelHeight / 2, bottom: node.y + labelY + labelHeight / 2 });
    ctx.beginPath(); ctx.roundRect?.(-textWidth / 2 - 8, labelY - labelHeight / 2, textWidth + 16, labelHeight, 8);
    if (!ctx.roundRect) ctx.rect(-textWidth / 2 - 8, labelY - labelHeight / 2, textWidth + 16, labelHeight);
    ctx.fill(); ctx.fillStyle = selected ? '#936125' : COLORS.ink; ctx.fillText(name, 0, labelY);
    ctx.restore();
  }

  drawCoilMark(x, y, radius, color) {
    const ctx = this.ctx;
    for (const side of [0, Math.PI]) {
      ctx.beginPath(); ctx.ellipse(x, y, radius, radius * .66, -.2, side + .18, side + Math.PI - .18);
      ctx.strokeStyle = color; ctx.lineWidth = radius > 10 ? 2.4 : 1.3; ctx.stroke();
      diamond(ctx, x + Math.cos(side) * radius, y - Math.sin(side) * radius * .66, radius > 10 ? 4 : 1.8, '#f6eaff', color);
    }
  }

  drawFlower(x, y, radius, color, layer) {
    const ctx = this.ctx;
    for (let i = 0; i < 5; i++) {
      const angle = i * TAU / 5 - Math.PI / 2;
      ctx.save(); ctx.translate(x + Math.cos(angle) * radius * .65, y + Math.sin(angle) * radius * .48);
      ctx.rotate(angle + Math.PI / 2);
      path(ctx, [[0, radius * .4], [-radius * .5, -radius * .1], [0, -radius], [radius * .5, -radius * .1]]);
      ctx.fillStyle = this.palette(layer).glow; ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = .9; ctx.stroke(); ctx.restore();
    }
    diamond(ctx, x, y, radius * .4, '#fff6cf', color);
  }

  drawGardenGrowth(node, width, height) {
    const growth = this.state.resonance;
    if (!growth?.triggered) return;
    const requiredStage = { hub: 1, vault: 2, relay: 3 }[node.id];
    if (!requiredStage || growth.stage < requiredStage) return;
    const ctx = this.ctx, layer = growth.edge.layer, color = this.palette(layer).color;
    // This is permanent world geometry, so a cleared effect queue never erases it.
    const current = this.state.layer === layer;
    ctx.save();
    ellipse(ctx, 0, 0, width * .88, height * .79, null, COLORS.resonance, 2.4);
    ellipse(ctx, 0, 0, width * .82, height * .72, null, '#f5e3a8', 2);
    const count = requiredStage === 1 ? 6 : 4;
    for (let i = 0; i < count; i++) {
      const angle = i * TAU / count + .35;
      const x = Math.cos(angle) * width * .8, y = Math.sin(angle) * height * .68;
      const top = y - (requiredStage === 3 ? 32 : 17);
      ctx.beginPath(); ctx.moveTo(x * .75, y * .8 + 4); ctx.quadraticCurveTo(x + 7, y + 3, x, top);
      ctx.strokeStyle = COLORS.weave; ctx.lineWidth = 2.5; ctx.stroke();
      ellipse(ctx, x + (i % 2 ? 6 : -6), y - 6, 7, 3.8, '#b8d99d', COLORS.weave, 1);
      if (requiredStage === 3) {
        diamond(ctx, x, top, 13, current ? this.palette(layer).glow : '#e7e4c2', color);
        line(ctx, x, top - 12, x, top + 12, '#ffffef', 1.5);
      } else this.drawFlower(x, top, requiredStage === 2 ? 11 : 8, COLORS.resonance, layer);
    }
    // Persistent W pips identify the layer that the new vault—relay route occupies.
    for (let i = 0; i <= layer; i++) diamond(ctx, (i - layer / 2) * 11, height * .63, 3.4, color, '#fff4c7');
    ctx.restore();
  }

  drawPlant(x, y, active, seed) {
    const ctx = this.ctx;
    ctx.save(); ctx.translate(x, y);
    const height = 8 + hash(seed + 8) * 9;
    line(ctx, 0, 0, 1, -height, '#608b69', 1.5);
    for (let side = -1; side <= 1; side += 2) {
      ctx.save(); ctx.translate(0, -height * .45); ctx.rotate(side * .45);
      ellipse(ctx, side * 4, -2, 4.8, 2.4, active ? '#70ab84' : '#8aa982'); ctx.restore();
    }
    if (active || hash(seed) > .7) {
      ellipse(ctx, 1, -height, 3.3, 2.7, active ? '#efce7e' : '#dce3c2');
      ellipse(ctx, 1, -height, 1.2, 1.2, '#f8efd0');
    }
    ctx.restore();
  }

  drawHub() {
    const ctx = this.ctx, s = this.state;
    ellipse(ctx, 0, 0, 64, 35, '#b9cdb9', '#eff6df', 2);
    ellipse(ctx, 0, -2, 57, 29, '#dce5d0', '#a8c4ac', 1);
    ellipse(ctx, 0, -3, 40, 21, '#d0e2cf', '#8cb5a0', 1);
    for (let i = 0; i < 12; i++) {
      const angle = i * TAU / 12;
      line(ctx, Math.cos(angle) * 45, Math.sin(angle) * 24 - 2, Math.cos(angle) * 51, Math.sin(angle) * 27 - 2, '#699a84', i % 3 === 0 ? 2 : 1);
    }
    diamond(ctx, 0, -3, 14, '#a8cebb', '#779c87');
    const wAngle = s.w * TAU - Math.PI / 2;
    ellipse(ctx, Math.cos(wAngle) * 51, Math.sin(wAngle) * 27 - 2, 4, 3, COLORS.gold, '#ffefbf', 1);
    if (s.banked > 0) {
      const stacks = Math.min(7, Math.ceil(s.banked / 3));
      for (let i = 0; i < stacks; i++) diamond(ctx, -49 + i * 16, 30 - (i % 2) * 3, 4, '#e3bd65', '#c19642');
    }
  }

  drawAnchor() {
    const ctx = this.ctx;
    ellipse(ctx, 0, 4, 39, 21, '#d0dbc5', '#f7f7df', 2);
    path(ctx, [[-11, 3], [-11, -48], [0, -57], [12, -48], [12, 3], [0, 10]]);
    ctx.fillStyle = '#c5d6c2'; ctx.fill(); ctx.strokeStyle = '#90aa94'; ctx.lineWidth = 1.5; ctx.stroke();
    line(ctx, 0, -56, 0, 8, '#f9fff0', 2);
    for (let i = 0; i < 3; i++) {
      ellipse(ctx, 0, -7 - i * 18, 27 - i * 3, 12, null, this.palette(i).color, i === this.state.layer ? 3 : 1.2);
      diamond(ctx, 27 - i * 3, -7 - i * 18, 3.2, this.palette(i).glow, this.palette(i).color);
    }
    diamond(ctx, 0, -65, 6, this.palette().glow, this.palette().color);
  }

  drawVault(node) {
    const ctx = this.ctx, palette = this.palette(node.layer);
    ellipse(ctx, 0, 3, 43, 22, '#c8cbb4', '#f1eed7', 2);
    const visibility = clamp(node.chestVisibility ?? (this.state.layer === node.layer ? 1 : 0));
    if (visibility <= .01) {
      ctx.save(); ctx.globalAlpha = .2; ctx.setLineDash([3, 5]);
      path(ctx, [[-27, 0], [-27, -25], [0, -39], [28, -25], [28, 0], [0, 15]]);
      ctx.strokeStyle = this.palette(node.layer).color; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
      return;
    }
    ctx.save(); ctx.scale(visibility, visibility);
    ctx.globalAlpha = .2 + visibility * .8;
    const open = this.state.vaultStatus === 'escaped';
    path(ctx, [[-29, -8], [0, 5], [29, -8], [29, 7], [0, 21], [-29, 7]]);
    ctx.fillStyle = palette.side; ctx.fill(); ctx.strokeStyle = palette.color; ctx.stroke();
    path(ctx, [[-29, -8], [-22, -28 - (open ? 17 : 0)], [0, -36 - (open ? 17 : 0)], [22, -28 - (open ? 17 : 0)], [29, -8], [0, 5]]);
    ctx.fillStyle = open ? '#efe3b5' : palette.pale; ctx.fill(); ctx.strokeStyle = palette.color; ctx.lineWidth = 1.5; ctx.stroke();
    diamond(ctx, 0, -9, 11, node.locked ? '#a8a298' : '#edd295', '#9a814d');
    if (this.state.wave) {
      line(ctx, -21, -22, 0, -6, COLORS.danger, 2); line(ctx, 0, -6, 21, -22, COLORS.danger, 2);
    }
    ctx.restore();
  }

  drawMechanism(node, active) {
    const ctx = this.ctx;
    const beat = this.reducedMotion ? 0 : Math.sin(this.time * 2.5 + node.x) * 1.5;
    if (node.id === 'dew') {
      ellipse(ctx, 0, 4, 37, 21, '#a4bca8', '#f2f5e1', 2);
      ellipse(ctx, 0, 0, 32, 17, active ? '#51aaa0' : '#9ebdb0', '#7c9e8d', 1.5);
      ellipse(ctx, 0, -1, 24, 11, null, active ? '#c1ffe2' : '#c7d7c3', 1);
      ellipse(ctx, 0, -1, 14, 6, null, active ? '#a7e9cd' : '#bed1bd', 1);
      for (const x of [-25, 25]) {
        path(ctx, [[x - 5, 0], [x - 5, -26], [x + 5, -29], [x + 6, -2]]);
        ctx.fillStyle = '#aec1a8'; ctx.fill();
        diamond(ctx, x, -29, 4, active ? COLORS.lightGold : '#d7d9b5', '#a4a37e');
      }
      diamond(ctx, 0, -25 + (active ? beat : 0), 14, active ? '#9cebd5' : '#a3bcae', '#509c89');
      path(ctx, [[0, -39 + (active ? beat : 0)], [0, -11 + (active ? beat : 0)], [-9.2, -25 + (active ? beat : 0)]]);
      ctx.fillStyle = active ? '#d7ffe8' : '#d0ddc9'; ctx.fill();
      if (active) ellipse(ctx, 0, -25 + beat, 23, 23, '#a9f7db12');
    } else if (node.id === 'bell') {
      ellipse(ctx, 0, 8, 36, 16, '#cad6be', '#f2f5df', 2);
      for (const x of [-28, 28]) {
        path(ctx, [[x - 5, 8], [x - 5, -48], [x + 5, -48], [x + 5, 8]]);
        ctx.fillStyle = '#a3b8a0'; ctx.fill(); line(ctx, x - 4, -47, x - 4, 5, '#f1f4dc', 1.5);
      }
      path(ctx, [[-36, -47], [-30, -55], [32, -55], [37, -47]]);
      ctx.fillStyle = '#d9d7b0'; ctx.fill(); ctx.strokeStyle = '#b5b992'; ctx.stroke();
      line(ctx, 0, -49, 0, -35, '#aa8953', 2);
      ctx.save(); ctx.translate(0, -36); ctx.rotate(active && !this.reducedMotion ? Math.sin(this.time * 2.7) * .07 : 0);
      ctx.beginPath(); ctx.moveTo(-5, 0); ctx.quadraticCurveTo(-18, 5, -18, 24); ctx.lineTo(-22, 28);
      ctx.quadraticCurveTo(0, 35, 22, 28); ctx.lineTo(18, 24); ctx.quadraticCurveTo(18, 5, 5, 0); ctx.closePath();
      ctx.fillStyle = active ? '#dcb76a' : '#b8bb91'; ctx.fill(); ctx.strokeStyle = '#9f8c59'; ctx.lineWidth = 1.5; ctx.stroke();
      line(ctx, -10, 8, -13, 22, active ? '#fff0b5' : '#dde0b4', 2);
      ellipse(ctx, 0, 30, 3.5, 3.5, active ? '#fbefad' : '#a09f78'); ctx.restore();
      if (active) {
        for (const side of [-1, 1]) {
          ctx.beginPath(); ctx.ellipse(side * 28, -20, 7, 13, 0, side > 0 ? -1.1 : Math.PI - 1.1, side > 0 ? 1.1 : Math.PI + 1.1);
          ctx.strokeStyle = '#c49e5080'; ctx.lineWidth = 1.2; ctx.stroke();
        }
      }
    } else {
      ellipse(ctx, 0, 5, 37, 17, '#c0d2b5', '#f5f5de', 2);
      for (let i = 0; i < 7; i++) {
        const angle = i * TAU / 7 - Math.PI / 2;
        const radius = active ? 22 : 10;
        const px = Math.cos(angle) * radius, py = -17 + Math.sin(angle) * radius * .7;
        ctx.save(); ctx.translate(px, py); ctx.rotate(angle + Math.PI / 2);
        ctx.beginPath(); ctx.moveTo(0, 13); ctx.bezierCurveTo(-14, 1, -12, -13, 0, -19); ctx.bezierCurveTo(12, -13, 14, 1, 0, 13);
        ctx.fillStyle = active ? ['#f4dfa2', '#eacb7d', '#f7e8b7'][i % 3] : i % 2 ? '#9fb895' : '#b2c49f';
        ctx.fill(); ctx.strokeStyle = active ? '#c8af6a' : '#819f7e'; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
      }
      ellipse(ctx, 0, -17, active ? 9 : 6, active ? 8 : 6, active ? '#fff7c8' : '#ccd4aa', '#c3b778', 1);
      if (active) {
        for (let i = 0; i < 4; i++) {
          const angle = i * TAU / 4 + (this.reducedMotion ? .5 : this.time * .3);
          diamond(ctx, Math.cos(angle) * 37, -24 + Math.sin(angle) * 20, 2.5, '#fff7bf');
        }
      }
    }
  }

  drawInputSlots(node) {
    const sources = node.required || [];
    if (!sources.length) return;
    const ctx = this.ctx;
    const slotScale = clamp(.55 / this.scale, 1, 1.55);
    ctx.save(); ctx.scale(slotScale, slotScale);
    const gap = 25;
    for (let i = 0; i < sources.length; i++) {
      const source = this.node(sources[i]);
      if (!source) continue;
      const received = (node.received || []).includes(source.id);
      const x = (i - (sources.length - 1) / 2) * gap;
      const color = this.palette(source.layer).color;
      ellipse(ctx, x, 24, 10, 6, received ? this.palette(source.layer).glow : '#edf1e5', color, received ? 2 : 1);
      line(ctx, x, 18, x * .45, 5, color + (received ? 'bb' : '45'), received ? 2 : 1);
      if (source.id === 'dew') diamond(ctx, x, 23, 4.8, received ? color : null, color);
      else if (source.id === 'bell') {
        ctx.beginPath(); ctx.arc(x, 23, 4.5, Math.PI, TAU); ctx.lineTo(x + 5.5, 26); ctx.lineTo(x - 5.5, 26); ctx.closePath();
        ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke(); if (received) { ctx.fillStyle = color; ctx.fill(); }
      } else {
        for (let petal = 0; petal < 4; petal++) {
          const angle = petal * TAU / 4;
          ellipse(ctx, x + Math.cos(angle) * 3, 23 + Math.sin(angle) * 2.3, 2.2, 1.7, received ? color : null, color, .7);
        }
      }
    }
    ctx.restore();
  }

  drawGate(node) {
    const ctx = this.ctx, s = this.state;
    const open = !node.locked;
    ellipse(ctx, 0, 4, 44, 19, '#b8ceb8', '#f3f6df', 2);
    if (open) {
      const glow = ctx.createRadialGradient(0, -29, 2, 0, -29, 60);
      glow.addColorStop(0, '#fff0b88c'); glow.addColorStop(1, '#fff0b800');
      ctx.fillStyle = glow; ctx.fillRect(-66, -93, 132, 130);
    }
    for (const x of [-29, 29]) {
      path(ctx, [[x - 8, 6], [x - 8, -59], [x + 6, -61], [x + 9, 4]]);
      ctx.fillStyle = '#bccdb4'; ctx.fill(); line(ctx, x - 7, 3, x - 7, -56, '#f9f7df', 2);
      path(ctx, [[x - 11, -52], [x - 10, -64], [x + 9, -64], [x + 12, -54]]);
      ctx.fillStyle = '#d5ddc0'; ctx.fill();
    }
    path(ctx, [[-41, -62], [-31, -74], [32, -74], [42, -62]]);
    ctx.fillStyle = '#d9ddbf'; ctx.fill(); ctx.strokeStyle = '#a3b99d'; ctx.lineWidth = 1; ctx.stroke();
    if (open) {
      const fill = ctx.createLinearGradient(0, -60, 0, 7);
      fill.addColorStop(0, '#d7edc8b0'); fill.addColorStop(.55, '#fff1bfdd'); fill.addColorStop(1, '#e4eac48c');
      ctx.fillStyle = fill; ctx.fillRect(-20, -57, 40, 58);
      for (let i = 0; i < 3; i++) {
        const y = -53 + (this.reducedMotion ? i * 17 : (this.time * 12 + i * 19) % 55);
        line(ctx, -14, y, 14, y, '#fff9d298', 1);
      }
      diamond(ctx, 0, -27, 11, '#fffbd8', '#dbbe79');
    } else {
      line(ctx, -21, -48, 21, -7, '#9cb6a0', 1);
      line(ctx, 21, -48, -21, -7, '#9cb6a0', 1);
      diamond(ctx, 0, -28, 9, '#ced8bb', '#91ad95');
    }
    const order = s.mechanismOrder || s.nodes.filter(item => item.kind === 'mechanism').map(item => item.id);
    for (let i = 0; i < order.length; i++) {
      const active = s.activated.includes(order[i]);
      const color = this.palette(this.node(order[i])?.layer).color;
      diamond(ctx, (i - (order.length - 1) / 2) * 15, -66, 4.3, active ? '#ffe8a1' : '#dce1cd', color);
    }
  }

  playerPosition() {
    const s = this.state;
    if (s.travel) {
      const from = this.node(s.travel.from), to = this.node(s.travel.to);
      if (from && to) {
        const t = clamp(s.travel.progress);
        return { x: mix(from.x, to.x, t), y: mix(from.y, to.y, t) };
      }
    }
    return this.node(s.node) || { x: 500, y: 390 };
  }

  drawPlayer() {
    const ctx = this.ctx, s = this.state;
    const position = this.playerPosition(); this.lastPlayer = { x: position.x, y: position.y };
    const travel = s.travel, risky = travel?.risky;
    const stability = travel ? travel.stability : (s.phaseStability ?? 1);
    const stable = stability > .5;
    const color = !stable ? COLORS.danger : risky ? COLORS.gold : this.palette().color;
    ctx.save(); ctx.translate(position.x, position.y);
    ellipse(ctx, 0, 6, 16, 7, '#345f5729');
    if (travel || stability < .99) {
      ctx.save(); ctx.globalAlpha = .3;
      ellipse(ctx, 0, 5, 26, 13, color); ctx.restore();
      ctx.beginPath(); ctx.ellipse(0, 5, 24, 13, 0, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(stability));
      ctx.strokeStyle = color; ctx.lineWidth = 3.3; ctx.stroke();
      // Visible falling fragments communicate imminent collapse without text.
      if (stability < .45) {
        for (let i = 0; i < 4; i++) {
          const offset = this.reducedMotion ? 6 : (this.time * 22 + i * 8) % 22;
          diamond(ctx, (i - 1.5) * 13, 13 + offset, 2.4, '#bf8b6c99');
        }
      }
    }
    const bob = this.reducedMotion ? 0 : Math.sin(this.time * (travel ? 10 : 2.5)) * (travel ? 1.4 : 1);
    ctx.save();
    const avatarScale = clamp(.48 / this.scale, 1, 1.5);
    ctx.scale(avatarScale, avatarScale);
    this.drawAvatar(0, bob, color, false); ctx.restore();
    if (s.shield) {
      ctx.beginPath(); ctx.ellipse(0, -12 + bob, 19, 25, 0, Math.PI * .08, Math.PI * 1.92);
      ctx.strokeStyle = '#8cc7bdbb'; ctx.lineWidth = 1.5; ctx.stroke();
      diamond(ctx, 0, -38 + bob, 3.5, '#8cc7bd');
    }
    if (s.charge) {
      const angle = this.reducedMotion ? -.6 : this.time * 1.3;
      const x = Math.cos(angle) * 27, y = -14 + Math.sin(angle) * 15;
      ellipse(ctx, x, y, 8, 8, '#ffe6a32b'); diamond(ctx, x, y, 5, '#f5d37a', '#fff2bb');
    }
    if (s.weaveCharge) {
      const x = -27, y = -14;
      line(ctx, x, y + 7, x, y - 5, COLORS.weave, 1.8);
      ellipse(ctx, x - 5, y - 2, 5, 2.8, '#c9edb1', COLORS.weave, 1);
      ellipse(ctx, x + 5, y - 5, 5, 2.8, '#c9edb1', COLORS.weave, 1);
      diamond(ctx, x, y - 10, 3.8, COLORS.mint, COLORS.weave);
    }
    if (s.combo > 0) {
      for (let i = 0; i < Math.min(3, s.combo); i++) diamond(ctx, (i - (s.combo - 1) / 2) * 10, -48, 3.2, COLORS.gold);
    }
    ctx.restore();
  }

  drawAvatar(x, y, color, ghost) {
    const ctx = this.ctx;
    ctx.save(); ctx.translate(x, y);
    path(ctx, [[-7, -16], [7, -16], [12, 3], [0, 7], [-12, 3]]);
    ctx.fillStyle = ghost ? '#b1ded0' : '#fdf9e8'; ctx.fill(); ctx.strokeStyle = '#85a99b'; ctx.lineWidth = 1; ctx.stroke();
    path(ctx, [[-5, -15], [0, 5], [6, -15]]); ctx.fillStyle = color; ctx.fill();
    ellipse(ctx, 0, -21, 9, 9.5, ghost ? '#bfe8d6' : '#fffdf0', '#8cb3a1', 1);
    line(ctx, -4, -21, -2, -21, COLORS.ink, 1.5); line(ctx, 2, -21, 4, -21, COLORS.ink, 1.5);
    path(ctx, [[-10, -25], [-4, -32], [4, -32], [10, -25]]);
    ctx.fillStyle = '#79ad93'; ctx.fill();
    line(ctx, 7, -28, 14, -32, '#719f7a', 1.7);
    ellipse(ctx, 15, -32, 4.5, 2.5, '#98bc85'); ctx.restore();
  }

  drawEffects(foreground) {
    const ctx = this.ctx, noteZones = [...(this.labelZones || [])];
    for (const effect of this.effects) {
      if (effect.age < (effect.delay || 0)) continue;
      const p = clamp((effect.age - (effect.delay || 0)) / effect.duration);
      const e = this.reducedMotion ? .7 : ease(p);
      if (foreground !== ['note', 'pulse', 'power', 'section', 'crown', 'shield', 'bank', 'break', 'gather', 'value', 'collect', 'bridge_echo', 'growth_signal', 'root_growth', 'coil_arc', 'seal_turn', 'ascension_signal', 'astral_bridge'].includes(effect.kind)) continue;
      ctx.save(); ctx.globalAlpha = (1 - p) ** .7;
      if (effect.kind === 'note') {
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = `600 ${clamp(12 / this.scale, 16, 30)}px system-ui, sans-serif`;
        const half = ctx.measureText(effect.text).width / 2 + 8;
        const x = Math.max(half, Math.min(WORLD_W - half, effect.x));
        let y = Math.max(28, effect.y - 105 - (this.width <= 480 && effect.supply ? 18 / this.scale : 0) - (this.reducedMotion || this.width <= 480 ? 0 : e * 12));
        if (this.width <= 480) {
          const height = clamp(12 / this.scale, 16, 30), gap = 6 / this.scale;
          // Move only a colliding phone note, keeping the authored platform names.
          for (let i = 0; i <= noteZones.length; i++) {
            const hit = noteZones.find(z => x + half > z.left && x - half < z.right && y + height / 2 + gap > z.top && y - height / 2 - gap < z.bottom);
            if (!hit) break;
            y = Math.max(height / 2 + gap, hit.top - gap - height / 2);
          }
          noteZones.push({ left: x - half, right: x + half, top: y - height / 2, bottom: y + height / 2 });
        }
        ctx.lineWidth = 5; ctx.strokeStyle = '#f3f5ec'; ctx.fillStyle = effect.color;
        ctx.strokeText(effect.text, x, y); ctx.fillText(effect.text, x, y);
      } else if (effect.kind === 'seal_turn') {
        const radius = this.reducedMotion ? 42 : 24 + e * 55;
        ellipse(ctx, effect.x, effect.y - 23, radius, radius * .65, null, effect.color, 2.4);
        for (let i = 0; i < 3; i++) {
          const angle = i * TAU / 3 - Math.PI / 2 + (this.reducedMotion ? 0 : p * .3);
          diamond(ctx, effect.x + Math.cos(angle) * radius, effect.y - 23 + Math.sin(angle) * radius * .65,
            i < effect.stage ? 7 : 4, i < effect.stage ? this.palette(effect.layer).glow : null, effect.color);
        }
      } else if (effect.kind === 'rift_unfold') {
        const expand = this.reducedMotion ? .8 : ease(p);
        const centerY = effect.y - Math.min(39, effect.y * .2);
        const radius = Math.min((effect.tier === 3 ? 66 : 43) + expand * (effect.tier === 3 ? 70 : 40), centerY - 10);
        for (let i = 0; i < 3; i++) {
          ctx.save(); ctx.translate(effect.x, centerY); ctx.rotate((i - 1) * .8);
          ellipse(ctx, 0, 0, radius * .55, radius, null, this.palette(i).color, effect.tier === 3 ? 3 : 1.7);
          diamond(ctx, 0, -radius, 8, this.palette(i).glow, this.palette(i).color);
          ctx.restore();
        }
        if (effect.tier === 3) for (const side of [-1, 1]) {
          const x = effect.x + side * radius, y = effect.y - 35;
          path(ctx, [[effect.x + side * 25, effect.y], [x, y - 52], [x - side * 20, y + 7], [effect.x + side * 38, effect.y + 10]]);
          ctx.globalAlpha = (1 - p) * .38; ctx.fillStyle = '#fff2c9'; ctx.fill();
          ctx.strokeStyle = effect.color; ctx.lineWidth = 2; ctx.stroke();
        }
      } else if (effect.kind === 'ascension_signal') {
        const top = Math.max(25, Math.min(effect.y, effect.to.y) - 135);
        const curve = t => ({ x: mix(effect.x, effect.to.x, t),
          y: (1 - t) ** 2 * (effect.y - 45) + 2 * (1 - t) * t * top + t ** 2 * (effect.to.y - 65) });
        ctx.beginPath(); ctx.moveTo(effect.x, effect.y - 45);
        ctx.quadraticCurveTo(mix(effect.x, effect.to.x, .5), top, effect.to.x, effect.to.y - 65);
        ctx.strokeStyle = effect.color + '55'; ctx.lineWidth = 7; ctx.stroke();
        ctx.strokeStyle = effect.color; ctx.lineWidth = 1.6; ctx.stroke();
        for (let i = 0; i < (this.reducedMotion ? 3 : 7); i++) {
          const at = curve(this.reducedMotion ? (i + 1) / 4 : clamp(p * 1.45 - i * .055));
          diamond(ctx, at.x, at.y, 8 - i * .7, this.palette(effect.layer).glow, effect.color);
        }
      } else if (effect.kind === 'pillar_wake') {
        const height = this.reducedMotion ? 85 : 35 + ease(p) * 110;
        for (const side of [-1, 1]) {
          const x = effect.x + side * 53;
          ctx.globalAlpha = (1 - p) * .45;
          path(ctx, [[x - 12, effect.y + 10], [x - 5, effect.y - height], [x + 5, effect.y - height], [x + 12, effect.y + 10]]);
          ctx.fillStyle = this.palette(effect.layer).glow; ctx.fill();
          ctx.globalAlpha = 1 - p;
          line(ctx, x, effect.y + 10, x, effect.y - height, effect.color, 2.2);
          diamond(ctx, x, effect.y - height, 12, COLORS.lightGold, effect.color);
        }
        ellipse(ctx, effect.x, effect.y, 40 + e * 69, 23 + e * 35, null, effect.color, 2);
      } else if (effect.kind === 'astral_bridge') {
        const edge = this.connections().find(item => item.id === effect.edgeId);
        if (edge?.open) {
          const t = this.reducedMotion ? 1 : ease(p);
          ctx.globalAlpha *= edge.visible ? .95 : .23;
          const head = { x: mix(effect.x, effect.to.x, t), y: mix(effect.y, effect.to.y, t) };
          line(ctx, effect.x, effect.y, head.x, head.y, effect.color, 3.5);
          if (edge.visible) for (let i = 0; i < 5; i++) {
            const at = clamp(t - i * .08);
            diamond(ctx, mix(effect.x, effect.to.x, at), mix(effect.y, effect.to.y, at) - 10,
              11 - i, this.palette(effect.layer).glow, effect.color);
          }
        }
      } else if (effect.kind === 'growth_signal') {
        const t = this.reducedMotion ? 1 : ease(p);
        const x = mix(effect.x, effect.to.x, t), y = mix(effect.y, effect.to.y, t) - Math.sin(t * Math.PI) * 35;
        ctx.beginPath(); ctx.moveTo(effect.x, effect.y); ctx.quadraticCurveTo(mix(effect.x, effect.to.x, .5), Math.min(effect.y, effect.to.y) - 45, effect.to.x, effect.to.y);
        ctx.strokeStyle = effect.color + '65'; ctx.lineWidth = 2.5; ctx.stroke();
        this.drawFlower(x, y - 8, 9, effect.color, effect.layer);
      } else if (effect.kind === 'root_growth') {
        const edge = this.connections().find(item => item.id === effect.edgeId);
        if (edge) {
          const t = this.reducedMotion ? 1 : ease(p);
          const head = { x: mix(effect.x, effect.to.x, t), y: mix(effect.y, effect.to.y, t) };
          ctx.globalAlpha *= edge.visible ? .95 : .3;
          this.drawVine(effect, head, effect.color, 4, 8);
          if (edge.visible) this.drawFlower(head.x, head.y - 7, 15, effect.color, effect.layer);
        }
      } else if (effect.kind === 'garden_bloom') {
        const radius = this.reducedMotion ? 73 : 28 + ease(p) * 85;
        const count = this.reducedMotion ? 4 : 7;
        for (let i = 0; i < count; i++) {
          const angle = i * TAU / count;
          const x = effect.x + Math.cos(angle) * radius, y = effect.y + Math.sin(angle) * radius * .52;
          ctx.beginPath(); ctx.moveTo(effect.x + Math.cos(angle) * 25, effect.y + Math.sin(angle) * 15);
          ctx.quadraticCurveTo(x, y + 13, x, y - 7);
          ctx.strokeStyle = effect.color; ctx.lineWidth = 2.7; ctx.stroke();
          this.drawFlower(x, y - 13, 9 + effect.stage * 2, effect.color, effect.layer);
        }
      } else if (effect.kind === 'gather') {
        const radius = this.reducedMotion ? 24 : 12 + (effect.radius || 65) * (1 - p);
        ellipse(ctx, effect.x, effect.y - 5, radius, radius * .52, null, effect.color, 2.2);
        for (let i = 0; i < (this.reducedMotion ? 3 : 6); i++) {
          const angle = i * TAU / (this.reducedMotion ? 3 : 6);
          diamond(ctx, effect.x + Math.cos(angle) * radius, effect.y - 5 + Math.sin(angle) * radius * .52, 3, COLORS.lightGold, effect.color);
        }
      } else if (effect.kind === 'petals') {
        const count = this.reducedMotion ? 4 : 6 + effect.tier * 3;
        const radius = this.reducedMotion ? 40 : 16 + ease(p) * effect.radius;
        for (let i = 0; i < count; i++) {
          const angle = i * TAU / count + (this.reducedMotion ? 0 : p * .12);
          ctx.save(); ctx.translate(effect.x + Math.cos(angle) * radius, effect.y - 13 + Math.sin(angle) * radius * .57);
          ctx.rotate(angle + Math.PI / 2);
          const length = this.reducedMotion ? 6 : 9 + effect.tier * 2;
          if (i % 2) diamond(ctx, 0, 0, length * .65, COLORS.lightGold, effect.color);
          else {
            ctx.beginPath(); ctx.moveTo(0, length); ctx.bezierCurveTo(-length, 0, -length * .5, -length, 0, -length * 1.3);
            ctx.bezierCurveTo(length * .5, -length, length, 0, 0, length);
            ctx.fillStyle = i % 3 ? '#ffebac' : '#f5d27b'; ctx.fill(); ctx.strokeStyle = effect.color; ctx.lineWidth = 1; ctx.stroke();
          }
          ctx.restore();
        }
      } else if (effect.kind === 'value') {
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = `700 ${clamp(14 / this.scale, 22, 42)}px system-ui, sans-serif`;
        ctx.lineWidth = 4; ctx.strokeStyle = '#fff8dd'; ctx.fillStyle = '#9a691f';
        const y = effect.y - 66 - (this.reducedMotion ? 0 : ease(p) * 21);
        ctx.strokeText(`+${effect.value || 0}`, effect.x, y); ctx.fillText(`+${effect.value || 0}`, effect.x, y);
      } else if (effect.kind === 'collect') {
        const to = this.playerPosition();
        const count = this.reducedMotion ? 3 : 5 + effect.tier;
        for (let i = 0; i < count; i++) {
          const angle = i * TAU / count;
          const t = this.reducedMotion ? .8 : ease(p);
          const x = mix(effect.x + Math.cos(angle) * effect.radius, to.x, t);
          const y = mix(effect.y + Math.sin(angle) * effect.radius * .55 - 12, to.y - 16, t);
          diamond(ctx, x, y, 3.8, COLORS.lightGold, effect.color);
        }
      } else if (effect.kind === 'bridge_echo') {
        const edge = this.state.edges.find(item => item.id === effect.edgeId);
        if (edge?.open) {
          const t = this.reducedMotion ? .65 : ease(p);
          ctx.globalAlpha *= edge.visible ? .9 : .45;
          line(ctx, effect.x, effect.y, effect.to.x, effect.to.y, effect.color + '35', 7);
          for (let i = 0; i < (this.reducedMotion ? 2 : 4); i++) {
            const tail = clamp(t - i * .06);
            diamond(ctx, mix(effect.x, effect.to.x, tail), mix(effect.y, effect.to.y, tail), 6 - i, this.palette(effect.layer).glow, effect.color);
          }
        }
      } else if (effect.kind === 'resonance') {
        const radius = this.reducedMotion ? 42 : 15 + e * effect.radius;
        ellipse(ctx, effect.x, effect.y, radius, radius * .52, null, effect.color, 2.5);
        ellipse(ctx, effect.x, effect.y - 10, radius * .7, radius * .36, null, effect.color, 1);
      } else if (effect.kind === 'ring') {
        const radius = 12 + e * (effect.radius || 80);
        ellipse(ctx, effect.x, effect.y, radius, radius * .52, null, effect.color, 2.5 - p * 1.4);
        if (effect.tier > 1) ellipse(ctx, effect.x, effect.y, radius * .75, radius * .39, null, effect.color, 1);
      } else if (effect.kind === 'bloom') {
        const radius = 20 + e * effect.radius;
        const glow = ctx.createRadialGradient(effect.x, effect.y - 10, 1, effect.x, effect.y - 10, radius);
        glow.addColorStop(0, `${effect.color}70`); glow.addColorStop(1, `${effect.color}00`);
        ctx.fillStyle = glow; ctx.fillRect(effect.x - radius, effect.y - radius - 10, radius * 2, radius * 2);
      } else if (effect.kind === 'section') {
        const radius = 14 + e * (effect.radius || 80);
        ellipse(ctx, effect.x, effect.y - 20, radius * .55, radius, null, effect.color, 2);
        ellipse(ctx, effect.x, effect.y - 20, radius, radius * .45, null, effect.color, 1.5);
      } else if (effect.kind === 'power' || effect.kind === 'coil_arc') {
        // Arc through W, even when source and destination share identical XYZ.
        const samePosition = Math.hypot(effect.to.x - effect.x, effect.to.y - effect.y) < 2;
        const height = samePosition ? 105 : 75;
        const curve = t => ({
          x: mix(effect.x, effect.to.x, t) + (samePosition ? Math.sin(t * TAU) * 45 : 0),
          y: mix(effect.y, effect.to.y, t) - Math.sin(t * Math.PI) * height - 15,
        });
        ctx.beginPath();
        for (let i = 0; i <= 36; i++) {
          const at = curve(i / 36); i ? ctx.lineTo(at.x, at.y) : ctx.moveTo(at.x, at.y);
        }
        ctx.strokeStyle = effect.color + '75'; ctx.lineWidth = 3; ctx.stroke();
        for (let i = 0; i < 7; i++) {
          const at = curve(this.reducedMotion ? i / 6 : clamp(p * 1.5 - i * .045));
          ellipse(ctx, at.x, at.y, 5 - i * .45, 5 - i * .45, i < 3 ? effect.color : effect.sourceColor || effect.color);
        }
        ellipse(ctx, effect.x, effect.y - 15, 24, 34, null, effect.sourceColor || effect.color, 1.5);
        ellipse(ctx, effect.to.x, effect.to.y - 15, 32, 17, null, effect.color, 2);
        if (effect.kind === 'coil_arc') this.drawCoilMark(effect.to.x, effect.to.y - 35, 26, effect.color);
      } else if (effect.kind === 'pulse') {
        const t = this.reducedMotion ? 1 : p;
        const x = mix(effect.x, effect.to.x, t), y = mix(effect.y, effect.to.y, t);
        line(ctx, effect.x, effect.y, effect.to.x, effect.to.y, '#91d4be36', 4);
        ctx.shadowColor = COLORS.mint; ctx.shadowBlur = this.reducedMotion ? 0 : 14;
        for (let i = 0; i < 5; i++) {
          const tail = clamp(t - i * .045);
          ellipse(ctx, mix(effect.x, effect.to.x, tail), mix(effect.y, effect.to.y, tail), 5 - i * .65, 5 - i * .65, effect.color);
        }
        diamond(ctx, x, y, 8, '#efffed');
      } else if (effect.kind === 'crown') {
        for (let i = 0; i < effect.tier + 3; i++) {
          const angle = Math.PI + (i + 1) / (effect.tier + 4) * Math.PI;
          const r = 32 + e * 22;
          diamond(ctx, effect.x + Math.cos(angle) * r, effect.y - 24 + Math.sin(angle) * r, 5 - p * 2, COLORS.lightGold, COLORS.gold);
        }
      } else if (effect.kind === 'break') {
        for (let i = 0; i < 7; i++) {
          const angle = i * TAU / 7;
          line(ctx, effect.x + Math.cos(angle) * 16, effect.y + Math.sin(angle) * 9,
            effect.x + Math.cos(angle) * (25 + e * 40), effect.y + Math.sin(angle) * (15 + e * 26), COLORS.danger, 2);
        }
      } else if (effect.kind === 'shield') {
        ellipse(ctx, effect.x, effect.y - 14, 26 + e * 10, 35 + e * 12, '#baf9df25', COLORS.mint, 2.5);
      } else if (effect.kind === 'bank') {
        for (let i = 0; i < 10; i++) {
          const angle = i * TAU / 10;
          const r = this.reducedMotion ? 35 : 80 * (1 - p);
          diamond(ctx, effect.x + Math.cos(angle) * r, effect.y + Math.sin(angle) * r * .55 - 8, 4.5, COLORS.lightGold, COLORS.gold);
        }
        ellipse(ctx, effect.x, effect.y, 20 + e * 70, 10 + e * 38, null, COLORS.gold, 2);
      }
      ctx.restore();
    }
  }

  drawParticles() {
    const ctx = this.ctx;
    for (const particle of this.particles) {
      if (particle.age < 0) continue;
      const p = particle.age / particle.duration;
      ctx.save(); ctx.globalAlpha = 1 - p;
      ctx.translate(particle.x, particle.y); ctx.rotate(particle.spin + (this.reducedMotion ? 0 : p));
      diamond(ctx, 0, 0, particle.size * (1 - p * .4), particle.color); ctx.restore();
    }
  }

  drawAtmosphere() {
    // A fine mist sits below the islands. It never hides stability or target cues.
    const ctx = this.ctx;
    ctx.save();
    const mist = ctx.createLinearGradient(0, 555, 0, 650);
    mist.addColorStop(0, '#edf3e700'); mist.addColorStop(1, '#edf3e755');
    ctx.fillStyle = mist; ctx.fillRect(0, 555, 1000, 95); ctx.restore();
  }

  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    this.resizeObserver?.disconnect();
    window.removeEventListener('resize', this.resizeHandler);
    this.motionQuery?.removeEventListener?.('change', this.motionChange);
    this.canvas.removeEventListener('pointermove', this.pointerMove);
    this.canvas.removeEventListener('pointerleave', this.pointerLeave);
    this.canvas.removeEventListener('pointerdown', this.pointerDown);
    this.effects.length = 0; this.particles.length = 0;
    this.state = null;
  }
}
