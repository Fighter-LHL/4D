import { GameModel, RELICS } from './model.js';
import { SceneRenderer } from './scene.js';
import { GameAudio } from './audio.js';
import { isFlatlandArrival } from './flatland/handoff.js';
import { courtyardFriends, friendGuideText } from './courtyard-friends.js';
import { FriendGuide } from './friend-guide.js';
import { CourtyardMomentum } from './courtyard-momentum.js';
import { STARTER_RELICS, mechanismFeedback, contextualHelp, courtyardActions } from './play-feedback.js';
import { initThemeToggle, initHyperLab } from './hyper-lab-ui.js';
import { ProgressiveOnboarding, planLayerRoute, computeRiskDecisionPreview, computeRelicHudStatus } from './progressive-onboarding.js';

const $ = id => document.getElementById(id);
const onboarding = new ProgressiveOnboarding({ skillGated: true });
const compactProgress = matchMedia('(max-width:480px)');
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
const newSeed = () => globalThis.crypto?.getRandomValues ? crypto.getRandomValues(new Uint32Array(1))[0] : Date.now() >>> 0;
const requestedSeed = new URL(location.href).searchParams.get('seed');
const initialSeed = requestedSeed !== null && /^\d{1,10}$/.test(requestedSeed) && Number(requestedSeed)<=0xffffffff ? Number(requestedSeed) : newSeed();
function rememberSeed(seed) { const url=new URL(location.href);url.searchParams.set('seed',String(seed));history.replaceState(null,'',url); }
const readPreference = (key, fallback) => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
const savePreference = (key,value) => { try { localStorage.setItem(key,String(value)); } catch { /* Private browsing can disable persistence. */ } };
const readJSON = key => { try { return JSON.parse(readPreference(key, '{}')); } catch { return {}; } };
const model = new GameModel(initialSeed);
const fromFlatland = isFlatlandArrival(location.search, readJSON('wslice-flatland-stars'), readJSON('wslice-flatland-visits'));
$('chapter-arrival').hidden = !fromFlatland;
rememberSeed(initialSeed);
// The very first run starts with the forgiving 缓落壳 so a new player meets zero decisions in
// the tutorial courtyard; relic choices still arrive between rooms. Once a run reaches the
// next room (or ends), every new run opens with the normal relic picker again.
const FIRST_RUN_DONE_KEY = 'wslice-first-run-done';
const isFirstRun = () => readPreference(FIRST_RUN_DONE_KEY, '') !== 'yes';
// Arrivals from Flatland keep their own starter picker (the discovery arrival offers
// "带缓落壳出发" as the primary choice with alternatives folded away).
const arrivedFrom = new URLSearchParams(location.search).get('from');
function autoEquipFirstRun() {
  if (model.snapshot().phase === 'choose' && !fromFlatland && arrivedFrom !== 'discovery' && isFirstRun()) model.chooseRelic('shell');
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
const dialogs = ['choice-dialog','help-dialog','pause-dialog','result-dialog','restart-dialog','hyper-lab-dialog'];
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
let oneShotRiskCrossing = false;
let bannerStage = 0;
let bannerExpandedUntil = 0;
let relicHudKey = '';

function showTransient(message, seconds = 3.2) {
  transient = message;
  transientTime = seconds;
  actionFeedback = message;
  $('announcement').textContent = message;
}

function buildLayerShiftPromptMessage(s, { targetId, targetLayer, atNode, toNode, kind }, revealExplicit) {
  const layerLabel = `${layerSymbols[targetLayer]} ${s.layers[targetLayer]?.name || '目标层'}`;
  const atName = s.nodes.find(n => n.id === atNode)?.name || '安全台';
  const targetName = s.nodes.find(n => n.id === targetId)?.name || '目标';
  const toName = s.nodes.find(n => n.id === toNode)?.name || targetName;
  const wheelDir = targetLayer > s.layer ? '上滚 ▲' : '下滚 ▼';
  const how = `亲手【滚轮${wheelDir}】（或点左上角 ${layerSymbols[targetLayer]}）切到【${layerLabel}】`;
  if (kind === 'recover') return `⚠️ 脚下平台只在【${layerLabel}】存在！${how}站稳`;
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
  const promptMsg = buildLayerShiftPromptMessage(s, promptInfo, revealExplicit);
  scene.pendingLayerPrompt = { ...promptInfo, message: promptMsg };
  showTransient(promptMsg, shift.kind === 'recover' ? 3.6 : 4.2);
  updateUI();
}

function stepAutoPilot() {
  if (!canAct()) { autoPilot = null; return; }
  const s = model.snapshot();
  if (s.travel || s.wave) return;
  const currentNode = s.nodes.find(n => n.id === s.node);

  // Auto-activate mechanism as soon as player stands on a powered unlit mechanism on its matching layer
  if (currentNode?.kind === 'mechanism' && currentNode.layer === s.layer && s.interactAvailable) {
    action(() => model.interact());
    if (autoPilot?.targetNode === s.node) {
      autoPilot = null;
      return;
    }
  }

  if (!autoPilot) return;
  // Give the freshly materialised bridge a moment on screen before walking onto it.
  if (autoPilot.resumeAt && performance.now() < autoPilot.resumeAt) return;

  const { targetNode: targetId, finalLayer = null } = autoPilot;
  const plan = planLayerRoute(s, targetId, { finalLayer });
  if (!plan) {
    autoPilot = null;
    const name = s.nodes.find(n => n.id === targetId)?.name || '目标';
    showTransient(`🔒 暂时还没有通往「${name}」的路：先点亮前序机关，让桥接通`, 3.2);
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

  if (plan.shift) {
    autoPilot = null;
    promptLayerShift(s, targetId, plan.shift, finalLayer);
    return;
  }

  // Arrived at the target in the right layer.
  autoPilot = null;
  if (s.interactAvailable && s.node !== 'hub') action(() => model.interact());
}

function manualSwitchLayer(layerIdx, source = 'manual') {
  if (!canAct()) return;
  onboarding.recordActivity();
  const s = model.snapshot();
  if (layerIdx < 0 || layerIdx >= s.layers.length) return;

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
      showTransient('⚓ 外圈平台只存在于当前层，现在换层会踩空。先点亮 ①，之后会教你在中央的 ⚓ 归响台换层', 3.2);
      updateUI();
      return;
    }
  }
  const order = s.mechanismOrder || s.nodes.filter(n => n.kind === 'mechanism').map(n => n.id);
  const nextMechId = order.find(id => {
    const n = s.nodes.find(item => item.id === id);
    return n && n.powered && !s.activated.includes(id);
  });
  const prompt = scene.pendingLayerPrompt;
  const targetId = prompt?.targetId || (s.activated.length >= 3 ? 'exit' : nextMechId);
  const prevOpenCurrent = new Set(
    (s.edges || []).filter(e => e.open && e.layer === prevLayer).map(e => e.id)
  );

  autoPilot = null;
  action(() => model.setW(s.layers[layerIdx].center));

  const after = model.snapshot();
  if (after.layer !== prevLayer) {
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
    if (prompt && (resume || after.node !== prompt.atNode)) scene.pendingLayerPrompt = null;
    if (resume && prompt.targetId && !prismReady) {
      autoPilot = { targetNode: prompt.targetId, finalLayer: prompt.finalLayer ?? null, resumeAt: performance.now() + 700 };
    }

    if (revealedTarget && stable) {
      scene.triggerMaterializeAha(after.layer, newlyVisibleEdges, targetNode);
      if (targetNode) {
        const layerName = after.layers[after.layer].name;
        if (prismReady) showTransient(`✨ 桥在【${layerName}】显形，且 ◇ 回流棱镜已就绪！点下方紫色按钮（或按 Q）可直接远程点亮「${targetNode.name}」`, 4.0);
        else if (resume && prompt.targetId) showTransient(`✨ 桥在【${layerName}】显形了！继续前往「${targetNode.name}」…`, 3.0);
        else if (targetNode.layer === after.layer) showTransient(`✨ 隐形的桥与「${targetNode.name}」在【${layerName}】显形了！点击它即可顺桥走过去`, 3.6);
      }
    }
  }
  updateUI();
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
    transient = '🌌 隐藏秘境「隐星台」：跨庭集齐 2 件共鸣遗物并在指定的 ⚓ 安全台完成三印换层，即可开启隐藏第四岛 (+9◆)！已在右侧展开秘印配方。';
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
  const finalLayer = id === 'vault' && s.vaultStatus === 'available' ? (s.roomChallenge?.entryLayer ?? null) : null;
  const plan = planLayerRoute(s, id, { finalLayer });
  scene.pendingLayerPrompt = null;
  if (!plan) {
    autoPilot = null;
    const hint = targetNode?.kind === 'mechanism' && !targetNode.powered ? '先点亮前序机关为它供能' : '先点亮前序机关，让桥接通';
    showTransient(`🔒 暂时还没有通往「${targetNode?.name || '目标'}」的路：${hint}`, 3.2);
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
    const atName = s.nodes.find(n => n.id === plan.shift.at)?.name || '安全台';
    showTransient(`⚓「${targetNode?.name || '目标'}」的桥不在这一层：先带你走到「${atName}」，到了请亲手滚轮换层`, 3.4);
  }
  stepAutoPilot();
}

