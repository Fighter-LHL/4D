// Slices of authored 3D solids by the plane z = s. Pure functions only.
// The convex-polytope path (edge interpolation + hull) is dimension-agnostic:
// the 4D chapter cuts polychora by w = W the same way, one dimension up.
export const EPSILON = 1e-9;
const CONTACT = 1e-6;

const key = ([x, y]) => `${Math.round(x * 1e6)},${Math.round(y * 1e6)}`;
const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

export function convexHull(points) {
  const unique = [...new Map(points.map(point => [key(point), point])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (unique.length < 3) return unique;
  const half = list => {
    const hull = [];
    for (const point of list) {
      while (hull.length >= 2 && cross(hull.at(-2), hull.at(-1), point) <= EPSILON) hull.pop();
      hull.push(point);
    }
    return hull.slice(0, -1);
  };
  return [...half(unique), ...half([...unique].reverse())];
}

export function polygonArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const [ax, ay] = points[i], [bx, by] = points[(i + 1) % points.length];
    area += ax * by - bx * ay;
  }
  return Math.abs(area) / 2;
}

export function sliceSolid(solid, s) {
  if (solid.kind === 'sphere') {
    const [cx, cy, cz] = solid.center, r2 = solid.r ** 2 - (s - cz) ** 2;
    return r2 > EPSILON ? { type: 'circle', cx, cy, r: Math.sqrt(r2) } : null;
  }
  if (solid.kind === 'cone') {
    // Base disc at base[2], apex directly above it.
    const [cx, cy, cz] = solid.base, t = (s - cz) / solid.height;
    return t >= -EPSILON && t < 1 - EPSILON ? { type: 'circle', cx, cy, r: solid.r * (1 - Math.max(0, t)) } : null;
  }
  if (solid.kind === 'prism') {
    const [z0, z1] = solid.z;
    return s >= z0 - EPSILON && s <= z1 + EPSILON ? { type: 'polygon', points: solid.polygon.map(point => [...point]) } : null;
  }
  if (solid.kind === 'polytope') {
    const points = [];
    for (const [i, j] of solid.edges) {
      const a = solid.vertices[i], b = solid.vertices[j], da = a[2] - s, db = b[2] - s;
      if (Math.abs(da) <= EPSILON) points.push([a[0], a[1]]);
      if (Math.abs(db) <= EPSILON) points.push([b[0], b[1]]);
      if (da * db < 0) { const t = da / (da - db); points.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
    }
    const hull = convexHull(points);
    return hull.length >= 3 && polygonArea(hull) > CONTACT ? { type: 'polygon', points: hull } : null;
  }
  throw new Error(`Unknown solid kind: ${solid.kind}`);
}

// Orthographic projection along Y: the "god's eye" side view of each solid.
export function profileXZ(solid) {
  if (solid.kind === 'sphere') return { type: 'circle', cx: solid.center[0], cy: solid.center[2], r: solid.r };
  if (solid.kind === 'cone') {
    const [cx, , cz] = solid.base;
    return { type: 'polygon', points: [[cx - solid.r, cz], [cx + solid.r, cz], [cx, cz + solid.height]] };
  }
  if (solid.kind === 'prism') {
    const xs = solid.polygon.map(point => point[0]), [z0, z1] = solid.z;
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    return { type: 'polygon', points: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]] };
  }
  if (solid.kind === 'polytope') return { type: 'polygon', points: convexHull(solid.vertices.map(([x, , z]) => [x, z])) };
  throw new Error(`Unknown solid kind: ${solid.kind}`);
}

export function pointInPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i], [xj, yj] = points[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function segmentDistance(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay, length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length)) : 0;
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

// Touching counts as free so the player can stand flush against a wall.
export function circleHitsShape(cx, cy, r, shape) {
  if (shape.type === 'circle') return Math.hypot(cx - shape.cx, cy - shape.cy) < r + shape.r - CONTACT;
  if (pointInPolygon(cx, cy, shape.points)) return true;
  return shape.points.some((point, i) => segmentDistance(cx, cy, point, shape.points[(i + 1) % shape.points.length]) < r - CONTACT);
}

export function shapeCentroid(shape) {
  if (shape.type === 'circle') return [shape.cx, shape.cy];
  const n = shape.points.length;
  return shape.points.reduce(([x, y], point) => [x + point[0] / n, y + point[1] / n], [0, 0]);
}

// Closed wall sections block sight, including a ray tangent to an edge.
export function segmentHitsShape(a, b, shape) {
  if (shape.type === 'circle') return segmentDistance(shape.cx, shape.cy, a, b) <= shape.r + EPSILON;
  if (pointInPolygon(...a, shape.points) || pointInPolygon(...b, shape.points)) return true;
  return shape.points.some((c, i) => {
    const d = shape.points[(i + 1) % shape.points.length];
    if (Math.max(a[0], b[0]) < Math.min(c[0], d[0]) - EPSILON || Math.max(c[0], d[0]) < Math.min(a[0], b[0]) - EPSILON
      || Math.max(a[1], b[1]) < Math.min(c[1], d[1]) - EPSILON || Math.max(c[1], d[1]) < Math.min(a[1], b[1]) - EPSILON) return false;
    const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
    const straddles = (x, y) => (x <= EPSILON && y >= -EPSILON) || (y <= EPSILON && x >= -EPSILON);
    return straddles(abC, abD) && straddles(cdA, cdB);
  });
}

