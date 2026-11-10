// 4D Exploration Radar & Inter-Slice Anomaly System
// Generates deterministic, clickable 4D geometric curiosities across W-layers
// to reward curiosity, layer-switching exploration, and spatial observation.

export const CURIOSITY_CATALOG = [
  {
    id: 'tesseract_shard',
    name: '超立方折片',
    polytope: 'tesseract',
    layer: 1,
    x: 218,
    y: 235,
    lore: '四维正八胞体穿过当前切面留下的几何折片，旋转时内外立方体会彼此翻转。',
    bonus: 2,
  },
  {
    id: 'klein_dew',
    name: '克莱因露滴',
    polytope: 'orthoplex',
    layer: 2,
    x: 786,
    y: 230,
    lore: '没有“内部”与“外部”之分的四维流形凝露，唯有切入绽放层才能触碰实体。',
    bonus: 2,
  },
  {
    id: 'mobius_seed',
    name: '莫比乌斯花种',
    polytope: '24cell',
    layer: 0,
    x: 210,
    y: 455,
    lore: '沿单侧拓扑曲面生长的跨维花种，记录着庭院在第四维度的生长轨迹。',
    bonus: 2,
  },
  {
    id: 'hopf_ring',
    name: '霍普夫星环',
    polytope: '24cell',
    layer: 2,
    x: 782,
    y: 448,
    lore: '四维球面纤维化投影出的双生光环，两环互不接触却在四维空间紧密相扣。',
    bonus: 2,
  },
  {
    id: 'orthoplex_bell',
    name: '十六胞体音叉',
    polytope: 'orthoplex',
    layer: 1,
    x: 245,
    y: 190,
    lore: '正十六胞体的对偶晶格，轻触即可在相邻的平行切片间激起回响。',
    bonus: 2,
  },
  {
    id: 'cell24_prism',
    name: '二十四胞体棱晶',
    polytope: '24cell',
    layer: 0,
    x: 755,
    y: 205,
    lore: '四维空间独有的自对偶正多胞体结晶，能将微弱的回响折射为璀璨星芒。',
    bonus: 2,
  },
];

export class ExplorationRadar {
  constructor() {
    this.collectedIds = new Set();
    this.roomAnomalies = [];
    this.currentRoomKey = '';
    this.lastDiscovered = null;
    this.bonusScore = 0;
  }

  syncRoom(state) {
    if (!state) return;
    const key = `${state.seed}:${state.room}`;
    if (this.currentRoomKey === key) return;
    this.currentRoomKey = key;

    // Pick 2 distinct curiosities for this room based on seed + room index
    const offset = ((state.seed >>> 0) + state.room * 2) % CURIOSITY_CATALOG.length;
    const first = CURIOSITY_CATALOG[offset % CURIOSITY_CATALOG.length];
    let second = CURIOSITY_CATALOG[(offset + 1) % CURIOSITY_CATALOG.length];
    if (second.layer === first.layer) {
      second = CURIOSITY_CATALOG[(offset + 2) % CURIOSITY_CATALOG.length];
    }

    // Ensure anomalies don't overlap directly with any island center
    const adjustPos = (item, idx) => {
      let x = item.x;
      let y = item.y;
      for (const node of state.nodes || []) {
        if (Math.hypot(node.x - x, node.y - y) < 105) {
          x = idx === 0 ? 175 : 825;
          y = idx === 0 ? 255 : 265;
        }
      }
      return { ...item, x, y };
    };

    this.roomAnomalies = [adjustPos(first, 0), adjustPos(second, 1)];
  }

  visibleAnomalies(state) {
    this.syncRoom(state);
    if (!state || state.phase !== 'playing') return [];
    const layerNames = ['Ⅰ 潮汐层', 'Ⅱ 回声层', 'Ⅲ 绽放层'];
    return this.roomAnomalies.map(item => {
      const collected = this.collectedIds.has(`${this.currentRoomKey}:${item.id}`);
      const layerCenter = state.layers?.[item.layer]?.center ?? (item.layer * 0.32 + 0.18);
      const distW = Math.abs((state.w ?? 0.28) - layerCenter);
      const materialized = state.layer === item.layer && distW < 0.16;
      return {
        ...item,
        key: `${this.currentRoomKey}:${item.id}`,
        collected,
        materialized,
        proximity: Math.max(0, 1 - distW * 2.4),
        layerLabel: layerNames[item.layer] || '异维层',
      };
    });
  }

  hitTest(state, worldX, worldY) {
    const list = this.visibleAnomalies(state);
    for (const item of list) {
      if (item.collected) continue;
      if (Math.hypot(worldX - item.x, worldY - item.y) <= 44) {
        return item;
      }
    }
    return null;
  }

  interact(state, itemKey) {
    const list = this.visibleAnomalies(state);
    const target = list.find(a => a.key === itemKey || a.id === itemKey);
    if (!target || target.collected) return null;
    if (!target.materialized) {
      return {
        status: 'off_layer',
        item: target,
        targetLayer: target.layer,
        message: `🔭 侦测到四维奇物「${target.name}」的跨维波纹！切入 ${target.layerLabel} 即可使其显形收录。`,
      };
    }
    this.collectedIds.add(target.key);
    this.bonusScore += target.bonus;
    this.lastDiscovered = target;
    return {
      status: 'collected',
      item: target,
      bonus: target.bonus,
      message: `✦ 发现四维奇物【${target.name}】（+${target.bonus}◆）：${target.lore}`,
    };
  }

  roomProgress(state) {
    const list = this.visibleAnomalies(state);
    const done = list.filter(a => a.collected).length;
    return {
      done,
      total: list.length,
      items: list,
      totalCollected: this.collectedIds.size,
      bonusScore: this.bonusScore,
      lastDiscovered: this.lastDiscovered,
    };
  }
}
