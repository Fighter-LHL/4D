// Flatland view: the Flatlander's whole world is one flat layer, drawn
// top-down with Canvas2D. Same frame data as the 3D view, minus height.
import { cssColor } from './layers.mjs';

const TOKEN = [1, 0.93, 0.8];
const ALERT = [1, 0.38, 0.32];
const GOLD = [1, 0.8, 0.38];
const mixRGB = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

function drawPattern(ctx, id, ex, ez, s) {
  ctx.beginPath();
  if (id === 0) {
    for (let x = -Math.ceil(ex * 2) / 2; x <= ex; x += 0.5) {
      for (let z = -Math.ceil(ez * 2) / 2; z <= ez; z += 0.5) {
        ctx.moveTo(x * s + 1.6, z * s);
        ctx.arc(x * s, z * s, 1.6, 0, Math.PI * 2);
      }
    }
    ctx.fill();
    return;
  }
  if (id === 1) {
    for (let k = -ex - ez; k <= ex + ez; k += 0.44) {
      ctx.moveTo((k - ez) * s, ez * s);
      ctx.lineTo((k + ez) * s, -ez * s);
    }
  } else if (id === 2) {
    for (let x = -Math.ceil(ex); x <= ex; x += 1) { ctx.moveTo(x * s, -ez * s); ctx.lineTo(x * s, ez * s); }
    for (let z = -Math.ceil(ez); z <= ez; z += 1) { ctx.moveTo(-ex * s, z * s); ctx.lineTo(ex * s, z * s); }
  } else if (id === 3) {
    const r = Math.hypot(ex, ez);
    for (const angle of [0, Math.PI / 3, -Math.PI / 3]) {
      const cx = Math.cos(angle);
      const cz = Math.sin(angle);
      for (let k = -r; k <= r; k += 0.77) {
        ctx.moveTo((k * -cz - r * cx) * s, (k * cx - r * cz) * s);
        ctx.lineTo((k * -cz + r * cx) * s, (k * cx + r * cz) * s);
      }
    }
  } else {
    for (let r = 0.31; r <= Math.hypot(ex, ez); r += 0.625) {
      ctx.moveTo(r * s, 0);
      ctx.arc(0, 0, r * s, 0, Math.PI * 2);
    }
  }
  ctx.stroke();
}