// Rotation taking unit vector `from` onto +Z (Rodrigues). Used to stand a cube on its corner.
export function alignToZ(from) {
  const length = Math.hypot(...from), [ax, ay, az] = from.map(value => value / length);
  const kx = ay, ky = -ax, sin2 = kx * kx + ky * ky, c = az;
  if (sin2 < EPSILON) return c > 0 ? [[1, 0, 0], [0, 1, 0], [0, 0, 1]] : [[1, 0, 0], [0, -1, 0], [0, 0, -1]];
  const f = (1 - c) / sin2;
  const K = [[0, 0, ky], [0, 0, -kx], [-ky, kx, 0]];
  const K2 = K.map((row, i) => [0, 1, 2].map(j => row.reduce((sum, value, k) => sum + value * K[k][j], 0)));
  return [0, 1, 2].map(i => [0, 1, 2].map(j => (i === j ? 1 : 0) + K[i][j] + K2[i][j] * f));
}

export function cube(id, { center, size, matrix = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], ...extra }) {
  const vertices = [];
  for (let i = 0; i < 8; i++) {
    const local = [0, 1, 2].map(axis => (i >> axis & 1 ? .5 : -.5) * size);
    vertices.push([0, 1, 2].map(row => center[row] + matrix[row].reduce((sum, value, k) => sum + value * local[k], 0)));
  }
  const edges = [];
  for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) if ([1, 2, 4].includes(i ^ j)) edges.push([i, j]);
  return { id, kind: 'polytope', vertices, edges, ...extra };
}

export function rect(id, x0, y0, x1, y1, z, extra = {}) {
  return { id, kind: 'prism', polygon: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], z, ...extra };
}

const IDENTITY = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const apply = (matrix, v) => [0, 1, 2].map(row => matrix[row].reduce((sum, value, k) => sum + value * v[k], 0));

// Every pair of vertices of a convex polytope spans a segment inside it, so
// using all pairs as "edges" still slices to the exact convex section.
export function polytope(id, { center, local, matrix = IDENTITY, ...extra }) {
  const vertices = local.map(v => apply(matrix, v).map((value, i) => value + center[i]));
  const edges = [];
  for (let i = 0; i < vertices.length; i++) for (let j = i + 1; j < vertices.length; j++) edges.push([i, j]);
  return { id, kind: 'polytope', vertices, edges, ...extra };
}
const OCTAHEDRON = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const TETRAHEDRON = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].map(v => v.map(x => x / Math.sqrt(3)));
export const octahedron = (id, { size, ...rest }) => polytope(id, { local: OCTAHEDRON.map(v => v.map(x => x * size)), ...rest });
export const tetrahedron = (id, { size, ...rest }) => polytope(id, { local: TETRAHEDRON.map(v => v.map(x => x * size)), ...rest });

export function rotationFromQuaternion([w, x, y, z]) {
  const n = Math.hypot(w, x, y, z) || 1; w /= n; x /= n; y /= n; z /= n;
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
    [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
    [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)],
  ];
}
// Uniform random rotation (Shoemake) from a seeded generator.
export function randomRotation(rng) {
  const u1 = rng.next(), u2 = rng.next() * Math.PI * 2, u3 = rng.next() * Math.PI * 2;
  const a = Math.sqrt(1 - u1), b = Math.sqrt(u1);
  return rotationFromQuaternion([a * Math.sin(u2), a * Math.cos(u2), b * Math.sin(u3), b * Math.cos(u3)]);
}
export const rotateZ = angle => [[Math.cos(angle), -Math.sin(angle), 0], [Math.sin(angle), Math.cos(angle), 0], [0, 0, 1]];
export const multiply = (a, b) => [0, 1, 2].map(i => [0, 1, 2].map(j => a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j]));

export function shapeArea(shape) { return !shape ? 0 : shape.type === 'circle' ? Math.PI * shape.r ** 2 : polygonArea(shape.points); }
// Merge vertices joined by very short edges, so a section that barely clips a
// corner is not counted as a different polygon.
export function simplifyPolygon(points, minEdge = .08) {
  let out = [...points];
  for (let changed = true; changed && out.length > 3;) {
    changed = false;
    for (let i = 0; i < out.length && out.length > 3; i++) {
      const a = out[i], b = out[(i + 1) % out.length];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < minEdge) { out.splice((i + 1) % out.length, 1); changed = true; }
    }
  }
  return out;
}
// Closeness 0..1 between a live section and a target outline, plus a strict match flag.
export function shapeMatch(shape, target, { radius = .1, area = .08 } = {}) {
  if (!shape || !target || shape.type !== target.type) return { match: false, closeness: 0 };
  if (shape.type === 'circle') {
    const d = Math.abs(shape.r - target.r) + Math.hypot(shape.cx - target.cx, shape.cy - target.cy);
    return { match: d <= radius, closeness: clamp01(1 - d / 1.2) };
  }
  const a = shapeArea(shape), b = shapeArea(target), ratio = Math.abs(a - b) / Math.max(b, EPSILON);
  const [ax, ay] = shapeCentroid(shape), [bx, by] = shapeCentroid(target), offset = Math.hypot(ax - bx, ay - by);
  const sameSides = simplifyPolygon(shape.points).length === simplifyPolygon(target.points).length;
  return { match: sameSides && ratio <= area && offset <= .3, closeness: clamp01(1 - ratio * 1.6 - offset * .4) * (sameSides ? 1 : .65) };
}
const clamp01 = value => Math.max(0, Math.min(1, value));

export function translateSolidXY(solid, dx, dy) {
  const copy = structuredClone(solid);
  const move = p => [p[0] + dx, p[1] + dy, ...p.slice(2)];
  if (copy.center) copy.center = move(copy.center);
  if (copy.base) copy.base = move(copy.base);
  if (copy.vertices) copy.vertices = copy.vertices.map(move);
  if (copy.polygon) copy.polygon = copy.polygon.map(move);
  return copy;
}
