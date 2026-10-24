import { rect, cube, alignToZ } from './geometry.js';
import { keyShape } from './mirror.js';
// Chapter 0. The player is a flat being in the XY plane at height s; the hidden
// third axis plays the role W plays in the courtyard. Each level teaches one idea.
const BOUNDS = Object.freeze({ w: 20, h: 12 });
const deepFreeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); } return value; };

export const FLATLAND_LEVELS = deepFreeze([
  {
    id: 'visitor',
    title: '访客',
    intro: '有位看不见的访客正停在你的世界里。拖动 S，让它的截面依次和三个圆环吻合。',
    concept: '三维的球穿过平面时，平面生物只能看到一个圆。圆的大小取决于你在第三维的高度，而且同样大小的圆会在球心上下各出现一次。',
    bounds: BOUNDS,
    slice: { min: 0, max: 6, start: .2 },
    player: { x: 3.2, y: 6, r: .4, canMove: false },
    sideView: 'full',
    solids: [{ id: 'ball', kind: 'sphere', center: [10, 6, 3], r: 2.5, role: 'visitor', solid: false }],
    goals: [
      { id: 'r10', kind: 'match', solid: 'ball', radius: 1, tolerance: .1 },
      { id: 'r25', kind: 'match', solid: 'ball', radius: 2.5, tolerance: .1 },
      { id: 'r15', kind: 'match', solid: 'ball', radius: 1.5, tolerance: .1 },
    ],
    quiz: { prompt: '半径 1.5 的圆，会在几个不同的 S 高度出现？', options: ['1 个', '2 个', '3 个'], answer: 1,
      explain: '两个：球心下方 S≈1 和上方 S≈5。截面只告诉你大小，看不出你在球的哪一半。' },
    stars: [
      { kind: 'complete', label: '点亮三个圆环' },
      { kind: 'maxTime', value: 30, label: '30 秒内点亮三个圆环' },
      { kind: 'all', of: [{ kind: 'quizCorrect' }, { kind: 'bothSides', goal: 'r15' }], label: '答对问题，并在两个高度都对上 1.5 的圆环' },
    ],
    hints: [
      { idle: 6, text: '这里好像什么都没有……拖动下方的 S 滑块，或按住 Q / E。' },
      { idle: 16, text: '看右边的侧视图：那条横线就是你所在的平面。' },
      { idle: 30, text: '横线穿过球心时截面最大；越靠近球的顶部或底部，圆越小。' },
    ],
  },
  {
    id: 'guess',
    title: '猜猜是谁',
    intro: '同一个立体，换个高度就换了一张面孔。先观察、再猜测，最后亲手验证。',
    concept: '一个截面不能告诉你立体的全部。比较不同高度的截面，才能分辨形状；立方体斜着放，中间也能切出六边形。',
    bounds: BOUNDS,
    slice: { min: 0, max: 6, start: .2 },
    player: { x: 3.2, y: 6, r: .4, canMove: false },
    sideView: 'full', solids: [], goals: [],
    rounds: [
      {
        id: 'hidden-shape', title: '从截面猜立体', start: .2, mode: 'observe', concealed: true,
        prompt: '拖动 S，在三个标记高度各停留片刻。这个藏起来的立体是什么？',
        solids: [cube('mystery', { center: [10, 6, 3], size: 3, role: 'visitor' })],
        observe: [1.7, 3, 4.3], verify: [3],
        options: [
          { label: '球', icon: 'sphere' }, { label: '立方体', icon: 'cube' },
          { label: '圆锥', icon: 'cone' }, { label: '横躺的圆柱', icon: 'cylinder' },
        ], answer: 1,
        explain: '这是正放的立方体。在这三个高度，截面都是同样大小的正方形；超过顶面或低于底面，截面才会消失。',
      },
      {
        id: 'cone-sequence', title: '从立体猜截面', start: 5.8, mode: 'predict', concealed: false,
        prompt: '圆锥的尖端朝上。把 S 从尖端上方一路降低到地面，截面会怎样变化？',
        knownShape: '尖端朝上的圆锥', icon: 'cone',
        solids: [{ id: 'cone', kind: 'cone', base: [10, 6, .5], height: 5, r: 2, role: 'visitor' }],
        verify: [5.25, 3, .6, .2],
        options: [
          { label: '小圆逐渐变大，最后消失', icon: 'growing' },
          { label: '大圆逐渐变小，最后消失', icon: 'shrinking' },
          { label: '圆的大小始终不变，最后消失', icon: 'constant' },
          { label: '一直是正方形，最后消失', icon: 'squares' },
        ], answer: 0,
        explain: '从高往低切：尖端附近是小圆，越接近底面圆越大，低于 S=0.5 的底面就消失。反过来升高，顺序也会反过来。',
      },
      {
        id: 'corner-cube', title: '立方体的新面孔', start: .2, mode: 'predict', concealed: false,
        prompt: '把立方体沿体对角线竖起来，一个顶点朝上。切片穿过正中央时，会是什么形状？',
        knownShape: '一个顶点朝上的立方体', icon: 'diagonal-cube',
        solids: [cube('corner-cube', { center: [10, 6, 3], size: 2, matrix: alignToZ([1, 1, 1]), role: 'visitor' })],
        verify: [1.55, 3, 4.45],
        options: [
          { label: '正方形', icon: 'square' }, { label: '六边形', icon: 'hexagon' },
          { label: '圆形', icon: 'circle' }, { label: '三角形', icon: 'triangle' },
        ], answer: 1,
        explain: '中间的平面同时切到了六个面，所以截面是六边形；靠近上下顶点时，截面又变成三角形。立体还是同一个立方体。',
      },
    ],
    stars: [
      { kind: 'complete', label: '完成三轮猜测与验证' },
      { kind: 'firstCorrect', value: 2, label: '至少两轮首次答对' },
      { kind: 'firstCorrect', value: 3, label: '三轮全部首次答对' },
    ],
    hints: [
      { idle: 20, text: '先看题目和高度标记：需要观察时，拖 S 到标记附近并停留片刻。' },
      { idle: 45, text: '猜错也可以继续。选完后再拖 S，用截面的变化检查你的猜想。' },
    ],
  },
  {
    id: 'escape',
    title: '跳出房间',
    intro: '你被四面墙关在房间里。找到出口旗。',
    concept: '在平面里四面封死的房间，在第三维上可能是敞开的。你没有穿墙，只是从墙的“上方”绕了过去。四维空间对三维房间也是一样。',
    bounds: BOUNDS,
    slice: { min: 0, max: 6, start: 1 },
    player: { x: 10, y: 6, r: .4, canMove: true },
    sideView: 'full',
    solids: [
      rect('wall-n', 7, 3.5, 13, 3.9, [0, 3.5], { role: 'wall', solid: true }),
      rect('wall-s', 7, 8.1, 13, 8.5, [0, 3.5], { role: 'wall', solid: true }),
      rect('wall-w', 7, 3.5, 7.4, 8.5, [0, 3.5], { role: 'wall', solid: true }),
      rect('wall-e', 12.6, 3.5, 13, 8.5, [0, 3.5], { role: 'wall', solid: true }),
      rect('pillar', 14.6, 1.5, 15.4, 10.5, [3, 6], { role: 'wall', solid: true }),
      rect('flag', 16.6, 5.6, 17.4, 6.4, [0, 2], { role: 'goal', solid: false }),
    ],
    goals: [{ id: 'flag', kind: 'reach', solid: 'flag' }],
    stars: [
      { kind: 'complete', label: '碰到出口旗' },
      { kind: 'maxSliceMoves', value: 4, label: '换高度不超过 4 次' },
      { kind: 'noBlocked', label: '一次也没被卡住' },
    ],
    hints: [
      { idle: 12, text: '四面都是墙。看看侧视图：这些墙有多高？' },
      { idle: 25, text: '把 S 拉到墙的高度以上，墙就不在你的平面里了。' },
      { idle: 45, text: '出了房间别忘了看旗子在什么高度。' },
    ],
  },
  {
    id: 'vault',
    title: '保险箱与守卫',
    intro: '拿到盒内的钥匙，打开右侧出口。按住 Space 俯视透视，查看你所在高度下方的世界。',
    concept: '盒墙只封住了平面。升到墙上方，你能俯视盒内，再从高处降到钥匙旁；低处的守卫看不到高处的你。',
    bounds: BOUNDS,
    slice: { min: 0, max: 6, start: 1.2 },
    player: { x: 3, y: 6, r: .4, canMove: true },
    sideView: 'player-only', abilities: { peek: true },
    solids: [
      rect('box-n', 8, 4, 12, 4.35, [0, 4], { role: 'wall', solid: true }),
      rect('box-s', 8, 7.65, 12, 8, [0, 4], { role: 'wall', solid: true }),
      rect('box-w', 8, 4, 8.35, 8, [0, 4], { role: 'wall', solid: true }),
      rect('box-e', 11.65, 4, 12, 8, [0, 4], { role: 'wall', solid: true }),
      { id: 'vault-key', kind: 'prism', polygon: [[9.55,5.7],[10,5.7],[10,5.9],[10.65,5.9],[10.65,6.3],[10.4,6.3],[10.4,6.1],[10,6.1],[10,6.3],[9.55,6.3]],
        z: [1, 1.5], role: 'item', label: '钥匙', occluded: true },
      rect('vault-door', 16.6, 5.4, 17.4, 6.6, [0, 2], { role: 'door', label: '出口门' }),
    ],
    guards: [
      { id: 'guard-west', label: '西侧守卫', patrol: [[6,4.5],[6,7.5]], speed: 1, z: [.85,1.55], r: .32, range: 4.2, halfAngle: Math.PI / 4 },
      { id: 'guard-east', label: '东侧守卫', patrol: [[14,7.5],[14,4.5]], speed: .8, z: [.85,1.55], r: .32, range: 4.2, halfAngle: Math.PI / 4 },
    ],
    goals: [
      { id: 'take-key', kind: 'pickup', solid: 'vault-key' },
      { id: 'open-door', kind: 'unlock', solid: 'vault-door', requires: 'vault-key' },
    ],
    stars: [
      { kind: 'complete', label: '拿到钥匙并打开出口' },
      { kind: 'noAlerts', label: '没有被守卫发现' },
      { kind: 'maxPeekUses', value: 2, label: '透视不超过 2 次' },
    ],
    hints: [
      { idle: 15, text: '试着升到盒墙上方，再按住 Space 看看下方。侧视图这次只显示你的高度。' },
      { idle: 35, text: '透视的虚影不能直接碰到。走到钥匙上方，再降到它所在的高度。' },
      { idle: 60, text: '盒墙高到 S=4，钥匙在 S=1–1.5。拿到后先升高离开，去门口再降到 S≤2。' },
    ],
  },
  {
    id: 'mirror', title: '镜之锁',
    intro: '拿起 L 形钥匙，试试右侧锁孔。R 在平面内旋转；带钥匙站上翻转台，按 F 先预测，再翻转。',
    concept: '平移和在平面内旋转都保留钥匙的手性。借第三维绕 X 轴翻过半圈，钥匙回到平面时成为镜像，才能匹配镜之锁。',
    bounds: BOUNDS, slice: { min: 0, max: 6, start: 3, fixed: true },
    player: { x: 3, y: 6, r: .4, canMove: true },
    sideView: 'flip', abilities: { flip: true },
    flipPad: 'flip-pad',
    solids: [
      { id: 'mirror-key', kind: 'prism', polygon: keyShape(5, 6).points, z: [2.9, 3.1], role: 'item', label: 'L 形钥匙' },
      rect('flip-pad', 8.8, 4.8, 11.2, 7.2, [2.9, 3.1], { role: 'pad', label: '翻转台 · F' }),
      { id: 'mirror-lock', kind: 'prism', polygon: keyShape(17, 6, -1).points, z: [2.9, 3.1], role: 'lock', label: '镜之锁' },
    ],
    goals: [
      { id: 'take-mirror-key', kind: 'pickup', solid: 'mirror-key' },
      { id: 'open-mirror-lock', kind: 'unlock', solid: 'mirror-lock', requires: 'mirror-key', chirality: -1, turns: 0 },
    ],
    stars: [
      { kind: 'complete', label: '用镜像钥匙打开锁' },
      { kind: 'flipPrediction', label: '翻转前的首次预测正确' },
      { kind: 'singleFlip', label: '只翻转 1 次' },
    ],
    hints: [
      { idle: 18, text: '拿起左边的钥匙，再靠近右侧锁孔。按 R 可以试着在平面里转动钥匙。' },
      { idle: 38, text: '钥匙与锁孔像照镜子。带钥匙站上中间的翻转台，按 F。' },
      { idle: 65, text: '翻一次就会成为镜像；翻两次会回到原样。镜像正确后，可用 R 调整方向。' },
    ],
  },
  {
    id: 'ascend', title: '升维',
    intro: '先复习一次：换 S 走出平面房间，碰到门外的旗。然后，把同样的办法带进三维房间。',
    concept: '你刚才对平面生物做的事，四维生物也能对你做。换 W 时，你的 XYZ 位置没有改变；改变的是四维物体与当前空间相交的三维截面。',
    bounds: BOUNDS, slice: { min: 0, max: 6, start: 1 },
    player: { x: 10, y: 6, r: .4, canMove: true }, sideView: 'full', dimensionLesson: true,
    solids: [
      rect('wall-n', 7, 3.5, 13, 3.9, [0, 3.5], { role: 'wall', solid: true }),
      rect('wall-s', 7, 8.1, 13, 8.5, [0, 3.5], { role: 'wall', solid: true }),
      rect('wall-w', 7, 3.5, 7.4, 8.5, [0, 3.5], { role: 'wall', solid: true }),
      rect('wall-e', 12.6, 3.5, 13, 8.5, [0, 3.5], { role: 'wall', solid: true }),
      rect('flag', 16.6, 5.6, 17.4, 6.4, [0, 2], { role: 'goal', label: '门外的旗' }),
    ],
    goals: [{ id: 'escape-both', kind: 'reach', solid: 'flag' }],
    stars: [
      { kind: 'complete', label: '完成平面与立体两次逃离' },
      { kind: 'maxSliceMoves', value: 4, label: '合计换切片不超过 4 次' },
      { kind: 'noBlocked', label: '没有被实体挡住' },
    ],
    hints: [
      { idle: 18, text: '平面房间的墙只到 S=3.5。升高走出去，再降下来碰旗。' },
      { idle: 40, text: '先从高处绕出房间。旗在 S≤2，回到它所在的高度。' },
    ],
    volumeHints: [
      { idle: 18, text: '试着换 W，观察墙和屋顶是否还在。XYZ 坐标会保持原位。' },
      { idle: 40, text: '墙只存在于 W≤0.58。换到 W=0.82，走到房间外。' },
      { idle: 65, text: '出口只在 W≤0.32。到右侧门口，再切回 W=0.18。' },
    ],
  },
]);

// Planned chapter-0 levels, shown as locked so the chapter's arc is visible.
export const UPCOMING = Object.freeze([]);
