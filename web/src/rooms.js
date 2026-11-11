// Authored topology is permuted by seed; every layout retains a relic-free solution.
export const ROOM_TEMPLATES = [
  {
    id: 'cascade', name: '同位接力庭', mechanic: '同位串联',
    description: '原地换层接住能量，再让远处的花开启出口。',
    order: ['dew', 'bell', 'bloom'], start: 'dew',
    nodes: { dew: [-4, 0, 0, 0, '引潮泵'], bell: [-4, 0, 0, 1, '同位回声台'], bloom: [4, 1, 0, 2, '折光花'], exit: [2, 2, -4, 2, '庭门'] },
    requires: { dew: [], bell: ['dew'], bloom: ['bell'] },
    edges: [
      ['hub-dew', 'hub', 'dew', 0], ['hub-bell', 'hub', 'bell', 1, { power: 'bell', escape: 'bell' }],
      ['hub-relay', 'hub', 'relay', 1, { active: ['bell'] }], ['relay-bloom', 'relay', 'bloom', 2, { active: ['bell'] }],
      ['relay-exit', 'relay', 'exit', 2],
    ], vaultAfter: ['bell'],
    weaveAnchors: { dew: 'relay', bell: 'relay', bloom: 'hub' },
    ferry: { a: 'bell', b: 'bloom' },
    shadows: [
      { sources: ['dew', 'bell'], edge: ['shadow-bell-relay', 'bell', 'relay', 1, { active: ['bell'] }] },
      { sources: ['bloom'], edge: ['shadow-bloom-exit', 'bloom', 'exit', 2] },
    ],
  },
  {
    id: 'confluence', name: '双源汇流庭', mechanic: '双源合流',
    description: '两处独立源都送达，交叠处的汇流台才会回应。',
    order: ['dew', 'bloom', 'bell'], start: 'dew',
    nodes: { dew: [-4, 0, 0, 0, '潮汐源'], bell: [-4, 0, 0, 1, '双源汇流台'], bloom: [4, 1, 0, 2, '辉光源'], exit: [2, 2, -4, 1, '庭门'] },
    requires: { dew: [], bloom: [], bell: ['dew', 'bloom'] },
    edges: [
      ['hub-dew', 'hub', 'dew', 0], ['hub-bloom', 'hub', 'bloom', 2],
      ['hub-bell', 'hub', 'bell', 1, { power: 'bell', escape: 'bell' }],
      ['hub-relay', 'hub', 'relay', 1, { active: ['bell'] }], ['relay-exit', 'relay', 'exit', 1],
    ], vaultAfter: ['dew', 'bloom'],
    weaveAnchors: { dew: 'relay', bell: 'relay', bloom: 'relay' },
    ferry: { a: 'dew', b: 'bloom' },
    shadows: [
      { sources: ['dew', 'bell'], edge: ['shadow-bell-relay', 'bell', 'relay', 1, { active: ['bell'] }] },
      { sources: ['bloom'], edge: ['shadow-bloom-relay', 'bloom', 'relay', 2, { active: ['bell'] }] },
    ],
  },
  {
    id: 'return', name: '远端折返庭', mechanic: '远端折返',
    description: '去远端换层完成接力，再折返起点层寻找出口。',
    order: ['dew', 'bell', 'bloom'], start: 'dew',
    nodes: { dew: [-4, 0, 0, 0, '启程泵'], bell: [4, 1, 0, 1, '远端回声台'], bloom: [4, 1, 0, 2, '反照花'], exit: [-3, 1.8, 4, 0, '归途庭门'] },
    requires: { dew: [], bell: ['dew'], bloom: ['bell'] },
    edges: [
      ['hub-dew', 'hub', 'dew', 0], ['hub-relay', 'hub', 'relay', 0, { active: ['dew'] }],
      ['relay-bell', 'relay', 'bell', 1, { active: ['dew'] }],
      ['relay-bloom', 'relay', 'bloom', 2, { active: ['bell'], escape: 'bloom' }], ['hub-exit', 'hub', 'exit', 0],
    ], vaultAfter: ['bell'],
    weaveAnchors: { dew: 'relay', bell: 'hub', bloom: 'hub' },
    ferry: { a: 'dew', b: 'bell' },
    shadows: [
      { sources: ['dew'], edge: ['shadow-dew-relay', 'dew', 'relay', 0, { active: ['dew'] }] },
      { sources: ['bell', 'bloom'], edge: ['shadow-bloom-hub', 'bloom', 'hub', 2, { active: ['bell'] }] },
    ],
  },
  {
    id: 'split', name: '分源架桥庭', mechanic: '供能与架桥',
    description: '一源架桥，一源供能；可以换序，但两条链缺一不可。',
    order: ['dew', 'bell', 'bloom'], start: 'dew',
    nodes: { dew: [-4, 0, 0, 0, '架桥泵'], bell: [-4, 0, 0, 1, '供能回声台'], bloom: [4, 1, 0, 2, '承光花'], exit: [2, 2, -4, 2, '庭门'] },
    requires: { dew: [], bell: [], bloom: ['bell'] },
    edges: [
      ['hub-dew', 'hub', 'dew', 0], ['hub-bell', 'hub', 'bell', 1],
      ['hub-relay', 'hub', 'relay', 0, { active: ['dew'] }],
      ['relay-bloom', 'relay', 'bloom', 2, { active: ['dew'] }], ['relay-exit', 'relay', 'exit', 2],
    ], vaultAfter: ['bell'],
    weaveAnchors: { dew: 'relay', bell: 'relay', bloom: 'hub' },
    ferry: { a: 'bell', b: 'bloom' },
    shadows: [
      { sources: ['dew', 'bell'], edge: ['shadow-bell-relay', 'bell', 'relay', 1, { active: ['dew'] }] },
      { sources: ['bloom'], edge: ['shadow-bloom-exit', 'bloom', 'exit', 2] },
    ],
  },
];

