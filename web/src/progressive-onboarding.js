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
    badge: '1/4 · 寻路',
    title: '点击发光的 ① 号台，走过去点亮',
    instruction: '左键点击 ① 号台即可顺桥走过去点亮；点亮 3 座机关即可打开 🚪 出口过关。',
    unlockedFeatures: ['click_move'],
  },
  {
    stage: 2,
    id: 'slice_shift',
    badge: '2/4 · 换层',
    title: '站在 ⚓ 归响台上滚轮，切出隐藏的桥',
    instruction: '部分桥藏在上下层空间：先走到 ⚓ 归响台或 ⚓ 维度锚台，上下滚动鼠标滚轮（或点右侧 Ⅰ/Ⅱ/Ⅲ 层）让桥显形。',
    unlockedFeatures: ['click_move', 'layer_shift', 'anomalies'],
  },
  {
    stage: 3,
    id: 'phase_dodge_and_bloom',
    badge: '3/4 · 推理',
    title: '点亮全部①②③，开启 🚪 出口过关',
    instruction: '叠在同一位置的机关要换层才出现（例如站在①上滚轮显现③）；全部点亮后走向 🚪 出口过关。',
    unlockedFeatures: ['click_move', 'layer_shift', 'anomalies', 'vault_dodge', 'risk_bloom'],
  },
  {
    stage: 4,
    id: 'dimensional_mastery',
    badge: '4/4 · 进阶',
    title: '点亮①②③开门·可试⚡冒险或✨宝箱',
    instruction: '已解锁全部机制：可尝试 ⚡ 冒险过桥赢取三倍回响，或探索 ✨ 宝箱与隐藏秘境。',
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
  // A walk taken before the first layer change is a detour. Prefer switching at the
  // anchor the player is already on (then crossing the real bridge) over walking to an
  // already-lit same-XYZ island and only then changing layer.
  const WALK_BEFORE_SHIFT = 10;

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
    const shifted = cur.steps.some(step => step.type === 'shift');
    const moveCost = shifted ? 1 : WALK_BEFORE_SHIFT;
    for (const edge of edges) {
      if (edge.layer !== cur.layer || (edge.from !== cur.id && edge.to !== cur.id)) continue;
      const otherId = edge.from === cur.id ? edge.to : edge.from;
      if (!exists(byId.get(otherId), cur.layer)) continue;
      next.push({ id: otherId, layer: cur.layer, cost: cur.cost + moveCost,
        step: { type: 'move', from: cur.id, to: otherId, layer: cur.layer, edgeId: edge.id } });
    }
    if (node.anchor) {
      for (let layer = 0; layer < layerCount; layer++) {
        if (layer === cur.layer) continue;
        next.push({ id: cur.id, layer, cost: cur.cost + SHIFT_COST,
          step: { type: 'shift', at: cur.id, to: cur.id, layer, kind: 'anchor' } });
      }
    } else {
      // Discrete wheel / layer-step controls move one slice at a time; only offer in-place
      // same_xyz transfers to an adjacent layer so the player never steps onto a vanishing slice.
      for (const other of nodes) {
        if (other.anchor || other.id === cur.id || !Number.isInteger(other.layer) || Math.abs(other.layer - cur.layer) !== 1 || !sameSpot(node, other)) continue;
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

const STEP_BADGES = ['①', '②', '③', '④'];
const STEP_ROMAN = ['Ⅰ', 'Ⅱ', 'Ⅲ'];
const STEP_LAYER_KEYS = ['Z', 'X', 'C'];
// Matches model.js section(): a platform is present while |W − center| is inside this.
const PRESENT_HALF = 0.16 * Math.sqrt(0.75);

/**
 * Stage 1 continuous W (A/D, slider, dial) may drift inside the current slice,
 * but not so far that the glowing ① leaves the screen or the bridge stops being walkable.
 * Returns the clamped W. Callers skip this once layer switching has been introduced.
 */
export function clampIntroductoryW(state, nextW) {
  if (!state || !Number.isFinite(nextW)) return nextW;
  const center = state.layers?.[state.layer]?.center;
  if (!Number.isFinite(center)) return nextW;
  let half = PRESENT_HALF - 1e-3;
  for (const edge of state.edges || []) {
    if (!edge.open || edge.layer !== state.layer) continue;
    if (edge.from !== state.node && edge.to !== state.node) continue;
    const edgeHalf = Math.min(center - edge.min, edge.max - center);
    if (edgeHalf > 0.02) half = Math.min(half, edgeHalf - 1e-3);
  }
  return Math.min(center + half, Math.max(center - half, nextW));
}

function bridgeOutOfRange(state, destId) {
  const edges = (state.edges || []).filter(edge => edge.open && edge.layer === state.layer
    && ((edge.from === state.node && edge.to === destId) || (edge.to === state.node && edge.from === destId)));
  if (!edges.length) return false;
  return edges.every(edge => state.w < edge.min - 1e-9 || state.w > edge.max + 1e-9);
}

function sameLayerUnusable(state, node) {
  if (!node) return false;
  if (!node.anchor && node.layer === state.layer && node.present === false) return true;
  if (node.anchor || node.layer === state.layer) return bridgeOutOfRange(state, node.id);
  return false;
}

function sliceRecover(state, sym, goalId) {
  const key = STEP_LAYER_KEYS[state.layer] || '本层键';
  return {
    goalId,
    action: 'recover',
    banner: `按${key}回中心见${sym}`,
    detail: `${sym}还在这一层，只是切片偏了。按 ${key} 或点本层按钮，回到层中心就能看见并点它。`,
    targetId: goalId,
    layer: state.layer,
  };
}

function stepBadge(state, id) {
  if (id === 'exit') return '🚪';
  const order = state.mechanismOrder || [];
  const index = order.indexOf(id);
  return index >= 0 ? (STEP_BADGES[index] || String(index + 1)) : '';
}

function anchorHintName(node) {
  if (!node) return '⚓台';
  if (node.id === 'hub') return '归响台';
  if (node.id === 'relay') return '维度锚台';
  if (node.id === 'vault') return '花匣台';
  if (node.id === 'ferry') return '星舟';
  return node.name || '⚓台';
}

function sharesSpot(a, b) {
  return !!(a?.world && b?.world &&
    Math.abs(a.world.x - b.world.x) < 1e-4 &&
    Math.abs(a.world.y - b.world.y) < 1e-4 &&
    Math.abs(a.world.z - b.world.z) < 1e-4);
}

/**
 * The single next action a newcomer can follow. The goal is always an unlit
 * mechanism (or the exit once they are all lit) — never an already-lit island.
 * Banners stay within 20 characters so the theater onboarding line can show them.
 */
export function describeNextStep(state) {
  const blank = { goalId: null, action: 'wait', banner: '', detail: '', targetId: null, layer: null };
  if (!state || state.phase !== 'playing' || state.travel || state.wave) return blank;
  const nodes = state.nodes || [];
  const byId = id => nodes.find(node => node.id === id);
  const order = state.mechanismOrder || nodes.filter(node => node.kind === 'mechanism').map(node => node.id);
  const activated = new Set(state.activated || []);
  const powered = new Set(state.powered || []);
  const goalId = activated.size >= order.length
    ? 'exit'
    : order.find(id => powered.has(id) && !activated.has(id));
  if (!goalId) {
    const pending = order.find(id => !activated.has(id));
    const sym = pending ? stepBadge(state, pending) : '';
    return pending
      ? { goalId: pending, action: 'wait', banner: `稍候，${sym}即将供能`, detail: `能量还在路上，${sym}供能后就能前往点亮。`, targetId: pending, layer: byId(pending)?.layer ?? null }
      : blank;
  }
  const goal = byId(goalId);
  const sym = stepBadge(state, goalId);
  const here = byId(state.node);
  const dir = layer => (layer > state.layer ? '上滚' : '下滚');
  const roman = layer => STEP_ROMAN[layer] || '';
  const litTwin = goal && nodes.find(node => node.id !== goalId && activated.has(node.id) && sharesSpot(node, goal));
  const twinSym = litTwin ? stepBadge(state, litTwin.id) : '';

  if (state.node === goalId && goal && (goal.anchor || goal.layer === state.layer)) {
    if (!goal.anchor && goal.present === false) return sliceRecover(state, sym, goalId);
    if (goalId === 'exit') {
      return { goalId, action: 'done', banner: '已到🚪，点击过关', detail: '三座机关都已点亮，点击出口即可过关。', targetId: goalId, layer: state.layer };
    }
    return { goalId, action: 'activate', banner: `点亮脚下的${sym}`, detail: `已经站在${sym}上，稍候就会点亮。`, targetId: goalId, layer: goal.layer };
  }

  const plan = planLayerRoute(state, goalId);
  if (!plan) {
    return { goalId, action: 'wait', banner: `先供能才能点${sym}`, detail: `${sym}还没有路，先点亮它需要的前序机关。`, targetId: goalId, layer: goal?.layer ?? null };
  }

  const stackNote = litTwin
    ? `${sym}和${twinSym}叠在同一位置的不同层，换层后${sym}才会出现。`
    : '';
  const goalReachableInCurrentLayer = !plan.shift && Boolean(goal && !goal.anchor && goal.layer === state.layer);

  const onShiftAnchor = plan.shift && plan.shift.at === state.node;
  if (plan.walk.length && !onShiftAnchor) {
    const step = plan.walk[0];
    const dest = byId(step.to);
    const goalVerb = sym === '🚪' ? '去🚪' : `点${sym}`;
    if (sameLayerUnusable(state, dest)) {
      if (goalReachableInCurrentLayer) return sliceRecover(state, sym, goalId);
      if (dest && !dest.anchor) {
        const key = STEP_LAYER_KEYS[state.layer] || '本层键';
        return {
          goalId,
          action: 'recover',
          banner: `按${key}回中心再去换层${goalVerb}`,
          detail: `切片偏了，先按 ${key} 或点本层按钮回到本层中心，再前往换层点位${sym === '🚪' ? '走向🚪' : `点亮${sym}`}。${stackNote}`,
          targetId: step.to,
          layer: state.layer,
        };
      }
    }
    if (dest?.anchor && dest.id !== state.node) {
      const place = anchorHintName(dest);
      const hereName = here?.anchor ? anchorHintName(here) : '';
      const which = hereName && hereName !== place ? `脚下是${hereName}，要去${place}。` : `要去的是${place}。`;
      if (plan.shift) {
        return {
          goalId, action: 'move', banner: `去${place}换层${goalVerb}`,
          detail: `${which}到了${place}再换层，通往${sym}的桥才会出现。${stackNote}`,
          targetId: step.to, layer: plan.shift.layer,
        };
      }
      return {
        goalId, action: 'move', banner: `去${place}，再${goalVerb}`,
        detail: `${which}先走到${place}，再前往${sym}。`,
        targetId: step.to, layer: state.layer,
      };
    }
    if (step.to !== goalId && activated.has(step.to)) {
      const via = stepBadge(state, step.to) || '前序';
      return {
        goalId, action: 'move', banner: `先到${via}再换层点${sym}`,
        detail: `先走到${via}，再换层，${sym}才会出现。${stackNote}`,
        targetId: step.to, layer: plan.shift?.layer ?? state.layer,
      };
    }
    return {
      goalId, action: 'move', banner: goalId === 'exit' ? '点击🚪，走向出口' : `点击${sym}，走过去点亮`,
      detail: goalId === 'exit' ? '三座机关都已点亮，点击出口顺桥过关。' : `点击发光的${sym}，顺着当前层的桥走过去就会点亮。`,
      targetId: step.to, layer: state.layer,
    };
  }

  if (plan.shift) {
    const layer = plan.shift.layer;
    const arrow = dir(layer);
    const mark = roman(layer);
    if (plan.shift.kind === 'recover') {
      const goalVerb = sym === '🚪' ? '去🚪' : `点${sym}`;
      return {
        goalId, action: 'shift',
        banner: `${arrow}回${mark}站稳，再${goalVerb}`,
        detail: `脚下平台只在${mark}层存在。先${arrow}回${mark}层站稳，再继续换层前往${sym}。${stackNote}`,
        targetId: state.node, layer,
      };
    }
    if (plan.shift.kind === 'same_xyz') {
      const fromSym = stepBadge(state, plan.shift.at) || twinSym || '①';
      return {
        goalId, action: 'shift',
        banner: `站${fromSym}${arrow}显现${sym}`,
        detail: `${sym}和${fromSym}叠在同一位置。站在${fromSym}，${arrow}到${mark}层，${sym}才会出现。`,
        targetId: plan.shift.at, layer,
      };
    }
    const shiftBanner = sym === '🚪' ? `${arrow}到${mark}，走向🚪` : `${arrow}到${mark}，点亮${sym}`;
    return {
      goalId, action: 'shift',
      banner: shiftBanner,
      detail: here?.anchor
        ? `就在${anchorHintName(here)}，${arrow}到${mark}层，或直接点${mark}。通往${sym}的桥会显形。${stackNote}`
        : `在⚓台${arrow}到${mark}层，或直接点${mark}。通往${sym}的桥会显形。${stackNote}`,
      targetId: state.node, layer,
    };
  }

  if (goalReachableInCurrentLayer && sameLayerUnusable(state, goal)) return sliceRecover(state, sym, goalId);
  return {
    goalId, action: 'move',
    banner: goalId === 'exit' ? '点击🚪过关' : `点击${sym}，走过去点亮`,
    detail: goalId === 'exit' ? '点击出口过关。' : `点击${sym}即可点亮。`,
    targetId: goalId, layer: state.layer,
  };
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
