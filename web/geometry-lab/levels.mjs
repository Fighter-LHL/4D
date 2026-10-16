// Chapters and levels. Chapter 0 (Flatland) and chapter 1 share the same
// (x, z, W) layouts on purpose: the map the Flatlander trusted is exactly the
// W map one dimension up. Chapter 2 hides the map to test transfer.
import { SINGLE, TRANSFER, TWINS, CORRIDOR, ROOM, GATE, TWO_ROOMS, TIDAL, ISLANDS, flatVariant } from './geometry.mjs';

const trial = (body, from, to, prompt) => Object.freeze({ body, from, to, prompt });

export const CHAPTERS = Object.freeze([
  {
    id: 0,
    name: '扁平国',
    tag: 'FLATLAND',
    blurb: '先当一个二维光点。',
    axis: '第三维',
    intro: {
      kicker: '第 0 章 · 扁平国',
      title: '你只能看见一层。',
      body: '你是一个二维光点，整个世界就是薄薄的一层。右边是这个世界的全貌：竖直方向，是你看不见的第三维。',
    },
    why: {
      kicker: '为什么会这样',
      title: '球穿过平面，留下圆。',
      body: '你的世界是一张平面。三维的球穿过它，留下大小不同的圆；方块穿过它，要么是完整的方形，要么什么都没有。滑轨只决定平面切在哪一层。',
      formula: 'r = √(R² − (h − h₀)²)',
    },
  },
  {
    id: 1,
    name: '升一维',
    tag: 'ONE UP',
    blurb: '同样的规则，你变成三维的。',
    axis: 'W',
    intro: {
      kicker: '第 1 章 · 升一维',
      title: '现在，你是三维的。',
      body: '你看到的三维空间，也只是四维世界的一层。扁平国里的「上下」，在这里叫 W。右边还是同一张图——竖直方向就是 W。',
    },
    why: {
      kicker: '为什么会这样',
      title: '超球穿过三维，留下球。',
      body: '四维超球被三维空间切开，留下大小不同的球；四维方块切开是完整的三维方块，或者什么都没有。W 地图画的是：在你脚下的高度，每个物体在 (x, z, W) 里占据的全部范围。',
      formula: 'r = √(R² − (W − W₀)²)',
    },
  },
  {
    id: 2,
    name: '只靠截面',
    tag: 'NO MAP',
    blurb: '地图收起来，只靠你看到的这一片。',
    axis: 'W',
    intro: {
      kicker: '第 2 章 · 只靠截面',
      title: '地图收起来了。',
      body: '这一章，W 地图默认隐藏。你只能看到当前这一片三维世界。真的需要时可以窥视地图，但会被记下来。',
    },
    why: {
      kicker: '你已经在用第四维思考',
      title: '墙不是消失了，是你换了一层。',
      body: '门在身后关上、房间在 W 的两端交替封闭——这些在三维里不可能的事，只是你在四维里走了一条普通的路。',
      formula: '通路 = 当前截面里的空地',
    },
  },
].map(Object.freeze));

