// Progressive 4D Onboarding, Skill-Gated Progression & Gesture Controller
// Core design principles:
// 1. Keep the 4D "Aha!" moment in the player's hands: auto-routing walks only within the
//    current layer; when a bridge or mechanism is on another W slice, guide the player to
//     stand on a Safety Platform (安全台) and switch layers themselves so they watch the bridge materialize.
// 2. Unlock stages by demonstrated skill (lighting ① -> manual layer shift that reveals a bridge ->
//    manual wave dodge -> mastery), distributed across the 3 courtyards.
// 3. Trackpad-safe wheel accumulation (80px threshold + 150ms inertia quiet-gap) so a single flick
//    steps exactly one W layer.

export const ONBOARDING_STAGES = [
  {
    stage: 1,
    id: 'walk_and_light',
    badge: '🌱 阶段 1/4 · 平面寻路',
    title: '第一步：点击发光的「① 号机关」，走过去自动点亮',
    instruction: '直接用鼠标左键点击画面中发光的「① 号机关」，角色会顺着当前层的桥走过去并自动点亮（无需按 E）。',
    unlockedFeatures: ['click_move'],
  },
  {
    stage: 2,
    id: 'slice_shift',
    badge: '🌀 阶段 2/4 · 四维切面折叠',
    title: '第二步：亲手滚动滚轮换层，让隐形的桥显形！',
    instruction: '① 已点亮！通往 ② 的路藏在另一层空间。点击 ②，角色会走到能换层的地方停下（带 ⚓ 的安全台，或与 ② 同一位置的平台），然后由你亲手滚动鼠标滚轮（上滚去上层，或点 Ⅰ/Ⅱ/Ⅲ 层），看隐形的桥在眼前显形！',
    unlockedFeatures: ['click_move', 'layer_shift', 'anomalies'],
  },
  {
    stage: 3,
    id: 'phase_dodge_and_bloom',
    badge: '⚡ 阶段 3/4 · 空间推理与闪避',
    title: '新技能：看虚线桥推理换层 & 躲避花匣冲击波',
    instruction: '你已掌握四维换层！现在站上 ⚓ 安全台时，请观察虚线桥的颜色与上下偏移自主推理滚轮方向（桥在上方就上滚）（犹豫或按 H 会给出层提示）；开启「✨ 花匣」后认准绿色「🛡️ 安全」层切入即可夺宝！',
    unlockedFeatures: ['click_move', 'layer_shift', 'anomalies', 'vault_dodge', 'risk_bloom'],
  },
  {
    stage: 4,
    id: 'dimensional_mastery',
    badge: '🌌 阶段 4/4 · 冒险桥与隐星秘境',
    title: '高阶 4D 全开：同位叠合、冒险桥 & 隐星秘境',
    instruction: '可开启「⚡ 冒险桥」赢取双倍分数并唤醒沉睡花桥，在同坐标机关上直接换层原地换岛，或集齐双遗物解封「🌌 隐星秘境」！',
    unlockedFeatures: ['click_move', 'layer_shift', 'anomalies', 'vault_dodge', 'risk_bloom', 'same_xyz', 'secret_rift'],
  },
];

/**
 * Finds the shortest path from `state.node` to `targetId` using ONLY open bridges
 * that exist on the player's current W layer (`state.layer`).
 * Never inserts automatic layer-shift steps, preserving the 4D puzzle for the player.
 */
export function findCurrentLayerRoute(state, targetId) {
  if (!state || !targetId) return null;
  if (state.node === targetId) return [];
  const currentLayer = state.layer;
  const openCurrentEdges = (state.edges || []).filter(e => e.open && e.layer === currentLayer
    && (e.kind !== 'ferry' || state.node === 'ferry' || targetId === 'ferry'));
  const queue = [{ id: state.node, path: [] }];
  const visited = new Set([state.node]);

  while (queue.length) {
    const { id, path } = queue.shift();
    if (id === targetId) return path;
    for (const edge of openCurrentEdges) {
      if (edge.from !== id && edge.to !== id) continue;
      const nextId = edge.from === id ? edge.to : edge.from;
      if (!visited.has(nextId)) {
        visited.add(nextId);
        queue.push({
          id: nextId,
          path: [...path, { type: 'move', to: nextId, layer: edge.layer, edgeId: edge.id }],
        });
      }
    }
  }
  return null;
}

