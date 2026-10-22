// Chapters and levels. Chapter 0 (Flatland) and chapter 1 share the same
// (x, z, W) layouts on purpose: the map the Flatlander trusted is exactly the
// W map one dimension up. Chapter 2 hides the map to test transfer.
import { SINGLE, TRANSFER, TWINS, CORRIDOR, CORRIDOR_3D, ROOM, ROOM_3D, GATE, TWO_ROOMS, TIDAL, ISLANDS, FETCH_ROOM, STATION_ROOM, STATION_ROUTES_ROOM, flatVariant } from './geometry.mjs';

const trial = (body, from, to, prompt) => Object.freeze({ body, from, to, prompt });

export const FETCH_LEVEL = Object.freeze({
  id: 'fetch',
  chapter: 1,
  standalone: true,
  kind: 'walk',
  view: 'slice',
  map: 'shown',
  title: '无门取物',
  field: FETCH_ROOM,
  done: '房间仍然锁着，但里面的东西已经带出来了。',
  objective: '把屋里的东西带到这里。门打不开。',
  hints: [
    '换层时，留意不同颜色的墙有什么变化。',
    '晶核让你占的空间变大了。看看房间的其他边界。',
    '带着物体先往屋内南侧挪一步（或先放下物体探路），再把 W 往暖橙（上）调让南墙整面打开，从南侧绕回屋外的金色接收台后把 W 调回中间层。',
  ],
});

export const STATION_LEVEL = Object.freeze({
  id: 'station', chapter: 1, standalone: true, kind: 'walk', view: 'slice', map: 'shown',
  title: '中转站', field: STATION_ROOM,
  objective: '把晶核送到隔墙另一侧的接收台。',
  done: '晶核送到了。回廊也留了下来。',
  hints: [
    '蓝色插座和隔墙上的门，由同一条线路相连。',
    '插座在蓝层。晶核留在那里时，你可以独自去其他层。',
    '把晶核放进蓝层插座，去暖层穿过通电的门；在另一侧的中间层拉开回廊，再回来取晶核送到接收台。',
  ],
});

export const STATION_ROUTES_LEVEL = Object.freeze({
  id: 'station-routes', chapter: 1, standalone: true, kind: 'walk', view: 'slice', map: 'shown',
  title: '中转站·两种办法', field: STATION_ROUTES_ROOM,
  objective: '把晶核送到接收台。运送路线由你决定。',
  done: '晶核送到了。还有另一种办法。',
  hints: [
    '三处开口各不相同：一处连着线路，一处通向球体，一处带着机械锁。',
    '晶核可以留在蓝色插座继续供电。也可以抱着它走中间通道，留意门后能安全改变 W 的空地。',
    '直接运送：调到暖侧，携核进入中间通道；走过入口后，在两道侧墙之间的空地转向冷侧，让出口球体缩小，再去接收台回到 W=0。另一种办法：在蓝侧插座供电，空手从北门穿过；离开北门后回到 W=0，绕过中间通道到南侧开关打开回廊，再返回取核，沿回廊运送。',
  ],
});

