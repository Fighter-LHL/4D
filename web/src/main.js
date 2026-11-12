import { GameModel, RELICS } from './model.js';
import { SceneRenderer } from './scene.js';
import { GameAudio } from './audio.js';
import { isFlatlandArrival } from './flatland/handoff.js';
import { courtyardFriends, friendGuideText } from './courtyard-friends.js';
import { FriendGuide } from './friend-guide.js';
import { CourtyardMomentum } from './courtyard-momentum.js';
import { STARTER_RELICS, mechanismFeedback, contextualHelp, courtyardActions } from './play-feedback.js';
import { initThemeToggle, initHyperLab } from './hyper-lab-ui.js';
import { ProgressiveOnboarding, planLayerRoute, findCurrentLayerRoute, computeRiskDecisionPreview, computeRelicHudStatus, resolveScrubReleaseTarget, describeNextStep, clampIntroductoryW } from './progressive-onboarding.js';
import { CodexStore } from './codex.js';
import { GameFeel } from './game-feel.js';
import { ALL_ROOM_TEMPLATES, HIDDEN_ROUTE_RECIPES } from './rooms.js';
import { CURIOSITY_CATALOG } from './exploration-radar.js';

const $ = id => document.getElementById(id);
const runPanel = $('run-panel');
const panelToggle = $('panel-toggle');
const isTheater = () => document.documentElement.classList.contains('theater');
function closeAdvancedDrawers() {
  const openDrawers = document.querySelectorAll('details.advanced-drawer[open]');
  if (!openDrawers.length) return false;
  for (const drawer of openDrawers) drawer.open = false;
  return true;
}
const onboarding = new ProgressiveOnboarding({ skillGated: true });
const compactProgress = matchMedia('(max-height: 500px) and (max-width: 1000px)');
const mobileLayout = matchMedia('(max-height: 500px) and (max-width: 1000px), (max-width: 780px)');
const syncProgressDetails = () => { if ($('run-details')) $('run-details').open = false; };
compactProgress.addEventListener('change', syncProgressDetails);
syncProgressDetails();
const hasSupplySlots = id => [...$('mechanisms').children].some(row =>
  row.dataset.mechanism === id && row.querySelector('[data-source]') && row.getClientRects().length > 0);
const setHTML = (id,html) => { const el=$(id); if(el.innerHTML!==html)el.innerHTML=html; };
const setText = (id,text) => { const el=$(id); const value=String(text);if(el.textContent!==value)el.textContent=value; };
const icons = { prism:'◇', shadow:'◌', shell:'◈', coil:'⌁', weave:'❋' };
const traits = { prism:'穿层送能 · 蓄能主动', shadow:'跨层压板 · 主动留影', shell:'失稳保护 · 自动触发', coil:'跨层接力 · 换层触发', weave:'冒险落种 · 永久开路' };
const layerSymbols = ['Ⅰ','Ⅱ','Ⅲ'];
const numBadges = ['①','②','③','④'];
const mechCountOf = s => s?.mechanismOrder?.length || s?.nodes?.filter(n => n.kind === 'mechanism').length || 3;
const newSeed = () => globalThis.crypto?.getRandomValues ? crypto.getRandomValues(new Uint32Array(1))[0] : Date.now() >>> 0;
const initialUrlParams = new URL(location.href).searchParams;
const requestedSeed = initialUrlParams.get('seed');
let currentMode = initialUrlParams.get('mode') === 'expedition' ? 'expedition' : 'intro';
const initialSeed = requestedSeed !== null && /^\d{1,10}$/.test(requestedSeed) && Number(requestedSeed)<=0xffffffff ? Number(requestedSeed) : newSeed();
function rememberSeed(seed, mode = currentMode) {
  const url = new URL(location.href);
  url.searchParams.set('seed', String(seed));
  if (mode === 'expedition') url.searchParams.set('mode', 'expedition');
  else url.searchParams.delete('mode');
  history.replaceState(null, '', url);
}
const readPreference = (key, fallback) => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
const savePreference = (key,value) => { try { localStorage.setItem(key,String(value)); } catch { /* Private browsing can disable persistence. */ } };
const readJSON = key => { try { return JSON.parse(readPreference(key, '{}')); } catch { return {}; } };
const codex = new CodexStore();
const ferryFirst = initialUrlParams.get('ferry') === 'first';
const modelOptions = () => ({ mode: currentMode, ...(ferryFirst ? { ferryFromRoom: 0 } : {}) });
const model = new GameModel(initialSeed, modelOptions());
const fromFlatland = isFlatlandArrival(location.search, readJSON('wslice-flatland-stars'), readJSON('wslice-flatland-visits'));
$('chapter-arrival').hidden = !fromFlatland;
rememberSeed(initialSeed, currentMode);
// The very first run starts with the forgiving 缓落壳 so a new player meets zero decisions in
// the tutorial courtyard; relic choices still arrive between rooms. Once the first 3-room run
// is won, every new run opens with the normal relic picker and non-tutorial HUD again.
const FIRST_RUN_DONE_KEY = 'wslice-first-run-done';
const isFirstRun = () => readPreference(FIRST_RUN_DONE_KEY, '') !== 'yes';
const isFirstRunGuide = s => Boolean(
  s && s.phase === 'playing' && s.mode !== 'expedition' && !onboarding.unlockAllOverride && isFirstRun()
);
// Arrivals from Flatland keep their own starter picker (the discovery arrival offers
// "带缓落壳出发" as the primary choice with alternatives folded away).
const arrivedFrom = new URLSearchParams(location.search).get('from');
function autoEquipFirstRun() {
  if (currentMode === 'intro' && model.snapshot().phase === 'choose' && !fromFlatland && arrivedFrom !== 'discovery' && isFirstRun()) model.chooseRelic('shell');
}
autoEquipFirstRun();
const audio = new GameAudio();
let soundEnabled = readPreference('wslice-sound','on') === 'on';
let best = Math.max(0, Number(readPreference('wslice-best','0')) || 0);
audio.setEnabled(soundEnabled);
let paused = false;
let lastPhase = '';
let destinationKey = '';
let buildKey = '';
let roomKey = '';
let secretKey = '';
let sealKey = '';
let lastStatus = '';
let lastFrame = performance.now();
let transient = null;
let transientTime = 0;
let transientType = '';
let actionFeedback = '';
const dialogs = ['choice-dialog','help-dialog','pause-dialog','result-dialog','restart-dialog','hyper-lab-dialog','chapter-dialog','codex-dialog'];
const isModal = () => dialogs.some(id => $(id)?.open);
const canAct = () => !paused && !isModal() && model.snapshot().phase === 'playing';
const guide = new FriendGuide();
const firstDiscoveryArrival = new URLSearchParams(location.search).get('from') === 'discovery' &&
  courtyardFriends(readJSON('wslice-flatland-friends')).length > 0 && readPreference('wslice-courtyard-welcome', '') !== 'seen';
const momentum = new CourtyardMomentum({ arrival: firstDiscoveryArrival });
let discoveryChoicePending = firstDiscoveryArrival;
// Spend the entry attempt now, including an entry already occupied by guidance.
if (firstDiscoveryArrival) savePreference('wslice-courtyard-welcome', 'seen');
function askFriend() {
  if (canAct()) {
    momentum.cancel();
    onboarding.requestExplicitHint();
    guide.request(model.snapshot());
    updateUI();
  }
}
let autoPilot = null;
function cancelAutoPilot() {
  autoPilot = null;
  if (scene) scene.pendingLayerPrompt = null;
}
let altarTune = null;
const ALTAR_TUNE_WINDOW_MS = 680;
let oneShotRiskCrossing = false;
// Dial/ferry W scrubs: a live grab session plus a short glide that carries the
// release momentum to the nearest layer center, then runs the manual-shift aftermath.
let scrubSession = null;
let scrubGlide = null;
function cancelScrubGlide() { scrubGlide = null; }
function syncWRulerThumb(w, state) {
  const ruler = $('layer-controls');
  if (!ruler) return;
  const wVal = Number.isFinite(w) ? w : (state?.w ?? 0.5);
  const centers = state?.layers?.map(l => l.center) || [0.18, 0.5, 0.82];
  const c0 = centers[0] ?? 0.18;
  const c2 = centers[centers.length - 1] ?? 0.82;
  const span = Math.max(0.01, c2 - c0);
  const t = Math.max(-0.14, Math.min(1.14, (wVal - c0) / span));
  ruler.style.setProperty('--w-t', t.toFixed(4));
  const mid = centers[1] ?? 0.5;
  const thumbColor = wVal < (c0 + mid) / 2 ? '#2aa89a' : wVal > (mid + c2) / 2 ? '#d69d2a' : '#7b66d0';
  ruler.style.setProperty('--thumb-color', thumbColor);
  if (state) {
    const cur = state.nodes?.find(n => n.id === state.node);
    const sameAny = cur && !cur.anchor && state.nodes?.some(n =>
      !n.anchor && n.id !== cur.id && n.world && cur.world &&
      Math.abs(n.world.x - cur.world.x) < 1e-4 &&
      Math.abs(n.world.y - cur.world.y) < 1e-4 &&
      Math.abs(n.world.z - cur.world.z) < 1e-4);
    const canShift = !!(state.phase === 'playing' && !state.travel && (state.wave || cur?.anchor || sameAny));
    ruler.dataset.canShift = String(canShift);
  }
}
function finishScrubSession(session) {
  if (!session?.before) return;
  layerShiftAftermath(session.before, 'scrub');
}
function handleScrubW(w, { phase = 'move', velocity = 0 } = {}) {
  if (!canAct()) return;
  onboarding.recordActivity();
  if (phase === 'start') {
    cancelScrubGlide();
    autoPilot = null;
    scrubSession = { before: model.snapshot() };
    return;
  }
  if (phase === 'move') {
    cancelScrubGlide();
    action(() => model.scrubW(clampWToCurrentLayer(w)));
    return;
  }
  const session = scrubSession;
  scrubSession = null;
  if (!session) return;
  const s = model.snapshot();
  if (s.travel?.risky) { finishScrubSession(session); return; }
  if (phase !== 'cancel') action(() => model.scrubW(clampWToCurrentLayer(w)));
  const after = model.snapshot();
  if (after.travel?.risky) { finishScrubSession(session); return; }
  const target = resolveScrubReleaseTarget(after, {
    phase,
    w: after.w,
    velocity,
    beforeW: session.before.w,
  });
  if (scene.reducedMotion) {
    action(() => model.scrubW(clampWToCurrentLayer(target)));
    finishScrubSession(session);
  } else {
    scrubGlide = { target, session };
  }
}
let bannerStage = 0;
let bannerExpandedUntil = 0;
let bannerDescOpen = false;
let bannerDescDismissed = false;
let relicHudKey = '';

// `type` lets an accepted departure retire messages that belonged to the spot just left
// ('refused' targets and 'prompt' layer instructions), while remote supply news stays.
function showTransient(message, seconds = 3.2, type = 'hint') {
  const compactTheater = isTheater() && compactProgress.matches;
  transient = message;
  transientTime = compactTheater ? Math.min(seconds, 1.2) : seconds;
  transientType = type;
  actionFeedback = message;
  $('announcement').textContent = message;
}

function buildLayerShiftPromptMessage(s, { targetId, targetLayer, atNode, toNode, kind, anomalyName }, revealExplicit) {
  if (isTheater()) {
    const wheelDir = targetLayer > s.layer ? '上滚' : '下滚';
    if (kind === 'recover') return `⚠️ 脚下悬空！滚轮切回 ${layerSymbols[targetLayer]} 层`;
    if (kind === 'anomaly') {
      return revealExplicit ? `✦ 在 ⚓ 台${wheelDir}切到 ${layerSymbols[targetLayer]} 层寻宝` : '✦ 在 ⚓ 台滚轮切层收录奇物';
    }
    if (kind === 'same_xyz') {
      return revealExplicit ? `🌀 原地${wheelDir}切到 ${layerSymbols[targetLayer]} 层` : '🌀 在此滚轮换层，原地切岛';
    }
    if (atNode === targetId) {
      return revealExplicit ? `🌀 在此${wheelDir}切到 ${layerSymbols[targetLayer]} 层开启` : '🌀 在此滚轮切到对应层开启';
    }
    return revealExplicit ? `🌀 站在 ⚓ 台${wheelDir}切到 ${layerSymbols[targetLayer]} 层显桥` : '🌀 站在 ⚓ 台滚轮换层，让虚线桥显形';
  }
  const layerLabel = `${layerSymbols[targetLayer]} ${s.layers[targetLayer]?.name || '目标层'}`;
  const atName = s.nodes.find(n => n.id === atNode)?.name || '安全台';
  const targetName = s.nodes.find(n => n.id === targetId)?.name || '目标';
  const toName = s.nodes.find(n => n.id === toNode)?.name || targetName;
  const wheelDir = targetLayer > s.layer ? '上滚 ▲' : '下滚 ▼';
  const how = `亲手【滚轮${wheelDir}】（或点左上角 ${layerSymbols[targetLayer]}）切到【${layerLabel}】`;
  if (kind === 'recover') return `⚠️ 脚下平台只在【${layerLabel}】存在！${how}站稳`;
  if (kind === 'anomaly') {
    const cName = anomalyName || '异维奇物';
    if (!revealExplicit) {
      return `✦ 已到「${atName}」！观察「${cName}」波纹色彩，亲手【滚动滚轮】切至对应层即可自动收录`;
    }
    return `✦ 已到「${atName}」！${how}，即可自动收录「${cName}」(+2◆)`;
  }
  if (!revealExplicit) {
    if (kind === 'same_xyz') {
      return `🌀 脚下与「${toName}」四维同位叠合！观察重影颜色与菱形层标，亲手【滚动滚轮】原地切过去（按 H 可看层提示）`;
    }
    if (atNode === targetId) {
      return `🌀 已到「${atName}」！观察相位锁颜色与层标，亲手【滚动滚轮】调谐至对应层再开启`;
    }
    return `🌀 已到「${atName}」！观察通往「${targetName}」的虚线桥颜色与上下偏移，亲手【滚动滚轮】对准显桥（按 H 可看层提示）`;
  }
  if (kind === 'same_xyz') return `🌀 脚下与「${toName}」在同一位置！${how}，原地换到它上面`;
  if (atNode === targetId) return `🌀 已到「${atName}」！${how}再开启`;
  return `🌀 已到「${atName}」！${how}，让通往「${targetName}」的桥显形`;
}

function shouldHoldEchoesAtHub(s) {
  if (!s) return false;
  const riftWaiting = s.nodes?.some(n => n.id === 'rift' && !n.locked) && s.rift?.status === 'available';
  const shadowWaiting = (s.relics?.shadow || 0) > 0 && !s.shadowUsed && (s.activated?.length || 0) < mechCountOf(s);
  return !!(riftWaiting || shadowWaiting);
}

// Stops the autopilot where the plan needs a W change and hands that change to the player.
function promptLayerShift(s, targetId, shift, finalLayer = null) {
  const anomProg = scene.explorationRadar.roomProgress(s);
  const revealExplicit = onboarding.shouldRevealExplicitLayerHint(s, {
    hintRequested: !!guide.present(s).companionGuide,
    totalAnomaliesCollected: anomProg.totalCollected,
  });
  const promptInfo = {
    targetId,
    targetLayer: shift.layer,
    atNode: shift.at,
    toNode: shift.to,
    kind: shift.kind,
    finalLayer,
  };
  const step = describeNextStep(s);
  const tutorialCopy = isFirstRunGuide(s) && step.banner && step.goalId === targetId;
  const promptMsg = tutorialCopy ? `🌀 ${step.banner}` : buildLayerShiftPromptMessage(s, promptInfo, revealExplicit);
  scene.pendingLayerPrompt = { ...promptInfo, message: promptMsg };
  showTransient(promptMsg, shift.kind === 'recover' ? 3.6 : 4.2, 'prompt');
  updateUI();
}

function stepAutoPilot() {
  if (!canAct()) { autoPilot = null; altarTune = null; return; }
  let s = model.snapshot();
  if (s.travel || s.wave) { altarTune = null; return; }
  let currentNode = s.nodes.find(n => n.id === s.node);
  if (altarTune && altarTune.node !== s.node) altarTune = null;

  // Auto-bank carried echoes upon stepping onto or passing through ⚓ 归响台 (hub),
  // unless an unlocked隐星试炼 (rift) or unspent 留影扣 (shadow) needs unbanked echoes.
  if (s.node === 'hub' && s.carried > 0 && s.interactAvailable && !shouldHoldEchoesAtHub(s)) {
    const savedCarried = s.carried;
    action(() => model.interact());
    s = model.snapshot();
    currentNode = s.nodes.find(n => n.id === s.node);
    if (!autoPilot) {
      showTransient(isTheater() ? `+${savedCarried}◆` : `💎 已自动存入 ${savedCarried} 枚随身回响 (+${savedCarried}◆)`, isTheater() ? 1.8 : 2.6, 'bank');
      updateUI();
      return;
    }
  }

  // Auto-activate mechanism once standing on a powered unlit mechanism on its matching layer:
  // Stage 2+ untuned mechanisms open a crisp 0.58s Altar Resonance Window for tactile +1◆ snap,
  // while pre-tuned mechanisms (or Stage 1 ①) fire instantaneously (0ms).
  if (currentNode?.kind === 'mechanism' && currentNode.layer === s.layer && s.interactAvailable) {
    const stage2Plus = (scene.onboardingStage ?? 4) >= 2;
    const preTuned = Boolean(s.tunedMechanisms?.includes(s.node));
    if (stage2Plus && !preTuned) {
      const now = performance.now();
      if (!altarTune || altarTune.node !== s.node) {
        altarTune = { node: s.node, startedAt: now, until: now + ALTAR_TUNE_WINDOW_MS };
      }
      if (now < altarTune.until) {
        if (!autoPilot || autoPilot.targetNode !== s.node) {
          autoPilot = { targetNode: s.node, altarTuning: true };
        }
        return;
      }
    }
    altarTune = null;
    if (scene) scene.altarWindow = null;
    action(() => model.interact());
    if (autoPilot?.targetNode === s.node) {
      autoPilot = null;
      return;
    }
  }

  if (!autoPilot) return;
  // Give the freshly materialised bridge a moment on screen before walking onto it.
  if (autoPilot.resumeAt && performance.now() < autoPilot.resumeAt) return;

  const { targetNode: targetId, finalLayer = null, anomalyTarget = null } = autoPilot;
  const plan = planLayerRoute(s, targetId, { finalLayer });
  if (!plan) {
    autoPilot = null;
    const name = s.nodes.find(n => n.id === targetId)?.name || '目标';
    showTransient(`🔒 暂时还没有通往「${name}」的路：先点亮前序机关，让桥接通`, 3.2, 'refused');
    return;
  }

  if (plan.walk.length) {
    // Only walk along bridges that are open on the CURRENT layer. Never switch layers for the player.
    const nextStep = plan.walk[0];
    action(() => {
      if (Math.abs(s.w - s.layers[s.layer].center) > .08) model.setW(s.layers[s.layer].center);
      model.select(nextStep.to);
      model.move();
    });
    if (!model.snapshot().travel) autoPilot = null;
    return;
  }

  if (anomalyTarget) {
    autoPilot = null;
    const anomProg = scene.explorationRadar.roomProgress(s);
    const revealExplicit = onboarding.shouldRevealExplicitLayerHint(s, {
      hintRequested: !!guide.present(s).companionGuide,
      totalAnomaliesCollected: anomProg.totalCollected,
    });
    const promptInfo = {
      targetId: null,
      anomalyId: anomalyTarget.id,
      anomalyName: anomalyTarget.name,
      targetLayer: anomalyTarget.targetLayer,
      atNode: s.node,
      kind: 'anomaly',
    };
    const promptMsg = buildLayerShiftPromptMessage(s, promptInfo, revealExplicit);
    scene.pendingLayerPrompt = { ...promptInfo, message: promptMsg };
    showTransient(promptMsg, 4.0, 'prompt');
    updateUI();
    return;
  }

  if (plan.shift) {
    autoPilot = null;
    promptLayerShift(s, targetId, plan.shift, finalLayer);
    return;
  }

  // Arrived at the target in the right layer.
  autoPilot = null;
  if (s.interactAvailable && s.node !== 'hub') action(() => model.interact());
}

