const WORLD_W = 1000;
const WORLD_H = 650;
const TAU = Math.PI * 2;
const COLORS = {
  paper: '#eaf1eb', ink: '#294b46', mute: '#80968b', teal: '#24968d',
  mint: '#baf9df', gold: '#d79943', lightGold: '#ffedb0', danger: '#d36d59',
  stone: '#e5e8d7', edge: '#b2c5b1', darkStone: '#75988a',
};
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
      const rx = node.id === 'hub' ? 112 : 81;
      const ry = node.id === 'hub' ? 60 : 52;
      return ((x - node.x) / rx) ** 2 + ((y - node.y + 12) / ry) ** 2 <= 1;
    }) ?? null;
  }

  setState(snapshot) { this.state = snapshot; }

  node(id) { return this.state?.nodes.find(node => node.id === id); }

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
      const color = event.type === 'risk' || event.risky ? COLORS.gold : COLORS.teal;
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
      } else if (event.type === 'activate') {
        this.addEffect('ring', target, { duration: 1.2, radius: 110, color: COLORS.teal, tier: 2 });
        this.addEffect('bloom', target, { duration: 1, radius: 85 });
        this.burst(target, COLORS.mint, 28, 1.25);
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
      this.drawConnections();
      const nodes = [...this.state.nodes].sort((a, b) => a.y - b.y);
      for (const node of nodes) this.drawIsland(node);
      this.drawEffects(false);
      this.drawPlayer();
      this.drawEffects(true);
      this.drawParticles();
      this.drawAtmosphere();
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
    gradient.addColorStop(0, '#e3eee7'); gradient.addColorStop(.6, '#edf1e5'); gradient.addColorStop(1, '#e1ebe1');
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
    const nodes = this.state.nodes;
    const hub = this.node('hub');
    if (!hub) return [];
    const pairs = nodes.filter(node => node.id !== 'hub' && node.id !== 'exit').map(node => [hub, node]);
    if (this.state.activated.length >= 3) pairs.push([hub, this.node('exit')]);
    if (this.state.shortcut) {
      const outer = nodes.filter(node => node.kind === 'mechanism');
      for (let i = 0; i < outer.length; i++) for (let j = i + 1; j < outer.length; j++) pairs.push([outer[i], outer[j]]);
    }
    // A committed shortcut crossing survives its timer, exactly as the model does.
    const travel = this.state.travel;
    if (travel && !pairs.some(([a, b]) =>
      (a.id === travel.from && b.id === travel.to) || (b.id === travel.from && a.id === travel.to))) {
      pairs.push([this.node(travel.from), this.node(travel.to)]);
    }
    return pairs.filter(pair => pair[0] && pair[1]);
  }

  drawConnections() {
    const ctx = this.ctx, s = this.state;
    for (const [a, b] of this.connections()) {
      const selected = (s.node === a.id && s.selected === b.id) || (s.node === b.id && s.selected === a.id);
      const traversing = s.travel && ((s.travel.from === a.id && s.travel.to === b.id) || (s.travel.from === b.id && s.travel.to === a.id));
      const relevant = selected || traversing;
      const dest = s.node === b.id ? a : b;
      const outer = a.id === 'hub' ? b : b.id === 'hub' ? a : dest;
      const halfwidth = s.riskMode ? .048 : .105;
      const range = relevant && s.range ? s.range : { min: outer.center - halfwidth, max: outer.center + halfwidth };
      const fits = s.w >= range.min && s.w <= range.max;
      const risky = traversing ? s.travel.risky : s.riskMode && selected;
      const color = risky ? COLORS.gold : COLORS.teal;
      const dx = b.x - a.x, dy = b.y - a.y;
      const distance = Math.hypot(dx, dy), nx = -dy / distance, ny = dx / distance;
      const steps = Math.max(5, Math.floor(distance / 25));
      ctx.save();
      // The rail stays visible as a topology hint; lit slabs mean a matching slice.
      ctx.globalAlpha = relevant ? .65 : .25;
      ctx.setLineDash([3, 8]); line(ctx, a.x, a.y + 5, b.x, b.y + 5, '#7c9c8c', 1.5); ctx.setLineDash([]);
      if (fits || traversing) {
        ctx.globalAlpha = relevant ? .17 : .06;
        line(ctx, a.x, a.y, b.x, b.y, color, relevant ? 23 : 15);
      }
      for (let i = 1; i < steps; i++) {
        const t = i / steps, x = mix(a.x, b.x, t), y = mix(a.y, b.y, t);
        const width = relevant ? 13 : 10, length = 6;
        const vx = dx / distance * length, vy = dy / distance * length;
        ctx.globalAlpha = fits ? (relevant ? .95 : .48) : relevant ? .38 : .16;
        path(ctx, [[x + nx * width - vx, y + ny * width - vy], [x + nx * width + vx, y + ny * width + vy], [x - nx * width + vx, y - ny * width + vy], [x - nx * width - vx, y - ny * width - vy]]);
        ctx.fillStyle = fits ? '#f2f0dc' : '#c5d0bf'; ctx.fill();
        ctx.strokeStyle = fits ? color : '#99b19e'; ctx.lineWidth = relevant ? 1.5 : .8; ctx.stroke();
        if (relevant && fits && i % 2 === 0) diamond(ctx, x, y, 2.2, color);
      }
      if (relevant) {
        ctx.globalAlpha = fits ? .85 : .5;
        for (const side of [-1, 1]) {
          line(ctx, a.x + nx * 19 * side, a.y + ny * 19 * side, b.x + nx * 19 * side, b.y + ny * 19 * side, fits ? color : COLORS.danger, 1);
        }
        // Moving sparks only travel along the selected real route.
        if (fits && !this.reducedMotion) {
          const t = (this.time * .42) % 1;
          const from = s.node === b.id ? b : a, to = s.node === b.id ? a : b;
          ellipse(ctx, mix(from.x, to.x, t), mix(from.y, to.y, t), 3, 3, risky ? COLORS.lightGold : COLORS.mint);
        }
      }
      ctx.restore();
    }
    if (s.activated.length < 3) {
      const a = this.node('hub'), b = this.node('exit');
      if (a && b) {
        ctx.save(); ctx.globalAlpha = .3; ctx.setLineDash([3, 12]);
        line(ctx, a.x, a.y, b.x, b.y, '#91a696', 1.3); ctx.setLineDash([]);
        const x = mix(a.x, b.x, .59), y = mix(a.y, b.y, .59);
        ellipse(ctx, x, y, 15, 15, '#eaf1eb', '#91a696');
        ctx.strokeStyle = COLORS.mute; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y - 2, 4, Math.PI, 0); ctx.stroke();
        ctx.fillStyle = COLORS.mute; ctx.fillRect(x - 5, y - 2, 10, 8); ctx.restore();
      }
    }
  }

  drawIsland(node) {
    const ctx = this.ctx, s = this.state;
    const hub = node.id === 'hub', exit = node.id === 'exit';
    const active = s.activated.includes(node.id);
    const selected = s.selected === node.id && s.phase === 'playing';
    const adjacent = s.availableNodes.includes(node.id);
    const width = hub ? 124 : exit ? 99 : 94;
    const height = hub ? 65 : 50;
    const thickness = hub ? 30 : 25;
    const points = [[-width, -height * .16], [-width * .68, -height * .77], [-width * .13, -height], [width * .65, -height * .68], [width, -.02 * height], [width * .66, height * .7], [-width * .1, height], [-width * .79, height * .6]];
    ctx.save(); ctx.translate(node.x, node.y);
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
      ctx.fillStyle = i % 2 ? '#94af9b' : '#a5bca4'; ctx.fill();
      line(ctx, p[0], p[1] + 2, p[0] * .85, p[1] + thickness, '#7fa28e70', 1);
    }
    path(ctx, points); ctx.fillStyle = COLORS.stone; ctx.fill();
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
    if (hub) this.drawHub();
    else if (exit) this.drawGate();
    else this.drawMechanism(node, active);
    if (active) {
      ctx.save(); ctx.globalAlpha = .45;
      ellipse(ctx, 0, 2, width * .73, height * .56, null, COLORS.teal, 1.2); ctx.restore();
    }
    if (adjacent && !exit) {
      diamond(ctx, 0, height + thickness + 14, 3.5, selected ? COLORS.gold : '#739d88');
    }
    const labelY = height + thickness + 34;
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
    if (s.shadowRemaining > 0) {
      ctx.save(); ctx.globalAlpha = .35;
      this.drawAvatar(-22, -2, COLORS.teal, true); ctx.restore();
      ctx.beginPath(); ctx.ellipse(0, 0, 68, 38, 0, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(s.shadowRemaining / 7));
      ctx.strokeStyle = COLORS.gold; ctx.lineWidth = 2.5; ctx.stroke();
    }
    if (s.banked > 0) {
      const stacks = Math.min(7, Math.ceil(s.banked / 3));
      for (let i = 0; i < stacks; i++) diamond(ctx, -49 + i * 16, 30 - (i % 2) * 3, 4, '#e3bd65', '#c19642');
    }
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

  drawGate() {
    const ctx = this.ctx, s = this.state;
    const open = s.activated.length >= 3;
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
    const stable = !travel || travel.stability > .5;
    const color = !stable ? COLORS.danger : risky ? COLORS.gold : COLORS.teal;
    ctx.save(); ctx.translate(position.x, position.y);
    ellipse(ctx, 0, 6, 16, 7, '#345f5729');
    if (travel) {
      ctx.save(); ctx.globalAlpha = .3;
      ellipse(ctx, 0, 5, 26, 13, color); ctx.restore();
      ctx.beginPath(); ctx.ellipse(0, 5, 24, 13, 0, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(travel.stability));
      ctx.strokeStyle = color; ctx.lineWidth = 3.3; ctx.stroke();
      // Visible falling fragments communicate imminent collapse without text.
      if (travel.stability < .45) {
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
      if (foreground !== ['pulse', 'crown', 'shield', 'bank', 'break'].includes(effect.kind)) continue;
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