export const LAB_LEVEL = Object.freeze({
  id: 'lab',
  chapter: 1,
  standalone: true,
  kind: 'visit',
  view: 'slice',
  map: 'shown',
  forceTrials: true,
  title: '原理实验室',
  done: '你完成了全部截面预测实验。',
  bodies: [SINGLE],
  goal: 'appear-vanish',
  startDial: 0.04,
  objective: '自由拖动滑轨观察超球截面，或直接开始 6 道截面变化预测。',
  predictObjective: '先猜，再看。',
  trials: [
    trial(SINGLE, 0.04, 0.28, '把这一层往上移到标记处，会发生什么？'),
    trial(SINGLE, 0.28, 0.5, '继续往上，截面会怎样？'),
    trial(SINGLE, 0.76, 0.96, '从这里再往上，截面还会留下吗？'),
    trial(SINGLE, 0.5, 0.76, '从中心往上移到标记处，这个球会怎样？'),
    trial(SINGLE, 0.3, 0.7, '只比较起点和终点，球的大小会怎样？'),
    trial(TRANSFER, 0.48, 0.61, '这枚超球偏向 +W 一侧。往上移呢？'),
  ],
  hints: [
    '越靠近超球在 W 轴上的中心，切出来的三维球就越大。',
    '当切片离开超球的 W 范围时，三维截面就会缩成一点并消失。',
    '超球截面半径遵循 r = √(R² − (W − W₀)²)，四维方块截面则要么完整存在、要么消失。',
  ],
});

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
    blurb: '地图默认收起，需要时可随时查看空间结构。',
    axis: 'W',
    intro: {
      kicker: '第 2 章 · 只靠截面',
      title: '地图收起来了。',
      body: '这一章，W 地图默认收起，只显示当前这一片三维世界。需要时可以随时展开查看空间结构。',
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
      '两堵墙的颜色不同。换层时，比较它们各自的变化。',
      '一堵墙让路时，另一堵墙可能还在。出口也有它所在的层。',
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
    title: '两堵墙', field: CORRIDOR_3D,
    done: '同一张底座，空中多了随 W 升降的浮球。',
    objective: '避开空中随 W 降下的浮球，走到出口。',
    hints: [
      '和扁平国的「两堵墙」同一底座，但中庭南侧半空多了一颗偏 +W 的暖色浮球。',
      '往上调到 +W 绕过近处蓝墙时，南侧浮球会往地面膨胀下沉，而北侧紫球会缩小让出空地。',
      '从 +W 走进中庭北侧空地，往下调到 −W 让南侧浮球升空消失、远处橙墙打开，走过去再回中间层进入出口。',
    ],
  },
  {
    id: '1-3', chapter: 1, kind: 'walk', view: 'slice', map: 'shown',
    title: '不可能的密室', field: ROOM_3D,
    done: '三维里没有门，四维里有。',
    objective: '离开这间没有门的屋子，绕开室外的浮球抵达出口。',
    hints: [
      '四面墙在当前这一片三维空间里是封死的，金色出口也只在中间层打开。',
      '看右边 W 地图：紫色的屋墙只占中间几层，但室外半空在 +W 和 −W 各守着一颗浮球。',
      '把 W 往暖橙（上）或冷蓝（下）调到底走出屋子，绕开室外降下的浮球走到金色虚线环上，再把 W 调回中间层。',
    ],
  },
  {
    id: '2-1', chapter: 2, kind: 'walk', view: 'slice', map: 'hidden',
    title: '门', field: GATE,
    done: '门在你身后关上了。',
    objective: '穿过这堵墙，到达出口。',
    hints: [
      '门和门后那堵墙，颜色并不相同。',
      '让一处通路打开时，留意另一处有什么变化。',
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
      '两间屋子不会在同一个方向打开。留意两屋之间那片空地。',
      '再把 W 往上往暖色层调让右屋消失，走进右屋中央，最后把 W 调回中间层让右屋合拢、出口亮起。',
    ],
  },
  {
    id: '2-3', chapter: 2, kind: 'walk', view: 'slice', map: 'hidden',
    title: '潮汐', field: TIDAL,
    done: '球群在四维里消长，你从缝隙间游了过去。',
    objective: '借超球的涨缩挤出通路，抵达出口。',
    hints: [
      '往同一个方向换层，两侧的球会有相反的变化。',
      '把滑轨拉到底，空隙不一定最大。留意途中出现的缝隙。',
      '在中间南侧把 W 往上调到适中的暖色层（别拉到底），穿过右边缩小的冷球后，把 W 调回中间层打开出口。',
    ],
  },
  {
    id: '2-4', chapter: 2, kind: 'walk', view: 'slice', map: 'hidden',
    title: '踏脚石', field: ISLANDS,
    done: '你找准每一处安全的落脚岛，在四维迷宫里穿行自如。',
    objective: '穿过三座院落，抵达金色出口。',
    hints: [
      '隔墙的开口交错着。不是每一处空地都适合换层。',
      '换层受阻时，看看脚边是哪颗球正在变大。',
      '从北门进右庭后，往南避开东北角的暖球走到出口虚线环上，再把 W 调回中间层点亮出口。',
    ],
  },
].map(Object.freeze));

export const EXTRA_LEVELS = Object.freeze([FETCH_LEVEL, STATION_LEVEL, STATION_ROUTES_LEVEL, LAB_LEVEL]);

export const levelById = (id) =>
  EXTRA_LEVELS.find((level) => level.id === id)
  ?? LEVELS_LIST.find((level) => level.id === id)
  ?? null;

export function nextLevel(id) {
  if (id === 'fetch') return STATION_LEVEL;
  if (id === 'station') return STATION_ROUTES_LEVEL;
  if (id === 'station-routes') return LEVELS_LIST[0];
  const index = LEVELS_LIST.findIndex((level) => level.id === id);
  return index >= 0 ? LEVELS_LIST[index + 1] ?? null : null;
}

export function isUnlocked(id, done) {
  if (EXTRA_LEVELS.some((level) => level.id === id)) return true;
  const index = LEVELS_LIST.findIndex((level) => level.id === id);
  return index === 0 || (index > 0 && done.has(LEVELS_LIST[index - 1].id));
}

// Height of the cutting plane used for the W map and the Flatland view.
export const planeY = (level) => (level.kind === 'walk' ? level.field.tokenY : level.bodies[0].center[1]);