function handleAnomalySelect(anomaly) {
  if (!canAct() || !anomaly) return;
  onboarding.recordActivity();
  const s = model.snapshot();
  const res = scene.explorationRadar.interact(s, anomaly.key || anomaly.id);
  if (!res) return;
  if (res.status === 'off_layer') {
    scene.pendingLayerPrompt = { targetId: null, targetLayer: res.targetLayer };
    transient = `${res.message} 请亲手滚动滚轮（或点左上角 ${layerSymbols[res.targetLayer]}）切至该层！`;
    transientTime = 3.4;
    actionFeedback = transient;
    $('announcement').textContent = transient;
    updateUI();
    return;
  }
  if (res.status === 'collected') {
    scene.spawnBurst(res.item.x, res.item.y, '#fbbf24', 26, 1.15);
    transient = res.message;
    transientTime = 4.0;
    actionFeedback = res.message;
    $('announcement').textContent = res.message;
    if ($('anomaly-lore-box')) {
      $('anomaly-lore-box').hidden = false;
      setText('anomaly-lore-title', `✦ 已收录四维奇物：【${res.item.name}】 (+${res.bonus}◆)`);
      setText('anomaly-lore-text', res.item.lore);
    }
    updateUI();
  }
}

const scene = new SceneRenderer($('scene'), {
  onSelect: handleCanvasSelect,
  onFriend: askFriend,
  onAnomaly: handleAnomalySelect,
  onLayerSelect: layerIdx => manualSwitchLayer(layerIdx, 'wstack'),
  hasSupplySlots,
});
scene.visualGuide = true;
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
  scene.setState(state);
  scene.pushEvents(events);
  audio.handle(events);
  for (const event of events) {
    // Local E feedback belongs to the platform just used, not the next crossing.
    // A rejected move emits no move event; remote supply messages stay relevant.
    if (event.type === 'move' && ['interact_blocked', 'activate'].includes(transientType)) {
      transient = null; transientTime = 0; transientType = ''; actionFeedback = '';
      $('announcement').textContent = '';
    }
    let message = mechanismFeedback(event, state, { hasSupplySlots: hasSupplySlots(event.to) });
    if (event.type === 'activate' && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      $('mechanism-count').animate([{ transform: 'scale(1.3)', color: '#a06c24' }, { transform: 'scale(1)' }], { duration: 550 });
    }
    if (event.type === 'fail') {
      onboarding.recordFailure();
      message = event.protected ? '缓落壳接住了你，随身回响保留。' : `失稳回退，失去 ${event.value} 枚未存回响。`;
    }
    if (event.type === 'evade' || event.type === 'dodge') {
      onboarding.recordWaveDodge();
    }
    if (event.type === 'bank') message = `已存入 ${event.value} 枚回响。`;
    if (event.type === 'unlock') message = '机关共鸣，通往庭门的实体桥已打开。';
    if (event.type === 'reward' && event.risky) message = `冒险成功，收获 ${event.value} 枚回响。`;
    if (event.type === 'ability') message = event.relic === 'prism' ? '脉冲送达，已供能的机关响应了。' : model.snapshot().shadowDescription;
    if (event.type === 'coil') message = `换层接力：${model.snapshot().nodes.find(n=>n.id===event.to)?.name || '下游机关'}回应了。`;
    if (event.type === 'weave') message = `${event.remote?'影子替你种下':'种下'}一条新路，这座花桥会留到本庭结束。`;
    if (event.type === 'resonance' && event.stage===3) message = `庭院回应了冒险：${model.snapshot().layers[event.layer].name}长出花匣—锚台花径。`;
    if (event.type === 'secret_seal') message = `符印 ${event.stage}/3 回应了换层。`;
    if (event.type === 'secret_open') message = '封印展开，隐星台显现了；新路仍要沿对应的 W 层前进。';
    if (event.type === 'rift_clear') message = '三重回流已渡过，整座庭院正在升起。';
    if (event.type === 'ascension' && event.stage===3) message = '升庭桥已展开，完成本庭机关后可以从隐星台直达庭门。';
    if (event.type === 'phase_transfer') message = '位置没有变，脚下已是另一层的机关。';
    if (event.type === 'warning') {
      const state=model.snapshot();
      message = `第 ${state.wave?.step || 1}/${state.wave?.steps || 1} 波将抵达，切到${(state.wave?.safeLayers || []).map(i=>state.layers[i].name).join('或')}。`;
      // On phones, the lower action button can scroll the actual hazard offscreen.
      if (matchMedia('(max-width:780px)').matches && $('scene').getBoundingClientRect().top < 0)
        $('scene').closest('.scene-wrap').scrollIntoView({block:'start',behavior:'instant'});
    }
    if (event.type === 'evade') message = '跨层避开回流，花匣中的回响归你。';
    if (event.type === 'dodge') message = model.snapshot().wave?.variant==='rift' ? '一枚星环点亮，切入下一枚符印对应的安全层。' : '躲过一波；下一波会追到这里，再换一次层。';
    if (message) {
      transient = message; transientTime = 2.8; transientType = event.type; $('announcement').textContent = message;
      actionFeedback = ['interact_blocked', 'activate', 'power'].includes(event.type) ? message : '';
    }
    if (['restart','room'].includes(event.type)) { transient = null; transientTime = 0; $('announcement').textContent = ''; }
  }
}