const sameSpot = (a, b) => !!(a?.world && b?.world &&
  Math.abs(a.world.x - b.world.x) < 1e-4 &&
  Math.abs(a.world.y - b.world.y) < 1e-4 &&
  Math.abs(a.world.z - b.world.z) < 1e-4);

/**
 * Plans a route to `targetId` over (node, W layer) states, mirroring the model's
 * real movement rules:
 * - walking follows open bridges whose layer is the layer the player stands in;
 * - outer platforms only exist in their own layer, so a layer change is legal only
 *   on cross-layer support (anchors such as 归响台 / 锚台 / 花匣台) or on an outer
 *   platform whose same-XYZ counterpart lives in the destination layer.
 * Routes minimise the number of layer changes first (each one is a deliberate
 * player action), then walking steps.
 *
 * Returns `{ steps, walk, shift, shifts }`:
 * - `walk`: the leading bridge moves the autopilot may perform for the player;
 * - `shift`: the first layer change the player must make themselves
 *   (`{ at, to, layer, kind: 'anchor' | 'same_xyz' | 'recover' }`), or null when the
 *   target is reachable without changing layer.
 * Returns null when no route exists yet (e.g. bridges still gated by mechanisms).
 * `finalLayer` requires arriving at the target while standing in that layer
 * (the vault chest only opens in its entry layer).
 */
export function planLayerRoute(state, targetId, { finalLayer = null } = {}) {
  if (!state || !targetId) return null;
  const nodes = state.nodes || [];
  const byId = new Map(nodes.map(n => [n.id, n]));
  const target = byId.get(targetId);
  const start = byId.get(state.node);
  const layerCount = (state.layers || []).length || 3;
  if (!target || !start || !Number.isInteger(state.layer) || state.layer < 0 || state.layer >= layerCount) return null;
  const wantLayer = Number.isInteger(finalLayer) ? finalLayer : null;

  // Standing on an outer platform outside its own layer means the floor is fading:
  // the only sensible first step is to return to that platform's layer.
  if (!start.anchor && Number.isInteger(start.layer) && start.layer !== state.layer) {
    const shift = { type: 'shift', at: start.id, to: start.id, layer: start.layer, kind: 'recover' };
    return { steps: [shift], walk: [], shift, shifts: 1 };
  }

  const exists = (node, layer) => node && (node.anchor || node.layer === layer);
  const isGoal = (id, layer) => id === targetId && (wantLayer === null || layer === wantLayer);
  const edges = (state.edges || []).filter(e => e.open && Number.isInteger(e.layer)
    && (e.kind !== 'ferry' || state.node === 'ferry' || targetId === 'ferry'));
  const key = (id, layer) => `${id}@${layer}`;
  const SHIFT_COST = 1000;

  const best = new Map([[key(start.id, state.layer), 0]]);
  const frontier = [{ id: start.id, layer: state.layer, cost: 0, steps: [] }];
  while (frontier.length) {
    let minIdx = 0;
    for (let i = 1; i < frontier.length; i++) if (frontier[i].cost < frontier[minIdx].cost) minIdx = i;
    const cur = frontier.splice(minIdx, 1)[0];
    if (cur.cost > (best.get(key(cur.id, cur.layer)) ?? Infinity)) continue;
    if (isGoal(cur.id, cur.layer)) {
      const firstShift = cur.steps.findIndex(step => step.type === 'shift');
      const walk = firstShift === -1 ? cur.steps : cur.steps.slice(0, firstShift);
      return {
        steps: cur.steps,
        walk,
        shift: firstShift === -1 ? null : cur.steps[firstShift],
        shifts: cur.steps.filter(step => step.type === 'shift').length,
      };
    }
    const node = byId.get(cur.id);
    const next = [];
    for (const edge of edges) {
      if (edge.layer !== cur.layer || (edge.from !== cur.id && edge.to !== cur.id)) continue;
      const otherId = edge.from === cur.id ? edge.to : edge.from;
      if (!exists(byId.get(otherId), cur.layer)) continue;
      next.push({ id: otherId, layer: cur.layer, cost: cur.cost + 1,
        step: { type: 'move', from: cur.id, to: otherId, layer: cur.layer, edgeId: edge.id } });
    }
    if (node.anchor) {
      for (let layer = 0; layer < layerCount; layer++) {
        if (layer === cur.layer) continue;
        next.push({ id: cur.id, layer, cost: cur.cost + SHIFT_COST,
          step: { type: 'shift', at: cur.id, to: cur.id, layer, kind: 'anchor' } });
      }
    } else {
      for (const other of nodes) {
        if (other.anchor || other.id === cur.id || !Number.isInteger(other.layer) || other.layer === cur.layer || !sameSpot(node, other)) continue;
        next.push({ id: other.id, layer: other.layer, cost: cur.cost + SHIFT_COST,
          step: { type: 'shift', at: cur.id, to: other.id, layer: other.layer, kind: 'same_xyz' } });
      }
    }
    for (const item of next) {
      const k = key(item.id, item.layer);
      if (item.cost >= (best.get(k) ?? Infinity)) continue;
      best.set(k, item.cost);
      frontier.push({ id: item.id, layer: item.layer, cost: item.cost, steps: [...cur.steps, item.step] });
    }
  }
  return null;
}

