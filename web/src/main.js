import { GameModel, RELICS } from './model.js';
import { SceneRenderer } from './scene.js';
import { GameAudio } from './audio.js';

const $ = id => document.getElementById(id);
const setHTML = (id,html) => { const el=$(id); if(el.innerHTML!==html)el.innerHTML=html; };
const icons = { prism:'◇', shadow:'◌', shell:'◈' };
const traits = { prism:'连锁开路 · 主动型', shadow:'限时捷径 · 主动型', shell:'一次容错 · 自动型' };
const newSeed = () => globalThis.crypto?.getRandomValues ? crypto.getRandomValues(new Uint32Array(1))[0] : Date.now() >>> 0;
const readPreference = (key, fallback) => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
const savePreference = (key,value) => { try { localStorage.setItem(key,String(value)); } catch { /* Private browsing can disable persistence. */ } };
const model = new GameModel(newSeed());
const audio = new GameAudio();
let soundEnabled = readPreference('wslice-sound','on') === 'on';
let best = Math.max(0, Number(readPreference('wslice-best','0')) || 0);
audio.setEnabled(soundEnabled);
let paused = false;
let lastPhase = '';
let destinationKey = '';
let lastStatus = '';
let lastFrame = performance.now();
let transient = null;
let transientTime = 0;
const dialogs = ['choice-dialog','help-dialog','pause-dialog','result-dialog','restart-dialog'];
const isModal = () => dialogs.some(id => $(id).open);
const canAct = () => !paused && !isModal() && model.snapshot().phase === 'playing';
const scene = new SceneRenderer($('scene'), { onSelect: id => { if (canAct()) action(() => model.select(id)); } });

function updateSoundButton() {
  $('sound').setAttribute('aria-pressed', String(soundEnabled));
  $('sound-label').textContent = soundEnabled ? '声音开' : '声音关';
  $('sound').setAttribute('aria-label', soundEnabled ? '关闭声音' : '开启声音');
}
function unlockAudio() { if (soundEnabled) void audio.unlock(); }
function action(fn) { unlockAudio(); fn(); consumeEvents(); updateUI(); }
function consumeEvents() {
  const events = model.drainEvents();
  if (!events.length) return;
  scene.pushEvents(events);
  audio.handle(events);
  for (const event of events) {
    let message = '';
    if (event.type === 'fail') message = event.protected ? '缓落壳接住了你，随身回响保留。' : `失稳回退，失去 ${event.value} 枚未存回响。`;
    if (event.type === 'bank') message = `已存入 ${event.value} 枚回响。`;
    if (event.type === 'unlock') message = '三座机关共鸣，庭门已打开。';
    if (event.type === 'reward' && event.risky) message = `冒险成功，收获 ${event.value} 枚回响。`;
    if (event.type === 'ability') message = event.relic === 'prism' ? '脉冲释放，外环捷径已连通。' : '影子压住踏板，外环开启 7 秒。';
    if (message) { transient = message; transientTime = 2.8; $('announcement').textContent = message; }
    if (['restart','room'].includes(event.type)) { transient = null; transientTime = 0; $('announcement').textContent = ''; }
  }
}

function showChoice(state) {
  const next = state.phase === 'interlude';
  $('choice-kicker').textContent = next ? `第 ${state.room + 1} 庭完成 · 已带回 ${state.banked} 回响` : '一次新的空间冒险';
  $('choice-title').innerHTML = next ? '下一座庭院，<br>换一种走法。' : '带上一点不同，<br>走出另一条路。';
  $('choice-intro').textContent = next ? '选择下一庭使用的遗物。已存回响和剩余回程结保留。' : '选择一件遗物。调 W 让路径显现，点击落脚点，再出发。';
  $('relic-choices').replaceChildren(...RELICS.map(relic => {
    const button = document.createElement('button');
    button.className = 'relic-choice';
    button.setAttribute('aria-label', `选择${relic.name}`);
    button.innerHTML = `<span class="relic-art" aria-hidden="true">${icons[relic.id]}</span><span class="choice-arrow" aria-hidden="true">↗</span><h3>${relic.name}</h3><p>${relic.description}</p><small>${traits[relic.id]}</small>`;
    button.addEventListener('click', () => { $('choice-dialog').close(); paused = false; action(() => model.chooseRelic(relic.id)); $('move').focus({preventScroll:true}); });
    return button;
  }));
  $('choice-dialog').showModal();
}

