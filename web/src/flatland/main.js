import { FlatlandModel } from './model.js';
import { FlatlandRenderer } from './scene.js';
import { FlatlandAudio } from './audio.js';
import { FLATLAND_LEVELS, UPCOMING } from './levels.js';
import { normalizeProgress, isLevelUnlocked } from './progress.js';
import { illustration, sectionThumbnail, sectionDescription, keyThumbnail } from './cards.js';
import { keyPoints } from './mirror.js';
import { COURTYARD_ENTRY } from './handoff.js';

const $ = id => document.getElementById(id);
const setText = (id, text) => { const el = $(id), value = String(text); if (el.textContent !== value) el.textContent = value; };
// Compare the authored string, not serialized DOM: SVG normalization would
// otherwise rebuild every card each frame and repeatedly drop keyboard focus.
const htmlCache = new WeakMap();
const setHTML = (id, html) => { const el = $(id); if (htmlCache.get(el) !== html) { el.innerHTML = html; htmlCache.set(el, html); } };
const escapeHTML = text => String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const readPreference = (key, fallback) => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
const savePreference = (key, value) => { try { localStorage.setItem(key, String(value)); } catch { /* Private browsing can disable persistence. */ } };
const PROGRESS_KEY = 'wslice-flatland-stars';
let progress = {};
try { progress = normalizeProgress(JSON.parse(readPreference(PROGRESS_KEY, '{}')), FLATLAND_LEVELS); } catch { progress = {}; }
const unlocked = index => isLevelUnlocked(FLATLAND_LEVELS, progress, index);

const requested = FLATLAND_LEVELS.findIndex(level => level.id === new URL(location.href).searchParams.get('level'));
const model = new FlatlandModel(requested >= 0 ? requested : Math.max(0, FLATLAND_LEVELS.findIndex((_, i) => !progress[FLATLAND_LEVELS[i].id])));
const scene = new FlatlandRenderer($('scene'));
const audio = new FlatlandAudio();
let soundEnabled = readPreference('wslice-sound', 'on') === 'on';
audio.setEnabled(soundEnabled);
const keys = new Set();
const peekSources = new Set();
const suppressedKeys = new Set();
let pointer = null;
let sliderDragging = false;
let lastPhase = '';
let lastS = model.s;
let resultTimer = 0;
let lastFrame = performance.now();
const dialogs = ['intro-dialog', 'quiz-dialog', 'result-dialog'];
const isModal = () => dialogs.some(id => $(id).open);

function unlockAudio() { if (soundEnabled) void audio.unlock(); }
function announce(text) { setText('announcement', text); }
function updateSoundButton() {
  $('sound').setAttribute('aria-pressed', String(soundEnabled));
  setText('sound-label', soundEnabled ? '声音开' : '声音关');
}

function starStatus(star, snap) {
  if (snap.phase === 'complete') return { cls: star.earned ? 'earned' : 'failed', extra: '' };
  if (star.kind === 'maxTime') {
    const time = snap.matchedAt ?? snap.time;
    return { cls: time > star.value ? 'failed' : snap.matchedAt !== null ? 'earned' : '', extra: `${Math.min(time, star.value).toFixed(0)} / ${star.value}` };
  }
  if (star.kind === 'firstCorrect') return { cls: snap.counters.firstCorrect >= star.value ? 'earned' : '', extra: `${Math.min(snap.counters.firstCorrect, star.value)} / ${star.value}` };
  if (star.kind === 'maxSliceMoves') return { cls: snap.counters.sliceMoves > star.value ? 'failed' : '', extra: `${snap.counters.sliceMoves} / ${star.value}` };
  if (star.kind === 'noBlocked') return { cls: snap.counters.blockedCount ? 'failed' : '', extra: '' };
  if (star.kind === 'noAlerts') return { cls: snap.counters.guardAlerts ? 'failed' : '', extra: `被发现 ${snap.counters.guardAlerts} 次` };
  if (star.kind === 'maxPeekUses') return { cls: snap.counters.peekUses > star.value ? 'failed' : '', extra: `${snap.counters.peekUses} / ${star.value}` };
  if (star.kind === 'flipPrediction') return { cls: snap.mirror.prediction?.correct === false ? 'failed' : snap.mirror.prediction?.correct === true ? 'earned' : '', extra: '' };
  if (star.kind === 'singleFlip') return { cls: snap.counters.flips > 1 ? 'failed' : '', extra: `已翻转 ${snap.counters.flips} 次` };
  return { cls: '', extra: '' };
}
const starList = (snap, live) => snap.stars.map(star => {
  const status = live ? starStatus(star, snap) : { cls: star.earned ? 'earned' : '', extra: '' };
  return `<li class="${status.cls}">${escapeHTML(star.label)}${status.extra ? ` <small>${status.extra}</small>` : ''}</li>`;
}).join('');