export class ProgressiveOnboarding {
  constructor({ skillGated = true } = {}) {
    this.skillGated = skillGated;
    this.maxStageReached = 1;
    this.unlockAllOverride = false;
    this.lastAnnouncedStage = 1;
    this.lastBannerAtMs = -Infinity;
    this.bannerCooldownMs = 3800;

    // Skill-tracking state
    this.skills = {
      manualLayerShift: false,
      manualBridgeReveal: false,
      manualWaveDodge: false,
    };

    // Assist button & deductive hint visibility state
    this.idleSeconds = 0;
    this.roomFailures = 0;
    this.lastRoom = 0;
    this.explicitHintOverride = false;

    // Trackpad-safe wheel state
    this.wheelAccumulator = 0;
    this.lastWheelStepTime = -Infinity;
    this.lastWheelEventTime = -Infinity;
    this.lockedUntilQuiet = false;
  }

  resetRun() {
    this.idleSeconds = 0;
    this.roomFailures = 0;
    this.lastRoom = 0;
    this.explicitHintOverride = false;
    this.maxStageReached = 1;
    this.lastAnnouncedStage = 1;
    this.lastBannerAtMs = -Infinity;
    this.wheelAccumulator = 0;
    this.lastWheelStepTime = -Infinity;
    this.lastWheelEventTime = -Infinity;
    this.lockedUntilQuiet = false;
  }

  recordManualLayerShift({ revealedBridge = false } = {}) {
    this.skills.manualLayerShift = true;
    if (revealedBridge) {
      this.skills.manualBridgeReveal = true;
      this.explicitHintOverride = false;
    }
    this.idleSeconds = 0;
  }

  recordWaveDodge() {
    this.skills.manualWaveDodge = true;
    this.idleSeconds = 0;
  }

  recordActivity() {
    this.idleSeconds = 0;
  }

  recordFailure() {
    this.roomFailures += 1;
    this.idleSeconds = 0;
  }

  requestExplicitHint() {
    this.explicitHintOverride = true;
  }

  tickIdle(dt, state) {
    if (!state || state.phase !== 'playing' || state.travel || state.wave) return;
    if ((state.room || 0) !== this.lastRoom) {
      this.lastRoom = state.room || 0;
      this.roomFailures = 0;
      this.idleSeconds = 0;
      this.explicitHintOverride = false;
    }
    if (Number.isFinite(dt) && dt > 0) {
      this.idleSeconds += dt;
    }
  }

