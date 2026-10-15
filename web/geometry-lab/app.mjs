import { SINGLE, TWINS, LEVELS, PREDICTIONS, clampDial, dialToW, sliceAtW, sliceAtDial, corridorSections, tokenInsideSection, moveCorridorToken } from './geometry.mjs';
import { PredictionSession, TRIALS } from './challenge.mjs';
import { SliceRenderer } from './renderer.mjs';
import { sfxInit, sfx } from './sfx.mjs';

const $ = (id) => document.getElementById(id);
const choiceButtons = [...document.querySelectorAll('[data-choice]')];
const specimenButtons = [...document.querySelectorAll('[data-specimen]')];
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let bodies = [SINGLE];
let specimen = 'single';
let mode = 'explore';
let current = 0.38;
let target = current;
let sweep = false;
let sweepDirection = 1;
let frame = 0;
let previousTime = 0;
let revealAnimation = null;
let session = null;
let choice = null;
let renderer = null;
let rendererReady = false;
let corridor = null;
const pressed = new Set();
const MOVE_DIRS = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
  W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0],
};
const corridorActive = () => mode === 'explore' && !!LEVELS[specimen] && corridor !== null;
const corridorSectionsNow = () => corridorSections(dialToW(current), corridor.level);
let prevVisible = new Set();

// Show each specimen's W extent as a band under the slider; levels and the
// challenge hide it — the range would be a solution oracle there.
function renderWBands() {
  const wrap = $('w-bands');
  const show = mode === 'explore' && (specimen === 'single' || specimen === 'twins');
  wrap.hidden = !show;
  wrap.replaceChildren(...(show ? bodies.map((body) => {
    const band = document.createElement('span');
    band.className = `w-band${body.alt ? ' alt' : ''}`;
    const a = (body.center[3] - body.radius) / 4 + 0.5;
    const b = (body.center[3] + body.radius) / 4 + 0.5;
    band.style.left = `${a * 100}%`;
    band.style.width = `${(b - a) * 100}%`;
    return band;
  }) : []));
}

function renderAvailability(failed) {
  rendererReady = !failed;
  $('render-error').hidden = !failed;
  $('start-challenge').disabled = failed;
  $('challenge-mode').disabled = failed;
  $('sweep').disabled = failed || mode !== 'explore';
  if (failed) {
    stopSweep();
    if (mode === 'challenge') explore();
  }
}

try {
  renderer = new SliceRenderer($('scene'), renderAvailability);
  renderer.directionHandler = (key) => {
    if (!corridorActive() || !MOVE_DIRS[key]) return false;
    pressed.add(key);
    requestFrame();
    return true;
  };
  renderAvailability(false);
} catch (error) {
  console.error('Slice rendering unavailable:', error);
  renderAvailability(true);
}

function updateSlider() {
  $('w-slider').value = String(current);
  $('w-slider').style.setProperty('--progress', `${current * 100}%`);
  $('w-slider').setAttribute('aria-valuetext', `第四维轴的 ${Math.round(current * 100)}% 位置`);
}

function renderSlice() {
  const inCorridor = corridorActive();
  const sections = inCorridor ? corridorSectionsNow() : bodies.map((body) => sliceAtDial(body, current));
  renderer?.setSections(sections);
  renderer?.setMarkers(inCorridor ? {
    token: corridor.pos,
    tokenRadius: corridor.level.tokenRadius,
    flash: corridor.flash,
    goal: corridor.level.goal,
    won: corridor.won,
    start: corridor.level.start,
    bounds: corridor.level.bounds,
  } : null);
  const visibleIds = new Set(sections.filter((s) => s.kind !== 'empty').map((s) => s.id));
  sections.forEach((s) => {
    if (s.kind !== 'empty' && !prevVisible.has(s.id)) sfx.appear();
    if (s.kind === 'empty' && prevVisible.has(s.id)) sfx.vanish();
  });
  prevVisible = visibleIds;
  const empty = sections.every((section) => section.kind === 'empty');
  const tangent = empty && sections.some((section) => section.kind === 'point');
  $('empty-notice').hidden = !empty || !rendererReady || inCorridor;
  $('empty-title').textContent = tangent ? '这一片，刚好与超球相切。' : '这一片，没有碰到物体。';
  $('empty-caption').textContent = tangent ? '交集缩小为一个点' : (mode === 'explore' ? '试着沿 W 继续移动' : '先做预测，再查看目标切片');
  updateSlider();
  const visible = sections.filter((section) => section.radius > 0).length;
  $('scene').setAttribute('aria-label', inCorridor
    ? '关卡模式：方向键或 WASD 移动光点到出口，W 滑块改变墙的截面。'
    : `${visible ? `当前有 ${visible} 个球体截面` : '当前切片没有球体截面'}。拖动旋转视角，滚轮缩放；聚焦画面后可用方向键旋转、加减键缩放。`);
  renderWBands();
}