function renderLevels(snap) {
  const items = FLATLAND_LEVELS.map((level, i) => {
    const stars = progress[level.id] || 0;
    return `<li><button data-level="${i}" ${i === snap.index ? 'aria-current="true"' : ''} ${unlocked(i) ? '' : 'disabled'}>${i + 1} · ${escapeHTML(level.title)}<span class="level-stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span></button></li>`;
  });
  const later = UPCOMING.map((title, i) => `<li><button disabled title="即将开放">${FLATLAND_LEVELS.length + i + 1} · ${escapeHTML(title)}</button></li>`);
  setHTML('levels', [...items, ...later].join(''));
}

function openPhaseDialog(snap) {
  if (snap.phase === 'intro') {
    setText('intro-kicker', `LEVEL ${snap.index + 1} / ${snap.count}`);
    setText('intro-title', snap.title); setText('intro-text', snap.intro);
    setHTML('intro-stars', starList(snap, false));
    if (!$('intro-dialog').open) $('intro-dialog').showModal();
  }
  if (snap.phase === 'quiz') {
    setText('quiz-prompt', snap.quiz.prompt);
    setHTML('quiz-options', snap.quiz.options.map((option, i) => `<button data-choice="${i}">${escapeHTML(option)}</button>`).join(''));
    $('quiz-dialog').showModal();
  }
  if (snap.phase === 'complete') resultTimer = .9;
}
function showResult(snap) {
  const earned = snap.stars.filter(star => star.earned).length;
  progress[snap.levelId] = Math.max(progress[snap.levelId] || 0, earned);
  savePreference(PROGRESS_KEY, JSON.stringify(progress));
  setHTML('result-stars', snap.stars.map((star, i) => `<span class="${star.earned ? '' : 'off'}" style="animation-delay:${i * .15}s">★</span>`).join(''));
  setText('result-title', snap.title); setText('result-concept', snap.concept);
  const quiz = $('result-quiz');
  quiz.hidden = !snap.quiz;
  if (snap.quiz) { quiz.className = `result-quiz${snap.quiz.correct ? '' : ' wrong'}`; quiz.textContent = `${snap.quiz.correct ? '答对了。' : '再想想：'}${snap.quiz.explain}`; }
  setHTML('result-list', starList(snap, false));
  setText('result-stats', `用时 ${snap.time.toFixed(1)} 秒 · 换高度 ${snap.counters.sliceMoves} 次 · 被卡住 ${snap.counters.blockedCount} 次 · 提示 ${snap.counters.hintsShown} 次${snap.round ? ` · 首次答对 ${snap.counters.firstCorrect}/3 · 猜错 ${snap.counters.quizWrong} 次` : ''}${snap.abilities.peek ? ` · 透视 ${snap.counters.peekUses} 次 · 被发现 ${snap.counters.guardAlerts} 次` : ''}`);
  if (snap.mirror) setText('result-stats', `用时 ${snap.time.toFixed(1)} 秒 · 翻转 ${snap.counters.flips} 次 · 平面旋转 ${snap.counters.planarTurns} 次 · 首次预测${snap.mirror.prediction?.correct ? '正确' : '错误'} · 提示 ${snap.counters.hintsShown} 次`);
  $('next').hidden = snap.index + 1 >= snap.count;
  if (snap.ascend) setText('result-stats', `两次出房间均已完成 · 用时 ${snap.time.toFixed(1)} 秒 · 切片改变 ${snap.counters.sliceMoves} 次 · 被挡住 ${snap.counters.blockedCount} 次。接下来选择起手遗物，进入正式庭院。`);
  $('enter-courtyard').hidden = !snap.ascend?.readyForCourtyard;
  $('enter-courtyard').href = COURTYARD_ENTRY;
  $('result-dialog').showModal();
  renderLevels(snap);
  announce(`完成 ${snap.title}，获得 ${earned} 颗星。`);
}