  shouldShowAssistButton() {
    return this.unlockAllOverride || this.idleSeconds >= 15 || this.roomFailures >= 2;
  }

  /**
   * Stages 1 & 2 reveal the target layer explicitly ("切至 Ⅰ 潮汐层") to teach the mechanic.
   * From Stage 3+, direct spoilers are hidden so the player deduces the direction from the
   * dashed off-slice bridge's vertical offset and color/pips — unless they request a hint (H),
   * hesitate for >= 10s, or fail in the current room.
   */
  shouldRevealExplicitLayerHint(state, { hintRequested = false, totalAnomaliesCollected = 0 } = {}) {
    if (!state) return true;
    const { stage } = this.computeStage(state, totalAnomaliesCollected);
    if (stage < 3) return true;
    if ((state.phaseStability ?? 1) < 0.99 || state.wave) return true;
    if (hintRequested || this.explicitHintOverride) return true;
    if (this.idleSeconds >= 10 || this.roomFailures >= 1) return true;
    return false;
  }

  computeStage(state, totalAnomaliesCollected = 0) {
    if (this.unlockAllOverride) {
      this.maxStageReached = 4;
      return ONBOARDING_STAGES[3];
    }
    if (!state) return ONBOARDING_STAGES[0];

    const activatedCount = state.activated?.length || 0;
    const roomIdx = state.room || 0;
    const riftCleared = state.rift?.status === 'cleared';
    const vaultEscaped = state.vaultStatus === 'escaped';
    const hasLearnedShift = this.skills.manualBridgeReveal || this.skills.manualLayerShift || !this.skillGated;
    const hasLearnedDodge = this.skills.manualWaveDodge || vaultEscaped || !this.skillGated;

    let targetStage = state.mode === 'expedition' ? 4 : 1;

    if (
      roomIdx >= 2 ||
      riftCleared ||
      (roomIdx >= 1 && (hasLearnedDodge || activatedCount >= 2)) ||
      (!this.skillGated && activatedCount >= 3)
    ) {
      targetStage = 4;
    } else if (
      roomIdx >= 1 ||
      vaultEscaped ||
      (hasLearnedShift && (activatedCount >= 2 || totalAnomaliesCollected > 0 || (state.resonance?.stage || 0) > 0))
    ) {
      targetStage = 3;
    } else if (activatedCount >= 1 || this.skills.manualLayerShift) {
      targetStage = 2;
    }

    if (targetStage > this.maxStageReached) {
      this.maxStageReached = targetStage;
    }
    return ONBOARDING_STAGES[this.maxStageReached - 1];
  }

  consumeStageUpBanner(state, totalAnomaliesCollected = 0, nowMs = Date.now()) {
    const info = this.computeStage(state, totalAnomaliesCollected);
    if (info.stage > this.lastAnnouncedStage) {
      if (nowMs - this.lastBannerAtMs < this.bannerCooldownMs && this.lastBannerAtMs > 0) {
        return null;
      }
      this.lastAnnouncedStage = info.stage;
      this.lastBannerAtMs = nowMs;
      return info;
    }
    return null;
  }

