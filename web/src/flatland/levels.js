import { rect, cube, octahedron, tetrahedron, randomRotation, rotateZ, sliceSolid, simplifyPolygon, shapeArea, shapeMatch } from './geometry.js';
import { keyShape, quarterTurn } from './mirror.js';
// Chapter 0. You are a flat creature in the XY plane at height S. Nothing is
// explained: each level is a small game whose rules are found by playing.
// `build(rng)` gives every attempt a different but always fair variant.
const BOUNDS = Object.freeze({ w: 20, h: 12 });
const deepFreeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); } return value; };
const pickGroups = (rng, groups) => groups.map(group => ({ ...rng.pick(group) }));

// Width of the contiguous band of heights around `s` whose section matches the one at `s`.
export function matchWindow(solid, s, step = .01) {
  const target = sliceSolid(solid, s);
  let width = 0;
  for (const dir of [-1, 1]) for (let d = step; d <= .6; d += step) { if (!shapeMatch(sliceSolid(solid, s + dir * d), target).match) break; width += step; }
  return width;
}
// A target height whose section is readable and can be held: big enough, and
// matched across a band wide enough to find by hand.
export function pickTarget(solid, rng, { minSides = 3, minArea = 1.1, minWindow = .16 } = {}) {
  const zs = solid.vertices.map(v => v[2]), lo = Math.min(...zs) + .2, hi = Math.max(...zs) - .2;
  for (let i = 0; i < 200; i++) {
    const s = rng.range(lo, hi), shape = sliceSolid(solid, s);
    if (!shape || shapeArea(shape) < minArea || simplifyPolygon(shape.points).length < minSides) continue;
    if (matchWindow(solid, s) >= minWindow) return s;
  }
  return null;
}
// Re-roll the orientation until a good target exists, relaxing only as a last resort.
function tumbling(make, rng, minSides) {
  for (let i = 0; i < 12; i++) {
    const solid = make(randomRotation(rng)), target = pickTarget(solid, rng, { minSides });
    if (target !== null) return { solid, target };
  }
  const solid = make(rotateZ(rng.range(0, Math.PI)));
  return { solid, target: pickTarget(solid, rng, { minSides: 3, minWindow: .05 }) ?? 3 };
}

const MIRROR_LOCK_Y = [2.4, 6, 9.6];
const poseKey = (c, t) => `${c}:${quarterTurn(t)}`;
// Fewest rotate/flip actions to visit every lock pose in some order.
export function mirrorPar(poses, start = { chirality: 1, turns: 0 }) {
  const dist = (a, b) => {
    const seen = new Map([[poseKey(a.chirality, a.turns), 0]]), queue = [a];
    while (queue.length) {
      const p = queue.shift(), d = seen.get(poseKey(p.chirality, p.turns));
      if (p.chirality === b.chirality && quarterTurn(p.turns) === quarterTurn(b.turns)) return d;
      for (const n of [{ chirality: p.chirality, turns: quarterTurn(p.turns + 1) }, { chirality: -p.chirality, turns: quarterTurn(-p.turns) }]) {
        const k = poseKey(n.chirality, n.turns);
        if (!seen.has(k)) { seen.set(k, d + 1); queue.push(n); }
      }
    }
    return Infinity;
  };
  const orders = list => list.length <= 1 ? [list] : list.flatMap((item, i) => orders([...list.slice(0, i), ...list.slice(i + 1)]).map(rest => [item, ...rest]));
  return Math.min(...orders(poses).map(order => order.reduce((sum, pose, i) => sum + dist(i ? order[i - 1] : start, pose), 0)));
}

const ROOM = [
  rect('wall-n', 7, 3.5, 13, 3.9, [0, 3.5], { role: 'wall', solid: true }),
  rect('wall-s', 7, 8.1, 13, 8.5, [0, 3.5], { role: 'wall', solid: true }),
  rect('wall-w', 7, 3.5, 7.4, 8.5, [0, 3.5], { role: 'wall', solid: true }),
  rect('wall-e', 12.6, 3.5, 13, 8.5, [0, 3.5], { role: 'wall', solid: true }),
];