function updateUI() {
  const snap = model.snapshot();
  if (snap.phase !== lastPhase) { lastPhase = snap.phase; renderLevels(snap); openPhaseDialog(snap); }
  setText('title', snap.title); setText('intro', snap.intro);
  setText('s-value', snap.s.toFixed(2));
  const slider = $('s-slider');
  slider.min = snap.slice.min; slider.max = snap.slice.max;
  if (!sliderDragging) slider.value = snap.s;
  slider.disabled = $('s-up').disabled = $('s-down').disabled = !snap.canSlice;
  $('move-hint').hidden = !snap.canMove;
  setText('timer', `${snap.time.toFixed(1)} 秒`);
  setHTML('stars', starList(snap, true));
  const hint = $('hint');
  hint.hidden = !snap.hint || snap.phase !== 'playing';
  if (snap.hint) setText('hint', snap.hint);
  updateVault(snap);
  updateMirror(snap);
  updateAscend(snap);
  updateLesson(snap);
  return snap;
}

function updateAscend(snap) {
  const a = snap.ascend, volume = a?.stage === 'volume', transition = a?.stage === 'transition';
  $('play-layout').classList.toggle('ascending', !!a);
  $('ascend-panel').hidden = !a;
  $('dimension-presets').hidden = !volume;
  setText('slice-axis', volume ? 'W' : 'S');
  setText('slice-description', volume ? '空间切片' : '你所在的高度');
  $('s-down').setAttribute('aria-label', volume ? '减小 W' : '降低 S');
  $('s-up').setAttribute('aria-label', volume ? '增大 W' : '升高 S');
  $('scene').setAttribute('aria-label', volume ? '三维房间的 W 截面：地板、四面墙、屋顶和出口' : '平面世界与侧视图');
  if (!a) return;
  if (volume) setText('intro', '现在你在 XYZ 空间里。换 W 找到通往门外的路，再回到出口所在的切片。');
  setText('dimension-heading', volume ? '这次，走出三维房间' : transition ? '从平面国，升高一维' : '再走出一次房间');
  setText('dimension-story', volume ? '墙和屋顶只在部分 W 中存在。改变 W 不改变你的 XYZ；你正绕过三维空间中的封闭房间。' : transition ? '你刚才对平面生物做的事，四维生物也能对你做。Z 高度变成 W 切片，二维平面变成三维空间。' : '先复习刚才的发现：调 S 离开围墙，再回到旗子所在的高度。');
  $('dimension-meter').hidden = !transition;
  $('dimension-progress').value = Math.round(a.progress * 100);
  setText('dimension-position', volume ? `X ${a.position.x.toFixed(2)} · Y ${a.position.y.toFixed(2)} · Z ${a.position.z.toFixed(2)} ｜ W ${snap.s.toFixed(2)}` : 'S 是平面在 Z 方向的高度');
  setText('dimension-status', snap.phase === 'complete' ? '已完成两次逃出房间。可以进入正式庭院了。' : transition ? '正在升维，稍后恢复移动。' : !volume ? '先找到门外的旗。' : a.blocked ? '这个 W 的墙挡住了你。先在空旷切片中移开，再切回去。' : a.leftRoom ? snap.s > .32 ? '已走到房间外。出口出现在 W ≤ 0.32，回到那一片空间。' : '出口已经出现，靠近金色门即可完成。' : '试试另一片 W：墙和屋顶还在吗？WASD 沿地板移动。');
  $('dimension-flat-step').classList.toggle('done', a.flatComplete);
  $('dimension-volume-step').classList.toggle('done', snap.phase === 'complete');
  for (const button of $('dimension-presets').children) { button.disabled = !snap.canSlice; button.setAttribute('aria-pressed', String(Math.abs(snap.s - Number(button.dataset.dimensionW)) < .005)); }
}