export const ADVANCED_TEMPLATES = [
  {
    id: 'triad', name: '三叠同位庭', mechanic: '三叠电梯与借道',
    description: '三座机关垂直叠在同一坐标的三层切片；跨层升降点亮叠塔，再借锚台折向庭门。',
    order: ['dew', 'bloom', 'bell'], start: 'dew',
    nodes: {
      dew: [-4, 0, 0, 0, '底叠引潮泵'],
      bell: [-4, 0, 0, 1, '中叠回声台'],
      bloom: [-4, 0, 0, 2, '顶叠折光花'],
      exit: [2, 2, -4, 2, '叠塔庭门'],
    },
    requires: { dew: [], bloom: ['dew'], bell: ['bloom'] },
    edges: [
      ['hub-dew', 'hub', 'dew', 0],
      ['hub-relay', 'hub', 'relay', 2, { active: ['bloom'] }],
      ['bell-relay', 'bell', 'relay', 1, { active: ['bell'], escape: 'bell' }],
      ['relay-exit', 'relay', 'exit', 2],
    ],
    vaultAfter: ['bloom'],
    weaveAnchors: { dew: 'relay', bell: 'hub', bloom: 'relay' },
    ferry: { a: 'dew', b: 'relay', bRole: 2 },
    shadows: [
      { sources: ['dew', 'bloom'], edge: ['shadow-bloom-relay', 'bloom', 'relay', 2, { active: ['bloom'] }] },
      { sources: ['bell'], edge: ['shadow-bell-hub', 'bell', 'hub', 1, { active: ['bell'] }] },
    ],
  },
  {
    id: 'interlock', name: '相位换向庭', mechanic: '换向相位门',
    description: '启动枢泵会收起远岸直通桥并改道锚台；看清换向先后可省下一整趟远征。',
    order: ['dew', 'bloom', 'bell'], start: 'dew',
    nodes: {
      dew: [-4, 0, 0, 0, '换向枢泵'],
      bell: [-4, 0, 0, 1, '锁相回声台'],
      bloom: [4, 1, 0, 2, '远岸折光花'],
      exit: [2, 2, -4, 2, '换向庭门'],
    },
    requires: { dew: [], bloom: [], bell: ['dew', 'bloom'] },
    edges: [
      ['hub-dew', 'hub', 'dew', 0],
      ['hub-bloom', 'hub', 'bloom', 2, { inactive: ['dew'], escape: 'bloom' }],
      ['hub-relay', 'hub', 'relay', 0, { active: ['dew'] }],
      ['relay-bloom', 'relay', 'bloom', 2, { active: ['dew'] }],
      ['hub-bell', 'hub', 'bell', 1, { power: 'bell', escape: 'bell' }],
      ['relay-exit', 'relay', 'exit', 2],
    ],
    vaultAfter: ['dew', 'bloom'],
    weaveAnchors: { dew: 'relay', bell: 'relay', bloom: 'hub' },
    ferry: { a: 'dew', b: 'bloom' },
    shadows: [
      { sources: ['dew', 'bell'], edge: ['shadow-bell-relay', 'bell', 'relay', 1, { active: ['dew'] }] },
      { sources: ['bloom'], edge: ['shadow-bloom-exit', 'bloom', 'exit', 2] },
    ],
  },
];