  /**
   * Converts mouse-wheel / trackpad scroll deltas into clean 1-layer steps (Ⅰ <-> Ⅱ <-> Ⅲ)
   * without trackpad inertia multi-skipping. Wheel up = higher layer (towards Ⅲ).
   * - Requires accumulated delta >= 80px (or 100 in tests).
   * - Locks after a step until a 150ms quiet gap (or >= 220ms between distinct wheel ticks).
   * - Ignores pinch-to-zoom (`ctrlKey` / `metaKey`).
   */
  handleDiscreteWheel(deltaY, currentLayer, nowMs = Date.now(), { ctrlKey = false, metaKey = false, deltaMode = 0 } = {}) {
    if (ctrlKey || metaKey) return null;
    if (!Number.isFinite(deltaY) || Math.abs(deltaY) < 0.001) return null;

    const gapSinceLastEvent = nowMs - this.lastWheelEventTime;
    const gapSinceLastStep = nowMs - this.lastWheelStepTime;
    this.lastWheelEventTime = nowMs;

    // A pause >= 150ms clears any inertia lock and resets stale partial accumulation
    if (gapSinceLastEvent >= 150) {
      this.lockedUntilQuiet = false;
      this.wheelAccumulator = 0;
    }

    // While trackpad inertia is still streaming (< 150ms between events) or within step cooldown (220ms), ignore
    if (this.lockedUntilQuiet || gapSinceLastStep < 220) {
      return null;
    }

    // Normalize line-mode wheel (deltaMode === 1) to pixels
    const normalizedDelta = deltaMode === 1 ? deltaY * 32 : deltaY;
    // Reset accumulator if user reverses scroll direction mid-gesture
    if (this.wheelAccumulator !== 0 && Math.sign(normalizedDelta) !== Math.sign(this.wheelAccumulator)) {
      this.wheelAccumulator = 0;
    }
    this.wheelAccumulator += normalizedDelta;

    const THRESHOLD = 80;
    if (Math.abs(this.wheelAccumulator) >= THRESHOLD) {
      const step = Math.sign(this.wheelAccumulator);
      this.wheelAccumulator = 0;
      this.lastWheelStepTime = nowMs;
      this.lockedUntilQuiet = true;
      // Wheel up (negative deltaY) climbs to the higher W slice (Ⅲ is drawn on top of the
      // layer stack), matching the risky-crossing fine tune where wheel up also raises W.
      const nextLayer = Math.max(0, Math.min(2, currentLayer + (step < 0 ? 1 : -1)));
      if (nextLayer !== currentLayer) return nextLayer;
    }
    return null;
  }
}

export function nearestLayerCenter(state, origin) {
  const layers = state?.layers?.length ? state.layers : [{ center: 0.5 }];
  return layers.reduce(
    (best, l) => (Math.abs(l.center - origin) < Math.abs(best - origin) ? l.center : best),
    layers[0].center,
  );
}

/**
 * Resolves the layer-center snap target when a continuous W scrub gesture ends or cancels.
 * Standing on a conditional non-anchor platform (`!state.wave && !state.travel && !currentNode.anchor`),
 * `GameModel.scrubW` clamps W to `[center - 0.13, center + 0.13]`, so release/cancel must rebound
 * to the platform's own layer center instead of aiming at an unreachable off-slice layer center.
 */
export function resolveScrubReleaseTarget(state, { phase = 'end', w, velocity = 0, beforeW } = {}) {
  if (!state) return 0.5;
  if (!state.wave) {
    if (state.travel) {
      if (state.travel.risky) return state.w;
      return state.layers?.[state.travel.layer]?.center ?? state.travel.center ?? nearestLayerCenter(state, state.w);
    }
    const currentNode = (state.nodes || []).find(n => n.id === state.node);
    if (currentNode && !currentNode.anchor) {
      return state.layers?.[currentNode.layer]?.center ?? currentNode.center;
    }
  }
  const releaseW = Number.isFinite(w)
    ? Math.max(0, Math.min(1, w))
    : (Number.isFinite(state.w) ? state.w : 0.5);
  const vel = Number.isFinite(velocity) ? velocity : 0;
  const origin = phase === 'cancel'
    ? (Number.isFinite(beforeW) ? beforeW : (Number.isFinite(state.w) ? state.w : releaseW))
    : releaseW + vel * 0.12;
  return nearestLayerCenter(state, origin);
}

const RELIC_META = {
  prism: { icon: '◇', name: '回流棱镜' },
  weave: { icon: '❋', name: '织桥种' },
  shadow: { icon: '◌', name: '留影扣' },
  coil: { icon: '⌁', name: '接力线圈' },
  shell: { icon: '◈', name: '缓落壳' },
};