function updateMirror(snap) {
  const m = snap.mirror;
  $('play-layout').classList.toggle('mirroring', !!m);
  $('mirror-panel').hidden = !m;
  document.querySelector('.slice-row').hidden = !!m;
  if (!m) return;
  const predicting = !!m.prediction && m.prediction.correct === null;
  for (const id of ['key-comparison', 'mirror-help', 'mirror-actions']) $(id).hidden = predicting;
  $('flip-question').hidden = $('flip-options').hidden = !predicting;
  $('flip-meter').hidden = !m.motion;
  if (m.motion) {
    const angle = Math.round(m.motion.progress * 180);
    $('flip-progress').value = angle;
    $('flip-progress').setAttribute('aria-valuenow', String(angle));
    setText('flip-angle', `${angle}° / 180°`);
  }
  setHTML('key-card', keyThumbnail(keyPoints(m.chirality, m.turns), snap.carrying ? '手中的钥匙' : '待拾取的钥匙'));
  setHTML('lock-card', keyThumbnail(keyPoints(-1, 0), '目标锁孔'));
  $('rotate-key').disabled = !m.canRotate;
  $('flip-key').disabled = !m.canFlip;
  let status = !snap.carrying ? '先走到左边的 L 形钥匙旁，把它拿起来。'
    : m.lockReason === 'chirality' ? '锁孔对不上：平面内旋转不会改变手性。带钥匙回翻转台试试。'
      : m.lockReason === 'orientation' ? '已经是镜像钥匙，方向还没对齐。按 R 旋转，比较上面两张图。'
        : m.onPad && m.chirality === 1 ? '你站在翻转台上。按 F，借第三维把钥匙翻过来。'
          : m.chirality === -1 ? '钥匙已成为镜像。比较两张图，用 R 调整方向，再靠近右侧锁孔。'
            : '钥匙已拿到。可先去右侧试锁，或带到翻转台。R 可以在平面内旋转。';
  if (m.prediction?.choice === null) status = '先选一张预测图。选择期间暂停移动，选错也能继续。';
  if (m.motion) status = '正在绕 X 轴翻转。左边显示投影变窄再展开，右边显示离开平面的轨迹。';
  if (snap.phase === 'complete') status = '镜像与方向都匹配，锁已经打开。';
  setText('mirror-status', status);
  $('flip-prediction').hidden = !m.prediction;
  if (m.prediction) {
    setHTML('flip-options', m.prediction.options.map((option, i) => `<button data-flip-choice="${i}" aria-pressed="${m.prediction.choice === i}" ${m.prediction.choice !== null ? 'disabled' : ''}>${keyThumbnail(option.points)}<span>${escapeHTML(option.label)}</span></button>`).join(''));
    const feedback = m.prediction.correct === null ? m.motion ? '预测已记录，翻完后看结果。' : '首次选择决定预测星；不用担心选错。'
      : `${m.prediction.correct ? '预测正确。' : '这次预测不同，仍可继续通关。'} 你选了 ${m.prediction.options[m.prediction.choice].label}。绕 X 轴翻转后，X 不变、Y 反向，得到上下镜像；平面内转半圈会同时改变 X 和 Y。`;
    setText('flip-feedback', feedback);
  }
}

function updateVault(snap) {
  $('play-layout').classList.toggle('vault', snap.abilities.peek);
  $('vault-controls').hidden = !snap.abilities.peek;
  if (!snap.abilities.peek) return;
  const peek = $('peek');
  peek.disabled = !snap.canSlice;
  peek.setAttribute('aria-pressed', String(snap.peek));
  peek.classList.toggle('active', snap.peek);
  const ghostKey = snap.ghosts.find(section => section.role === 'item');
  let status = snap.carrying ? '钥匙已拿到。先升高离开盒子，带到右侧出口，再降到门所在的高度。'
    : snap.doorLocked ? '门还锁着：需要先拿到盒内的钥匙。'
      : ghostKey ? `下方发现钥匙，位于 S=${ghostKey.z[0]}–${ghostKey.z[1]}。走到它上方，再降低高度去拿。`
        : '钥匙尚未拿到。虚影只供观察；碰到当前切片里的钥匙才会拾取。';
  if (snap.returning > 0) status = '已回到入口，稍候即可继续。';
  setText('vault-status', status);
  $('return-notice').hidden = !snap.alert;
  if (snap.alert) setText('return-notice', `${snap.alert.label}发现了你，已回到入口。${snap.alert.returnedKey ? '钥匙已放回盒内。' : ''}本次“没有被发现”星已失去，仍可继续通关。`);
}