export const FINALE_TEMPLATE = {
  id: 'sanctum', name: '四象升维圣殿', mechanic: '四象双叠与终章合唱',
  description: '西东双叠四座圣器交汇供能；点亮升维冠冕将结晶锚柱并唤醒三连圣殿回波。',
  order: ['dew', 'bell', 'bloom', 'crown'], start: 'dew',
  nodes: {
    dew: [-4, 0, 0, 0, '引潮圣泉'],
    bell: [-4, 0, 0, 1, '同位圣钟'],
    bloom: [4, 1, 0, 2, '远岸圣花'],
    crown: [4, 1, 0, 0, '升维冠冕'],
    exit: [2, 2, -4, 2, '超维圣殿门'],
  },
  requires: { dew: [], bell: ['dew'], bloom: ['dew'], crown: ['bell', 'bloom'] },
  edges: [
    ['hub-dew', 'hub', 'dew', 0],
    ['hub-bell', 'hub', 'bell', 1, { power: 'bell', escape: 'bell' }],
    ['hub-relay', 'hub', 'relay', 1, { active: ['bell'] }],
    ['relay-bloom', 'relay', 'bloom', 2, { active: ['dew'] }],
    ['relay-crown', 'relay', 'crown', 0, { power: 'crown', escape: 'crown' }],
    ['relay-exit', 'relay', 'exit', 2],
  ],
  vaultAfter: ['bell', 'bloom'],
  weaveAnchors: { dew: 'relay', bell: 'relay', bloom: 'hub', crown: 'hub' },
  ferry: { a: 'bell', b: 'bloom' },
  shadows: [
    { sources: ['dew', 'bell'], edge: ['shadow-bell-relay', 'bell', 'relay', 1, { active: ['bell'] }] },
    { sources: ['bloom', 'crown'], edge: ['shadow-bloom-exit', 'bloom', 'exit', 2] },
  ],
};

export const ALL_ROOM_TEMPLATES = [...ROOM_TEMPLATES, ...ADVANCED_TEMPLATES, FINALE_TEMPLATE];

export const CHALLENGES = [
  { variant: 'single', name: '单层回流', description: '一波回流锁定开匣层，切到任意另一实体层。', duration: 2.4, steps: 1, reward: 4 },
  { variant: 'chase', name: '追层双涌', description: '连续躲两波；第二波追踪你躲过第一波时的层。', duration: 2.4, steps: 2, reward: 6 },
  { variant: 'lock', name: '双层封锁', description: '两层同时封锁，只有标出的那一层能躲过冲击。', duration: 2.6, steps: 1, reward: 5 },
];

export const EXPEDITION_CHALLENGES = [
  ...CHALLENGES,
  { variant: 'cascade_wave', name: '顺次折光', description: '三波回流按切片顺序依次横扫三层，每波都需切往安全切片。', duration: 2.1, steps: 3, reward: 7 },
  { variant: 'shift_lock', name: '双波易位', description: '连续两波双层封锁，且第二波的唯一安全层必定跳转至另一层。', duration: 2.3, steps: 2, reward: 7 },
];

