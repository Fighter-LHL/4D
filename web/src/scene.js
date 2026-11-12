import { drawCourtyardFriends } from './courtyard-friends.js';
import { missingSupplySources, reachablePlatforms, mechanismFeedback } from './play-feedback.js';
import { projectPolytope4D, projectPolytopeLock, magnetizeLensW, wrapSignedAngle, wrapHalfTurnAngle, PhaseResonanceController } from './hyper-prism.js';
import { ExplorationRadar } from './exploration-radar.js';
import { planLayerRoute } from './progressive-onboarding.js';
import { CourtyardLife } from './courtyard-life.js';
import { ferryPosition } from './rooms.js';
import * as toys from './scene-toys.js';
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
  { color: '#378d9c', astralColor: '#5ad4ea', pale: '#dbf0ef', glow: '#a0f1f1', stone: '#e1e9dd', side: '#96b7ad', astralStone: '#18313f', astralSide: '#0f202b', astralPlane: '#112b38d9' },
  { color: '#8c6bb4', astralColor: '#be98f8', pale: '#eee5f4', glow: '#e2c5ff', stone: '#e8e2df', side: '#aaa4bf', astralStone: '#241e38', astralSide: '#171226', astralPlane: '#1f1833d9' },
  { color: '#b28b32', astralColor: '#f2c15a', pale: '#f7efd9', glow: '#fff0ae', stone: '#eee9d4', side: '#bdb592', astralStone: '#2c2517', astralSide: '#1d170e', astralPlane: '#2a2013d9' },
];
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const mix = (a, b, t) => a + (b - a) * t;
const ease = t => 1 - (1 - clamp(t)) ** 3;
const WSTACK_CORNERS = [[0, 25], [67, -5], [128, 22], [60, 53]];

function inWStackQuad(px, py) {
  for (let k = 0; k < 4; k++) {
    const [x0, y0] = WSTACK_CORNERS[k];
    const [x1, y1] = WSTACK_CORNERS[(k + 1) % 4];
    if ((x1 - x0) * (py - y0) - (y1 - y0) * (px - x0) < 0) return false;
  }
  return true;
}

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

function diamond(ctx, x, y, size, fill, stroke, width = 1.5) {
  path(ctx, [[x, y - size], [x + size * .66, y], [x, y + size], [x - size * .66, y]]);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}

function hash(n) {
  const f = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return f - Math.floor(f);
}

/** Canvas presentation only. The model remains the sole rule authority. */
export class SceneRenderer {
  constructor(canvas, {
    onSelect,
    onFriend,
    onAnomaly,
    onLayerSelect,
    onLensDetent,
    onLensDive,
    onPolytopeTune,
    onBridgeDash,
    onCast,
    onScrubW,
    hasSupplySlots = () => false,
  } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onSelect = typeof onSelect === 'function' ? onSelect : () => {};
    this.onFriend = typeof onFriend === 'function' ? onFriend : () => {};
    this.onAnomaly = typeof onAnomaly === 'function' ? onAnomaly : null;
    this.onLayerSelect = typeof onLayerSelect === 'function' ? onLayerSelect : null;
    this.onLensDetent = typeof onLensDetent === 'function' ? onLensDetent : null;
    this.onLensDive = typeof onLensDive === 'function' ? onLensDive : null;
    this.onPolytopeTune = typeof onPolytopeTune === 'function' ? onPolytopeTune : null;
    this.onBridgeDash = typeof onBridgeDash === 'function' ? onBridgeDash : null;
    this.onCast = typeof onCast === 'function' ? onCast : null;
    this.onScrubW = typeof onScrubW === 'function' ? onScrubW : null;
    this.hasSupplySlots = hasSupplySlots;
    this.state = null;
    this.time = 0;
    this.effects = [];
    this.particles = [];
    this.hover = null;
    this.hoverWLayer = null;
    this.hoverAnomaly = null;
    this.hoverLensToggle = false;
    this.hoverPolyLock = null;
    this.previewLayer = null;
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
    this.astralMode = false;
    this.visualGuide = false;
    this.hudProgressActive = false;
    this.onboardingStage = 4;
    this.explicitLayerHint = null;
    this.liveGuide = null;
    this.pendingLayerPrompt = null;
    this.altarWindow = null;
    this.polyLocks = new Map();
    this.polyLockDrag = null;
    this.hyperLens = {
      active: false,
      pinned: false,
      mode: null,
      x: 500,
      y: 325,
      open: 0,
      w: .5,
      rawW: .5,
      startRawW: .5,
      dragStartY: 0,
      snappedLayer: 1,
      detent: true,
      irisWave: null,
    };
    this.displayW = null;
    this.wTween = null;
    this.wrapAlpha = 1;
    this.downPoint = null;
    this.grab = null;
    this.capturedPointerId = null;
    this.cast = null;
    this.hoverGrab = null;
    this.pointerWorld = null;
    this._pointerPrev = null;
    this.life = null;
    this._lifeSeed = undefined;
    this.targetTiltX = 0;
    this.targetTiltY = 0;
    this.parallaxX = 0;
    this.parallaxY = 0;
    this.phaseResonance = new PhaseResonanceController();
    this.explorationRadar = new ExplorationRadar();
    this.motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    this.reducedMotion = !!this.motionQuery?.matches;
    this.motionChange = event => { this.reducedMotion = event.matches; };
    this.motionQuery?.addEventListener?.('change', this.motionChange);
    if (!canvas.style.width) canvas.style.width = '100%';
    if (!canvas.style.aspectRatio) canvas.style.aspectRatio = `${WORLD_W} / ${WORLD_H}`;
    canvas.style.display = 'block';
    canvas.style.touchAction = 'manipulation';
    this.pointerMove = event => {
      const rect = this.canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
        const nx = ((event.clientX - rect.left) / rect.width - .5) * 2;
        const ny = ((event.clientY - rect.top) / rect.height - .5) * 2;
        this.targetTiltX = clamp(nx, -1, 1);
        this.targetTiltY = clamp(ny, -1, 1);
      }
      const wp = this.toWorld(event);
      this.pointerWorld = { x: wp.x, y: wp.y, on: true };
      if (this.life) {
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const prev = this._pointerPrev;
        const pdt = prev ? Math.max(1e-3, (now - prev.t) / 1000) : 0;
        this.life.pointer(wp.x, wp.y, prev && pdt < .6 ? (wp.x - prev.x) / pdt : 0, prev && pdt < .6 ? (wp.y - prev.y) / pdt : 0);
        this._pointerPrev = { x: wp.x, y: wp.y, t: now };
      }
      const s = this.state;
      if (this.grab) { this._grabMove(wp); canvas.style.cursor = 'grabbing'; return; }
      if (this.downPoint?.grab) {
        const dist = Math.hypot((event.clientX ?? 0) - this.downPoint.x, (event.clientY ?? 0) - this.downPoint.y);
        if (dist >= 8) {
          this.grab = this._grabStart(this.downPoint.grab, wp);
          if (this.grab) { this._grabMove(wp); canvas.style.cursor = 'grabbing'; return; }
          this.downPoint.grab = null;
        } else {
          canvas.style.cursor = 'grab';
          return;
        }
      }
      if (this.downPoint && this.visualGuide && (this.onboardingStage ?? 4) >= 2 && s?.phase === 'playing' && !s.travel?.risky && !s.wave) {
        const dx = (event.clientX ?? 0) - this.downPoint.x;
        const dy = (event.clientY ?? 0) - this.downPoint.y;
        const dist = Math.hypot(dx, dy);
        if (dist >= 8) {
          if (this.downPoint.lockHit) {
            const lockId = this.downPoint.lockHit;
            const lock = this.getPolyLockState(lockId);
            if (!this.polyLockDrag) {
              this.polyLockDrag = { nodeId: lockId, startX: this.downPoint.x, startY: this.downPoint.y, startAngle: lock.angleOffset };
            }
            const targetNode = this.node(lockId);
            const isLit = s.activated.includes(lockId);
            const nextAngle = wrapHalfTurnAngle(this.polyLockDrag.startAngle + dx * .028 - dy * .018);
            if (isLit) {
              lock.spinVel = clamp(dx * .045 - dy * .03, -6, 6);
              lock.angleOffset = nextAngle;
            } else if (targetNode?.powered && !lock.snapped && !s.tunedMechanisms?.includes(lockId)) {
              lock.angleOffset = nextAngle;
              if (Math.abs(nextAngle) <= .26) {
                this.snapPolyLockVisual(lockId);
                this.onPolytopeTune?.(lockId);
              }
            }
            canvas.style.cursor = 'grabbing';
            return;
          }
          if (!s.travel) {
            if (!this.hyperLens.active || this.hyperLens.mode !== 'drag') {
              this.openHyperLensAt(event, 'drag', this.downPoint.y);
            }
            this.updateHyperLensDrag(wp.x, wp.y, (event.clientY ?? 0) - this.hyperLens.dragStartY);
            canvas.style.cursor = 'crosshair';
            return;
          }
        }
      } else if (this.hyperLens.active && this.hyperLens.mode === 'rmb') {
        this.updateHyperLensDrag(wp.x, wp.y, (event.clientY ?? 0) - this.hyperLens.dragStartY);
        canvas.style.cursor = 'crosshair';
        return;
      } else if (this.hyperLens.pinned && this.visualGuide && s?.phase === 'playing' && !s.wave && !s.travel?.risky) {
        this.hyperLens.active = true;
        this.hyperLens.mode = 'pinned';
        this.hyperLens.x = clamp(wp.x, 72, WORLD_W - 72);
        this.hyperLens.y = clamp(wp.y, 72, WORLD_H - 72);
      }
      const lensToggle = this.hitHyperLensToggle(event);
      const wLayer = lensToggle ? null : this.hitWStackLayer(event);
      const anom = (lensToggle || wLayer !== null) ? null : this.hitAnomaly(event);
      const polyLock = (lensToggle || wLayer !== null || anom) ? null : this.hitPolytopeLock(event);
      const node = (lensToggle || wLayer !== null || anom) ? null : this.hitTest(event);
      this.hoverLensToggle = lensToggle;
      this.hoverWLayer = wLayer;
      this.hoverAnomaly = anom?.id ?? null;
      this.hoverPolyLock = polyLock;
      this.hover = node?.id ?? null;
      const canSurfBridge = Boolean(this.visualGuide && (this.onboardingStage ?? 4) >= 2 && s?.phase === 'playing' && s.travel && !s.travel.risky && !s.travel.dashed);
      const grabHover = (!lensToggle && wLayer === null && !anom && !polyLock) ? this.hitGrab(event) : null;
      this.hoverGrab = grabHover;
      canvas.style.cursor = (grabHover || polyLock)
        ? 'grab'
        : (lensToggle || node || this.hitFriend(event) || anom || wLayer !== null || canSurfBridge)
          ? 'pointer'
          : (this.hyperLens.pinned ? 'crosshair' : 'default');
    };
    this.pointerLeave = () => {
      if (this.grab) this._grabEnd(true);
      this.hover = null;
      this.hoverWLayer = null;
      this.hoverAnomaly = null;
      this.hoverLensToggle = false;
      this.hoverPolyLock = null;
      this.hoverGrab = null;
      this.pointerWorld = null;
      this.life?.pointer(null);
      this.downPoint = null;
      this.polyLockDrag = null;
      if (!this.hyperLens.pinned) {
        this.hyperLens.active = false;
        this.hyperLens.mode = null;
      }
      this.targetTiltX = 0;
      this.targetTiltY = 0;
      canvas.style.cursor = 'default';
    };
    this.pointerDown = event => {
      if (event.button !== undefined && event.button !== 0) return;
      const s = this.state;
      if (this.hitHyperLensToggle(event)) {
        this.togglePinnedHyperLens(event);
        return;
      }
      // ③ Kinetic Bridge Surf -> ② Altar Snap 2-Hit Combo during safe bridge crossings
      if (this.visualGuide && (this.onboardingStage ?? 4) >= 2 && s?.phase === 'playing' && s.travel && !s.travel.risky) {
        if (!s.travel.dashed && s.travel.progress >= .06 && this.onBridgeDash) {
          this.onBridgeDash();
          return;
        }
        if (s.travel.dashed && this.onPolytopeTune) {
          const dest = this.node(s.travel.to);
          if (dest?.kind === 'mechanism' && dest.powered && !s.activated.includes(dest.id)) {
            this.snapPolyLockVisual(dest.id);
            this.onPolytopeTune(dest.id);
            return;
          }
        }
      }
      // ② Instant Altar Resonance Snap upon landing
      if (this.altarWindow?.node && s?.node === this.altarWindow.node && !s.travel && this.onPolytopeTune) {
        this.snapPolyLockVisual(this.altarWindow.node);
        this.onPolytopeTune(this.altarWindow.node);
        return;
      }
      if (this.hitFriend(event)) { this.onFriend(); return; }
      const anomaly = this.hitAnomaly(event);
      if (anomaly && this.onAnomaly) { this.onAnomaly(anomaly); return; }
      const wLayer = this.hitWStackLayer(event);
      if (wLayer !== null && this.onLayerSelect) { this.onLayerSelect(wLayer); return; }
      // Clicking an off-slice island or curiosity inside Pinned 4D Hyper-Lens while on an anchor dives into that slice
      if (this.hyperLens.pinned && this.hyperLens.open > .35 && s?.phase === 'playing' && !s.travel && !s.wave) {
        const here = this.node(s.node);
        if (here?.anchor && this.hyperLens.snappedLayer !== s.layer) {
          const wp = this.toWorld(event);
          const inLens = Math.hypot(wp.x - this.hyperLens.x, wp.y - this.hyperLens.y) <= 114;
          const hitOffSlice = inLens && s.nodes.some(n => !n.anchor && n.layer === this.hyperLens.snappedLayer && Math.hypot(wp.x - n.x, wp.y - n.y) <= 84);
          if (hitOffSlice && this.onLensDive) {
            this.onLensDive(this.hyperLens.snappedLayer);
            return;
          }
        }
      }
      const node = this.hitTest(event);
      if (node) this.onSelect(node.id);
    };
    this.onCanvasPointerDown = event => {
      if (event.button === 2) {
        if (this.visualGuide && (this.onboardingStage ?? 4) >= 2 && this.state?.phase === 'playing' && !this.state.travel?.risky && !this.state.wave) {
          this.openHyperLensAt(event, 'rmb', event.clientY ?? 0);
        }
        return;
      }
      if (event.button !== undefined && event.button !== 0) return;
      const grab = this.hitGrab(event);
      this.downPoint = {
        x: event.clientX ?? 0,
        y: event.clientY ?? 0,
        world: this.toWorld(event),
        lockHit: grab ? null : this.hitPolytopeLock(event),
        grab,
      };
      if (grab) this._setPointerCapture(event.pointerId);
    };
    this.onCanvasPointerUp = event => {
      if (event.button === 2) {
        if (!this.hyperLens.pinned && this.hyperLens.mode === 'rmb') {
          this.hyperLens.active = false;
          this.hyperLens.mode = null;
        }
        return;
      }
      if (event.button !== undefined && event.button !== 0) return;
      if (this.grab) {
        this._grabEnd(false);
        this.downPoint = null;
        this._releasePointerCapture(event.pointerId ?? this.capturedPointerId);
        return;
      }
      if (this.polyLockDrag) {
        this.polyLockDrag = null;
        this.downPoint = null;
        this._releasePointerCapture(event.pointerId ?? this.capturedPointerId);
        return;
      }
      if (this.hyperLens.active && this.hyperLens.mode === 'drag') {
        if (!this.hyperLens.pinned) {
          this.hyperLens.active = false;
          this.hyperLens.mode = null;
        }
        this.downPoint = null;
        this._releasePointerCapture(event.pointerId ?? this.capturedPointerId);
        return;
      }
      if (!this.downPoint) return;
      const dist = Math.hypot((event.clientX ?? 0) - this.downPoint.x, (event.clientY ?? 0) - this.downPoint.y);
      this.downPoint = null;
      this._releasePointerCapture(event.pointerId ?? this.capturedPointerId);
      if (dist < 8) {
        this.pointerDown(event);
      }
    };
    this.onContextMenu = event => {
      if (this.visualGuide && this.state?.phase === 'playing') event.preventDefault();
    };
    canvas.addEventListener('pointermove', this.pointerMove);
    canvas.addEventListener('pointerleave', this.pointerLeave);
    canvas.addEventListener('pointerdown', this.onCanvasPointerDown);
    canvas.addEventListener('pointerup', this.onCanvasPointerUp);
    canvas.addEventListener('contextmenu', this.onContextMenu);
    this.onPointerCancel = event => {
      if (this.grab) this._grabEnd(true);
      this.downPoint = null;
      if (event?.type === 'lostpointercapture') this.capturedPointerId = null;
      else this._releasePointerCapture(event?.pointerId ?? this.capturedPointerId);
    };
    canvas.addEventListener('pointercancel', this.onPointerCancel);
    canvas.addEventListener('lostpointercapture', this.onPointerCancel);
    this.onTouchStart = e => {
      const touch = e.touches?.[0];
      if (touch && this.hitGrab(touch)) e.preventDefault();
    };
    canvas.addEventListener('touchstart', this.onTouchStart, { passive: false });
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

  isCompactPortrait() {
    return (this.width <= 480 && (globalThis.window?.innerHeight ?? this.height) > (globalThis.window?.innerWidth ?? this.width))
      || (this.height <= 460 && this.width <= 1000);
  }

