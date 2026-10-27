import { VisitorCueSequence } from './visitor-cue.js';
import { DiscoveryHints, discoveryFeedback } from '../play-feedback.js';
import { FlatlandModel } from './model.js';
import { FlatlandRenderer } from './scene.js';
import { FlatlandAudio } from './audio.js';
import { FLATLAND_LEVELS, UNLOCK_FROM } from './levels.js';
import { normalizeProgress, normalizeBest, isLevelUnlocked } from './progress.js';
import { COURTYARD_ENTRY } from './handoff.js';
import { parseSeed, randomSeed } from './random.js';
import { FRIENDS, friendPortrait } from './discoveries.js';
import { COMPANION_HELP, GARDEN_SEEDS, gardenCollection, gardenSeedList } from './companions.js';

const $ = id => document.getElementById(id);
const setText = (id, text) => { const el = $(id), value = String(text); if (el.textContent !== value) el.textContent = value; };
const htmlCache = new WeakMap();
const setHTML = (id, html) => { const el = $(id); if (htmlCache.get(el) !== html) { el.innerHTML = html; htmlCache.set(el, html); } };
const escapeHTML = text => String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const readPreference = (key, fallback) => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
const savePreference = (key, value) => { try { localStorage.setItem(key, String(value)); } catch { /* Private browsing can disable persistence. */ } };
const readJSON = key => { try { return JSON.parse(readPreference(key, '{}')); } catch { return {}; } };
const PROGRESS_KEY = 'wslice-flatland-stars', BEST_KEY = 'wslice-flatland-best';
const progress = normalizeProgress(readJSON(PROGRESS_KEY), FLATLAND_LEVELS);
const best = normalizeBest(readJSON(BEST_KEY), FLATLAND_LEVELS);
const COLLECTION_KEY = 'wslice-flatland-friends', VISITS_KEY = 'wslice-flatland-visits';
const GARDENS_KEY = 'wslice-flatland-gardens';
const savedVisits = readJSON(VISITS_KEY);
const visits = Object.fromEntries(FLATLAND_LEVELS.filter(level => savedVisits?.[level.id] === true).map(level => [level.id, true]));
const unlocked = index => (playStyle === 'explore' && !!FLATLAND_LEVELS[index] && !FLATLAND_LEVELS[index].endless) ||
  isLevelUnlocked(FLATLAND_LEVELS, { ...progress, ...Object.fromEntries(Object.keys(visits).map(id => [id, 1])) }, index, UNLOCK_FROM);

const params = new URL(location.href).searchParams;
let playStyle = params.get('play') === 'challenge' ? 'challenge' : 'explore';
const requested = FLATLAND_LEVELS.findIndex(level => level.id === params.get('level'));
const firstOpen = FLATLAND_LEVELS.findIndex(level => !progress[level.id] && !level.endless);
const model = new FlatlandModel(requested >= 0 ? requested : playStyle === 'explore' ? 2 : Math.max(0, firstOpen), {
  seed: parseSeed(params.get('seed')) ?? randomSeed(), playStyle, collection: readJSON(COLLECTION_KEY), gardenMemories: readJSON(GARDENS_KEY),
});
if (model.exploration) model.start();
const scene = new FlatlandRenderer($('scene'));
const visitorCues = new VisitorCueSequence();
const audio = new FlatlandAudio();
const discoveryHints = new DiscoveryHints();
let soundEnabled = readPreference('wslice-sound', 'on') === 'on';
audio.setEnabled(soundEnabled);
const keys = new Set();
const peekSources = new Set();
const suppressedKeys = new Set();
let pointer = null;
let sliderDragging = false;
let wheelTimer = 0;
let lastPhase = '';
let lastS = model.s;
let resultTimer = 0;
let lastFrame = performance.now();
let fineControl = false;
let previousRun = null;
let albumWasPaused = false;
const dialogs = ['intro-dialog', 'result-dialog', 'pause-dialog', 'collection-dialog'];
const isModal = () => dialogs.some(id => $(id).open);
function syncChallengeURL() {
  const url = new URL(location.href);
  url.searchParams.set('level', model.level.id); url.searchParams.set('seed', model.seed);
  url.searchParams.set('play', model.exploration ? 'explore' : 'challenge');
  history.replaceState(null, '', url);
}
const canReroll = () => !!model.level.build || !!model.storm;