function requestFrame() {
  if (!frame && !document.hidden) frame = requestAnimationFrame(tick);
}

function moveCorridor(delta) {
  let dx = 0;
  let dz = 0;
  pressed.forEach((key) => {
    const dir = MOVE_DIRS[key];
    if (dir) { dx += dir[0]; dz += dir[1]; }
  });
  const length = Math.hypot(dx, dz);
  if (length) {
    const step = (1.55 * delta) / length;
    const move = moveCorridorToken(corridorSectionsNow(), corridor.pos, dx * step, dz * step, corridor.level);
    const travelled = Math.hypot(move.x - corridor.pos[0], move.z - corridor.pos[1]);
    if (travelled && !corridor.startedAt) corridor.startedAt = performance.now();
    corridor.distance += travelled;
    corridor.pos = [move.x, move.z];
    const jammed = travelled === 0;
    if (jammed && !corridor.blockedLast) {
      corridor.blocked += 1;
      corridor.flash = 1;
      sfx.blocked();
      corridorTip('被当前截面挡住了', true);
    }
    corridor.blockedLast = jammed;
    checkCorridorWin();
  } else {
    corridor.blockedLast = false;
  }
  if (corridor.flash > 0) corridor.flash = Math.max(0, corridor.flash - delta * 2.4);
  updateCorridorHud();
}

function tick(time) {
  frame = 0;
  const delta = previousTime ? Math.min((time - previousTime) / 1000, 0.05) : 1 / 60;
  previousTime = time;
  if (revealAnimation) {
    const progress = reducedMotion.matches ? 1 : Math.min(1, (time - revealAnimation.started) / 1100);
    const ease = progress * progress * (3 - 2 * progress);
    current = revealAnimation.from + (revealAnimation.to - revealAnimation.from) * ease;
    target = current;
    if (progress === 1) {
      current = revealAnimation.to;
      revealAnimation = null;
      finishReveal();
    }
  } else if (sweep) {
    target = clampDial(target + sweepDirection * delta * 0.13);
    if (target === 0 || target === 1) sweepDirection *= -1;
    current = target;
  } else if (reducedMotion.matches || Math.abs(current - target) < 0.0001) {
    current = target;
  } else {
    current += (target - current) * (1 - Math.exp(-12 * delta));
  }
  if (corridorActive()) moveCorridor(delta);
  renderSlice();
  if (sweep || revealAnimation || Math.abs(current - target) > 0
      || (corridorActive() && (pressed.size || corridor.flash > 0))) requestFrame();
  else previousTime = 0;
}

function setDial(value, immediate = false) {
  target = clampDial(value);
  if (immediate) { current = target; renderSlice(); }
  else requestFrame();
}

function stopSweep() {
  sweep = false;
  $('sweep').setAttribute('aria-pressed', 'false');
  $('sweep-icon').textContent = '▷';
  $('sweep-label').textContent = '自动往返';
}

function updateMode() {
  const exploring = mode === 'explore';
  $('explore-mode').classList.toggle('active', exploring);
  $('explore-mode').setAttribute('aria-pressed', String(exploring));
  $('challenge-mode').classList.toggle('active', !exploring);
  $('challenge-mode').setAttribute('aria-pressed', String(!exploring));
  $('explore-panel').hidden = !exploring;
  $('challenge-panel').hidden = mode !== 'challenge';
  $('summary-panel').hidden = mode !== 'summary';
  const field = !!LEVELS[specimen];
  $('w-slider').disabled = !exploring;
  $('sweep').disabled = !exploring || !rendererReady || field;
  $('reset-slice').disabled = !exploring;
  $('geometry-note').hidden = !exploring;
  $('target-tick').hidden = mode !== 'challenge';
  $('control-description').textContent = field && exploring ? (specimen === 'room' ? '让整圈墙变薄' : '改变两堵墙的截面') : (exploring ? '移动截面' : '先预测，再移动');
  $('slider-hint').textContent = field && exploring ? (specimen === 'room' ? '出口在三维里不存在——滑动 W' : '滑块移动整片空间，墙会变大或消失') : (exploring ? '也可以使用 ← → 键微调' : (mode === 'summary' ? '本轮预测完成' : '标记是这次要去的位置'));
  $('corridor-hud').hidden = !(exploring && field);
  $('dpad').hidden = !(exploring && field);
  if (!exploring) $('corridor-done').hidden = true;
}