export const LEVELS_LIST = Object.freeze([
  {
    id: '0-1', chapter: 0, kind: 'visit', view: 'flat', map: 'shown',
    title: '访客',
    done: '你看见了一个球——一圈一圈地。',
    bodies: [SINGLE], goal: 'appear-vanish', startDial: 0.04,
    objective: '拖动右侧滑轨，让访客出现，再让它消失。',
    predictObjective: '先猜，再看。',
    trials: [
      trial(SINGLE, 0.04, 0.28, '把这一层往上移到标记处，会发生什么？'),
      trial(SINGLE, 0.28, 0.5, '继续往上，圆会怎样？'),
      trial(SINGLE, 0.76, 0.96, '从这里再往上，圆还会留下吗？'),
    ],
    hints: [
      '滑轨会把你的这一层上下移动。',
      '看右边的全貌：发光的平面就是你的世界。',
      '把平面移出玻璃球的上方或下方，圆就消失了。',
    ],
  },
  {
    id: '0-2', chapter: 0, kind: 'walk', view: 'flat', map: 'shown',
    title: '两堵墙', field: flatVariant(CORRIDOR),
    done: '你从「上下」绕过了两堵墙。',
    objective: '走到右边的金色出口。',
    hints: [
      '被挡住时，看右边全貌：你的竖直白虚线穿过了哪块玻璃墙？',
      '蓝墙在下层、橙墙在上层，金色出口只在中间层打开。',
      '先调到上层绕过蓝墙，站在地面虚线之外，再调到下层绕过橙墙，最后回到中间层进入出口。',
    ],
  },
  {
    id: '0-3', chapter: 0, kind: 'walk', view: 'flat', map: 'shown',
    title: '没有门的房间', field: flatVariant(ROOM),
    done: '你从没有门的房间里走出来了。',
    objective: '离开这个房间，走到出口。',
    hints: [
      '四面墙在你这一层里是封死的，而金色出口也在这一层。',
      '全貌里，墙只占了竖直方向中间的一段（紫色）。',
      '把你的层移到墙的上方（暖橙）或下方（冷蓝）走出房间，再移回中间层让出口重新亮起。',
    ],
  },
  {
    id: '1-1', chapter: 1, kind: 'visit', view: 'slice', map: 'shown',
    title: '两位访客',
    done: '同一片空间里，各有各的变化。',
    bodies: TWINS, goal: 'together', startDial: 0.1,
    objective: '找到一个 W，让两位访客同时出现。',
    predictObjective: '先猜，再看。',
    trials: [
      trial(SINGLE, 0.5, 0.76, '把 W 往上移到标记处，这个球会怎样？'),
      trial(SINGLE, 0.3, 0.7, '只比较起点和终点，球的大小会怎样？'),
      trial(TRANSFER, 0.48, 0.61, '这枚超球偏向 +W 一侧。往上移呢？'),
    ],
    hints: [
      '右边 W 地图里，左边的蓝球偏 −W（下），右边的橙球偏 +W（上）。',
      '发光的平面要同时穿过两颗球重叠的中段。',
      '把切片移到中间的淡紫层，让平面同时切过两颗球。',
    ],
  },
  {
    id: '1-2', chapter: 1, kind: 'walk', view: 'slice', map: 'shown',
    title: '两堵墙', field: CORRIDOR,
    done: '同一张地图，升了一维。',
    objective: '走到右边的金色出口。',
    hints: [
      '和扁平国的「两堵墙」是同一张地图：地面虚线标出了其他 W 层的墙与中间圆球。',
      '近处蓝墙在 −W（下），远处橙墙在 +W（上），金色出口只在中间层亮起。',
      '先往上调到 +W 走过第一道虚线，停在空地，再往下调到 −W 走过第二道墙，最后回到中间层进入出口。',
    ],
  },
  {
    id: '1-3', chapter: 1, kind: 'walk', view: 'slice', map: 'shown',
    title: '不可能的密室', field: ROOM,
    done: '三维里没有门，四维里有。',
    objective: '离开这间没有门的屋子。',
    hints: [
      '四面墙在当前这一片三维空间里是封死的，金色出口也只在中间层打开。',
      '看右边 W 地图（或滑轨旁边的刻度）：紫色的屋墙只占了中间几层，上下两头都是空的。',
      '把 W 往暖橙（上）或冷蓝（下）一路调到底走出屋子，再把 W 调回中间层让出口亮起。',
    ],
  },
  {
    id: '2-1', chapter: 2, kind: 'walk', view: 'slice', map: 'hidden',
    title: '门', field: GATE,
    done: '门在你身后关上了。',
    objective: '穿过这堵墙，到达出口。',
    hints: [
      '中间那段门偏冷色，说明它在 −W 一侧：往 +W 调，它会变淡、消失。',
      '门消失后，门后会立起一堵暖橙色的墙（它在 +W），出口也变成了地面虚线环。',
      '趁门打开时穿过门，停在后墙前，再把 W 往下调回中间层——门在身后关上，后墙消失，出口重新亮起。',
    ],
  },
  {
    id: '2-2', chapter: 2, kind: 'walk', view: 'slice', map: 'hidden',
    title: '两间屋子', field: TWO_ROOMS,
    done: '你在两间封闭的屋子之间走了一趟。',
    objective: '从左边的屋子，走进右边的屋子。',
    hints: [
      '两间屋子的墙颜色不同：左屋偏暖橙（在 +W 一侧），右屋偏冷蓝（在 −W 一侧），出口只在中间层打开。',
      '先把 W 往下往冷色层调，直到左屋边缘变虚、整间消失；走出去，停在两屋之间的空地上。',
      '再把 W 往上往暖色层调让右屋消失，走进右屋中央，最后把 W 调回中间层让右屋合拢、出口亮起。',
    ],
  },
  {
    id: '2-3', chapter: 2, kind: 'walk', view: 'slice', map: 'hidden',
    title: '潮汐', field: TIDAL,
    done: '球群在四维里消长，你从缝隙间游了过去。',
    objective: '借超球的涨缩挤出通路，抵达出口。',
    hints: [
      '左边两颗暖色超球偏 +W，右边两颗冷色超球偏 −W；往相反方向调 W，球就会缩小、让出缝隙。',
      '先把 W 往下往冷色层调，左边两颗暖球会缩小分开；穿过缝隙后，停在中间偏空的一侧。',
      '在中间空地把 W 往上往暖色层调，右边两颗冷球会缩小分开；穿过后再把 W 调回中间层打开出口。',
    ],
  },
  {
    id: '2-4', chapter: 2, kind: 'walk', view: 'slice', map: 'hidden',
    title: '踏脚石', field: ISLANDS,
    done: '你找准每一处安全的落脚岛，在四维迷宫里穿行自如。',
    objective: '找准不会让超球膨胀吞没你的空地，分段换 W 抵达出口。',
    hints: [
      '起点旁边的暖橙球在 +W 会膨胀——先往南走到左下的安全空地，再把 W 往暖色层调打开左边的蓝墙。',
      '从南侧走进中庭后，中庭南侧在 −W 会被蓝球占满；趁中间紫球缩小，往北走到中庭北侧的空地。',
      '在中庭北侧把 W 往冷色层调打开右边的橙墙，走进右庭后再往南走到出口环上，把 W 调回中间层。',
    ],
  },
].map(Object.freeze));

export const levelById = (id) => LEVELS_LIST.find((level) => level.id === id) ?? null;

export function nextLevel(id) {
  const index = LEVELS_LIST.findIndex((level) => level.id === id);
  return index >= 0 ? LEVELS_LIST[index + 1] ?? null : null;
}

export function isUnlocked(id, done) {
  const index = LEVELS_LIST.findIndex((level) => level.id === id);
  return index === 0 || (index > 0 && done.has(LEVELS_LIST[index - 1].id));
}

// Height of the cutting plane used for the W map and the Flatland view.
export const planeY = (level) => (level.kind === 'walk' ? level.field.tokenY : level.bodies[0].center[1]);
