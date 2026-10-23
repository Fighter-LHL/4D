import { GameModel, RELICS } from './model.js';
import { SceneRenderer } from './scene.js';
import { GameAudio } from './audio.js';

const $ = id => document.getElementById(id);
const setHTML = (id,html) => { const el=$(id); if(el.innerHTML!==html)el.innerHTML=html; };
const setText = (id,text) => { const el=$(id); const value=String(text);if(el.textContent!==value)el.textContent=value; };
const icons = { prism:'◇', shadow:'◌', shell:'◈' };
const traits = { prism:'穿层送能 · 蓄能主动', shadow:'跨层压板 · 主动留影', shell:'失稳保护 · 自动触发' };
const layerSymbols = ['Ⅰ','Ⅱ','Ⅲ'];
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
let buildKey = '';
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
// Automatic choice/result dialogs freeze play while the outcome melody finishes.
// User-requested pauses (including help/restart confirmation) stop every sound.
function syncAudio() { audio.syncWave(model.snapshot().wave,paused||document.hidden); }
function action(fn) { unlockAudio(); syncAudio(); fn(); consumeEvents(); updateUI(); syncAudio(); }
function consumeEvents() {
  const events = model.drainEvents();
  if (!events.length) return;
  scene.setState(model.snapshot());
  scene.pushEvents(events);
  audio.handle(events);
  for (const event of events) {
    let message = '';
    if (event.type === 'fail') message = event.protected ? '缓落壳接住了你，随身回响保留。' : `失稳回退，失去 ${event.value} 枚未存回响。`;
    if (event.type === 'bank') message = `已存入 ${event.value} 枚回响。`;
    if (event.type === 'unlock') message = '三层共鸣，锚台通往庭门的桥已打开。';
    if (event.type === 'reward' && event.risky) message = `冒险成功，收获 ${event.value} 枚回响。`;
    if (event.type === 'ability') message = event.relic === 'prism' ? '脉冲送达，已供能的机关响应了。' : event.node==='bloom'?'影子压住花台，通向庭门的捷径正在展开。':event.node==='dew'?'影子留在潮汐层；换层启动回声台，捷径就会接通。':'影子压住回声台，通向锚台的捷径正在展开。';
    if (event.type === 'phase_transfer') message = '位置没有变，脚下已是另一层的机关。';
    if (event.type === 'power') message = `回响抵达${model.snapshot().nodes.find(n=>n.id===event.node)?.name || '另一层'}。`;
    if (event.type === 'warning') {
      message = '回流将抵达回声层。现在换层避开它。';
      // On phones, the lower action button can scroll the actual hazard offscreen.
      if (matchMedia('(max-width:780px)').matches && $('scene').getBoundingClientRect().top < 0)
        $('scene').closest('.scene-wrap').scrollIntoView({block:'start',behavior:'instant'});
    }
    if (event.type === 'evade') message = '跨层避开回流，花匣中的回响归你。';
    if (message) { transient = message; transientTime = 2.8; $('announcement').textContent = message; }
    if (['restart','room'].includes(event.type)) { transient = null; transientTime = 0; $('announcement').textContent = ''; }
  }
}