const SPECIMEN_META = {
  single: ['01 — 单个超球', '物体还在，截面变了。', '缓慢拖动 W，找找截面最大的位置。再往前走，它会一直变大吗？'],
  twins: ['02 — 错位双球', '同一片里，各有变化。', '两枚超球在第四维错开了一点。沿 W 移动，观察它们何时出现、何时一起留在这一片里。'],
  corridor: ['03 — 截面通道', '墙也是四维物体。', '把光点带到右侧出口。两堵墙待在不同的 W 上——这一片走到哪里，路就停在哪里。'],
  room: ['04 — 不可能的密室', '这间屋子没有门。', '光点出生在房间正中，出口在墙外。三维里怎么走都出不去——试试 W。'],
};

const TIP_DEFAULTS = {
  corridor: '方向键 / WASD 移动光点，W 滑块改变墙',
  room: '方向键 / WASD 移动光点，W 滑块让墙变薄',
};

let tipTimer = 0;
function corridorTip(text, warn = false) {
  const tip = $('corridor-tip');
  tip.textContent = text;
  tip.classList.toggle('warn', warn);
  clearTimeout(tipTimer);
  tipTimer = setTimeout(() => {
    tip.textContent = TIP_DEFAULTS[specimen] ?? TIP_DEFAULTS.corridor;
    tip.classList.remove('warn');
  }, 1800);
}

function updateCorridorHud() {
  if (!corridor) return;
  const elapsed = corridor.startedAt
    ? Math.round(((corridor.won ? corridor.finishedAt : performance.now()) - corridor.startedAt) / 1000)
    : 0;
  $('corridor-stats').textContent = `移动 ${corridor.distance.toFixed(1)} m · 用时 ${elapsed} s · 被挡 ${corridor.blocked} · W 调整 ${corridor.wMoves}`;
}

function resetCorridor() {
  corridor = {
    level: LEVELS[specimen],
    levelId: specimen,
    pos: [...LEVELS[specimen].start],
    distance: 0,
    blocked: 0,
    wMoves: 0,
    startedAt: 0,
    finishedAt: 0,
    won: false,
    flash: 0,
    blockedLast: false,
    wMin: 0.5,
    wMax: 0.5,
  };
  $('corridor-done').hidden = true;
  $('corridor-tip').textContent = TIP_DEFAULTS[specimen] ?? TIP_DEFAULTS.corridor;
  updateCorridorHud();
}

function checkCorridorWin() {
  if (corridor.won) return;
  const [gx, gz] = corridor.level.goal;
  if (Math.hypot(corridor.pos[0] - gx, corridor.pos[1] - gz) >= 0.3) return;
  corridor.won = true;
  corridor.finishedAt = performance.now();
  pressed.clear();
  sfx.win();
  const seconds = corridor.startedAt ? Math.round((corridor.finishedAt - corridor.startedAt) / 1000) : 0;
  $('corridor-done-title').textContent = corridor.levelId === 'room' ? '你从一间没有门的屋子走出来了。' : '通路由这一片几何决定。';
  $('corridor-summary').textContent = `移动 ${corridor.distance.toFixed(1)} m · 用时 ${seconds} s · 被挡 ${corridor.blocked} 次 · W 调整 ${corridor.wMoves} 次${corridor.levelId === 'room' ? '。把 W 滑回去，看看墙还在不在。' : ''}`;
  $('corridor-done').hidden = false;
  updateCorridorHud();
}

// The token may never end up inside a section. Check the worst-case radius of
// every wall over the whole W interval the dial is about to cross.
function corridorEngulfs(fromDial, toDial) {
  if (!corridor) return false;
  const low = dialToW(Math.min(fromDial, toDial));
  const high = dialToW(Math.max(fromDial, toDial));
  return corridor.level.bodies.some((body) => {
    const w = Math.max(low, Math.min(high, body.center[3]));
    return tokenInsideSection([sliceAtW(body, w)], corridor.pos[0], corridor.pos[1], corridor.level);
  });
}