/**
 * Computes the pre-crossing Risk vs. Safe decision preview for the bridge ahead on the current layer.
 * Shows the player why choosing a Risk Crossing on a novel bridge matters:
 * 1) 3x echo score (+3◆ vs +1◆)
 * 2) Awakening the dormant Flower Bridge (🌺 花匣 ↔ 锚台) on the first risk crossing
 * 3) Charging 回流棱镜 (charge +1) and/or 织桥种 (weaveCharge +1)
 */
export function computeRiskDecisionPreview(state, targetId = null) {
  if (!state || state.phase !== 'playing' || state.travel || state.wave || (state.phaseStability ?? 1) < 0.99) {
    return { available: false };
  }
  const nodes = state.nodes || [];
  const order = state.mechanismOrder || nodes.filter(n => n.kind === 'mechanism').map(n => n.id);
  const primaryMechId = order.find(id => {
    const n = nodes.find(item => item.id === id);
    return n && n.powered && !(state.activated || []).includes(id);
  });
  const goalId = targetId || ((state.activated || []).length >= (order.length || 3) ? 'exit' : primaryMechId);

  let nextStep = null;
  if (goalId && goalId !== state.node) {
    const currentRoute = findCurrentLayerRoute(state, goalId);
    if (currentRoute?.length) nextStep = currentRoute[0];
  }
  if (!nextStep && state.selected && (state.availableNodes || []).includes(state.selected)) {
    nextStep = { to: state.selected, layer: state.layer };
  }
  if (!nextStep) return { available: false };

  const from = state.node;
  const to = nextStep.to;
  const fromNode = nodes.find(n => n.id === from);
  const toNode = nodes.find(n => n.id === to);
  const routeKey = `${from}>${to}`;
  const isNovel = !(state.claimedRoutes || []).includes(routeKey);
  const awakensFlowerBridge = isNovel && !state.resonance?.triggered;
  const chargesPrism = isNovel && (state.relics?.prism || 0) > 0 && (state.charge || 0) < state.relics.prism;
  const chargesWeave = isNovel && (state.relics?.weave || 0) > 0 && (state.weaveCharge || 0) < state.relics.weave;

  const bonuses = [];
  if (isNovel) bonuses.push('3倍回响(+3◆)');
  if (awakensFlowerBridge) bonuses.push('🌺唤醒花桥');
  if (chargesPrism) bonuses.push('◇棱镜蓄能+1');
  if (chargesWeave) bonuses.push('❋织桥种+1');

  return {
    available: true,
    from,
    to,
    goalId: goalId || to,
    fromName: fromNode?.name || '当前台',
    toName: toNode?.name || '目标台',
    isNovel,
    safeEcho: isNovel ? 1 : 0,
    riskEcho: isNovel ? 3 : 0,
    awakensFlowerBridge,
    chargesPrism,
    chargesWeave,
    hasRelicOrBridgeBonus: awakensFlowerBridge || chargesPrism || chargesWeave,
    bonuses,
    bonusLabel: bonuses.join(' ＋ '),
  };
}

/**
 * Summarizes equipped relics, how they charge, whether an active relic ability is ready to fire right now,
 * or what positioning step is needed to release an already-charged relic.
 */