  toWorld(event) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((event.clientX ?? 0) - rect.left - this.offsetX) / this.scale,
      y: ((event.clientY ?? 0) - rect.top - this.offsetY) / this.scale,
    };
  }

  hitHyperLensToggle(event) {
    if (!this.visualGuide || !this.state || this.state.phase !== 'playing' || this.state.wave) return false;
    if ((this.onboardingStage ?? 4) < 2) return false;
    const { x, y } = this.toWorld(event);
    const s = Math.max(.25, this.scale || 1);
    const cx = 868 + this.parallaxX * 11.9;
    const cy = 114 + this.parallaxY * 7.65;
    const th = 22 / s;
    const py = Math.max(64, 52 + th / 2);
    const halfW = Math.max(24, 20 / s);
    const px = Math.min(0, WORLD_W - 8 - cx - halfW);
    const onOrb = Math.hypot(x - cx, y - cy) <= 58;
    if (onOrb) return true;
    const onPill = Math.abs(x - (cx + px)) <= halfW && y >= cy + py - th / 2 - 2 && y <= cy + py + th / 2 + 2;
    if (!onPill) return false;
    return !this.hitTest(event);
  }

  hitPolytopeLock(event) {
    if (!this.visualGuide || !this.state || this.state.phase !== 'playing' || this.state.wave) return null;
    if ((this.onboardingStage ?? 4) < 2) return null;
    const { x, y } = this.toWorld(event);
    const order = this.state.mechanismOrder || [];
    for (let i = order.length - 1; i >= 0; i--) {
      const id = order[i];
      const node = this.node(id);
      if (!node || (!node.present && node.layer !== this.state.layer)) continue;
      if (!node.powered && !this.state.activated.includes(id)) continue;
      const cy = node.y - (id === 'bell' ? 46 : 36);
      const hitRadius = this.altarWindow?.node === id ? 68 : 58;
      if (Math.hypot(x - node.x, y - cy) <= hitRadius) return id;
    }
    return null;
  }

  getPolyLockState(id) {
    let entry = this.polyLocks.get(id);
    if (!entry) {
      const seedIdx = ['dew', 'bell', 'bloom', 'crown'].indexOf(id);
      const initial = ((seedIdx >= 0 ? seedIdx : 1) % 2 === 0 ? 1 : -1) * (.76 + (seedIdx + 1) * .09);
      entry = { angleOffset: initial, spinVel: 0, snapFlash: 0, snapped: false };
      this.polyLocks.set(id, entry);
    }
    return entry;
  }

  snapPolyLockVisual(id) {
    const entry = this.getPolyLockState(id);
    entry.angleOffset = 0;
    entry.spinVel = 0;
    entry.snapped = true;
    entry.snapFlash = 1;
    const node = this.node(id);
    if (node) {
      this.addEffect('ring', { x: node.x, y: node.y - 34 }, { duration: .55, radius: 62, color: COLORS.lightGold, tier: 2 });
      this.burst({ x: node.x, y: node.y - 26 }, COLORS.lightGold, 16, .85);
    }
  }

  chooseDefaultLensLayer(wx, wy) {
    const s = this.state;
    if (!s?.layers?.length) return 1;
    if (this.pendingLayerPrompt && Number.isInteger(this.pendingLayerPrompt.targetLayer) && this.pendingLayerPrompt.targetLayer !== s.layer) {
      return this.pendingLayerPrompt.targetLayer;
    }
    // Prefer an off-slice curiosity, powered mechanism, or open bridge near cursor
    const nearAnom = (s.anomalies || []).find(a => !a.collected && a.layer !== s.layer && Math.hypot((a.x ?? 500) - wx, (a.y ?? 325) - wy) <= 150);
    if (nearAnom) return nearAnom.layer;
    const nearMech = (s.nodes || []).find(n => !n.anchor && n.layer !== s.layer && n.powered && !s.activated.includes(n.id) && Math.hypot(n.x - wx, n.y - wy) <= 155);
    if (nearMech) return nearMech.layer;
    for (const edge of this.connections()) {
      if (!edge.open || edge.layer === s.layer || edge.kind === 'ferry') continue;
      const mx = mix(edge.a.x, edge.b.x, .5), my = mix(edge.a.y, edge.b.y, .5);
      if (Math.hypot(mx - wx, my - wy) <= 150) return edge.layer;
    }
    const poweredOther = (s.nodes || []).find(n => !n.anchor && n.layer !== s.layer && n.powered && !s.activated.includes(n.id));
    if (poweredOther) return poweredOther.layer;
    return (s.layer + 1) % s.layers.length;
  }

  openHyperLensAt(event, mode = 'drag', startClientY = 0) {
    const wp = this.toWorld(event);
    const s = this.state;
    const targetLayer = this.chooseDefaultLensLayer(wp.x, wp.y);
    const centers = (s?.layers || []).map(l => l.center);
    const initW = centers[targetLayer] ?? .5;
    this.hyperLens.active = true;
    this.hyperLens.mode = mode;
    this.hyperLens.x = clamp(wp.x, 72, WORLD_W - 72);
    this.hyperLens.y = clamp(wp.y, 72, WORLD_H - 72);
    this.hyperLens.startRawW = initW;
    this.hyperLens.rawW = initW;
    this.hyperLens.w = initW;
    this.hyperLens.snappedLayer = targetLayer;
    this.hyperLens.detent = true;
    this.hyperLens.dragStartY = startClientY;
  }

  togglePinnedHyperLens(event) {
    this.hyperLens.pinned = !this.hyperLens.pinned;
    if (this.hyperLens.pinned) {
      if (event) {
        this.openHyperLensAt(event, 'pinned', event.clientY ?? 0);
      } else {
        const s = this.state;
        const targetLayer = this.chooseDefaultLensLayer(WORLD_W * .5, WORLD_H * .5);
        const centers = (s?.layers || []).map(l => l.center);
        const initW = centers[targetLayer] ?? .5;
        this.hyperLens.active = true;
        this.hyperLens.mode = 'pinned';
        this.hyperLens.x = WORLD_W * .5;
        this.hyperLens.y = WORLD_H * .5;
        this.hyperLens.startRawW = initW;
        this.hyperLens.rawW = initW;
        this.hyperLens.w = initW;
        this.hyperLens.snappedLayer = targetLayer;
        this.hyperLens.detent = true;
      }
      const cx = 868 + this.parallaxX * 11.9, cy = 114 + this.parallaxY * 7.65;
      this.addEffect('ring', { x: cx, y: cy }, { duration: .6, radius: 68, color: COLORS.mint, tier: 2 });
      this.onLensDetent?.(this.hyperLens.snappedLayer);
    } else {
      this.closeHyperLens();
    }
  }

  closeHyperLens() {
    this.hyperLens.pinned = false;
    this.hyperLens.active = false;
    this.hyperLens.mode = null;
  }

  updateHyperLensDrag(wx, wy, deltaClientY = 0) {
    const s = this.state;
    this.hyperLens.x = clamp(wx, 72, WORLD_W - 72);
    this.hyperLens.y = clamp(wy, 72, WORLD_H - 72);
    const centers = (s?.layers || [{ center: .18 }, { center: .5 }, { center: .82 }]).map(l => l.center);
    // Dragging up raises W towards Ⅲ (0.82); dragging down lowers W towards Ⅰ (0.18).
    const nextRaw = clamp(this.hyperLens.startRawW - deltaClientY / 210, .06, .94);
    const mag = magnetizeLensW(nextRaw, centers);
    const prevLayer = this.hyperLens.snappedLayer;
    const enteredDetent = mag.detent && (!this.hyperLens.detent || mag.snappedLayer !== prevLayer);
    this.hyperLens.rawW = mag.rawW;
    this.hyperLens.w = mag.w;
    this.hyperLens.snappedLayer = mag.snappedLayer;
    this.hyperLens.detent = mag.detent;
    if (enteredDetent) this.onLensDetent?.(mag.snappedLayer);
  }

  isHyperLensActive() {
    return Boolean(this.hyperLens.active && this.hyperLens.open > .08);
  }

  triggerLensIrisWave(layerIdx) {
    this.hyperLens.irisWave = {
      x: this.hyperLens.x,
      y: this.hyperLens.y,
      layer: layerIdx,
      age: 0,
      duration: .68,
    };
    if (!this.hyperLens.pinned) {
      this.hyperLens.active = false;
      this.hyperLens.mode = null;
    }
    if (this.life) {
      const p = this.playerPosition();
      this.life.ripple(p.x, p.y);
    }
  }

  hitFriend(event) {
    if (!this.state || this.state.phase !== 'playing' || this.state.travel || this.state.wave) return false;
    const rect = this.canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left - this.offsetX) / this.scale;
    const y = (event.clientY - rect.top - this.offsetY) / this.scale;
    return (this.friendTargets || []).some(p => Math.hypot(x - p.x, y - p.y) <= 18);
  }

  hitAnomaly(event) {
    if (!this.visualGuide || !this.state || this.state.phase !== 'playing' || this.state.travel || this.state.wave) return null;
    if ((this.onboardingStage ?? 4) < 2) return null;
    const rect = this.canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left - this.offsetX) / this.scale;
    const y = (event.clientY - rect.top - this.offsetY) / this.scale;
    return this.explorationRadar.hitTest(this.state, x, y);
  }

  hitWStackLayer(event) {
    if (!this.visualGuide || !this.state || this.state.phase !== 'playing' || this.disposed) return null;
    if ((this.onboardingStage ?? 4) < 2 || this.hudProgressActive) return null;
    const { x, y } = this.toWorld(event);
    const miniScale = clamp(.45 / this.scale, 1, 1.2);
    const lx = (x - 62) / miniScale;
    const ly = (y - 88) / miniScale;
    if (lx < -2 || lx > 196) return null;
    if (!this.state.wave) {
      const hitNode = this.hitTest(event);
      if (hitNode && ((x - hitNode.x) / 44) ** 2 + ((y - hitNode.y + 8) / 28) ** 2 <= 1) return null;
      if (lx > 128 && this.hitVisibleNode(event)) return null;
    }
    let best = null, bestDist = Infinity;
    for (let i = 2; i >= 0; i--) {
      const ry = ly - (2 - i) * 29;
      const isPrompted = this.isExplicitLayerHint() && this.pendingLayerPrompt?.targetLayer === i && this.state.layer !== i;
      const maxLabelX = isPrompted ? 196 : 184;
      const hitDiamond = inWStackQuad(lx, ry);
      const hitLabel = lx >= 128 && lx <= maxLabelX && (this.state.wave ? (ry >= 11 && ry <= 35) : (ry >= 13 && ry <= 28));
      if (hitDiamond || hitLabel) {
        const d = Math.abs(ry - 24);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      }
    }
    return best;
  }

  hitGrab(event) {
    const s = this.state;
    if (!this.visualGuide || !s || s.phase !== 'playing' || this.disposed || s.wave || s.travel?.risky) return null;
    const { x, y } = this.toWorld(event);
    if ((this.onboardingStage ?? 4) >= 2) {
      const hub = this.node('hub');
      if (hub && Math.hypot(x - toys.dialBead(hub, this.currentW()).x, y - toys.dialBead(hub, this.currentW()).y) <= 18) return 'dial';
    }
    if (s.ferry) {
      const pos = ferryPosition(s.ferry, this.currentW());
      if (((x - pos.x) / 50) ** 2 + ((y - pos.y) / 32) ** 2 <= 1) return 'ferry';
    }
    const casts = s.castTargets;
    if (!s.travel && casts && ((casts.prism?.length || 0) + (casts.weave?.length || 0) + (casts.shadow?.length || 0)) > 0) {
      const p = this.playerPosition();
      if (Math.hypot(x - p.x, y - (p.y - 14)) <= 26) return 'cast';
    }
    return null;
  }

  _grabStart(kind, wp) {
    const grab = { kind, w: this.currentW(), velocity: 0, trail: [] };
    if (kind === 'dial') {
      const hub = this.node('hub');
      if (!hub) return null;
      grab.prevAngle = toys.dialAngle(hub, wp.x, wp.y);
    } else if (kind === 'cast') {
      const p = this.playerPosition();
      this.cast = { x: wp.x, y: wp.y, ax: p.x, ay: p.y - 14, snap: null, retract: 0 };
    }
    if (kind === 'dial' || kind === 'ferry') {
      this._grabTrailPush(grab, grab.w);
      this.onScrubW?.(grab.w, { phase: 'start', velocity: 0 });
    }
    return grab;
  }

  _grabTrailPush(grab, w) {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    grab.trail.push({ t: now, w });
    while (grab.trail.length > 2 && now - grab.trail[0].t > 80) grab.trail.shift();
    const first = grab.trail[0], last = grab.trail[grab.trail.length - 1];
    grab.velocity = last.t > first.t ? (last.w - first.w) * 1000 / (last.t - first.t) : 0;
  }

  _grabMove(wp) {
    const grab = this.grab;
    if (!grab) return;
    if (grab.kind === 'dial') {
      const hub = this.node('hub');
      if (!hub) return;
      const angle = toys.dialAngle(hub, wp.x, wp.y);
      const delta = wrapSignedAngle(angle - grab.prevAngle);
      grab.prevAngle = angle;
      grab.w = clamp(grab.w + delta / TAU);
    } else if (grab.kind === 'ferry') {
      const ferry = this.state?.ferry;
      if (!ferry) return;
      grab.w = toys.ferryDragW(ferry, wp.x, wp.y);
    } else if (grab.kind === 'cast') {
      if (!this.cast) return;
      this.cast.x = wp.x;
      this.cast.y = wp.y;
      this.cast.snap = toys.castSnap(this, this.cast);
      return;
    }
    this._grabTrailPush(grab, grab.w);
    this.onScrubW?.(grab.w, { phase: 'move', velocity: grab.velocity });
  }

  _grabEnd(cancelled) {
    const grab = this.grab;
    if (!grab) return;
    this.grab = null;
    if (grab.kind === 'dial' || grab.kind === 'ferry') {
      this.onScrubW?.(grab.w, { phase: cancelled ? 'cancel' : 'end', velocity: grab.velocity || 0 });
      return;
    }
    const cast = this.cast;
    if (!cancelled && cast?.snap) {
      this.cast = null;
      this.onCast?.(cast.snap.relic, cast.snap.target);
    } else if (cast) {
      cast.snap = null;
      if (this.reducedMotion) this.cast = null;
      else cast.retracting = true;
    }
  }

  _setPointerCapture(pointerId) {
    if (pointerId === undefined || pointerId === null) return;
    try {
      this.canvas.setPointerCapture?.(pointerId);
      this.capturedPointerId = pointerId;
    } catch {}
  }

  _releasePointerCapture(pointerId = this.capturedPointerId) {
    if (pointerId === undefined || pointerId === null) return;
    if (this.capturedPointerId === pointerId) this.capturedPointerId = null;
    try {
      this.canvas.releasePointerCapture?.(pointerId);
    } catch {}
  }

  cancelGrab() {
    if (this.grab) {
      this._grabEnd(true);
      this.downPoint = null;
      this._releasePointerCapture();
      return true;
    }
    if (this.downPoint?.grab) {
      this.downPoint = null;
      this._releasePointerCapture();
      return true;
    }
    return false;
  }

  hitVisibleNode(event) {
    if (!this.state || this.state.phase !== 'playing' || this.disposed) return null;
    if (this.state.wave && this.visualGuide) return null;
    const stage = this.onboardingStage ?? 4;
    const { x, y } = this.toWorld(event);
    // Match the painted island top and mechanism, never its generous label box.
    return [...this.state.nodes].reverse().find(node => {
      if (node.kind === 'ferry') return ((x - node.x) / 48) ** 2 + ((y - node.y) / 30) ** 2 <= 1;
      if (node.id === 'bloom' && this.node('crown')?.anchor) return false;
      if (stage < 3 && node.id === 'vault' && node.locked) return false;
      if (!node.present || (!node.anchor && node.scale < .5)) return false;
      if (node.id === 'rift' && (node.locked || !this.state.availableNodes.includes(node.id))) return false;
      const section = node.anchor ? 1 : node.scale;
      const rx = (node.id === 'hub' ? 112 : 81) * section;
      const ry = (node.id === 'hub' ? 60 : 52) * section;
      return ((x - node.x) / rx) ** 2 + ((y - node.y + 12 * section) / ry) ** 2 <= 1;
    }) ?? null;
  }

  hitTest(event) {
    if (!this.state || this.state.phase !== 'playing' || this.disposed) return null;
    if (this.state.wave && this.visualGuide) return null;
    const visibleHit = this.hitVisibleNode(event);
    if (visibleHit || !this.visualGuide) return visibleHit ?? null;
    const stage = this.onboardingStage ?? 4;
    const { x, y } = this.toWorld(event);
    // In visualGuide mode, allow clicking ghosted mechanism/exit/vault/rift islands or their floating badges
    const order = this.state.mechanismOrder || [];
    const candidates = [...this.state.nodes].sort((a, b) => {
      const aGuide = this.liveGuide?.node === a.id ? 2 : (a.powered && !this.state.activated.includes(a.id) ? 1 : 0);
      const bGuide = this.liveGuide?.node === b.id ? 2 : (b.powered && !this.state.activated.includes(b.id) ? 1 : 0);
      return bGuide - aGuide;
    });
    return candidates.find(node => {
      if (node.id === 'bloom' && this.node('crown')?.anchor) return false;
      if (stage < 3 && node.id === 'vault' && node.locked) return false;
      if (stage < 2 && !node.present && node.id !== 'exit') return false;
      if (!order.includes(node.id) && !['exit', 'vault', 'rift'].includes(node.id) && !node.anchor) return false;
      const rx = node.id === 'hub' ? 112 : 84;
      const ry = node.id === 'hub' ? 60 : 56;
      const onIsland = ((x - node.x) / rx) ** 2 + ((y - node.y + 12) / ry) ** 2 <= 1;
      const onBadge = Math.abs(x - node.x) <= 95 && y >= node.y - 154 && y <= node.y - 50;
      const liftY = node.y - ((node.world?.w ?? node.center ?? this.currentW()) - this.currentW()) * 95;
      const onRampEnd = !node.anchor && !node.present && this.state.edges?.some(e => e.open && e.ramp && (e.from === node.id || e.to === node.id))
        && (((x - node.x) / rx) ** 2 + ((y - liftY + 12) / ry) ** 2 <= 1 || (Math.abs(x - node.x) <= 95 && y >= liftY - 154 && y <= liftY - 50));
      return onIsland || onBadge || onRampEnd;
    }) ?? null;
  }

  setState(snapshot) {
    const roomChanged = this.state && (this.state.room !== snapshot.room || this.state.roomSignature !== snapshot.roomSignature || this.state.seed !== snapshot.seed);
    // A new generated room invalidates every delayed presentation cue.
    if (roomChanged) {
      this.effects.length = 0; this.particles.length = 0; this.shake = 0; this.flash = 0;
      this.displayW = snapshot?.w ?? null;
      this.wTween = null;
      this.wrapAlpha = 1;
      this.polyLocks.clear();
      this.polyLockDrag = null;
      this.altarWindow = null;
      this.grab = null;
      this.cast = null;
      this.downPoint = null;
      this._releasePointerCapture();
      this.hyperLens.irisWave = null;
      if (!this.hyperLens.pinned) {
        this.hyperLens.active = false;
        this.hyperLens.mode = null;
        this.hyperLens.open = 0;
      }
    } else if (snapshot && Number.isFinite(snapshot.w)) {
      if (this.displayW === null || this.reducedMotion || snapshot.travel?.risky || snapshot.travel?.ramp || this.state?.travel?.ramp) {
        this.displayW = snapshot.w;
        this.wTween = null;
        this.wrapAlpha = 1;
      } else {
        const currentTarget = this.wTween ? this.wTween.to : this.displayW;
        const diff = Math.abs(snapshot.w - currentTarget);
        if (diff > 1e-4) {
          // Small continuous W nudges (slider / A-D keys) snap directly; discrete layer shifts ease-out
          if (diff <= 0.045 && !this.wTween) {
            this.displayW = snapshot.w;
            this.wrapAlpha = 1;
          } else {
            const fromW = this.displayW;
            const wrap = Math.abs(snapshot.w - fromW) > 0.45;
            this.wTween = {
              from: fromW,
              to: snapshot.w,
              elapsed: 0,
              duration: wrap ? 0.42 : 0.38,
              wrap,
            };
          }
        }
      }
    }
    this.state = snapshot;
    if (snapshot) {
      if (!this.life || this._lifeSeed !== snapshot.seed) {
        this._lifeSeed = snapshot.seed;
        this.life = new CourtyardLife({ reducedMotion: this.reducedMotion, seed: snapshot.seed ?? 1 });
      }
      this.life.setRoom(`${snapshot.roomSignature ?? 'room'}:${snapshot.room ?? 0}`, snapshot.nodes || []);
    }
  }

  currentW() {
    if (Number.isFinite(this.displayW)) return this.displayW;
    return this.state?.w ?? .28;
  }

  isExplicitLayerHint() {
    if (typeof this.explicitLayerHint === 'boolean') return this.explicitLayerHint;
    return (this.onboardingStage ?? 4) < 3;
  }

  sectionAt(center, w = this.currentW()) {
    return Math.sqrt(Math.max(0, 1 - ((w - center) / .16) ** 2));
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

  spawnBurst(x, y, color = '#fbbf24', count = 24, power = 1) {
    this.burst({ x, y }, color, count, Math.min(2, power));
  }

  triggerMaterializeAha(layerIdx, newlyVisibleEdges = [], targetNode = null) {
    const pal = this.palette(layerIdx);
    for (const edge of newlyVisibleEdges) {
      const a = this.node(edge.from), b = this.node(edge.to);
      if (!a || !b) continue;
      this.addEffect('astral_bridge', a, {
        to: { x: b.x, y: b.y },
        edgeId: edge.id,
        layer: layerIdx,
        duration: .85,
        color: pal.color,
      });
    }
    if (targetNode) {
      this.addEffect('section', targetNode, { duration: .95, radius: 105, color: pal.color });
      this.addEffect('ring', targetNode, { duration: .85, radius: 92, color: COLORS.gold, tier: 2 });
      this.burst(targetNode, pal.glow, 22, 1.05);
    }
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
    const neighbors = this.connections().filter(edge => edge.open && edge.kind !== 'ferry' && (edge.from === target.id || edge.to === target.id)).slice(0, tier + 1);
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
      if (this.life) {
        if (event.type === 'layer_shift' || event.type === 'phase_transfer') {
          const p = this.playerPosition();
          this.life.ripple(p.x, p.y);
        }
        if (event.type === 'harmonic_burst' || event.type === 'phase_graze' || event.type === 'phase_sync'
          || (event.type === 'phase_dash' && event.rating === 'perfect')) this.life.cheer();
      }
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
        // Completion belongs to the action feedback / activation CTA, never a second note.
        if (!this.hudProgressActive && !event.complete && mechanismFeedback(event, this.state, { hasSupplySlots: this.hasSupplySlots(event.to) }))
          this.addEffect('note', to, { duration: this.isCompactPortrait() ? 1.25 : 2.2, supply: true, text: `供能 ${event.received}/${event.required}`, color: this.astralMode ? '#4dd2ac' : COLORS.teal });
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
        const mechTotal = this.state?.mechanismOrder?.length || 3;
        if (!this.hudProgressActive) {
          this.effects = this.effects.filter(effect => !effect.activationNote);
          this.addEffect('note', target, {
            duration: 2.2,
            text: `启动！${this.state?.activated?.length || event.tier}/${mechTotal}`,
            color: this.astralMode ? '#4dd2ac' : COLORS.teal,
            activationNote: true,
          });
        }
        this.addEffect('ring', target, { duration: 1.2, radius: 110, color, tier: 2 });
        this.addEffect('bloom', target, { duration: 1, radius: 85, color });
        this.burst(target, this.palette(target.layer ?? this.state?.layer).glow, 28, 1.25);
      } else if (event.type === 'sanctum_start') {
        this.addEffect('ring', target, { duration: .9, radius: 118, color: COLORS.gold, tier: 3 });
        this.burst(target, COLORS.lightGold, 32, 1.15);
      } else if (event.type === 'sanctum_clear') {
        this.addEffect('gather', target, { duration: .25, radius: 108, color: COLORS.gold, celebration: true });
        this.addEffect('rift_unfold', target, { delay: .18, duration: 2.2, tier: 3, color: COLORS.gold, celebration: true });
        const exitTarget = this.node('exit');
        if (exitTarget) {
          this.addEffect('ascension_signal', target, {
            to: { x: exitTarget.x, y: exitTarget.y },
            fromLayer: target.layer ?? this.state?.layer ?? 2,
            toLayer: exitTarget.layer ?? 1,
            layer: exitTarget.layer ?? 1,
            delay: .22,
            duration: 1.4,
            color: COLORS.gold,
            celebration: true,
          });
        }
        if (event.edgeId) this.growBridge(event.edgeId, COLORS.gold);
        this.burst(target, COLORS.lightGold, 56, 1.3, { delay: .2, celebration: true });
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
      } else if (event.type === 'phase_dash') {
        const pos = this.playerPosition();
        const from = this.node(event.from), to = this.node(event.to);
        const dashColor = event.rating === 'perfect' ? COLORS.lightGold : this.palette(event.layer ?? this.state?.layer).glow;
        this.addEffect('ring', pos, { duration: .48, radius: event.rating === 'perfect' ? 76 : 58, color: dashColor, tier: event.rating === 'perfect' ? 2 : 1, celebration: true });
        if (from && to && !this.reducedMotion) {
          const dx = to.x - from.x, dy = to.y - from.y, len = Math.max(1, Math.hypot(dx, dy));
          const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
          for (let i = 0; i < 14; i++) {
            const spread = (this.random() - .5) * 22;
            const speed = 75 + this.random() * 115;
            this.particles.push({
              x: pos.x + nx * spread,
              y: pos.y - 10 + ny * spread,
              vx: -ux * speed + nx * spread * 1.4,
              vy: -uy * speed - 22,
              age: 0,
              celebration: true,
              duration: .38 + this.random() * .36,
              size: 2.2 + this.random() * 2.6,
              color: i % 2 === 0 ? dashColor : this.palette(event.layer ?? this.state?.layer).color,
              spin: this.random() * TAU,
            });
          }
          if (this.particles.length > 220) this.particles.splice(0, this.particles.length - 220);
        }
        this.phaseResonance?.pushBeat(
          event.rating === 'perfect' ? '🌊 踏浪冲刺 ✦' : '🌊 相位冲刺',
          event.rating === 'perfect' ? 'perfect' : 'good',
          .95,
          'phase_dash'
        );
      } else if (event.type === 'polytope_lock') {
        this.snapPolyLockVisual(event.node);
        if (this.state?.node !== event.node) {
          this.phaseResonance?.pushBeat('🔮 截面预调谐 ✓', 'perfect', 1.0, 'polytope_lock');
        }
      } else if (event.type === 'harmonic_burst') {
        const burstNode = this.node(event.node) || target;
        this.addEffect('section', burstNode, { duration: .95, radius: 118, color: COLORS.lightGold, celebration: true });
        this.addEffect('crown', burstNode, { duration: 1.05, tier: 3, color: COLORS.gold, celebration: true });
        this.addEffect('value', burstNode, { delay: .08, duration: 1.25, value: event.bonus || 1, color: COLORS.gold, celebration: true });
        this.burst(burstNode, COLORS.lightGold, 26, 1.15, { celebration: true });
        if (this.phaseResonance?.floatingBeats) {
          this.phaseResonance.floatingBeats = this.phaseResonance.floatingBeats.filter(
            b => b.type !== 'phase_dash' && b.type !== 'polytope_lock'
          );
        }
        this.phaseResonance?.pushBeat(
          event.surfCombo ? '⚡ 踏浪超频 +1◆' : '✦ 超频谐振 +1◆',
          'perfect',
          1.25,
          'harmonic_burst'
        );
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
    if (this.reducedMotion) {
      this.parallaxX = 0;
      this.parallaxY = 0;
      if (this.state && Number.isFinite(this.state.w)) {
        this.displayW = this.state.w;
        this.wTween = null;
        this.wrapAlpha = 1;
      }
    } else if (dt > 0) {
      const k = Math.min(1, dt * 7);
      this.parallaxX += (this.targetTiltX - this.parallaxX) * k;
      this.parallaxY += (this.targetTiltY - this.parallaxY) * k;
      if (this.state?.travel?.risky || this.state?.travel?.ramp) {
        this.displayW = this.state.w;
        this.wTween = null;
        this.wrapAlpha = 1;
      } else if (this.wTween) {
        this.wTween.elapsed += dt;
        const p = clamp(this.wTween.elapsed / this.wTween.duration);
        if (p >= 1) {
          this.displayW = this.wTween.to;
          this.wTween = null;
          this.wrapAlpha = 1;
        } else if (this.wTween.wrap) {
          // Wrap-around (Ⅰ <-> Ⅲ): fade out toward the outer W boundary, then fade in from
          // the opposite boundary so displayW never sweeps through layer Ⅱ (0.50).
          if (p < .5) {
            const u = ease(p * 2);
            const outEdge = this.wTween.from < .5 ? .02 : .98;
            this.displayW = mix(this.wTween.from, outEdge, u);
            this.wrapAlpha = 1 - u;
          } else {
            const u = ease((p - .5) * 2);
            const inEdge = this.wTween.to > .5 ? .98 : .02;
            this.displayW = mix(inEdge, this.wTween.to, u);
            this.wrapAlpha = u;
          }
        } else {
          // Smooth ease-out; the hypersphere formula sqrt(1-((w-c)/.16)^2) naturally grows & shrinks
          const smoothOut = 1 - (1 - p) ** 2.2;
          this.displayW = mix(this.wTween.from, this.wTween.to, smoothOut);
          this.wrapAlpha = 1;
        }
      }
    }
    if (this.state?.ferry) {
      const ferryNode = this.state.nodes.find(n => n.id === 'ferry');
      if (ferryNode) {
        const p = ferryPosition(this.state.ferry, this.currentW());
        ferryNode.x = p.x;
        ferryNode.y = p.y;
      }
    }
    if (this.cast?.retracting) {
      this.cast.retract = this.reducedMotion ? 1 : Math.min(1, this.cast.retract + dt / .18);
      if (this.cast.retract >= 1) this.cast = null;
    }
    if (this.life && this.state) {
      this.life.setReducedMotion(this.reducedMotion);
      const player = this.playerPosition();
      this.life.update(dt, player);
      if (this.state.travel?.dashed) {
        const from = this.node(this.state.travel.from), to = this.node(this.state.travel.to);
        if (from && to) {
          const len = Math.max(1, Math.hypot(to.x - from.x, to.y - from.y));
          this.life.dashPass(player.x, player.y, (to.x - from.x) / len, (to.y - from.y) / len);
        }
      }
    }
    const lensAllowed = Boolean(this.visualGuide && this.hyperLens.active && this.state?.phase === 'playing' && !this.state?.wave && !this.state?.travel?.risky);
    const lensTarget = lensAllowed ? 1 : 0;
    if (this.reducedMotion) {
      this.hyperLens.open = lensTarget;
      if (this.hyperLens.irisWave && dt > 0) {
        this.hyperLens.irisWave.age += dt;
        if (this.hyperLens.irisWave.age >= this.hyperLens.irisWave.duration) this.hyperLens.irisWave = null;
      }
    } else if (dt > 0) {
      this.hyperLens.open += (lensTarget - this.hyperLens.open) * Math.min(1, dt * 12);
      if (Math.abs(this.hyperLens.open - lensTarget) < .004) this.hyperLens.open = lensTarget;
      if (this.hyperLens.irisWave) {
        this.hyperLens.irisWave.age += dt;
        if (this.hyperLens.irisWave.age >= this.hyperLens.irisWave.duration) this.hyperLens.irisWave = null;
      }
    }
    if (dt > 0) {
      for (const [id, lock] of this.polyLocks) {
        lock.snapFlash = Math.max(0, lock.snapFlash - dt * 1.85);
        if (this.state?.tunedMechanisms?.includes(id) && !lock.snapped) {
          lock.snapped = true;
          lock.angleOffset = 0;
        }
        if (!this.reducedMotion && Math.abs(lock.spinVel) > 1e-3 && (!this.polyLockDrag || this.polyLockDrag.nodeId !== id)) {
          lock.angleOffset = wrapSignedAngle(lock.angleOffset + lock.spinVel * dt);
          lock.spinVel *= Math.exp(-3.6 * dt);
          if (Math.abs(lock.spinVel) < .02) lock.spinVel = 0;
        }
      }
    }
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
    ctx.fillStyle = this.astralMode ? '#0f1c24' : COLORS.paper;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.save();
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.scale, this.scale);
    const zoom = 1 + (this.feel?.value('camera') || 0);
    if (zoom !== 1) { ctx.translate(500, 325); ctx.scale(zoom, zoom); ctx.translate(-500, -325); }
    if (!this.reducedMotion && this.shake) {
      ctx.translate(Math.sin(this.time * 93) * this.shake * 7, Math.cos(this.time * 81) * this.shake * 4);
    }
    this.drawBackground();
    if (this.state) {
      const stage = this.onboardingStage ?? 4;
      this.drawAscensionCanopy();
      this.drawSliceVolumes();
      if (stage >= 2) this.drawDependencies();
      if (stage >= 3) {
        this.drawDormantGrowth();
        this.drawHiddenRoutes();
      }
      this.drawConnections();
      toys.drawFerryRail(this);
      this.drawRiskCorridor();
      if (this.visualGuide) this.drawBridgeSurfCue();
      this.labelZones = [];
      const nodes = [...this.state.nodes].sort((a, b) => a.y - b.y);
      for (const node of nodes) this.drawIsland(node);
      if (stage >= 2) this.drawAnchorSliceBridges();
      this.drawMomentum();
      this.drawSceneCues();
      toys.drawFireflies(this);
      this.drawEffects(false);
      if (this.visualGuide) this.drawPolytopeLocks();
      this.drawGhost();
      this.drawWave();
      this.drawPlayer();
      drawCourtyardFriends(this);
      this.drawEffects(true);
      this.drawPhaseBeats();
      if (this.visualGuide) this.drawVisualActionGuide();
      this.drawParticles();
      this.drawAtmosphere();
      toys.drawRelicCast(this);
      if (this.visualGuide) this.drawHyperLens();
      if (stage >= 2 && !this.hudProgressActive) this.drawWStack();
    }
    ctx.restore();
    if (this.flash && !this.reducedMotion) {
      ctx.save(); ctx.globalAlpha = this.flash; ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, this.width, this.height); ctx.restore();
    }
  }

  drawBackground() {
    const ctx = this.ctx;
    const px = this.parallaxX * 14, py = this.parallaxY * 9;
    const gradient = ctx.createLinearGradient(0, 0, 0, WORLD_H);
    if (this.astralMode) {
      gradient.addColorStop(0, '#0e1b26');
      gradient.addColorStop(.55, '#162936');
      gradient.addColorStop(1, '#1c333b');
    } else {
      gradient.addColorStop(0, this.palette().pale);
      gradient.addColorStop(.6, '#edf1e5');
      gradient.addColorStop(1, '#e1ebe1');
    }
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    // Quiet topographic circles establish depth without competing with paths.
    ctx.save(); ctx.globalAlpha = this.astralMode ? .18 : .22;
    for (let i = 0; i < 8; i++) {
      ellipse(ctx, 485 + px * (.3 + i * .08), 338 + py * (.3 + i * .08), 230 + i * 48, 105 + i * 30, null, this.astralMode ? this.palette().color : '#b4cab9', 1);
    }
    ctx.restore();
    const glow = ctx.createRadialGradient(495 + px, 260 + py, 30, 495 + px, 300 + py, 440);
    glow.addColorStop(0, this.astralMode ? `${this.palette().color}38` : '#ffffff70');
    glow.addColorStop(1, '#ffffff00');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    for (let i = 0; i < 26; i++) {
      const depth = .4 + (i % 4) * .25;
      const baseX = clamp(hash(i + 11) * WORLD_W + px * depth, 0, WORLD_W);
      const baseY = clamp(30 + hash(i + 78) * 560 + py * depth, 0, WORLD_H);
      const dust = this.life ? this.life.dustOffset(i, baseX, baseY) : null;
      const x = baseX + (dust?.dx || 0);
      const y = baseY + (dust?.dy || 0);
      const offset = this.reducedMotion ? 0 : Math.sin(this.time * .35 + i) * 5;
      const r = this.astralMode ? (i % 5 === 0 ? 2.4 : 1.7) : 1.5;
      const starCol = this.astralMode ? this.palette(i % 3).glow : '#ffffffa8';
      ellipse(ctx, x, y + offset, r, r, starCol);
      if (this.astralMode && i % 5 === 0) {
        ctx.save();
        ctx.globalAlpha = this.reducedMotion ? .45 : .3 + .3 * Math.sin(this.time * 1.4 + i);
        line(ctx, x - 5.5, y + offset, x + 5.5, y + offset, starCol, .9);
        line(ctx, x, y + offset - 5.5, x, y + offset + 5.5, starCol, .9);
        ctx.restore();
      }
    }
    this.drawDistantStone(96 + px * .7, 147 + py * .7, .65, .32);
    this.drawDistantStone(872 + px * 1.1, 420 + py * 1.1, .9, .25);
    this.drawDistantStone(139 + px * .5, 555 + py * .5, .45, .3);
    this.drawDistantStone(835 + px * .6, 85 + py * .6, .35, .25);
    this.drawTesseractHologram(868 + px * .85, 114 + py * .85);
  }

  drawTesseractHologram(cx, cy) {
    const ctx = this.ctx;
    const lensActive = this.isHyperLensActive();
    const w = lensActive ? this.hyperLens.w : this.currentW();
    const palette = lensActive ? this.palette(this.hyperLens.snappedLayer) : this.palette();
    const spinTime = this.reducedMotion ? 0 : this.time;
    const interactive = Boolean(this.visualGuide && (this.onboardingStage ?? 4) >= 2 && this.state?.phase === 'playing' && !this.state?.wave);
    const hot = interactive && (this.hoverLensToggle || this.hyperLens.pinned || lensActive);
    const proj = projectPolytope4D('tesseract', {
      w,
      time: spinTime,
      tiltX: this.parallaxX * .6,
      tiltY: this.parallaxY * .6,
      radius: hot ? 65 : 62,
    });
    ctx.save();
    ctx.translate(cx, cy);
    if (hot) {
      ctx.globalAlpha = this.hyperLens.pinned ? .34 : .2;
      ellipse(ctx, 0, 0, 62, 62, this.astralMode ? '#143342' : '#ffffff', this.hyperLens.pinned ? COLORS.lightGold : (palette.astralColor || palette.color), 1.8);
    }
    ctx.globalAlpha = hot ? .72 : (this.astralMode ? .46 : .28);
    ellipse(ctx, 0, 0, 56, 56, null, this.hyperLens.pinned ? COLORS.lightGold : palette.color, hot ? 1.5 : 1);
    ellipse(ctx, 0, 0, 42, 18, null, palette.color, .8);
    // 4D Tesseract edges
    for (const [aIdx, bIdx] of proj.edges) {
      const a = proj.vertices[aIdx], b = proj.vertices[bIdx];
      const near = Math.max(a.proximity, b.proximity);
      ctx.globalAlpha = (this.astralMode ? .22 : .13) + near * (hot ? .48 : .36);
      line(ctx, a.x, a.y, b.x, b.y, near > .65 ? (this.hyperLens.pinned ? COLORS.lightGold : palette.color) : COLORS.mute, near > .65 ? 1.6 : .9);
    }
    // Highlighted 4D hyperplane slice polygon at current W
    if (proj.sliceHull.length >= 3) {
      ctx.globalAlpha = hot ? .34 : (this.astralMode ? .26 : .16);
      path(ctx, proj.sliceHull.map(p => [p.x, p.y]));
      ctx.fillStyle = palette.glow;
      ctx.fill();
      ctx.globalAlpha = hot ? .9 : (this.astralMode ? .78 : .52);
      ctx.strokeStyle = this.hyperLens.pinned ? COLORS.lightGold : palette.color;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    for (const v of proj.vertices) {
      if (v.proximity < .45) continue;
      ctx.globalAlpha = v.proximity * (this.astralMode ? .85 : .6);
      diamond(ctx, v.x, v.y, 2.2 + v.proximity * 1.8, palette.glow, palette.color);
    }
    if (interactive) {
      const sScale = Math.max(.25, this.scale || 1);
      const label = '🔍';
      ctx.globalAlpha = hot ? .96 : .8;
      const pillPx = 12 / sScale;
      ctx.font = `600 ${pillPx}px system-ui, -apple-system, sans-serif`;
      const tw = Math.max(30 / sScale, ctx.measureText(label).width + 14 / sScale);
      const th = 22 / sScale;
      const py = Math.max(64, 52 + th / 2);
      const px = Math.min(0, WORLD_W - 8 - cx - tw / 2);
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(px - tw / 2, py - th / 2, tw, th, th / 2);
      else ctx.rect(px - tw / 2, py - th / 2, tw, th);
      ctx.fillStyle = this.hyperLens.pinned
        ? (this.astralMode ? '#3b2b0df2' : '#fde68af0')
        : (this.astralMode ? '#0d202ee0' : '#f1f7f2e8');
      ctx.fill();
      ctx.lineWidth = (this.hyperLens.pinned || this.hoverLensToggle ? 1.8 : 1.2) / sScale;
      ctx.strokeStyle = this.hyperLens.pinned
        ? '#f59e0b'
        : this.hoverLensToggle
          ? (palette.astralColor || palette.color)
          : (this.astralMode ? '#3b647bb0' : '#9bb6a8c8');
      ctx.stroke();
      ctx.fillStyle = this.hyperLens.pinned
        ? (this.astralMode ? '#ffe9a8' : '#7c4a0d')
        : (this.astralMode ? '#daf4ef' : '#244b45');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, px, py);
    }
    ctx.restore();
  }

  drawDistantStone(x, y, size, opacity) {
    const ctx = this.ctx;
    ctx.save(); ctx.translate(x, y); ctx.scale(size, size); ctx.globalAlpha = opacity;
    path(ctx, [[-45, 0], [12, -20], [45, -6], [38, 20], [-18, 26]]);
    ctx.fillStyle = this.astralMode ? '#1e3948' : '#abc5b1'; ctx.fill();
    if (this.astralMode) { ctx.strokeStyle = this.palette().astralColor + '48'; ctx.lineWidth = 1.2; ctx.stroke(); }
    path(ctx, [[-45, 0], [-18, 26], [38, 20], [10, 53], [-20, 38]]);
    ctx.fillStyle = this.astralMode ? '#122430' : '#8cae9b'; ctx.fill(); ctx.restore();
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
      const sealStroke = this.astralMode ? (this.palette(layer).astralColor || this.palette(layer).color) : this.palette(layer).color;
      diamond(ctx, 0, cy, next ? 10 : 8, complete ? this.palette(layer).glow : (this.astralMode ? '#182236' : '#edf1e5'), sealStroke);
      if (complete) {
        line(ctx, -3, cy, 0, cy + 3, this.palette(layer).color, 1.7);
        line(ctx, 0, cy + 3, 4, cy - 4, this.palette(layer).color, 1.7);
      }
      for (let pip = 0; pip <= layer; pip++) ellipse(ctx, 16 + pip * 4, cy, 1.4, 1.4, sealStroke);
      if (next) ellipse(ctx, 0, cy, 14, 14, null, sealStroke, 1.3);
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
      ctx.fillStyle = this.astralMode ? '#443518' : '#ead8a4'; ctx.fill(); ctx.strokeStyle = COLORS.ascension; ctx.lineWidth = 1.6; ctx.stroke();
      line(ctx, x - 3, 7, x - 3, -height + 8, this.astralMode ? '#ffe79c' : '#fff9dd', 2.8);
      for (let i = 0; i < 3; i++) {
        const ringCol = this.astralMode ? (this.palette(i).astralColor || this.palette(i).color) : this.palette(i).color;
        ellipse(ctx, x, -height + 16 + i * 16, 11, 5.5, null, ringCol, 1.5);
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
    const color = danger ? COLORS.danger : awakened ? COLORS.ascension : (this.astralMode ? '#b794f4' : COLORS.secret);
    ellipse(ctx, 0, 4, 53, 28, this.astralMode ? '#1c1833' : '#ddd2e4', color, 2);
    ellipse(ctx, 0, 1, 43, 22, this.astralMode ? '#272044' : '#eee5f0', this.astralMode ? '#6f5aa8' : '#fffaf2', 2);
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * (awakened ? 42 : 24), height = awakened ? Math.min(77, node.y - 30) - Math.abs(i - 1) * 17 : 48;
      path(ctx, [[x - 6, 0], [x - 5, -height], [x, -height - 9], [x + 5, -height], [x + 6, 0]]);
      ctx.fillStyle = awakened ? (this.astralMode ? '#4a3918' : '#ead8a4') : (this.astralMode ? '#2e244f' : '#c8bbd7'); ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
      const ringCol = this.astralMode ? (this.palette(i).astralColor || this.palette(i).color) : this.palette(i).color;
      diamond(ctx, x, -height - 12, awakened ? 10 : 7, this.palette(i).glow, ringCol);
    }
    // Three intersecting section rings become a much larger permanent halo.
    const haloY = awakened ? -Math.min(52, node.y * .23) : -35;
    const haloHeight = awakened ? Math.min(79, node.y + haloY - 12) : 37;
    for (let i = 0; i < 3; i++) {
      const ringCol = this.astralMode ? (this.palette(i).astralColor || this.palette(i).color) : this.palette(i).color;
      ctx.save(); ctx.translate(0, haloY); ctx.rotate((i - 1) * .78);
      ellipse(ctx, 0, 0, awakened ? haloHeight * .74 : 27, haloHeight, null, ringCol, awakened ? 2.5 : 1.4);
      const phase = this.reducedMotion ? -.7 + i : this.time * .18 + i * 2;
      diamond(ctx, Math.cos(phase) * (awakened ? haloHeight * .74 : 27), Math.sin(phase) * haloHeight, awakened ? 6 : 3, this.palette(i).glow, ringCol);
      ctx.restore();
    }
    if (awakened) {
      for (const side of [-1, 1]) {
        path(ctx, [[side * 35, -9], [side * 89, -46], [side * 69, -7], [side * 40, 10]]);
        ctx.fillStyle = this.astralMode ? '#493818cc' : '#fff1c6'; ctx.fill(); ctx.strokeStyle = COLORS.ascension; ctx.lineWidth = 1.7; ctx.stroke();
        line(ctx, side * 42, -2, side * 77, -31, this.astralMode ? '#ffd982' : '#d8bc6e', 2);
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

  rampEnds(spec, a, b) {
    const w = this.currentW(), s = this.state;
    const fc = s?.layers?.[spec.fromLayer]?.center ?? w, tc = s?.layers?.[spec.toLayer]?.center ?? w;
    return { ax: a.x, ay: a.y - (fc - w) * 95, bx: b.x, by: b.y - (tc - w) * 95 };
  }

  drawConnections() {
    const ctx = this.ctx, s = this.state;
    for (const edge of this.connections()) {
      const { a, b } = edge;
      const selected = (s.node === a.id && s.selected === b.id) || (s.node === b.id && s.selected === a.id);
      const traversing = s.travel?.edgeId === edge.id;
      if (edge.kind === 'ferry' && !traversing) continue;
      const relevant = selected || traversing;
      if (edge.ramp && edge.open) {
        const { ax, ay, bx, by } = this.rampEnds(edge, a, b);
        const rdx = bx - ax, rdy = by - ay, rdist = Math.hypot(rdx, rdy);
        if (rdist < 1) continue;
        const rnx = -rdy / rdist, rny = rdx / rdist, rsteps = Math.max(6, Math.floor(rdist / 22));
        const palA = this.palette(edge.fromLayer), palB = this.palette(edge.toLayer);
        const colA = this.astralMode ? (palA.astralColor || palA.color) : palA.color;
        const colB = this.astralMode ? (palB.astralColor || palB.color) : palB.color;
        const grad = ctx.createLinearGradient(ax, ay, bx, by);
        grad.addColorStop(0, colA); grad.addColorStop(1, colB);
        ctx.save();
        ctx.globalAlpha = relevant ? .28 : .17;
        line(ctx, ax, ay, bx, by, grad, relevant ? 25 : 17);
        ctx.globalAlpha = relevant ? .88 : .68;
        for (const side of [-1, 1]) line(ctx, ax + rnx * 15 * side, ay + rny * 15 * side, bx + rnx * 15 * side, by + rny * 15 * side, grad, relevant ? 2 : 1.4);
        const vx = rdx / rdist * 6, vy = rdy / rdist * 6, pw = relevant ? 13 : 10.5;
        for (let i = 1; i < rsteps; i++) {
          const t = i / rsteps, px = mix(ax, bx, t), py = mix(ay, by, t);
          ctx.globalAlpha = relevant ? .95 : .78;
          path(ctx, [[px + rnx * pw - vx, py + rny * pw - vy], [px + rnx * pw + vx, py + rny * pw + vy], [px - rnx * pw + vx, py - rny * pw + vy], [px - rnx * pw - vx, py - rny * pw - vy]]);
          ctx.fillStyle = this.astralMode ? '#193140' : '#f7f4e5';
          ctx.fill(); ctx.strokeStyle = grad; ctx.lineWidth = relevant ? 1.7 : 1.1; ctx.stroke();
          if (i % 2 === 0) diamond(ctx, px, py, 2.4, t < .5 ? palA.glow : palB.glow, t < .5 ? colA : colB);
        }
        if (!this.reducedMotion) {
          const t = (this.time * .42) % 1, rev = s.node === b.id;
          ctx.globalAlpha = .85;
          diamond(ctx, mix(rev ? bx : ax, rev ? ax : bx, t), mix(rev ? by : ay, rev ? ay : by, t), 3.4, (rev ? t > .5 : t < .5) ? palA.glow : palB.glow, grad);
        }
        ctx.restore();
        continue;
      }
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
          ctx.fillStyle = this.astralMode
            ? (astral ? (edge.kind === 'secret' ? '#291c40' : '#352a15')
              : grown ? (edge.kind === 'weave' ? '#17362c' : '#332815') : '#193140')
            : (astral ? (edge.kind === 'secret' ? '#e9dafa' : '#fff0b8')
              : grown ? (edge.kind === 'weave' ? '#e3f0cc' : '#f9eab6') : '#f7f4e5');
          ctx.fill(); ctx.strokeStyle = this.astralMode && !astral && !grown ? this.palette(edge.layer).astralColor : color; ctx.lineWidth = relevant ? 1.6 : .95; ctx.stroke();
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
        if (edge.phaseSwap) {
          const mx = mix(a.x, b.x, .5), my = mix(a.y, b.y, .5);
          ctx.globalAlpha = relevant ? .95 : .82;
          for (const side of [-1, 1]) {
            ctx.setLineDash([6, 5]);
            line(ctx, a.x + nx * 16 * side, a.y + ny * 16 * side, b.x + nx * 16 * side, b.y + ny * 16 * side, COLORS.gold, 1.7);
            ctx.setLineDash([]);
          }
          diamond(ctx, mx, my - 14, 7.5, '#fef3c7', '#f59e0b');
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
      } else if (solid && !this.reducedMotion) {
        // Delicate ambient energy mote drifting along open current-slice bridges
        const t = ((this.time * .24 + hash(a.x + b.y)) % 1);
        ctx.globalAlpha = this.astralMode ? .62 : .42;
        diamond(ctx, mix(a.x, b.x, t), mix(a.y, b.y, t), 2.4, this.palette(edge.layer).glow, color);
      } else if (!edge.open && edge.visible) {
        ctx.globalAlpha = .65;
        const x = mix(a.x, b.x, .5), y = mix(a.y, b.y, .5);
        ellipse(ctx, x, y, 10, 10, this.astralMode ? '#122330' : '#edf1e5', edge.phaseSwap ? '#f59e0b' : color);
        if (edge.phaseSwap) {
          diamond(ctx, x, y, 4.8, null, '#fbbf24');
        } else {
          line(ctx, x - 4, y - 4, x + 4, y + 4, color, 1.5);
          line(ctx, x + 4, y - 4, x - 4, y + 4, color, 1.5);
        }
      }
      ctx.restore();
    }
  }

  drawSliceVolumes() {
    const ctx = this.ctx, s = this.state;
    const w = this.currentW();
    const currentNode = this.node(s.node);
    const onAnchor = !!currentNode?.anchor;
    const stage = this.onboardingStage ?? 4;
    const activePreviewLayer = this.isHyperLensActive() ? this.hyperLens.snappedLayer : (this.hoverWLayer ?? this.previewLayer);
    // 1. Neighboring W-volume bridge silhouettes: vertical offset (delta * 95) shows whether
    // the invisible bridge lies in a higher or lower W slice, brightened when standing on an anchor
    // or hovering a layer button / W-Stack plane.
    if (stage >= 2) {
      for (const edge of this.connections()) {
        if (!edge.open || edge.visible || edge.ramp || edge.kind === 'ferry') continue;
        const { a, b } = edge;
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 1) continue;
        const nx = -dy / dist, ny = dx / dist;
        const layerCenter = s.layers?.[edge.layer]?.center ?? .5;
        const delta = layerCenter - w;
        const lift = delta * 95;
        const isPreviewed = activePreviewLayer === edge.layer;
        const color = this.astralMode && edge.kind === 'normal' ? this.palette(edge.layer).astralColor : this.bridgeColor(edge);
        const touchesHere = edge.from === s.node || edge.to === s.node;
        const alpha = isPreviewed ? .84 : (onAnchor ? (touchesHere ? .58 : .36) : .22);
        const ay = a.y - lift, by = b.y - lift;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.setLineDash(isPreviewed ? [7, 4] : [5, 6]);
        for (const side of [-1, 1]) {
          line(ctx, a.x + nx * 8 * side, ay + ny * 8 * side, b.x + nx * 8 * side, by + ny * 8 * side, color, isPreviewed ? 2.4 : (touchesHere && onAnchor ? 1.8 : 1.2));
        }
        const planks = Math.max(4, Math.floor(dist / 36));
        for (let i = 1; i < planks; i++) {
          const t = i / planks;
          const px = mix(a.x, b.x, t), py = mix(ay, by, t);
          line(ctx, px - nx * 7, py - ny * 7, px + nx * 7, py + ny * 7, color, isPreviewed ? 1.5 : 1);
        }
        ctx.setLineDash([]);
        const mx = mix(a.x, b.x, .5), my = mix(ay, by, .5);
        for (let pip = 0; pip <= edge.layer; pip++) {
          if (isPreviewed) diamond(ctx, mx + (pip - edge.layer / 2) * 8, my - 10, 3.2, this.palette(edge.layer).glow, color);
          else ellipse(ctx, mx + (pip - edge.layer / 2) * 7, my - 10, 1.8, 1.8, color);
        }
        ctx.restore();
      }
    }
    // 2. Neighboring W-volume island silhouettes, never playable platforms.
    for (const node of s.nodes) {
      if (node.anchor) continue;
      if (stage < 2 && !node.present) continue;
      if (stage < 3 && node.id === 'vault' && node.locked) continue;
      if (node.id === 'exit' && !node.present) continue;
      const isPreviewed = activePreviewLayer === node.layer && !node.present;
      const color = this.astralMode ? this.palette(node.layer).astralColor : this.palette(node.layer).color;
      const delta = (node.world?.w ?? node.center) - w;
      const lift = delta * 95;
      ctx.save(); ctx.translate(node.x, node.y - lift);
      ctx.globalAlpha = node.present ? .1 : (isPreviewed ? .74 : (onAnchor ? .38 : .26));
      ctx.setLineDash(isPreviewed ? [6, 5] : [4, 7]);
      ellipse(ctx, 0, 0, 86, 46, isPreviewed ? color + '18' : null, color, isPreviewed ? 2 : 1.2);
      ellipse(ctx, 0, -50, 48, 25, null, color, isPreviewed ? 1.4 : 1);
      for (const side of [-1, 1]) line(ctx, side * 86, 0, side * 48, -50, color, 1);
      ctx.setLineDash([]);
      // A hollow layer token distinguishes an out-of-slice silhouette from a destination.
      if (!node.present) {
        diamond(ctx, 0, -66, isPreviewed ? 7.5 : 6, isPreviewed ? this.palette(node.layer).glow : null, color);
        for (let i = 0; i <= node.layer; i++) ellipse(ctx, (i - node.layer / 2) * 8, -78, 1.7, 1.7, color);
        if (s.coilArmed?.includes(node.id)) {
          ctx.setLineDash([]); ctx.globalAlpha = .65;
          this.drawCoilMark(0, -66, 13, color);
        }
      }
      ctx.restore();
    }
    ctx.save(); ctx.globalAlpha = this.astralMode ? .19 : .12;
    const y = 395 - w * 75;
    const corners = [[95, y - 60], [475, y - 235], [925, y - 25], [540, y + 210]];
    path(ctx, corners);
    ctx.fillStyle = this.palette().color; ctx.fill();
    ctx.globalAlpha = this.astralMode ? .35 : .2; ctx.strokeStyle = this.palette().color; ctx.lineWidth = 1; ctx.stroke();
    // Holographic slice subdivision grid lines
    ctx.globalAlpha = this.astralMode ? .16 : .08;
    for (const frac of [.25, .5, .75]) {
      line(ctx, mix(corners[0][0], corners[3][0], frac), mix(corners[0][1], corners[3][1], frac),
        mix(corners[1][0], corners[2][0], frac), mix(corners[1][1], corners[2][1], frac), this.palette().color, 1);
      line(ctx, mix(corners[0][0], corners[1][0], frac), mix(corners[0][1], corners[1][1], frac),
        mix(corners[3][0], corners[2][0], frac), mix(corners[3][1], corners[2][1], frac), this.palette().color, 1);
    }
    // Chromatic prism refraction ripples when W shifts
    const pos = this.playerPosition();
    for (const ripple of this.phaseResonance?.ripples || []) {
      const p = clamp(ripple.age / ripple.duration);
      const r = 28 + ease(p) * 185;
      for (let c = 0; c < 3; c++) {
        const offsetR = r + (c - 1) * 7 * (1 - p);
        ctx.globalAlpha = (1 - p) * .32;
        ellipse(ctx, pos.x, pos.y - 4, offsetR, offsetR * .52, null, LAYER_PALETTES[c].color, 1.5);
      }
    }
    ctx.restore();
  }

  drawAnchorSliceBridges() {
    const s = this.state;
    if (!s || s.phase !== 'playing' || s.travel || s.wave) return;
    const currentNode = this.node(s.node);
    if (!currentNode?.anchor) return;
    const ctx = this.ctx;
    const w = this.currentW();
    const order = s.mechanismOrder || [];
    const primaryMechId = order.find(id => {
      const n = this.node(id);
      return n && n.powered && !s.activated.includes(id);
    });
    const targetId = this.pendingLayerPrompt?.targetId || (s.activated.length >= (order.length || 3) ? 'exit' : primaryMechId);
    const plan = targetId ? planLayerRoute(s, targetId, { finalLayer: this.pendingLayerPrompt?.finalLayer ?? null }) : null;
    const nextMoveEdgeId = plan?.steps?.find(st => st.type === 'move')?.edgeId || null;
    for (const edge of this.connections()) {
      if (!edge.open || edge.visible || edge.ramp || edge.kind === 'ferry') continue;
      if (edge.from !== s.node && edge.to !== s.node) continue;
      const from = edge.from === s.node ? edge.a : edge.b;
      const to = edge.from === s.node ? edge.b : edge.a;
      const dx = to.x - from.x, dy = to.y - from.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 1) continue;
      const nx = -dy / dist, ny = dx / dist;
      const layerCenter = s.layers?.[edge.layer]?.center ?? .5;
      const delta = layerCenter - w;
      const lift = delta * 95;
      const color = this.bridgeColor(edge);
      const ay = from.y - lift * .35;
      const by = to.y - lift;
      const isTargetEdge = nextMoveEdgeId
        ? edge.id === nextMoveEdgeId
        : (to.id === targetId || (targetId && edge.layer === this.node(targetId)?.layer && !s.activated.includes(to.id)));
      ctx.save();
      ctx.globalAlpha = isTargetEdge ? .82 : .26;
      ctx.setLineDash(isTargetEdge ? [6, 5] : [4, 6]);
      for (const side of [-1, 1]) {
        line(ctx, from.x + nx * 10 * side, ay + ny * 10 * side, to.x + nx * 10 * side, by + ny * 10 * side, color, isTargetEdge ? 2.4 : 1.3);
      }
      const planks = Math.max(4, Math.floor(dist / 28));
      for (let i = 1; i < planks; i++) {
        const t = i / planks;
        const px = mix(from.x, to.x, t), py = mix(ay, by, t);
        line(ctx, px - nx * 8, py - ny * 8, px + nx * 8, py + ny * 8, color, isTargetEdge ? 1.5 : 1);
      }
      // Vertical W-offset tether at the destination island showing upward/downward slice displacement
      line(ctx, to.x, to.y, to.x, by, color, isTargetEdge ? 1.8 : 1.1);
      ctx.setLineDash([]);
      if (isTargetEdge && Math.abs(by - to.y) > 10) {
        const dirY = Math.sign(to.y - by);
        const midY = mix(by, to.y, .52);
        path(ctx, [[to.x - 5, midY - dirY * 4], [to.x, midY + dirY * 3], [to.x + 5, midY - dirY * 4]], false);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      const mx = mix(from.x, to.x, .5), my = mix(ay, by, .5);
      for (let pip = 0; pip <= edge.layer; pip++) {
        diamond(ctx, mx + (pip - edge.layer / 2) * 9, my - 10, isTargetEdge ? 3.5 : 2.6, this.palette(edge.layer).glow, color);
      }
      ctx.restore();
    }
  }

  drawRiskCorridor() {
    const s = this.state;
    if (!s || s.phase !== 'playing' || (!s.riskMode && !s.travel?.risky)) return;
    const info = this.phaseResonance?.corridor(s);
    if (!info) return;
    const edge = s.travel
      ? this.connections().find(e => e.id === s.travel.edgeId)
      : this.connections().find(e => e.open && ((e.from === s.node && e.to === s.selected) || (e.to === s.node && e.from === s.selected)));
    if (!edge) return;
    const from = s.travel ? (this.node(s.travel.from) || edge.a) : (s.node === edge.b.id ? edge.b : edge.a);
    const to = s.travel ? (this.node(s.travel.to) || edge.b) : (s.node === edge.b.id ? edge.a : edge.b);
    const dx = to.x - from.x, dy = to.y - from.y, dist = Math.hypot(dx, dy);
    if (dist < 1) return;
    const nx = -dy / dist, ny = dx / dist;
    const ctx = this.ctx;
    ctx.save();
    // Draw undulating golden phase ribbon along the bridge showing live W corridor
    const swayShift = (info.center - (s.layers?.[info.layer]?.center ?? info.center)) * 180;
    const steps = 16;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const wave = this.reducedMotion ? 0 : Math.sin(t * Math.PI * 2 + this.time * 4) * 3.5;
      const lateral = swayShift * Math.sin(t * Math.PI) + wave;
      const px = mix(from.x, to.x, t) + nx * lateral;
      const py = mix(from.y, to.y, t) + ny * lateral;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.globalAlpha = info.sweetSpot ? .85 : info.locked ? .65 : .4;
    ctx.strokeStyle = info.sweetSpot ? COLORS.lightGold : info.locked ? COLORS.gold : COLORS.danger;
    ctx.lineWidth = info.sweetSpot ? 5 : 3.5;
    ctx.stroke();

    // Draw the 3 Rhythm Pulse Gates along the bridge
    for (const gate of info.gates) {
      const gx = mix(from.x, to.x, gate.at);
      const gy = mix(from.y, to.y, gate.at);
      const color = gate.status === 'perfect' ? '#299c80' : gate.status === 'good' ? COLORS.gold : gate.status === 'missed' ? COLORS.danger : COLORS.lightGold;
      ctx.globalAlpha = gate.status === 'pending' || gate.status === 'preview' ? .75 : .92;
      ellipse(ctx, gx, gy, gate.status === 'perfect' ? 14 : 11, gate.status === 'perfect' ? 8 : 6.5, null, color, gate.status === 'perfect' ? 2.4 : 1.6);
      diamond(ctx, gx, gy - 8, gate.status === 'perfect' ? 4.8 : 3.4, color, '#ffffff');
    }

    // Floating Phase Compass + intuitive wheel-direction cue above the player during active risky travel
    if (s.travel?.risky) {
      const pos = this.playerPosition();
      const cy = pos.y - 58;
      ctx.globalAlpha = .92;
      ellipse(ctx, pos.x, cy, 30, 11, '#122429cc', info.sweetSpot ? '#4dd2ac' : info.locked ? COLORS.gold : COLORS.danger, 1.8);
      // Safe target zone bar
      line(ctx, pos.x - 15, cy, pos.x + 15, cy, info.sweetSpot ? '#baf9df88' : '#ffedb066', 4.2);
      // Player W needle relative to moving corridor center (both X and subtle Y reflect W offset)
      const needleX = pos.x + clamp(info.drift, -1.5, 1.5) * 14;
      const needleY = cy - clamp(info.drift, -1.3, 1.3) * 3.2;
      diamond(ctx, needleX, needleY, info.sweetSpot ? 5.4 : 4.4, info.sweetSpot ? '#baf9df' : info.locked ? COLORS.lightGold : COLORS.danger, '#ffffff');
      const sScale = Math.max(.25, this.scale || 1);
      const cueText = info.sweetSpot ? '✦ 同频锁定' : info.drift < 0 ? '▲ 上滚追光' : '▼ 下滚追光';
      const cueBg = info.sweetSpot ? '#0e2f27ee' : info.locked ? '#31210bee' : '#3b1613f0';
      const cueBorder = info.sweetSpot ? '#4dd2ac' : info.locked ? '#f59e0b' : '#ff7b5a';
      const cueFg = info.sweetSpot ? '#d6fff2' : info.locked ? '#ffebb3' : '#ffd8ce';
      ctx.font = `700 ${12 / sScale}px system-ui, -apple-system, sans-serif`;
      const tw = Math.min(WORLD_W - 16, Math.max(74 / sScale, ctx.measureText(cueText).width + 18 / sScale));
      const th = 22 / sScale;
      const tx = clamp(pos.x, tw / 2 + 8, WORLD_W - tw / 2 - 8);
      const ty = Math.max(th / 2 + 6, cy - 12 - th / 2);
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(tx - tw / 2, ty - th / 2, tw, th, th / 2);
      else ctx.rect(tx - tw / 2, ty - th / 2, tw, th);
      ctx.fillStyle = cueBg;
      ctx.fill();
      ctx.lineWidth = 1.5 / sScale;
      ctx.strokeStyle = cueBorder;
      ctx.stroke();
      ctx.fillStyle = cueFg;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(cueText, tx, ty);
    }
    ctx.restore();
  }

  drawBridgeSurfCue() {
    const s = this.state;
    if (!s || s.phase !== 'playing' || !s.travel || s.travel.risky) return;
    if ((this.onboardingStage ?? 4) < 2) return;
    const from = this.node(s.travel.from), to = this.node(s.travel.to);
    if (!from || !to) return;
    const dx = to.x - from.x, dy = to.y - from.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return;
    const ux = dx / dist, uy = dy / dist;
    const nx = -uy, ny = ux;
    const ctx = this.ctx;
    const pal = this.palette(s.travel.layer ?? s.layer);
    const accent = this.astralMode ? (pal.astralColor || pal.color) : pal.color;
    const pos = this.playerPosition();
    const p = clamp(s.travel.progress);

    ctx.save();
    if (!s.travel.dashed && p <= .86) {
      const inSweet = p >= .20 && p <= .66;
      const sx1 = mix(from.x, to.x, .20), sy1 = mix(from.y, to.y, .20);
      const sx2 = mix(from.x, to.x, .66), sy2 = mix(from.y, to.y, .66);
      const railCol = inSweet ? COLORS.lightGold : accent;
      ctx.globalAlpha = inSweet ? .9 : .58;
      for (const side of [-1, 1]) {
        line(ctx, sx1 + nx * 15 * side, sy1 + ny * 15 * side, sx2 + nx * 15 * side, sy2 + ny * 15 * side, railCol, inSweet ? 2.6 : 1.7);
      }
      // Flowing phase-crest chevron moving slightly ahead in the sweet zone
      const crestT = clamp(Math.max(.26, p + .10), .26, .64);
      const cx = mix(from.x, to.x, crestT), cy = mix(from.y, to.y, crestT);
      const pulse = this.reducedMotion ? .5 : .5 + .5 * Math.sin(this.time * 9);
      ctx.globalAlpha = .72 + pulse * .25;
      path(ctx, [
        [cx - ux * 11 + nx * 14, cy - uy * 11 + ny * 14],
        [cx + ux * 11, cy + uy * 11],
        [cx - ux * 11 - nx * 14, cy - uy * 11 - ny * 14],
      ], false);
      ctx.strokeStyle = inSweet ? COLORS.lightGold : pal.glow;
      ctx.lineWidth = inSweet ? 3.2 : 2.2;
      ctx.stroke();
      diamond(ctx, cx, cy, inSweet ? 5.2 : 4, inSweet ? '#fffbeb' : pal.glow, railCol);

      if (p >= .06 && (this.onboardingStage ?? 4) >= 2) {
        const sScale = Math.max(.25, this.scale || 1);
        const label = inSweet ? '🌊 ⟫' : '⟫';
        ctx.globalAlpha = .92;
        ctx.font = `600 ${12 / sScale}px system-ui, -apple-system, sans-serif`;
        const tw = Math.min(WORLD_W - 24, Math.max(30 / sScale, ctx.measureText(label).width + 14 / sScale));
        const th = 22 / sScale;
        const bx = clamp(pos.x, tw / 2 + 12, WORLD_W - tw / 2 - 12);
        const by = Math.max(th / 2 + 8, pos.y - 42 - th / 2);
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(bx - tw / 2, by - th / 2, tw, th, th / 2);
        else ctx.rect(bx - tw / 2, by - th / 2, tw, th);
        ctx.fillStyle = inSweet ? (this.astralMode ? '#2f230cf0' : '#33230bee') : (this.astralMode ? '#0f2734ee' : '#163139eb');
        ctx.fill();
        ctx.lineWidth = 1.5 / sScale;
        ctx.strokeStyle = inSweet ? '#fbbf24' : '#5eead4';
        ctx.stroke();
        ctx.fillStyle = inSweet ? '#fff7d6' : '#ccfbf1';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, bx, by);
      }
    } else if (s.travel.dashed) {
      const tailT = clamp(Math.max(s.travel.dashedAt ?? 0, p - .34));
      const tx = mix(from.x, to.x, tailT), ty = mix(from.y, to.y, tailT);
      const wakeCol = s.travel.dashed === 'perfect' ? COLORS.lightGold : pal.glow;
      ctx.globalAlpha = .42;
      line(ctx, tx, ty, pos.x, pos.y, wakeCol, 9);
      ctx.globalAlpha = .88;
      line(ctx, tx, ty, pos.x, pos.y, '#ffffff', 2.2);
      // Mid-dash pre-lock combo cue if destination is an untuned powered mechanism
      const dest = to;
      if ((this.onboardingStage ?? 4) >= 2 && dest.kind === 'mechanism' && dest.powered && !s.activated.includes(dest.id) && !s.tunedMechanisms?.includes(dest.id) && p < .92) {
        const sScale = Math.max(.25, this.scale || 1);
        const comboText = '⚡ 再点锁频 +1◆';
        ctx.globalAlpha = .94;
        ctx.font = `600 ${12 / sScale}px system-ui, -apple-system, sans-serif`;
        const tw = Math.min(WORLD_W - 24, Math.max(76 / sScale, ctx.measureText(comboText).width + 16 / sScale));
        const th = 22 / sScale;
        const bx = clamp(dest.x, tw / 2 + 12, WORLD_W - tw / 2 - 12);
        const by = Math.max(th / 2 + 8, dest.y - 74 - th / 2);
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(bx - tw / 2, by - th / 2, tw, th, th / 2);
        else ctx.rect(bx - tw / 2, by - th / 2, tw, th);
        ctx.fillStyle = '#33230bf2';
        ctx.fill();
        ctx.lineWidth = 1.5 / sScale;
        ctx.strokeStyle = '#fbbf24';
        ctx.stroke();
        ctx.fillStyle = '#fffbeb';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(comboText, bx, by);
      }
    }
    ctx.restore();
  }

  drawPolytopeLocks() {
    const s = this.state;
    if (!s || s.phase !== 'playing' || s.wave) return;
    if ((this.onboardingStage ?? 4) < 2) return;
    const ctx = this.ctx;
    const order = s.mechanismOrder || [];
    for (const id of order) {
      const node = this.node(id);
      if (!node || (!node.present && node.layer !== s.layer)) continue;
      const isLit = s.activated.includes(id);
      const isPowered = node.powered && !isLit;
      const isInteracting = this.hoverPolyLock === id || this.polyLockDrag?.nodeId === id;
      if (!isPowered && !(isLit && isInteracting && Math.abs(this.getPolyLockState(id).spinVel) > .05)) continue;
      const lock = this.getPolyLockState(id);
      const isTuned = Boolean(lock.snapped || s.tunedMechanisms?.includes(id) || isLit);
      const isAltar = Boolean(this.altarWindow?.node === id && s.node === id && !s.travel && !isTuned);
      const cx = node.x;
      const cy = node.y - (id === 'bell' ? 46 : 36);
      const radius = isAltar ? 33 : (isInteracting ? 29 : 24);
      const pal = this.palette(node.layer ?? s.layer);
      const baseCol = this.astralMode ? (pal.astralColor || pal.color) : pal.color;
      const sway = (!isTuned && this.polyLockDrag?.nodeId !== id && !this.reducedMotion)
        ? Math.sin(this.time * 1.65 + node.x * .02) * .08
        : 0;
      const proj = projectPolytopeLock(id, {
        w: this.currentW(),
        offsetAngle: isTuned ? lock.angleOffset : wrapHalfTurnAngle(lock.angleOffset + sway),
        time: this.reducedMotion ? 0 : this.time,
        radius,
      });

      ctx.save();
      ctx.translate(cx, cy);
      const ringR = radius + 8;
      // Outer astrolabe dial ring
      ctx.globalAlpha = isAltar ? .92 : (isTuned ? .84 : (isInteracting ? .8 : .52));
      ellipse(ctx, 0, 0, ringR, ringR * .68, isAltar ? '#fbbf241e' : (isTuned ? '#fde68a1a' : null), isTuned ? COLORS.lightGold : baseCol, isAltar ? 2.2 : 1.3);
      for (let t = 0; t < 8; t++) {
        const a = t * TAU / 8;
        const rIn = ringR - 2.5, rOut = ringR + 2.5;
        line(ctx, Math.cos(a) * rIn, Math.sin(a) * rIn * .68, Math.cos(a) * rOut, Math.sin(a) * rOut * .68, isTuned ? COLORS.lightGold : baseCol, t % 2 === 0 ? 1.5 : .9);
      }

      // Contracting Altar Resonance countdown arc upon landing
      if (isAltar) {
        const remain = 1 - clamp(this.altarWindow.progress ?? 0, 0, 1);
        const shrinkR = ringR + 4 + remain * 14;
        ctx.globalAlpha = .92;
        ellipse(ctx, 0, 0, shrinkR, shrinkR * .68, null, '#fbbf24', 2.4);
        ctx.beginPath();
        ctx.ellipse(0, 0, ringR + 2, (ringR + 2) * .68, 0, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(.03, remain));
        ctx.strokeStyle = '#fffbeb';
        ctx.lineWidth = 2.8;
        ctx.stroke();
      }

      // Target 4D cross-section silhouette frame (dashed golden socket)
      if (!isTuned && proj.targetHull.length >= 3) {
        ctx.globalAlpha = isInteracting || isAltar ? .82 : .48;
        ctx.setLineDash([4, 4]);
        path(ctx, proj.targetHull.map(p => [p.x, p.y]));
        ctx.strokeStyle = COLORS.lightGold;
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Live rotating 4D polytope edges & active hyperplane slice
      const liveCol = isTuned || proj.alignment > .78 ? COLORS.lightGold : baseCol;
      for (const [aIdx, bIdx] of proj.live.edges) {
        const a = proj.live.vertices[aIdx], b = proj.live.vertices[bIdx];
        const near = Math.max(a.proximity, b.proximity);
        ctx.globalAlpha = .2 + near * (isTuned ? .68 : .48);
        line(ctx, a.x, a.y, b.x, b.y, near > .6 ? liveCol : COLORS.mute, near > .6 ? 1.5 : .9);
      }
      if (proj.live.sliceHull.length >= 3) {
        ctx.globalAlpha = isTuned ? (.42 + lock.snapFlash * .35) : (.18 + proj.alignment * .22);
        path(ctx, proj.live.sliceHull.map(p => [p.x, p.y]));
        ctx.fillStyle = isTuned ? '#fef08a' : pal.glow;
        ctx.fill();
        ctx.globalAlpha = isTuned ? .96 : (.62 + proj.alignment * .32);
        ctx.strokeStyle = liveCol;
        ctx.lineWidth = isTuned ? 2.1 : 1.5;
        ctx.stroke();
      }
      diamond(ctx, 0, 0, isTuned ? 5.2 : 3.8, isTuned ? '#fffbeb' : pal.glow, liveCol);

      // Subtle status / prompt micro-pill
      let lockTag = null;
      if (isAltar) lockTag = '⚡ 轻点超频 +1◆';
      else if (isTuned && !isLit) lockTag = '✦ 已锁 +1◆';
      else if (isInteracting && !isTuned) lockTag = '↻ 拖转对准 +1◆';

      if (lockTag) {
        const sScale = Math.max(.25, this.scale || 1);
        ctx.globalAlpha = .94;
        ctx.font = `600 ${12 / sScale}px system-ui, -apple-system, sans-serif`;
        const tw = Math.min(WORLD_W - 16, Math.max(64 / sScale, ctx.measureText(lockTag).width + 14 / sScale));
        const th = 22 / sScale;
        const loX = 8 - cx + tw / 2, hiX = WORLD_W - 8 - cx - tw / 2;
        const tx = clamp(0, Math.min(loX, hiX), Math.max(loX, hiX));
        const ty = isAltar ? -(ringR * .68 + 6 + th / 2) : (ringR * .68 + 5 + th / 2);
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(tx - tw / 2, ty - th / 2, tw, th, th / 2);
        else ctx.rect(tx - tw / 2, ty - th / 2, tw, th);
        ctx.fillStyle = isTuned || isAltar ? '#33230bf0' : '#122634ee';
        ctx.fill();
        ctx.lineWidth = 1.4 / sScale;
        ctx.strokeStyle = isTuned || isAltar ? '#fbbf24' : baseCol;
        ctx.stroke();
        ctx.fillStyle = isTuned || isAltar ? '#fffbeb' : '#daf4ef';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(lockTag, tx, ty);
      }
      ctx.restore();
    }
  }

  drawHyperLens() {
    const ctx = this.ctx, s = this.state;
    if (!s) return;
    // Full-screen expanding Iris Dive wave when diving through the 4D Hyper-Lens
    if (this.hyperLens.irisWave) {
      const wave = this.hyperLens.irisWave;
      const p = clamp(wave.age / Math.max(.05, wave.duration));
      const pal = this.palette(wave.layer);
      const col = this.astralMode ? (pal.astralColor || pal.color) : pal.color;
      const r = 24 + (this.reducedMotion ? .55 : ease(p)) * 960;
      ctx.save();
      ctx.globalAlpha = (1 - p) * .72;
      ellipse(ctx, wave.x, wave.y, r, r * .72, null, col, 3.2 * (1 - p * .5));
      ctx.globalAlpha = (1 - p) * .45;
      ellipse(ctx, wave.x, wave.y, Math.max(8, r * .82), Math.max(6, r * .82 * .72), null, COLORS.lightGold, 1.8);
      ctx.restore();
    }

    if (this.hyperLens.open <= .01) return;
    const openEase = this.reducedMotion ? clamp(this.hyperLens.open) : ease(this.hyperLens.open);
    const r = Math.max(10, 118 * openEase);
    const lx = clamp(this.hyperLens.x, 72, WORLD_W - 72);
    const ly = clamp(this.hyperLens.y, 72, WORLD_H - 72);
    const lensW = clamp(this.hyperLens.w, .06, .94);
    const lensLayer = clamp(this.hyperLens.snappedLayer ?? 1, 0, Math.max(0, (s.layers?.length || 3) - 1));
    const pal = this.palette(lensLayer);
    const accent = this.astralMode ? (pal.astralColor || pal.color) : pal.color;
    const order = s.mechanismOrder || [];
    const numSymbols = ['①', '②', '③', '④'];

    // 1. Clipped 4D X-Ray Portal Interior
    ctx.save();
    ctx.beginPath();
    ctx.arc(lx, ly, r, 0, TAU);
    ctx.clip();

    const bgGrad = ctx.createRadialGradient(lx, ly, 4, lx, ly, r);
    if (this.astralMode) {
      bgGrad.addColorStop(0, '#102838f6');
      bgGrad.addColorStop(.72, '#0b1b27f8');
      bgGrad.addColorStop(1, '#07121bfa');
    } else {
      bgGrad.addColorStop(0, '#f8fcf7f6');
      bgGrad.addColorStop(.75, `${pal.pale}f6`);
      bgGrad.addColorStop(1, '#dce9e2fa');
    }
    ctx.fillStyle = bgGrad;
    ctx.fillRect(lx - r - 2, ly - r - 2, r * 2 + 4, r * 2 + 4);

    // Subtle 4D coordinate grid inside the lens shifting with lensW
    ctx.globalAlpha = this.astralMode ? .2 : .15;
    const gridShift = (lensW - .5) * 60;
    for (let gx = -120; gx <= 120; gx += 30) {
      line(ctx, lx + gx, ly - r, lx + gx, ly + r, accent, .8);
    }
    for (let gy = -120; gy <= 120; gy += 30) {
      const yLine = ly + gy + (gridShift % 30);
      line(ctx, lx - r, yLine, lx + r, yLine, accent, .8);
    }

    // Bridges materialized at lensW
    for (const edge of this.connections()) {
      const inLensW = lensW >= edge.min - .025 && lensW <= edge.max + .025;
      if (!inLensW) continue;
      const { a, b } = edge;
      const dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy);
      if (dist < 1) continue;
      const nx = -dy / dist, ny = dx / dist;
      const eCol = this.astralMode && edge.kind === 'normal' ? (this.palette(edge.layer).astralColor || this.bridgeColor(edge)) : this.bridgeColor(edge);
      if (edge.open) {
        ctx.globalAlpha = .24;
        line(ctx, a.x, a.y, b.x, b.y, eCol, 20);
        const steps = Math.max(5, Math.floor(dist / 24));
        for (let i = 1; i < steps; i++) {
          const t = i / steps;
          const px = mix(a.x, b.x, t), py = mix(a.y, b.y, t);
          const vx = dx / dist * 5.5, vy = dy / dist * 5.5;
          ctx.globalAlpha = .92;
          path(ctx, [
            [px + nx * 11 - vx, py + ny * 11 - vy],
            [px + nx * 11 + vx, py + ny * 11 + vy],
            [px - nx * 11 + vx, py - ny * 11 + vy],
            [px - nx * 11 - vx, py - ny * 11 - vy],
          ]);
          ctx.fillStyle = this.astralMode ? '#1b384a' : '#f9f6e8';
          ctx.fill();
          ctx.strokeStyle = eCol;
          ctx.lineWidth = 1.4;
          ctx.stroke();
        }
        for (const side of [-1, 1]) {
          ctx.globalAlpha = .82;
          line(ctx, a.x + nx * 14 * side, a.y + ny * 14 * side, b.x + nx * 14 * side, b.y + ny * 14 * side, eCol, 1.4);
        }
      } else {
        ctx.globalAlpha = .45;
        ctx.setLineDash([4, 6]);
        line(ctx, a.x, a.y, b.x, b.y, eCol, 1.5);
        ctx.setLineDash([]);
        const mx = mix(a.x, b.x, .5), my = mix(a.y, b.y, .5);
        ellipse(ctx, mx, my, 9, 9, this.astralMode ? '#122330' : '#edf1e5', eCol, 1.4);
      }
    }

    // Continuously sliced 4D islands at lensW
    const lensStage = this.onboardingStage ?? 4;
    const sortedNodes = [...s.nodes].sort((a, b) => a.y - b.y);
    for (const node of sortedNodes) {
      if (node.id === 'rift' && node.locked) continue;
      if (lensStage < 3 && node.id === 'vault' && node.locked) continue;
      if (node.id === 'bloom' && this.node('crown')?.anchor) continue;
      const nodeCenter = node.center ?? node.world?.w ?? (s.layers?.[node.layer]?.center ?? .5);
      const sec = node.anchor ? 1 : this.sectionAt(nodeCenter, lensW);
      if (sec <= .05) continue;
      const nPal = this.palette(node.layer ?? lensLayer);
      const nCol = this.astralMode ? (nPal.astralColor || nPal.color) : nPal.color;
      const w = (node.id === 'hub' ? 106 : node.id === 'exit' ? 84 : node.anchor ? 80 : 88) * sec;
      const h = (node.id === 'hub' ? 54 : 44) * sec;
      ctx.save();
      ctx.translate(node.x, node.y);
      ctx.globalAlpha = clamp(.25 + sec * .75);
      ellipse(ctx, 0, 5 * sec, w * .95, h * .82, this.astralMode ? '#09162288' : '#8aa59640');
      ellipse(ctx, 0, 0, w * .88, h * .76, this.astralMode ? (nPal.astralStone || '#1d3647') : nPal.stone, nCol, node.anchor ? 1.8 : 2.2);
      ellipse(ctx, 0, 0, Math.max(2, w * .72), Math.max(2, h * .6), null, `${nCol}88`, 1.1);
      const mIdx = order.indexOf(node.id);
      const glyph = mIdx >= 0
        ? (s.activated.includes(node.id) ? `✓${numSymbols[mIdx]}` : numSymbols[mIdx])
        : node.id === 'exit'
          ? '🚪'
          : node.id === 'vault'
            ? '✨'
            : node.anchor
              ? '⚓'
              : '◇';
      if (sec > .32) {
        const sScale = Math.max(.25, this.scale || 1);
        diamond(ctx, 0, -14 * sec, Math.max(4, 9 * sec), s.activated.includes(node.id) ? '#fde68a' : nPal.glow, nCol);
        ctx.font = `700 ${clamp(11 / sScale, 11, 32)}px system-ui, -apple-system, sans-serif`;
        ctx.fillStyle = this.astralMode ? '#f0fdf9' : COLORS.ink;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(glyph, 0, 14 * sec);
      }
      ctx.restore();
    }

    // Hidden 4D Curiosities materialized inside lensW
    for (const item of this.explorationRadar.visibleAnomalies(s)) {
      if (item.collected) continue;
      const aCenter = s.layers?.[item.layer]?.center ?? .5;
      const aSec = this.sectionAt(aCenter, lensW);
      if (aSec <= .14) continue;
      const iPal = this.palette(item.layer);
      const iCol = aSec > .75 ? '#fbbf24' : (this.astralMode ? (iPal.astralColor || iPal.color) : iPal.color);
      const proj = projectPolytope4D(item.polytope, {
        w: lensW,
        time: this.reducedMotion ? 0 : this.time * 1.5,
        radius: 24 * aSec,
      });
      ctx.save();
      ctx.translate(item.x, item.y);
      ctx.globalAlpha = clamp(.3 + aSec * .7);
      ellipse(ctx, 0, 0, 30 * aSec, 17 * aSec, aSec > .75 ? '#fbbf2426' : null, iCol, 1.8);
      for (const [aIdx, bIdx] of proj.edges) {
        const va = proj.vertices[aIdx], vb = proj.vertices[bIdx];
        line(ctx, va.x, va.y, vb.x, vb.y, iCol, 1.3);
      }
      diamond(ctx, 0, 0, 5.5 * aSec, '#fffbeb', iCol);
      ctx.restore();
    }
    ctx.restore();

    // 2. Precision Optical Astrolabe Bezel & W-Arc Gauge (outside clip)
    ctx.save();
    const bezelCol = this.hyperLens.detent ? COLORS.lightGold : accent;
    ctx.globalAlpha = .95;
    ellipse(ctx, lx, ly, r, r, null, bezelCol, this.hyperLens.detent ? 2.8 : 2.2);
    ctx.globalAlpha = .52;
    ellipse(ctx, lx, ly, r + 5, r + 5, null, accent, 1.1);
    // Crosshair cardinal ticks
    for (let i = 0; i < 12; i++) {
      const a = i * TAU / 12;
      const major = i % 3 === 0;
      const r1 = r - (major ? 6 : 3), r2 = r + (major ? 5 : 2);
      ctx.globalAlpha = major ? .82 : .38;
      line(ctx, lx + Math.cos(a) * r1, ly + Math.sin(a) * r1, lx + Math.cos(a) * r2, ly + Math.sin(a) * r2, bezelCol, major ? 1.7 : 1);
    }

    // Left W-axis detent arc (Ⅰ 0.18 -> Ⅱ 0.50 -> Ⅲ 0.82)
    const arcR = r + 12;
    const angleForW = wVal => Math.PI * (1.28 - clamp((wVal - .06) / .88, 0, 1) * .56);
    ctx.globalAlpha = .5;
    ctx.beginPath();
    ctx.arc(lx, ly, arcR, Math.PI * .72, Math.PI * 1.28);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.stroke();
    const centers = (s.layers || [{ center: .18 }, { center: .5 }, { center: .82 }]).map(l => l.center);
    centers.forEach((cW, idx) => {
      const a = angleForW(cW);
      const tx = lx + Math.cos(a) * arcR, ty = ly + Math.sin(a) * arcR;
      const isSnap = this.hyperLens.detent && lensLayer === idx;
      ctx.globalAlpha = isSnap ? 1 : .72;
      diamond(ctx, tx, ty, isSnap ? 5.2 : 3.4, isSnap ? '#fffbeb' : this.palette(idx).glow, isSnap ? '#fbbf24' : this.palette(idx).color);
    });
    const needleA = angleForW(lensW);
    ctx.globalAlpha = 1;
    diamond(ctx, lx + Math.cos(needleA) * arcR, ly + Math.sin(needleA) * arcR, 4.6, '#ffffff', bezelCol);

    // Mini 4D cross-section inset at top-right of bezel
    const insetX = lx + r * .71, insetY = ly - r * .71;
    ctx.globalAlpha = .92;
    ellipse(ctx, insetX, insetY, 17, 17, this.astralMode ? '#0b1d2be8' : '#f4f8f3ee', bezelCol, 1.4);
    const miniProj = projectPolytope4D('tesseract', { w: lensW, time: this.reducedMotion ? 0 : this.time, radius: 13 });
    if (miniProj.sliceHull.length >= 3) {
      path(ctx, miniProj.sliceHull.map(p => [insetX + p.x, insetY + p.y]));
      ctx.fillStyle = `${pal.glow}66`;
      ctx.fill();
      ctx.strokeStyle = bezelCol;
      ctx.lineWidth = 1.3;
      ctx.stroke();
    }

    // Top W-slice readout pill
    const sScale = Math.max(.25, this.scale || 1);
    const layerLabels = ['Ⅰ 潮汐层', 'Ⅱ 回声层', 'Ⅲ 绽放层'];
    const topLabel = `🔍 透视 ${layerLabels[lensLayer] || ''} · W ${lensW.toFixed(2)}${this.hyperLens.detent ? ' ✦磁吸' : ''}`;
    ctx.globalAlpha = .96;
    ctx.font = `700 ${12 / sScale}px system-ui, -apple-system, sans-serif`;
    const topW = Math.min(WORLD_W - 20, Math.max(128, ctx.measureText(topLabel).width + 18 / sScale));
    const topH = 22 / sScale;
    const topX = clamp(lx, Math.min(topW / 2 + 10, WORLD_W / 2), Math.max(WORLD_W - topW / 2 - 10, WORLD_W / 2));
    const topY = ly - r - topH / 2 - 8 >= topH / 2 + 6 ? ly - r - topH / 2 - 6 : Math.min(WORLD_H - topH / 2 - 6, ly + r + topH / 2 + 6);
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(topX - topW / 2, topY - topH / 2, topW, topH, topH / 2);
    else ctx.rect(topX - topW / 2, topY - topH / 2, topW, topH);
    ctx.fillStyle = this.astralMode ? '#0b1d2bf2' : '#132933f0';
    ctx.fill();
    ctx.lineWidth = 1.6 / sScale;
    ctx.strokeStyle = bezelCol;
    ctx.stroke();
    ctx.fillStyle = this.hyperLens.detent ? '#fff7d6' : '#daf4ef';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(topLabel, topX, topY);

    // Bottom action micro-hint
    const onAnchor = !!this.node(s.node)?.anchor;
    const subLabel = this.hyperLens.pinned
      ? (onAnchor && lensLayer !== s.layer ? '点击镜内异层岛直达 · 点右上角关' : '移鼠透视四维 · 站 ⚓ 台点镜内岛可切入')
      : (onAnchor ? '↕ 上下拖移调 W · 滚轮直接潜入此层' : '↕ 上下拖移透视异层 · 松手不改当前层');
    const subH = 20 / sScale;
    if (ly + r + subH / 2 + 6 <= WORLD_H - subH / 2 - 6 && topY < ly) {
      ctx.font = `600 ${11 / sScale}px system-ui, -apple-system, sans-serif`;
      const subW = Math.min(WORLD_W - 20, Math.max(132, ctx.measureText(subLabel).width + 16 / sScale));
      const subX = clamp(lx, Math.min(subW / 2 + 10, WORLD_W / 2), Math.max(WORLD_W - subW / 2 - 10, WORLD_W / 2));
      const subY = ly + r + subH / 2 + 6;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(subX - subW / 2, subY - subH / 2, subW, subH, subH / 2);
      else ctx.rect(subX - subW / 2, subY - subH / 2, subW, subH);
      ctx.fillStyle = this.astralMode ? '#091722e8' : '#162b33e6';
      ctx.fill();
      ctx.lineWidth = 1.2 / sScale;
      ctx.strokeStyle = `${accent}aa`;
      ctx.stroke();
      ctx.fillStyle = '#cbeee7';
      ctx.fillText(subLabel, subX, subY);
    }
    ctx.restore();
  }

  drawPhaseBeats() {
    const beats = this.phaseResonance?.floatingBeats || [];
    if (!beats.length) return;
    const ctx = this.ctx, pos = this.playerPosition();
    const sScale = Math.max(.25, this.scale || 1);
    const beatPx = Math.max(15, 12 / sScale);
    for (let i = 0; i < beats.length; i++) {
      const beat = beats[i];
      const stackOffset = (beats.length - 1 - i) * (beatPx + 6 / sScale);
      const p = clamp(beat.age / beat.duration);
      const lift = this.reducedMotion ? 16 : ease(p) * 34;
      ctx.save();
      ctx.globalAlpha = (1 - p) ** .75;
      ctx.font = `700 ${beatPx}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const x = clamp(pos.x, 80, WORLD_W - 80);
      const y = Math.max(beatPx / 2 + 8, pos.y - 78 - lift - stackOffset);
      ctx.lineWidth = Math.max(4, 3 / sScale);
      ctx.strokeStyle = this.astralMode ? '#0f1c24' : '#fff8dd';
      ctx.fillStyle = beat.type === 'phase_graze' ? '#24968d' : beat.rating === 'perfect' ? (this.astralMode ? '#ffd166' : '#c58b2b') : '#378d9c';
      ctx.strokeText(beat.text, x, y);
      ctx.fillText(beat.text, x, y);
      ctx.restore();
    }
  }

  drawVisualActionGuide() {
    const s = this.state;
    if (!s || s.phase !== 'playing') return;
    // Wave active: collapse all callout pills and leave only the safe-layer green ring.
    if (s.wave) return;
    const ctx = this.ctx;
    const stage = this.onboardingStage ?? 4;
    const sScale = Math.max(.25, this.scale || 1);
    const currentNode = this.node(s.node);
    const bounce = this.reducedMotion ? 0 : Math.sin(this.time * 4.2) * 3;
    const playerPos = !s.travel ? this.playerPosition() : null;
    const playerHeadTop = playerPos
      ? playerPos.y - Math.max(34 * clamp(.48 / (this.scale || 1), 1, 1.5), s.combo > 0 ? 52 : s.shield ? 42 : 34)
      : null;
    const clearPlayerY = (baseY, padPx) => (this.width > this.height && playerHeadTop !== null)
      ? Math.min(baseY, playerHeadTop - padPx / sScale)
      : baseY;
    let fullPillCount = 0;
    const MAX_FULL_PILLS = 2;
    const pillRects = [];

    const drawCalloutPill = (cx, cy, text, bgColor, borderColor, textColor) => {
      if (fullPillCount >= MAX_FULL_PILLS) return;
      fullPillCount += 1;
      ctx.save();
      const pillPx = 12.5 / sScale;
      ctx.font = `600 ${pillPx}px system-ui, -apple-system, sans-serif`;
      const padX = 10 / sScale;
      const w = Math.min(WORLD_W - 16, Math.max(48 / sScale, ctx.measureText(text).width + padX * 2));
      const h = 22 / sScale;
      const ptrW = 5 / sScale;
      const ptrH = 6 / sScale;
      let y = clamp(cy + bounce, h / 2 + 6, WORLD_H - h / 2 - ptrH - 6);
      // Avoid overlapping the top-left 4D W-stack when visible in Stage 2+
      const edgeMinX = w / 2 + 8;
      const edgeMaxX = WORLD_W - w / 2 - 8;
      const wStackMinX = (stage >= 2 && !this.hudProgressActive && y < 238) ? Math.min(edgeMaxX, Math.max(edgeMinX, 236 + w / 2)) : edgeMinX;
      const loX = Math.min(wStackMinX, edgeMaxX), hiX = Math.max(edgeMinX, edgeMaxX);
      const x = clamp(cx, Math.min(loX, hiX), Math.max(loX, hiX));
      const tipPad = Math.min(w / 2 - 2, 12 / sScale);
      const tipX = clamp(cx, x - w / 2 + tipPad, x + w / 2 - tipPad);
      pillRects.push({ x1: x - w / 2 - 5 / sScale, y1: y - h / 2 - 3 / sScale, x2: x + w / 2 + 5 / sScale, y2: y + h / 2 + ptrH + 2 / sScale });
      // Pointer triangle
      path(ctx, [[tipX - ptrW, y + h / 2 - 1], [tipX + ptrW, y + h / 2 - 1], [tipX, y + h / 2 + ptrH]]);
      ctx.fillStyle = borderColor;
      ctx.fill();
      // Pill body
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2);
      else ctx.rect(x - w / 2, y - h / 2, w, h);
      ctx.fillStyle = bgColor;
      ctx.fill();
      ctx.lineWidth = 1.6 / sScale;
      ctx.strokeStyle = borderColor;
      ctx.stroke();
      ctx.fillStyle = textColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x, y);
      ctx.restore();
    };

    const drawCompactBadge = (cx, cy, badgeText, bgColor, borderColor, textColor, opts = {}) => {
      ctx.save();
      const badgePx = 12.5 / sScale;
      ctx.font = `700 ${badgePx}px system-ui, -apple-system, sans-serif`;
      const padX = 7 / sScale;
      const w = Math.min(WORLD_W - 12, Math.max(24 / sScale, ctx.measureText(badgeText).width + padX * 2));
      const h = 22 / sScale;
      const x = clamp(cx, w / 2 + 6, WORLD_W - w / 2 - 6);
      let y = clamp(cy + bounce * .45, h / 2 + 6, WORLD_H - h / 2 - 6);
      for (const rect of pillRects) {
        if (x + w / 2 > rect.x1 && x - w / 2 < rect.x2 && y + h / 2 > rect.y1 && y - h / 2 < rect.y2) {
          y = Math.max(h / 2 + 6, rect.y1 - h / 2 - 4 / sScale);
        }
      }
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2);
      else ctx.rect(x - w / 2, y - h / 2, w, h);
      ctx.fillStyle = bgColor;
      ctx.fill();
      if (opts.dashed) ctx.setLineDash([4.5 / sScale, 3.2 / sScale]);
      ctx.lineWidth = (opts.borderWidth ?? (opts.dashed ? 2 : 1.6)) / sScale;
      ctx.strokeStyle = borderColor;
      ctx.stroke();
      if (opts.dashed) ctx.setLineDash([]);
      ctx.fillStyle = textColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(badgeText, x, y);
      ctx.restore();
    };

    // 1. Emergency Void Rescue visual alert if standing on disappearing floor
    if (s.phaseStability < .99 && !s.travel && currentNode) {
      const pos = this.playerPosition();
      ctx.save();
      const pulse = this.reducedMotion ? .8 : .55 + .45 * Math.sin(this.time * 10);
      ellipse(ctx, pos.x, pos.y, 68, 36, '#bd614624', COLORS.danger, 3 * pulse);
      ctx.beginPath();
      ctx.ellipse(pos.x, pos.y, 56, 30, 0, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(s.phaseStability, 0, 1));
      ctx.strokeStyle = COLORS.gold;
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (s.travel) return;

    // Draw crystal-clear numbered badges (① / ② / ③ / ④ / 🚪), causal energy wires, and role tags
    const order = s.mechanismOrder || s.nodes.filter(n => n.kind === 'mechanism').map(n => n.id);
    const mechTotal = order.length || 3;
    const numSymbols = ['①', '②', '③', '④'];
    const layerRoman = ['Ⅰ', 'Ⅱ', 'Ⅲ'];
    const guideId = stage >= 2 && this.nextStepHint?.tutorial && this.nextStepHint.action === 'move' ? this.nextStepHint.targetId : null;
    const guideAnchor = guideId && guideId !== s.node ? this.node(guideId) : null;
    const anchorBadgePos = guideAnchor?.anchor
      ? { x: guideAnchor.x, y: guideAnchor.y - (guideAnchor.id === 'relay' ? 76 : 66) }
      : null;

    // 2A. Draw explicit causal energy wires between mechanisms from Stage 2+
    if (stage >= 2) {
      for (const targetId of order) {
        const target = this.node(targetId);
        if (!target) continue;
        for (const sourceId of target.required || []) {
          const source = this.node(sourceId);
          if (!source) continue;
          const received = (target.received || []).includes(sourceId);
          const samePosition = Math.hypot(target.x - source.x, target.y - source.y) < 2;
          const ctrlX = samePosition ? source.x + 82 : (source.x + target.x) / 2;
          let ctrlY = samePosition ? source.y - 125 : Math.min(source.y, target.y) - 95;
          if (anchorBadgePos) {
            for (const sampleT of [.25, .5, .75]) {
              const qx = (1 - sampleT) ** 2 * source.x + 2 * (1 - sampleT) * sampleT * ctrlX + sampleT ** 2 * target.x;
              const qy = (1 - sampleT) ** 2 * (source.y - 36) + 2 * (1 - sampleT) * sampleT * ctrlY + sampleT ** 2 * (target.y - 36);
              if (Math.abs(qx - anchorBadgePos.x) < 62 / sScale && Math.abs(qy - anchorBadgePos.y) < 24 / sScale) {
                ctrlY -= 52 / sScale;
                break;
              }
            }
          }
          ctx.save();
          ctx.globalAlpha = received ? .85 : .42;
          ctx.setLineDash(received ? [] : [6, 6]);
          ctx.beginPath();
          ctx.moveTo(source.x, source.y - 36);
          ctx.quadraticCurveTo(ctrlX, ctrlY, target.x, target.y - 36);
          ctx.strokeStyle = received ? '#45c4a0' : '#fbbf24';
          ctx.lineWidth = received ? 2.6 : 1.8;
          ctx.stroke();
          ctx.setLineDash([]);
          // Animated energy pulse bead along the causal wire
          const t = this.reducedMotion ? .5 : ((this.time * (received ? .65 : .35)) % 1);
          const bx = (1 - t) ** 2 * source.x + 2 * (1 - t) * t * ctrlX + t ** 2 * target.x;
          const by = (1 - t) ** 2 * (source.y - 36) + 2 * (1 - t) * t * ctrlY + t ** 2 * (target.y - 36);
          diamond(ctx, bx, by, received ? 5 : 3.8, received ? '#b8f5dc' : '#fef3c7', received ? '#45c4a0' : '#fbbf24');
          ctx.restore();
        }
      }
    }

    // 2B. Focus = current guide target (reusing vstep's liveGuide target) + hover
    const primaryMechId = order.find(id => {
      const n = this.node(id);
      return n && n.powered && !s.activated.includes(id);
    });
    const primaryTarget = s.activated.length >= mechTotal ? this.node('exit') : (primaryMechId ? this.node(primaryMechId) : null);
    const focusNodeId = this.liveGuide?.node || primaryTarget?.id || null;
    const hoverId = this.hover;

    let hint = null;
    const pending = this.pendingLayerPrompt;
    if (pending && pending.targetLayer !== s.layer && (!pending.atNode || pending.atNode === s.node)) {
      hint = { layer: pending.targetLayer, here: true, kind: pending.kind || 'anchor' };
    }
    if (primaryTarget && s.node !== primaryTarget.id && (stage >= 2 || primaryTarget.present)) {
      const pos = this.playerPosition();
      const x1 = pos.x, y1 = pos.y - 14, x2 = primaryTarget.x, y2 = primaryTarget.y - 18;
      ctx.save();
      ctx.globalAlpha = .52;
      ctx.setLineDash([5, 7]);
      let bowed = false;
      if (anchorBadgePos) {
        const segDx = x2 - x1, segDy = y2 - y1;
        const segLenSq = segDx * segDx + segDy * segDy;
        if (segLenSq > 1) {
          const projT = clamp(((anchorBadgePos.x - x1) * segDx + (anchorBadgePos.y - y1) * segDy) / segLenSq);
          const nearX = x1 + segDx * projT, nearY = y1 + segDy * projT;
          if (Math.abs(nearX - anchorBadgePos.x) < 62 / sScale && Math.abs(nearY - anchorBadgePos.y) < 24 / sScale) {
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.quadraticCurveTo((x1 + x2) / 2, anchorBadgePos.y + 42 / sScale, x2, y2);
            ctx.strokeStyle = COLORS.lightGold;
            ctx.lineWidth = 2.2;
            ctx.stroke();
            bowed = true;
          }
        }
      }
      if (!bowed) line(ctx, x1, y1, x2, y2, COLORS.lightGold, 2.2);
      ctx.setLineDash([]);
      ctx.restore();
      if (!hint) {
        const plan = planLayerRoute(s, primaryTarget.id);
        if (plan?.shift) hint = { layer: plan.shift.layer, here: plan.walk.length === 0, at: this.node(plan.shift.at), kind: plan.shift.kind };
      }
    }

    // Draw animated directional chevrons UNDERNEATH badges/pills so paths never cut badge glyphs
    const g = this.liveGuide;
    if (g && g.kind === 'move') {
      const from = currentNode;
      const to = this.node(g.node);
      if (from && to) {
        const layerPalette = this.palette(g.layer);
        const rampEdge = s.edges?.find(e => e.open && e.ramp && ((e.from === from.id && e.to === to.id) || (e.to === from.id && e.from === to.id)));
        const ends = rampEdge
          ? this.rampEnds({ fromLayer: rampEdge.from === from.id ? rampEdge.fromLayer : rampEdge.toLayer, toLayer: rampEdge.from === from.id ? rampEdge.toLayer : rampEdge.fromLayer }, from, to)
          : { ax: from.x, ay: from.y, bx: to.x, by: to.y };
        ctx.save();
        const dx = ends.bx - ends.ax, dy = ends.by - ends.ay;
        const len = Math.max(1, Math.hypot(dx, dy));
        const ux = dx / len, uy = dy / len;
        const nx = -uy, ny = ux;
        for (let i = 0; i < 3; i++) {
          const t = this.reducedMotion ? (.28 + i * .22) : (((this.time * .55 + i / 3) % 1) * .68 + .16);
          const cx = mix(ends.ax, ends.bx, t);
          const cy = mix(ends.ay, ends.by, t);
          if (anchorBadgePos && Math.abs(cx - anchorBadgePos.x) < 58 / sScale && Math.abs(cy - anchorBadgePos.y) < 22 / sScale) continue;
          const alpha = Math.sin(clamp((t - .16) / .68, 0, 1) * Math.PI);
          ctx.globalAlpha = .45 + alpha * .55;
          path(ctx, [
            [cx - ux * 9 + nx * 8, cy - uy * 9 + ny * 8],
            [cx + ux * 7, cy + uy * 7],
            [cx - ux * 9 - nx * 8, cy - uy * 9 - ny * 8],
          ]);
          ctx.strokeStyle = g.aligned ? COLORS.lightGold : layerPalette.color;
          ctx.lineWidth = 3;
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    const explicitHint = this.isExplicitLayerHint();
    const waitingForShiftHere = !!(stage >= 2 && hint?.here);
    if (waitingForShiftHere) {
      const pos = this.playerPosition();
      const dirArrow = (s.layers?.[hint.layer]?.center ?? .5) > this.currentW() ? '▲' : '▼';
      const shiftPal = this.palette(hint.layer);
      const shiftAccent = explicitHint
        ? (this.astralMode ? (shiftPal.astralColor || shiftPal.color) : shiftPal.color)
        : (hint.kind === 'anomaly' ? '#fbbf24' : '#5eead4');
      const pulse = this.reducedMotion ? .7 : .5 + .5 * Math.sin(this.time * 5.2);
      ctx.save();
      ellipse(ctx, pos.x, pos.y, 62 + pulse * 8, 33 + pulse * 4, `${shiftAccent}1f`, shiftAccent, 2.4);
      ctx.restore();
      drawCompactBadge(
        pos.x,
        clearPlayerY(pos.y - 62, 14),
        explicitHint ? dirArrow : '⇅',
        hint.kind === 'anomaly' ? '#36240bee' : '#152b34ee',
        shiftAccent,
        explicitHint ? '#ffffff' : '#ccfbf1',
        { borderWidth: 2 }
      );
    }

    const drawNodeBadge = (id, cx, cy, badgeText, bgColor, borderColor, textColor, badgeOpts = {}) => {
      const y = id === s.node && cy < (playerPos?.y ?? -Infinity) ? clearPlayerY(cy, 13) : cy;
      drawCompactBadge(cx, y, badgeText, bgColor, borderColor, textColor, badgeOpts);
    };

    // 2C. Detect overlapping mechanisms so badges don't stack on the exact same pixel
    const seenCoords = new Map();
    order.forEach((id, idx) => {
      const node = this.node(id);
      if (!node) return;
      const isLit = s.activated.includes(id);
      const isPowered = node.powered && !isLit;
      const onCurrentLayer = node.layer === s.layer;
      if (!isLit && isPowered && !onCurrentLayer && stage < 2) return;
      if (!isLit && !isPowered && stage < 2) return;

      const coordKey = `${Math.round(node.x)},${Math.round(node.y)}`;
      const stackIdx = seenCoords.get(coordKey) || 0;
      seenCoords.set(coordKey, stackIdx + 1);
      const yOffset = stackIdx * (26 / sScale);
      const num = numSymbols[idx] || `${idx + 1}`;
      if (isLit) {
        drawNodeBadge(id, node.x, node.y - 70 - yOffset, `✓${num}`, '#133127dd', '#45c4a0', '#b8f5dc', { borderWidth: 2 });
      } else if (isPowered) {
        const isPrimary = primaryMechId === id;
        const pulse = this.reducedMotion ? .7 : .5 + .5 * Math.sin(this.time * 5);
        ctx.save();
        ellipse(ctx, node.x, node.y, (isPrimary ? 82 : 74) + pulse * 10, (isPrimary ? 44 : 40) + pulse * 5, '#dd9a1c24', COLORS.gold, isPrimary ? 3.4 : 2.4);
        ctx.restore();
        if (this.altarWindow?.node === id && s.node === id && !s.travel) return;
        const stackedLit = !onCurrentLayer && s.nodes.some(n =>
          !n.anchor && n.id !== id && s.activated.includes(n.id) && n.world && node.world &&
          Math.abs(n.world.x - node.world.x) < 1e-4 &&
          Math.abs(n.world.y - node.world.y) < 1e-4 &&
          Math.abs(n.world.z - node.world.z) < 1e-4);
        const nameLayer = explicitHint || stackedLit || (this.nextStepHint?.tutorial && this.nextStepHint.goalId === id);
        const targetPal = this.palette(node.layer);
        const targetAccent = this.astralMode ? (targetPal.astralColor || targetPal.color) : targetPal.color;
        const layerShiftY = (!onCurrentLayer && nameLayer) ? clamp((s.layer - node.layer) * 7, -14, 14) : 0;
        const badgeText = onCurrentLayer
          ? (isPrimary ? (stage === 1 ? '👆 ①' : `🎯 ${num}`) : num)
          : num;
        drawNodeBadge(
          id,
          node.x,
          node.y - 76 - yOffset + layerShiftY,
          badgeText,
          onCurrentLayer ? '#33230bee' : '#162532ee',
          onCurrentLayer ? '#fbbf24' : (nameLayer ? targetAccent : '#94a3b8'),
          onCurrentLayer ? '#fff7d6' : (nameLayer ? '#f8fafc' : '#cbd5e1'),
          onCurrentLayer ? { borderWidth: isPrimary ? 2 : 1.5 } : { dashed: true, borderWidth: 2 }
        );
      } else {
        drawNodeBadge(id, node.x, node.y - 70 - yOffset, `🔒${num}`, '#18242ccc', '#64748b', '#cbd5e1', { borderWidth: 1.5 });
      }
    });

    // 2D. Progressive visual rings & non-verbal spatial cues
    if (stage >= 2) {
      const anchorFocus = id => focusNodeId === id && hint?.at?.id === id;
      for (const anchorId of ['hub', 'relay']) {
        const anchorNode = this.node(anchorId);
        if (!anchorNode || s.node === anchorId) continue;
        if (guideAnchor?.id === anchorId || anchorFocus(anchorId)) {
          const pulse = this.reducedMotion ? .7 : .5 + .5 * Math.sin(this.time * 4.8);
          const rx = anchorId === 'hub' ? 84 : 68;
          const ry = anchorId === 'hub' ? 44 : 36;
          ctx.save();
          ellipse(ctx, anchorNode.x, anchorNode.y, rx + pulse * 8, ry + pulse * 4, '#2dd4bf20', '#5eead4', 2.4);
          ctx.restore();
        }
      }
      // Highlight 4D Same-XYZ Folding via translucent offset ghost rims (no text pill)
      if (currentNode && !currentNode.anchor && currentNode.world) {
        const sameSpots = s.nodes.filter(n => !n.anchor && n.id !== currentNode.id && n.world &&
          Math.abs(n.world.x - currentNode.world.x) < 1e-4 &&
          Math.abs(n.world.y - currentNode.world.y) < 1e-4 &&
          Math.abs(n.world.z - currentNode.world.z) < 1e-4);
        if (sameSpots.length) {
          ctx.save();
          for (const partner of sameSpots) {
            const pPal = this.palette(partner.layer);
            const pCol = this.astralMode ? (pPal.astralColor || pPal.color) : pPal.color;
            const dy = clamp((s.layer - partner.layer) * 10, -20, 20);
            ctx.setLineDash([6, 5]);
            ellipse(ctx, currentNode.x, currentNode.y + dy, 88, 46, `${pCol}16`, pCol, 2.2);
          }
          ctx.setLineDash([]);
          ctx.restore();
        }
      }
      // Highlight Phase-Swap Bridges (⇄) with pure symbol
      for (const edge of s.edges || []) {
        if (!edge.phaseSwap || !edge.open) continue;
        const fa = this.node(edge.from), fb = this.node(edge.to);
        if (!fa || !fb) continue;
        const mx = mix(fa.x, fb.x, .5), my = mix(fa.y, fb.y, .5);
        drawCompactBadge(mx, my - 22, '⇄', '#38250bdd', '#fbbf24', '#fff7d6');
      }
    }

    if (stage >= 3) {
      const vaultNode = this.node('vault');
      if (vaultNode && (!vaultNode.locked || stage >= 3)) {
        const vaultDone = s.vaultStatus === 'escaped';
        const vaultUnlocked = !vaultNode.locked && !vaultDone;
        if (vaultUnlocked) {
          const pulse = this.reducedMotion ? .7 : .5 + .5 * Math.sin(this.time * 4.6);
          ctx.save();
          ellipse(ctx, vaultNode.x, vaultNode.y, 70 + pulse * 8, 36 + pulse * 4, '#fbbf2422', '#fbbf24', 2.4);
          ctx.restore();
        }
        const vaultBadge = vaultDone ? '✓✨' : '✨';
        drawNodeBadge(
          'vault',
          vaultNode.x,
          vaultNode.y - 64,
          vaultBadge,
          vaultUnlocked ? '#38250bee' : '#2a2115cc',
          vaultUnlocked ? '#fbbf24' : '#c09048',
          vaultUnlocked ? '#fff7d6' : '#f5deb3'
        );
      }

      // Dormant Flower Bridge visual hook
      if (s.resonance?.edge && (s.resonance.stage || 0) < 3) {
        const fa = this.node(s.resonance.edge.from), fb = this.node(s.resonance.edge.to);
        if (fa && fb) {
          const mx = mix(fa.x, fb.x, .5), my = mix(fa.y, fb.y, .5);
          const pulse = this.reducedMotion ? .7 : .5 + .5 * Math.sin(this.time * 3.8);
          ctx.save();
          ellipse(ctx, mx, my - 4, 22 + pulse * 6, 12 + pulse * 3, '#348d7025', '#45c4a0', 1.8);
          diamond(ctx, mx, my - 6, 7, '#fef3c7', '#f59e0b');
          ctx.restore();
          drawCompactBadge(mx, my - 28, '🌺', '#162d26dd', '#45c4a0', '#d1fae5');
        }
      }
    }

    if (stage >= 4) {
      // Hidden Astral Shrine (Rift) visual hook
      const riftNode = this.node('rift');
      if (riftNode) {
        const eligibleRoute = (s.hiddenRoutes || []).find(r => r.eligible && !r.unlocked);
        const pulse = this.reducedMotion ? .7 : .5 + .5 * Math.sin(this.time * 3.4);
        ctx.save();
        ellipse(ctx, riftNode.x, riftNode.y - 12, 62 + pulse * 8, 32 + pulse * 4, '#8563b322', '#a78bfa', 1.8);
        ctx.restore();
        if (!riftNode.locked) {
          drawNodeBadge('rift', riftNode.x, riftNode.y - 72, '🌌', '#281840ee', '#c084fc', '#f3e8ff');
        } else if (eligibleRoute) {
          drawNodeBadge('rift', riftNode.x, riftNode.y - 72, '🔮', '#2e1a47ee', '#c084fc', '#f3e8ff');
        } else {
          drawNodeBadge('rift', riftNode.x, riftNode.y - 70, '🌌', '#1f1630cc', '#8b5cf6', '#ddd6fe');
        }
      }
    }

    // 2E. 4D Inter-Slice Curiosities / Anomalies (Unlocked from Stage 2+)
    if (stage >= 2) {
      const anomalies = this.explorationRadar.visibleAnomalies(s);
      for (const item of anomalies) {
        if (item.collected) continue;
        const itemPalette = this.palette(item.layer);
        const itemColor = this.astralMode ? (itemPalette.astralColor || itemPalette.color) : itemPalette.color;
        const isHovered = this.hoverAnomaly === item.id;
        const pulse = this.reducedMotion ? .7 : .5 + .5 * Math.sin(this.time * 4.5 + item.x);
        const proj = projectPolytope4D(item.polytope, {
          w: this.currentW(),
          time: this.reducedMotion ? 0 : this.time * 1.4,
          radius: item.materialized ? (isHovered ? 27 : 24) : (isHovered ? 19 : 16),
        });
        ctx.save();
        ctx.translate(item.x, item.y);
        if (isHovered) {
          ellipse(ctx, 0, 0, 44, 25, item.materialized ? '#fbbf2420' : `${itemColor}1c`, item.materialized ? '#fde68a' : itemColor, 2);
        }
        if (item.materialized) {
          ellipse(ctx, 0, 0, 34 + pulse * 7, 20 + pulse * 4, '#fbbf2428', '#fbbf24', 2.2);
          ellipse(ctx, 0, 0, 22, 12, null, itemPalette.glow, 1.4);
          for (const [aIdx, bIdx] of proj.edges) {
            const a = proj.vertices[aIdx], b = proj.vertices[bIdx];
            ctx.globalAlpha = .82;
            line(ctx, a.x, a.y, b.x, b.y, '#fbbf24', 1.6);
          }
          diamond(ctx, 0, 0, 6 + pulse * 2, '#fffbeb', '#f59e0b');
          ctx.restore();
          drawCompactBadge(item.x, item.y - 34, `✦+${item.bonus}`, '#3b2609f2', '#fbbf24', '#fffbeb');
        } else {
          ctx.globalAlpha = (isHovered ? .82 : .55) + pulse * .22;
          ctx.setLineDash([4, 5]);
          ellipse(ctx, 0, 0, 26 + pulse * 5, 15 + pulse * 3, null, itemColor, isHovered ? 2.1 : 1.6);
          ctx.setLineDash([]);
          for (const [aIdx, bIdx] of proj.edges) {
            const a = proj.vertices[aIdx], b = proj.vertices[bIdx];
            ctx.globalAlpha = isHovered ? .55 : .36;
            line(ctx, a.x, a.y, b.x, b.y, itemColor, 1.15);
          }
          diamond(ctx, 0, 0, 4.4, itemPalette.glow, itemColor);
          ctx.restore();
          drawCompactBadge(item.x, item.y - 30, '◌', '#16222ecc', itemColor, '#e2e8f0');
        }
      }
    }

    const exitNode = this.node('exit');
    if (exitNode && s.activated.length >= mechTotal) {
      const pulse = this.reducedMotion ? .7 : .5 + .5 * Math.sin(this.time * 5);
      ctx.save();
      ellipse(ctx, exitNode.x, exitNode.y, 82 + pulse * 10, 44 + pulse * 5, '#45c4a028', '#45c4a0', 3.2);
      ctx.restore();
    }
  }

  drawWStack() {
    const ctx = this.ctx, s = this.state;
    if (!s.layers?.length) return;
    ctx.save(); ctx.translate(62, 88);
    const miniScale = clamp(.45 / this.scale, 1, 1.2);
    ctx.scale(miniScale, miniScale);
    const corners = WSTACK_CORNERS;
    const at = (point, layer) => ({ x: 63 + (point.x - 500) * .105, y: 24 + (point.y - 340) * .06 + (2 - layer) * 29 });
    const danger = s.wave?.dangerLayers || (s.wave ? [s.wave.layer] : []);
    const activePreview = this.isHyperLensActive() ? this.hyperLens.snappedLayer : (this.hoverWLayer ?? this.previewLayer);
    for (let i = 0; i < s.layers.length; i++) {
      const pal = this.palette(i);
      const baseColor = this.astralMode ? (pal.astralColor || pal.color) : pal.color;
      const y = (2 - i) * 29, color = danger.includes(i) ? COLORS.danger : baseColor;
      const isPreview = activePreview === i && i !== s.layer;
      ctx.globalAlpha = i === s.layer ? .92 : isPreview ? .78 : (this.astralMode ? .48 : .36);
      path(ctx, corners.map(([x, cy]) => [x, cy + y]));
      ctx.fillStyle = this.astralMode ? (pal.astralPlane || '#162d3d99') : pal.pale; ctx.fill(); ctx.strokeStyle = isPreview ? '#fef08a' : color;
      ctx.lineWidth = danger.includes(i) ? 2.5 : i === s.layer ? 2.2 : isPreview ? 1.8 : 1; ctx.stroke();
      // Actual mirrored room geometry appears on each W plane, including its bridges.
      for (const edge of this.connections().filter(edge => edge.layer === i && edge.open)) {
        const a = at(edge.a, i), b = at(edge.b, i);
        const grown = ['weave', 'resonance', 'secret', 'ascension'].includes(edge.kind);
        line(ctx, a.x, a.y, b.x, b.y, grown ? this.bridgeColor(edge) : color, grown ? 2.3 : (isPreview ? 1.15 : .75));
        if (grown) diamond(ctx, mix(a.x, b.x, .5), mix(a.y, b.y, .5), 2.7, this.bridgeColor(edge));
      }
      for (const node of s.nodes.filter(node => node.anchor || node.layer === i)) {
        const point = at(node, i);
        if (node.id === 'rift') {
          diamond(ctx, point.x, point.y, node.locked ? 2.6 : 4, node.locked ? null : pal.glow,
            s.rift?.ascension ? COLORS.ascension : COLORS.secret);
          continue;
        }
        ellipse(ctx, point.x, point.y, node.anchor ? 2 : 2.6, node.anchor ? 1.3 : 2.6,
          node.anchor || s.activated.includes(node.id) ? color : (this.astralMode ? '#142736' : pal.pale), color, .8);
        if (s.coilArmed?.includes(node.id) && node.layer === i) this.drawCoilMark(point.x, point.y, 5, COLORS.coil);
        if (s.woven?.some(item => item.node === node.id) && node.layer === i) diamond(ctx, point.x, point.y - 4, 3, COLORS.weave, '#ffffff');
      }
      const player = at(this.playerPosition(), i);
      if (i === s.layer) { ctx.globalAlpha = 1; diamond(ctx, player.x, player.y, 5, color, '#ffffff'); }
      ctx.globalAlpha = .85;
      for (let dot = 0; dot <= i; dot++) ellipse(ctx, 140 + dot * 7, 22 + y, 2, 2, color);
      if (this.visualGuide) {
        // Relative to the current layer: wheel up climbs towards Ⅲ (drawn on top).
        const dirHint = `${['Ⅰ', 'Ⅱ', 'Ⅲ'][i]}${i > s.layer ? ' ▲' : i < s.layer ? ' ▼' : ' ●'}`;
        const isPrompted = this.isExplicitLayerHint() && this.pendingLayerPrompt?.targetLayer === i && s.layer !== i;
        ctx.font = `${i === s.layer || isPrompted || isPreview ? 700 : 500} 9px system-ui, sans-serif`;
        ctx.textAlign = 'left';
        ctx.fillStyle = isPrompted ? (this.astralMode ? '#ffd86b' : COLORS.gold) : isPreview ? '#fef08a' : color;
        ctx.fillText(dirHint, 162, 25 + y);
      }
      if (danger.includes(i)) {
        line(ctx, 132, 14 + y, 158, 32 + y, COLORS.danger, 1.7);
        line(ctx, 132, 32 + y, 158, 14 + y, COLORS.danger, 1.7);
      } else if (s.wave?.safeLayers?.includes(i)) ellipse(ctx, 146, 23 + y, 19, 12, null, '#299c80', 1.7);
    }
    for (const edge of this.connections().filter(edge => edge.ramp && edge.open)) {
      const a = at(edge.a, edge.fromLayer), b = at(edge.b, edge.toLayer);
      ctx.globalAlpha = .72;
      line(ctx, a.x, a.y, b.x, b.y, this.palette(edge.toLayer).color, 1.5);
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
    ctx.globalAlpha = .82;
    const w = this.currentW();
    const cutY = 58 * (1 - w);
    ctx.setLineDash([4, 3]);
    path(ctx, corners.map(([x, y]) => [x, y + cutY]));
    ctx.strokeStyle = this.astralMode ? (this.palette().astralColor || '#69d8ee') : this.palette().color;
    ctx.lineWidth = 1.3; ctx.stroke(); ctx.setLineDash([]);
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
    } else if (wave.variant === 'sanctum') {
      ellipse(ctx, 0, -6, 118, 64, null, '#fbbf2499', 2.2);
      for (let q = 0; q < 4; q++) {
        const a = q * Math.PI / 2 + (this.reducedMotion ? .3 : this.time * .9);
        diamond(ctx, Math.cos(a) * 118, Math.sin(a) * 64 - 6, 5.5, '#fef3c7', '#f59e0b');
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
    ctx.textAlign = 'center';
    ctx.fillStyle = this.astralMode
      ? (safe ? '#6ef5cb' : '#ff8e72')
      : (safe ? '#247b65' : '#9f4938');
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
    const narrow = this.isCompactPortrait(), follow = cue.beat === 'follow' || cue.beat === 'mechanism-follow';
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
    const stage = this.onboardingStage ?? 4;
    const reachable = new Set(this.momentumNode() ? [] : reachablePlatforms(s));
    const missing = new Set(missingSupplySources(s).map(node => node.id));
    const pulse = this.reducedMotion ? .65 : .5 + .5 * Math.sin(this.time * 3);
    for (const node of s.nodes) {
      if (stage < 2 && !node.present) continue;
      if (stage < 3 && node.id === 'vault' && node.locked) continue;
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
      if (waiting && !this.visualGuide) {
        ctx.save(); ctx.fillStyle = color; ctx.textAlign = 'center';
        ctx.font = `500 ${clamp(11 / this.scale, 16, 38)}px system-ui, sans-serif`;
        ctx.fillText(`${node.name} · ${s.layers[node.layer].name}`, node.x, node.y - 108);
        ctx.restore();
      }
    }
  }

  drawIsland(node) {
    const ctx = this.ctx, s = this.state;
    const stage = this.onboardingStage ?? 4;
    if (node.kind === 'ferry') { toys.drawFerrySkiff(this, node); return; }
    if (stage < 3 && node.id === 'vault' && node.locked) return;
    if (node.id === 'rift' && node.locked) {
      if (stage >= 3) this.drawRiftSilhouette(node);
      return;
    }
    if (node.id === 'bloom' && this.node('crown')?.anchor) return;
    const hub = node.id === 'hub', exit = node.id === 'exit';
    const rawScale = this.wTween
      ? this.sectionAt(node.center ?? node.world?.w ?? s.layers?.[node.layer]?.center ?? s.w) * (this.wrapAlpha ?? 1)
      : node.scale;
    const section = node.anchor ? 1 : clamp(rawScale);
    if (exit && section <= .08) {
      this.drawExitSilhouette(node);
      return;
    }
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
    const nodePunch = this.feel?.value(`node:${node.id}`) || 0;
    if (nodePunch) { ctx.translate(0, 60); ctx.scale(1 + nodePunch * .5, 1 - nodePunch); ctx.translate(0, -60); }
    ctx.globalAlpha = node.anchor ? 1 : clamp(.15 + section * .85);
    if (node.anchor) {
      // An anchored column spans the W stack; its top remains solid while slices change.
      path(ctx, [[-width * .52, 9], [-width * .4, 81], [0, 104], [width * .4, 81], [width * .52, 9]]);
      ctx.fillStyle = this.astralMode ? '#18314285' : '#9db5a14a'; ctx.fill();
      for (let i = 0; i < 3; i++) {
        const ringColor = this.astralMode ? (this.palette(i).astralColor || this.palette(i).color) : this.palette(i).color;
        ellipse(ctx, 0, 40 + i * 22, width * (.49 - i * .05), 19 - i * 2, null, ringColor + '78', 1.5);
      }
      for (const side of [-1, 1]) line(ctx, side * width * .5, 10, side * width * .4, 81, this.astralMode ? '#2f587080' : '#96aa9270', 1);
    }
    ellipse(ctx, 4, 57, width * 1.1, height * .62, this.astralMode ? '#040a1048' : '#3f756712');
    ellipse(ctx, 4, 51, width * .8, height * .42, this.astralMode ? '#050d1538' : '#34655212');
    if (selected || this.hover === node.id) {
      const accent = this.astralMode ? (palette.astralColor || palette.color) : '#24968d';
      ellipse(ctx, 0, 2, width + 12, height + 8, selected ? '#d7994318' : `${accent}14`, selected ? '#f0b85a98' : `${accent}70`, 1.8);
      if (this.hover === node.id && !s.travel) {
        const spin = this.reducedMotion ? .2 : this.time * .7;
        ctx.save();
        ctx.strokeStyle = selected ? '#f7ca6d' : accent;
        ctx.lineWidth = 2;
        for (let q = 0; q < 4; q++) {
          const a0 = spin + q * (Math.PI / 2) + .22;
          ctx.beginPath();
          ctx.ellipse(0, 2, width + 18, height + 12, 0, a0, a0 + .34);
          ctx.stroke();
        }
        ctx.restore();
      }
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
      ctx.fillStyle = this.astralMode
        ? (i % 2 ? (palette.astralSide || '#183040') : '#132534')
        : (i % 2 ? palette.side : '#b8c6b2');
      ctx.fill();
      line(ctx, p[0], p[1] + 2, p[0] * .85, p[1] + thickness, this.astralMode ? '#2f587070' : '#7fa28e70', 1);
    }
    path(ctx, points); ctx.fillStyle = this.astralMode ? (palette.astralStone || '#1f384a') : palette.stone; ctx.fill();
    ctx.strokeStyle = this.astralMode ? `${palette.astralColor || palette.color}88` : '#faffee'; ctx.lineWidth = 2; ctx.stroke();
    path(ctx, points.map(([x, y]) => [x * .89, y * .84]));
    ctx.strokeStyle = this.astralMode ? '#2a4a62' : '#c4d0b7'; ctx.lineWidth = 1; ctx.stroke();
    // Small paving seams, moss, and botanics preserve a crafted garden character.
    const seamColor = this.astralMode ? '#2a4b6366' : '#bdccb257';
    line(ctx, -width * .9, 5, width * .89, 5, seamColor, 1);
    line(ctx, -width * .45, -height * .8, -width * .33, height * .85, seamColor, 1);
    line(ctx, width * .4, -height * .77, width * .32, height * .8, seamColor, 1);
    for (let i = 0; i < 5; i++) {
      const angle = i * 1.39 + (hub ? .3 : 1);
      const x = Math.cos(angle) * width * .77, y = Math.sin(angle) * height * .7;
      ellipse(ctx, x, y, 11 + hash(i + node.x) * 10, 4, this.astralMode ? '#296c5d42' : '#6da48440');
      this.drawPlant(x, y, active, i + node.x, `sway:${node.id}:${i}`, node.x + x * section, node.y + y * section);
    }
    // The rim belongs to this W section, making the same XYZ visibly change material.
    const rimAccent = this.astralMode ? (palette.astralColor || palette.color) : palette.color;
    ellipse(ctx, 0, 1, width * .82, height * .76, null, rimAccent + '68', 1.5);
    this.drawGardenGrowth(node, width, height);
    this.drawAscendedArchitecture(node, width);
    if (hub) this.drawHub();
    else if (exit) this.drawGate(node);
    else if (node.id === 'relay') this.drawAnchor();
    else if (node.id === 'vault') this.drawVault(node);
    else if (node.id === 'rift') this.drawRift(node);
    else { this.drawMechanism(node, active, section); this.drawInputSlots(node); }
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
    const isHovered = this.hover === node.id;
    const isTargetAnchor = Boolean(
      node.anchor &&
      stage >= 2 &&
      !s.travel &&
      s.node !== node.id &&
      (
        (this.nextStepHint?.action === 'move' && this.nextStepHint.targetId === node.id) ||
        (!this.nextStepHint && this.liveGuide?.kind === 'move' && this.liveGuide.node === node.id)
      )
    );
    const shortAnchor = node.id === 'hub' ? '归响'
      : node.id === 'relay' ? '维度'
      : node.id === 'vault' ? '花匣'
      : node.id === 'ferry' ? '星舟'
      : '去';
    const anchorTitle = hub && stage < 2
      ? '⚓ 起点'
      : (isTargetAnchor ? `⚓ ${shortAnchor}` : '⚓');
    let name = '';
    if (exit) name = '🚪';
    else if (node.anchor) name = anchorTitle;
    else if (node.id === 'vault' && !this.visualGuide) name = '✨';
    else if (node.id === 'rift' && !this.visualGuide) name = '🌌';
    if (!name) { ctx.restore(); return; }
    const sScale = Math.max(.25, this.scale || 1);
    const labelSize = 12.5 / sScale;
    const labelHeight = labelSize + 8 / sScale;
    const padX = 7 / sScale;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `${isTargetAnchor ? 700 : (isHovered || selected ? 600 : 500)} ${labelSize}px system-ui, -apple-system, sans-serif`;
    const textWidth = ctx.measureText(name).width;
    const loX = textWidth / 2 + padX + 4 - node.x;
    const hiX = WORLD_W - textWidth / 2 - padX - 4 - node.x;
    const labelX = clamp(0, Math.min(loX, hiX), Math.max(loX, hiX));
    const labelY = Math.min((height + thickness) * section + 8 + labelHeight / 2, WORLD_H - node.y - labelHeight / 2 - 4);
    ctx.fillStyle = isTargetAnchor
      ? (this.astralMode ? '#33230bee' : '#fffaf0ee')
      : (this.astralMode ? '#0c1925eb' : '#edf2e9dd');
    this.labelZones?.push({ left: node.x + labelX - textWidth / 2 - padX, right: node.x + labelX + textWidth / 2 + padX, top: node.y + labelY - labelHeight / 2, bottom: node.y + labelY + labelHeight / 2 });
    ctx.beginPath(); ctx.roundRect?.(labelX - textWidth / 2 - padX, labelY - labelHeight / 2, textWidth + padX * 2, labelHeight, 6 / sScale);
    if (!ctx.roundRect) ctx.rect(labelX - textWidth / 2 - padX, labelY - labelHeight / 2, textWidth + padX * 2, labelHeight);
    ctx.fill();
    if (isTargetAnchor || this.astralMode || isHovered) {
      ctx.strokeStyle = isTargetAnchor
        ? (this.astralMode ? '#fbbf24' : '#d89a2b')
        : (selected || isHovered ? '#f0b85aa8' : '#2c5068b8');
      ctx.lineWidth = (isTargetAnchor ? 1.8 : 1.2) / sScale;
      ctx.stroke();
    }
    ctx.fillStyle = isTargetAnchor
      ? (this.astralMode ? '#fff7d6' : '#6e450c')
      : (this.astralMode
        ? (selected || isHovered ? '#ffd982' : '#e8f6f2')
        : (selected || isHovered ? '#936125' : COLORS.ink));
    ctx.fillText(name, labelX, labelY);
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
    const sway = this.life ? this.life.swayAngle(`growth:${node.id}`, node.x, node.y) : 0;
    if (sway) ctx.rotate(sway * .4);
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

  drawPlant(x, y, active, seed, swayKey, swayX, swayY) {
    const ctx = this.ctx;
    const sway = swayKey && this.life ? this.life.swayAngle(swayKey, swayX ?? x, swayY ?? y) : 0;
    ctx.save(); ctx.translate(x, y);
    if (sway) ctx.rotate(sway);
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
    if (this.astralMode) {
      ellipse(ctx, 0, 0, 64, 35, '#193243', '#49829c', 2);
      ellipse(ctx, 0, -2, 57, 29, '#213f52', '#396b82', 1);
      ellipse(ctx, 0, -3, 40, 21, '#1a394b', '#4d92a8', 1);
    } else {
      ellipse(ctx, 0, 0, 64, 35, '#b9cdb9', '#eff6df', 2);
      ellipse(ctx, 0, -2, 57, 29, '#dce5d0', '#a8c4ac', 1);
      ellipse(ctx, 0, -3, 40, 21, '#d0e2cf', '#8cb5a0', 1);
    }
    for (let i = 0; i < 12; i++) {
      const angle = i * TAU / 12;
      line(ctx, Math.cos(angle) * 45, Math.sin(angle) * 24 - 2, Math.cos(angle) * 51, Math.sin(angle) * 27 - 2, this.astralMode ? '#6cc7d8' : '#699a84', i % 3 === 0 ? 2 : 1);
    }
    diamond(ctx, 0, -3, 14, this.astralMode ? '#377d8f' : '#a8cebb', this.astralMode ? '#7fe2ee' : '#779c87');
    toys.drawDialBead(this);
    if (s.banked > 0) {
      const stacks = Math.min(7, Math.ceil(s.banked / 3));
      for (let i = 0; i < stacks; i++) diamond(ctx, -49 + i * 16, 30 - (i % 2) * 3, 4, '#e3bd65', '#c19642');
    }
  }

  drawAnchor() {
    const ctx = this.ctx;
    ellipse(ctx, 0, 4, 39, 21, this.astralMode ? '#1a3345' : '#d0dbc5', this.astralMode ? '#4a859f' : '#f7f7df', 2);
    path(ctx, [[-11, 3], [-11, -48], [0, -57], [12, -48], [12, 3], [0, 10]]);
    ctx.fillStyle = this.astralMode ? '#224257' : '#c5d6c2'; ctx.fill();
    ctx.strokeStyle = this.astralMode ? '#5596b0' : '#90aa94'; ctx.lineWidth = 1.5; ctx.stroke();
    line(ctx, 0, -56, 0, 8, this.astralMode ? '#9be8f5' : '#f9fff0', 2);
    for (let i = 0; i < 3; i++) {
      const ringColor = this.astralMode ? (this.palette(i).astralColor || this.palette(i).color) : this.palette(i).color;
      ellipse(ctx, 0, -7 - i * 18, 27 - i * 3, 12, null, ringColor, i === this.state.layer ? 3 : 1.3);
      diamond(ctx, 27 - i * 3, -7 - i * 18, 3.2, this.palette(i).glow, ringColor);
    }
    const topColor = this.astralMode ? (this.palette().astralColor || this.palette().color) : this.palette().color;
    diamond(ctx, 0, -65, 6, this.palette().glow, topColor);
  }

  drawVault(node) {
    const ctx = this.ctx, palette = this.palette(node.layer);
    const accent = this.astralMode ? (palette.astralColor || palette.color) : palette.color;
    ellipse(ctx, 0, 3, 43, 22, this.astralMode ? '#182b3a' : '#c8cbb4', this.astralMode ? '#4a7f96' : '#f1eed7', 2);
    const visibility = clamp(node.chestVisibility ?? (this.state.layer === node.layer ? 1 : 0));
    if (visibility <= .01) {
      ctx.save(); ctx.globalAlpha = this.astralMode ? .34 : .2; ctx.setLineDash([3, 5]);
      path(ctx, [[-27, 0], [-27, -25], [0, -39], [28, -25], [28, 0], [0, 15]]);
      ctx.strokeStyle = accent; ctx.lineWidth = 1.2; ctx.stroke(); ctx.restore();
      return;
    }
    ctx.save(); ctx.scale(visibility, visibility);
    ctx.globalAlpha = .2 + visibility * .8;
    const open = this.state.vaultStatus === 'escaped';
    path(ctx, [[-29, -8], [0, 5], [29, -8], [29, 7], [0, 21], [-29, 7]]);
    ctx.fillStyle = this.astralMode ? '#1b2c3d' : palette.side; ctx.fill(); ctx.strokeStyle = accent; ctx.stroke();
    path(ctx, [[-29, -8], [-22, -28 - (open ? 17 : 0)], [0, -36 - (open ? 17 : 0)], [22, -28 - (open ? 17 : 0)], [29, -8], [0, 5]]);
    ctx.fillStyle = this.astralMode ? (open ? '#453517' : '#243a4d') : (open ? '#efe3b5' : palette.pale); ctx.fill(); ctx.strokeStyle = open && this.astralMode ? '#f5c465' : accent; ctx.lineWidth = 1.5; ctx.stroke();
    diamond(ctx, 0, -9, 11, node.locked ? (this.astralMode ? '#3b4a59' : '#a8a298') : (this.astralMode ? '#ffd670' : '#edd295'), this.astralMode ? '#f59e0b' : '#9a814d');
    if (this.state.wave) {
      line(ctx, -21, -22, 0, -6, COLORS.danger, 2); line(ctx, 0, -6, 21, -22, COLORS.danger, 2);
    }
    ctx.restore();
  }

  drawMechanism(node, active, section = 1) {
    const ctx = this.ctx;
    const sway = this.life ? this.life.swayAngle(`mech:${node.id}`, node.x, node.y) : 0;
    ctx.save();
    if (sway) ctx.rotate(sway * .18);
    const beat = this.reducedMotion ? 0 : Math.sin(this.time * 2.5 + node.x) * 1.5;
    const astral = this.astralMode;
    const sScale = Math.max(.25, this.scale || 1);
    const sw2 = 2 / (sScale * Math.max(.35, section));
    if (node.id === 'dew') {
      const unlitStroke = 'rgba(90, 212, 234, 0.8)';
      ellipse(ctx, 0, 4, 37, 21, astral ? '#152d3c' : '#a4bca8', astral ? '#498ba3' : '#f2f5e1', 2);
      ellipse(
        ctx, 0, 0, 32, 17,
        active ? (astral ? '#1d6c68' : '#51aaa0') : (astral ? '#142634' : '#9ebdb0'),
        active ? (astral ? '#4dd2ac' : '#7c9e8d') : (astral ? unlitStroke : '#7c9e8d'),
        !active && astral ? sw2 : 1.5
      );
      ellipse(ctx, 0, -1, 24, 11, null, active ? '#9ef5e0' : (astral ? '#5ad4ea66' : '#c7d7c3'), 1);
      ellipse(ctx, 0, -1, 14, 6, null, active ? '#b8fff0' : (astral ? '#5ad4ea44' : '#bed1bd'), 1);
      for (const x of [-25, 25]) {
        path(ctx, [[x - 5, 0], [x - 5, -26], [x + 5, -29], [x + 6, -2]]);
        ctx.fillStyle = astral ? '#1f3e50' : '#aec1a8'; ctx.fill();
        if (astral) { ctx.strokeStyle = '#5ad4ea88'; ctx.lineWidth = 1; ctx.stroke(); }
        diamond(ctx, x, -29, 4, active ? COLORS.lightGold : (astral ? null : '#d7d9b5'), astral ? '#72e5f2cc' : '#a4a37e', !active && astral ? 1.4 / (sScale * Math.max(.35, section)) : 1.5);
      }
      if (!active && astral) {
        diamond(ctx, 0, -25, 14, null, unlitStroke, sw2);
      } else {
        diamond(ctx, 0, -25 + (active ? beat : 0), 14, active ? '#9cebd5' : '#a3bcae', active ? '#63f2d2' : '#509c89');
        path(ctx, [[0, -39 + (active ? beat : 0)], [0, -11 + (active ? beat : 0)], [-9.2, -25 + (active ? beat : 0)]]);
        ctx.fillStyle = active ? '#d7ffe8' : '#d0ddc9'; ctx.fill();
      }
      if (active) ellipse(ctx, 0, -25 + beat, 23, 23, astral ? '#4dd2ac38' : '#a9f7db12');
    } else if (node.id === 'bell') {
      ellipse(ctx, 0, 8, 36, 16, astral ? '#1c2338' : '#cad6be', astral ? '#7e6dbe' : '#f2f5df', 2);
      for (const x of [-28, 28]) {
        path(ctx, [[x - 5, 8], [x - 5, -48], [x + 5, -48], [x + 5, 8]]);
        ctx.fillStyle = astral ? '#26304a' : '#a3b8a0'; ctx.fill();
        line(ctx, x - 4, -47, x - 4, 5, astral ? '#9b88db' : '#f1f4dc', 1.5);
      }
      path(ctx, [[-36, -47], [-30, -55], [32, -55], [37, -47]]);
      ctx.fillStyle = astral ? '#332b4f' : '#d9d7b0'; ctx.fill(); ctx.strokeStyle = astral ? '#ae94ee' : '#b5b992'; ctx.stroke();
      line(ctx, 0, -49, 0, -35, astral ? '#d6b065' : '#aa8953', 2);
      ctx.save(); ctx.translate(0, -36); ctx.rotate(active && !this.reducedMotion ? Math.sin(this.time * 2.7) * .07 : 0);
      ctx.beginPath(); ctx.moveTo(-5, 0); ctx.quadraticCurveTo(-18, 5, -18, 24); ctx.lineTo(-22, 28);
      ctx.quadraticCurveTo(0, 35, 22, 28); ctx.lineTo(18, 24); ctx.quadraticCurveTo(18, 5, 5, 0); ctx.closePath();
      ctx.fillStyle = active ? '#e5bd68' : (astral ? '#3b3559' : '#b8bb91'); ctx.fill();
      ctx.strokeStyle = active ? '#ffe29a' : (astral ? 'rgba(190, 156, 248, 0.8)' : '#9f8c59');
      ctx.lineWidth = !active && astral ? sw2 : 1.5;
      ctx.stroke();
      line(ctx, -10, 8, -13, 22, active ? '#fff0b5' : (astral ? '#c8b4fa' : '#dde0b4'), 2);
      ellipse(ctx, 0, 30, 3.8, 3.8, active ? '#fbefad' : (astral ? '#be9cf8cc' : '#a09f78')); ctx.restore();
      if (active) {
        for (const side of [-1, 1]) {
          ctx.beginPath(); ctx.ellipse(side * 28, -20, 7, 13, 0, side > 0 ? -1.1 : Math.PI - 1.1, side > 0 ? 1.1 : Math.PI + 1.1);
          ctx.strokeStyle = astral ? '#ffd982aa' : '#c49e5080'; ctx.lineWidth = 1.2; ctx.stroke();
        }
      }
    } else if (node.id === 'crown') {
      // 4-spire Sanctum Crown (Room 5 Finale mechanism ④)
      ellipse(ctx, 0, 5, 40, 19, astral ? '#28223d' : '#d2d4b4', astral ? '#fbbf24' : '#f7f5dc', 2);
      ellipse(ctx, 0, 1, 31, 14, active ? (astral ? '#423015' : '#ead493') : (astral ? '#1d273c' : '#b8c7af'), active ? '#fbbf24' : (astral ? '#7c6dc4' : '#8da58e'), 1.5);
      const spires = [[-26, -3], [26, -3], [-13, -8], [13, -8]];
      spires.forEach(([sx, sy], idx) => {
        const tall = idx >= 2 ? 44 : 33;
        path(ctx, [[sx - 5, sy], [sx - 2.5, sy - tall], [sx, sy - tall - 8], [sx + 2.5, sy - tall], [sx + 5, sy]]);
        ctx.fillStyle = active
          ? (idx >= 2 ? '#f3ca68' : '#dfaf49')
          : (astral ? '#2a3452' : '#b2c2a8');
        ctx.fill();
        ctx.strokeStyle = active ? '#fff3c4' : (astral ? '#8e7ce0' : '#8aa086');
        ctx.lineWidth = 1.2;
        ctx.stroke();
        diamond(ctx, sx, sy - tall - 10, 3.6, active ? '#fffbeb' : (astral ? '#c4b5fd' : '#e4e8cf'), active ? '#f59e0b' : '#7c8f79');
      });
      const spin = this.reducedMotion ? .35 : this.time * 1.35;
      const hoverY = -36 + (active ? beat * 1.4 : 0);
      if (active) {
        ellipse(ctx, 0, hoverY, 27, 15, '#fbbf2424', '#fde68a', 1.6);
        ellipse(ctx, 0, hoverY, 18, 28, null, astral ? '#5eead4aa' : '#45c4a099', 1.3);
      }
      ctx.save();
      ctx.translate(0, hoverY);
      ctx.rotate(active ? spin * .35 : .2);
      diamond(ctx, 0, 0, active ? 15 : 12, active ? '#fef3c7' : (astral ? '#3b3363' : '#cad6bc'), active ? '#f59e0b' : (astral ? '#a78bfa' : '#7a9480'));
      ctx.rotate(Math.PI / 4);
      diamond(ctx, 0, 0, active ? 11 : 8.5, active ? '#9ef5e0' : (astral ? '#274a5e' : '#dce6cf'), active ? '#2dd4bf' : '#5f8f84');
      ctx.restore();
      if (active) {
        for (let i = 0; i < 4; i++) {
          const a = spin + i * TAU / 4;
          diamond(ctx, Math.cos(a) * 34, hoverY + Math.sin(a) * 14, 3, '#fffbeb', '#fbbf24');
        }
      }
    } else {
      const unlitBloomStroke = 'rgba(245, 196, 101, 0.7)';
      ellipse(ctx, 0, 5, 37, 17, astral ? '#23241c' : '#c0d2b5', astral ? '#9c8040' : '#f5f5de', 2);
      for (let i = 0; i < 7; i++) {
        const angle = i * TAU / 7 - Math.PI / 2;
        const radius = active ? 22 : 10;
        const px = Math.cos(angle) * radius, py = -17 + Math.sin(angle) * radius * .7;
        ctx.save(); ctx.translate(px, py); ctx.rotate(angle + Math.PI / 2);
        ctx.beginPath(); ctx.moveTo(0, 13); ctx.bezierCurveTo(-14, 1, -12, -13, 0, -19); ctx.bezierCurveTo(12, -13, 14, 1, 0, 13);
        ctx.fillStyle = active
          ? ['#f6de9c', '#ebca74', '#fff0be'][i % 3]
          : astral
            ? (i % 2 ? '#1f282c' : '#253136')
            : (i % 2 ? '#9fb895' : '#b2c49f');
        ctx.fill();
        ctx.strokeStyle = active ? '#ffd878' : (astral ? unlitBloomStroke : '#819f7e');
        ctx.lineWidth = !active && astral ? sw2 : 1;
        ctx.stroke();
        ctx.restore();
      }
      ellipse(
        ctx, 0, -17,
        active ? 9 : 6,
        active ? 8 : 6,
        active ? '#fff7c8' : (astral ? null : '#ccd4aa'),
        active ? '#ffd878' : (astral ? unlitBloomStroke : '#c3b778'),
        !active && astral ? sw2 : 1
      );
      if (active) {
        for (let i = 0; i < 4; i++) {
          const angle = i * TAU / 4 + (this.reducedMotion ? .5 : this.time * .3);
          diamond(ctx, Math.cos(angle) * 37, -24 + Math.sin(angle) * 20, 2.5, '#fff7bf');
        }
      }
    }
    ctx.restore();
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
      const color = this.astralMode ? (this.palette(source.layer).astralColor || this.palette(source.layer).color) : this.palette(source.layer).color;
      ellipse(ctx, x, 24, 10, 6, received ? this.palette(source.layer).glow : (this.astralMode ? '#10212e' : '#edf1e5'), color, received ? 2 : 1);
      line(ctx, x, 18, x * .45, 5, color + (received ? 'bb' : '55'), received ? 2 : 1);
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
    const astral = this.astralMode;
    ellipse(ctx, 0, 4, 44, 19, astral ? '#172e3e' : '#b8ceb8', astral ? '#4b8ba3' : '#f3f6df', 2);
    if (open) {
      const glow = ctx.createRadialGradient(0, -29, 2, 0, -29, 60);
      glow.addColorStop(0, astral ? '#7ef0cb99' : '#fff0b88c'); glow.addColorStop(1, '#fff0b800');
      ctx.fillStyle = glow; ctx.fillRect(-66, -93, 132, 130);
    }
    for (const x of [-29, 29]) {
      path(ctx, [[x - 8, 6], [x - 8, -59], [x + 6, -61], [x + 9, 4]]);
      ctx.fillStyle = astral ? '#1d384b' : '#bccdb4'; ctx.fill(); line(ctx, x - 7, 3, x - 7, -56, astral ? '#76d8ea' : '#f9f7df', 2);
      path(ctx, [[x - 11, -52], [x - 10, -64], [x + 9, -64], [x + 12, -54]]);
      ctx.fillStyle = astral ? '#274a61' : '#d5ddc0'; ctx.fill();
    }
    path(ctx, [[-41, -62], [-31, -74], [32, -74], [42, -62]]);
    ctx.fillStyle = astral ? '#24455b' : '#d9ddbf'; ctx.fill(); ctx.strokeStyle = astral ? '#5ebad0' : '#a3b99d'; ctx.lineWidth = 1; ctx.stroke();
    if (open) {
      const fill = ctx.createLinearGradient(0, -60, 0, 7);
      if (astral) {
        fill.addColorStop(0, '#45c4a0aa'); fill.addColorStop(.55, '#ffe7a3dd'); fill.addColorStop(1, '#39a0b888');
      } else {
        fill.addColorStop(0, '#d7edc8b0'); fill.addColorStop(.55, '#fff1bfdd'); fill.addColorStop(1, '#e4eac48c');
      }
      ctx.fillStyle = fill; ctx.fillRect(-20, -57, 40, 58);
      for (let i = 0; i < 3; i++) {
        const y = -53 + (this.reducedMotion ? i * 17 : (this.time * 12 + i * 19) % 55);
        line(ctx, -14, y, 14, y, '#fff9d298', 1);
      }
      diamond(ctx, 0, -27, 11, '#fffbd8', '#dbbe79');
    } else {
      line(ctx, -21, -48, 21, -7, astral ? '#3b6a80' : '#9cb6a0', 1);
      line(ctx, 21, -48, -21, -7, astral ? '#3b6a80' : '#9cb6a0', 1);
      diamond(ctx, 0, -28, 9, astral ? '#1f3b4d' : '#ced8bb', astral ? '#589ab3' : '#91ad95');
    }
    const order = s.mechanismOrder || s.nodes.filter(item => item.kind === 'mechanism').map(item => item.id);
    for (let i = 0; i < order.length; i++) {
      const active = s.activated.includes(order[i]);
      const mechLayer = this.node(order[i])?.layer;
      const color = astral ? (this.palette(mechLayer).astralColor || this.palette(mechLayer).color) : this.palette(mechLayer).color;
      diamond(ctx, (i - (order.length - 1) / 2) * 15, -66, 4.3, active ? '#ffe8a1' : (astral ? '#142836' : '#dce1cd'), color);
    }
    this.drawExitLampPips(order.length || 3, s.activated.length, -86, open);
  }

  drawExitLampPips(mechTotal, litCount, y, allLit) {
    const ctx = this.ctx;
    const sScale = Math.max(.25, this.scale || 1);
    const total = Math.max(1, mechTotal || 3);
    const gap = Math.max(16, 12 / sScale);
    const litR = 3.5 / sScale;   // 7×7px screen diameter
    const unlitR = 3 / sScale;   // 6×6px screen diameter
    ctx.save();
    for (let i = 0; i < total; i++) {
      const px = (i - (total - 1) / 2) * gap;
      const lit = i < litCount;
      if (lit) {
        ellipse(ctx, px, y, litR * 1.55, litR * 1.55, allLit ? '#45c4a038' : '#fbbf2438');
        ellipse(ctx, px, y, litR, litR, this.astralMode ? '#fbbf24' : (allLit ? '#6ee7b7' : '#fbbf24'), this.astralMode ? null : (allLit ? '#10b981' : '#f59e0b'), 1.2 / sScale);
        ellipse(ctx, px - litR * .26, y - litR * .26, litR * .28, litR * .28, '#fffbeb');
      } else {
        ellipse(ctx, px, y, unlitR, unlitR, this.astralMode ? null : '#edf2e9cc', this.astralMode ? '#5ad4ea' : '#7b9486', 2 / sScale);
      }
    }
    ctx.restore();
  }

  drawExitSilhouette(node) {
    const ctx = this.ctx, s = this.state;
    const sScale = Math.max(.25, this.scale || 1);
    const pal = this.palette(node.layer ?? s.layer);
    const color = this.astralMode ? (pal.astralColor || pal.color) : pal.color;
    const order = s.mechanismOrder || s.nodes.filter(item => item.kind === 'mechanism').map(item => item.id);
    const mechTotal = order.length || 3;
    const litCount = s.activated.length;
    const allLit = litCount >= mechTotal;
    const isHovered = this.hover === node.id;
    const gateColor = color;
    const layerOffset = clamp(((s.layer ?? 0) - (node.layer ?? 0)) * 8, -16, 16);
    const outlineW = this.astralMode ? 2.5 / sScale : (isHovered ? 2.2 : 1.7);
    const outlineAlpha = this.astralMode ? (isHovered ? .94 : .85) : (isHovered ? .68 : .48);

    ctx.save();
    ctx.translate(node.x, node.y + layerOffset);

    // Dashed platform ellipse (rx: 72, ry: 36)
    ctx.globalAlpha = outlineAlpha;
    ctx.setLineDash([6 / sScale, 5 / sScale]);
    ellipse(ctx, 0, 2, 72, 36, `${gateColor}14`, allLit ? '#45c4a0' : gateColor, outlineW);

    // Translucent arched doorway frame (twin pillars + arch)
    const frameW = allLit ? 2.2 / sScale : 2 / sScale;
    ctx.setLineDash([4 / sScale, 2.5 / sScale]);
    ctx.globalAlpha = outlineAlpha;
    for (const side of [-1, 1]) {
      const px = side * 24;
      path(ctx, [[px - 6, 4], [px - 6, -48], [px + 6, -48], [px + 6, 4]]);
      ctx.fillStyle = `${gateColor}20`;
      ctx.fill();
      ctx.strokeStyle = gateColor;
      ctx.lineWidth = frameW;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(-30, -48);
    ctx.quadraticCurveTo(0, -68, 30, -48);
    ctx.lineTo(22, -44);
    ctx.quadraticCurveTo(0, -58, -22, -44);
    ctx.closePath();
    ctx.fillStyle = `${gateColor}24`;
    ctx.fill();
    ctx.strokeStyle = gateColor;
    ctx.lineWidth = frameW;
    ctx.stroke();
    ctx.setLineDash([]);

    if (allLit) {
      diamond(ctx, 0, -24, 8, '#a7f3d0', '#45c4a0');
    } else {
      ctx.setLineDash([3 / sScale, 4 / sScale]);
      line(ctx, -16, -40, 16, -8, gateColor, 1.5 / sScale);
      line(ctx, 16, -40, -16, -8, gateColor, 1.5 / sScale);
      ctx.setLineDash([]);
    }

    // 3-lamp lock progress pips above the ghosted gate
    ctx.globalAlpha = .96;
    const lampY = -74 - Math.max(0, 4 / sScale - 4);
    this.drawExitLampPips(mechTotal, litCount, lampY, allLit);

    // Compact icon-only glyph below the ghosted gate (layer shown by color + height, progress by 3 pips)
    const label = '🚪';
    const labelSize = 12.5 / sScale;
    const lh = labelSize + 8 / sScale;
    const padX = 7 / sScale;
    ctx.font = `${isHovered || allLit ? 600 : 500} ${labelSize}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tw = ctx.measureText(label).width;
    const loX = tw / 2 + padX + 4 - node.x;
    const hiX = WORLD_W - tw / 2 - padX - 4 - node.x;
    const labelX = clamp(0, Math.min(loX, hiX), Math.max(loX, hiX));
    const labelY = Math.min(36 + lh / 2, WORLD_H - node.y - layerOffset - lh / 2 - 4);
    this.labelZones?.push({ left: node.x + labelX - tw / 2 - padX, right: node.x + labelX + tw / 2 + padX, top: node.y + layerOffset + labelY - lh / 2, bottom: node.y + layerOffset + labelY + lh / 2 });
    ctx.globalAlpha = .94;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(labelX - tw / 2 - padX, labelY - lh / 2, tw + padX * 2, lh, 6 / sScale);
    else ctx.rect(labelX - tw / 2 - padX, labelY - lh / 2, tw + padX * 2, lh);
    ctx.fillStyle = this.astralMode ? '#0c1925eb' : '#edf2e9e6';
    ctx.fill();
    ctx.strokeStyle = allLit ? '#45c4a0aa' : `${gateColor}99`;
    ctx.lineWidth = 1.2 / sScale;
    ctx.stroke();
    ctx.fillStyle = allLit
      ? (this.astralMode ? '#a7f3d0' : '#166534')
      : (this.astralMode ? '#d8f3ee' : COLORS.ink);
    ctx.fillText(label, labelX, labelY);

    ctx.restore();
  }

  playerPosition() {
    const s = this.state;
    if (s.travel) {
      const from = this.node(s.travel.from), to = this.node(s.travel.to);
      if (from && to) {
        const t = clamp(s.travel.progress);
        if (s.travel.ramp) {
          const { ax, ay, bx, by } = this.rampEnds(s.travel, from, to);
          return { x: mix(ax, bx, t), y: mix(ay, by, t) };
        }
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
    // Prismatic comet afterimages & phase bow-wave during Bridge Surf Dash
    if (travel?.dashed && !risky && !this.reducedMotion) {
      const from = this.node(travel.from), to = this.node(travel.to);
      if (from && to) {
        const ends = travel.ramp ? this.rampEnds(travel, from, to) : { ax: from.x, ay: from.y, bx: to.x, by: to.y };
        const dx = ends.bx - ends.ax, dy = ends.by - ends.ay, len = Math.max(1, Math.hypot(dx, dy));
        const ux = dx / len, uy = dy / len;
        const avatarScale = clamp(.48 / this.scale, 1, 1.5);
        const wakeCol = travel.dashed === 'perfect' ? COLORS.lightGold : this.palette().glow;
        for (let i = 4; i >= 1; i--) {
          const backT = clamp(travel.progress - i * .055, 0, 1);
          const ax = mix(ends.ax, ends.bx, backT), ay = mix(ends.ay, ends.by, backT);
          ctx.save();
          ctx.translate(ax, ay);
          ctx.globalAlpha = (.46 - i * .09);
          ctx.scale(avatarScale * (1 - i * .06), avatarScale * (1 - i * .06));
          this.drawAvatar(0, 0, i % 2 === 0 ? wakeCol : color, true);
          ctx.restore();
        }
        ctx.save();
        ctx.translate(position.x + ux * 16, position.y - 10 + uy * 16);
        ctx.rotate(Math.atan2(dy, dx));
        ctx.globalAlpha = .82;
        ctx.beginPath();
        ctx.arc(0, 0, 18, -Math.PI * .42, Math.PI * .42);
        ctx.strokeStyle = wakeCol;
        ctx.lineWidth = travel.dashed === 'perfect' ? 2.8 : 2;
        ctx.stroke();
        ctx.restore();
      }
    }
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
    const punch = this.feel?.value('player') || 0;
    let squashAngle = 0;
    if (punch && travel) {
      const from = this.node(travel.from), to = this.node(travel.to);
      if (from && to) squashAngle = Math.atan2(to.y - from.y, to.x - from.x);
    }
    if (squashAngle) ctx.rotate(squashAngle);
    ctx.scale(avatarScale * (1 + punch), avatarScale * (1 - punch));
    if (squashAngle) ctx.rotate(-squashAngle);
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
    if ((s.carried || 0) > 0) {
      const moteCount = Math.min(5, s.carried);
      for (let i = 0; i < moteCount; i++) {
        const a = (this.reducedMotion ? .35 : this.time * 1.85) + (i * TAU) / moteCount;
        const mx = Math.cos(a) * 23;
        const my = -17 + bob + Math.sin(a) * 8.5;
        ellipse(ctx, mx, my, 5.5, 5.5, '#fbbf2424');
        diamond(ctx, mx, my, 3.3, '#fffbeb', '#f59e0b');
      }
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
    const sScale = Math.max(.25, this.scale || 1);
    const compactPortrait = this.isCompactPortrait();
    if (foreground && compactPortrait && this.state?.nodes) {
      for (const n of this.state.nodes) {
        if (!n || (!n.anchor && (n.scale ?? 0) <= .08)) continue;
        const rx = n.id === 'hub' ? 92 : n.anchor ? 74 : 78;
        const top = n.y - (n.id === 'relay' ? 68 : 54);
        const bottom = n.y + 42;
        noteZones.push({ left: n.x - rx, right: n.x + rx, top, bottom });
      }
    }
    for (const effect of this.effects) {
      if (effect.age < (effect.delay || 0)) continue;
      const p = clamp((effect.age - (effect.delay || 0)) / effect.duration);
      const e = this.reducedMotion ? .7 : ease(p);
      if (foreground !== ['note', 'pulse', 'power', 'section', 'crown', 'shield', 'bank', 'break', 'gather', 'value', 'collect', 'bridge_echo', 'growth_signal', 'root_growth', 'coil_arc', 'seal_turn', 'ascension_signal', 'astral_bridge'].includes(effect.kind)) continue;
      ctx.save(); ctx.globalAlpha = (1 - p) ** .7;
      if (effect.kind === 'note') {
        const notePx = Math.max(16, 12.5 / sScale);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = `600 ${notePx}px system-ui, -apple-system, sans-serif`;
        const half = ctx.measureText(effect.text).width / 2 + 8 / sScale;
        const x = Math.max(half, Math.min(WORLD_W - half, effect.x));
        let y = Math.max(notePx / 2 + 8, effect.y - 105 - (compactPortrait && effect.supply ? 18 / sScale : 0) - (this.reducedMotion || compactPortrait ? 0 : e * 12));
        if (compactPortrait) {
          const height = notePx, gap = 6 / sScale;
          // Move only a colliding phone note, keeping the authored platform names and anchors clear.
          for (let i = 0; i <= noteZones.length; i++) {
            const hit = noteZones.find(z => x + half > z.left && x - half < z.right && y + height / 2 + gap > z.top && y - height / 2 - gap < z.bottom);
            if (!hit) break;
            y = Math.max(height / 2 + gap, hit.top - gap - height / 2);
          }
          noteZones.push({ left: x - half, right: x + half, top: y - height / 2, bottom: y + height / 2 });
        }
        const noteFill = this.astralMode
          ? (effect.color === COLORS.ink ? '#eaf6f3' : effect.color === COLORS.teal ? '#4dd2ac' : effect.color)
          : effect.color;
        ctx.lineWidth = Math.max(4, 3.2 / sScale);
        ctx.strokeStyle = this.astralMode ? '#08131d' : '#f3f5ec';
        ctx.fillStyle = noteFill;
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
        ctx.lineWidth = 4;
        ctx.strokeStyle = this.astralMode ? '#09141f' : '#fff8dd';
        ctx.fillStyle = this.astralMode ? '#ffd86b' : '#9a691f';
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
    if (this.astralMode) {
      mist.addColorStop(0, '#07111a00'); mist.addColorStop(1, '#07111a78');
    } else {
      mist.addColorStop(0, '#edf3e700'); mist.addColorStop(1, '#edf3e755');
    }
    ctx.fillStyle = mist; ctx.fillRect(0, 555, 1000, 95); ctx.restore();
  }

  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    this._releasePointerCapture();
    this.resizeObserver?.disconnect();
    window.removeEventListener('resize', this.resizeHandler);
    this.motionQuery?.removeEventListener?.('change', this.motionChange);
    this.canvas.removeEventListener('pointermove', this.pointerMove);
    this.canvas.removeEventListener('pointerleave', this.pointerLeave);
    this.canvas.removeEventListener('pointerdown', this.onCanvasPointerDown);
    this.canvas.removeEventListener('pointerup', this.onCanvasPointerUp);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    this.canvas.removeEventListener('pointercancel', this.onPointerCancel);
    this.canvas.removeEventListener('lostpointercapture', this.onPointerCancel);
    this.canvas.removeEventListener('touchstart', this.onTouchStart);
    this.effects.length = 0; this.particles.length = 0;
    this.state = null;
  }
}