function trySetDial(value, immediate = false) {
  if (corridor && corridorEngulfs(current, value)) {
    corridor.flash = 1;
    sfx.refused();
    corridorTip('这个 W 会把光点包进墙里，先挪开光点', true);
    renderSlice();
    requestFrame();
    return false;
  }
  if (corridor) {
    corridor.wMin = Math.min(corridor.wMin, clampDial(value));
    corridor.wMax = Math.max(corridor.wMax, clampDial(value));
  }
  setDial(value, immediate);
  return true;
}

function selectSpecimen(value) {
  specimen = value;
  pressed.clear();
  if (LEVELS[value]) resetCorridor();
  else corridor = null;
  $('corridor-done').hidden = true;
  bodies = value === 'twins' ? TWINS : [SINGLE];
  specimenButtons.forEach((button) => {
    const selected = button.dataset.specimen === value;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  const [caption, title, copy] = SPECIMEN_META[value];
  $('object-caption').textContent = caption;
  $('observation-title').textContent = title;
  $('observation-copy').textContent = copy;
  updateMode();
  renderSlice();
}

function explore() {
  mode = 'explore';
  revealAnimation = null;
  stopSweep();
  updateMode();
  selectSpecimen(specimen);
  setDial(LEVELS[specimen] ? 0.5 : 0.38, true);
}

function startChallenge() {
  if (!rendererReady) return;
  stopSweep();
  revealAnimation = null;
  mode = 'challenge';
  session = new PredictionSession();
  updateMode();
  showTrial();
}

function updateProgress() {
  $('progress-rail').replaceChildren(...TRIALS.map((_, index) => {
    const bar = document.createElement('span');
    if (session.records[index]) bar.className = session.records[index].correct ? 'correct' : 'incorrect';
    else if (index === session.index) bar.className = 'current';
    return bar;
  }));
}

function showTrial() {
  const trial = session.trial;
  bodies = [trial.body];
  choice = null;
  $('challenge-chapter').textContent = trial.chapter;
  $('challenge-count').textContent = `${String(session.index + 1).padStart(2, '0')} / 06`;
  $('challenge-question').textContent = trial.prompt;
  $('challenge-instruction').textContent = '先选一个判断，再移动到滑轨上的目标位置。';
  $('object-caption').textContent = session.index === 5 ? '03 — 偏心超球' : '01 — 单个超球';
  $('challenge-feedback').hidden = true;
  $('reveal').hidden = false;
  $('reveal').disabled = true;
  $('next-trial').hidden = true;
  $('target-tick').style.left = `calc(8px + (100% - 16px) * ${trial.to})`;
  $('target-tick').hidden = false;
  choiceButtons.forEach((button) => {
    button.disabled = false;
    button.setAttribute('aria-pressed', 'false');
    button.classList.remove('answer');
  });
  updateProgress();
  setDial(trial.from, true);
}

const explanations = {
  appear: '这一片进入了超球，球体截面出现了。',
  grow: '这一片更接近超球的 W 中心，截面变大了。',
  shrink: '这一片离超球的 W 中心更远，截面变小了。',
  disappear: '这一片离开了超球，没有留下球体截面。',
  same: '两个位置到 W 中心的距离相同，所以终点和起点一样大。途中大小仍会变化。',
};

function finishReveal() {
  const result = session.records.at(-1);
  $('challenge-feedback').hidden = false;
  $('challenge-feedback').classList.toggle('incorrect', !result.correct);
  $('challenge-feedback').textContent = `${result.correct ? '预测正确。' : `实际是「${PREDICTIONS[result.answer]}」。`}${explanations[result.answer]}`;
  $('challenge-instruction').textContent = '观察起点与终点的区别，再试下一片。';
  $('reveal').hidden = true;
  $('next-trial').hidden = false;
  $('next-trial').innerHTML = session.index === TRIALS.length - 1 ? '查看本次记录 <span>→</span>' : '下一片 <span>→</span>';
  choiceButtons.forEach((button) => button.classList.toggle('answer', button.dataset.choice === result.answer));
  updateProgress();
}

$('w-slider').addEventListener('input', (event) => {
  if (mode !== 'explore') return;
  stopSweep();
  if (!trySetDial(Number(event.target.value))) {
    event.target.value = String(current);
    updateSlider();
  }
});
$('w-slider').addEventListener('change', () => {
  if (corridor) corridor.wMoves += 1;
});
$('sweep').addEventListener('click', () => {
  if (sweep) { stopSweep(); return; }
  if (mode !== 'explore' || !rendererReady) return;
  sweep = true;
  target = current;
  sweepDirection = current >= 1 ? -1 : 1;
  $('sweep').setAttribute('aria-pressed', 'true');
  $('sweep-icon').textContent = 'Ⅱ';
  $('sweep-label').textContent = '暂停';
  requestFrame();
});
$('reset-slice').addEventListener('click', () => { stopSweep(); trySetDial(corridor ? 0.5 : 0.38); });
$('reset-view').addEventListener('click', () => renderer?.resetView());
specimenButtons.forEach((button) => button.addEventListener('click', () => { stopSweep(); selectSpecimen(button.dataset.specimen); setDial(LEVELS[specimen] ? 0.5 : 0.38, true); }));
document.querySelectorAll('#dpad button').forEach((button) => {
  const dir = button.dataset.dir;
  button.addEventListener('pointerdown', (event) => {
    if (!corridorActive()) return;
    event.preventDefault();
    try { button.setPointerCapture(event.pointerId); } catch { /* synthetic or stale pointer */ }
    pressed.add(dir);
    requestFrame();
  });
  const release = () => pressed.delete(dir);
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', release);
});
$('corridor-retry').addEventListener('click', () => { resetCorridor(); setDial(0.5, true); });
$('corridor-continue').addEventListener('click', () => { $('corridor-done').hidden = true; });
$('corridor-save').addEventListener('click', () => {
  if (!corridor) return;
  const result = {
    schemaVersion: 1,
    experiment: 'four-d-geometry-lab',
    stage: `browser-${corridor.levelId}-run`,
    completed: corridor.won,
    distance: Number(corridor.distance.toFixed(3)),
    blocked: corridor.blocked,
    wAdjusts: corridor.wMoves,
    wRange: [Number(corridor.wMin.toFixed(3)), Number(corridor.wMax.toFixed(3))],
    seconds: corridor.startedAt && corridor.finishedAt ? Math.round((corridor.finishedAt - corridor.startedAt) / 1000) : 0,
    bodies: corridor.level.bodies.map((body) => ({ id: body.id, center: [...body.center], radius: body.radius })),
    exportedAt: new Date().toISOString(),
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'w-slice-corridor.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
['challenge-mode', 'start-challenge', 'retry-challenge'].forEach((id) => $(id).addEventListener('click', startChallenge));
['explore-mode', 'exit-challenge', 'summary-explore'].forEach((id) => $(id).addEventListener('click', explore));
choiceButtons.forEach((button) => button.addEventListener('click', () => {
  if (mode !== 'challenge' || session.state !== 'predict' || revealAnimation) return;
  choice = button.dataset.choice;
  choiceButtons.forEach((option) => option.setAttribute('aria-pressed', String(option === button)));
  $('reveal').disabled = false;
}));
$('reveal').addEventListener('click', () => {
  if (!choice || mode !== 'challenge' || session.state !== 'predict' || revealAnimation) return;
  session.submit(choice);
  choiceButtons.forEach((button) => { button.disabled = true; });
  $('reveal').disabled = true;
  revealAnimation = { from: session.trial.from, to: session.trial.to, started: performance.now() };
  requestFrame();
});
$('next-trial').addEventListener('click', () => {
  if (revealAnimation || session.state !== 'result') return;
  if (session.next()) { showTrial(); return; }
  mode = 'summary';
  $('score').textContent = String(session.score);
  updateMode();
});
$('download-results').addEventListener('click', () => {
  if (!session || session.state !== 'complete') return;
  const result = { ...session.toJSON(), exportedAt: new Date().toISOString() };
  const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'w-slice-predictions.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
document.addEventListener('keydown', (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) || event.target.isContentEditable;
  if (!typing && corridorActive() && MOVE_DIRS[event.key]) {
    event.preventDefault();
    pressed.add(event.key);
    requestFrame();
    return;
  }
  if (typing || mode !== 'explore') return;
  if (['BUTTON', 'SUMMARY', 'CANVAS', 'A'].includes(event.target.tagName)) return;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    stopSweep();
    trySetDial(target + (event.key === 'ArrowRight' ? 0.015 : -0.015));
  }
});
document.addEventListener('keyup', (event) => pressed.delete(event.key));
['pointerdown', 'keydown'].forEach((type) => document.addEventListener(type, sfxInit, { once: true }));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopSweep();
    pressed.clear();
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    previousTime = 0;
  } else requestFrame();
});
renderSlice();