function showResult(state) {
  const won = state.phase === 'won';
  $('result-symbol').textContent = won ? '✧' : '◌';
  $('result-kicker').textContent = won ? 'JOURNEY COMPLETE' : 'UNTIL THE NEXT ECHO';
  $('result-title').textContent = won ? '庭院记住了你的回响。' : '这一程，先到这里。';
  $('result-description').textContent = won ? '三座庭院已经苏醒。下一次，试着把更多冒险串在一起。' : '回程结已用完，之前存下的回响仍计入本次成绩。';
  $('result-score').textContent = state.banked;
  $('result-stats').textContent = `冒险成功 ${state.stats.risks} 次 · 点亮机关 ${state.stats.chains} 次 · 失稳 ${state.stats.failures} 次`;
  $('result-dialog').showModal();
}

function updateUI() {
  const state = model.snapshot();
  scene.setState(state);
  $('room-name').textContent = state.roomName;
  $('room-number').textContent = String(state.room + 1).padStart(2,'0');
  $('seed-label').textContent = `#${state.seed.toString(16).slice(-5).toUpperCase()}`;
  $('banked').textContent = state.banked;
  $('carried').textContent = state.carried;
  if (state.banked > best) { best = state.banked; savePreference('wslice-best',best); }
  setHTML('best-score',`${best} <small>回响</small>`);
  [...$('lives').children].forEach((el,i) => el.classList.toggle('empty',i >= state.lives));
  $('lives').setAttribute('aria-label',`剩余 ${state.lives} 次`);
  [...$('combo').children].forEach((el,i) => el.classList.toggle('active',i < state.combo));
  $('combo').setAttribute('aria-label',`${state.combo} 层`);
  $('mechanism-count').textContent = `${state.activated.length} / 3`;
  for (const node of state.nodes.filter(n => n.kind === 'mechanism')) {
    const row = document.querySelector(`[data-mechanism="${node.id}"]`);
    const active = state.activated.includes(node.id);
    row.classList.toggle('active', active);
    row.querySelector('small').textContent = active ? '已共鸣' : '等待唤醒';
    row.querySelector('.node-light').textContent = active ? '✦' : '◇';
  }
  const nextKey = `${state.availableNodes.join(',')}:${state.selected}`;
  if (destinationKey !== nextKey) {
    destinationKey = nextKey;
    $('destinations').replaceChildren(...state.availableNodes.map((id,i) => {
      const node = state.nodes.find(n=>n.id===id);
      const button = document.createElement('button');
      button.setAttribute('aria-pressed',String(state.selected === id));
      button.setAttribute('aria-label',`前往${node.name}`);
      button.innerHTML = `<span>${i+1}</span>${node.name}${id === 'exit' ? ' ↗' : ''}`;
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
  $('safe-mode').disabled = $('risk-mode').disabled = state.phase !== 'playing' || !!state.travel;
  $('align').disabled = !range || !!state.travel || state.phase !== 'playing';
  $('move').disabled = !state.canMove || paused;
  setHTML('move',state.travel ? `穿越中 <span>${Math.round(state.travel.progress*100)}%</span>` : `${state.riskMode?'冒险穿越':'穿越'} <span>Space ↗</span>`);
  $('interact').disabled = state.phase !== 'playing' || !!state.travel || (state.node === 'hub' ? state.carried === 0 : state.activated.includes(state.node));
  setHTML('interact',state.node === 'hub' ? '存入回响 <kbd>E</kbd>' : state.activated.includes(state.node) ? '机关已共鸣 <kbd>E</kbd>' : '启动机关 <kbd>E</kbd>');
  $('stability-wrap').hidden = !state.travel;
  if (state.travel) {
    $('stability-bar').style.width = `${state.travel.stability*100}%`;
    $('stability-bar').style.background = state.travel.stability < .45 ? 'var(--danger)' : state.travel.risky ? 'var(--amber)' : 'var(--green)';
    $('stability-label').textContent = state.travel.stability < .55 ? '失稳 · 跟住光带' : state.travel.risky ? '冒险蓄能' : '稳定穿越';
  }
  const aligned = range && state.w >= range.min && state.w <= range.max;
  $('slice-hint').textContent = state.travel ? (state.travel.risky ? '光带正在移动 · 调 W 跟上它' : '保持在光带内，直到落地') : range ? `${aligned?'已对齐':'调 W 进入光带'} · ${range.min.toFixed(2)} — ${range.max.toFixed(2)}${state.riskMode?' · 出发后光带会移动':''}` : '选择下一处落脚点';
  const relic = RELICS.find(r=>r.id===state.relic);
  $('relic-icon').textContent = icons[state.relic] || '◇';
  $('relic-name').textContent = relic?.name || '尚未选择';
  $('relic-description').textContent = relic?.description || '每一件遗物，都带来另一种走法。';
  $('relic-status').textContent = state.relic === 'prism' ? (state.charge?'已蓄能':'待蓄能') : state.relic === 'shell' ? (state.shield?'完整':'已消耗') : state.shadowRemaining > 0 ? `${state.shadowRemaining.toFixed(1)}s` : '';
  setHTML('ability',`${state.abilityLabel} <kbd>Q</kbd>`);
  $('ability').disabled = !state.abilityAvailable;
  $('pause').disabled = state.phase !== 'playing';
  const atMechanism = state.nodes.find(n=>n.id===state.node)?.kind === 'mechanism';
  const hint = state.travel ? (state.travel.risky ? '跟随移动光带。稳定度耗尽就会回退，未存回响有损失。' : '保持切片。到达后启动机关，让这次行动沿着庭院继续传递。')
    : atMechanism && !state.activated.includes(state.node) ? '抵达了。启动脚下的机关，看看回响会传向哪里。'
    : state.activated.length === 3 ? '庭门已经打开。从归响台选“庭门”，带着回响去下一座庭院。'
    : state.node === 'hub' && state.carried > 0 ? '存下这次成果，或带着回响继续挑战。已存部分在失手后保留。'
    : state.relic === 'prism' && !state.charge ? '棱镜需要一次新的冒险收获。回到中央后释放，连通外环并点亮另一座机关。'
    : '先让白点进入光带，再出发。冒险可拿更多回响，但光带会移动。';
  $('context-hint').textContent = hint;
  const status = transient || (state.travel ? (state.travel.risky?'冒险中 · 留意移动光带':'回响正在路上') : `当前：${state.nodes.find(n=>n.id===state.node)?.name || '归响台'} · ${state.activated.length===3?'庭门已打开':'点亮三座机关'}`);
  if (status !== lastStatus) { $('scene-state').textContent = status; lastStatus = status; }
  if (state.phase !== lastPhase) {
    lastPhase = state.phase;
    if (['choose','interlude'].includes(state.phase)) showChoice(state);
    else if (['won','lost'].includes(state.phase)) showResult(state);
  }
}

for (const node of model.snapshot().nodes.filter(n=>n.kind==='mechanism')) {
  const row = document.createElement('div'); row.className = 'mechanism-item'; row.dataset.mechanism = node.id;
  row.innerHTML = `<span class="node-light" aria-hidden="true">◇</span><span>${node.name}</span><small>等待唤醒</small>`;
  $('mechanisms').append(row);
}
$('w-slider').addEventListener('input',e=>{ if(canAct()) action(()=>model.setW(Number(e.target.value))); });
$('align').addEventListener('click',()=>{ if(canAct()) action(()=>model.setW(model.snapshot().range?.center ?? .5)); });
$('safe-mode').addEventListener('click',()=>{ if(canAct()) action(()=>model.setRisk(false)); });
$('risk-mode').addEventListener('click',()=>{ if(canAct()) action(()=>model.setRisk(true)); });
$('move').addEventListener('click',()=>{ if(canAct()) { action(()=>model.move()); if(model.snapshot().travel) $('w-slider').focus({preventScroll:true}); } });
$('interact').addEventListener('click',()=>{ if(canAct()) action(()=>model.interact()); });
$('ability').addEventListener('click',()=>{ if(canAct()) action(()=>model.useAbility()); });
$('sound').addEventListener('click',()=>{ soundEnabled = !soundEnabled; audio.setEnabled(soundEnabled); unlockAudio(); savePreference('wslice-sound',soundEnabled?'on':'off'); updateSoundButton(); });
function pauseGame() { if(model.snapshot().phase!=='playing'||isModal())return; paused=true; $('pause-dialog').showModal(); }
function resumeGame() { $('pause-dialog').close(); paused=false; lastFrame=performance.now(); $('w-slider').focus({preventScroll:true}); }
$('pause').addEventListener('click',pauseGame); $('resume').addEventListener('click',resumeGame);
$('pause-dialog').addEventListener('cancel',e=>{e.preventDefault();resumeGame();});
$('help').addEventListener('click',()=>{ if(!isModal()){paused=true;$('help-dialog').showModal();} });
function closeHelp() {$('help-dialog').close();paused=false;lastFrame=performance.now();}
$('close-help').addEventListener('click',closeHelp);$('help-done').addEventListener('click',closeHelp);$('help-dialog').addEventListener('cancel',e=>{e.preventDefault();closeHelp();});
$('restart').addEventListener('click',()=>{if(!isModal()){paused=true;$('restart-dialog').showModal();}});
function cancelRestart() {$('restart-dialog').close();paused=false;lastFrame=performance.now();}
$('cancel-restart').addEventListener('click',cancelRestart);$('restart-dialog').addEventListener('cancel',e=>{e.preventDefault();cancelRestart();});
function restart() {for(const id of dialogs)if($(id).open)$(id).close();paused=false;lastPhase='';destinationKey='';action(()=>model.restart(newSeed()));}
$('confirm-restart').addEventListener('click',restart);$('play-again').addEventListener('click',restart);
$('choice-dialog').addEventListener('cancel',e=>e.preventDefault());$('result-dialog').addEventListener('cancel',e=>e.preventDefault());
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&!isModal()){e.preventDefault();pauseGame();return;}
  if(!canAct()||e.altKey||e.ctrlKey||e.metaKey)return;
  const key=e.key.toLowerCase();
  // Preserve native arrows on the range and activation keys on focused buttons.
  // Other game shortcuts remain available after a click or slider adjustment.
  if(e.target===$('w-slider')&&['arrowleft','arrowright','arrowup','arrowdown','home','end','pageup','pagedown'].includes(key))return;
  if(e.target.matches('input,select,textarea')&&e.target!==$('w-slider'))return;
  if(e.target.matches('button,a')&&[' ','enter'].includes(key))return;
  if(['a','d','arrowleft','arrowright'].includes(key)){e.preventDefault();action(()=>model.setW(model.snapshot().w+(['a','arrowleft'].includes(key)?-.015:.015)));}
  else if(key===' '||key==='enter'){e.preventDefault();action(()=>model.move());}
  else if(key==='e'){e.preventDefault();action(()=>model.interact());}
  else if(key==='q'){e.preventDefault();action(()=>model.useAbility());}
  else if(/^[1-4]$/.test(key)){e.preventDefault();const id=model.snapshot().availableNodes[Number(key)-1];if(id)action(()=>model.select(id));}
});
document.addEventListener('visibilitychange',()=>{lastFrame=performance.now();if(document.hidden&&model.snapshot().phase==='playing'&&!isModal())pauseGame();});
window.addEventListener('pagehide',event=>{if(event.persisted)audio.setEnabled(false);else audio.dispose();});
window.addEventListener('pageshow',event=>{if(event.persisted){audio.setEnabled(soundEnabled);lastFrame=performance.now();}});
function frame(now) {
  const dt=Math.max(0,Math.min(.05,(now-lastFrame)/1000));lastFrame=now;
  if(!paused&&!isModal()&&!document.hidden){model.update(dt);if(transientTime>0){transientTime-=dt;if(transientTime<=0)transient=null;}}
  consumeEvents();updateUI();scene.render(paused||document.hidden?0:dt);requestAnimationFrame(frame);
}
updateSoundButton();consumeEvents();updateUI();requestAnimationFrame(frame);