function unlockAudio() { if (soundEnabled) void audio.unlock(); }
function announce(text) { setText('announcement', text); }
function updateSoundButton() {
  $('sound').setAttribute('aria-pressed', String(soundEnabled));
  setText('sound-label', soundEnabled ? '声音开' : '声音关');
}

function starExtra(star, snap) {
  if (snap.phase === 'complete') return '';
  if (star.kind === 'parTime') return `${Math.min(snap.time, star.value).toFixed(0)} / ${star.value}`;
  if (star.kind === 'allShards') return `${snap.shards.filter(s => s.taken).length} / ${snap.shards.length}`;
  if (star.kind === 'perfectRings') return `${snap.rings.hits} / ${snap.rings.count}`;
  if (star.kind === 'complete' && snap.rings) return `${snap.rings.hits} / ${snap.rings.need}`;
  if (star.kind === 'complete' && snap.locks) return `${snap.locks.solved} / ${snap.locks.count}`;
  if (star.kind === 'complete' && snap.mirror) return `${snap.mirror.locks.filter(l => l.open).length} / ${snap.mirror.locks.length}`;
  if (star.kind === 'parActions') return `${snap.mirror.actions} / ${snap.mirror.par}`;
  if (star.kind === 'maxSliceMoves') return `${snap.counters.sliceMoves} / ${star.value}`;
  if (star.kind === 'noAlerts' && snap.counters.guardAlerts) return `被发现 ${snap.counters.guardAlerts} 次`;
  return '';
}
const starList = (snap, live) => snap.stars.map(star => {
  const cls = live ? star.status : star.earned ? 'earned' : '', extra = live ? starExtra(star, snap) : '';
  return `<li class="${cls}">${escapeHTML(star.label)}${extra ? ` <small>${extra}</small>` : ''}</li>`;
}).join('');

function renderLevels(snap) {
  setHTML('levels', FLATLAND_LEVELS.map((level, i) => {
    const stars = progress[level.id] || 0, label = level.endless ? `∞ · ${level.title}` : `${i + 1} · ${level.title}`;
    const friend = FRIENDS.find(f => f.level === level.id);
    const seeds = level.garden ? gardenSeedList(model.gardenMemories, level.id) : [];
    const gardenBadge = seeds.length === GARDEN_SEEDS.length ? ' ✿' : seeds.length ? ` ${seeds.length}/3` : '';
    const badge = playStyle === 'explore' ? `${friend ? model.collection.found.includes(friend.id) ? friend.icon : '◌' : visits[level.id] ? '·' : ''}${gardenBadge}` : `${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}`;
    return `<li><button data-level="${i}" class="${level.endless ? 'endless' : ''}" ${i === snap.index ? 'aria-current="true"' : ''} ${unlocked(i) || i === snap.index ? '' : 'disabled'}>${escapeHTML(label)}<span class="level-stars">${badge}</span></button></li>`;
  }).join(''));
  revealCurrentLevel();
}
function revealCurrentLevel() {
  const list = $('levels'), active = list.querySelector('[aria-current="true"]');
  if (active && list.scrollWidth > list.clientWidth) {
    list.scrollLeft = active.offsetLeft - list.offsetLeft - (list.clientWidth - active.offsetWidth) / 2;
  }
}
window.addEventListener('resize', revealCurrentLevel);

