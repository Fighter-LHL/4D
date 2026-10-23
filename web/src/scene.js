const WORLD_W = 1000;
const WORLD_H = 650;
const TAU = Math.PI * 2;
const COLORS = {
  paper: '#eaf1eb', ink: '#294b46', mute: '#80968b', teal: '#24968d',
  mint: '#baf9df', gold: '#d79943', lightGold: '#ffedb0', danger: '#d36d59',
  stone: '#e5e8d7', edge: '#b2c5b1', darkStone: '#75988a',
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
  constructor(canvas, { onSelect } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onSelect = typeof onSelect === 'function' ? onSelect : () => {};
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
      canvas.style.cursor = node ? 'pointer' : 'default';
    };
    this.pointerLeave = () => { this.hover = null; canvas.style.cursor = 'default'; };
    this.pointerDown = event => {
      if (event.button !== undefined && event.button !== 0) return;
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

  hitTest(event) {
    if (!this.state || this.state.phase !== 'playing' || this.disposed) return null;
    const rect = this.canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left - this.offsetX) / this.scale;
    const y = (event.clientY - rect.top - this.offsetY) / this.scale;
    // Match the painted island top and mechanism, never its generous label box.
    return [...this.state.nodes].reverse().find(node => {
      if (!node.present || (!node.anchor && node.scale < .5)) return false;
      const section = node.anchor ? 1 : node.scale;
      const rx = (node.id === 'hub' ? 112 : 81) * section;
      const ry = (node.id === 'hub' ? 60 : 52) * section;
      return ((x - node.x) / rx) ** 2 + ((y - node.y + 12 * section) / ry) ** 2 <= 1;
    }) ?? null;
  }

  setState(snapshot) { this.state = snapshot; }

  node(id) { return this.state?.nodes.find(node => node.id === id); }

  palette(layer = this.state?.layer ?? 0) { return LAYER_PALETTES[layer] || LAYER_PALETTES[0]; }

  random() { return hash(this.seed++); }

  addEffect(kind, position, options = {}) {
    this.effects.push({ kind, x: position.x, y: position.y, age: 0, duration: 1, color: COLORS.teal, ...options });
    if (this.effects.length > 36) this.effects.splice(0, this.effects.length - 36);
  }

  burst(position, color, count = 20, power = 1) {
    const total = this.reducedMotion ? Math.min(6, count) : count;
    for (let i = 0; i < total; i++) {
      const angle = this.random() * TAU;
      const speed = (40 + this.random() * 110) * power;
      this.particles.push({
        x: position.x, y: position.y - 12, vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * .65 - 35, age: 0,
        duration: .45 + this.random() * .9, size: 2 + this.random() * 3,
        color, spin: this.random() * TAU,
      });
    }
    if (this.particles.length > 220) this.particles.splice(0, this.particles.length - 220);
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
        const tier = event.risky ? clamp(event.tier || 1, 1, 3) : 1;
        this.addEffect('ring', target, { duration: .9, radius: 75 + tier * 13, color, tier });
        this.addEffect('bloom', target, { duration: .7, radius: 55 + tier * 12, color });
        this.burst(target, color, 14 + tier * 9, .8 + tier * .22);
        if (event.risky) {
          this.addEffect('crown', target, { duration: 1.15, color: COLORS.gold, tier });
          this.shake = Math.max(this.shake, .12 + tier * .025);
          this.flash = .045 + tier * .02;
          this.flashColor = COLORS.lightGold;
        }
      } else if (event.type === 'layer_shift' || event.type === 'phase_transfer') {
        const layer = event.layer ?? event.toLayer ?? this.state?.layer ?? 0;
        const at = event.type === 'phase_transfer' ? this.node(event.to) || target : this.playerPosition();
        this.addEffect('section', at, { duration: .7, color: this.palette(layer).color, radius: 90 });
        if (event.type === 'phase_transfer') this.burst(at, this.palette(layer).glow, 16, .5);
      } else if (event.type === 'power') {
        const from = this.node(event.from) || target, to = this.node(event.to) || target;
        this.addEffect('power', from, { to: { x: to.x, y: to.y }, duration: 1.4,
          fromLayer: from.layer ?? this.state.layer, toLayer: to.layer ?? event.layer,
          color: this.palette(to.layer ?? event.layer).color, sourceColor: this.palette(from.layer).color });
        this.addEffect('ring', to, { delay: .8, duration: .75, radius: 75, color: this.palette(to.layer ?? event.layer).color });
        this.burst(to, this.palette(to.layer ?? event.layer).glow, 14, .5);
      } else if (event.type === 'warning') {
        this.addEffect('ring', target, { duration: .6, radius: 95, color: COLORS.danger, tier: 2 });
      } else if (event.type === 'evade') {
        // The model emits one reward as well; avoid a second celebration burst.
        this.addEffect('section', target, { duration: 1.1, radius: 130, color: this.palette().color });
      } else if (event.type === 'activate') {
        this.addEffect('ring', target, { duration: 1.2, radius: 110, color, tier: 2 });
        this.addEffect('bloom', target, { duration: 1, radius: 85, color });
        this.burst(target, this.palette(target.layer ?? this.state?.layer).glow, 28, 1.25);
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
      if (!this.reducedMotion) {
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
      this.drawSliceVolumes();
      this.drawConnections();
      const nodes = [...this.state.nodes].sort((a, b) => a.y - b.y);
      for (const node of nodes) this.drawIsland(node);
      this.drawEffects(false);
      this.drawGhost();
      this.drawWave();
      this.drawPlayer();
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

  drawConnections() {
    const ctx = this.ctx, s = this.state;
    for (const edge of this.connections()) {
      const { a, b } = edge;
      const selected = (s.node === a.id && s.selected === b.id) || (s.node === b.id && s.selected === a.id);
      const traversing = s.travel && ((s.travel.from === a.id && s.travel.to === b.id) || (s.travel.from === b.id && s.travel.to === a.id)) && s.travel.layer === edge.layer;
      const relevant = selected || traversing;
      const range = relevant && s.range ? s.range : edge;
      const fits = edge.visible && s.w >= range.min && s.w <= range.max;
      const solid = edge.open && fits || traversing;
      const color = edge.kind === 'vault' ? COLORS.danger : edge.kind === 'shadow' ? '#9c78ba' : this.palette(edge.layer).color;
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
          ctx.fillStyle = '#f7f4e5'; ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = relevant ? 1.5 : .8; ctx.stroke();
          if (relevant && i % 2 === 0) diamond(ctx, x, y, 2.2, color);
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
    // A compact spatial compass: XYZ position repeats on three W planes.
    const miniScale = clamp(.45 / this.scale, 1, 1.2);
    ctx.scale(miniScale, miniScale);
    const corners = [[0, 25], [67, -5], [128, 22], [60, 53]];
    for (let i = 0; i < 3; i++) {
      const y = (2 - i) * 29, color = this.palette(i).color;
      ctx.globalAlpha = i === s.layer ? .88 : .3;
      path(ctx, corners.map(([x, cy]) => [x, cy + y]));
      ctx.fillStyle = this.palette(i).pale; ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = i === s.layer ? 2 : 1; ctx.stroke();
      const player = this.playerPosition();
      const px = 63 + (player.x - 500) * .115, py = 24 + (player.y - 340) * .055 + y;
      if (i === s.layer) diamond(ctx, px, py, 5, color, '#ffffff');
      for (let dot = 0; dot <= i; dot++) ellipse(ctx, 140 + dot * 7, 22 + y, 2, 2, color);
    }
    // Match source/target W coordinates of real propagation events in the small stack.
    for (const effect of this.effects) {
      if (effect.kind !== 'power') continue;
      const fromY = 24 + (2 - effect.fromLayer) * 29, toY = 24 + (2 - effect.toLayer) * 29;
      const p = clamp(effect.age / effect.duration);
      ctx.globalAlpha = 1 - p;
      line(ctx, 62, fromY, 62, toY, effect.color, 2);
      diamond(ctx, 62, mix(fromY, toY, this.reducedMotion ? .5 : p), 5, effect.color, '#ffffff');
    }
    if (s.ghost) {
      ctx.globalAlpha = .55;
      diamond(ctx, 49, 24 + (2 - s.ghost.layer) * 29, 4, null, this.palette(s.ghost.layer).color);
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
    const exposed = s.layer === wave.layer || !s.nodes.some(node => !node.anchor && node.layer === s.layer && node.present);
    ctx.save(); ctx.translate(node.x, node.y);
    ctx.globalAlpha = exposed ? .9 : .3;
    // The countdown is an inward-moving wave in the dangerous W layer.
    const radius = 35 + 160 * (1 - p);
    ellipse(ctx, 0, 0, radius, radius * .55, '#d36d5910', COLORS.danger, 2.5);
    if (!this.reducedMotion) ellipse(ctx, 0, 0, radius + 15, (radius + 15) * .55, null, '#d36d5950', 1);
    for (let i = 0; i < 8; i++) {
      const a = i * TAU / 8;
      diamond(ctx, Math.cos(a) * radius, Math.sin(a) * radius * .55, 4, COLORS.danger);
    }
    ctx.beginPath(); ctx.ellipse(0, 0, 95, 52, 0, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - p));
    ctx.strokeStyle = COLORS.danger; ctx.lineWidth = 5; ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.font = `600 ${clamp(12 / this.scale, 18, 30)}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.fillStyle = exposed ? '#9f4938' : this.palette().color;
    ctx.fillText(wave.remaining.toFixed(1), 0, -80);
    ctx.restore();
  }

  drawIsland(node) {
    const ctx = this.ctx, s = this.state;
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
    if (hub) this.drawHub();
    else if (exit) this.drawGate(node);
    else if (node.id === 'relay') this.drawAnchor();
    else if (node.id === 'vault') this.drawVault(node);
    else this.drawMechanism(node, active);
    if (node.powered && !active && !node.locked && !node.anchor) {
      const h = node.id === 'bell' ? -74 : -54;
      diamond(ctx, 0, h, 7, palette.glow, palette.color);
      ellipse(ctx, 0, h, 13, 13, null, palette.color + '70', 1);
    }
    if (active) {
      ctx.save(); ctx.globalAlpha = .45;
      ellipse(ctx, 0, 2, width * .73, height * .56, null, palette.color, 1.2); ctx.restore();
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
    ctx.beginPath(); ctx.roundRect?.(-textWidth / 2 - 8, labelY - labelHeight / 2, textWidth + 16, labelHeight, 8);
    if (!ctx.roundRect) ctx.rect(-textWidth / 2 - 8, labelY - labelHeight / 2, textWidth + 16, labelHeight);
    ctx.fill(); ctx.fillStyle = selected ? '#936125' : COLORS.ink; ctx.fillText(name, 0, labelY);
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
    const ctx = this.ctx;
    ellipse(ctx, 0, 3, 43, 22, '#c8cbb4', '#f1eed7', 2);
    const visibility = clamp(node.chestVisibility ?? (this.state.layer === 1 ? 1 : 0));
    if (visibility <= .01) {
      ctx.save(); ctx.globalAlpha = .2; ctx.setLineDash([3, 5]);
      path(ctx, [[-27, 0], [-27, -25], [0, -39], [28, -25], [28, 0], [0, 15]]);
      ctx.strokeStyle = this.palette(1).color; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
      return;
    }
    ctx.save(); ctx.scale(visibility, visibility);
    ctx.globalAlpha = .2 + visibility * .8;
    const open = this.state.vaultStatus === 'escaped';
    path(ctx, [[-29, -8], [0, 5], [29, -8], [29, 7], [0, 21], [-29, 7]]);
    ctx.fillStyle = '#b4a3b8'; ctx.fill(); ctx.strokeStyle = '#8a719d'; ctx.stroke();
    path(ctx, [[-29, -8], [-22, -28 - (open ? 17 : 0)], [0, -36 - (open ? 17 : 0)], [22, -28 - (open ? 17 : 0)], [29, -8], [0, 5]]);
    ctx.fillStyle = open ? '#efe3b5' : '#dad0d5'; ctx.fill(); ctx.strokeStyle = '#9f83a4'; ctx.lineWidth = 1.5; ctx.stroke();
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
    for (let i = 0; i < 3; i++) {
      const active = s.activated.includes(['dew', 'bell', 'bloom'][i]);
      diamond(ctx, (i - 1) * 15, -66, 4.3, active ? '#ffe8a1' : '#a4b99d', active ? '#be9c54' : '#8aa285');
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
    const ctx = this.ctx;
    for (const effect of this.effects) {
      if (effect.age < (effect.delay || 0)) continue;
      const p = clamp((effect.age - (effect.delay || 0)) / effect.duration);
      const e = this.reducedMotion ? .7 : ease(p);
      if (foreground !== ['pulse', 'power', 'section', 'crown', 'shield', 'bank', 'break'].includes(effect.kind)) continue;
      ctx.save(); ctx.globalAlpha = (1 - p) ** .7;
      if (effect.kind === 'ring') {
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
      } else if (effect.kind === 'power') {
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
          ellipse(ctx, at.x, at.y, 5 - i * .45, 5 - i * .45, i < 3 ? effect.color : effect.sourceColor);
        }
        ellipse(ctx, effect.x, effect.y - 15, 24, 34, null, effect.sourceColor, 1.5);
        ellipse(ctx, effect.to.x, effect.to.y - 15, 32, 17, null, effect.color, 2);
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