function layerSwitchTaught() {
  return (scene?.onboardingStage ?? 4) >= 2;
}

// Before layer switching is introduced, A/D, the slider and the dial may drift
// inside the current slice, but not far enough for ① to vanish or the bridge to close.
function clampWToCurrentLayer(nextW) {
  if (layerSwitchTaught()) return nextW;
  return clampIntroductoryW(model.snapshot(), nextW);
}

function manualSwitchLayer(layerIdx, source = 'manual') {
  if (!canAct()) return;
  onboarding.recordActivity();
  const s = model.snapshot();
  if (layerIdx < 0 || layerIdx >= s.layers.length) return;
  if (s.travel?.ramp && !s.travel.risky) return;
  // Wheel, Z/X/C, layer buttons, the W stack, the lens and assist all come
  // through here. None of them may change layer until the lesson starts.
  if (!layerSwitchTaught() && !s.wave && layerIdx !== s.layer) return;

  // During a wave, switch directly to the player's chosen layer (requiring real judgment!)
  if (s.wave) {
    autoPilot = null;
    if (s.layer === layerIdx && s.wave.variant === 'rift' && !s.wave.entered) {
      model.setW(s.layers[layerIdx === 1 ? 0 : 1].center);
    }
    action(() => model.setW(s.layers[layerIdx].center));
    const afterWave = model.snapshot();
    const isNowSafe = afterWave.wave?.safeLayers?.includes(layerIdx);
    if (isNowSafe) {
      onboarding.recordWaveDodge();
      transient = `🛡️ 选对安全层！已躲进【${s.layers[layerIdx].name}】四维夹缝！`;
    } else {
      const safeNames = (s.wave.safeLayers || []).map(i => `${layerSymbols[i]} ${s.layers[i].name}`).join(' / ');
      transient = `⚠️ 【${s.layers[layerIdx].name}】仍有冲击波！快看绿圈提示切往【${safeNames}】！`;
    }
    transientTime = 2.4;
    actionFeedback = transient;
    $('announcement').textContent = transient;
    updateUI();
    return;
  }

  const prevLayer = s.layer;
  const here = s.nodes.find(n => n.id === s.node);
  // Stage 1 has not taught layers yet: an outer platform only exists in its own layer,
  // so a stray wheel / key there must not drop a new player into the void.
  if ((scene.onboardingStage ?? 4) < 2 && here && !here.anchor && layerIdx !== prevLayer && source !== 'assist') {
    const partner = s.nodes.find(n => !n.anchor && n.id !== here.id && n.layer === layerIdx && n.world && here.world &&
      Math.abs(n.world.x - here.world.x) < 1e-4 && Math.abs(n.world.y - here.world.y) < 1e-4 && Math.abs(n.world.z - here.world.z) < 1e-4);
    if (!partner) {
      showTransient(isTheater() ? '⚓ 先点亮 ①，再去 ⚓ 归响台换层' : '⚓ 外圈平台只存在于当前层，现在换层会踩空。先点亮 ①，之后会教你在中央的 ⚓ 归响台换层', 3.2, 'refused');
      updateUI();
      return;
    }
  }
  autoPilot = null;
  cancelScrubGlide();
  action(() => model.setW(s.layers[layerIdx].center));
  layerShiftAftermath(s, source);
  updateUI();
}

// Shared manual-layer-change bookkeeping: onboarding shift record, prompt resolution,
// autopilot resume and the materialize "aha" — used by manualSwitchLayer and by
// dial/ferry W scrubs that land in a different layer than they started.
function layerShiftAftermath(before, source = 'manual') {
  const after = model.snapshot();
  if (after.layer === before.layer) return;
  const order = before.mechanismOrder || before.nodes.filter(n => n.kind === 'mechanism').map(n => n.id);
  const nextMechId = order.find(id => {
    const n = before.nodes.find(item => item.id === id);
    return n && n.powered && !before.activated.includes(id);
  });
  const prompt = scene.pendingLayerPrompt;
  const targetId = prompt?.targetId || (before.activated.length >= mechCountOf(before) ? 'exit' : nextMechId);
  const prevOpenCurrent = new Set(
    (before.edges || []).filter(e => e.open && e.layer === before.layer).map(e => e.id)
  );
  const newlyVisibleEdges = (after.edges || []).filter(
    e => e.open && e.layer === after.layer && !prevOpenCurrent.has(e.id) &&
    (e.from === after.node || e.to === after.node || (targetId && (e.from === targetId || e.to === targetId)))
  );
  const targetNode = targetId ? after.nodes.find(n => n.id === targetId) : null;
  const revealedTarget = newlyVisibleEdges.length > 0 || (targetNode && targetNode.layer === after.layer && !targetNode.anchor);
  onboarding.recordManualLayerShift({ revealedBridge: revealedTarget });

  // The player made the prompted change themselves: resume the walk to the clicked target.
  // (phaseStability only decays on the next tick, so check the footing directly.)
  const footing = after.nodes.find(n => n.id === after.node);
  const stable = !!footing && (footing.anchor || footing.layer === after.layer);
  const prismReady = !!after.abilities?.some(a => a.id === 'prism' && a.available);
  const resume = !!prompt && prompt.targetLayer === after.layer && stable;
  if (prompt && (resume || after.node !== prompt.atNode || ((source === 'button' || source === 'wstack') && prompt.kind === 'anomaly' && after.layer !== prompt.targetLayer))) {
    scene.pendingLayerPrompt = null;
  }
  if (resume && prompt.kind === 'anomaly') {
    const anomRes = scene.explorationRadar.interact(after, prompt.anomalyId);
    if (collectMaterializedAnomaly(anomRes)) return;
  }
  if (after.node !== before.node && footing?.kind === 'mechanism' && footing.powered && !after.activated.includes(footing.id) && after.interactAvailable && !prismReady) {
    scene.pendingLayerPrompt = null;
    action(() => model.interact());
    return;
  }
  if (resume && prompt.targetId && !prismReady) {
    autoPilot = { targetNode: prompt.targetId, finalLayer: prompt.finalLayer ?? null, resumeAt: performance.now() + 700 };
  }

  if (revealedTarget && stable) {
    scene.triggerMaterializeAha(after.layer, newlyVisibleEdges, targetNode);
    if (targetNode) {
      const layerName = after.layers[after.layer].name;
      if (prismReady) showTransient(isTheater() ? '✨ 桥已显形 · 按 Q 远程点亮' : `✨ 桥在【${layerName}】显形，且 ◇ 回流棱镜已就绪！点下方紫色按钮（或按 Q）可直接远程点亮「${targetNode.name}」`, 4.0);
      else if (resume && prompt.targetId) showTransient(isTheater() ? '✨ 新桥显形，自动前往…' : `✨ 桥在【${layerName}】显形了！继续前往「${targetNode.name}」…`, 3.0);
      else if (targetNode.layer === after.layer) showTransient(isTheater() ? '✨ 新桥已显形，点击前往' : `✨ 隐形的桥与「${targetNode.name}」在【${layerName}】显形了！点击它即可顺桥走过去`, 3.6);
    }
  }
}

function unlitSameSpot(s, id) {
  const node = s.nodes.find(n => n.id === id);
  if (!node || node.anchor || node.kind !== 'mechanism' || !s.activated.includes(id) || !node.world) return null;
  const order = s.mechanismOrder || [];
  return order.find(otherId => {
    if (otherId === id || s.activated.includes(otherId)) return false;
    const other = s.nodes.find(n => n.id === otherId);
    return other?.powered && !other.anchor && other.world &&
      Math.abs(other.world.x - node.world.x) < 1e-4 &&
      Math.abs(other.world.y - node.world.y) < 1e-4 &&
      Math.abs(other.world.z - node.world.z) < 1e-4;
  }) || null;
}

function handleCanvasSelect(id) {
  if (!canAct()) return;
  onboarding.recordActivity();
  const s = model.snapshot();
  if (s.wave) {
    const safeNames = (s.wave.safeLayers || []).map(i => `${layerSymbols[i]} ${s.layers[i].name}`).join(' / ');
    transient = `⚡ 冲击波来袭！请亲手滚动滚轮（或点左上角三层图）切入【${safeNames}】躲避！`;
    transientTime = 2.5;
    actionFeedback = transient;
    $('announcement').textContent = transient;
    updateUI();
    return;
  }
  // Dew and bell share a screen position. A click on the lit island is really
  // the unlit twin; routing back to the lit one clears the hint and sticks the run.
  const stacked = unlitSameSpot(s, id);
  if (stacked) id = stacked;
  const currentNode = s.nodes.find(n => n.id === s.node);
  const targetNode = s.nodes.find(n => n.id === id);
  if (id === 'rift' && targetNode?.locked) {
    const eligible = (s.hiddenRoutes || []).find(r => r.eligible && !r.unlocked);
    if (eligible) {
      const entryNode = s.nodes.find(n => n.id === eligible.entry);
      const seqStr = (eligible.sequence || []).map(l => layerSymbols[l]).join(' → ');
      transient = `🔮 秘境封印已松动！前往「${entryNode?.name || '安全台'}」依次滚轮切入 ${seqStr} 层即可开启隐星秘境！`;
      transientTime = 3.6;
      actionFeedback = transient;
      $('announcement').textContent = transient;
      handleCanvasSelect(eligible.entry);
      return;
    }
    if ($('run-details')) $('run-details').open = true;
    if ($('secret-panel')) $('secret-panel').open = true;
    openPanel();
    const riftDrawerHint = isTheater() && mobileLayout.matches ? '已在底部展开秘印配方。' : '已在右侧展开秘印配方。';
    transient = `🌌 隐藏秘境「隐星台」：跨庭集齐 2 件共鸣遗物并在指定的 ⚓ 安全台完成三印换层，即可开启隐藏第四岛 (+9◆)！${riftDrawerHint}`;
    transientTime = 3.8;
    actionFeedback = transient;
    $('announcement').textContent = transient;
    updateUI();
    return;
  }
  if (id === 'vault' && targetNode?.locked) {
    transient = `✨ 花匣被相位锁保护：先点亮前序机关解锁通路，即可前来开启夺取 +${s.roomChallenge?.reward || 4}◆！`;
    transientTime = 3.2;
    actionFeedback = transient;
    $('announcement').textContent = transient;
    updateUI();
    return;
  }
  if (id === s.node) {
    if (s.phaseStability < .99 && currentNode && !currentNode.anchor) {
      autoPilot = null;
      action(() => model.setW(s.layers[currentNode.layer].center));
      return;
    }
    if (id === 'vault' && !targetNode?.locked && s.vaultStatus !== 'escaped') {
      const entryLayer = s.roomChallenge?.entryLayer ?? targetNode.layer;
      if (s.layer !== entryLayer) {
        promptLayerShift(s, 'vault', { type: 'shift', at: 'vault', to: 'vault', layer: entryLayer, kind: 'anchor' }, entryLayer);
        return;
      }
    }
    if (scene.relicHud?.readyAbility) {
      $('quick-ability-btn')?.click();
      return;
    }
    if (s.interactAvailable) {
      autoPilot = null;
      action(() => model.interact());
      return;
    }
    return;
  }

  // Plan over (platform, layer): the autopilot walks bridges on the CURRENT layer only and stops
  // exactly where a W change is needed, so the player always rolls the layer that reveals the bridge.
  scene.pendingLayerPrompt = null;
  // A mechanism the checklist marks 🔒 says what it still needs instead of sending the player
  // on a trip to a platform that cannot be lit yet (even when a bridge happens to lead there).
  if (targetNode?.kind === 'mechanism' && !targetNode.powered && !s.activated.includes(id)) {
    autoPilot = null;
    const order = s.mechanismOrder || [];
    const missing = (targetNode.required || []).filter(req => !(targetNode.received || []).includes(req))
      .map(req => numBadges[order.indexOf(req)] || '前序机关');
    showTransient(`🔒「${targetNode.name}」还没供能：先点亮 ${missing.join('+') || '前序机关'}`, 3.2, 'refused');
    updateUI();
    return;
  }
  const finalLayer = id === 'vault' && s.vaultStatus === 'available' ? (s.roomChallenge?.entryLayer ?? null) : null;
  const plan = planLayerRoute(s, id, { finalLayer });
  if (!plan) {
    autoPilot = null;
    const hint = targetNode?.kind === 'mechanism' && !targetNode.powered ? '先点亮前序机关为它供能' : '先点亮前序机关，让桥接通';
    showTransient(`🔒 暂时还没有通往「${targetNode?.name || '目标'}」的路：${hint}`, 3.2, 'refused');
    updateUI();
    return;
  }
  if (targetNode) scene.addEffect('ring', targetNode, { duration: .8, radius: 78, color: plan.shift ? '#5eead4' : '#fbbf24' });
  if (plan.shift && !plan.walk.length) {
    autoPilot = null;
    promptLayerShift(s, id, plan.shift, finalLayer);
    return;
  }
  autoPilot = { targetNode: id, finalLayer };
  if (plan.shift) {
    const atNode = s.nodes.find(n => n.id === plan.shift.at);
    const atName = plan.shift.at === 'relay' ? '维度锚台' : plan.shift.at === 'hub' ? '归响台' : (atNode?.name || '归响台');
    showTransient(isTheater() ? `⚓ 先去${atName}，再滚轮换层` : `⚓「${targetNode?.name || '目标'}」的桥不在这一层：先带你走到「${atName}」，到了请亲手滚轮换层`, isTheater() ? 1.5 : 3.4);
  }
  stepAutoPilot();
}