function updateLesson(snap) {
  $('play-layout').classList.toggle('guessing', !!snap.round);
  $('finish-observation').hidden = !snap.observationReady;
  $('observation-status').hidden = !snap.quiz || snap.phase !== 'playing';
  if (snap.quiz) {
    const sides = snap.goals.find(goal => goal.id === 'r15')?.sides.length || 0;
    setText('observation-status', `${snap.goals.filter(goal => goal.done).length}/3 个圆环已点亮 · 半径 1.5：已找到 ${sides}/2 个高度${snap.observationReady ? '。可继续探索，准备好再回答问题。' : ''}`);
  }
  const r = snap.round;
  $('lesson-panel').hidden = !r || snap.phase !== 'playing';
  if (!r) return;
  setText('round-heading', `第 ${r.index + 1} / ${r.count} 轮 · ${r.title}`);
  setText('round-prompt', r.prompt);
  const stages = { observe: '先观察：依次拖到标记高度，停留约 0.25 秒。', answer: '三处都看过了。选择你的判断。',
    predict: '先预测：选择一张卡片，再解锁 S 亲手验证。', verify: '再验证：依次拖到标记高度，停留约 0.25 秒。', review: '验证完成。你可以继续拖 S 比较，也可以进入下一轮。' };
  setText('round-instruction', stages[r.stage]);
  $('known-shape').hidden = !r.knownShape;
  if (r.knownShape) setHTML('known-shape', `${illustration(r.icon)}<span>${escapeHTML(r.knownShape)}</span>`);
  const mayAnswer = r.stage === 'answer' || r.stage === 'predict';
  setHTML('round-options', r.options.map((option, i) => `<button data-round-choice="${i}" aria-pressed="${r.choice === i}" ${mayAnswer ? '' : 'disabled'}>${illustration(option.icon)}<span>${escapeHTML(option.label)}</span></button>`).join(''));
  $('sample-strip').hidden = r.stage === 'predict';
  setHTML('sample-strip', r.targets.map((s, i) => {
    const sample = r.samples[i], active = i === r.samples.length && ['observe', 'verify'].includes(r.stage);
    return `<li class="${sample ? 'observed' : active ? 'current' : ''}">${sample ? sectionThumbnail(sample.shape) : '<span class="empty-section" aria-hidden="true">?</span>'}<span>S ${s.toFixed(2)}<small>${sample ? escapeHTML(sectionDescription(sample.shape)) : active ? '在此停留' : '等待观察'}</small></span></li>`;
  }).join(''));
  $('round-feedback').hidden = r.choice === null;
  setText('round-feedback', r.choice === null ? '' : r.stage === 'review' ? r.explain : r.correct ? '猜对了。再亲手切一遍，看看为什么。' : '这次没有猜中。现在拖 S 看看，验证后仍能继续。');
  $('round-next').hidden = r.stage !== 'review';
  setText('round-next', r.index + 1 === r.count ? '完成本关 ↗' : '下一轮 ↗');
}

