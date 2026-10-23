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
    shadows: [
      { sources: ['dew', 'bell'], edge: ['shadow-bell-relay', 'bell', 'relay', 1, { active: ['dew'] }] },
      { sources: ['bloom'], edge: ['shadow-bloom-exit', 'bloom', 'exit', 2] },
    ],
  },
];
export const CHALLENGES = [
  { variant: 'single', name: '单层回流', description: '一波回流锁定开匣层，切到任意另一实体层。', duration: 2.4, steps: 1, reward: 4 },
  { variant: 'chase', name: '追层双涌', description: '连续躲两波；第二波追踪你躲过第一波时的层。', duration: 2.4, steps: 2, reward: 6 },
  { variant: 'lock', name: '双层封锁', description: '两层同时封锁，只有标出的那一层能躲过冲击。', duration: 2.6, steps: 1, reward: 5 },
];
function random(seed) { let state = seed >>> 0; return () => { state += 0x6d2b79f5; let t = state; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function shuffled(items, rng) { const values = [...items]; for (let i = values.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [values[i], values[j]] = [values[j], values[i]]; } return values; }
export function createRoomPlan(seed) {
  const rng = random(seed);
  const templates = shuffled(ROOM_TEMPLATES, rng).slice(0, 3);
  const challenges = shuffled(CHALLENGES, rng);
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
    const safeLayer = shuffled([0, 2], rng)[0];
    return { template, mapping, rotation, mirror, challenge: challenges[index], lockSafeLayer: mapping[safeLayer],
      signature: `${template.id}:${mapping.join('')}:r${rotation}:m${mirror}:${challenges[index].variant}:${mapping[safeLayer]}` };
  });
}
export function roomMetadata(plan) { return { id: plan.template.id, name: plan.template.name, mechanic: plan.template.mechanic,
  description: plan.template.description, challengeName: plan.challenge.name, signature: plan.signature }; }
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
  const nodes = ['hub', 'dew', 'bell', 'relay', 'bloom', 'exit', 'vault'].map(id => ({ id, ...transform(definitions[id]),
    kind: ['dew', 'bell', 'bloom'].includes(id) ? 'mechanism' : id,
    anchor: ['hub', 'relay', 'vault'].includes(id), required: [...(template.requires[id] || [])] }));
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
  const edge = ([id, from, to, role, gate = {}]) => ({ id, from, to, layer: mapping[role], gate: { ...gate, active: gate.active ? [...gate.active] : undefined } });
  const hiddenRoutes = [
    { id: 'prism-coil', name: '棱镜回廊', requires: ['prism', 'coil'], entry: 'relay', roles: [0, 1, 2], requirement: '本庭用棱镜或线圈实际启动过机关' },
    { id: 'shadow-weave', name: '影织暗径', requires: ['shadow', 'weave'], entry: 'hub', roles: [1, 2, 0], requirement: '本庭借机关影子远程种过桥' },
    { id: 'shell-weave', name: '护生险径', requires: ['shell', 'weave'], entry: 'vault', roles: [2, 0, 1], requirement: '本庭已种桥，并成功躲过花匣回波' },
  ].map(({ roles, ...route }) => ({ ...route, sequence: roles.map(role => mapping[role]), edge: edge([`secret-${route.id}`, route.entry, 'rift', roles[2]]) }));
  return { nodes, edges: [...template.edges.map(edge), edge(['hub-vault', 'hub', 'vault', 1, { active: template.vaultAfter }])],
    hiddenRoutes,
    rift: { sequence: [mapping[1], mapping[2], mapping[0]], duration: 2.8, steps: 3, stake: 2, reward: 9,
      exitEdge: { id: 'ascension-rift-exit', from: 'rift', to: 'exit', layer: nodes.find(node => node.id === 'exit').layer } },
    weaves: Object.entries(template.weaveAnchors).map(([node, anchor]) => ({ node, edge: { id: `weave-${node}-${anchor}`, from: node, to: anchor, layer: nodes.find(item => item.id === node).layer } })),
    resonance: edge(['resonance-vault-relay', 'vault', 'relay', 2, { active: template.vaultAfter }]),
    shadows: template.shadows.map(shadow => ({ sources: [...shadow.sources], edge: edge(shadow.edge) })),
    challenge: { ...plan.challenge, entryLayer: mapping[1], lockSafeLayer: plan.lockSafeLayer },
    order: [...template.order], start: template.start, requires: structuredClone(template.requires) };
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
