// Parallel-world layers: W in [-2, 2] is split into five bands, each with
// its own hue and floor pattern, so "which world am I in" reads at a glance.
// Cool blue is −W (kata), warm amber is +W (ana). Purely visual: geometry and
// collision never look at layers.
export const W_MIN = -2;
export const W_MAX = 2;
export const LAYER_SPAN = 0.8;
const EDGE = 0.1; // crossfade width, in layer units, on each side of a border

export const LAYERS = Object.freeze([
  { name: '−2', color: [0.31, 0.55, 1.0], pattern: 0 },
  { name: '−1', color: [0.21, 0.83, 0.82], pattern: 1 },
  { name: '0', color: [0.72, 0.86, 0.878], pattern: 2 },
  { name: '+1', color: [1.0, 0.76, 0.4], pattern: 3 },
  { name: '+2', color: [1.0, 0.56, 0.30], pattern: 4 },
].map(Object.freeze));

const clampW = (w) => Math.max(W_MIN, Math.min(W_MAX, w));

export function layerIndex(w) {
  return Math.min(LAYERS.length - 1, Math.max(0, Math.floor((clampW(w) - W_MIN) / LAYER_SPAN)));
}

// Two neighbouring layers plus a mix factor; t is 0 well inside a layer and
// moves 0 → 1 across a border, so the floor never flips abruptly.
export function layerBlend(w) {
  const u = (clampW(w) - W_MIN) / LAYER_SPAN;
  const i = layerIndex(w);
  const f = u - i;
  if (f < EDGE && i > 0) return { a: i - 1, b: i, t: 0.5 + f / (2 * EDGE) };
  if (f > 1 - EDGE && i < LAYERS.length - 1) return { a: i, b: i + 1, t: (f - (1 - EDGE)) / (2 * EDGE) };
  return { a: i, b: i, t: 0 };
}

// Smooth hue along W, used to tint each body by where it lives.
export function wColor(w) {
  const u = (clampW(w) - W_MIN) / LAYER_SPAN - 0.5;
  const i = Math.max(0, Math.min(LAYERS.length - 2, Math.floor(u)));
  const t = Math.max(0, Math.min(1, u - i));
  const a = LAYERS[i].color;
  const b = LAYERS[i + 1].color;
  return a.map((value, k) => value + (b[k] - value) * t);
}

export const cssColor = (rgb, alpha = 1) =>
  `rgba(${rgb.map((v) => Math.round(v * 255)).join(',')},${alpha})`;