function showChoice(state) {
  const next = state.phase === 'interlude';
  $('choice-kicker').textContent = next ? `第 ${state.room + 1} 庭完成 · 已带回 ${state.banked} 回响` : '同一空间的另一种可能';
  $('choice-title').innerHTML = next ? '把这一次选择，<br>接在已有能力上。' : '站在同一处，<br>走进另一层。';
  $('choice-intro').textContent = next ? '已有遗物全部保留。拿一件新能力，或提升已有能力；回程结不会重置。' : '切换 W，水泵会在同一位置变成回声台。让三层机关接力，打开庭门。先带上一件遗物。';
  $('choice-build').hidden = !next;
  $('choice-build').textContent = '已有：'+RELICS.filter(r=>state.relics?.[r.id]>0).map(r=>`${r.name} ${'ⅠⅡⅢ'[state.relics[r.id]-1]}`).join(' ＋ ');
  $('relic-choices').replaceChildren(...(state.choices || RELICS).map(relic => {
    const rank = state.relics?.[relic.id] || 0;
    const button = document.createElement('button');
    button.className = 'relic-choice';
    button.setAttribute('aria-label', `选择${relic.name}`);
    button.innerHTML = `<span class="relic-art" aria-hidden="true">${icons[relic.id]}</span><span class="choice-arrow" aria-hidden="true">↗</span><h3>${relic.name}</h3><p>${relic.description}</p><small>${rank?`进阶 ${'ⅠⅡⅢ'[rank-1]} → ${'ⅠⅡⅢ'[rank] || 'Ⅲ'}`:'获得新能力'} · ${traits[relic.id]}</small>`;
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
  $('result-description').textContent = won ? '你让回响穿过了三层空间，也把这一路的能力组合带到了终点。' : '回程结已用完，之前存下的回响仍计入本次成绩。';
  $('result-score').textContent = state.banked;
  $('result-stats').textContent = `冒险成功 ${state.stats.risks} 次 · 点亮机关 ${state.stats.chains} 次 · 失稳 ${state.stats.failures} 次`;
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
      row.innerHTML=`<span class="build-icon" aria-hidden="true">${icons[relic.id]}</span><strong>${relic.name}</strong><small>${'ⅠⅡⅢ'[state.relics[relic.id]-1]}</small><span id="build-detail-${relic.id}" class="build-detail"></span>`;
      return row;
    }));
    $('ability-list').replaceChildren(...owned.filter(relic=>relic.id!=='shell').map(relic=>{
      const button=document.createElement('button');button.id=`ability-${relic.id}`;button.className='secondary-button';
      button.addEventListener('click',()=>{if(canAct())action(()=>model.useAbility(relic.id));});
      return button;
    }));
  }
  for (const ability of state.abilities || []) {
    if (!ability.rank) continue;
    setText(`build-detail-${ability.id}`,ability.detail);
    const button=$(`ability-${ability.id}`);
    if(button){button.disabled=!ability.available||paused;setHTML(button.id,`${ability.label} <kbd>Q</kbd>`);}
  }
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
  const currentLayer = state.layers?.[state.layer];
  const currentNode = state.nodes.find(n=>n.id===state.node);
  setText('layer-name',currentLayer?.name || '层间隙');
  setText('layer-symbol',layerSymbols[state.layer] || '◇');
  if(currentNode?.world)setText('position-readout',`位置 ${currentNode.world.x}, ${currentNode.world.y}, ${currentNode.world.z} · W ${state.w.toFixed(2)}`);
  document.body.dataset.layer = String(state.layer);
  for(const [i,button] of [...document.querySelectorAll('.layer-controls [data-layer]')].entries()){
    button.setAttribute('aria-pressed',String(i===state.layer));
    button.disabled=state.phase!=='playing'||paused;
  }
  setText('footing',`${currentNode?.name || ''} · ${currentNode?.anchor?'跨层支撑':currentNode?.present?'本层平台':'离层失稳 · 换回有支撑的层'}`);
  $('footing').classList.toggle('unsafe',state.phaseStability<.99);
  setText('objective',state.objective || '在潮汐层启动水泵，再看另一层的变化');
  for (const node of state.nodes.filter(n => n.kind === 'mechanism')) {
    const row = document.querySelector(`[data-mechanism="${node.id}"]`);
    const active = state.activated.includes(node.id);
    row.classList.toggle('active', active);
    row.querySelector('small').textContent = active ? '接力完成' : node.powered ? '已供能 · 待启动' : node.id==='dew'?'起点 · 待启动':'等待上一层';
    row.querySelector('.node-light').textContent = active ? '✦' : '◇';
  }
  const nextKey = `${state.availableNodes.join(',')}:${state.selected}:${state.layer}`;
  if (destinationKey !== nextKey) {
    destinationKey = nextKey;
    $('destinations').replaceChildren(...state.availableNodes.map((id,i) => {
      const node = state.nodes.find(n=>n.id===id);
      const button = document.createElement('button');
      button.setAttribute('aria-pressed',String(state.selected === id));
      button.setAttribute('aria-label',`前往${node.name}`);
      button.innerHTML = `<span>${i+1}</span>${node.name}<small>${node.layer==null?'锚':layerSymbols[node.layer]}</small>${id === 'exit' ? ' ↗' : ''}`;
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
  $('interact').disabled = !state.interactAvailable || paused;
  setHTML('interact',`${state.interactLabel || '启动机关'} <kbd>E</kbd>`);
  $('stability-wrap').hidden = !state.travel && state.phaseStability>=.99;
  if (state.travel || state.phaseStability<.99) {
    const stability = state.travel?.stability ?? state.phaseStability;
    $('stability-bar').style.width = `${stability*100}%`;
    $('stability-bar').style.background = stability < .45 ? 'var(--danger)' : state.travel?.risky ? 'var(--amber)' : 'var(--green)';
    setText('stability-label',!state.travel?'平台正在消失':stability<.55?'失稳 · 恢复切片':state.travel.risky?'冒险蓄能':'稳定穿越');
  }
  $('wave-warning').hidden = !state.wave;
  if(state.wave){
    const safe=state.layer!==state.wave.layer&&Math.abs(state.w-currentLayer.center)<=Math.sqrt(.75)*.16;
    setText('wave-time',state.wave.remaining.toFixed(1));$('wave-warning').classList.toggle('evading',safe);
    setText('wave-label',safe?'已避开回声层 · 保持切片':'回声层正在反噬');
  }
  const aligned = range && state.w >= range.min && state.w <= range.max;
  setText('slice-hint',state.wave?'回流停留在回声层，切到另两层等待它过去':state.travel ? (state.travel.risky ? '额外冒险 · 调 W 跟随光带' : '保持当前切片，直到落地') : range ? `${aligned?'这段路径已显现':'路径在另一个切片'} · W ${range.min.toFixed(2)} — ${range.max.toFixed(2)}` : '切换 W 观察平台和机关，或选择落脚点');
  updateBuild(state);
  $('pause').disabled = state.phase !== 'playing';
  setText('context-hint',state.objective || '切换空间，观察能量会传到哪一层。');
  const status = transient || (state.travel ? (state.travel.risky?'冒险中 · 留意移动光带':'沿当前切片前进') : `${currentNode?.name || '归响台'} · ${currentLayer?.name || '层间隙'}`);
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
for(const button of document.querySelectorAll('.layer-controls [data-layer]'))button.addEventListener('click',()=>{if(canAct())action(()=>model.setW(model.snapshot().layers[Number(button.dataset.layer)].center));});
$('sound').addEventListener('click',()=>{ soundEnabled = !soundEnabled; audio.setEnabled(soundEnabled); unlockAudio(); savePreference('wslice-sound',soundEnabled?'on':'off'); updateSoundButton(); });
function pauseGame() { if(model.snapshot().phase!=='playing'||isModal())return; paused=true; $('pause-dialog').showModal(); syncAudio(); }
function resumeGame() { $('pause-dialog').close(); paused=false; lastFrame=performance.now(); syncAudio(); $('w-slider').focus({preventScroll:true}); }
$('pause').addEventListener('click',pauseGame); $('resume').addEventListener('click',resumeGame);
$('pause-dialog').addEventListener('cancel',e=>{e.preventDefault();resumeGame();});
$('help').addEventListener('click',()=>{ if(!isModal()){paused=true;$('help-dialog').showModal();syncAudio();} });
function closeHelp() {$('help-dialog').close();paused=false;lastFrame=performance.now();syncAudio();}
$('close-help').addEventListener('click',closeHelp);$('help-done').addEventListener('click',closeHelp);$('help-dialog').addEventListener('cancel',e=>{e.preventDefault();closeHelp();});
$('restart').addEventListener('click',()=>{if(!isModal()){paused=true;$('restart-dialog').showModal();syncAudio();}});
function cancelRestart() {$('restart-dialog').close();paused=false;lastFrame=performance.now();syncAudio();}
$('cancel-restart').addEventListener('click',cancelRestart);$('restart-dialog').addEventListener('cancel',e=>{e.preventDefault();cancelRestart();});
function restart() {for(const id of dialogs)if($(id).open)$(id).close();paused=false;lastPhase='';destinationKey='';buildKey='';$('build-list').replaceChildren();$('ability-list').replaceChildren();action(()=>model.restart(newSeed()));}
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
  else if(['z','x','c'].includes(key)){e.preventDefault();action(()=>model.setW(model.snapshot().layers[['z','x','c'].indexOf(key)].center));}
  else if(/^[1-4]$/.test(key)){e.preventDefault();const id=model.snapshot().availableNodes[Number(key)-1];if(id)action(()=>model.select(id));}
});
document.addEventListener('visibilitychange',()=>{lastFrame=performance.now();if(document.hidden&&model.snapshot().phase==='playing'&&!isModal())pauseGame();syncAudio();});
window.addEventListener('pagehide',event=>{if(event.persisted)audio.setEnabled(false);else audio.dispose();});
window.addEventListener('pageshow',event=>{if(event.persisted){audio.setEnabled(soundEnabled);lastFrame=performance.now();}});
function frame(now) {
  const dt=Math.max(0,Math.min(.05,(now-lastFrame)/1000));lastFrame=now;
  if(!paused&&!isModal()&&!document.hidden){model.update(dt);if(transientTime>0){transientTime-=dt;if(transientTime<=0)transient=null;}}
  consumeEvents();updateUI();syncAudio();scene.render(paused||document.hidden?0:dt);requestAnimationFrame(frame);
}
updateSoundButton();consumeEvents();updateUI();requestAnimationFrame(frame);