function openIntro(snap) {
  setText('intro-kicker', snap.endless ? 'ENDLESS' : `LEVEL ${snap.index + 1}`);
  setText('intro-title', snap.title); setText('intro-text', snap.tagline);
  setHTML('intro-stars', starList(snap, false));
  setText('intro-best', best[snap.levelId] ? `最高分 ${best[snap.levelId]}` : '');
  setText('intro-controls', controlHint(snap));
  if (!$('intro-dialog').open) $('intro-dialog').showModal();
}
function showResult(snap) {
  const earned = snap.stars.filter(star => star.earned).length;
  if (snap.cleared) progress[snap.levelId] = Math.max(progress[snap.levelId] || 0, earned);
  const record = snap.score > (best[snap.levelId] || 0);
  if (record) best[snap.levelId] = snap.score;
  savePreference(PROGRESS_KEY, JSON.stringify(progress));
  savePreference(BEST_KEY, JSON.stringify(best));
  setHTML('result-stars', snap.stars.map((star, i) => `<span class="${star.earned ? '' : 'off'}" style="animation-delay:${.15 + i * .18}s">★</span>`).join(''));
  setText('result-title', snap.endless ? `撑过 ${snap.time.toFixed(0)} 秒` : !snap.cleared ? '差一点' : earned === 3 ? '完美' : '过关');
  setText('result-score', snap.score);
  $('result-record').hidden = !record || snap.score === 0;
  setText('result-best', record ? '' : `最高分 ${best[snap.levelId] || 0}`);
  setHTML('result-list', starList(snap, false));
  const stats = [`${snap.time.toFixed(1)} 秒`];
  if (snap.rings) stats.push(`接住 ${snap.rings.hits} / ${snap.rings.count}`);
  if (snap.locks) stats.push(`偷看 ${snap.counters.reveals} 次`);
  if (snap.mirror) stats.push(`转动 ${snap.counters.planarTurns} · 翻面 ${snap.counters.flips}`);
  if (snap.shards.length && !snap.endless) stats.push(`光屑 ${snap.shards.filter(s => s.taken).length} / ${snap.shards.length}`);
  if (snap.storm) stats.push(`第 ${snap.storm.level} 波`);
  if (snap.storm?.grazes) stats.push(`擦身脱险 ${snap.storm.grazes} 次`);
  if (snap.combo.best > 1) stats.push(`最长连击 ${snap.combo.best}`);
  if (snap.deaths) stats.push(`失手 ${snap.deaths} 次`);
  if (snap.counters.guardAlerts) stats.push(`被发现 ${snap.counters.guardAlerts} 次`);
  setText('result-stats', stats.join(' · '));
  const nextIndex = snap.index + 1;
  $('next').hidden = !snap.cleared || nextIndex >= snap.count || !unlocked(nextIndex);
  setText('result-challenge', `挑战 #${snap.seed} · 同题重来保留布局`);
  const same = previousRun?.levelId === snap.levelId && previousRun.seed === snap.seed;
  const delta = same ? snap.score - previousRun.score : 0;
  setText('result-comparison', same ? `上次 ${previousRun.score} 分 · 本次 ${delta >= 0 ? '+' : '−'}${Math.abs(delta)} 分` : '');
  previousRun = { levelId: snap.levelId, seed: snap.seed, score: snap.score };
  $('new-challenge').hidden = !canReroll();
  $('enter-courtyard').hidden = !snap.ascend?.readyForCourtyard;
  $('enter-courtyard').href = COURTYARD_ENTRY;
  $('result-dialog').showModal();
  ($('next').hidden ? $('retry') : $('next')).focus();
  renderLevels(snap);
  announce(`${snap.title}：${snap.score} 分，${earned} 颗星。`);
}

function controlHint(snap) {
  if (snap.exploration && snap.rings) return '走到光环边 · Q / E 换层接住 · 点击访客';
  if (snap.exploration && snap.locks) return 'WASD / 拖动：搬动截面 · Q / E：对准金色拓印';
  if (snap.mirror) return 'WASD / 拖动移动 · Space 转动 · 紫色台上 F 翻面';
  const move = snap.canMove ? 'WASD / 拖动移动 · ' : '';
  return `${move}Q / E 换层 · Shift 精调`;
}