function consumeEvents() {
  const events = model.drainEvents();
  if (!events.length) return;
  scene.setState(model.snapshot());
  scene.pushEvents(events);
  audio.handle(events);
  for (const event of events) {
    if (event.type === 'blocked') announce('这个高度有东西挡住了你。');
    if (event.type === 'goal_done') announce('目标完成。');
    if (event.type === 'hint') announce(event.text);
    if (event.type === 'observation') announce(`已记录 S ${event.s.toFixed(2)} 的截面。`);
    if (event.type === 'round_verified') announce('这一轮验证完成。');
    if (event.type === 'pickup') announce('拿到钥匙了。');
    if (event.type === 'unlock') announce('钥匙打开了出口。');
    if (event.type === 'guard_alert') { clearInputs(true); announce(`被守卫发现，已回到入口。${event.returnedKey ? '钥匙已放回盒内。' : ''}可以继续尝试。`); }
    if (event.type === 'flip_predict' || event.type === 'flip_start') { clearInputs(true); announce(event.type === 'flip_predict' ? '请先选择翻转后的钥匙。' : '钥匙正在离开平面翻转。'); }
    if (event.type === 'flip_end') announce('翻转完成，钥匙已回到平面。');
    if (event.type === 'dimension_start' || event.type === 'dimension_ready') { clearInputs(true); lastS = model.s; announce(event.type === 'dimension_start' ? '平面房间已完成，正在升维。' : '现在换 W 探索三维房间。'); }
    if (event.type === 'dimension_escape') announce('已绕到三维房间外。回到出口的 W 切片。');
    if (event.type === 'lock_reject') announce(event.reason === 'chirality' ? '钥匙与锁孔的手性不同。' : '钥匙的方向还没对齐。');
  }
}
function action(fn) { unlockAudio(); fn(); consumeEvents(); updateUI(); }
function loadLevel(index) {
  if (!unlocked(index) && index !== model.index) return;
  dialogs.forEach(id => $(id).open && $(id).close());
  lastPhase = ''; resultTimer = 0;
  clearInputs();
  action(() => model.load(index));
  const url = new URL(location.href); url.searchParams.set('level', model.level.id); history.replaceState(null, '', url);
}

function applyInput() {
  let x = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
  let y = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0);
  if (pointer && !x && !y) {
    const p = model.player, dx = pointer.x - p.x, dy = pointer.y - p.y, distance = Math.hypot(dx, dy);
    if (distance > .15) { const speed = Math.min(1, distance / .8); x = dx / distance * speed; y = dy / distance * speed; }
  }
  model.setMove(x, y);
  const slice = (keys.has('e') || $('s-up').classList.contains('active') ? 1 : 0) - (keys.has('q') || $('s-down').classList.contains('active') ? 1 : 0);
  model.setSliceVelocity(slice);
  model.setPeek(peekSources.size > 0);
}

function clearInputs(suppressHeld = false) {
  if (suppressHeld) {
    keys.forEach(key => suppressedKeys.add(key));
    if (peekSources.has('space')) suppressedKeys.add(' ');
    if (peekSources.has('enter')) suppressedKeys.add('enter');
  }
  keys.clear(); peekSources.clear(); pointer = null; sliderDragging = false;
  $('s-up').classList.remove('active'); $('s-down').classList.remove('active');
  model.setMove(0, 0); model.setSliceVelocity(0); model.setPeek(false);
}