export const HIDDEN_ROUTE_RECIPES = [
  { id: 'prism-coil', name: '棱镜回廊', requires: ['prism', 'coil'], entry: 'relay', roles: [0, 1, 2], requirement: '本庭用棱镜或线圈实际启动过机关' },
  { id: 'shadow-weave', name: '影织暗径', requires: ['shadow', 'weave'], entry: 'hub', roles: [1, 2, 0], requirement: '本庭借机关影子远程种过桥' },
  { id: 'shell-weave', name: '护生险径', requires: ['shell', 'weave'], entry: 'vault', roles: [2, 0, 1], requirement: '本庭已种桥，并成功躲过花匣回波' },
  { id: 'prism-shadow', name: '折影星廊', requires: ['prism', 'shadow'], entry: 'hub', roles: [0, 2, 1], requirement: '本庭留下过机关影子，且远程启动过机关' },
  { id: 'coil-shadow', name: '叠影回廊', requires: ['coil', 'shadow'], entry: 'relay', roles: [2, 1, 0], requirement: '本庭留下过机关影子，且触发过线圈跨层接力' },
  { id: 'prism-weave', name: '织光回廊', requires: ['prism', 'weave'], entry: 'relay', roles: [1, 0, 2], requirement: '本庭已种桥，且用棱镜或线圈远程启动过机关' },
  { id: 'coil-weave', name: '缠脉暗径', requires: ['coil', 'weave'], entry: 'hub', roles: [2, 0, 1], requirement: '本庭已种桥，且触发过线圈跨层接力' },
  { id: 'prism-shell', name: '守光秘径', requires: ['prism', 'shell'], entry: 'vault', roles: [0, 2, 1], requirement: '本庭远程启动过机关，并成功躲过花匣回波' },
  { id: 'coil-shell', name: '护脉险径', requires: ['coil', 'shell'], entry: 'vault', roles: [1, 2, 0], requirement: '本庭触发过线圈接力，并成功躲过花匣回波' },
  { id: 'shadow-shell', name: '驻影险径', requires: ['shadow', 'shell'], entry: 'vault', roles: [0, 1, 2], requirement: '本庭留下过机关影子，并成功躲过花匣回波' },
];