const EXPLORE_LINES = {
  visitor: '它好像在跟你打招呼。', guess: '这东西，还能变成什么样？', escape: '墙那头，好像有东西在动。',
  vault: '嘘。盒子里传来了呼噜声。', mirror: '那边的倒影，似乎有自己的想法。', ascend: '门外，还有一扇门。',
};
function saveCollection() { savePreference(COLLECTION_KEY, JSON.stringify(model.collection)); }
function renderCollection() {
  const { found, companion } = model.collection;
  const gardens = gardenCollection(model.gardenMemories, FLATLAND_LEVELS);
  setHTML('friend-cards', FRIENDS.map(friend => {
    const has = found.includes(friend.id);
    return `<article class="friend-card ${has ? 'found' : ''}"><span class="friend-portrait">${friendPortrait(friend, has, { crowned: gardens.complete })}</span><h3>${has ? friend.name : '还没遇见'}</h3><p>${has ? COMPANION_HELP[friend.id] : friend.clue}</p><button class="secondary-button" ${has ? `data-companion="${friend.id}" aria-pressed="${companion === friend.id}"` : `data-visit="${friend.level}"`}>${has ? companion === friend.id ? '正跟着你' : '一起走' : '去看看'}</button></article>`;
  }).join(''));
  $('travel-together').disabled = found.length < FRIENDS.length;
  setHTML('garden-memories', FLATLAND_LEVELS.filter(level => level.garden).map(level => {
    const seeds = gardenSeedList(model.gardenMemories, level.id), bloomed = seeds.length === GARDEN_SEEDS.length;
    return `<span class="${bloomed ? 'bloomed' : seeds.length ? 'sprouting' : ''}">${bloomed ? '✿' : seeds.length ? '◐' : '○'} ${level.title} ${seeds.length}/3</span>`;
  }).join(''));
  setText('garden-tally', `花园 ${gardens.count} / ${gardens.total} ✿`);
  $('garden-keepsake').hidden = !gardens.complete;
  $('travel-together').setAttribute('aria-pressed', String(companion === 'all'));
  setText('collection-caption', !model.exploration ? '计分挑战里，伙伴只陪你看风景。回到自由探索就能一起玩。' : found.length === FRIENDS.length ? '都到齐了，一起出去玩。' : '能力只在自由探索生效。还有朋友藏在别的角落。');
}
function openCollection() {
  albumWasPaused = model.paused;
  clearInputs(); action(() => model.setPaused(true)); renderCollection();
  $('collection-dialog').showModal();
}
function closeCollection() {
  $('collection-dialog').close();
  if (!albumWasPaused) action(() => model.setPaused(false));
  lastFrame = performance.now(); $('scene').focus({ preventScroll: true });
}

function updateUI() {
  const snap = model.snapshot();
  if (snap.phase !== lastPhase) {
    lastPhase = snap.phase; renderLevels(snap);
    if (snap.phase === 'intro') openIntro(snap);
    if (snap.phase === 'complete') resultTimer = .9;
  }
  setText('title', snap.title); setText('tagline', snap.exploration ? EXPLORE_LINES[snap.levelId] : snap.tagline);
  document.body.classList.toggle('exploring', snap.exploration);
  setText('style-toggle', snap.exploration ? '计分挑战' : '随便逛逛');
  setText('collection-label', snap.collection.found.length ? `朋友 ${snap.collection.found.length}` : '口袋里的秘密');
  const companion = snap.collection.companion, toys = snap.companions;
  $('pet').hidden = !companion || !toys.enabled;
  $('pet').disabled = !toys.canUse;
  const petLabel = companion === 'sprout' ? '跨层跳' : companion === 'lantern' ? '照远一点' : companion === 'ribbon' ? toys.mirror ? '收回倒影' : '镜像同步' : '一起玩';
  setText('pet-label', `${petLabel}${toys.cooldown > 0 ? ` ${toys.cooldown.toFixed(1)}s` : ''}`);
  $('pet').setAttribute('aria-pressed', String(!!toys.mirror));
  $('probe-direction').hidden = !toys.enabled || !['sprout', 'all'].includes(companion);
  $('probe-direction').disabled = !toys.canAim;
  const direction = toys.direction > 0 ? '上层 ↑' : toys.direction < 0 ? '下层 ↓' : '同层 →';
  setText('probe-direction-label', `跳向${direction}`);
  $('probe-direction').setAttribute('aria-label', `跳跳当前跳向${direction}，点击或按 C 切换`);
  $('garden-progress').hidden = !snap.exploration;
  setText('garden-count', `${snap.gardenCollection.count}/${snap.gardenCollection.total}`);
  $('garden-local').hidden = !toys.garden;
  setText('garden-petals', `${toys.garden?.petals ?? 0}/3`);
  $('companion-hint').hidden = !companion || !toys.enabled;
  setText('companion-hint', companion ? COMPANION_HELP[companion] : '');
  $('poke').hidden = !snap.exploration || !snap.rings;
  $('poke').disabled = !snap.canPoke;
  $('explore-next').hidden = !snap.exploration || !snap.cleared || snap.levelId === 'ascend';
  setText('explore-next', `去${FLATLAND_LEVELS[snap.index + 1]?.title || '下一站'} ↗`);
  $('explore-courtyard').hidden = !snap.exploration || !snap.ascend?.readyForCourtyard;
  $('explore-courtyard').href = COURTYARD_ENTRY;
  setText('control-hint', controlHint(snap));
  const visitorGoal = visitorCues.text(snap);
  $('visitor-goal').hidden = !visitorGoal;
  setText('visitor-goal', visitorGoal);
  $('pause').disabled = snap.phase !== 'playing';
  $('fine-control').hidden = !!snap.mirror;
  $('fine-control').disabled = !snap.canSlice;
  $('fine-control').setAttribute('aria-pressed', String(fineControl || keys.has('shift')));
  $('slice-row').classList.toggle('precise', snap.precision);
  const volume = snap.ascend?.stage === 'volume';
  setText('slice-axis', volume ? 'W' : 'S');
  setText('s-value', snap.s.toFixed(2));
  const slider = $('s-slider');
  slider.setAttribute('aria-label', volume ? 'W 切片位置' : 'S 切片高度');
  slider.min = snap.slice.min; slider.max = snap.slice.max; slider.step = volume ? .005 : .01;
  if (!sliderDragging) slider.value = snap.s;
  slider.disabled = $('s-up').disabled = $('s-down').disabled = !snap.canSlice;
  $('slice-row').hidden = !!snap.mirror;
  const par = snap.stars.find(star => star.kind === 'parTime')?.value;
  setText('timer', snap.time.toFixed(1)); setText('par', par ? `/ ${par} 秒` : '秒');
  $('timer').parentElement.classList.toggle('over', !!par && snap.time > par);
  setHTML('stars', starList(snap, true));
  $('hint').hidden = !snap.hint || snap.phase !== 'playing';
  if (snap.hint) setText('hint', snap.hint);
  $('peek').hidden = !snap.abilities.peek;
  $('peek').disabled = !snap.canSlice;
  $('peek').setAttribute('aria-pressed', String(snap.peek));
  $('reveal').hidden = !snap.abilities.reveal;
  $('reveal').disabled = !snap.locks || snap.locks.revealed || !snap.locks.active || snap.phase !== 'playing';
  $('rotate-key').hidden = $('flip-key').hidden = !snap.mirror;
  if (snap.mirror) { $('rotate-key').disabled = !snap.mirror.canRotate; $('flip-key').disabled = !snap.mirror.canFlip; }
  $('scene').setAttribute('aria-label', volume ? '三维房间的 W 截面' : '平面世界与侧面');
  return snap;
}