export const FLATLAND_LEVELS = deepFreeze([
  {
    id: 'visitor', title: '访客', mode: 'rings',
    garden: { axis: 10, left: { x: 6.5, y: 9, z: 2.1 }, right: { x: 13.5, y: 9, z: 2.1 }, bud: { x: 8.9, y: 9, z: 3.6 },
      drops: { probe: [{ x: 10, y: 9.8 }], mirror: [{ x: 5, y: 7.5 }, { x: 15, y: 7.5 }] } },
    tagline: '有个看不见的东西正穿过你的世界。让它的影子撑满每一道光环。',
    bounds: BOUNDS, slice: { min: 0, max: 6, start: .2 },
    player: { x: 3.2, y: 6, r: .4, canMove: true }, sideView: 'full',
    visitor: { id: 'ball', kind: 'sphere', center: [10, 6, 3], r: 2.5, role: 'visitor' },
    ringRules: { count: 6, windows: [6, 5.5, 5, 4.5, 4, 3.5], tolerance: .1, hold: .25, need: 4, gap: .55 },
    build: rng => {
      const radii = [];
      while (radii.length < 6) {
        const r = Math.round(rng.range(.8, 2.4) * 20) / 20;
        if (!radii.length || Math.abs(r - radii.at(-1)) >= .45) radii.push(r);
      }
      return { rings: radii };
    },
    stars: [
      { kind: 'complete', label: '接住至少 4 道光环' },
      { kind: 'perfectRings', label: '6 道全部接住' },
      { kind: 'score', value: 1800, label: '得分 ≥ 1800' },
    ],
    hints: [{ idle: 3.5, text: 'Q / E · 滚轮 · 拖动滑条：上下换层' }],
  },
  {
    id: 'guess', title: '变形锁', mode: 'locks',
    stampPositions: [[6, 3], [14, 3], [14, 9], [6, 9], [10, 6]],
    garden: { axis: 10, left: { x: 4, y: 2.3, z: 3.6 }, right: { x: 16, y: 2.3, z: 3.6 }, bud: { x: 4, y: 4.7, z: 2.1 },
      drops: { probe: [{ x: 2, y: 5.8 }], mirror: [{ x: 2.5, y: 3.8 }, { x: 17.5, y: 3.8 }] } },
    tagline: '锁孔只认它某一层的样子。',
    bounds: BOUNDS, slice: { min: 0, max: 6, start: .2 },
    player: { x: 3.2, y: 6, r: .4, canMove: true }, sideView: 'concealed', abilities: { reveal: true },
    lockRules: { hold: .35, gap: .7 },
    build: rng => {
      const C = [10, 6, 3];
      const turned = cube('lock-cube', { center: C, size: 3, matrix: rotateZ(rng.range(0, Math.PI / 2)), role: 'visitor' });
      const octa = rng.next() < .5;
      return { locks: [
        { solid: turned, target: rng.range(2, 4) },
        { solid: { id: 'lock-cone', kind: 'cone', base: [10, 6, .5], height: 5, r: 2.3, role: 'visitor' }, target: rng.range(1.3, 4.2) },
        { solid: { id: 'lock-ball', kind: 'sphere', center: C, r: 2.4, role: 'visitor' }, target: rng.next() < .5 ? rng.range(1, 2.2) : rng.range(3.8, 5) },
        tumbling(matrix => cube('lock-tumble', { center: C, size: 2.8, matrix, role: 'visitor' }), rng, 5),
        tumbling(matrix => octa ? octahedron('lock-octa', { center: C, size: 2.2, matrix, role: 'visitor' }) : tetrahedron('lock-tetra', { center: C, size: 2.7, matrix, role: 'visitor' }), rng, 3),
      ] };
    },
    stars: [
      { kind: 'complete', label: '打开 5 把锁' },
      { kind: 'parTime', value: 50, label: '50 秒内' },
      { kind: 'noReveal', label: '不偷看侧面' },
    ],
    hints: [
      { idle: 5, text: 'Q / E · 滚轮：换层，让截面贴合金色轮廓' },
      { idle: 22, text: '卡住了？按 V 偷看侧面' },
    ],
  },
  {
    id: 'escape', title: '越墙', mode: 'explore',
    garden: { axis: 7.2, left: { x: 5.5, y: 6, z: 1 }, right: { x: 8.9, y: 6, z: 1 }, bud: { x: 5.5, y: 8.4, z: 2.5 },
      drops: { probe: [{ x: 4, y: 9.8 }], mirror: [{ x: 4.5, y: 4.5 }, { x: 9.9, y: 4.5 }] } },
    tagline: '四面都是墙。旗子在外面。',
    bounds: BOUNDS, slice: { min: 0, max: 6, start: 1 },
    player: { x: 10, y: 6, r: .4, canMove: true }, sideView: 'full',
    solids: [
      ...ROOM,
      rect('pillar', 14.6, 1.5, 15.4, 10.5, [3, 6], { role: 'wall', solid: true }),
      rect('flag', 16.6, 5.6, 17.4, 6.4, [0, 2], { role: 'goal', label: '旗' }),
    ],
    hazards: [{ id: 'buoy', kind: 'sphere', center: [15.8, 6, 2.6], r: 1, bob: { amp: 2.2, period: 3.6 } }],
    build: rng => ({ shards: pickGroups(rng, [
      [{ x: 8.4, y: 4.8, z: [.3, 1.1] }, { x: 2, y: 10.4, z: [.2, 1] }],
      [{ x: 11.7, y: 7.2, z: [4.3, 5.1] }, { x: 4, y: 1.8, z: [2.3, 3.1] }],
      [{ x: 17.8, y: 2, z: [4.6, 5.4] }, { x: 18.4, y: 10.4, z: [3.6, 4.4] }],
    ]) }),
    goals: [{ id: 'flag', kind: 'reach', solid: 'flag' }],
    stars: [
      { kind: 'complete', label: '碰到旗子' },
      { kind: 'allShards', label: '收齐 3 枚光屑' },
      { kind: 'parTime', value: 32, label: '32 秒内' },
    ],
    hints: [{ idle: 4, text: 'WASD / 拖动：移动 · Q / E · 滚轮：换层' }],
  },
  {
    id: 'vault', title: '潜入', mode: 'explore',
    garden: { axis: 10, left: { x: 7.1, y: 5.7, z: 2.7 }, right: { x: 12.9, y: 5.7, z: 2.7 }, bud: { x: 7.1, y: 3.3, z: 1.2 },
      drops: { probe: [{ x: 6.1, y: 1.8 }], mirror: [{ x: 6.8, y: 7.2 }, { x: 13.2, y: 7.2 }] } },
    tagline: '钥匙锁在盒子里。别被看见。',
    bounds: BOUNDS, slice: { min: 0, max: 6, start: 1.2 },
    player: { x: 3, y: 6, r: .4, canMove: true }, sideView: 'player-only', abilities: { peek: true },
    solids: [
      rect('box-n', 8, 4, 12, 4.35, [0, 4], { role: 'wall', solid: true }),
      rect('box-s', 8, 7.65, 12, 8, [0, 4], { role: 'wall', solid: true }),
      rect('box-w', 8, 4, 8.35, 8, [0, 4], { role: 'wall', solid: true }),
      rect('box-e', 11.65, 4, 12, 8, [0, 4], { role: 'wall', solid: true }),
      { id: 'vault-key', kind: 'prism', polygon: [[9.55,5.7],[10,5.7],[10,5.9],[10.65,5.9],[10.65,6.3],[10.4,6.3],[10.4,6.1],[10,6.1],[10,6.3],[9.55,6.3]],
        z: [1, 1.5], role: 'item', label: '钥匙', occluded: true },
      rect('vault-door', 16.6, 5.4, 17.4, 6.6, [0, 2], { role: 'door', label: '门' }),
    ],
    guards: [
      { id: 'guard-west', label: '守卫', patrol: [[6,4.5],[6,7.5]], speed: 1, z: [.85,1.55], r: .32, range: 4.2, halfAngle: Math.PI / 4 },
      { id: 'guard-east', label: '守卫', patrol: [[14,7.5],[14,4.5]], speed: .8, z: [.85,1.55], r: .32, range: 4.2, halfAngle: Math.PI / 4 },
    ],
    build: rng => ({ shards: pickGroups(rng, [
      [{ x: 9, y: 7, z: [2.4, 3.2] }, { x: 11, y: 5, z: [2.4, 3.2] }],
      [{ x: 6, y: 2.6, z: [.9, 1.5] }, { x: 14, y: 9.4, z: [.9, 1.5] }],
      [{ x: 2.5, y: 10.5, z: [5, 5.8] }, { x: 17.5, y: 1.5, z: [5, 5.8] }],
    ]) }),
    goals: [
      { id: 'take-key', kind: 'pickup', solid: 'vault-key' },
      { id: 'open-door', kind: 'unlock', solid: 'vault-door', requires: 'vault-key' },
    ],
    stars: [
      { kind: 'complete', label: '拿钥匙开门' },
      { kind: 'allShards', label: '收齐 3 枚光屑' },
      { kind: 'noAlerts', label: '一次也没被发现' },
    ],
    hints: [{ idle: 6, text: '按住 Space：看看脚下' }],
  },
  {
    id: 'mirror', title: '镜之锁', mode: 'mirror',
    garden: { axis: 10, left: { x: 6.5, y: 8.9, z: 3 }, right: { x: 13.5, y: 8.9, z: 3 }, bud: { x: 13.5, y: 6.5, z: 4.5 },
      drops: { probe: [{ x: 14.5, y: 4.8 }], mirror: [{ x: 6.5, y: 10.4 }, { x: 13.5, y: 10.4 }] } },
    tagline: '三把锁，一把钥匙。',
    bounds: BOUNDS, slice: { min: 0, max: 6, start: 3, fixed: true },
    player: { x: 3, y: 6, r: .4, canMove: true }, sideView: 'flip', abilities: { flip: true },
    flipPad: 'flip-pad',
    solids: [
      { id: 'mirror-key', kind: 'prism', polygon: keyShape(5, 6).points, z: [2.9, 3.1], role: 'item', label: '钥匙' },
      rect('flip-pad', 8.8, 4.8, 11.2, 7.2, [2.9, 3.1], { role: 'pad', label: 'F' }),
    ],
    goals: [{ id: 'take-mirror-key', kind: 'pickup', solid: 'mirror-key' }],
    build: rng => {
      const all = [];
      for (const chirality of [1, -1]) for (let turns = 0; turns < 4; turns++) if (chirality === -1 || turns) all.push({ chirality, turns });
      let poses;
      do poses = rng.shuffle(all).slice(0, 3); while (!poses.some(p => p.chirality === -1) || !poses.some(p => p.chirality === 1));
      const locks = poses.map((pose, i) => ({ id: `lock-${i}`, x: 16.8, y: MIRROR_LOCK_Y[i], ...pose }));
      return { mirrorLocks: locks, parActions: mirrorPar(poses) + 1 };
    },
    stars: [
      { kind: 'complete', label: '打开 3 把锁' },
      { kind: 'parActions', label: '转动 + 翻面 ≤ {par} 次' },
      { kind: 'parTime', value: 40, label: '40 秒内' },
    ],
    hints: [{ idle: 6, text: 'Space：转动钥匙 · 站上紫色台按 F：翻面' }],
  },
  {
    id: 'ascend', title: '升维', mode: 'ascend',
    garden: { axis: 12.8, left: { x: 11.2, y: 6, z: 2.8 }, right: { x: 14.4, y: 6, z: 2.8 }, bud: { x: 14.4, y: 3.6, z: 4.3 },
      drops: { probe: [{ x: 16, y: 2.2 }], mirror: [{ x: 10.2, y: 4.5 }, { x: 15.4, y: 4.5 }] } },
    tagline: '再逃一次。这一次，墙是立体的。',
    bounds: BOUNDS, slice: { min: 0, max: 6, start: 1 },
    player: { x: 10, y: 6, r: .4, canMove: true }, sideView: 'full', dimensionLesson: true,
    solids: [...ROOM, rect('flag', 16.6, 5.6, 17.4, 6.4, [0, 2], { role: 'goal', label: '旗' })],
    goals: [{ id: 'escape-both', kind: 'reach', solid: 'flag' }],
    stars: [
      { kind: 'complete', label: '两次都逃出去' },
      { kind: 'maxSliceMoves', value: 4, label: '换层不超过 4 次' },
      { kind: 'parTime', value: 22, label: '22 秒内' },
    ],
    hints: [{ idle: 6, text: 'WASD：移动 · Q / E：换层' }],
    volumeHints: [{ idle: 6, text: 'Q / E · 滚轮：换 W' }],
  },
  {
    id: 'storm', title: '风暴', mode: 'storm', endless: true,
    tagline: '东西从上面、从下面穿过你的世界。活下去，顺手捡点光屑。',
    bounds: BOUNDS, slice: { min: 0, max: 6, start: 3 },
    player: { x: 10, y: 6, r: .4, canMove: true }, sideView: 'full',
    stormRules: { lives: 3, invulnerable: 1.4, levelEvery: 12, shardLife: 8, maxShards: 2, comboWindow: 3.5 },
    stars: [
      { kind: 'score', value: 2000, label: '得分 ≥ 2000' },
      { kind: 'score', value: 6000, label: '得分 ≥ 6000' },
      { kind: 'score', value: 15000, label: '得分 ≥ 15000' },
    ],
    hints: [{ idle: 3, text: '躲开红色截面 · 收集光屑' }, { idle: 7, text: '贴近危险再脱身：险过 +75' }],
  },
]);

// Levels that unlock from an earlier one instead of the immediately preceding level.
export const UNLOCK_FROM = Object.freeze({ storm: 'escape' });
export const UPCOMING = Object.freeze([]);