export function computeRelicHudStatus(state) {
  if (!state || !state.relics) return { items: [], readyAbility: null, positioningHint: null };
  const nodes = state.nodes || [];
  const items = [];
  for (const id of ['prism', 'weave', 'shadow', 'coil', 'shell']) {
    const rank = state.relics[id] || 0;
    if (!rank) continue;
    const meta = RELIC_META[id];
    const ability = (state.abilities || []).find(a => a.id === id);
    const available = !!ability?.available;
    let charged = false;
    let statusText = '';
    if (id === 'prism') {
      charged = (state.charge || 0) > 0;
      statusText = charged
        ? `⚡蓄能 ${state.charge}/${rank}（在 ⚓ 安全台对准目标层释放）`
        : `蓄能 0/${rank}（新桥首次⚡冒险或避波 +1）`;
    } else if (id === 'weave') {
      charged = (state.weaveCharge || 0) > 0;
      statusText = charged
        ? `🌱桥种 ${state.weaveCharge}/${rank}（在已点亮机关种永久捷径）`
        : `桥种 0/${rank}（新桥首次⚡冒险或避波 +1）`;
    } else if (id === 'shadow') {
      charged = !state.shadowUsed && (state.carried || 0) >= 1;
      statusText = state.ghost
        ? `◌ 留影中 ${Math.ceil(state.shadowRemaining || 0)}s`
        : state.shadowUsed
          ? '本庭已用完'
          : (state.carried || 0) >= 1
            ? '⚡可留影（在已点亮机关耗1◇压桥）'
            : '待充能（走1座新桥拿1◇即可留影）';
    } else if (id === 'coil') {
      charged = (state.coilArmed?.length || 0) > 0 && (state.coilRemaining || 0) > 0;
      statusText = (state.coilRemaining || 0) === 0
        ? '本庭接力已用完'
        : charged
          ? '⚡已蓄势（在 ⚓ 安全台切入目标层自动点亮）'
          : `剩余 ${state.coilRemaining}/${rank} 次（下游供能后换层触发）`;
    } else if (id === 'shell') {
      charged = (state.shieldUses || 0) > 0;
      statusText = `🛡️ 护盾 ${state.shieldUses ?? 0}/${rank} 次`;
    }
    items.push({
      id,
      icon: meta.icon,
      name: meta.name,
      rank,
      rankSymbol: 'ⅠⅡⅢ'[rank - 1] || 'Ⅰ',
      charged,
      available,
      statusText,
    });
  }

  let readyAbility = null;
  const activeAbility = (state.abilities || []).find(a => a.available && ['prism', 'weave', 'shadow'].includes(a.id));
  if (activeAbility) {
    if (activeAbility.id === 'prism') {
      const target = nodes.find(n => n.kind === 'mechanism' && n.powered && !(state.activated || []).includes(n.id) && n.layer === state.layer);
      readyAbility = {
        id: 'prism',
        icon: '◇',
        ctaText: `◇ 棱镜就绪：点此远程点亮「${target?.name || '本层机关'}」(免过桥 · Q)`,
      };
    } else if (activeAbility.id === 'weave') {
      const toNode = nodes.find(n => n.id === state.weaveTarget?.edge?.to);
      readyAbility = {
        id: 'weave',
        icon: '❋',
        ctaText: `❋ 桥种就绪：点此种出通往「${toNode?.name || '安全台'}」的永久捷径 (Q)`,
      };
    } else if (activeAbility.id === 'shadow') {
      const curNode = nodes.find(n => n.id === state.node);
      readyAbility = {
        id: 'shadow',
        icon: '◌',
        ctaText: `◌ 留影扣就绪：在「${curNode?.name || '当前机关'}」耗1◇留影压桥 (Q)`,
      };
    }
  }

  let positioningHint = null;
  if (!readyAbility) {
    const curNode = nodes.find(n => n.id === state.node);
    if ((state.relics.prism || 0) > 0 && (state.charge || 0) > 0) {
      const targetMech = nodes.find(n => n.kind === 'mechanism' && n.powered && !(state.activated || []).includes(n.id));
      if (targetMech) {
        const lSym = ['Ⅰ', 'Ⅱ', 'Ⅲ'][targetMech.layer] || '';
        positioningHint = curNode?.anchor
          ? `◇ 棱镜已蓄满！${targetMech.layer > state.layer ? '上滚' : '下滚'}切至 ${lSym} 层即可远程点亮「${targetMech.name}」（免过桥）`
          : `◇ 棱镜已蓄满！走回 ⚓ 安全台切至 ${lSym} 层即可远程点亮「${targetMech.name}」`;
      }
    } else if ((state.relics.weave || 0) > 0 && (state.weaveCharge || 0) > 0) {
      positioningHint = '❋ 已获桥种！站上已点亮的机关即可种出通往 ⚓ 安全台的永久捷径';
    }
  }

  return { items, readyAbility, positioningHint };
}