function consumeEvents() {
  const events = model.drainEvents();
  if (!events.length) return;
  visitorCues.receive(events, model.snapshot());
  scene.setState(model.snapshot());
  scene.pushEvents(events);
  audio.handle(events);
  for (const event of events) {
    if (event.type === 'load') announce('');
    if (event.type === 'friend_found') {
      saveCollection(); renderLevels(model.snapshot());
      if (event.fresh) announce(discoveryFeedback(event).text);
    }
    if (event.type === 'explore_clear') {
      visits[event.level] = true; savePreference(VISITS_KEY, JSON.stringify(visits));
      renderLevels(model.snapshot()); announce('路通了，也可以留下再逛逛。');
    }
    if (event.type === 'shard' && !events.some(e => e.type === 'garden_seed' && e.id === event.id)) announce(`光屑 ${event.taken} / ${event.total}`);
    if (event.type === 'friend_garden') announce(event.kind === 'probe' ? '花苞醒了，金色光屑落到花垫那层。' : '你和反反一起打开了花匣，金色光屑出现了。');
    if (event.type === 'garden_bloom') { savePreference(GARDENS_KEY, JSON.stringify(model.gardenMemories)); renderLevels(model.snapshot()); if (event.fresh) announce('这座花园点亮了，已经收进口袋。'); }
    if (event.type === 'gardens_complete') announce('六座花园全部盛开，朋友们戴上了小花冠。');
    if (event.type === 'garden_seed') { savePreference(GARDENS_KEY, JSON.stringify(model.gardenMemories)); renderLevels(model.snapshot()); if (event.fresh) announce(discoveryFeedback(event).text); }
    if (event.type === 'friend_blocked') announce(event.reason === 'height' ? '跳跳到高度边缘了，请切换跳跃方向。' : '跳跳要去的那层有墙，请挪一挪。');
    if (event.type === 'ring_hit') announce(model.exploration ? '接住啦。' : `接住，+${event.points}`);
    if (event.type === 'ring_miss') announce('错过一道光环');
    if (event.type === 'lock_open') announce('锁开了');
    if (event.type === 'pickup') announce('拿到钥匙');
    if (event.type === 'unlock') announce('门开了');
    if (event.type === 'death' || event.type === 'hurt') { clearInputs(true); announce(event.type === 'hurt' ? `被击中，剩 ${event.lives} 条命` : '被撞到了，重来一次'); }
    if (event.type === 'guard_alert') { clearInputs(true); announce('被发现了，回到入口'); }
    if (event.type === 'storm_level') announce(`第 ${event.level} 波`);
    if (event.type === 'graze') announce(`擦身脱险，+${event.points}`);
    if (event.type === 'flip_start') clearInputs(true);
    if (event.type === 'dimension_start' || event.type === 'dimension_ready') { clearInputs(true); lastS = model.s; }
    if (event.type === 'hint') announce(event.text);
  }
}
function action(fn) { unlockAudio(); fn(); consumeEvents(); updateUI(); }
function loadLevel(index, quick = false, seed = index === model.index ? model.seed : randomSeed()) {
  if (!unlocked(index) && index !== model.index) return;
  dialogs.forEach(id => $(id).open && $(id).close());
  resultTimer = 0;
  clearInputs();
  fineControl = false;
  quick ||= playStyle === 'explore' && !FLATLAND_LEVELS[index].endless;
  lastPhase = quick ? 'intro' : '';
  action(() => { model.playStyle = playStyle; model.load(index, seed); if (quick) model.start(); });
  if (quick) lastPhase = model.phase;
  renderLevels(model.snapshot());
  syncChallengeURL();
  if (quick) $('scene').focus({ preventScroll: true });
}
const retry = () => loadLevel(model.index, true);
const reroll = () => { const seed = randomSeed(); loadLevel(model.index, true, seed === model.seed ? (seed + 1) >>> 0 : seed); };
function goNext() { if (!$('next').hidden) loadLevel(model.index + 1); else retry(); }