$('start').addEventListener('click', () => { $('intro-dialog').close(); action(() => model.start()); });
$('intro-dialog').addEventListener('cancel', event => { event.preventDefault(); $('start').click(); });
for (const id of ['quiz-dialog', 'result-dialog']) $(id).addEventListener('cancel', event => event.preventDefault());
$('quiz-options').addEventListener('click', event => {
  const button = event.target.closest('[data-choice]');
  if (!button) return;
  $('quiz-dialog').close();
  action(() => model.answerQuiz(Number(button.dataset.choice)));
});
$('finish-observation').addEventListener('click', () => action(() => model.finishObservation()));
$('round-options').addEventListener('click', event => {
  const button = event.target.closest('[data-round-choice]');
  if (button) action(() => model.answerRound(Number(button.dataset.roundChoice)));
});
$('round-next').addEventListener('click', () => action(() => model.nextRound()));
$('rotate-key').addEventListener('click', () => action(() => model.rotateKey()));
$('flip-key').addEventListener('click', () => action(() => model.requestFlip()));
$('dimension-presets').addEventListener('click', event => { const button = event.target.closest('[data-dimension-w]'); if (button) action(() => { model.setSlice(Number(button.dataset.dimensionW)); model.endSliceGesture(); }); });
$('flip-options').addEventListener('click', event => {
  const button = event.target.closest('[data-flip-choice]');
  if (button) action(() => model.answerFlipPrediction(Number(button.dataset.flipChoice)));
});
$('retry').addEventListener('click', () => loadLevel(model.index));
$('next').addEventListener('click', () => { $('result-dialog').close(); loadLevel(model.index + 1); });
$('restart').addEventListener('click', () => loadLevel(model.index));
$('levels').addEventListener('click', event => { const button = event.target.closest('[data-level]'); if (button) loadLevel(Number(button.dataset.level)); });
$('sound').addEventListener('click', () => { soundEnabled = !soundEnabled; audio.setEnabled(soundEnabled); unlockAudio(); savePreference('wslice-sound', soundEnabled ? 'on' : 'off'); updateSoundButton(); });

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
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) peekButton.addEventListener(type, () => {
  peekSources.delete('pointer'); action(() => model.setPeek(peekSources.size > 0));
});
peekButton.addEventListener('keydown', event => {
  if (event.key !== 'Enter') return;
  if (suppressedKeys.has('enter')) { event.preventDefault(); return; }
  event.preventDefault(); peekSources.add('enter'); action(() => model.setPeek(true));
});
peekButton.addEventListener('keyup', event => {
  if (event.key !== 'Enter') return;
  event.preventDefault(); peekSources.delete('enter'); action(() => model.setPeek(peekSources.size > 0));
});
peekButton.addEventListener('blur', () => {
  peekSources.delete('enter'); peekSources.delete('pointer'); action(() => model.setPeek(peekSources.size > 0));
});

const canvas = $('scene');
const pointAt = event => scene.screenToWorld(event.clientX, event.clientY);
canvas.addEventListener('pointerdown', event => { unlockAudio(); pointer = pointAt(event); if (pointer) canvas.setPointerCapture?.(event.pointerId); });
canvas.addEventListener('pointermove', event => { if (pointer) pointer = pointAt(event) || pointer; });
for (const type of ['pointerup', 'pointercancel']) canvas.addEventListener(type, () => { pointer = null; });

const MOVE_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'q', 'e']);
document.addEventListener('keydown', event => {
  const key = event.key.toLowerCase();
  if (suppressedKeys.has(key)) { event.preventDefault(); return; }
  if ((key === 'f' || key === 'r') && model.level.abilities?.flip && !isModal() && !event.metaKey && !event.ctrlKey) {
    event.preventDefault();
    if (!event.repeat) action(() => key === 'f' ? model.requestFlip() : model.rotateKey());
    return;
  }
  if (key === ' ' && model.level.abilities?.peek && !isModal() && !event.metaKey && !event.ctrlKey) {
    event.preventDefault(); peekSources.add('space'); action(() => model.setPeek(true)); return;
  }
  if (isModal() || !MOVE_KEYS.has(key) || event.metaKey || event.ctrlKey) return;
  if (key.startsWith('arrow') && event.target === slider) return;
  event.preventDefault();
  unlockAudio();
  keys.add(key);
});
document.addEventListener('keyup', event => {
  suppressedKeys.delete(event.key.toLowerCase());
  keys.delete(event.key.toLowerCase());
  if (event.key === ' ') { peekSources.delete('space'); action(() => model.setPeek(peekSources.size > 0)); }
});
window.addEventListener('blur', () => { suppressedKeys.clear(); clearInputs(); consumeEvents(); updateUI(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { suppressedKeys.clear(); clearInputs(); consumeEvents(); updateUI(); } });

function frame(now) {
  const dt = Math.min(.1, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  if (!isModal() && !document.hidden) { applyInput(); model.update(dt); }
  else { clearInputs(); }
  consumeEvents();
  const snap = updateUI();
  if (Math.abs(snap.s - lastS) > 1e-6) { audio.slice(snap.s, snap.slice.max); lastS = snap.s; }
  if (resultTimer > 0) { resultTimer -= dt; if (resultTimer <= 0 && snap.phase === 'complete') showResult(snap); }
  scene.setState(snap);
  scene.render(document.hidden ? 0 : dt);
  requestAnimationFrame(frame);
}
updateSoundButton();
consumeEvents();
updateUI();
requestAnimationFrame(frame);
