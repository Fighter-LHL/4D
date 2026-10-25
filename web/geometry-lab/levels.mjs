// Chapters and levels. Chapter 0 (Flatland) and chapter 1 share the same
// (x, z, W) layouts on purpose: the map the Flatlander trusted is exactly the
// W map one dimension up. Chapter 2 hides the map to test transfer.
import { SINGLE, TRANSFER, TWINS, CORRIDOR, CORRIDOR_3D, ROOM, ROOM_3D, GATE, TWO_ROOMS, TIDAL, ISLANDS, GATE_ROOM, FETCH_ROOM, STATION_ROOM, STATION_ROUTES_ROOM, SENTRY_HALL, flatVariant } from './geometry.mjs';

const trial = (body, from, to, prompt) => Object.freeze({ body, from, to, prompt });

export const GATE_LEVEL = Object.freeze({
  id: 'gate', chapter: 1, standalone: true, kind: 'walk', view: 'slice', map: 'shown',
  title: '球门', field: GATE_ROOM,
  objective: '走到东边的出口。',
  done: '球没有消失，你换到了它外面的一层。',
  hints: Object.freeze([
    '往两个方向都走走，看球怎么变。',
    '冷的那边还藏着别的东西。暖的那边，走到底。',
    '在空地把 W 推到暖端：球胀大又缩没。穿过窄道，离开板墙后回到中间层。',
  ]),
});

export const GATE_BLIND_LEVEL = Object.freeze({
  ...GATE_LEVEL, id: 'gate-blind', title: '球门·盲走', map: 'hidden',
});

// At the hall's centre, guards stand back to back — but in different W:
// west-facing in W 0 and −W, east-facing in W 0 and +W. Each gap is open in
// exactly one layer; a yard guard watches the exit layer. Verified solvable
// from every patrol phase, and impossible at any single fixed W.
const post = (id, w, x, yaw, period, back = null) => Object.freeze({
  id, w, radius: 0.75, y: 0.55, path: Object.freeze([Object.freeze([x, 0])]),
  scan: Object.freeze({ center: yaw, amp: 0.2, period, back }),
});
const WEST = -Math.PI / 2;
const EAST = Math.PI / 2;
export const SENTRY_LEVEL = Object.freeze({
  id: 'sentry', chapter: 1, standalone: true, kind: 'walk', view: 'slice', map: 'shown',
  title: '哨兵回廊', field: SENTRY_HALL,
  objective: '别被守卫看见，到达出口。',
  done: '溜过去了。',
  sentries: Object.freeze([
    post('sentry-zero-west', 0, -0.4, WEST, 5),
    post('sentry-zero-east', 0, 0.4, EAST, 5.6),
    post('sentry-warm-east', 1.4, 0.4, EAST, 4.4, Object.freeze({ every: 7, hold: 1.4 })),
    post('sentry-cold-west', -1.4, -0.4, WEST, 4.8, Object.freeze({ every: 7, hold: 1.4, offset: 3.5 })),
    Object.freeze({ id: 'sentry-yard', w: 0, radius: 0.6, y: 0.55, speed: 0.75, pause: 0.9,
      path: Object.freeze([[2.3, 1.45], [3.35, 1.45], [3.35, -1.45], [2.3, -1.45]].map(Object.freeze)) }),
  ]),
  hints: Object.freeze([
    '它们只看得见同一层的你。',
    '每道缺口，只有一层没人盯着。',
    '暖层过西口，在中庭换到冷层过东口，到出口旁再回中间层。',
  ]),
});

export const FETCH_LEVEL = Object.freeze({
  id: 'fetch',
  chapter: 1,
  standalone: true,
  kind: 'walk',
  view: 'slice',
  map: 'shown',
  title: '密室',
  field: FETCH_ROOM,
  done: '房间仍然锁着，但里面的东西已经带出来了。',
  objective: '把屋里的东西带到这里。门打不开。',
  hints: [
    '门打不开。墙，也未必一直在。',
    '抱着晶核，你会变胖。',
    '抱着晶核先往屋内南侧挪一步，把 W 推向暖端，南墙会让开；绕回屋外的接收台，再回中间层。',
  ],
});

export const STATION_LEVEL = Object.freeze({
  id: 'station', chapter: 1, standalone: true, kind: 'walk', view: 'slice', map: 'shown',
  title: '旧中转站', field: STATION_ROOM,
  objective: '把晶核送到隔墙另一侧的接收台。',
  done: '晶核送到了。回廊也留了下来。',
  hints: [
    '蓝色插座连着隔墙上的一扇门。',
    '晶核不一定要一直抱着。',
    '把晶核放进蓝层插座，去暖层穿过通电的门；在对面的中间层拉开回廊，回来取核，沿回廊送到接收台。',
  ],
});