function random(seed) { let state = seed >>> 0; return () => { state += 0x6d2b79f5; let t = state; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function shuffled(items, rng) { const values = [...items]; for (let i = values.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [values[i], values[j]] = [values[j], values[i]]; } return values; }

export function createRoomPlan(seed, { mode = 'intro' } = {}) {
  const rng = random(seed);
  const isExpedition = mode === 'expedition';
  const templates = isExpedition
    ? [...shuffled(ROOM_TEMPLATES, rng).slice(0, 2), ...shuffled(ADVANCED_TEMPLATES, rng), FINALE_TEMPLATE]
    : shuffled(ROOM_TEMPLATES, rng).slice(0, 3);
  const challenges = isExpedition ? shuffled(EXPEDITION_CHALLENGES, rng) : shuffled(CHALLENGES, rng);
  return templates.map((template, index) => {
    const mapping = shuffled([0, 1, 2], rng);
    const orientation = Math.floor(rng() * 4) * 2 + (rng() < .5 ? 0 : 1);
    // Validate projection against simultaneous platform footprints. Hidden W
    // entities may overlap deliberately, but a solid anchor cannot cover them.
    const transforms = [];
    for (let r = 0; r < 4; r++) for (const m of [-1, 1]) {
      const candidate = { template, mapping, rotation: r, mirror: m, challenge: challenges[index] };
      const nodes = buildRoom(candidate, [{ center: .18 }, { center: .5 }, { center: .82 }], { includeRift: false }).nodes;
      if (layoutClearance(nodes) >= 1.05) transforms.push({ rotation: r, mirror: m });
    }
    if (!transforms.length) throw new Error(`Room ${template.id} has no readable authored layout`);
    const { rotation, mirror } = transforms[orientation % transforms.length];
    const safeOrder = shuffled([0, 2], rng);
    const safeLayer = safeOrder[0];
    const nextSafeRole = isExpedition ? safeOrder[1] : (safeLayer === 0 ? 2 : 0);
    return {
      template,
      mapping,
      rotation,
      mirror,
      challenge: challenges[index],
      lockSafeLayer: mapping[safeLayer],
      nextSafeLayer: mapping[nextSafeRole],
      signature: `${template.id}:${mapping.join('')}:r${rotation}:m${mirror}:${challenges[index].variant}:${mapping[safeLayer]}`,
    };
  });
}

export function roomMetadata(plan) {
  return {
    id: plan.template.id,
    name: plan.template.name,
    mechanic: plan.template.mechanic,
    description: plan.template.description,
    challengeName: plan.challenge.name,
    mechanismCount: plan.template.order.length,
    isFinale: plan.template.id === 'sanctum',
    signature: plan.signature,
  };
}

export function buildRoom(plan, layers, { includeRift = true } = {}) {
  const { template, mapping, rotation, mirror } = plan;
  const transform = (coords) => {
    let [x, y, z, role, name] = coords; x *= mirror;
    for (let i = 0; i < rotation; i++) [x, z] = [-z, x];
    const layer = role === null ? null : mapping[role];
    const center = layers[layer ?? 1].center;
    return { name, x: 500 + (x - z) * 52, y: 350 + (x + z) * 27 - y * 50, layer, center, world: { x, y, z, w: center } };
  };
  const definitions = { hub: [0, 0, 2, null, '归响台'], ...template.nodes, relay: [0, 1, -2, null, '维度锚台'], vault: [4, -.3, 3, 1, '裂隙花匣'] };
  const nodeIds = template.nodes.crown
    ? ['hub', 'dew', 'bell', 'relay', 'bloom', 'crown', 'exit', 'vault']
    : ['hub', 'dew', 'bell', 'relay', 'bloom', 'exit', 'vault'];
  const mechanismIds = new Set(template.order);
  const nodes = nodeIds.map(id => ({
    id,
    ...transform(definitions[id]),
    kind: mechanismIds.has(id) ? 'mechanism' : id,
    anchor: ['hub', 'relay', 'vault'].includes(id),
    required: [...(template.requires[id] || [])],
  }));
  // These authored screen-space sockets preserve existing seed orientations.
  // Pick the clearest socket, then derive XYZ from the same isometric projection.
  if (includeRift) {
    const sockets = [[800, 120], [200, 120], [850, 310], [150, 310], [800, 510], [200, 510], [500, 100], [500, 540]];
    const candidates = sockets.map(([px, py]) => {
      const y = 1.7, sum = (py - 350 + y * 50) / 27, difference = (px - 500) / 52;
      const x = (sum + difference) / 2, z = (sum - difference) / 2, center = layers[1].center;
      return { id: 'rift', name: '隐星台', kind: 'rift', anchor: true, required: [], layer: null, center,
        x: 500 + (x - z) * 52, y: 350 + (x + z) * 27 - y * 50, world: { x, y, z, w: center } };
    });
    candidates.sort((a, b) => layoutClearance([...nodes, b]) - layoutClearance([...nodes, a]));
    if (layoutClearance([...nodes, candidates[0]]) < 1.05) throw new Error(`Room ${template.id} has no readable hidden-route socket`);
    nodes.push(candidates[0]);
  }
  const edge = ([id, from, to, role, gate = {}]) => ({
    id,
    from,
    to,
    layer: mapping[role],
    gate: {
      ...gate,
      active: gate.active ? [...gate.active] : undefined,
      inactive: gate.inactive ? [...gate.inactive] : undefined,
    },
  });
  const hiddenRoutes = HIDDEN_ROUTE_RECIPES.map(({ roles, ...route }) => ({
    ...route,
    sequence: roles.map(role => mapping[role]),
    edge: edge([`secret-${route.id}`, route.entry, 'rift', roles[2]]),
  }));
  const exitLayer = nodes.find(node => node.id === 'exit').layer;
  // The W-coupled ferry drifts between two authored docks on different layers.
  // Its screen track is a quadratic arc placed on the clearest side of the room.
  const dockLayer = (id, role) => {
    const node = nodes.find(item => item.id === id);
    return node.layer ?? mapping[role ?? 1];
  };
  const layerA = dockLayer(template.ferry.a, template.ferry.aRole);
  const layerB = dockLayer(template.ferry.b, template.ferry.bRole);
  const dockA = nodes.find(node => node.id === template.ferry.a);
  const dockB = nodes.find(node => node.id === template.ferry.b);
  const p0 = { x: dockA.x + (dockB.x - dockA.x) * .22, y: dockA.y + (dockB.y - dockA.y) * .22 };
  const p1 = { x: dockA.x + (dockB.x - dockA.x) * .78, y: dockA.y + (dockB.y - dockA.y) * .78 };
  const mid = { x: (dockA.x + dockB.x) / 2, y: (dockA.y + dockB.y) / 2 };
  const length = Math.hypot(dockB.x - dockA.x, dockB.y - dockA.y) || 1;
  const normal = { x: -(dockB.y - dockA.y) / length, y: (dockB.x - dockA.x) / length };
  const clearanceAt = (h) => {
    const c = { x: mid.x + normal.x * h, y: mid.y + normal.y * h };
    let minimum = Infinity;
    for (const t of [0, .25, .5, .75, 1]) {
      const s = 1 - t;
      const x = s * s * p0.x + 2 * s * t * c.x + t * t * p1.x;
      const y = s * s * p0.y + 2 * s * t * c.y + t * t * p1.y;
      for (const node of nodes) {
        const width = 44 + (node.id === 'hub' ? 112 : 81);
        const height = 26 + (node.id === 'hub' ? 60 : 52);
        minimum = Math.min(minimum, Math.hypot((x - node.x) / width, (y - node.y) / height));
      }
    }
    return minimum;
  };
  let bestH = -90, bestClearance = -Infinity;
  for (const h of [-90, 90, -140, 140]) {
    const clearance = clearanceAt(h);
    if (clearance > bestClearance) { bestClearance = clearance; bestH = h; }
  }
  const c = { x: mid.x + normal.x * bestH, y: mid.y + normal.y * bestH };
  return {
    nodes,
    ferry: {
      a: template.ferry.a,
      b: template.ferry.b,
      layerA,
      layerB,
      centerA: layers[layerA].center,
      centerB: layers[layerB].center,
      track: { p0, c, p1 },
    },
    edges: [...template.edges.map(edge), edge(['hub-vault', 'hub', 'vault', 1, { active: template.vaultAfter }])],
    hiddenRoutes,
    rift: {
      sequence: [mapping[1], mapping[2], mapping[0]],
      duration: 2.8,
      steps: 3,
      stake: 2,
      reward: 9,
      exitEdge: { id: 'ascension-rift-exit', from: 'rift', to: 'exit', layer: exitLayer },
    },
    sanctum: template.id === 'sanctum'
      ? {
          sequence: [mapping[1], mapping[2], mapping[0]],
          duration: 2.3,
          steps: 3,
          reward: 8,
          exitEdge: { id: 'sanctum-crown-exit', from: 'crown', to: 'exit', layer: exitLayer },
        }
      : null,
    weaves: Object.entries(template.weaveAnchors).map(([node, anchor]) => ({
      node,
      edge: { id: `weave-${node}-${anchor}`, from: node, to: anchor, layer: nodes.find(item => item.id === node).layer },
    })),
    resonance: edge(['resonance-vault-relay', 'vault', 'relay', 2, { active: template.vaultAfter }]),
    shadows: template.shadows.map(shadow => ({ sources: [...shadow.sources], edge: edge(shadow.edge) })),
    challenge: {
      ...plan.challenge,
      entryLayer: mapping[1],
      lockSafeLayer: plan.lockSafeLayer,
      nextSafeLayer: plan.nextSafeLayer ?? mapping[2],
      sweepOrder: [mapping[1], mapping[2], mapping[0]],
    },
    order: [...template.order],
    start: template.start,
    requires: structuredClone(template.requires),
  };
}

// Position of the ferry along its track: smoothstepped between the two dock
// layer centers, riding the quadratic arc chosen at build time.
export function ferryPosition(ferry, w) {
  const raw = Math.max(0, Math.min(1, (w - ferry.centerA) / (ferry.centerB - ferry.centerA)));
  const u = raw * raw * (3 - 2 * raw);
  const { p0, c, p1 } = ferry.track;
  const s = 1 - u;
  return { x: s * s * p0.x + 2 * s * u * c.x + u * u * p1.x, y: s * s * p0.y + 2 * s * u * c.y + u * u * p1.y, u };
}

export function layoutClearance(nodes) {
  let minimum = Infinity;
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i], b = nodes[j];
    if (!a.anchor && !b.anchor && a.layer !== b.layer) continue;
    const width = (a.id === 'hub' ? 112 : 81) + (b.id === 'hub' ? 112 : 81);
    const height = (a.id === 'hub' ? 60 : 52) + (b.id === 'hub' ? 60 : 52);
    minimum = Math.min(minimum, Math.hypot((a.x - b.x) / width, (a.y - b.y) / height));
  }
  return minimum;
}