function pauseGame() {
  if (model.phase !== 'playing' || model.paused) return;
  suppressedKeys.clear(); clearInputs();
  action(() => model.setPaused(true));
  $('pause-new').hidden = !canReroll();
  $('pause-dialog').showModal();
}
function resumeGame() {
  $('pause-dialog').close(); clearInputs();
  lastFrame = performance.now();
  action(() => model.setPaused(false));
  $('scene').focus({ preventScroll: true });
}

function applyInput() {
  let x = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
  let y = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0);
  if (pointer && !x && !y) {
    const p = model.player, dx = pointer.x - p.x, dy = pointer.y - p.y, distance = Math.hypot(dx, dy);
    if (distance > .15) { const speed = Math.min(1, distance / .8); x = dx / distance * speed; y = dy / distance * speed; }
  }
  model.setMove(x, y);
  model.setPrecision(fineControl || keys.has('shift'));
  const slice = (keys.has('e') || $('s-up').classList.contains('active') ? 1 : 0) - (keys.has('q') || $('s-down').classList.contains('active') ? 1 : 0);
  model.setSliceVelocity(slice);
  model.setPeek(peekSources.size > 0);
}
function clearInputs(suppressHeld = false) {
  if (suppressHeld) {
    keys.forEach(key => suppressedKeys.add(key));
    if (peekSources.has('space')) suppressedKeys.add(' ');
  }
  keys.clear(); peekSources.clear(); pointer = null; sliderDragging = false;
  clearTimeout(wheelTimer);
  $('s-up').classList.remove('active'); $('s-down').classList.remove('active');
  model.setMove(0, 0); model.setSliceVelocity(0); model.setPeek(false); model.setPrecision(false);
}