// Side-panel shortcuts act on the scene; on phones the panel sits below the canvas, so
// bring the scene (and its result popup) back into view before acting.
function revealScene() {
  const wrap = document.querySelector('.scene-wrap') || $('scene');
  const rect = wrap.getBoundingClientRect();
  if (rect.top >= 0 && rect.bottom <= innerHeight) return;
  wrap.scrollIntoView({ block: rect.height > innerHeight ? 'start' : 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}
function selectFromPanel(id) { revealScene(); closePanel(); handleCanvasSelect(id); }

function collectMaterializedAnomaly(res) {
  if (!res || res.status !== 'collected') return false;
  model.collectAnomaly(res.item.id);
  codex.recordAnomaly(res.item.id);
  scene.spawnBurst(res.item.x, res.item.y, '#fbbf24', 28, 1.2);
  scene.addEffect('ring', { x: res.item.x, y: res.item.y }, { duration: .85, radius: 64, color: '#fbbf24', tier: 2 });
  showTransient(res.message, 4.0, 'anomaly');
  if ($('anomaly-lore-box')) {
    $('anomaly-lore-box').hidden = false;
    setText('anomaly-lore-title', `✦ 已收录四维奇物：【${res.item.name}】 (+${res.bonus}◆)`);
    setText('anomaly-lore-text', res.item.lore);
  }
  consumeEvents();
  updateUI();
  return true;
}

function handleAnomalySelect(anomaly) {
  if (!canAct() || !anomaly) return;
  onboarding.recordActivity();
  const s = model.snapshot();
  const res = scene.explorationRadar.interact(s, anomaly.key || anomaly.id);
  if (!res) return;
  if (res.status === 'off_layer') {
    const currentNode = s.nodes.find(n => n.id === s.node);
    const hasSameSpotPartner = !currentNode?.anchor && s.nodes.some(n =>
      !n.anchor && n.id !== currentNode?.id && n.layer === res.targetLayer && n.world && currentNode?.world &&
      Math.abs(n.world.x - currentNode.world.x) < 1e-4 &&
      Math.abs(n.world.y - currentNode.world.y) < 1e-4 &&
      Math.abs(n.world.z - currentNode.world.z) < 1e-4
    );
    const dir = res.targetLayer > s.layer ? '上滚' : '下滚';
    if (currentNode && !currentNode.anchor && !hasSameSpotPartner) {
      const anchorIds = s.nodes.filter(n => n.anchor && n.id !== s.node).map(n => n.id);
      const anchorId = anchorIds.find(id => findCurrentLayerRoute(s, id)?.length)
        || anchorIds.find(id => planLayerRoute(s, id))
        || 'hub';
      const anchorNode = s.nodes.find(n => n.id === anchorId);
      const anchorName = anchorNode?.name || '归响台';
      if (findCurrentLayerRoute(s, anchorId)?.length) {
        scene.pendingLayerPrompt = null;
        if (anchorNode) scene.addEffect('ring', anchorNode, { duration: .8, radius: 74, color: '#5eead4' });
        autoPilot = {
          targetNode: anchorId,
          anomalyTarget: { id: res.item.id, name: res.item.name, targetLayer: res.targetLayer },
        };
        showTransient(`⚓ 外圈平台不能直接换层：先带你走回「${anchorName}」，到了【滚轮${dir}】切到【${layerSymbols[res.targetLayer]} ${s.layers[res.targetLayer]?.name}】即可收录「${res.item.name}」！`, 3.8);
        stepAutoPilot();
        return;
      }
      showTransient(`${res.message} 外圈平台不能直接换层：先回「⚓ ${anchorName}」，再【滚轮${dir}】切到【${layerSymbols[res.targetLayer]} ${s.layers[res.targetLayer]?.name}】收录！`, 3.8, 'prompt');
      updateUI();
      return;
    }
    const anomProg = scene.explorationRadar.roomProgress(s);
    const revealExplicit = onboarding.shouldRevealExplicitLayerHint(s, {
      hintRequested: !!guide.present(s).companionGuide,
      totalAnomaliesCollected: anomProg.totalCollected,
    });
    const promptInfo = {
      targetId: null,
      anomalyId: res.item.id,
      anomalyName: res.item.name,
      targetLayer: res.targetLayer,
      atNode: s.node,
      kind: 'anomaly',
    };
    const msg = buildLayerShiftPromptMessage(s, promptInfo, revealExplicit);
    scene.pendingLayerPrompt = { ...promptInfo, message: msg };
    showTransient(msg, 3.6, 'prompt');
    updateUI();
    return;
  }
  collectMaterializedAnomaly(res);
}

function triggerPhaseDash() {
  if (!canAct()) return false;
  onboarding.recordActivity();
  const s = model.snapshot();
  if ((scene.onboardingStage ?? 4) < 2 || !s.travel || s.travel.risky) return false;
  let dashed = false;
  action(() => { dashed = model.dashTravel(); });
  return dashed;
}

function snapPolytopeLock(nodeId) {
  if (!canAct() || !nodeId) return false;
  onboarding.recordActivity();
  if ((scene.onboardingStage ?? 4) < 2) return false;
  let tuned = false;
  action(() => { tuned = model.tuneMechanism(nodeId); });
  const after = model.snapshot();
  if (after.node === nodeId && !after.travel && !after.wave && after.interactAvailable) {
    altarTune = null;
    scene.altarWindow = null;
    if (autoPilot?.targetNode === nodeId) autoPilot = null;
    action(() => model.interact());
    return true;
  }
  if (tuned) {
    const targetName = after.nodes.find(n => n.id === nodeId)?.name || '机关';
    showTransient(`🔮「${targetName}」四维截面已锁频！登岛即触发⚡超频谐振 (+1◆)`, 2.5, 'tune');
  }
  return tuned;
}

const scene = new SceneRenderer($('scene'), {
  onSelect: handleCanvasSelect,
  onFriend: askFriend,
  onAnomaly: handleAnomalySelect,
  onLayerSelect: layerIdx => manualSwitchLayer(layerIdx, 'wstack'),
  onLensDetent: layerIdx => {
    unlockAudio();
    audio.handle([{ type: 'lens_detent', layer: layerIdx }]);
  },
  onLensDive: layerIdx => {
    if (!canAct()) return;
    unlockAudio();
    scene.triggerLensIrisWave(layerIdx);
    audio.handle([{ type: 'lens_dive', layer: layerIdx }]);
    manualSwitchLayer(layerIdx, 'lens');
  },
  onPolytopeTune: nodeId => snapPolytopeLock(nodeId),
  onBridgeDash: () => triggerPhaseDash(),
  onCast: (relic, target) => {
    if (!canAct()) return;
    autoPilot = null;
    scene.pendingLayerPrompt = null;
    action(() => model.useAbility(relic, { target }));
  },
  onScrubW: handleScrubW,
  hasSupplySlots,
});
scene.visualGuide = true;
scene.hudProgressActive = isTheater();
const feel = new GameFeel({ reducedMotion: scene.reducedMotion });
scene.feel = feel;
scene.motionQuery?.addEventListener?.('change', e => feel.setReducedMotion(e.matches));
function refreshFriends() { scene.friends = courtyardFriends(readJSON('wslice-flatland-friends'), readJSON('wslice-flatland-gardens')); }
refreshFriends();
window.addEventListener('storage', event => {
  if (['wslice-flatland-friends', 'wslice-flatland-gardens', null].includes(event.key)) refreshFriends();
});

function updateSoundButton() {
  $('sound').setAttribute('aria-pressed', String(soundEnabled));
  $('sound-label').textContent = soundEnabled ? '声音开' : '声音关';
  $('sound').setAttribute('aria-label', soundEnabled ? '关闭声音' : '开启声音');
}
function unlockAudio() { if (soundEnabled) void audio.unlock(); }
// Automatic choice/result dialogs freeze play while the outcome melody finishes.
// User-requested pauses (including help/restart confirmation) stop every sound.
function syncAudio() { audio.syncWave(model.snapshot().wave,paused||document.hidden); }
function action(fn) { guide.activity(); unlockAudio(); syncAudio(); fn(); consumeEvents(); updateUI(); syncAudio(); }
function consumeEvents() {
  const events = model.drainEvents();
  if (!events.length) return;
  const snapshot = model.snapshot();
  const state = guide.present(snapshot);
  state.courtyardMomentum = momentum.view(snapshot, guide);
  scene.liveGuide = snapshot.companionGuide;
  scene.hudProgressActive = isTheater();
  scene.setState(state);
  scene.pushEvents(events);
  audio.handle(events);
  for (const event of events) {
    // Local E feedback belongs to the platform just used, not the next crossing.
    // A rejected move emits no move event; remote supply messages stay relevant.
    if (event.type === 'move' && (['interact_blocked', 'activate', 'harmonic_burst', 'tune', 'refused', 'prompt'].includes(transientType) || (isTheater() && transientType === 'power'))) {
      transient = null; transientTime = 0; transientType = ''; actionFeedback = '';
      $('announcement').textContent = '';
    }
    if (event.type === 'harmonic_burst') feel.trigger('harmonic_burst', { punches: [[`node:${event.node}`, .14], ['camera', .012]] });
    if (event.type === 'phase_dash' && event.rating === 'perfect') feel.trigger('phase_dash_perfect', { punches: [['player', .16]] });
    if (event.type === 'phase_graze') feel.trigger('phase_graze', { punches: [['player', -.18]] });
    if (event.type === 'weave') feel.trigger('bridge_landed', { delay: 1.25, punches: [[`node:${event.to}`, .08]] });
    if (event.type === 'resonance' && event.stage === 3) feel.trigger('bridge_landed', { delay: 1.25, punches: [['node:relay', .08]] });
    if (event.type === 'fail' || event.type === 'room' || event.type === 'restart') {
      feel.reset();
      cancelScrubGlide();
      scrubSession = null;
      if (event.type === 'room' || event.type === 'restart') {
        cancelAutoPilot();
        oneShotRiskCrossing = false;
      }
    }
    let message = mechanismFeedback(event, state, { hasSupplySlots: hasSupplySlots(event.to) });
    if (event.type === 'activate') {
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
        $('mechanism-count').animate([{ transform: 'scale(1.3)', color: '#a06c24' }, { transform: 'scale(1)' }], { duration: 550 });
      }
      if (isTheater()) {
        message = `启动！${state.activated.length}/${mechCountOf(state)}`;
      }
    }
    if (event.type === 'power' && isTheater() && message) {
      message = `供能 ${event.received}/${event.required}`;
    }
    if (event.type === 'harmonic_burst') {
      const mechName = state.nodes.find(n => n.id === event.node)?.name || '机关';
      message = isTheater()
        ? `启动！${state.activated.length}/${mechCountOf(state)} · +1◆`
        : `${mechName}已启动 · ${state.activated.length}/${mechCountOf(state)} · ${event.surfCombo ? '⚡踏浪超频 +1◆' : '✦超频谐振 +1◆'}`;
    }
    if (event.type === 'fail') {
      altarTune = null;
      if (scene) scene.altarWindow = null;
      onboarding.recordFailure();
      message = event.protected ? '缓落壳接住了你，随身回响保留。' : `失稳回退，失去 ${event.value} 枚未存回响。`;
    }
    if (event.type === 'evade' || event.type === 'dodge') {
      onboarding.recordWaveDodge();
    }
    if (event.type === 'bank') message = `已存入 ${event.value} 枚回响。`;
    if (event.type === 'unlock') message = isTheater() ? '🚪 已开启' : '机关共鸣，通往庭门的实体桥已打开。';
    if (event.type === 'reward' && event.risky) message = `冒险成功，收获 ${event.value} 枚回响。`;
    if (event.type === 'ability') message = event.relic === 'prism' ? '脉冲送达，已供能的机关响应了。' : model.snapshot().shadowDescription;
    if (event.type === 'coil') message = `换层接力：${model.snapshot().nodes.find(n=>n.id===event.to)?.name || '下游机关'}回应了。`;
    if (event.type === 'weave') message = `${event.remote?'影子替你种下':'种下'}一条新路，这座花桥会留到本庭结束。`;
    if (event.type === 'resonance' && event.stage===3) message = `庭院回应了冒险：${model.snapshot().layers[event.layer].name}长出花匣—锚台花径。`;
    if (event.type === 'secret_seal') message = `符印 ${event.stage}/3 回应了换层。`;
    if (event.type === 'secret_open') {
      codex.recordSecretUnlock(event.id);
      message = '封印展开，隐星台显现了；新路仍要沿对应的 W 层前进。';
    }
    if (event.type === 'rift_clear') {
      codex.recordRiftClear((state.hiddenRoutes || []).filter(r => r.unlocked).map(r => r.id));
      message = '三重回流已渡过，整座庭院正在升起。';
    }
    if (event.type === 'sanctum_start') {
      message = '👑 天穹冠已凝为跨层圣柱！连续躲过三波圣殿回响即可架起黄金天桥 (+8◆)。';
    }
    if (event.type === 'sanctum_clear') {
      codex.recordSanctumChoirClear();
      message = '👑 圣殿三重回响渡过！天穹冠↔圣殿门黄金天桥已展开 (+8◆)！';
    }
    if (event.type === 'room' && event.completed) {
      const clearedRoomId = state.roomPlan?.[event.room]?.id || state.roomId;
      if (clearedRoomId) codex.recordRoomClear(clearedRoomId);
    }
    if (event.type === 'win') {
      codex.recordRoomClear(state.roomId);
    }
    if (event.type === 'ascension' && event.stage===3) message = '升庭桥已展开，完成本庭机关后可以从隐星台直达庭门。';
    if (event.type === 'phase_transfer') message = '位置没有变，脚下已是另一层的机关。';
    if (event.type === 'warning') {
      closePanel({ focus: 'canvas' });
      const state=model.snapshot();
      message = `第 ${state.wave?.step || 1}/${state.wave?.steps || 1} 波将抵达，切到${(state.wave?.safeLayers || []).map(i=>state.layers[i].name).join('或')}。`;
      // On phones, the lower action button can scroll the actual hazard offscreen.
      if (mobileLayout.matches && $('scene').getBoundingClientRect().top < 0)
        $('scene').closest('.scene-wrap').scrollIntoView({block:'start',behavior:'instant'});
    }
    if (event.type === 'evade') message = '跨层避开回流，花匣中的回响归你。';
    if (event.type === 'dodge') message = model.snapshot().wave?.variant==='rift' ? '一枚星环点亮，切入下一枚符印对应的安全层。' : '躲过一波；下一波会追到这里，再换一次层。';
    if (message) {
      const theaterMode = isTheater();
      const compactBannerActive = theaterMode && compactProgress.matches &&
        $('onboarding-banner') && !$('onboarding-banner').hidden && !$('onboarding-banner').classList.contains('collapsed');
      const isProgressToast = ['activate', 'harmonic_burst', 'power'].includes(event.type);
      transient = message;
      transientTime = theaterMode ? 1.2 : 2.8;
      transientType = event.type;
      $('announcement').textContent = message;
      actionFeedback = (['interact_blocked', 'activate', 'harmonic_burst', 'power'].includes(event.type) && !(compactBannerActive && isProgressToast))
        ? message
        : '';
    }
    if (['restart','room'].includes(event.type)) {
      altarTune = null;
      if (scene) scene.altarWindow = null;
      transient = null; transientTime = 0; transientType = ''; actionFeedback = ''; $('announcement').textContent = '';
    }
  }
}

function synergyNotes(relics) {
  const notes=[];
  if(relics.prism && relics.coil)notes.push({ids:['prism','coil'],text:'远程启动机关 → 锚台三印 → 棱镜回廊'});
  if(relics.shadow && relics.weave)notes.push({ids:['shadow','weave'],text:'借影远程种桥 → 归响台三印 → 影织暗径'});
  if(relics.shell && relics.weave)notes.push({ids:['shell','weave'],text:'种桥并躲过花匣 → 花匣三印 → 护生险径'});
  if(relics.prism && relics.shadow)notes.push({ids:['prism','shadow'],text:'留影驻场＋远程启动 → 归响台三印 → 折影星廊'});
  if(relics.coil && relics.shadow)notes.push({ids:['coil','shadow'],text:'留影驻场＋线圈接力 → 锚台三印 → 叠影回廊'});
  if(relics.prism && relics.weave)notes.push({ids:['prism','weave'],text:'种桥＋远程启动机关 → 锚台三印 → 织光回廊'});
  if(relics.coil && relics.weave)notes.push({ids:['coil','weave'],text:'种桥＋线圈接力启动 → 归响台三印 → 缠脉暗径'});
  if(relics.prism && relics.shell)notes.push({ids:['prism','shell'],text:'远程启动并躲过花匣 → 花匣三印 → 守光秘径'});
  if(relics.coil && relics.shell)notes.push({ids:['coil','shell'],text:'线圈接力并躲过花匣 → 花匣三印 → 护脉险径'});
  if(relics.shadow && relics.shell)notes.push({ids:['shadow','shell'],text:'留影驻场并躲过花匣 → 花匣三印 → 驻影险径'});
  return notes;
}

function choiceSynergyIcons(state, id) {
  const next = { ...state.relics, [id]: (state.relics?.[id] || 0) + 1 };
  const pair = synergyNotes(next).find(note => note.ids.includes(id));
  if (!pair) return '';
  const otherId = pair.ids.find(x => x !== id);
  return otherId ? `${icons[otherId]} + ${icons[id]} 🌌` : '';
}

function focusPlaySurface() {
  const slider = $('w-slider');
  const drawer = slider?.closest('details');
  const target = (!drawer || drawer.open) && slider && !slider.disabled ? slider : $('scene');
  target?.focus?.({ preventScroll: true });
}

function showChoice(state) {
  const next = state.phase === 'interlude';
  const theater = isTheater();
  // Reuse the earned first-entry budget, once. Choosing still belongs to the
  // player; restarting or reaching the next room restores the ordinary picker.
  const discoveryStart = !next && discoveryChoicePending;
  discoveryChoicePending = false;
  $('choice-dialog').classList.toggle('starter-choice', !next);
  $('choice-dialog').classList.toggle('discovery-choice', discoveryStart);
  $('choice-dialog').classList.toggle('interlude-choice', next);
  const upcoming = next ? state.nextRoom : state.roomPlan?.[0];
  const isExpedition = state.mode === 'expedition';
  $('choice-kicker').textContent = next
    ? `第 ${state.room + 1}/${state.roomTotal || 3} 庭 · ${state.banked}◆`
    : `${isExpedition ? '第二幕 · 深层五庭巡礼' : '随机旅程'} #${state.seed.toString(16).toUpperCase().padStart(8,'0')}`;
  $('choice-title').innerHTML = next ? '下一庭，换一种解法。' : (isExpedition ? '深层五庭，带一件遗物启程。' : '带一件，就出发。');
  $('choice-intro').hidden = next || theater;
  $('choice-intro').textContent = (next || theater) ? '' : (isExpedition ? '五座递进庭院（经典双庭 → 三叠/换向进阶庭 → 四象升维圣殿）· 点选即出发' : '点选即出发 · 详细能力随时看「本局构筑」');
  $('choice-route').hidden = !next;
  $('choice-route').classList.toggle('five-stops', (state.roomPlan?.length || 3) >= 5);
  if (next) renderItinerary('choice-route', state, state.room + 1);
  document.querySelector('.choice-preview').hidden = !next;
  document.querySelector('.intro-rules').hidden = !next || theater;
  document.querySelector('.dialog-foot').hidden = !next || theater;
  if ($('choice-foot') && !theater) {
    setText('choice-foot', isExpedition
      ? '本幕共五座递进庭院（终章为四象升维圣殿） · 遗物跨庭保留并升级 · 任意双遗物共鸣十相秘境'
      : '每局抽取三座不同庭院 · 遗物跨庭保留并升级 · 复制网页地址可重走同一旅程');
  }
  if (fromFlatland && !next) {
    $('choice-intro').hidden = false;
    $('choice-intro').textContent = scene.friends.length ? '伙伴也来了 · 带一件遗物出发' : '带一件出发，看看 W 里的新世界。';
  }
  if (discoveryStart) {
    $('choice-intro').hidden = false;
    setText('choice-kicker', '平面国 → 庭院');
    setText('choice-title', `${scene.friends.length === 1 ? scene.friends[0].name : '伙伴们'}也来了。`);
    setText('choice-intro', '带上缓落壳，先走一座桥。');
  }
  setText('choice-room-name', next ? `${upcoming?.name || state.roomName}` : `${upcoming?.name || state.roomName}`);
  $('choice-room-description').hidden = next || theater;
  setText('choice-room-description', (next || theater) ? '' : (upcoming?.description || state.roomDescription));
  $('choice-build').hidden = !next;
  $('choice-build').textContent = RELICS.filter(r => state.relics?.[r.id] > 0).map(r => `${icons[r.id]}${'ⅠⅡⅢ'[state.relics[r.id] - 1]}`).join('  ');
  const choices = (state.choices || RELICS).map(relic => {
    const rank = state.relics?.[relic.id] || 0;
    const button = document.createElement('button');
    button.className = 'relic-choice';
    button.setAttribute('aria-label', `选择${relic.name}`);
    const synIcons = next ? choiceSynergyIcons(state, relic.id) : '';
    const rankBadge = rank ? ` <small class="relic-rank-up">${'ⅠⅡⅢ'[rank - 1]}→${'ⅠⅡⅢ'[rank] || 'Ⅲ'}</small>` : '';
    button.innerHTML = next
      ? `<span class="relic-art" aria-hidden="true">${icons[relic.id]}</span><h3>${relic.name}${rankBadge}</h3><p>${STARTER_RELICS[relic.id]}</p>${synIcons ? `<span class="choice-synergy" aria-hidden="true">${synIcons}</span>` : ''}`
      : `<span class="relic-art" aria-hidden="true">${icons[relic.id]}</span><h3>${relic.name}</h3><p>${STARTER_RELICS[relic.id]}</p>`;
    button.classList.toggle('has-synergy', !!synIcons);
    if (discoveryStart && relic.id === 'shell') {
      button.classList.add('primary-button');
      button.setAttribute('aria-label', '带缓落壳出发');
      button.querySelector('h3').textContent = '带缓落壳出发 ↗';
    }
    button.addEventListener('click', () => {
      $('choice-dialog').close();
      paused = false;
      action(() => {
        model.chooseRelic(relic.id);
        if (!next && !momentum.firstEntry) guide.request(model.snapshot());
      });
      focusPlaySurface();
    });
    return button;
  });
  if (discoveryStart) {
    const shell = choices.find(button => button.classList.contains('primary-button'));
    const alternatives = document.createElement('details');
    alternatives.className = 'starter-alternatives';
    const summary = document.createElement('summary');
    summary.textContent = '换一件遗物';
    const list = document.createElement('div');
    list.className = 'starter-alternatives-list';
    list.append(...choices.filter(button => button !== shell));
    alternatives.append(summary, list);
    $('relic-choices').replaceChildren(shell, alternatives);
  } else $('relic-choices').replaceChildren(...choices);
  $('choice-dialog').showModal();
  $('choice-dialog').scrollTop = 0;
}

function showResult(state) {
  const won = state.phase === 'won';
  const isExpedition = state.mode === 'expedition';
  const theater = isTheater();
  const pr = state.phaseResonance || scene.phaseResonance.summary();
  codex.recordRunFinish({ mode: state.mode, won, banked: state.banked, rank: pr.rank });
  $('result-symbol').textContent = won ? (isExpedition ? '👑' : '✧') : '◌';
  $('result-kicker').textContent = won ? (isExpedition ? 'SANCTUM ASCENDED · 深层五庭贯通' : 'JOURNEY COMPLETE') : 'UNTIL THE NEXT ECHO';
  $('result-title').textContent = won ? (isExpedition ? '四象圣殿记住了你的升维回响。' : '庭院记住了你的回响。') : '这一程，先到这里。';
  $('result-description').hidden = theater;
  $('result-description').textContent = theater ? '' : (won
    ? (isExpedition
      ? '你走完了五座递进庭院与四象升维圣殿，所有奇物、秘印与拓扑拓片已永久收录进《四维博物图鉴》。'
      : '你让回响穿过了三层空间，也把这一路的能力组合带到了终点。可继续开启第二幕「深层五庭巡礼」！')
    : '回程结已用完，之前存下的回响仍计入本次成绩。');
  $('result-score').textContent = state.banked;
  if (theater) {
    $('result-stats').textContent = `⚡${state.stats.risks}  ·  ✓${state.stats.chains}  ·  ✦${state.stats.anomalies || 0}  ·  ${pr.rank}`;
  } else {
    const tactileSummary = (state.stats.harmonicLocks || state.stats.perfectDashes)
      ? ` · 超频锁 ${state.stats.harmonicLocks || 0} 次 · 踏浪冲刺 ${state.stats.perfectDashes || 0} 次`
      : '';
    $('result-stats').textContent = `冒险成功 ${state.stats.risks} 次 · 点亮机关 ${state.stats.chains} 次 · 收录奇物 ${state.stats.anomalies || 0} 件${tactileSummary} · 完美同频 ${pr.perfectBeats} 次 · 刹那折光 ${pr.grazes} 次 · 共鸣评级 ${pr.rank}`;
  }
  if ($('next-expedition')) {
    $('next-expedition').hidden = !(won && !isExpedition);
  }
  $('result-dialog').showModal();
}

function updateBuild(state) {
  const owned = RELICS.filter(relic => state.relics?.[relic.id] > 0);
  const key = owned.map(relic => `${relic.id}:${state.relics[relic.id]}`).join(',');
  setText('build-count',`${owned.length} 件`);
  if (buildKey !== key) {
    buildKey = key;
    $('build-list').replaceChildren(...owned.map(relic => {
      const row = document.createElement('div'); row.className='build-item';
      row.innerHTML=`<span class="build-icon" aria-hidden="true">${icons[relic.id]}</span><strong>${relic.name}</strong><small>${'ⅠⅡⅢ'[state.relics[relic.id]-1]}</small><span id="build-detail-${relic.id}" class="build-detail"></span><details class="relic-detail"><summary>能力详情</summary><p>${relic.description}</p></details>`;
      return row;
    }));
    $('ability-list').replaceChildren(...owned.filter(relic=>state.abilities.find(ability=>ability.id===relic.id)?.active).map(relic=>{
      const button=document.createElement('button');button.id=`ability-${relic.id}`;button.className='secondary-button';
      button.addEventListener('click',()=>{if(canAct())action(()=>model.useAbility(relic.id));});
      return button;
    }));
    const notes=synergyNotes(state.relics);
    $('synergy-list').hidden=!notes.length;
    $('synergy-list').replaceChildren(...notes.map(note=>{
      const row=document.createElement('div');row.className='synergy-note';
      row.innerHTML=`<span aria-hidden="true">${note.ids.map(id=>icons[id]).join(' + ')}</span><span>${note.text}</span>`;
      return row;
    }));
  }
  for (const ability of state.abilities || []) {
    if (!ability.rank) continue;
    setText(`build-detail-${ability.id}`,ability.id==='shadow'&&ability.available?`${ability.detail}。${state.shadowDescription}`:ability.detail);
    const button=$(`ability-${ability.id}`);
    if(button){button.disabled=!ability.available||paused;setHTML(button.id,`${ability.label} <kbd>Q</kbd>`);}
  }
}

function updateResonance(state) {
  const growth=state.resonance;
  const stage=growth?.stage || 0;
  $('resonance-panel').classList.toggle('awake',stage===3);
  $('resonance-panel').setAttribute('aria-label',`庭院连锁：${stage===3?'花径已长成':growth?.triggered?'生长中':'等待首次冒险成功'}`);
  for(const [index,step] of [...$('resonance-track').children].entries())step.classList.toggle('lit',growth?.triggered && (index===0 || stage>=index));
  const layer=state.layers[growth?.edge.layer];
  const edge=state.edges.find(item=>item.id===growth?.edge.id);
  setText('resonance-title',stage===3?'花径已长成':growth?.triggered?'回响正在唤醒庭院':'冒险，让庭院生长');
  setText('resonance-detail',stage===3?`${layer?.name} · 花匣 ↔ 维度锚台${edge?.open?'':state.wave?' · 回波期间暂时收起':' · 花匣支路开放后可走'}`:growth?.triggered?'归响台 → 花匣 → 锚台，新的桥正在展开':'首次冒险成功，长出花匣与锚台之间的新桥');
  setText('woven-count',state.woven?.length?`${state.woven.length} 座种桥留在本庭`:'');
}

function sealGlyphs(route, state) {
  return route.sequence.map((layer,index)=>`<span class="seal-glyph ${route.unlocked||index<route.progress?'lit':''} ${!route.unlocked&&index===route.progress?'next':''}" style="--seal-color:${state.layers[layer].color}" title="${index+1} · ${state.layers[layer].name}">${layerSymbols[layer]}</span>`).join('<i aria-hidden="true">›</i>');
}

function updateSecrets(state) {
  const routes=state.hiddenRoutes || [];
  const unlocked=routes.filter(route=>route.unlocked).length;
  setText('secret-count',`${unlocked} / ${routes.length || 3}`);
  const matched = routes.filter(r => r.unlocked || r.eligible || r.requires.every(id => state.relics?.[id] > 0));
  const partial = matched.length ? [] : routes.filter(r => r.requires.some(id => state.relics?.[id] > 0));
  const visibleRoutes = matched.length ? matched : (partial.length ? partial : routes).slice(0, 3);
  const key=JSON.stringify([state.room, visibleRoutes.map(route=>[route.id,route.progress,route.unlocked,route.eligible,route.requirement]),state.relics]);
  if(secretKey!==key){
    secretKey=key;
    $('secret-routes').replaceChildren(...visibleRoutes.map(route=>{
      const row=document.createElement('div');
      row.className=`secret-route ${route.unlocked?'open':route.eligible?'ready':''}`;
      const entry=state.nodes.find(node=>node.id===route.entry);
      row.innerHTML=`<div class="secret-route-title"><span class="secret-relics" aria-hidden="true">${route.requires.map(id=>`<span class="${state.relics[id]?'owned':''}">${icons[id]}</span>`).join(' + ')}</span><strong>${route.name}</strong><small>${route.unlocked?'已展开':route.eligible?'可解印':'待共鸣'}</small></div><div class="seal-track">${sealGlyphs(route,state)}<small>${entry?.name || ''}</small></div><p>${route.unlocked?`${state.layers[route.edge.layer].name} · ${entry?.name} ↔ 隐星台`:route.requirement}</p>`;
      row.setAttribute('aria-label',`${route.name}，${route.requires.map(id=>RELICS.find(relic=>relic.id===id).name).join('与')}，${route.unlocked?'已展开':route.requirement}，在${entry?.name}依次切入${route.sequence.map(layer=>state.layers[layer].name).join('、')}，符印 ${route.progress}/3`);
      return row;
    }));
  }
  const here=routes.find(route=>route.entry===state.node&&!route.unlocked&&route.requires.every(id=>state.relics[id])&&route.eligible)
    || routes.find(route=>route.entry===state.node&&!route.unlocked&&route.requires.every(id=>state.relics[id]));
  const promptKey=JSON.stringify([here?.id,here?.progress,here?.eligible,here?.requirement,!!state.travel,!!state.wave,state.node==='rift',state.rift?.status,state.rift?.ascension,state.carried>=2]);
  if(promptKey!==sealKey){
    sealKey=promptKey;
    $('seal-prompt').hidden=!!state.travel||!!state.wave||(!here&&state.node!=='rift');
    if(here){
      $('seal-prompt').innerHTML=`<span class="seal-heading">✧ ${here.name}</span><span class="seal-track">${sealGlyphs(here,state)}</span><small>${here.eligible?`依次进入新层 · 下一印 ${layerSymbols[here.sequence[here.progress]]}`:here.requirement}</small>`;
    }else if(state.node==='rift'){
      const rift=state.rift;
      $('seal-prompt').innerHTML=`<span class="seal-heading">✧ ${rift?.status==='cleared'?'庭院已回应':rift?.status==='failed'?'本庭试炼已结束':'隐星三重回流'}</span><small>${rift?.status==='cleared'?'升庭桥连向庭门，本庭机关全部点亮后可通行':rift?.status==='failed'?'押注不返还，原路仍可返回':`押 2 → 全过得 9 · 三波每次重新切入安全层${state.carried<2?' · 随身回响不足':''}`}</small>`;
    }
  }
  for(const [layer,button] of [...document.querySelectorAll('.layer-controls [data-layer]')].entries())button.classList.toggle('seal-next',!state.wave&&!state.travel&&!!here?.eligible&&here.sequence[here.progress]===layer);
  const rift=state.rift;
  $('rift-panel').hidden=!unlocked;
  $('rift-panel').classList.toggle('cleared',rift?.status==='cleared');
  setText('rift-title',rift?.status==='cleared'?'升庭连锁':rift?.status==='failed'?'本庭试炼已结束':'隐星三重回流');
  setText('rift-detail',rift?.status==='cleared'?`${rift.ascension===3?'升庭桥已展开':'星环正在唤醒归响台、锚台与庭门'} · 完成本庭机关可直达庭门`:rift?.status==='failed'?'本庭不能再挑战；押注不返还，已解开的秘径仍可走。':'押 2 枚随身回响 · 全过得 9 · 失手不退押注，每庭一次。');
  setHTML('rift-stages',[0,1,2].map((stage)=>`<span class="${(rift?.ascension||0)>stage?'lit':''}">${['◇ 归响台','⌁ 锚台','✧ 庭门'][stage]}</span>`).join('<i aria-hidden="true">→</i>'));
}

function renderItinerary(id,state,current) {
  $(id).replaceChildren(...(state.roomPlan || []).map((room,index)=>{
    const item=document.createElement('div');item.className='route-stop';
    item.classList.toggle('current',index===current);item.classList.toggle('complete',index<current);
    if(index===current)item.setAttribute('aria-current','step');
    item.innerHTML=`<span class="route-number">${index<current?'✓':String(index+1).padStart(2,'0')}</span><span><strong>${room.name}</strong><small>${room.challengeName}</small></span>`;
    return item;
  }));
}

function updateRoom(state) {
  const key=`${state.seed}:${state.room}:${state.roomSignature}`;
  if(roomKey===key)return;
  roomKey=key;destinationKey='';
  scene.pendingLayerPrompt = null;
  scene.tutorialHint = null;
  scene.nextStepHint = null;
  if (state.roomId) codex.recordRoomVisit(state.roomId);
  setText('room-description', state.roomDescription || '观察各层机关，让能量接力。');
  renderItinerary('room-itinerary',state,state.room);
  const order=state.mechanismOrder || state.nodes.filter(n=>n.kind==='mechanism').map(n=>n.id);
  $('mechanisms').replaceChildren(...order.map((id, idx)=>{
    const node=state.nodes.find(n=>n.id===id);
    const row=document.createElement('div');row.className='mechanism-item';row.dataset.mechanism=id;
    row.style.cursor = 'pointer';
    row.addEventListener('click', () => selectFromPanel(id));
    row.innerHTML=`<span class="node-light" aria-hidden="true">${numBadges[idx] || '◇'}</span><span class="mechanism-name">${node.name}<span class="supply-slots">${(node.required || []).map(source=>{const from=state.nodes.find(n=>n.id===source);return `<i data-source="${source}" title="来自${from.name}" style="--supply-color:${state.layers[from.layer].color}">○</i>`;}).join('')}</span></span><small></small>`;
    return row;
  }));
  setText('challenge-name',state.roomChallenge?.name || '裂隙花匣');
  setText('challenge-reward',`+${state.roomChallenge?.reward || 4}`);
  setText('challenge-description',state.roomChallenge?.description || '开匣后换层，躲开回流。');
}

function updateUI() {
  const snapshot = model.snapshot();
  const state = guide.present(snapshot);
  state.courtyardMomentum = momentum.view(snapshot, guide);
  scene.liveGuide = snapshot.companionGuide;
  const firstAction = momentum.firstAction(snapshot, guide);
  const firstTarget = state.nodes.find(node => node.id === firstAction?.node);
  // Keep the first activation and hub/anchor crossings actionable, including
  // the completed courtyard's route to its gate. Deliberate choices keep normal UI.
  const mechTotal = mechCountOf(state);
  const onward = momentum.firstEntry && canAct() && !state.travel && !state.wave &&
    state.phaseStability === 1 && !state.riskMode && !state.stats.failures &&
    (([1, mechTotal].includes(state.activated.length) && state.activated.includes(state.node)) ||
      (['hub', 'relay'].includes(state.node) && state.activated.length > 0)) &&
    !state.courtyardMomentum && !state.companionGuide && !model.selectionExplicit
      ? snapshot.companionGuide : null;
  const onwardTarget = state.nodes.find(node => node.id === onward?.node);
  const onwardBridge = onward?.kind === 'move' && state.selected === onward.node;
  const onwardShift = (onward?.kind === 'shift' || (['hub', 'relay'].includes(state.node) && onwardBridge)) && !onward.aligned;
  const onwardMove = onwardBridge && state.canMove;
  updateRoom(state);
  scene.setState(state);
  const friendHint = friendGuideText(state, scene.friends);
  $('ask-friend').hidden = false;
  setHTML('ask-friend', `${scene.friends.length ? '问问伙伴' : '请求提示'} <kbd>H</kbd>`);
  $('ask-friend').disabled = !canAct() || !model.snapshot().companionGuide;
  $('friend-guide').hidden = !friendHint;
  setText('friend-guide', friendHint);
  for (let i = 0; i < 3; i++) $('layer-' + i).classList.toggle('friend-layer', !!friendHint && state.companionGuide?.layer === i);
  $('room-name').textContent = state.roomName;
  $('room-number').textContent = String(state.room + 1).padStart(2,'0');
  if ($('room-total')) {
    setText('room-total', String(state.roomTotal || state.roomPlan?.length || 3).padStart(2, '0'));
  }
  if ($('chapter-mode-pill')) {
    const isExp = state.mode === 'expedition';
    setText('chapter-mode-pill', isExp ? '第二幕 · 深层五庭' : '第一幕 · 初探三庭');
    $('chapter-mode-pill').classList.toggle('expedition-mode', isExp);
  }
  setText('seed-label',`#${state.seed.toString(16).toUpperCase().padStart(8,'0')}`);
  $('banked').textContent = state.banked;
  $('carried').textContent = state.carried;
  if ($('carried-hint')) {
    setText('carried-hint', shouldHoldEchoesAtHub(state) ? '到 ⚓ 归响台按 E 存入' : '回 ⚓ 归响台自动存入');
  }
  document.body.classList.toggle('first-run-pending', state.mode !== 'expedition' && isFirstRun());
  if (state.banked > best) { best = state.banked; savePreference('wslice-best',best); }
  setHTML('best-score',`${best} <small>回响</small>`);
  [...$('lives').children].forEach((el,i) => el.classList.toggle('empty',i >= state.lives));
  $('lives').setAttribute('aria-label',`剩余 ${state.lives} 次`);
  [...$('combo').children].forEach((el,i) => el.classList.toggle('active',i < state.combo));
  $('combo').setAttribute('aria-label',`${state.combo} 层`);
  $('mechanism-count').textContent = `${state.activated.length} / ${mechTotal}`;
  if (panelToggle) {
    const navLabel = panelToggle.querySelector('.nav-label');
    if (navLabel) {
      const nextLabel = isTheater() ? `进度 ${state.activated.length}/${mechTotal}` : '进度';
      if (navLabel.textContent !== nextLabel) navLabel.textContent = nextLabel;
    }
    const nextTitle = `打开本局进度面板 (P) · 机关 ${state.activated.length}/${mechTotal} · 缓落壳 ${state.lives} · 已存 ${state.banked}◆`;
    if (panelToggle.title !== nextTitle) panelToggle.title = nextTitle;
  }
  const currentLayer = state.layers?.[state.layer];
  const currentNode = state.nodes.find(n=>n.id===state.node);
  const anomProg = scene.explorationRadar.roomProgress(state);
  const stageInfo = onboarding.computeStage(state, anomProg.totalCollected);
  const roomStep = describeNextStep(state);
  const tutorialHint = isFirstRunGuide(state);
  if (tutorialHint && roomStep.banner) scene.tutorialHint = { ...roomStep, tutorial: true };
  else if (!tutorialHint || state.phase !== 'playing') scene.tutorialHint = null;
  scene.nextStepHint = tutorialHint ? (scene.tutorialHint || null) : null;
  document.body.dataset.onboardingStage = String(stageInfo.stage);
  document.body.dataset.firstRun = String(isFirstRun());
  const revealExplicit = onboarding.shouldRevealExplicitLayerHint(state, {
    hintRequested: !!state.companionGuide,
    totalAnomaliesCollected: anomProg.totalCollected,
  });
  scene.onboardingStage = stageInfo.stage;
  scene.explicitLayerHint = revealExplicit;
  scene.hudProgressActive = isTheater();
  if (scene.pendingLayerPrompt && Number.isInteger(scene.pendingLayerPrompt.targetLayer)) {
    scene.pendingLayerPrompt.message = buildLayerShiftPromptMessage(state, scene.pendingLayerPrompt, revealExplicit);
  }
  setText('layer-name',currentLayer?.name || '层间隙');
  setText('layer-symbol',layerSymbols[state.layer] || '◇');
  // On the ferry the sentinel world coords (99,99,99) only protect sameXYZ —
  // the readout shows the interpolated position between the two dock islands.
  let posWorld = currentNode?.world;
  if (state.node === 'ferry' && state.ferry) {
    const aw = state.nodes.find(n => n.id === state.ferry.a)?.world;
    const bw = state.nodes.find(n => n.id === state.ferry.b)?.world;
    if (aw && bw) {
      const u = state.ferry.u ?? 0;
      posWorld = { x: aw.x + (bw.x - aw.x) * u, y: aw.y + (bw.y - aw.y) * u, z: aw.z + (bw.z - aw.z) * u };
    }
  }
  if(posWorld)setText('position-readout',`位置 ${Number(posWorld.x.toFixed(1))}, ${Number(posWorld.y.toFixed(1))}, ${Number(posWorld.z.toFixed(1))} · W ${state.w.toFixed(2)}`);
  document.body.dataset.layer = String(state.layer);
  const liveGuide = snapshot.companionGuide;
  const activePrompt = !state.wave && !state.travel && scene.pendingLayerPrompt &&
    Number.isInteger(scene.pendingLayerPrompt.targetLayer) &&
    scene.pendingLayerPrompt.targetLayer !== state.layer &&
    (!scene.pendingLayerPrompt.atNode || scene.pendingLayerPrompt.atNode === state.node)
      ? scene.pendingLayerPrompt
      : null;
  const effectiveTargetLayer = activePrompt
    ? activePrompt.targetLayer
    : (liveGuide && !liveGuide.aligned && (currentNode?.anchor || liveGuide.kind === 'shift' || currentNode?.layer === liveGuide.layer) ? liveGuide.layer : null);
  const sameSpotNodeOnLayer = layerIdx => currentNode && !currentNode.anchor
    ? state.nodes.find(n => !n.anchor && n.id !== currentNode.id && n.layer === layerIdx &&
        n.world && currentNode.world &&
        Math.abs(n.world.x - currentNode.world.x) < 1e-4 &&
        Math.abs(n.world.y - currentNode.world.y) < 1e-4 &&
        Math.abs(n.world.z - currentNode.world.z) < 1e-4)
    : null;
  for(const [i,button] of [...document.querySelectorAll('.layer-controls [data-layer]')].entries()){
    button.setAttribute('aria-pressed',String(i===state.layer));
    button.disabled=state.phase!=='playing'||paused;
    button.classList.toggle('danger-layer',!!state.wave?.dangerLayers?.includes(i));
    button.classList.toggle('safe-layer',!!state.wave?.safeLayers?.includes(i));
    const tutorialShiftLayer = !state.wave && !state.travel && scene.nextStepHint?.action === 'shift'
      ? scene.nextStepHint.layer : null;
    const isTargetLayer = !state.wave && !state.travel && (
      tutorialShiftLayer === i || (revealExplicit && effectiveTargetLayer === i)
    );
    button.classList.toggle('attention-action', !!isTargetLayer || (revealExplicit && !!onwardShift && onward.layer === i));
    const sameSpot = sameSpotNodeOnLayer(i);
    const isVoidHere = !state.wave && !state.travel && currentNode && !currentNode.anchor && currentNode.layer !== i && !sameSpot;
    button.classList.toggle('void-warning-layer', !!isVoidHere);
    button.classList.toggle('same-xyz-layer', !!sameSpot);
    const pill = $('layer-pill-' + i);
    if (pill) {
      const theater = isTheater();
      if (theater) {
        setText('layer-pill-' + i, '');
        pill.className = 'layer-safety-pill';
      } else if (state.wave) {
        const waveSafe = state.wave.safeLayers?.includes(i);
        setText('layer-pill-' + i, waveSafe ? '🛡️ 安全躲避' : '⚡ 回流危险');
        pill.className = `layer-safety-pill ${waveSafe ? 'pill-safe' : 'pill-void'}`;
      } else if (isVoidHere) {
        setText('layer-pill-' + i, '⚠️ 悬空无地');
        pill.className = 'layer-safety-pill pill-void';
      } else if (isTargetLayer) {
        setText('layer-pill-' + i, '✨ 点此切入');
        pill.className = 'layer-safety-pill pill-target';
      } else if (sameSpot) {
        setText('layer-pill-' + i, `🌀 同位→${sameSpot.name}`);
        pill.className = 'layer-safety-pill pill-portal';
      } else {
        setText('layer-pill-' + i, currentNode?.anchor ? '⚓ 安全台' : '● 本层平台');
        pill.className = 'layer-safety-pill pill-safe';
      }
    }
    button.title=state.wave?`${layerSymbols[i]} · ${state.wave.safeLayers.includes(i)?'安全':'危险'}`:isVoidHere?`${layerSymbols[i]} · 先回 ⚓ 再换层`:`${layerSymbols[i]} (${['Z','X','C'][i] || ''})`;
  }
  syncWRulerThumb(scene.currentW(), state);
  if ($('void-rescue-banner')) {
    const voidDanger = state.phase === 'playing' && !state.travel && state.phaseStability < .99 && currentNode && !currentNode.anchor;
    $('void-rescue-banner').hidden = !voidDanger;
    if (voidDanger) {
      const safeName = state.layers[currentNode.layer]?.name || '原切片';
      const safeRom = layerSymbols[currentNode.layer] || 'Ⅰ';
      if (isTheater()) {
        setText('void-rescue-title', '');
        setText('void-rescue-sub', '');
        setText('void-rescue-btn', `🛡️ 回${safeRom}`);
      } else {
        setText('void-rescue-title', `⚠️ 脚下悬空（剩余 ${(state.phaseStability * 2.2).toFixed(1)}s）！当前圆盘不在这一层`);
        setText('void-rescue-sub', `「${currentNode.name}」只存在于${safeName}，需先走回「⚓ 安全台」才能安全换层`);
        setText('void-rescue-btn', `🛡️ 一键切回${safeName}`);
      }
    }
  }
  if ($('visual-stepper')) {
    const voidDanger = state.phase === 'playing' && !state.travel && state.phaseStability < .99 && currentNode && !currentNode.anchor;
    const g = liveGuide;
    const gTarget = state.nodes.find(n => n.id === (activePrompt?.targetId || g?.node));
    const shiftLayerIdx = activePrompt ? activePrompt.targetLayer : g?.layer;
    const step1Active = voidDanger || !!activePrompt || (!!g && !g.aligned);
    const step2Active = !voidDanger && !activePrompt && !!g && g.kind === 'move' && g.aligned;
    const step3Active = !voidDanger && !activePrompt && !!g && g.kind === 'activate' && g.aligned;

    $('vstep-shift').className = `vstep-card ${voidDanger ? 'danger-vstep' : step1Active ? 'active-vstep' : (step2Active || step3Active) ? 'done-vstep' : ''}`;
    $('vstep-move').className = `vstep-card ${step2Active ? 'active-vstep' : step3Active ? 'done-vstep' : ''}`;
    $('vstep-act').className = `vstep-card ${step3Active ? 'active-vstep' : ''}`;

    if (voidDanger) {
      const safeLayer = state.layers[currentNode.layer];
      setText('vstep-shift-icon', '🛡️');
      setText('vstep-shift-title', `切回${safeLayer?.name}`);
      setText('vstep-shift-sub', '点此立即解除悬空 ✨');
    } else if (step1Active && Number.isInteger(shiftLayerIdx)) {
      if (revealExplicit) {
        setText('vstep-shift-icon', layerSymbols[shiftLayerIdx] || '🔀');
        setText('vstep-shift-title', `切到${state.layers[shiftLayerIdx]?.name}`);
        setText('vstep-shift-sub', `${shiftLayerIdx > state.layer ? '上滚 ▲' : '下滚 ▼'}，或点此切层 ✨`);
      } else {
        setText('vstep-shift-icon', '🌀');
        setText('vstep-shift-title', '看虚线桥滚轮调谐');
        setText('vstep-shift-sub', '看桥颜色与偏移滚轮（点此揭晓层提示）');
      }
    } else {
      setText('vstep-shift-icon', '✓');
      setText('vstep-shift-title', `${currentLayer?.name || '当前层'}已对准`);
      setText('vstep-shift-sub', currentNode?.anchor ? `站在 ⚓ ${currentNode.name}，可自由换层` : '已在当前机关所在层');
    }

    if (step2Active && gTarget) {
      const returning = !currentNode?.anchor && gTarget.anchor;
      setText('vstep-move-icon', returning ? '⚓' : '🏃');
      setText('vstep-move-title', returning ? `先回 ⚓ ${gTarget.name}` : `走向${gTarget.name}`);
      setText('vstep-move-sub', returning ? '点此走回去再换层 ✨' : '点目标顺桥走过去 ✨');
    } else if (step3Active) {
      setText('vstep-move-icon', '✓');
      setText('vstep-move-title', `已登岛 · ${currentNode?.name}`);
      setText('vstep-move-sub', '已到达目标机关');
    } else {
      setText('vstep-move-icon', '🏃');
      setText('vstep-move-title', gTarget ? `目标：${gTarget.name}` : '踏桥登岛');
      setText('vstep-move-sub', '切对层后点机关过桥');
    }

    if (step3Active) {
      setText('vstep-act-icon', '⚡');
      setText('vstep-act-title', `点亮${currentNode?.name}`);
      setText('vstep-act-sub', '点此立即点亮机关 ✨');
    } else {
      setText('vstep-act-icon', state.activated.length >= mechTotal ? '🚪' : '⚡');
      setText('vstep-act-title', `点亮机关 (${state.activated.length}/${mechTotal})`);
      setText('vstep-act-sub', state.activated.length >= mechTotal ? '全部点亮 · 点终点门过关' : '登岛自动点亮');
    }
  }
  setText('footing',`${currentNode?.name || ''} · ${currentNode?.anchor?'跨层支撑':currentNode?.present?'本层平台':'离层失稳 · 换回有支撑的层'}`);
  $('footing').classList.toggle('unsafe',state.phaseStability<.99);
  setText('objective',firstTarget
    ? firstAction.action === 'move' ? `先到${firstTarget.name} · 点它顺桥走过去` : `点亮脚下的${firstTarget.name} · 点它即可（或按 E）`
    : onwardShift ? (revealExplicit
      ? (onward.kind === 'shift'
        ? `原地换到${layerSymbols[onward.layer]} ${state.layers[onward.layer].name} · 显现${onwardTarget.name}`
        : `换到${layerSymbols[onward.layer]} ${state.layers[onward.layer].name} · 显现通往${onwardTarget.name}的桥`)
      : `观察通往${onwardTarget.name}的虚线桥颜色与偏移 · 滚轮调谐显桥`)
      : onwardMove ? `到${onwardTarget.name} · 沿桥稳行`
        : state.objective || '观察供能关系，切换 W 寻找这一庭的起点');
  const orderList = state.mechanismOrder || state.nodes.filter(n => n.kind === 'mechanism').map(n => n.id);
  const primaryMechId = orderList.find(id => {
    const n = state.nodes.find(item => item.id === id);
    return n && n.powered && !state.activated.includes(id);
  });
  for (const node of state.nodes.filter(n => n.kind === 'mechanism')) {
    const row = document.querySelector(`[data-mechanism="${node.id}"]`);
    if (!row) continue;
    const active = state.activated.includes(node.id);
    const idx = orderList.indexOf(node.id);
    const numSym = numBadges[idx] || '◇';
    const isPrimary = primaryMechId === node.id;
    row.classList.toggle('active', active);
    row.classList.toggle('primary-target', isPrimary);
    const missingSyms = (node.required || [])
      .filter(reqId => !(node.received || []).includes(reqId))
      .map(reqId => numBadges[orderList.indexOf(reqId)] || '前序');
    row.querySelector('small').textContent = active
      ? '✓ 已点亮'
      : node.powered
        ? (isPrimary ? '🎯 当前目标' : '可点亮')
        : `🔒 需先点亮 ${missingSyms.join('+') || '前序'}`;
    row.title=node.mechanismHint || '';
    row.querySelector('.node-light').textContent = active ? '✓' : numSym;
    for(const slot of row.querySelectorAll('[data-source]')){const received=node.received?.includes(slot.dataset.source);slot.textContent=received?'●':'○';slot.classList.toggle('received',!!received);}
  }
  if ($('exit-step-card')) {
    const exitOpen = state.activated.length >= mechTotal;
    const exitNode = state.nodes.find(n => n.id === 'exit');
    const badgeChain = numBadges.slice(0, mechTotal).join('');
    $('exit-step-card').classList.toggle('exit-open', exitOpen);
    setText('exit-step-title', `🚪 终点门 · ${exitNode?.name || '折光门'}`);
    setText('exit-step-sub', exitOpen
      ? '✨ 大门已开！点此直接过关 ↗'
      : `🔒 待解锁 · 需先点亮 ${badgeChain} (${state.activated.length}/${mechTotal})`);
  }
  if ($('onboarding-banner')) {
    const bannerNow = performance.now();
    if (stageInfo.stage !== bannerStage) {
      const firstExpeditionPaint = bannerStage === 0 && state.mode === 'expedition';
      bannerStage = stageInfo.stage;
      bannerDescOpen = false;
      bannerDescDismissed = false;
      bannerExpandedUntil = firstExpeditionPaint ? 0 : bannerNow + 4500;
      // The banner is aria-live itself; #announcement keeps the action result that caused the stage-up.
    }
    // Stage 1 is the very first screen, so its single instruction stays until ① is lit.
    // Later stages expand briefly on arrival, then fold to a one-line badge (click to reopen).
    // The first run keeps the next-step line expanded across all 3 courtyards until won.
    const keepRoomHint = tutorialHint;
    $('onboarding-banner').classList.toggle('collapsed', !keepRoomHint && stageInfo.stage > 1 && bannerNow > bannerExpandedUntil);
    // The theater description popover is tap-only on small screens: .desc-open is
    // set by the banner click and cleared on expiry, stage change or canvas input.
    if (bannerNow > bannerExpandedUntil) bannerDescOpen = false;
    $('onboarding-banner').classList.toggle('desc-open', bannerDescOpen);
    $('onboarding-banner').classList.toggle('desc-dismissed', bannerDescDismissed);
    $('onboarding-banner').dataset.stage = String(stageInfo.stage);
    const shownHint = scene.nextStepHint?.banner ? scene.nextStepHint : null;
    $('onboarding-banner').dataset.nextAction = shownHint?.action || '';
    $('onboarding-banner').dataset.nextGoal = shownHint?.goalId || '';
    $('onboarding-banner').dataset.nextTarget = shownHint?.targetId || '';
    $('onboarding-banner').dataset.nextLayer = shownHint && Number.isInteger(shownHint.layer) ? String(shownHint.layer) : '';
    setText('onboarding-badge', stageInfo.badge);
    setText('onboarding-title', shownHint ? shownHint.banner : stageInfo.title);
    setText('onboarding-desc', shownHint ? shownHint.detail : stageInfo.instruction);
    if ($('unlock-all-btn')) {
      $('unlock-all-btn').hidden = stageInfo.stage >= 4;
      if (isTheater()) {
        $('unlock-all-btn').title = '跳过引导';
        $('unlock-all-btn').setAttribute('aria-label', '跳过引导');
        setHTML('unlock-all-btn', '<span aria-hidden="true">⏭</span><span class="skip-tooltip" aria-hidden="true">跳过引导</span>');
      } else {
        $('unlock-all-btn').title = '跳过渐进教学，立即展开全部高阶操作与秘境雷达';
        $('unlock-all-btn').removeAttribute('aria-label');
        setText('unlock-all-btn', '🔓 展开全部高阶');
      }
    }
    if ($('open-hyper-lab')) {
      $('open-hyper-lab').hidden = stageInfo.stage < 2;
    }
    if ($('theme-toggle')) {
      $('theme-toggle').hidden = stageInfo.stage < 2;
    }
    if ($('layer-controls')) {
      $('layer-controls').hidden = stageInfo.stage < 2;
    }
    if ($('chain-row')) {
      $('chain-row').hidden = stageInfo.stage < 3;
    }
    if ($('visual-stepper')) {
      $('visual-stepper').hidden = stageInfo.stage < 2;
    }
    if ($('quick-risk-btn')) {
      $('quick-risk-btn').hidden = stageInfo.stage < 4;
      $('quick-risk-btn').setAttribute('aria-pressed', String(!!state.riskMode));
      $('quick-risk-btn').classList.toggle('risk-active', !!state.riskMode);
      $('quick-risk-btn').setAttribute('aria-label', state.riskMode ? '黄金冒险桥：已开启' : '黄金冒险桥：关');
      setText('quick-risk-btn', isTheater() ? '⚡' : (state.riskMode ? '⚡ 黄金冒险桥：已开启' : '⚡ 黄金冒险桥：关'));
    }
    if ($('exploration-radar-section')) {
      $('exploration-radar-section').hidden = stageInfo.stage < 2;
    }
    if ($('radar-flower-card')) $('radar-flower-card').hidden = stageInfo.stage < 4;
    if ($('radar-vault-card')) $('radar-vault-card').hidden = stageInfo.stage < 3;
    if ($('radar-rift-card')) $('radar-rift-card').hidden = stageInfo.stage < 4;
    if ($('auto-next-btn')) {
      $('auto-next-btn').hidden = !onboarding.shouldShowAssistButton();
      $('auto-next-btn').title = '帮我走这一步';
      $('auto-next-btn').setAttribute('aria-label', '帮我走这一步');
      if (isTheater()) {
        if (state.activated.length >= mechTotal) {
          setText('auto-next-btn', '🧭🚪');
        } else if (primaryMechId) {
          const pIdx = orderList.indexOf(primaryMechId);
          const pSym = numBadges[pIdx] || '①';
          setText('auto-next-btn', `🧭${pSym}`);
        } else {
          setText('auto-next-btn', '🧭');
        }
      } else if (state.activated.length >= mechTotal) {
        setText('auto-next-btn', '🧭 帮我前往终点 ↗');
      } else if (primaryMechId) {
        const pIdx = orderList.indexOf(primaryMechId);
        const pSym = numBadges[pIdx] || '①';
        setText('auto-next-btn', `🧭 卡住了？帮我推进 ${pSym} ↗`);
      } else {
        setText('auto-next-btn', '🧭 帮我走这一步 ↗');
      }
    }
  }
  const activeGoalId = activePrompt?.targetId || (state.activated.length >= mechTotal ? 'exit' : primaryMechId);
  const riskPreview = computeRiskDecisionPreview(state, activeGoalId);
  const relicHud = computeRelicHudStatus(state);
  scene.relicHud = relicHud;
  scene.riskPreview = riskPreview;
  const hasNonStarterRelic = relicHud.items.some(item => item.id !== 'shell');
  if ($('risk-decision-bar')) {
    const showRiskDecision = (stageInfo.stage >= 3 || hasNonStarterRelic) &&
      riskPreview.available && riskPreview.isNovel &&
      (!activePrompt || activePrompt.kind === 'anomaly') &&
      relicHud.readyAbility?.id !== 'prism';
    $('risk-decision-bar').hidden = !showRiskDecision;
    if (showRiskDecision) {
      if (isTheater()) {
        setText('risk-decision-title', '');
        setText('risk-decision-sub', '');
        const riskMark = riskPreview.chargesPrism ? ' ◇' : riskPreview.chargesWeave ? ' ❋' : '';
        setText('risk-go-btn', `⚡+3${riskMark}`);
        setText('safe-go-btn', '🛡+1');
        $('risk-go-btn').title = `冒险过桥 (+3◆${riskPreview.bonusLabel ? ` · ${riskPreview.bonusLabel}` : ''})`;
        $('safe-go-btn').title = '稳妥过桥 (+1◆)';
      } else {
        setText('risk-decision-title', `通往「${riskPreview.toName}」新桥 · 首通⚡冒险 ${riskPreview.bonusLabel}`);
        setText('risk-decision-sub', `首次⚡冒险过桥可获：${riskPreview.bonusLabel}（过桥时顺着金色波浪微调滚轮）`);
        const extraTag = riskPreview.chargesPrism ? ' · ◇蓄能+1' : riskPreview.chargesWeave ? ' · ❋桥种+1' : riskPreview.awakensFlowerBridge ? ' · 🌺唤醒花桥' : '';
        setText('risk-go-btn', `⚡ 冒险冲过去 (+3◆${extraTag})`);
        setText('safe-go-btn', '🛡️ 稳妥走 (+1◆)');
      }
    }
  }
  if ($('relic-hud-bar')) {
    const theater = isTheater();
    // Starter 缓落壳 shield is already displayed in #lives; only show #relic-hud-bar when
    // active/relay relics, ready abilities, or tactical positioning hints are present.
    const showRelicHud = hasNonStarterRelic || !!relicHud.readyAbility || (!theater && !!relicHud.positioningHint);
    $('relic-hud-bar').hidden = !showRelicHud;
    if (showRelicHud) {
      const visibleItems = hasNonStarterRelic ? relicHud.items.filter(item => item.id !== 'shell') : relicHud.items;
      const nextHudKey = JSON.stringify([theater, visibleItems, relicHud.positioningHint]);
      if (relicHudKey !== nextHudKey && $('relic-chips')) {
        relicHudKey = nextHudKey;
        const chips = visibleItems.map(item => {
          const span = document.createElement('span');
          span.className = `relic-chip${item.available ? ' ready' : item.charged ? ' charged' : ''}`;
          span.title = `${item.name} ${item.rankSymbol} · ${item.statusText}`;
          span.innerHTML = theater
            ? `<span class="relic-chip-icon" aria-hidden="true">${item.icon}</span><strong>${item.shortText}</strong>`
            : `<span class="relic-chip-icon" aria-hidden="true">${item.icon}</span><strong>${item.name} ${item.rankSymbol}</strong><small>${item.statusText}</small>`;
          return span;
        });
        if (!theater && relicHud.positioningHint) {
          const hintChip = document.createElement('span');
          hintChip.className = 'relic-chip charged';
          hintChip.innerHTML = `<strong>${relicHud.positioningHint}</strong>`;
          chips.push(hintChip);
        }
        $('relic-chips').replaceChildren(...chips);
      }
      if ($('quick-ability-btn')) {
        $('quick-ability-btn').hidden = !relicHud.readyAbility;
        if (relicHud.readyAbility) {
          $('quick-ability-btn').title = relicHud.readyAbility.ctaText;
          setText('quick-ability-btn', theater ? relicHud.readyAbility.shortCta : relicHud.readyAbility.ctaText);
        }
      }
    }
  }
  if ($('radar-anomaly-card')) {
    const nextAnom = anomProg.items.find(a => !a.collected);
    const anomDone = anomProg.done >= anomProg.total && anomProg.total > 0;
    const flowerDone = (state.resonance?.stage || 0) >= 3;
    const vaultNode = state.nodes.find(n => n.id === 'vault');
    const vaultDone = state.vaultStatus === 'escaped';
    const vaultReady = vaultNode && !vaultNode.locked && !vaultDone;
    const riftNode = state.nodes.find(n => n.id === 'rift');
    const riftUnlocked = riftNode && !riftNode.locked;
    const riftCleared = state.rift?.status === 'cleared';
    const eligibleSecret = (state.hiddenRoutes || []).find(r => r.eligible && !r.unlocked);

    const totalSecretsDone = (anomDone ? 1 : 0) + (flowerDone ? 1 : 0) + (vaultDone ? 1 : 0) + (riftCleared || riftUnlocked ? 1 : 0);
    setText('radar-progress', `${totalSecretsDone} / 4 已解锁`);

    // 1. Anomaly Card
    $('radar-anomaly-card').className = `radar-card ${anomDone ? 'radar-done' : nextAnom?.materialized ? 'radar-ready' : ''}`;
    setText('radar-anomaly-title', `✦ 异维奇物 (${anomProg.done}/${anomProg.total})`);
    setText('radar-anomaly-sub', anomDone
      ? '✓ 本庭四维奇物已全部收录！'
      : nextAnom?.materialized
        ? `✨「${nextAnom.name}」已显形！点此立即收录 (+2◆)`
        : `🔭 侦测到「${nextAnom?.name || '奇物'}」在${nextAnom?.layerLabel || '异层'} · 点此切层寻宝`);

    // 2. Flower Bridge Card
    $('radar-flower-card').className = `radar-card ${flowerDone ? 'radar-done' : state.riskMode ? 'radar-ready' : ''}`;
    setText('radar-flower-title', flowerDone ? '🌺 隐藏花径 (已绽放)' : '🌺 沉睡花桥 (隐藏捷径)');
    setText('radar-flower-sub', flowerDone
      ? `✓ 已在${state.layers[state.resonance?.edge?.layer]?.name || '庭院'}长出花匣↔锚台永久花桥！`
      : state.riskMode
        ? '⚡ 已开启黄金冒险！现在走任意一座桥即可唤醒花径'
        : '点此开启⚡黄金冒险过桥 1 次，唤醒横跨虚空的花桥');

    // 3. Vault Card
    $('radar-vault-card').className = `radar-card ${vaultDone ? 'radar-done' : vaultReady ? 'radar-ready' : ''}`;
    setText('radar-vault-title', vaultDone ? '✨ 秘宝花匣 (已夺宝)' : `✨ 秘宝花匣 (+${state.roomChallenge?.reward || 4}◆)`);
    setText('radar-vault-sub', vaultDone
      ? '✓ 已成功躲过四维回流，秘宝收入囊中！'
      : vaultReady
        ? '✨ 花匣封印已解开！点此自动前往开启夺宝 ↗'
        : '🔒 点亮机关解锁通路后，可开启花匣挑战回流夺宝');

    // 4. Rift Card
    $('radar-rift-card').className = `radar-card ${riftCleared ? 'radar-done' : (riftUnlocked || eligibleSecret) ? 'radar-ready' : ''}`;
    setText('radar-rift-title', riftCleared ? '🌌 隐星秘境 (已升庭)' : riftUnlocked ? '🌌 隐星秘境 (已显形！)' : '🌌 隐星秘境 (+9◆)');
    setText('radar-rift-sub', riftCleared
      ? '✓ 已渡过三重星环回流，升庭天桥直通终点！'
      : riftUnlocked
        ? '✨ 第四神秘岛已显现！点此登岛开启隐星试炼 ↗'
        : eligibleSecret
          ? `🔮 封印已松动！点此前往按 ${(eligibleSecret.sequence || []).map(l => layerSymbols[l]).join('→')} 换层开启`
          : '点此查看双遗物共鸣十相秘印配方');
  }
  const routesTo = id => state.edges.filter(edge=>edge.open && ((edge.from===state.node && edge.to===id)||(edge.to===state.node && edge.from===id)));
  const nextKey = `${state.availableNodes.map(id=>`${id}:${routesTo(id).map(edge=>`${edge.id}/${edge.layer}`).join('|')}`).join(',')}:${state.selected}:${state.layer}`;
  if (destinationKey !== nextKey) {
    destinationKey = nextKey;
    $('destinations').replaceChildren(...state.availableNodes.map((id,i) => {
      const node = state.nodes.find(n=>n.id===id);
      const button = document.createElement('button');
      button.setAttribute('aria-pressed',String(state.selected === id));
      button.setAttribute('aria-label',`前往${node.name}`);
      const routes=routesTo(id), layers=[...new Set(routes.map(edge=>edge.layer))];
      const kinds={resonance:'花径',weave:'种桥',shadow:'影桥',secret:'秘径',ascension:'升庭桥'};
      const route=routes.find(edge=>edge.visible)||routes[0];
      const routeBadge=`${layers.map(layer=>layerSymbols[layer]).join('/')} ${kinds[route?.kind]||''}`.trim();
      button.title=routes.map(edge=>`${state.layers[edge.layer].name} · ${kinds[edge.kind]||'实体桥'}`).join(' / ');
      button.innerHTML = `<span>${i+1}</span>${node.name}<small>${routeBadge}</small>${id === 'exit' ? ' ↗' : ''}`;
      button.addEventListener('click',()=>{ if(canAct()) action(()=>model.select(id)); });
      return button;
    }));
  }
  $('w-slider').value = state.w;
  $('w-slider').disabled = state.phase !== 'playing' || paused;
  $('w-value').textContent = state.w.toFixed(3);
  const range = state.range;
  $('slice-window').style.left = `${(range?.min || 0)*100}%`;
  $('slice-window').style.width = `${range ? (range.max-range.min)*100 : 0}%`;
  $('slider-wrap').classList.toggle('risk',state.riskMode);
  $('safe-mode').setAttribute('aria-pressed',String(!state.riskMode));
  $('risk-mode').setAttribute('aria-pressed',String(state.riskMode));
  $('safe-mode').disabled = $('risk-mode').disabled = state.phase !== 'playing' || !!state.travel || !!state.wave;
  $('align').disabled = !range || !!state.travel || state.phase !== 'playing';
  const actions = courtyardActions(state);
  // The finite landing glint and E refer to the same current platform.
  if (state.courtyardMomentum?.beat === 'landing') actions.primary = 'interact';
  if (onwardShift) actions.primary = null;
  const mustActivate = actions.primary === 'interact' && currentNode?.kind === 'mechanism';
  $('move').disabled = !state.canMove || paused;
  $('move').className = actions.primary === 'move' && canAct() ? 'primary-button attention-action' : 'secondary-button';
  setHTML('move',state.travel ? `穿越中 <span>${Math.round(state.travel.progress*100)}%</span>` : `${firstAction?.action === 'move' ? `到${firstTarget.name}` : onwardMove ? `${['hub', 'relay'].includes(state.node) || state.activated.length >= mechTotal ? '到' : '稳行到'}${onwardTarget.name}` : state.riskMode?'冒险穿越':'稳行'} <span>${onwardMove && compactProgress.matches ? '↗' : 'Space ↗'}</span>`);
  $('interact').disabled = !canAct() || actions.interactDisabled;
  $('interact').title = state.interactReason || state.interactLabel;
  $('interact').className = actions.primary === 'interact' && canAct() ? 'primary-button attention-action' : `secondary-button${actions.interactDone ? ' completed-action' : ''}`;
  setHTML('interact',`${actions.interactDone ? '已启动' : state.interactLabel || '启动机关'} <kbd>E</kbd>`);
  $('destinations').closest('.destination-row')?.classList.toggle('deemphasized', mustActivate);
  $('stability-wrap').hidden = !state.travel && state.phaseStability>=.99;
  if (state.travel || state.phaseStability<.99) {
    const stability = state.travel?.stability ?? state.phaseStability;
    $('stability-bar').style.width = `${stability*100}%`;
    $('stability-bar').style.background = stability < .45 ? 'var(--danger)' : state.travel?.risky ? 'var(--amber)' : 'var(--green)';
    setText('stability-label',!state.travel?'平台正在消失':stability<.55?'失稳 · 恢复切片':state.travel.risky?'冒险蓄能':'稳定穿越');
  }
  $('wave-warning').hidden = !state.wave;
  if(state.wave){
    const safe=state.wave.safeLayers.includes(state.layer)&&Math.abs(state.w-currentLayer.center)<=Math.sqrt(.75)*.16&&(state.wave.variant!=='rift'||state.wave.entered);
    setText('wave-time',state.wave.remaining.toFixed(1));$('wave-warning').classList.toggle('evading',safe);
    const waveTitles = { rift: '隐星三重回流', sanctum: '圣殿三重回响', lock: '双层封锁', shift_lock: '双波易位', cascade_wave: '顺次折光' };
    if (isTheater()) {
      setText('wave-label', `${state.wave.step}/${state.wave.steps}`);
      setText('wave-instruction', `→ ${state.wave.safeLayers.map(i => layerSymbols[i]).join('/')}`);
    } else {
      setText('wave-label',safe?`已在安全层 · 第 ${state.wave.step}/${state.wave.steps} 波`:`${waveTitles[state.wave.variant] || '回流接近'} · 第 ${state.wave.step}/${state.wave.steps} 波`);
      setText('wave-instruction',`${state.wave.variant==='rift'&&!state.wave.entered?'本波需切入':'安全 →'} ${state.wave.safeLayers.map(i=>`${layerSymbols[i]} ${state.layers[i].name}`).join(' / ')}`);
    }
  }
  const aligned = range && state.w >= range.min && state.w <= range.max;
  setText('slice-hint',state.wave?(state.wave.variant==='rift'?'每波都需真正切入指定安全层；三波全过才领奖':state.wave.steps>1?'追波会改变危险层，每一波都要重新观察':'切到标记安全的层，层间隙不能躲过回流'):state.travel ? (state.travel.risky ? '额外冒险 · 调 W 跟随光带' : '保持当前切片，直到落地') : range ? `${aligned?'这段路径已显现':'路径在另一个切片'} · W ${range.min.toFixed(2)} — ${range.max.toFixed(2)}` : '切换 W 观察平台和机关，或选择落脚点');
  updateBuild(state);
  updateResonance(state);
  updateSecrets(state);
  if ($('phase-resonance-badge')) {
    const pr = state.phaseResonance || scene.phaseResonance.summary();
    const corridor = scene.phaseResonance.corridor(state);
    const activeRisk = !!(corridor?.traversing && corridor.risky);
    const hasActivity = activeRisk || pr.streak > 0 || pr.grazes > 0 || pr.perfectBeats > 0;
    $('phase-resonance-badge').hidden = stageInfo.stage < 3 || !hasActivity;
    if (!($('phase-resonance-badge').hidden)) {
      const syncPct = activeRisk ? Math.round(corridor.accuracy * 100) : Math.round((state.travel?.stability ?? state.phaseStability) * 100);
      setText('phase-resonance-badge', isTheater()
        ? (activeRisk ? `◈ ${syncPct}% · ×${pr.streak}` : `◈ ×${pr.streak} · ${pr.rank}`)
        : (activeRisk
          ? `◈ 同频 ${syncPct}% · 连击 ×${pr.streak} · 评级 ${pr.rank}`
          : `◈ 相位连击 ×${pr.streak} · 折光 ${pr.grazes} · 评级 ${pr.rank}`));
      $('phase-resonance-badge').classList.toggle('active-corridor', !!(activeRisk && corridor.sweetSpot));
      $('phase-resonance-badge').classList.toggle('high-streak', pr.streak >= 2);
    }
  }
  $('pause').disabled = state.phase !== 'playing';
  setText('context-hint',state.objective || '切换空间，观察能量会传到哪一层。');
  // The action popup owns its result; the caption keeps the current place legible.
  // A waiting layer-shift prompt is announced once here; afterwards the canvas pill and the
  // visual stepper keep it visible, so the popup does not repeat them indefinitely.
  const visibleFeedback = (transient && actionFeedback) ? actionFeedback : '';
  const status = (visibleFeedback || transientType === 'power' ? null : transient) || (state.travel ? (state.travel.risky?'冒险中 · 留意移动光带':'沿当前切片前进') : `${currentNode?.name || '归响台'} · ${currentLayer?.name || '层间隙'}`);
  $('action-feedback').hidden = !visibleFeedback;
  setText('action-feedback', visibleFeedback);
  if (status !== lastStatus) { $('scene-state').textContent = status; lastStatus = status; }
  if (state.phase !== lastPhase) {
    lastPhase = state.phase;
    if (state.phase === 'won') {
      savePreference(FIRST_RUN_DONE_KEY, 'yes');
      document.body.dataset.firstRun = String(isFirstRun());
      document.body.classList.toggle('first-run-pending', state.mode !== 'expedition' && isFirstRun());
    }
    if (['choose','interlude'].includes(state.phase)) showChoice(state);
    else if (['won','lost'].includes(state.phase)) showResult(state);
  }
}

$('w-slider').addEventListener('input',e=>{ if(canAct()) { cancelScrubGlide(); action(()=>model.setW(clampWToCurrentLayer(Number(e.target.value)))); } });
$('align').addEventListener('click',()=>{ if(canAct()) { cancelScrubGlide(); action(()=>model.setW(clampWToCurrentLayer(model.snapshot().range?.center ?? .5))); } });
$('safe-mode').addEventListener('click',e=>{ if(canAct()) { action(()=>model.setRisk(false)); if(e.detail>0) focusPlaySurface(); } });
$('risk-mode').addEventListener('click',e=>{ if(canAct()) { action(()=>model.setRisk(true)); if(e.detail>0) focusPlaySurface(); } });
$('move').addEventListener('click',()=>{ if(canAct()) { action(()=>model.move()); if(model.snapshot().travel) focusPlaySurface(); } });
$('interact').addEventListener('click',e=>{
  if (!canAct()) return;
  const before = model.snapshot();
  action(()=>model.interact());
  // Match move/mode pointer handoffs so Space can take the next bridge.
  // Keyboard activation and unsuccessful E clicks retain native button focus.
  if (e.detail > 0 && momentum.firstEntry && !before.activated.includes(before.node) && model.snapshot().activated.includes(before.node))
    focusPlaySurface();
});
$('ask-friend').addEventListener('click', askFriend);
$('onboarding-banner')?.querySelector('.onboarding-main')?.addEventListener('click', () => {
  const now = performance.now();
  if (isTheater()) {
    const nextOpen = !bannerDescOpen;
    bannerDescOpen = nextOpen;
    bannerDescDismissed = !nextOpen;
    if (nextOpen) bannerExpandedUntil = now + 8000;
  } else {
    bannerExpandedUntil = now + 6000;
    bannerDescOpen = true;
    bannerDescDismissed = false;
  }
  updateUI();
});
$('void-rescue-btn')?.addEventListener('click', () => {
  if (!canAct()) return;
  const s = model.snapshot();
  const currentNode = s.nodes.find(n => n.id === s.node);
  if (currentNode) action(() => model.setW(s.layers[currentNode.layer].center));
});
$('vstep-shift')?.addEventListener('click', () => {
  if (!canAct()) return;
  const s = model.snapshot();
  const currentNode = s.nodes.find(n => n.id === s.node);
  if (s.phaseStability < .99 && currentNode && !currentNode.anchor) {
    action(() => model.setW(s.layers[currentNode.layer].center));
    return;
  }
  const activePrompt = !s.wave && !s.travel && scene.pendingLayerPrompt &&
    Number.isInteger(scene.pendingLayerPrompt.targetLayer) &&
    scene.pendingLayerPrompt.targetLayer !== s.layer &&
    (!scene.pendingLayerPrompt.atNode || scene.pendingLayerPrompt.atNode === s.node)
      ? scene.pendingLayerPrompt
      : null;
  const g = s.companionGuide;
  const targetLayer = activePrompt ? activePrompt.targetLayer : (g && !g.aligned ? g.layer : null);
  if (!Number.isInteger(targetLayer)) return;
  const anomProg = scene.explorationRadar.roomProgress(s);
  const revealExplicit = onboarding.shouldRevealExplicitLayerHint(s, {
    hintRequested: !!guide.present(s).companionGuide,
    totalAnomaliesCollected: anomProg.totalCollected,
  });
  if (!revealExplicit) {
    onboarding.requestExplicitHint();
    showTransient(`💡 层提示已揭晓：目标桥在【${layerSymbols[targetLayer]} ${s.layers[targetLayer]?.name}】，亲手滚轮切过去吧！`, 3.6);
    updateUI();
    return;
  }
  manualSwitchLayer(targetLayer, 'assist');
});
$('vstep-move')?.addEventListener('click', () => {
  if (!canAct()) return;
  const s = model.snapshot();
  const currentNode = s.nodes.find(n => n.id === s.node);
  const g = s.companionGuide;
  if (g && g.kind === 'move') {
    action(() => {
      if (!g.aligned && currentNode?.anchor) model.setW(clampWToCurrentLayer(g.w));
      model.select(g.node);
      if (model.snapshot().canMove) model.move();
    });
  } else if (s.canMove) {
    action(() => model.move());
  }
});
$('vstep-act')?.addEventListener('click', () => {
  if (!canAct()) return;
  const s = model.snapshot();
  if (s.interactAvailable) action(() => model.interact());
  else if (s.companionGuide?.kind === 'activate' && !s.companionGuide.aligned) {
    action(() => { model.setW(clampWToCurrentLayer(s.companionGuide.w)); if (model.snapshot().interactAvailable) model.interact(); });
  }
});
$('exit-step-card')?.addEventListener('click', () => {
  if (canAct()) selectFromPanel('exit');
});
$('auto-next-btn')?.addEventListener('click', () => {
  if (!canAct()) return;
  const s = model.snapshot();
  const pending = scene.pendingLayerPrompt;
  if (pending && pending.targetLayer !== s.layer) {
    // Only perform the prompted change where it is safe; otherwise re-plan from here.
    if (!pending.atNode || pending.atNode === s.node) {
      manualSwitchLayer(pending.targetLayer, 'assist');
      return;
    }
    if (pending.targetId) {
      handleCanvasSelect(pending.targetId);
      return;
    }
  }
  if (s.activated.length >= mechCountOf(s)) {
    handleCanvasSelect('exit');
    return;
  }
  const order = s.mechanismOrder || s.nodes.filter(n => n.kind === 'mechanism').map(n => n.id);
  const nextMech = order.find(id => {
    const n = s.nodes.find(item => item.id === id);
    return n && n.powered && !s.activated.includes(id);
  });
  if (nextMech) {
    handleCanvasSelect(nextMech);
  }
});
const toggleRiskExploration = () => {
  if (!canAct()) return;
  const s = model.snapshot();
  if (s.travel || s.wave) return;
  const nextRisk = !s.riskMode;
  action(() => model.setRisk(nextRisk));
  transient = nextRisk
    ? '⚡ 已开启「黄金冒险桥」！过桥时滚轮微调保持在金色波浪中，即可获 3 倍回响并唤醒「🌺 沉睡花桥」！'
    : '🛡️ 已切回「稳行过桥」模式。';
  transientTime = 3.2;
  actionFeedback = transient;
  $('announcement').textContent = transient;
  updateUI();
};
$('quick-risk-btn')?.addEventListener('click', toggleRiskExploration);
$('radar-flower-card')?.addEventListener('click', toggleRiskExploration);
$('risk-go-btn')?.addEventListener('click', () => {
  if (!canAct()) return;
  const s = model.snapshot();
  const preview = computeRiskDecisionPreview(s);
  if (!preview.available) return;
  oneShotRiskCrossing = true;
  action(() => {
    model.setRisk(true);
    if (Math.abs(s.w - s.layers[s.layer].center) > .04) model.setW(s.layers[s.layer].center);
    model.select(preview.to);
    model.move();
  });
  if (model.snapshot().travel) {
    autoPilot = { targetNode: preview.goalId || preview.to };
    showTransient(`⚡ 黄金冒险出发！顺着金色光带微调滚轮，冲向「${preview.toName}」赢取 ${preview.bonusLabel}！`, 3.4);
  }
  updateUI();
});
$('safe-go-btn')?.addEventListener('click', () => {
  if (!canAct()) return;
  const s = model.snapshot();
  const preview = computeRiskDecisionPreview(s);
  if (!preview.available) return;
  oneShotRiskCrossing = false;
  action(() => model.setRisk(false));
  handleCanvasSelect(preview.goalId || preview.to);
});
$('quick-ability-btn')?.addEventListener('click', () => {
  if (!canAct()) return;
  const s = model.snapshot();
  const hud = computeRelicHudStatus(s);
  const abilityId = hud.readyAbility?.id;
  if (!abilityId) return;
  autoPilot = null;
  scene.pendingLayerPrompt = null;
  action(() => model.useAbility(abilityId));
  if (abilityId === 'prism') {
    showTransient('✨ 回流棱镜已释放！跨层脉冲直接点亮了本层机关（免过桥）！', 3.8);
  } else if (abilityId === 'weave') {
    showTransient('❋ 织桥种已生根！在当前机关与 ⚓ 安全台之间长出了永久捷径桥！', 3.8);
  } else if (abilityId === 'shadow') {
    showTransient('◌ 留影扣已激活！分身留在原地持续压住跨层捷径桥！', 3.8);
  }
  updateUI();
});
$('radar-anomaly-card')?.addEventListener('click', () => {
  if (!canAct()) return;
  const s = model.snapshot();
  const prog = scene.explorationRadar.roomProgress(s);
  const nextAnom = prog.items.find(a => !a.collected);
  if (nextAnom) {
    revealScene();
    handleAnomalySelect(nextAnom);
  } else {
    if ($('anomaly-lore-box')) $('anomaly-lore-box').hidden = false;
  }
});
$('radar-vault-card')?.addEventListener('click', () => {
  if (canAct()) selectFromPanel('vault');
});
$('radar-rift-card')?.addEventListener('click', () => {
  if (!canAct()) return;
  const s = model.snapshot();
  const riftNode = s.nodes.find(n => n.id === 'rift');
  const eligible = (s.hiddenRoutes || []).find(r => r.eligible && !r.unlocked);
  if (riftNode?.locked && !eligible) {
    handleCanvasSelect('rift');
    $('secret-panel')?.scrollIntoView({
      block: 'nearest',
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
    return;
  }
  selectFromPanel('rift');
});
$('unlock-all-btn')?.addEventListener('click', () => {
  onboarding.unlockAllOverride = true;
  transient = isTheater() ? '🔓 已跳过引导，展开全部操作' : '🔓 已展开全部 4 阶四维操控与隐藏秘境图鉴！';
  transientTime = 2.8;
  actionFeedback = transient;
  $('announcement').textContent = transient;
  updateUI();
});
let suppressRulerClickUntil = -Infinity;
for (const button of document.querySelectorAll('.layer-controls [data-layer]')) {
  const idx = Number(button.dataset.layer);
  button.addEventListener('click', () => {
    if (performance.now() < suppressRulerClickUntil) return;
    if (canAct()) manualSwitchLayer(idx, 'button');
  });
  button.addEventListener('pointerenter', () => {
    if (!button.disabled) {
      scene.previewLayer = idx;
      button.classList.add('preview-hover');
    }
  });
  button.addEventListener('pointerleave', () => {
    if (scene.previewLayer === idx) scene.previewLayer = null;
    button.classList.remove('preview-hover');
  });
}
{
  const rulerEl = $('layer-controls');
  let rulerDrag = null;
  const wFromRulerClientY = clientY => {
    const b0 = $('layer-0')?.getBoundingClientRect();
    const b2 = $('layer-2')?.getBoundingClientRect();
    if (!b0 || !b2) return model.snapshot().w;
    const y0 = b0.top + b0.height / 2;
    const y2 = b2.top + b2.height / 2;
    const spanPx = Math.max(24, y0 - y2);
    const u = (y0 - clientY) / spanPx;
    const s = model.snapshot();
    const c0 = s.layers?.[0]?.center ?? 0.18;
    const c2 = s.layers?.[s.layers.length - 1]?.center ?? 0.82;
    return Math.max(0, Math.min(1, c0 + u * (c2 - c0)));
  };
  rulerEl?.addEventListener('pointerdown', e => {
    if (!isTheater() || !canAct() || !layerSwitchTaught() || e.button > 0) return;
    const s = model.snapshot();
    if (s.travel?.ramp && !s.travel.risky) return;
    const onTick = !!e.target.closest('button[data-layer]');
    const now = performance.now();
    const w = wFromRulerClientY(e.clientY);
    rulerDrag = {
      pointerId: e.pointerId,
      startY: e.clientY,
      lastW: w,
      lastT: now,
      vel: 0,
      scrubbing: !onTick,
    };
    if (!onTick) {
      e.preventDefault();
      try { rulerEl.setPointerCapture(e.pointerId); } catch {}
      handleScrubW(w, { phase: 'start' });
      handleScrubW(w, { phase: 'move', velocity: 0 });
    }
  });
  rulerEl?.addEventListener('pointermove', e => {
    if (!rulerDrag || e.pointerId !== rulerDrag.pointerId) return;
    if (!canAct()) { rulerDrag = null; return; }
    if (!rulerDrag.scrubbing) {
      if (Math.abs(e.clientY - rulerDrag.startY) < 6) return;
      rulerDrag.scrubbing = true;
      try { rulerEl.setPointerCapture(e.pointerId); } catch {}
      handleScrubW(rulerDrag.lastW, { phase: 'start' });
    }
    const now = performance.now();
    const w = wFromRulerClientY(e.clientY);
    const dt = Math.max(0.004, (now - rulerDrag.lastT) / 1000);
    rulerDrag.vel = (w - rulerDrag.lastW) / dt;
    rulerDrag.lastW = w;
    rulerDrag.lastT = now;
    handleScrubW(w, { phase: 'move', velocity: rulerDrag.vel });
  });
  const endRulerDrag = (e, cancelled = false) => {
    if (!rulerDrag || (e && e.pointerId !== undefined && e.pointerId !== rulerDrag.pointerId)) return;
    const stateDrag = rulerDrag;
    rulerDrag = null;
    try { if (rulerEl.hasPointerCapture?.(stateDrag.pointerId)) rulerEl.releasePointerCapture(stateDrag.pointerId); } catch {}
    if (!stateDrag.scrubbing) return;
    suppressRulerClickUntil = performance.now() + 180;
    const w = e ? wFromRulerClientY(e.clientY) : stateDrag.lastW;
    handleScrubW(w, { phase: cancelled ? 'cancel' : 'end', velocity: stateDrag.vel });
  };
  rulerEl?.addEventListener('pointerup', e => endRulerDrag(e, false));
  rulerEl?.addEventListener('pointercancel', e => endRulerDrag(e, true));
  rulerEl?.addEventListener('wheel', e => {
    if (!isTheater() || !canAct() || e.ctrlKey || e.metaKey) return;
    const s = model.snapshot();
    if (!layerSwitchTaught() && !s.wave) return;
    e.preventDefault();
    const nextLayer = onboarding.handleDiscreteWheel(e.deltaY || -e.deltaX, s.layer, performance.now(), {
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      deltaMode: e.deltaMode,
    });
    if (nextLayer !== null) manualSwitchLayer(nextLayer, 'wheel');
  }, { passive: false });
}
$('sound').addEventListener('click',()=>{ soundEnabled = !soundEnabled; audio.setEnabled(soundEnabled); unlockAudio(); savePreference('wslice-sound',soundEnabled?'on':'off'); updateSoundButton(); });
function pauseGame() { if(model.snapshot().phase!=='playing'||isModal())return; paused=true; $('pause-dialog').showModal(); syncAudio(); }
function resumeGame() { $('pause-dialog').close(); paused=false; lastFrame=performance.now(); updateUI(); syncAudio(); focusPlaySurface(); }
$('pause').addEventListener('click',pauseGame); $('resume').addEventListener('click',resumeGame);
$('pause-dialog').addEventListener('cancel',e=>{e.preventDefault();resumeGame();});
function selectHelp(topic) {
  const s = model.snapshot();
  const node = s.nodes.find(n => n.id === s.node);
  let tip = contextualHelp(s, topic);
  if (!s.wave && !s.travel) {
    if (topic === 'slice') {
      tip = node?.anchor
        ? `你正站在「⚓ ${node.name}」上：滚轮上滚去上层、下滚去下层（或点下方 Ⅰ/Ⅱ/Ⅲ 层按钮），看隐藏的桥显形！`
        : `外圈机关只存在于「${s.layers[node?.layer]?.name || '当前层'}」；想换层请先点击带 ⚓ 的安全台（如「⚓ 归响台」）走回去。`;
    } else if (topic === 'action') {
      const mSyms = numBadges.slice(0, mechCountOf(s)).join(' / ');
      tip = `无需按 E！只要在当前层看到发光的「${mSyms}」号机关，直接用鼠标左键点击它，角色走上台就会自动点亮。`;
    } else if (topic === 'next') {
      const g = s.companionGuide;
      const target = s.nodes.find(n => n.id === g?.node)?.name || '下一座发光机关';
      tip = g && !g.aligned
        ? `下一座目标是「${target}」，但桥在【${s.layers[g.layer]?.name}】。请站在 ⚓ 安全台上，${g.layer > s.layer ? '上滚' : '下滚'}切到该层！`
        : `直接用鼠标左键点击画面中发光的「${target}」，顺着桥走过去即可自动点亮。`;
    }
  }
  setText('help-tip', tip);
  for (const button of document.querySelectorAll('[data-help]')) button.setAttribute('aria-pressed', String(button.dataset.help === topic));
}
for (const button of document.querySelectorAll('[data-help]')) button.addEventListener('click', () => selectHelp(button.dataset.help));
$('help').addEventListener('click',()=>{ if(!isModal()){paused=true;selectHelp('next');$('help-dialog').showModal();syncAudio();} });
function closeHelp() {
  $('help-dialog').close();
  paused = false;
  lastFrame = performance.now();
  updateUI();
  syncAudio();
  // close() restores focus to the opener; put it on the play surface afterwards,
  // including the task that some browsers use to restore dialog focus.
  focusPlaySurface();
  setTimeout(() => { if (!$('help-dialog').open) focusPlaySurface(); }, 0);
}
$('close-help').addEventListener('click',closeHelp);$('help-done').addEventListener('click',closeHelp);$('help-dialog').addEventListener('cancel',e=>{e.preventDefault();closeHelp();});
$('restart').addEventListener('click',()=>{if(!isModal()){paused=true;$('restart-dialog').showModal();syncAudio();}});
function cancelRestart() {
  $('restart-dialog').close();
  paused = false;
  lastFrame = performance.now();
  updateUI();
  syncAudio();
  focusPlaySurface();
  setTimeout(() => { if (!$('restart-dialog').open) focusPlaySurface(); }, 0);
}
$('cancel-restart').addEventListener('click',cancelRestart);$('restart-dialog').addEventListener('cancel',e=>{e.preventDefault();cancelRestart();});
function restartWithMode(nextMode = currentMode) {
  currentMode = nextMode === 'expedition' ? 'expedition' : 'intro';
  for(const id of dialogs)if($(id)?.open)$(id).close();
  cancelAutoPilot();
  cancelScrubGlide();
  scrubSession = null;
  scene.cancelGrab?.();
  oneShotRiskCrossing = false;
  altarTune = null;
  if (scene) {
    scene.altarWindow = null;
    scene.tutorialHint = null;
    scene.nextStepHint = null;
  }
  transient = null;
  transientTime = 0;
  transientType = '';
  actionFeedback = '';
  $('announcement').textContent = '';
  bannerDescOpen = false;
  bannerDescDismissed = false;
  bannerExpandedUntil = 0;
  closeAdvancedDrawers();
  onboarding.resetRun();
  paused=false;lastPhase='';destinationKey='';buildKey='';roomKey='';secretKey='';sealKey='';bannerStage=0;
  $('secret-panel').open=false;$('build-list').replaceChildren();$('ability-list').replaceChildren();
  if($('anomaly-lore-box'))$('anomaly-lore-box').hidden=true;
  scene.explorationRadar.reset();scene.phaseResonance.reset();
  const seed=newSeed();rememberSeed(seed, currentMode);
  action(()=>{model.restart(seed, modelOptions());autoEquipFirstRun();});
}
function restart() { restartWithMode(currentMode); }
$('confirm-restart').addEventListener('click',restart);$('play-again').addEventListener('click',restart);
$('next-expedition')?.addEventListener('click', () => restartWithMode('expedition'));
$('choice-dialog').addEventListener('cancel',e=>e.preventDefault());$('result-dialog').addEventListener('cancel',e=>e.preventDefault());

let activeCodexTab = 'curiosities';

function renderChapterDialog() {
  const container = $('chapter-cards');
  if (!container) return;
  const sum = codex.summary();
  const fl = sum.flatland;
  const introStats = sum.chapters.intro;
  const expStats = sum.chapters.expedition;
  const state = model.snapshot();

  container.innerHTML = `
    <article class="chapter-card">
      <div>
        <span class="chapter-step-tag">PROLOGUE · 序章 (2D → 3D)</span>
        <h3>平面国 · 越墙与升维</h3>
        <p>扮演二维世界的图形居民，直觉理解「高维球体穿过低维平面为何变成缩放的圆」，结识三位跨维伙伴并把它们带进庭院。</p>
        <div class="chapter-Topology-pills">
          <span class="chapter-pill">6 关递进</span>
          <span class="chapter-pill">伙伴同行</span>
          <span class="chapter-pill">约 6–8 分钟</span>
        </div>
      </div>
      <div>
        <div class="chapter-record">
          <span>已通 <strong>${fl.clearedLevels}/${fl.totalLevels}</strong> 关 · <strong>${fl.totalStars}★</strong></span>
          <span>伙伴 <strong>${fl.friendsFound}/${fl.friendsTotal}</strong> · 花园 <strong>${fl.gardensBloomed}/${fl.gardensTotal}</strong></span>
        </div>
        <a class="secondary-button" href="flatland.html" style="margin-top:10px">前往平面国 ↗</a>
      </div>
    </article>
    <article class="chapter-card ${state.mode === 'intro' ? 'active-chapter' : ''}">
      <div>
        <span class="chapter-step-tag">ACT Ⅰ · 第一幕${state.mode === 'intro' ? ' · 当前章节' : ''}</span>
        <h3>初探巡礼 · 经典三庭</h3>
        <p>从四座经典四维庭院中随机抽取三座：轻快掌握 W 切片折叠、同位换台、花匣闪避与遗物双件共鸣。</p>
        <div class="chapter-Topology-pills">
          <span class="chapter-pill">同位接力庭</span>
          <span class="chapter-pill">双源分流庭</span>
          <span class="chapter-pill">折返锚定庭</span>
          <span class="chapter-pill">合流锁庭</span>
        </div>
      </div>
      <div>
        <div class="chapter-record">
          <span>通关 <strong>${introStats.clears}</strong> 次</span>
          <span>最高 <strong>${introStats.bestScore}◆</strong>${introStats.bestRank && introStats.bestRank !== '—' ? ` · 评级 <strong>${introStats.bestRank}</strong>` : ''}</span>
        </div>
        <button type="button" class="${state.mode === 'intro' ? 'secondary-button' : 'primary-button'}" data-launch-mode="intro" style="margin-top:10px">${state.mode === 'intro' ? '重开第一幕 (3 庭) ↻' : '切换至第一幕 (3 庭) ↗'}</button>
      </div>
    </article>
    <article class="chapter-card expedition-card ${state.mode === 'expedition' ? 'active-chapter' : ''}">
      <div>
        <span class="chapter-step-tag">ACT Ⅱ · 第二幕${state.mode === 'expedition' ? ' · 当前章节' : ''}</span>
        <h3>深层五庭巡礼 · 圣殿远征</h3>
        <p>五庭完整构筑远征：2 座经典庭热身 → 2 座高阶拓扑（三层同位高塔 / 换向相位桥）→ 第 5 庭终章 Boss「四象升维圣殿」（4 机关 + 圣殿三重回响）。</p>
        <div class="chapter-Topology-pills">
          <span class="chapter-pill">🌀 三叠同位庭</span>
          <span class="chapter-pill">⇄ 相位换向庭</span>
          <span class="chapter-pill">👑 四象升维圣殿</span>
          <span class="chapter-pill">10 种双遗物秘印</span>
        </div>
      </div>
      <div>
        <div class="chapter-record">
          <span>通关 <strong>${expStats.clears}</strong> 次</span>
          <span>最高 <strong>${expStats.bestScore}◆</strong>${expStats.bestRank && expStats.bestRank !== '—' ? ` · 评级 <strong>${expStats.bestRank}</strong>` : ''}</span>
        </div>
        <button type="button" class="primary-button" data-launch-mode="expedition" style="margin-top:10px">${state.mode === 'expedition' ? '重开深层五庭 (5 庭) ↻' : '开启深层五庭 (5 庭) ↗'}</button>
      </div>
    </article>
  `;
  for (const btn of container.querySelectorAll('[data-launch-mode]')) {
    btn.addEventListener('click', () => restartWithMode(btn.dataset.launchMode));
  }
}

function renderCodexDialog() {
  const sum = codex.summary();
  const totalItems = sum.curiosities.total + sum.rooms.total + sum.secrets.total;
  const doneItems = sum.curiosities.discovered + sum.rooms.cleared + sum.secrets.unlocked;
  const pct = totalItems ? Math.round((doneItems / totalItems) * 100) : 0;
  setText('codex-total-badge', `总收录 ${doneItems}/${totalItems} (${pct}%)`);
  setText('codex-tab-curiosities', `✦ 异维奇物 (${sum.curiosities.discovered}/${sum.curiosities.total})`);
  setText('codex-tab-topologies', `🏛️ 庭院与十相秘印 (${sum.rooms.cleared + sum.secrets.unlocked}/${sum.rooms.total + sum.secrets.total})`);

  for (const tab of document.querySelectorAll('[data-codex-tab]')) {
    const active = tab.dataset.codexTab === activeCodexTab;
    tab.setAttribute('aria-selected', String(active));
  }
  if ($('codex-panel-curiosities')) $('codex-panel-curiosities').hidden = activeCodexTab !== 'curiosities';
  if ($('codex-panel-topologies')) $('codex-panel-topologies').hidden = activeCodexTab !== 'topologies';
  if ($('codex-panel-journey')) $('codex-panel-journey').hidden = activeCodexTab !== 'journey';

  if ($('codex-panel-curiosities')) {
    const foundSet = new Set(sum.curiosities.ids);
    $('codex-panel-curiosities').innerHTML = `<div class="codex-grid">${CURIOSITY_CATALOG.map((item, i) => {
      const ok = foundSet.has(item.id);
      return `<article class="codex-item ${ok ? 'discovered' : 'undiscovered'}">
        <div class="codex-item-head">
          <strong>${ok ? `✦ ${item.name}` : `◌ 未观测奇物 #${String(i + 1).padStart(2, '0')}`}</strong>
          <span class="codex-tag">${ok ? '已收录' : '待切层寻获'}</span>
        </div>
        <p>${ok ? item.lore : '在庭院中留意异层闪烁的多胞体波纹，站在 ⚓ 安全台上滚轮切至对应切片即可显形收录。'}</p>
      </article>`;
    }).join('')}</div>`;
  }

  if ($('codex-panel-topologies')) {
    const visitedSet = new Set(sum.rooms.visitedIds);
    const clearedSet = new Set(sum.rooms.clearedIds);
    const secretSet = new Set(sum.secrets.ids);
    const relicName = id => RELICS.find(r => r.id === id)?.name || id;
    $('codex-panel-topologies').innerHTML = `
      <div class="codex-section-title">🏛️ 七座四维庭院拓扑 (${sum.rooms.cleared}/${sum.rooms.total} 已通关)</div>
      <div class="codex-grid">${ALL_ROOM_TEMPLATES.map(tpl => {
        const cleared = clearedSet.has(tpl.id);
        const visited = visitedSet.has(tpl.id) || cleared;
        const tierLabel = tpl.id === 'sanctum' ? '终章圣殿 · 4 机关' : (tpl.id === 'triad' || tpl.id === 'interlock') ? '第二幕进阶庭' : '经典四象庭';
        return `<article class="codex-item ${cleared ? 'discovered' : 'undiscovered'}">
          <div class="codex-item-head">
            <strong>${visited ? tpl.name : `未踏足庭院 · ${tierLabel}`}</strong>
            <span class="codex-tag">${cleared ? '✓ 已贯通' : visited ? '已踏足' : tierLabel}</span>
          </div>
          <p>${visited ? tpl.description : '开启「第二幕 · 深层五庭巡礼」或多走几局即可邂逅此庭院拓扑。'}</p>
        </article>`;
      }).join('')}</div>
      <div class="codex-section-title">🔮 十相双遗物共鸣秘印 (${sum.secrets.unlocked}/${sum.secrets.total} 已解封)</div>
      <div class="codex-secrets-grid">${HIDDEN_ROUTE_RECIPES.map(rec => {
        const ok = secretSet.has(rec.id);
        const pairIcons = rec.requires.map(id => icons[id]).join(' + ');
        const pairNames = rec.requires.map(relicName).join(' ＋ ');
        return `<article class="codex-item ${ok ? 'discovered' : 'undiscovered'}">
          <div class="codex-item-head">
            <strong>${pairIcons} ${rec.name}</strong>
            <span class="codex-tag">${ok ? '✓ 已解封' : pairNames}</span>
          </div>
          <p>${ok ? `已用「${pairNames}」完成三印调谐，唤醒通往隐星台的跨维秘径。` : `集齐「${pairNames}」并满足共鸣条件后，在指定 ⚓ 安全台按三枚符印换层即可解封。`}</p>
        </article>`;
      }).join('')}</div>
    `;
  }

  if ($('codex-panel-journey')) {
    const fl = sum.flatland;
    const intro = sum.chapters.intro;
    const exp = sum.chapters.expedition;
    $('codex-panel-journey').innerHTML = `
      <div class="codex-journey-cards">
        <div class="codex-stat-card">
          <span>序章 · 平面国</span>
          <strong>${fl.clearedLevels} / ${fl.totalLevels}</strong>
          <small>累计星级 ${fl.totalStars}★ · 同行伙伴 ${fl.friendsFound}/${fl.friendsTotal} · 盛开花园 ${fl.gardensBloomed}/${fl.gardensTotal}</small>
        </div>
        <div class="codex-stat-card">
          <span>第一幕 · 初探三庭</span>
          <strong>${intro.bestScore} ◆</strong>
          <small>通关 ${intro.clears} 次 / 出发 ${intro.runs} 次${intro.bestRank && intro.bestRank !== '—' ? ` · 最佳共鸣评级 ${intro.bestRank}` : ''}</small>
        </div>
        <div class="codex-stat-card">
          <span>第二幕 · 深层五庭</span>
          <strong>${exp.bestScore} ◆</strong>
          <small>通关 ${exp.clears} 次 / 出发 ${exp.runs} 次${exp.bestRank && exp.bestRank !== '—' ? ` · 最佳共鸣评级 ${exp.bestRank}` : ''}</small>
        </div>
      </div>
      <div class="codex-grid">
        <article class="codex-item ${sum.riftClears > 0 ? 'discovered' : 'undiscovered'}">
          <div class="codex-item-head"><strong>🌌 隐星三重试炼渡劫</strong><span class="codex-tag">累计 ${sum.riftClears} 次</span></div>
          <p>解开双遗物秘印登上第四神秘岛「隐星台」，押上随身回响连续渡过三波星环回流，架起升庭直达桥。</p>
        </article>
        <article class="codex-item ${sum.sanctumChoirClears > 0 ? 'discovered' : 'undiscovered'}">
          <div class="codex-item-head"><strong>👑 四象圣殿天穹礼赞</strong><span class="codex-tag">累计 ${sum.sanctumChoirClears} 次</span></div>
          <p>在深层五庭终章点亮第 ④ 机关「天穹冠」，于圣柱之上渡过三重圣殿回响，展开天穹冠↔圣殿门黄金天桥。</p>
        </article>
      </div>
    `;
  }
}

function openChapterDialog() {
  if ($('result-dialog')?.open) $('result-dialog').close();
  if (isModal()) return;
  paused = true;
  renderChapterDialog();
  $('chapter-dialog')?.showModal();
  syncAudio();
}
function closeChapterDialog() {
  $('chapter-dialog')?.close();
  if (['won', 'lost'].includes(model.snapshot().phase)) {
    $('result-dialog')?.showModal();
    return;
  }
  paused = false;
  lastFrame = performance.now();
  syncAudio();
}
function openCodexDialog() {
  if ($('result-dialog')?.open) $('result-dialog').close();
  if (isModal()) return;
  paused = true;
  renderCodexDialog();
  $('codex-dialog')?.showModal();
  syncAudio();
}
function closeCodexDialog() {
  $('codex-dialog')?.close();
  if (['won', 'lost'].includes(model.snapshot().phase)) {
    $('result-dialog')?.showModal();
    return;
  }
  paused = false;
  lastFrame = performance.now();
  syncAudio();
}
$('open-chapters')?.addEventListener('click', openChapterDialog);
$('chapter-mode-pill')?.addEventListener('click', openChapterDialog);
$('result-open-chapters')?.addEventListener('click', openChapterDialog);
$('close-chapters')?.addEventListener('click', closeChapterDialog);
$('chapter-dialog')?.addEventListener('cancel', e => { e.preventDefault(); closeChapterDialog(); });

$('open-codex')?.addEventListener('click', openCodexDialog);
$('result-open-codex')?.addEventListener('click', openCodexDialog);
$('close-codex')?.addEventListener('click', closeCodexDialog);
$('codex-dialog')?.addEventListener('cancel', e => { e.preventDefault(); closeCodexDialog(); });
for (const tab of document.querySelectorAll('[data-codex-tab]')) {
  tab.addEventListener('click', () => {
    activeCodexTab = tab.dataset.codexTab || 'curiosities';
    renderCodexDialog();
  });
}

initThemeToggle($('theme-toggle'), theme => {
  scene.astralMode = theme === 'astral';
  scene.render(0);
});
initHyperLab({
  openButton: $('open-hyper-lab'),
  dialog: $('hyper-lab-dialog'),
  canvas: $('hyper-lab-canvas'),
  wSlider: $('hyper-lab-w'),
  wValue: $('hyper-lab-w-value'),
  polytopeButtons: document.querySelectorAll('[data-polytope]'),
  autoSpinButton: $('hyper-lab-spin'),
  syncButton: $('hyper-lab-sync'),
  closeButtons: document.querySelectorAll('[data-close-hyper-lab]'),
  getW: () => model.snapshot().w,
  setW: w => { if (model.snapshot().phase === 'playing') { model.setW(clampWToCurrentLayer(w)); consumeEvents(); updateUI(); } },
  onOpen: () => { paused = true; syncAudio(); },
  onClose: () => { paused = false; lastFrame = performance.now(); syncAudio(); },
});

// Remember when the page itself last scrolled, so a scroll gesture that sweeps the canvas
// under the cursor keeps scrolling the page instead of suddenly switching layers.
let lastPageScrollAt = -Infinity;
window.addEventListener('scroll', () => { lastPageScrollAt = performance.now(); }, { passive: true });

($('scene').parentElement || $('scene')).addEventListener('wheel', e => {
  if (!canAct()) return;
  if (e.ctrlKey || e.metaKey) return;
  const now = performance.now();
  const s = model.snapshot();
  // The wheel over the canvas always means "change layer" (stage 2 adds panels that make the
  // page scrollable, and the second wheel must not silently scroll the page instead), except
  // while a page scroll that started elsewhere is still in motion. Waves, risky crossings and
  // explicit layer prompts always take the wheel.
  const pageScrollInMotion = now - lastPageScrollAt < 500;
  const wantsWheel = !pageScrollInMotion || document.activeElement === $('scene') ||
    !!scene.pendingLayerPrompt || !!s.wave || !!s.travel?.risky;
  if (!wantsWheel) return;

  e.preventDefault();
  cancelScrubGlide();
  // One direction convention everywhere: wheel up / scroll right = higher W (towards Ⅲ),
  // matching the layer stack (Ⅲ on top) and the W slider (higher values on the right).
  const wheelDelta = e.deltaY || -e.deltaX;
  if (s.travel?.risky) {
    const discrete = e.deltaMode !== 0 || Math.abs(wheelDelta) >= 36;
    const delta = discrete
      ? Math.sign(wheelDelta) * -0.03
      : Math.max(-0.032, Math.min(0.032, -wheelDelta * 0.0012));
    if (Math.abs(delta) > 1e-4) action(() => model.setW(s.w + delta));
    return;
  }
  // Layer switching is taught at Stage 2. Until then a wheel must not change W
  // (the player starts on an anchor, so the old outer-platform guard does not apply)
  // and must not count as the skill that skips ahead to the layer-switch step.
  if ((scene.onboardingStage ?? 4) < 2 && !s.wave) return;
  // Holding the 4D Hyper-Lens (drag / right-click) and rolling the wheel dives straight into the previewed slice!
  if (!s.wave && !s.travel && scene.hyperLens.active && (scene.hyperLens.mode === 'drag' || scene.hyperLens.mode === 'rmb')) {
    let diveLayer = scene.hyperLens.snappedLayer;
    if (diveLayer === s.layer) {
      const stepped = onboarding.handleDiscreteWheel(wheelDelta, s.layer, now, {
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        deltaMode: e.deltaMode,
      });
      if (stepped !== null) diveLayer = stepped;
    }
    if (diveLayer !== s.layer) {
      const centers = (s.layers || []).map(l => l.center);
      scene.hyperLens.snappedLayer = diveLayer;
      scene.hyperLens.w = centers[diveLayer] ?? scene.hyperLens.w;
      unlockAudio();
      scene.triggerLensIrisWave(diveLayer);
      audio.handle([{ type: 'lens_dive', layer: diveLayer }]);
      manualSwitchLayer(diveLayer, 'wheel');
    }
    return;
  }
  const nextLayer = onboarding.handleDiscreteWheel(wheelDelta, s.layer, now, {
    ctrlKey: e.ctrlKey,
    metaKey: e.metaKey,
    deltaMode: e.deltaMode,
  });
  if (nextLayer !== null) {
    manualSwitchLayer(nextLayer, 'wheel');
  }
}, { passive: false });

let sceneDrag = null;
$('scene').addEventListener('pointerdown', e => {
  closePanel({ focus: 'canvas' });
  closeAdvancedDrawers();
  if (isTheater()) {
    // Dismiss only the description popover — collapsing the banner title here
    // would shrink .controls and shift the canvas mid-drag.
    bannerDescOpen = false;
    bannerDescDismissed = true;
    $('onboarding-banner')?.classList.remove('desc-open');
    $('onboarding-banner')?.classList.add('desc-dismissed');
  }
  if (!canAct()) return;
  $('scene').focus?.({ preventScroll: true });
  sceneDrag = { x: e.clientX, y: e.clientY, w: model.snapshot().w, moved: false };
});
window.addEventListener('pointermove', e => {
  if (!sceneDrag || !canAct()) return;
  const dx = e.clientX - sceneDrag.x;
  const dy = e.clientY - sceneDrag.y;
  if (Math.hypot(dx, dy) > 8) sceneDrag.moved = true;
  if (sceneDrag.moved && model.snapshot().travel?.risky) {
    const rect = $('scene').getBoundingClientRect();
    const nextW = sceneDrag.w + (dx / Math.max(180, rect.width)) * 0.65;
    action(() => model.setW(clampWToCurrentLayer(nextW)));
  }
});
window.addEventListener('pointerup', () => {
  // Drag only fine-tunes W during a risky crossing; layer changes use the wheel, Z/X/C,
  // the layer buttons or the W stack, so a drag can never be mistaken for a platform click.
  sceneDrag = null;
});

// Theater layout: the progress panel is a non-modal drawer; the game keeps running behind it.
let panelOpen = false;
function openPanel({ focus = false } = {}) {
  if (!isTheater() || !runPanel) return;
  panelOpen = true;
  runPanel.classList.add('panel-open');
  runPanel.toggleAttribute('inert', false);
  panelToggle?.setAttribute('aria-expanded', 'true');
  if (focus) (runPanel.querySelector('button, a[href], input, summary, [tabindex]') || runPanel).focus?.({ preventScroll: true });
}
function closePanel({ focus = 'toggle' } = {}) {
  if (!isTheater() || !runPanel || !panelOpen) return;
  panelOpen = false;
  runPanel.classList.remove('panel-open');
  runPanel.toggleAttribute('inert', true);
  panelToggle?.setAttribute('aria-expanded', 'false');
  if (focus === 'toggle') panelToggle?.focus?.({ preventScroll: true });
  else if (focus === 'canvas') $('scene').focus?.({ preventScroll: true });
}
function syncLayoutMode() {
  const theater = isTheater();
  $('layout-toggle')?.setAttribute('aria-pressed', String(theater));
  panelOpen = false;
  if (!runPanel) return;
  runPanel.classList.remove('panel-open');
  runPanel.toggleAttribute('inert', theater);
  panelToggle?.setAttribute('aria-expanded', 'false');
}
$('layout-toggle')?.addEventListener('click', () => {
  const theater = !isTheater();
  document.documentElement.classList.toggle('theater', theater);
  savePreference('wslice-theater', theater ? 'theater' : 'classic');
  syncLayoutMode();
  updateUI();
});
panelToggle?.addEventListener('click', () => { panelOpen ? closePanel() : openPanel({ focus: true }); });
syncLayoutMode();

// Theater overlays: --dock-h keeps the drawer above the dock; --f0/--af-h stack the
// toast chips above the dock-float column; --scene-h anchors the popover to the
// top of the scene so nothing intersects.
{
  const controlsEl = document.querySelector('.controls');
  const sceneWrapEl = document.querySelector('.scene-wrap');
  const dockFloatEl = document.querySelector('.dock-float');
  const feedbackEl = $('action-feedback');
  const warningEl = $('wave-warning');
  const visibleRect = el => {
    if (!el || el.hidden) return null;
    const r = el.getBoundingClientRect();
    return r.height > 1 ? r : null;
  };
  const syncOverlayVars = () => {
    document.documentElement.style.setProperty('--dock-h', `${controlsEl?.offsetHeight ?? 0}px`);
    if (controlsEl && sceneWrapEl)
      document.documentElement.style.setProperty('--scene-h', `${controlsEl.getBoundingClientRect().top - sceneWrapEl.getBoundingClientRect().top}px`);
    const df = dockFloatEl && getComputedStyle(dockFloatEl).display !== 'contents' ? visibleRect(dockFloatEl) : null;
    const af = visibleRect(feedbackEl);
    document.documentElement.style.setProperty('--f0', `${df?.height ?? 0}px`);
    document.documentElement.style.setProperty('--af-h', `${af ? af.height + 6 : 0}px`);
  };
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(syncOverlayVars);
    for (const el of [controlsEl, sceneWrapEl, dockFloatEl, feedbackEl, warningEl]) if (el) ro.observe(el);
  }
  syncOverlayVars();
}

document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&!isModal()){
    if (scene.cancelGrab()) { e.preventDefault(); return; }
    if (panelOpen) { e.preventDefault(); closePanel(); return; }
    if (closeAdvancedDrawers()) {
      e.preventDefault();
      document.querySelector('details.advanced-drawer > summary')?.focus?.({ preventScroll: true });
      return;
    }
    if (scene.hyperLens.pinned || scene.hyperLens.active) {
      e.preventDefault();
      scene.closeHyperLens();
      return;
    }
    e.preventDefault();pauseGame();return;
  }
  if(!canAct()||e.altKey||e.ctrlKey||e.metaKey)return;
  const key=e.key.toLowerCase();
  if(key==='p'&&!e.repeat&&isTheater()){e.preventDefault();panelOpen?closePanel():openPanel({focus:true});return;}
  if(key==='l'&&!e.repeat&&(scene.onboardingStage??4)>=2){
    const s=model.snapshot();
    if(s.phase==='playing'&&!s.wave&&!s.travel?.risky){e.preventDefault();scene.togglePinnedHyperLens(null);return;}
  }
  if(key==='r'&&!e.repeat){
    const s=model.snapshot();
    if(!s.travel&&!s.wave){e.preventDefault();action(()=>model.setRisk(!s.riskMode));return;}
  }
  if(key==='h'&&!e.repeat){e.preventDefault();askFriend();return;}
  // Preserve native arrows on the range and activation keys on focused buttons.
  // Other game shortcuts remain available after a click or slider adjustment.
  if(e.target===$('w-slider')&&['arrowleft','arrowright','arrowup','arrowdown','home','end','pageup','pagedown'].includes(key))return;
  if(e.target.matches('input,select,textarea')&&e.target!==$('w-slider'))return;
  if (key === ' ' && (scene.onboardingStage ?? 4) >= 2) {
    const sNow = model.snapshot();
    const inSurfWindow = Boolean(sNow.travel && !sNow.travel.risky);
    const inAltarWindow = Boolean(!sNow.travel && !sNow.wave && altarTune?.node === sNow.node);
    if (inSurfWindow || inAltarWindow) {
      e.preventDefault();
      if (e.repeat) return;
      if (inSurfWindow) {
        if (!sNow.travel.dashed) {
          triggerPhaseDash();
        } else {
          const dest = sNow.nodes.find(n => n.id === sNow.travel.to);
          if (dest?.kind === 'mechanism' && dest.powered && !sNow.activated.includes(dest.id)) {
            scene.snapPolyLockVisual(dest.id);
            snapPolytopeLock(dest.id);
          }
        }
      } else {
        scene.snapPolyLockVisual(sNow.node);
        snapPolytopeLock(sNow.node);
      }
      return;
    }
  }
  const activeModeToggle = (e.target === $('risk-mode') && model.snapshot().riskMode) || (e.target === $('safe-mode') && !model.snapshot().riskMode);
  if(e.target.matches('button,a')&&[' ','enter'].includes(key)&&!(key===' '&&activeModeToggle))return;
  if(['a','d','arrowleft','arrowright'].includes(key)){e.preventDefault();cancelScrubGlide();action(()=>model.setW(clampWToCurrentLayer(model.snapshot().w+(['a','arrowleft'].includes(key)?-.015:.015))));}
  else if(key===' '||key==='enter'){
    e.preventDefault();
    if (e.repeat) return;
    const s = model.snapshot();
    if ((scene.onboardingStage ?? 4) >= 2 && s.travel && !s.travel.risky) {
      if (!s.travel.dashed) {
        triggerPhaseDash();
      } else {
        const dest = s.nodes.find(n => n.id === s.travel.to);
        if (dest?.kind === 'mechanism' && dest.powered && !s.activated.includes(dest.id)) {
          scene.snapPolyLockVisual(dest.id);
          snapPolytopeLock(dest.id);
        }
      }
      return;
    }
    if ((scene.onboardingStage ?? 4) >= 2 && !s.travel && !s.wave && altarTune?.node === s.node) {
      scene.snapPolyLockVisual(s.node);
      snapPolytopeLock(s.node);
      return;
    }
    action(()=>model.move());
  }
  else if(key==='e'){e.preventDefault();if(!e.repeat)action(()=>model.interact());}
  else if(key==='q'){e.preventDefault();action(()=>model.useAbility());}
  else if(['z','x','c'].includes(key)){e.preventDefault();manualSwitchLayer(['z','x','c'].indexOf(key), 'key');}
  else if(/^[1-9]$/.test(key)){e.preventDefault();const id=model.snapshot().availableNodes[Number(key)-1];if(id)action(()=>model.select(id));}
});
document.addEventListener('visibilitychange',()=>{lastFrame=performance.now();if(document.hidden&&model.snapshot().phase==='playing'&&!isModal())pauseGame();syncAudio();});
window.addEventListener('pagehide',event=>{if(event.persisted)audio.setEnabled(false);else audio.dispose();});
window.addEventListener('pageshow',event=>{if(event.persisted){audio.setEnabled(soundEnabled);lastFrame=performance.now();}});
let windowFocused = true;
window.addEventListener('blur', () => { windowFocused = false; audio.syncAmbient({ blocked: true }); });
window.addEventListener('focus', () => { windowFocused = true; });
function syncAmbient() {
  const s = model.snapshot();
  audio.syncAmbient({
    progress: s.activated?.length ?? 0,
    w: scene.currentW(),
    exitOpen: (s.activated?.length ?? 0) >= mechCountOf(s),
    blocked: paused || isModal() || document.hidden || !windowFocused || s.phase !== 'playing',
  });
}
function frame(now) {
  const dt=Math.max(0,Math.min(.05,(now-lastFrame)/1000));lastFrame=now;
  const active=!paused&&!isModal()&&!document.hidden;
  const gameDt = active ? feel.step(dt) : 0;
  if(active){
    const beforeSnap = model.snapshot();
    const beforeTravel = beforeSnap.travel;
    model.update(gameDt);
    const afterSnap = model.snapshot();
    if ((afterSnap.stats?.failures || 0) > (beforeSnap.stats?.failures || 0)) {
      autoPilot = null;
    }
    if (beforeTravel && !afterSnap.travel && !(afterSnap.stats?.failures > beforeSnap.stats?.failures)) {
      feel.punch('player', .07);
    }
    if (afterSnap.travel && !beforeTravel) cancelScrubGlide();
    if (scrubGlide) {
      const cur = model.snapshot();
      if (cur.travel) {
        scrubGlide = null;
      } else {
        const w = cur.w, target = scrubGlide.target;
        const next = Math.abs(target - w) < 1e-3 ? target : w + (target - w) * Math.min(1, dt * 14);
        action(() => model.scrubW(clampWToCurrentLayer(next)));
        const applied = model.snapshot().w;
        const progressed = applied === target || Math.abs(applied - target) < Math.abs(w - target) - 1e-6;
        if (applied === target || !progressed) {
          const session = scrubGlide.session;
          scrubGlide = null;
          finishScrubSession(session);
        }
      }
    }
    if (oneShotRiskCrossing && beforeTravel?.risky && !afterSnap.travel) {
      oneShotRiskCrossing = false;
      model.setRisk(false);
    }
    onboarding.tickIdle(dt, afterSnap);
    if(transientTime>0){transientTime-=dt;if(transientTime<=0)transient=null;}
  }
  if(active && !model.snapshot().travel && !model.snapshot().wave) {
    stepAutoPilot();
  }
  if (altarTune) {
    const cur = model.snapshot();
    if (cur.phase !== 'playing' || cur.travel || cur.wave || cur.node !== altarTune.node || !cur.interactAvailable) {
      altarTune = null;
      scene.altarWindow = null;
    } else {
      scene.altarWindow = {
        node: altarTune.node,
        progress: Math.max(0, Math.min(1, (now - altarTune.startedAt) / ALTAR_TUNE_WINDOW_MS)),
      };
    }
  } else if (scene.altarWindow) {
    scene.altarWindow = null;
  }
  const prEvents = scene.phaseResonance.update(gameDt, model.snapshot(), { active });
  for (const pe of prEvents) {
    if (pe.type === 'phase_graze') {
      scene.life?.cheer();
      showTransient(`⚡ 刹那折光（+1◆）！在回流抵达前 ${pe.remaining.toFixed(2)}s 切入安全层 · 连击 ×${pe.streak}`, 2.4, 'phase_graze');
    } else if (pe.type === 'phase_beat' && pe.rating === 'perfect') {
      showTransient(pe.gateIndex === 2 && pe.streak >= 3 ? `✦ 完美同频 ×${pe.streak}（+1◆）· 黄金相位锁定` : `✦ 完美同频 ×${pe.streak} · 黄金相位锁定`, 1.8, 'phase_beat');
    }
  }
  guide.update(dt, model.snapshot(), active, scene.friends.length > 0 && !momentum.firstEntry);
  momentum.update(dt, model.snapshot(), guide, active);
  consumeEvents();updateUI();syncAudio();syncAmbient();scene.render(paused||document.hidden?0:gameDt);syncWRulerThumb(scene.currentW(), model.snapshot());requestAnimationFrame(frame);
}
updateSoundButton();consumeEvents();updateUI();requestAnimationFrame(frame);