export class FlatRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.frame = null;
    new ResizeObserver(() => this.draw()).observe(canvas);
  }

  render(frame) {
    this.frame = frame;
    this.draw();
  }

  draw() {
    const { canvas, ctx, frame } = this;
    if (!frame || canvas.offsetParent === null) return;
    const box = canvas.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(box.width * ratio);
    const height = Math.round(box.height * ratio);
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }

    const { field, layer } = frame;
    const ex = (field ? field.bounds.x : 2.8) + 0.45;
    const ez = (field ? field.bounds.z : 2.0) + 0.45;
    const s = Math.min(width / (2 * ex), height / (2 * ez));
    const tint = mixRGB(layer.a.color, layer.b.color, layer.t);

    const bg = ctx.createRadialGradient(width / 2, height * 0.45, 0, width / 2, height / 2, Math.max(width, height) * 0.7);
    bg.addColorStop(0, '#0c1324');
    bg.addColorStop(1, '#050811');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.translate(width / 2, height / 2);

    // Layer pattern, cross-faded at borders.
    ctx.save();
    if (field) { ctx.beginPath(); ctx.rect(-field.bounds.x * s, -field.bounds.z * s, field.bounds.x * 2 * s, field.bounds.z * 2 * s); ctx.clip(); }
    ctx.lineWidth = Math.max(1, ratio * 0.8);
    for (const [entry, alpha] of [[layer.a, 1 - layer.t], [layer.b, layer.t]]) {
      if (alpha < 0.02) continue;
      ctx.strokeStyle = cssColor(entry.color, 0.2 * alpha);
      ctx.fillStyle = cssColor(entry.color, 0.3 * alpha);
      drawPattern(ctx, entry.pattern, ex, ez, s);
    }
    ctx.restore();

    if (field) {
      ctx.shadowColor = cssColor(tint, 0.8);
      ctx.shadowBlur = 14 * ratio;
      ctx.strokeStyle = cssColor(tint, 0.75);
      ctx.lineWidth = 1.5 * ratio;
      ctx.strokeRect(-field.bounds.x * s, -field.bounds.z * s, field.bounds.x * 2 * s, field.bounds.z * 2 * s);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = cssColor(tint, 0.35);
      ctx.beginPath();
      ctx.arc(field.start[0] * s, field.start[1] * s, 0.2 * s, 0, Math.PI * 2);
      ctx.stroke();
      const won = frame.token?.won;
      const goalOpen = frame.goalState ? frame.goalState.open : true;
      ctx.save();
      if (goalOpen) {
        const wEdge = frame.goalState?.wEdge ?? 1;
        const goal = ctx.createRadialGradient(field.goal[0] * s, field.goal[1] * s, 0, field.goal[0] * s, field.goal[1] * s, 0.6 * s);
        goal.addColorStop(0, cssColor(GOLD, won ? 0.55 : (0.18 + 0.16 * wEdge)));
        goal.addColorStop(1, cssColor(GOLD, 0));
        ctx.fillStyle = goal;
        ctx.fillRect((field.goal[0] - 0.6) * s, (field.goal[1] - 0.6) * s, 1.2 * s, 1.2 * s);
        ctx.shadowColor = cssColor(GOLD, 0.9);
        ctx.shadowBlur = 16 * ratio;
        ctx.strokeStyle = cssColor(GOLD, 0.65 + 0.3 * wEdge);
        ctx.lineWidth = 2 * ratio;
      } else {
        ctx.strokeStyle = cssColor(GOLD, frame.goalState?.wGhost ?? 0.5);
        ctx.lineWidth = 1.6 * ratio;
        ctx.setLineDash([5 * ratio, 5 * ratio]);
      }
      ctx.beginPath();
      ctx.arc(field.goal[0] * s, field.goal[1] * s, 0.3 * s, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    for (const r of frame.ripples ?? []) {
      ctx.strokeStyle = cssColor(r.tint, 0.7 * (1 - r.progress));
      ctx.lineWidth = 2 * ratio;
      ctx.beginPath();
      ctx.arc(r.x * s, r.z * s, Math.max(0.01, r.progress * 1.8 * s), 0, Math.PI * 2);
      ctx.stroke();
    }

    for (const sec of frame.sections ?? []) {
      // A present box is drawn whole; a present sphere keeps its danger circle.
      const ghostAmt = Number(sec.ghost) || 0;
      if (ghostAmt <= 0 || (sec.type === 'box' && sec.kind !== 'empty')) continue;
      const ghost = ghostAmt * (0.28 + 0.62 * (sec.wGhost ?? 0));
      ctx.save();
      const [x, z] = [sec.center[0], sec.center[2]];
      ctx.strokeStyle = cssColor(sec.tint, ghost);
      ctx.lineWidth = 1.5 * ratio;
      ctx.setLineDash([5 * ratio, 5 * ratio]);
      ctx.beginPath();
      if (sec.type === 'sphere') {
        ctx.arc(x * s, z * s, (sec.maxR || 0.35) * s, 0, Math.PI * 2);
      } else {
        ctx.rect((x - sec.half[0]) * s, (z - sec.half[2]) * s, sec.half[0] * 2 * s, sec.half[2] * 2 * s);
      }
      ctx.stroke();
      ctx.restore();
    }

    for (const shape of frame.shapes) {
      ctx.save();
      const [x, z] = shape.center;
      const wEdge = shape.wEdge ?? 1;
      ctx.beginPath();
      if (shape.type === 'sphere') {
        ctx.arc(x * s, z * s, shape.radius * s, 0, Math.PI * 2);
        const glass = ctx.createRadialGradient(x * s, z * s, 0, x * s, z * s, shape.radius * s);
        glass.addColorStop(0, cssColor(shape.tint, 0.1));
        glass.addColorStop(0.8, cssColor(shape.tint, 0.22));
        glass.addColorStop(1, cssColor(shape.tint, 0.45));
        ctx.fillStyle = glass;
      } else {
        ctx.rect((x - shape.half[0]) * s, (z - shape.half[1]) * s, shape.half[0] * 2 * s, shape.half[1] * 2 * s);
        ctx.fillStyle = cssColor(shape.tint, 0.14 + 0.2 * wEdge);
      }
      ctx.shadowColor = cssColor(shape.tint, 0.9);
      ctx.shadowBlur = 18 * ratio;
      ctx.fill();
      if (shape.type === 'box' && wEdge < 0.75) {
        ctx.setLineDash([6 * ratio, (1 - wEdge) * 6 * ratio]);
      }
      ctx.strokeStyle = cssColor(shape.tint, 0.65 + 0.3 * wEdge);
      ctx.lineWidth = 2 * ratio;
      ctx.stroke();
      ctx.restore();
    }

    for (const [x, z, alpha] of frame.trail ?? []) {
      ctx.fillStyle = cssColor(TOKEN, alpha * 0.5);
      ctx.beginPath();
      ctx.arc(x * s, z * s, 0.06 * s, 0, Math.PI * 2);
      ctx.fill();
    }

    if (frame.token) {
      const [x, z] = frame.token.pos;
      const color = mixRGB(TOKEN, ALERT, Math.min(1, frame.token.flash));
      const halo = ctx.createRadialGradient(x * s, z * s, 0, x * s, z * s, 0.8 * s);
      halo.addColorStop(0, cssColor(color, 0.35));
      halo.addColorStop(1, cssColor(color, 0));
      ctx.fillStyle = halo;
      ctx.fillRect((x - 0.8) * s, (z - 0.8) * s, 1.6 * s, 1.6 * s);
      ctx.shadowColor = cssColor(color, 1);
      ctx.shadowBlur = 20 * ratio;
      ctx.fillStyle = cssColor(color, 1);
      ctx.beginPath();
      ctx.arc(x * s, z * s, field.tokenRadius * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }
}