$('start').addEventListener('click', () => { $('intro-dialog').close(); action(() => model.start()); $('scene').focus({ preventScroll: true }); });
$('intro-dialog').addEventListener('cancel', event => { event.preventDefault(); $('start').click(); });
$('result-dialog').addEventListener('cancel', event => event.preventDefault());
$('retry').addEventListener('click', retry);
$('next').addEventListener('click', goNext);
$('restart').addEventListener('click', retry);
$('new-challenge').addEventListener('click', reroll);
$('pause-new').addEventListener('click', reroll);
$('pause-retry').addEventListener('click', retry);
$('pause').addEventListener('click', pauseGame);
$('resume').addEventListener('click', resumeGame);
$('pause-dialog').addEventListener('cancel', event => { event.preventDefault(); resumeGame(); });
$('choose-level').addEventListener('click', () => { $('result-dialog').close(); $('levels').querySelector('[aria-current="true"]').focus(); });
$('fine-control').addEventListener('click', () => { fineControl = !fineControl; action(() => model.setPrecision(fineControl)); });
$('style-toggle').addEventListener('click', () => {
  playStyle = model.exploration ? 'challenge' : 'explore';
  loadLevel(model.storm && playStyle === 'explore' ? 2 : model.index);
});
$('collection').addEventListener('click', openCollection);
$('collection-close').addEventListener('click', closeCollection);
$('collection-dialog').addEventListener('cancel', event => { event.preventDefault(); closeCollection(); });
$('friend-cards').addEventListener('click', event => {
  const button = event.target.closest('button');
  if (button?.dataset.companion) { model.setCompanion(button.dataset.companion); saveCollection(); renderCollection(); }
  if (button?.dataset.visit) {
    playStyle = 'explore'; loadLevel(FLATLAND_LEVELS.findIndex(level => level.id === button.dataset.visit));
  }
});
$('travel-together').addEventListener('click', () => { model.setCompanion('all'); saveCollection(); renderCollection(); });
$('pet').addEventListener('click', () => action(() => model.petCompanion()));
$('probe-direction').addEventListener('click', () => action(() => model.cycleProbeDirection()));
$('poke').addEventListener('click', () => action(() => model.pokeVisitor()));
$('explore-next').addEventListener('click', () => loadLevel(model.index + 1));
$('levels').addEventListener('click', event => { const button = event.target.closest('[data-level]'); if (button) loadLevel(Number(button.dataset.level)); });
$('sound').addEventListener('click', () => { soundEnabled = !soundEnabled; audio.setEnabled(soundEnabled); unlockAudio(); savePreference('wslice-sound', soundEnabled ? 'on' : 'off'); updateSoundButton(); });
$('rotate-key').addEventListener('click', () => action(() => model.rotateKey()));
$('flip-key').addEventListener('click', () => action(() => model.requestFlip()));
$('reveal').addEventListener('click', () => action(() => model.reveal()));

const slider = $('s-slider');
slider.addEventListener('pointerdown', () => { sliderDragging = true; unlockAudio(); });
slider.addEventListener('input', () => action(() => model.setSlice(Number(slider.value))));
const endSlider = () => { sliderDragging = false; action(() => model.endSliceGesture()); };
slider.addEventListener('change', endSlider);
slider.addEventListener('pointerup', endSlider);
slider.addEventListener('pointercancel', endSlider);
for (const id of ['s-up', 's-down']) {
  const button = $(id);
  button.addEventListener('pointerdown', event => { event.preventDefault(); unlockAudio(); button.classList.add('active'); button.setPointerCapture?.(event.pointerId); });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, () => button.classList.remove('active'));
}

const peekButton = $('peek');
peekButton.addEventListener('pointerdown', event => {
  if (!model.canSlice()) return;
  event.preventDefault(); unlockAudio(); peekSources.add('pointer');
  peekButton.setPointerCapture?.(event.pointerId);
  action(() => model.setPeek(true));
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) peekButton.addEventListener(type, () => { peekSources.delete('pointer'); action(() => model.setPeek(peekSources.size > 0)); });

const canvas = $('scene');
const pointAt = event => scene.screenToWorld(event.clientX, event.clientY);
canvas.addEventListener('pointerdown', event => {
  if (isModal() || model.phase !== 'playing') return;
  unlockAudio(); canvas.focus({ preventScroll: true }); pointer = pointAt(event);
  if (pointer) { action(() => model.pokeVisitor(pointer)); canvas.setPointerCapture?.(event.pointerId); }
});
canvas.addEventListener('pointermove', event => { if (pointer) pointer = pointAt(event) || pointer; });
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, () => { pointer = null; });
// Mouse wheel / trackpad scroll nudges the slice; a short pause ends the gesture.
canvas.addEventListener('wheel', event => {
  if (isModal() || !model.canSlice()) return;
  event.preventDefault(); unlockAudio();
  const range = model.sliceRange(), step = (range.max - range.min) * .012 * Math.max(-4, Math.min(4, event.deltaY / 25)) * (fineControl || event.shiftKey ? .2 : 1);
  action(() => model.setSlice(model.s - step));
  clearTimeout(wheelTimer);
  wheelTimer = setTimeout(() => action(() => model.endSliceGesture()), 220);
}, { passive: false });