export const STATION_ROUTES_LEVEL = Object.freeze({
  id: 'station-routes', chapter: 1, standalone: true, kind: 'walk', view: 'slice', map: 'shown',
  title: '中转站', field: STATION_ROUTES_ROOM,
  objective: '把晶核送到接收台。运送路线由你决定。',
  done: '晶核送到了。还有另一种办法。',
  hints: [
    '三处开口，各有各的脾气。',
    '一条路要抱着晶核换层，另一条路要先把它放下。',
    '直接走：暖层进中间通道，在两道侧墙之间换到冷层，出口的球会缩小，再回中间层交付。另一条：晶核插进蓝层插座，空手过北门，拉开南侧回廊，回来取核走回廊。',
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
  title: '截面实验室',
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
    name: '升维',
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
    name: '盲行',
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
    objective: '让访客出现，再让它消失。',
    predictObjective: '先猜，再看。',
    trials: [
      trial(SINGLE, 0.04, 0.28, '把这一层往上移到标记处，会发生什么？'),
      trial(SINGLE, 0.28, 0.5, '继续往上，圆会怎样？'),
      trial(SINGLE, 0.76, 0.96, '从这里再往上，圆还会留下吗？'),
    ],
    hints: [
      '拖动右边的滑轨试试。',
      '你的世界，就是右边那片发光的平面。',
      '把平面移出玻璃球的上方或下方，圆就没了。',
    ],
  },
  {
    id: '0-2', chapter: 0, kind: 'walk', view: 'flat', map: 'shown',
    title: '两堵墙', field: flatVariant(CORRIDOR),
    done: '你从「上下」绕过了两堵墙。',
    objective: '走到右边的金色出口。',
    hints: [
      '两堵墙，颜色不同。',
      '一次只有一堵会让开。',
      '上层绕过蓝墙，走出它的虚线后换到下层绕过橙墙，最后回中间层进出口。',
    ],
  },
  {
    id: '0-3', chapter: 0, kind: 'walk', view: 'flat', map: 'shown',
    title: '没有门的房间', field: flatVariant(ROOM),
    done: '你从没有门的房间里走出来了。',
    objective: '离开这个房间，走到出口。',
    hints: [
      '墙是封死的——只是在这一层。',
      '看右边的全貌：墙有多高？',
      '移到墙的上方或下方走出去，再回到中间层。',
    ],
  },
  {
    id: '1-1', chapter: 1, kind: 'visit', view: 'slice', map: 'shown',
    title: '两位访客',
    done: '同一片空间里，各有各的变化。',
    bodies: TWINS, goal: 'together', startDial: 0.1,
    objective: '让两位访客同时出现。',
    predictObjective: '先猜，再看。',
    trials: [
      trial(SINGLE, 0.5, 0.76, '把 W 往上移到标记处，这个球会怎样？'),
      trial(SINGLE, 0.3, 0.7, '只比较起点和终点，球的大小会怎样？'),
      trial(TRANSFER, 0.48, 0.61, '这枚超球偏向 +W 一侧。往上移呢？'),
    ],
    hints: [
      '一个偏冷，一个偏暖。',
      '它们在中间有一段重叠。',
      '把切片停在中间的淡紫层。',
    ],
  },
  {
    id: '1-2', chapter: 1, kind: 'walk', view: 'slice', map: 'shown',
    title: '两堵墙', field: CORRIDOR_3D,
    done: '同一张底座，空中多了随 W 升降的浮球。',
    objective: '避开空中随 W 降下的浮球，走到出口。',
    hints: [
      '还是那两堵墙，但半空多了一颗球。',
      '一边让开，另一边会落下来。',
      '从暖层走进中庭北侧空地，再换到冷层：浮球升走，远处的墙打开。过去后回中间层。',
    ],
  },
  {
    id: '1-3', chapter: 1, kind: 'walk', view: 'slice', map: 'shown',
    title: '不可能的密室', field: ROOM_3D,
    done: '三维里没有门，四维里有。',
    objective: '离开这间没有门的屋子，绕开室外的浮球抵达出口。',
    hints: [
      '这间屋子没有门。',
      '屋外两边的半空，各守着一颗球。',
      '把 W 推到一端走出屋子，绕开落下的浮球站上金圈，再回中间层。',
    ],
  },
  {
    id: '2-1', chapter: 2, kind: 'walk', view: 'slice', map: 'hidden',
    title: '门', field: GATE,
    done: '门在你身后关上了。',
    objective: '穿过这堵墙，到达出口。',
    hints: [
      '门和后墙，不是一伙的。',
      '一处打开的时候，另一处呢？',
      '趁门开着穿过去，停在后墙前，再回中间层：门在身后关上，后墙消失。',
    ],
  },
  {
    id: '2-2', chapter: 2, kind: 'walk', view: 'slice', map: 'hidden',
    title: '两间屋子', field: TWO_ROOMS,
    done: '你在两间封闭的屋子之间走了一趟。',
    objective: '从左边的屋子，走进右边的屋子。',
    hints: [
      '两间屋子，一冷一暖。',
      '它们不会朝同一边打开。',
      '往冷层走出左屋，在两屋之间换到暖层，右屋消失；走进右屋中央，再回中间层。',
    ],
  },
  {
    id: '2-3', chapter: 2, kind: 'walk', view: 'slice', map: 'hidden',
    title: '潮汐', field: TIDAL,
    done: '球群在四维里消长，你从缝隙间游了过去。',
    objective: '借超球的涨缩挤出通路，抵达出口。',
    hints: [
      '换一层，两边的球一胀一缩。',
      '推到底，缝不一定最大。',
      '在中间南侧把 W 推到半暖（别到底），穿过右边缩小的冷球，再回中间层。',
    ],
  },
  {
    id: '2-4', chapter: 2, kind: 'walk', view: 'slice', map: 'hidden',
    title: '踏脚石', field: ISLANDS,
    done: '你找准每一处安全的落脚岛，在四维迷宫里穿行自如。',
    objective: '穿过三座院落，抵达金色出口。',
    hints: [
      '开口是错开的。不是哪里都能换层。',
      '被挡住时，看看脚边哪颗球在变大。',
      '从北门进右庭，往南避开东北角的暖球，站上出口的虚线环，再回中间层。',
    ],
  },
].map(Object.freeze));

export const EXTRA_LEVELS = Object.freeze([GATE_LEVEL, GATE_BLIND_LEVEL, FETCH_LEVEL, STATION_LEVEL, STATION_ROUTES_LEVEL, SENTRY_LEVEL, LAB_LEVEL]);

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