function synergyNotes(relics) {
  const notes=[];
  if(relics.prism && relics.coil)notes.push({ids:['prism','coil'],text:'远程启动机关 → 锚台三印 → 棱镜回廊'});
  if(relics.shadow && relics.weave)notes.push({ids:['shadow','weave'],text:'借影远程种桥 → 归响台三印 → 影织暗径'});
  if(relics.prism && relics.weave)notes.push({ids:['prism','weave'],text:'一次冒险同时蓄脉冲与桥种 → 隔层启动后织路'});
  if(relics.shell && relics.weave)notes.push({ids:['shell','weave'],text:'种桥并躲过花匣 → 花匣三印 → 护生险径'});
  return notes;
}

function choiceSynergy(state,id) {
  const next={...state.relics,[id]:(state.relics[id]||0)+1};
  return synergyNotes(next).find(note=>note.ids.includes(id))?.text || ({prism:'＋ 接力线圈：探寻棱镜回廊',coil:'＋ 回流棱镜：探寻棱镜回廊',shadow:'＋ 织桥种：探寻影织暗径',weave:'＋ 留影扣或缓落壳：探寻隐藏路线',shell:'＋ 织桥种：探寻护生险径'}[id] || '');
}

function showChoice(state) {
  const next = state.phase === 'interlude';
  // Reuse the earned first-entry budget, once. Choosing still belongs to the
  // player; restarting or reaching the next room restores the ordinary picker.
  const discoveryStart = !next && discoveryChoicePending;
  discoveryChoicePending = false;
  $('choice-dialog').classList.toggle('starter-choice', !next);
  $('choice-dialog').classList.toggle('discovery-choice', discoveryStart);
  const upcoming=next ? state.nextRoom : state.roomPlan?.[0];
  $('choice-kicker').textContent = next ? `第 ${state.room + 1} 庭完成 · 已带回 ${state.banked} 回响` : `随机旅程 #${state.seed.toString(16).toUpperCase().padStart(8,'0')}`;
  $('choice-title').innerHTML = next ? '下一庭，<br>换一种解法。' : '带一件，就出发。';
  $('choice-intro').textContent = next ? '已有遗物全部保留。补齐一种组合，解开下一庭的隐藏路线；也可升阶现有能力。' : '点选即出发 · 详细能力随时看「本局构筑」';
  $('choice-route').hidden = !next;
  if (next) renderItinerary('choice-route',state,state.room+1);
  document.querySelector('.choice-preview').hidden = !next;
  document.querySelector('.intro-rules').hidden = !next;
  document.querySelector('.dialog-foot').hidden = !next;
  if (fromFlatland && !next) {
    $('choice-intro').textContent = scene.friends.length ? '伙伴也来了 · 带一件遗物出发' : '带一件出发，看看 W 里的新世界。';
  }
  if (discoveryStart) {
    setText('choice-kicker', '平面国 → 庭院');
    setText('choice-title', `${scene.friends.length === 1 ? scene.friends[0].name : '伙伴们'}也来了。`);
    setText('choice-intro', '带上缓落壳，先走一座桥。');
  }
  setText('choice-room-name',`${next?'即将进入':'首先进入'} · ${upcoming?.name || state.roomName}`);
  setText('choice-room-description',upcoming?.description || state.roomDescription);
  $('choice-build').hidden = !next;
  $('choice-build').textContent = '已有：'+RELICS.filter(r=>state.relics?.[r.id]>0).map(r=>`${r.name} ${'ⅠⅡⅢ'[state.relics[r.id]-1]}`).join(' ＋ ');
  const choices = (state.choices || RELICS).map(relic => {
    const rank = state.relics?.[relic.id] || 0;
    const button = document.createElement('button');
    button.className = 'relic-choice';
    button.setAttribute('aria-label', `选择${relic.name}`);
    const combo=choiceSynergy(state,relic.id);
    button.innerHTML = next ? `<span class="relic-art" aria-hidden="true">${icons[relic.id]}</span><span class="choice-arrow" aria-hidden="true">↗</span><h3>${relic.name}</h3><p>${relic.description}</p><small>${rank?`进阶 ${'ⅠⅡⅢ'[rank-1]} → ${'ⅠⅡⅢ'[rank] || 'Ⅲ'}`:'获得新能力'} · ${traits[relic.id]}</small>${combo?`<span class="choice-synergy">${combo}</span>`:''}`
      : `<span class="relic-art" aria-hidden="true">${icons[relic.id]}</span><h3>${relic.name}</h3><p>${STARTER_RELICS[relic.id]}</p>`;
    button.classList.toggle('has-synergy',!!combo);
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
      $('w-slider').focus({preventScroll:true});
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
}

function showResult(state) {
  const won = state.phase === 'won';
  $('result-symbol').textContent = won ? '✧' : '◌';
  $('result-kicker').textContent = won ? 'JOURNEY COMPLETE' : 'UNTIL THE NEXT ECHO';
  $('result-title').textContent = won ? '庭院记住了你的回响。' : '这一程，先到这里。';
  $('result-description').textContent = won ? '你让回响穿过了三层空间，也把这一路的能力组合带到了终点。' : '回程结已用完，之前存下的回响仍计入本次成绩。';
  $('result-score').textContent = state.banked;
  const pr = scene.phaseResonance.summary();
  $('result-stats').textContent = `冒险成功 ${state.stats.risks} 次 · 点亮机关 ${state.stats.chains} 次 · 完美同频 ${pr.perfectBeats} 次 · 刹那折光 ${pr.grazes} 次 · 共鸣评级 ${pr.rank}`;
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
  const key=JSON.stringify([state.room, routes.map(route=>[route.id,route.progress,route.unlocked,route.eligible,route.requirement]),state.relics]);
  if(secretKey!==key){
    secretKey=key;
    $('secret-routes').replaceChildren(...routes.map(route=>{
      const row=document.createElement('div');
      row.className=`secret-route ${route.unlocked?'open':route.eligible?'ready':''}`;
      const entry=state.nodes.find(node=>node.id===route.entry);
      row.innerHTML=`<div class="secret-route-title"><span class="secret-relics" aria-hidden="true">${route.requires.map(id=>`<span class="${state.relics[id]?'owned':''}">${icons[id]}</span>`).join(' + ')}</span><strong>${route.name}</strong><small>${route.unlocked?'已展开':route.eligible?'可解印':'待共鸣'}</small></div><div class="seal-track">${sealGlyphs(route,state)}<small>${entry?.name || ''}</small></div><p>${route.unlocked?`${state.layers[route.edge.layer].name} · ${entry?.name} ↔ 隐星台`:route.requirement}</p>`;
      row.setAttribute('aria-label',`${route.name}，${route.requires.map(id=>RELICS.find(relic=>relic.id===id).name).join('与')}，${route.unlocked?'已展开':route.requirement}，在${entry?.name}依次切入${route.sequence.map(layer=>state.layers[layer].name).join('、')}，符印 ${route.progress}/3`);
      return row;
    }));
  }
  const here=routes.find(route=>route.entry===state.node&&!route.unlocked&&route.requires.every(id=>state.relics[id]));
  const promptKey=JSON.stringify([here?.id,here?.progress,here?.eligible,here?.requirement,!!state.travel,!!state.wave,state.node==='rift',state.rift?.status,state.rift?.ascension,state.carried>=2]);
  if(promptKey!==sealKey){
    sealKey=promptKey;
    $('seal-prompt').hidden=!!state.travel||!!state.wave||(!here&&state.node!=='rift');
    if(here){
      $('seal-prompt').innerHTML=`<span class="seal-heading">✧ ${here.name}</span><span class="seal-track">${sealGlyphs(here,state)}</span><small>${here.eligible?`依次进入新层 · 下一印 ${layerSymbols[here.sequence[here.progress]]}`:here.requirement}</small>`;
    }else if(state.node==='rift'){
      const rift=state.rift;
      $('seal-prompt').innerHTML=`<span class="seal-heading">✧ ${rift?.status==='cleared'?'庭院已回应':rift?.status==='failed'?'本庭试炼已结束':'隐星三重回流'}</span><small>${rift?.status==='cleared'?'升庭桥连向庭门，三座机关完成后可通行':rift?.status==='failed'?'押注不返还，原路仍可返回':`押 2 → 全过得 9 · 三波每次重新切入安全层${state.carried<2?' · 随身回响不足':''}`}</small>`;
    }
  }
  for(const [layer,button] of [...document.querySelectorAll('.layer-controls [data-layer]')].entries())button.classList.toggle('seal-next',!state.wave&&!state.travel&&!!here?.eligible&&here.sequence[here.progress]===layer);
  const rift=state.rift;
  $('rift-panel').hidden=!unlocked;
  $('rift-panel').classList.toggle('cleared',rift?.status==='cleared');
  setText('rift-title',rift?.status==='cleared'?'升庭连锁':rift?.status==='failed'?'本庭试炼已结束':'隐星三重回流');
  setText('rift-detail',rift?.status==='cleared'?`${rift.ascension===3?'升庭桥已展开':'星环正在唤醒归响台、锚台与庭门'} · 完成三机关可直达庭门`:rift?.status==='failed'?'本庭不能再挑战；押注不返还，已解开的秘径仍可走。':'押 2 枚随身回响 · 全过得 9 · 失手不退押注，每庭一次。');
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
  setText('room-description', state.roomDescription || '观察各层机关，让能量接力。');
  renderItinerary('room-itinerary',state,state.room);
  const order=state.mechanismOrder || state.nodes.filter(n=>n.kind==='mechanism').map(n=>n.id);
  const numBadges = ['①', '②', '③'];
  $('mechanisms').replaceChildren(...order.map((id, idx)=>{
    const node=state.nodes.find(n=>n.id===id);
    const row=document.createElement('div');row.className='mechanism-item';row.dataset.mechanism=id;
    row.style.cursor = 'pointer';
    row.addEventListener('click', () => handleCanvasSelect(id));
    row.innerHTML=`<span class="node-light" aria-hidden="true">${numBadges[idx] || '◇'}</span><span class="mechanism-name"><b>${numBadges[idx] || ''}</b> ${node.name}<span class="supply-slots">${(node.required || []).map(source=>{const from=state.nodes.find(n=>n.id===source);return `<i data-source="${source}" title="来自${from.name}" style="--supply-color:${state.layers[from.layer].color}">○</i>`;}).join('')}</span></span><small></small>`;
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
  const onward = momentum.firstEntry && canAct() && !state.travel && !state.wave &&
    state.phaseStability === 1 && !state.riskMode && !state.stats.failures &&
    (([1, 3].includes(state.activated.length) && state.activated.includes(state.node)) ||
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
  setText('seed-label',`#${state.seed.toString(16).toUpperCase().padStart(8,'0')}`);
  $('banked').textContent = state.banked;
  $('carried').textContent = state.carried;
  if (state.banked > best) { best = state.banked; savePreference('wslice-best',best); }
  setHTML('best-score',`${best} <small>回响</small>`);
  [...$('lives').children].forEach((el,i) => el.classList.toggle('empty',i >= state.lives));
  $('lives').setAttribute('aria-label',`剩余 ${state.lives} 次`);
  [...$('combo').children].forEach((el,i) => el.classList.toggle('active',i < state.combo));
  $('combo').setAttribute('aria-label',`${state.combo} 层`);
  $('mechanism-count').textContent = `${state.activated.length} / 3`;
  const currentLayer = state.layers?.[state.layer];
  const currentNode = state.nodes.find(n=>n.id===state.node);
  const anomProg = scene.explorationRadar.roomProgress(state);
  const stageInfo = onboarding.computeStage(state, anomProg.totalCollected);
  const revealExplicit = onboarding.shouldRevealExplicitLayerHint(state, {
    hintRequested: !!state.companionGuide,
    totalAnomaliesCollected: anomProg.totalCollected,
  });
  scene.onboardingStage = stageInfo.stage;
  scene.explicitLayerHint = revealExplicit;
  if (scene.pendingLayerPrompt && Number.isInteger(scene.pendingLayerPrompt.targetLayer)) {
    scene.pendingLayerPrompt.message = buildLayerShiftPromptMessage(state, scene.pendingLayerPrompt, revealExplicit);
  }
  setText('layer-name',currentLayer?.name || '层间隙');
  setText('layer-symbol',layerSymbols[state.layer] || '◇');
  if(currentNode?.world)setText('position-readout',`位置 ${Number(currentNode.world.x.toFixed(1))}, ${Number(currentNode.world.y.toFixed(1))}, ${Number(currentNode.world.z.toFixed(1))} · W ${state.w.toFixed(2)}`);
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
    const isTargetLayer = revealExplicit && !state.wave && !state.travel && effectiveTargetLayer === i;
    button.classList.toggle('attention-action', revealExplicit && (!!onwardShift && onward.layer === i || !!isTargetLayer));
    const sameSpot = sameSpotNodeOnLayer(i);
    const isVoidHere = !state.wave && !state.travel && currentNode && !currentNode.anchor && currentNode.layer !== i && !sameSpot;
    button.classList.toggle('void-warning-layer', !!isVoidHere);
    const pill = $('layer-pill-' + i);
    if (pill) {
      if (state.wave) {
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
    button.title=state.wave?`${state.layers[i].name} · ${state.wave.safeLayers.includes(i)?'安全切片':'回流危险'}`:isVoidHere?`${state.layers[i].name} · 当前圆盘不在此层，请先走回 ⚓ 安全台再换层`:state.layers[i].name;
  }
  if ($('void-rescue-banner')) {
    const voidDanger = state.phase === 'playing' && !state.travel && state.phaseStability < .99 && currentNode && !currentNode.anchor;
    $('void-rescue-banner').hidden = !voidDanger;
    if (voidDanger) {
      const safeName = state.layers[currentNode.layer]?.name || '原切片';
      setText('void-rescue-title', `⚠️ 脚下悬空（剩余 ${(state.phaseStability * 2.2).toFixed(1)}s）！当前圆盘不在这一层`);
      setText('void-rescue-sub', `「${currentNode.name}」只存在于${safeName}，需先走回「⚓ 安全台」才能安全换层`);
      setText('void-rescue-btn', `🛡️ 一键切回${safeName}`);
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
      setText('vstep-act-icon', state.activated.length === 3 ? '🚪' : '⚡');
      setText('vstep-act-title', `点亮机关 (${state.activated.length}/3)`);
      setText('vstep-act-sub', state.activated.length === 3 ? '三座全亮 · 点终点门过关' : '登岛自动点亮');
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
    const active = state.activated.includes(node.id);
    const idx = orderList.indexOf(node.id);
    const numSym = ['①', '②', '③'][idx] || '◇';
    const isPrimary = primaryMechId === node.id;
    row.classList.toggle('active', active);
    row.classList.toggle('primary-target', isPrimary);
    const missingSyms = (node.required || [])
      .filter(reqId => !(node.received || []).includes(reqId))
      .map(reqId => ['①', '②', '③'][orderList.indexOf(reqId)] || '前序');
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
    const exitOpen = state.activated.length >= 3;
    const exitNode = state.nodes.find(n => n.id === 'exit');
    $('exit-step-card').classList.toggle('exit-open', exitOpen);
    setText('exit-step-title', `🚪 终点门 · ${exitNode?.name || '折光门'}`);
    setText('exit-step-sub', exitOpen
      ? '✨ 大门已开！点此直接过关 ↗'
      : `🔒 待解锁 · 需先点亮 ①②③ (${state.activated.length}/3)`);
  }
  if ($('onboarding-banner')) {
    const bannerNow = performance.now();
    if (stageInfo.stage !== bannerStage) {
      bannerStage = stageInfo.stage;
      bannerExpandedUntil = bannerNow + 4500;
      if (stageInfo.stage > 1) $('announcement').textContent = `${stageInfo.badge}：${stageInfo.instruction}`;
    }
    // Stage 1 is the very first screen, so its single instruction stays until ① is lit.
    // Later stages expand briefly on arrival, then fold to a one-line badge (click to reopen).
    $('onboarding-banner').classList.toggle('collapsed', stageInfo.stage > 1 && bannerNow > bannerExpandedUntil);
    $('onboarding-banner').dataset.stage = String(stageInfo.stage);
    setText('onboarding-badge', stageInfo.badge);
    setText('onboarding-title', stageInfo.title);
    setText('onboarding-desc', stageInfo.instruction);
    if ($('unlock-all-btn')) {
      $('unlock-all-btn').hidden = stageInfo.stage >= 4;
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
      setText('quick-risk-btn', state.riskMode ? '⚡ 黄金冒险桥：已开启' : '⚡ 黄金冒险桥：关');
    }
    if ($('exploration-radar-section')) {
      $('exploration-radar-section').hidden = stageInfo.stage < 2;
    }
    if ($('radar-flower-card')) $('radar-flower-card').hidden = stageInfo.stage < 4;
    if ($('radar-vault-card')) $('radar-vault-card').hidden = stageInfo.stage < 3;
    if ($('radar-rift-card')) $('radar-rift-card').hidden = stageInfo.stage < 4;
    if ($('auto-next-btn')) {
      $('auto-next-btn').hidden = !onboarding.shouldShowAssistButton();
      if (state.activated.length >= 3) {
        setText('auto-next-btn', '🧭 帮我前往终点 ↗');
      } else if (primaryMechId) {
        const pIdx = orderList.indexOf(primaryMechId);
        const pSym = ['①', '②', '③'][pIdx] || '①';
        setText('auto-next-btn', `🧭 卡住了？帮我推进 ${pSym} ↗`);
      } else {
        setText('auto-next-btn', '🧭 帮我走这一步 ↗');
      }
    }
  }
  const activeGoalId = activePrompt?.targetId || (state.activated.length >= 3 ? 'exit' : primaryMechId);
  const riskPreview = computeRiskDecisionPreview(state, activeGoalId);
  const relicHud = computeRelicHudStatus(state);
  scene.relicHud = relicHud;
  scene.riskPreview = riskPreview;
  const hasNonStarterRelic = relicHud.items.some(item => item.id !== 'shell');
  if ($('risk-decision-bar')) {
    const showRiskDecision = (stageInfo.stage >= 3 || hasNonStarterRelic) &&
      riskPreview.available && riskPreview.isNovel && !activePrompt &&
      relicHud.readyAbility?.id !== 'prism';
    $('risk-decision-bar').hidden = !showRiskDecision;
    if (showRiskDecision) {
      setText('risk-decision-title', `通往「${riskPreview.toName}」的新桥已连通：稳妥走 (+1◆) 还是冒险冲 (+3◆)？`);
      setText('risk-decision-sub', `首次⚡冒险过桥可获：${riskPreview.bonusLabel}（过桥时顺着金色波浪微调滚轮）`);
      const extraTag = riskPreview.chargesPrism ? ' · ◇蓄能+1' : riskPreview.chargesWeave ? ' · ❋桥种+1' : riskPreview.awakensFlowerBridge ? ' · 🌺唤醒花桥' : '';
      setText('risk-go-btn', `⚡ 冒险冲过去 (+3◆${extraTag})`);
      setText('safe-go-btn', '🛡️ 稳妥走 (+1◆)');
    }
  }
  if ($('relic-hud-bar')) {
    const showRelicHud = stageInfo.stage >= 3 || !!relicHud.readyAbility || !!relicHud.positioningHint || hasNonStarterRelic;
    $('relic-hud-bar').hidden = !showRelicHud;
    if (showRelicHud) {
      const nextHudKey = JSON.stringify([relicHud.items, relicHud.positioningHint]);
      if (relicHudKey !== nextHudKey && $('relic-chips')) {
        relicHudKey = nextHudKey;
        const chips = relicHud.items.map(item => {
          const span = document.createElement('span');
          span.className = `relic-chip${item.available ? ' ready' : item.charged ? ' charged' : ''}`;
          span.innerHTML = `<span class="relic-chip-icon" aria-hidden="true">${item.icon}</span><strong>${item.name} ${item.rankSymbol}</strong><small>${item.statusText}</small>`;
          return span;
        });
        if (relicHud.positioningHint) {
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
          setText('quick-ability-btn', relicHud.readyAbility.ctaText);
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
    $('banked').textContent = state.banked + anomProg.bonusScore;

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
          : '点此查看 3 大隐藏秘印配方');
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
  setHTML('move',state.travel ? `穿越中 <span>${Math.round(state.travel.progress*100)}%</span>` : `${firstAction?.action === 'move' ? `到${firstTarget.name}` : onwardMove ? `${['hub', 'relay'].includes(state.node) || state.activated.length === 3 ? '到' : '稳行到'}${onwardTarget.name}` : state.riskMode?'冒险穿越':'稳行'} <span>${onwardMove && compactProgress.matches ? '↗' : 'Space ↗'}</span>`);
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
    setText('wave-label',safe?`已在安全层 · 第 ${state.wave.step}/${state.wave.steps} 波`:`${state.wave.variant==='rift'?'隐星三重回流':state.wave.variant==='lock'?'双层封锁':'回流接近'} · 第 ${state.wave.step}/${state.wave.steps} 波`);
    setText('wave-instruction',`${state.wave.variant==='rift'&&!state.wave.entered?'本波需切入':'安全 →'} ${state.wave.safeLayers.map(i=>`${layerSymbols[i]} ${state.layers[i].name}`).join(' / ')}`);
  }
  const aligned = range && state.w >= range.min && state.w <= range.max;
  setText('slice-hint',state.wave?(state.wave.variant==='rift'?'每波都需真正切入指定安全层；三波全过才领奖':state.wave.steps>1?'追波会改变危险层，每一波都要重新观察':'切到标记安全的层，层间隙不能躲过回流'):state.travel ? (state.travel.risky ? '额外冒险 · 调 W 跟随光带' : '保持当前切片，直到落地') : range ? `${aligned?'这段路径已显现':'路径在另一个切片'} · W ${range.min.toFixed(2)} — ${range.max.toFixed(2)}` : '切换 W 观察平台和机关，或选择落脚点');
  updateBuild(state);
  updateResonance(state);
  updateSecrets(state);
  if ($('phase-resonance-badge')) {
    const pr = scene.phaseResonance.summary();
    const corridor = scene.phaseResonance.corridor(state);
    const activeRisk = !!(corridor?.traversing && corridor.risky);
    const hasActivity = activeRisk || pr.streak > 0 || pr.grazes > 0;
    $('phase-resonance-badge').hidden = stageInfo.stage < 3 || !hasActivity;
    if (!($('phase-resonance-badge').hidden)) {
      const syncPct = activeRisk ? Math.round(corridor.accuracy * 100) : Math.round((state.travel?.stability ?? state.phaseStability) * 100);
      setText('phase-resonance-badge', activeRisk
        ? `◈ 同频 ${syncPct}% · 连击 ×${pr.streak} · 评级 ${pr.rank}`
        : `◈ 相位连击 ×${pr.streak} · 折光 ${pr.grazes} · 评级 ${pr.rank}`);
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
    if (['interlude','won','lost'].includes(state.phase)) savePreference(FIRST_RUN_DONE_KEY, 'yes');
    if (['choose','interlude'].includes(state.phase)) showChoice(state);
    else if (['won','lost'].includes(state.phase)) showResult(state);
  }
}

$('w-slider').addEventListener('input',e=>{ if(canAct()) action(()=>model.setW(Number(e.target.value))); });
$('align').addEventListener('click',()=>{ if(canAct()) action(()=>model.setW(model.snapshot().range?.center ?? .5)); });
$('safe-mode').addEventListener('click',e=>{ if(canAct()) { action(()=>model.setRisk(false)); if(e.detail>0) $('w-slider').focus({preventScroll:true}); } });
$('risk-mode').addEventListener('click',e=>{ if(canAct()) { action(()=>model.setRisk(true)); if(e.detail>0) $('w-slider').focus({preventScroll:true}); } });
$('move').addEventListener('click',()=>{ if(canAct()) { action(()=>model.move()); if(model.snapshot().travel) $('w-slider').focus({preventScroll:true}); } });
$('interact').addEventListener('click',e=>{
  if (!canAct()) return;
  const before = model.snapshot();
  action(()=>model.interact());
  // Match move/mode pointer handoffs so Space can take the next bridge.
  // Keyboard activation and unsuccessful E clicks retain native button focus.
  if (e.detail > 0 && momentum.firstEntry && !before.activated.includes(before.node) && model.snapshot().activated.includes(before.node))
    $('w-slider').focus({preventScroll:true});
});
$('ask-friend').addEventListener('click', askFriend);
$('onboarding-banner')?.querySelector('.onboarding-main')?.addEventListener('click', () => {
  bannerExpandedUntil = performance.now() + 6000;
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
      if (!g.aligned && currentNode?.anchor) model.setW(g.w);
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
    action(() => { model.setW(s.companionGuide.w); if (model.snapshot().interactAvailable) model.interact(); });
  }
});
$('exit-step-card')?.addEventListener('click', () => {
  if (canAct()) handleCanvasSelect('exit');
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
  if (s.activated.length >= 3) {
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
    handleAnomalySelect(nextAnom);
  } else {
    if ($('anomaly-lore-box')) $('anomaly-lore-box').hidden = false;
  }
});
$('radar-vault-card')?.addEventListener('click', () => {
  if (canAct()) handleCanvasSelect('vault');
});
$('radar-rift-card')?.addEventListener('click', () => {
  if (canAct()) handleCanvasSelect('rift');
});
$('unlock-all-btn')?.addEventListener('click', () => {
  onboarding.unlockAllOverride = true;
  transient = '🔓 已展开全部 4 阶四维操控与隐藏秘境图鉴！';
  transientTime = 2.8;
  actionFeedback = transient;
  $('announcement').textContent = transient;
  updateUI();
});
for(const button of document.querySelectorAll('.layer-controls [data-layer]'))button.addEventListener('click',()=>{if(canAct())manualSwitchLayer(Number(button.dataset.layer), 'button');});
$('sound').addEventListener('click',()=>{ soundEnabled = !soundEnabled; audio.setEnabled(soundEnabled); unlockAudio(); savePreference('wslice-sound',soundEnabled?'on':'off'); updateSoundButton(); });
function pauseGame() { if(model.snapshot().phase!=='playing'||isModal())return; paused=true; $('pause-dialog').showModal(); syncAudio(); }
function resumeGame() { $('pause-dialog').close(); paused=false; lastFrame=performance.now(); syncAudio(); $('w-slider').focus({preventScroll:true}); }
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
      tip = '无需按 E！只要在当前层看到发光的「① / ② / ③」号机关，直接用鼠标左键点击它，角色走上台就会自动点亮。';
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
function closeHelp() {$('help-dialog').close();paused=false;lastFrame=performance.now();syncAudio();}
$('close-help').addEventListener('click',closeHelp);$('help-done').addEventListener('click',closeHelp);$('help-dialog').addEventListener('cancel',e=>{e.preventDefault();closeHelp();});
$('restart').addEventListener('click',()=>{if(!isModal()){paused=true;$('restart-dialog').showModal();syncAudio();}});
function cancelRestart() {$('restart-dialog').close();paused=false;lastFrame=performance.now();syncAudio();}
$('cancel-restart').addEventListener('click',cancelRestart);$('restart-dialog').addEventListener('cancel',e=>{e.preventDefault();cancelRestart();});
function restart() {for(const id of dialogs)if($(id)?.open)$(id).close();paused=false;lastPhase='';destinationKey='';buildKey='';roomKey='';secretKey='';sealKey='';$('secret-panel').open=false;$('build-list').replaceChildren();$('ability-list').replaceChildren();const seed=newSeed();rememberSeed(seed);action(()=>{model.restart(seed);autoEquipFirstRun();});}
$('confirm-restart').addEventListener('click',restart);$('play-again').addEventListener('click',restart);
$('choice-dialog').addEventListener('cancel',e=>e.preventDefault());$('result-dialog').addEventListener('cancel',e=>e.preventDefault());

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
  setW: w => { if (model.snapshot().phase === 'playing') { model.setW(w); consumeEvents(); updateUI(); } },
  onOpen: () => { paused = true; syncAudio(); },
  onClose: () => { paused = false; lastFrame = performance.now(); syncAudio(); },
});

// Remember when the page itself last scrolled, so a scroll gesture that sweeps the canvas
// under the cursor keeps scrolling the page instead of suddenly switching layers.
let lastPageScrollAt = -Infinity;
window.addEventListener('scroll', () => { lastPageScrollAt = performance.now(); }, { passive: true });

$('scene').addEventListener('wheel', e => {
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
  // One direction convention everywhere: wheel up / scroll right = higher W (towards Ⅲ),
  // matching the layer stack (Ⅲ on top) and the W slider (higher values on the right).
  const wheelDelta = e.deltaY || -e.deltaX;
  if (s.travel?.risky) {
    const delta = Math.sign(wheelDelta) * -0.022;
    if (delta) action(() => model.setW(s.w + delta));
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
    action(() => model.setW(nextW));
  }
});
window.addEventListener('pointerup', () => {
  // Drag only fine-tunes W during a risky crossing; layer changes use the wheel, Z/X/C,
  // the layer buttons or the W stack, so a drag can never be mistaken for a platform click.
  sceneDrag = null;
});

document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&!isModal()){e.preventDefault();pauseGame();return;}
  if(!canAct()||e.altKey||e.ctrlKey||e.metaKey)return;
  const key=e.key.toLowerCase();
  if(key==='r'&&!e.repeat){
    const s=model.snapshot();
    if(!s.travel&&!s.wave){e.preventDefault();action(()=>model.setRisk(!s.riskMode));return;}
  }
  if(key==='h'&&!e.repeat){e.preventDefault();askFriend();return;}
  // Preserve native arrows on the range and activation keys on focused buttons.
  // Other game shortcuts remain available after a click or slider adjustment.
  if(e.target===$('w-slider')&&['arrowleft','arrowright','arrowup','arrowdown','home','end','pageup','pagedown'].includes(key))return;
  if(e.target.matches('input,select,textarea')&&e.target!==$('w-slider'))return;
  const activeModeToggle = (e.target === $('risk-mode') && model.snapshot().riskMode) || (e.target === $('safe-mode') && !model.snapshot().riskMode);
  if(e.target.matches('button,a')&&[' ','enter'].includes(key)&&!(key===' '&&activeModeToggle))return;
  if(['a','d','arrowleft','arrowright'].includes(key)){e.preventDefault();action(()=>model.setW(model.snapshot().w+(['a','arrowleft'].includes(key)?-.015:.015)));}
  else if(key===' '||key==='enter'){e.preventDefault();action(()=>model.move());}
  else if(key==='e'){e.preventDefault();if(!e.repeat)action(()=>model.interact());}
  else if(key==='q'){e.preventDefault();action(()=>model.useAbility());}
  else if(['z','x','c'].includes(key)){e.preventDefault();manualSwitchLayer(['z','x','c'].indexOf(key), 'key');}
  else if(/^[1-9]$/.test(key)){e.preventDefault();const id=model.snapshot().availableNodes[Number(key)-1];if(id)action(()=>model.select(id));}
});
document.addEventListener('visibilitychange',()=>{lastFrame=performance.now();if(document.hidden&&model.snapshot().phase==='playing'&&!isModal())pauseGame();syncAudio();});
window.addEventListener('pagehide',event=>{if(event.persisted)audio.setEnabled(false);else audio.dispose();});
window.addEventListener('pageshow',event=>{if(event.persisted){audio.setEnabled(soundEnabled);lastFrame=performance.now();}});
function frame(now) {
  const dt=Math.max(0,Math.min(.05,(now-lastFrame)/1000));lastFrame=now;
  const active=!paused&&!isModal()&&!document.hidden;
  if(active){
    const beforeSnap = model.snapshot();
    const beforeTravel = beforeSnap.travel;
    model.update(dt);
    const afterSnap = model.snapshot();
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
  const prEvents = scene.phaseResonance.update(dt, model.snapshot(), { active });
  for (const pe of prEvents) {
    if (pe.type === 'phase_graze') {
      transient = `⚡ 刹那折光！在回流抵达前 ${pe.remaining.toFixed(2)}s 切入安全层 · 连击 ×${pe.streak}`;
      transientTime = 2.4; transientType = 'phase_graze'; $('announcement').textContent = transient;
    } else if (pe.type === 'phase_beat' && pe.rating === 'perfect') {
      transient = `✦ 完美同频 ×${pe.streak} · 黄金相位锁定`;
      transientTime = 1.8; transientType = 'phase_beat'; $('announcement').textContent = transient;
    }
  }
  guide.update(dt, model.snapshot(), active, scene.friends.length > 0 && !momentum.firstEntry);
  momentum.update(dt, model.snapshot(), guide, active);
  consumeEvents();updateUI();syncAudio();scene.render(paused||document.hidden?0:dt);requestAnimationFrame(frame);
}
updateSoundButton();consumeEvents();updateUI();requestAnimationFrame(frame);