const MOVE_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'q', 'e']);
document.addEventListener('keydown', event => {
  const key = event.key.toLowerCase();
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if ($('collection-dialog').open) {
    if (key === 'escape') { event.preventDefault(); if (!event.repeat) closeCollection(); }
    return;
  }
  if ($('pause-dialog').open) {
    if (key === 'p' || key === 'escape') { event.preventDefault(); if (!event.repeat) resumeGame(); }
    return;
  }
  if ($('intro-dialog').open) { if (key === 'enter' || key === ' ') { event.preventDefault(); $('start').click(); } return; }
  if ($('result-dialog').open) {
    if (key === 'enter' && !event.target.closest('button, a')) { event.preventDefault(); goNext(); }
    if (key === 'r') { event.preventDefault(); retry(); }
    return;
  }
  if (suppressedKeys.has(key)) { event.preventDefault(); return; }
  if ((key === 'escape' || key === 'p') && !event.repeat) { event.preventDefault(); pauseGame(); return; }
  if (key === 'shift') { keys.add(key); return; }
  // Focused controls keep their native activation; Space only acts on the key
  // or peek ability when focus is in the game itself.
  if ((key === ' ' || key === 'enter') && event.target.closest('button, a, input')) return;
  if (key === 'r' && !event.repeat) { event.preventDefault(); retry(); return; }
  if (key === 'b' && !event.repeat) { event.preventDefault(); action(() => model.petCompanion()); return; }
  if (key === 'c' && !event.repeat && !event.isComposing && !event.target.isContentEditable) { event.preventDefault(); action(() => model.cycleProbeDirection()); return; }
  if (key === ' ' && model.exploration && model.rings) { event.preventDefault(); if (!event.repeat) action(() => model.pokeVisitor()); return; }
  if (key === 'v' && !event.repeat && model.level.abilities?.reveal) { event.preventDefault(); action(() => model.reveal()); return; }
  if (model.level.abilities?.flip && (key === 'f' || key === ' ')) {
    event.preventDefault();
    if (!event.repeat) action(() => key === 'f' ? model.requestFlip() : model.rotateKey());
    return;
  }
  if (key === ' ' && model.level.abilities?.peek) { event.preventDefault(); peekSources.add('space'); action(() => model.setPeek(true)); return; }
  if (!MOVE_KEYS.has(key)) return;
  if (key.startsWith('arrow') && event.target === slider) return;
  event.preventDefault();
  unlockAudio();
  keys.add(key);
  canvas.focus({ preventScroll: true });
});
document.addEventListener('keyup', event => {
  suppressedKeys.delete(event.key.toLowerCase());
  keys.delete(event.key.toLowerCase());
  if (event.key === ' ') { peekSources.delete('space'); action(() => model.setPeek(peekSources.size > 0)); }
});
window.addEventListener('blur', pauseGame);
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });

function closeness(snap) {
  if (snap.rings?.active) return Number.isFinite(snap.rings.error) ? Math.max(0, 1 - snap.rings.error / .7) : 0;
  if (snap.locks?.active) return snap.locks.closeness;
  return null;
}
function frame(now) {
  const dt = Math.min(.1, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  if (!isModal() && !document.hidden) { applyInput(); model.update(dt); }
  else clearInputs();
  consumeEvents();
  const snap = updateUI();
  if (Math.abs(snap.s - lastS) > 1e-6) { audio.slice(snap.s - snap.slice.min, snap.slice.max - snap.slice.min, closeness(snap)); lastS = snap.s; }
  if (resultTimer > 0) { resultTimer -= dt; if (resultTimer <= 0 && snap.phase === 'complete') showResult(snap); }
  scene.setState(snap);
  const discoveryCue = discoveryHints.update(snap, isModal() || document.hidden ? 0 : dt, { suppressed: visitorCues.arrivalActive(snap) });
  if (discoveryCue) { scene.pushEvents([discoveryCue]); announce(discoveryCue.text); }
  scene.render(document.hidden || model.paused ? 0 : dt);
  requestAnimationFrame(frame);
}
updateSoundButton();
syncChallengeURL();
consumeEvents();
updateUI();
requestAnimationFrame(frame);
