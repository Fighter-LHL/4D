import { GameModel, RELICS } from './model.js';
import { SceneRenderer } from './scene.js';
import { GameAudio } from './audio.js';
import { isFlatlandArrival } from './flatland/handoff.js';
import { courtyardFriends, friendGuideText } from './courtyard-friends.js';
import { FriendGuide } from './friend-guide.js';
import { CourtyardMomentum } from './courtyard-momentum.js';
import { STARTER_RELICS, mechanismFeedback, contextualHelp, courtyardActions } from './play-feedback.js';

const $ = id => document.getElementById(id);
const compactProgress = matchMedia('(max-width:480px)');
const syncProgressDetails = () => { $('run-details').open = !compactProgress.matches; };
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
const dialogs = ['choice-dialog','help-dialog','pause-dialog','result-dialog','restart-dialog'];
const isModal = () => dialogs.some(id => $(id).open);
const canAct = () => !paused && !isModal() && model.snapshot().phase === 'playing';
const guide = new FriendGuide();
const firstDiscoveryArrival = new URLSearchParams(location.search).get('from') === 'discovery' &&
  courtyardFriends(readJSON('wslice-flatland-friends')).length > 0 && readPreference('wslice-courtyard-welcome', '') !== 'seen';
const momentum = new CourtyardMomentum({ arrival: firstDiscoveryArrival });
let discoveryChoicePending = firstDiscoveryArrival;
// Spend the entry attempt now, including an entry already occupied by guidance.
if (firstDiscoveryArrival) savePreference('wslice-courtyard-welcome', 'seen');
function askFriend() { if (canAct()) { momentum.cancel(); guide.request(model.snapshot()); updateUI(); } }
const scene = new SceneRenderer($('scene'), { onSelect: id => { if (canAct()) action(() => model.selectOrMove(id)); }, onFriend: askFriend, hasSupplySlots });
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
    if (event.type === 'fail') message = event.protected ? '缓落壳接住了你，随身回响保留。' : `失稳回退，失去 ${event.value} 枚未存回响。`;
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
    button.addEventListener('click', () => { $('choice-dialog').close(); paused = false; action(() => { model.chooseRelic(relic.id); if (!next && !momentum.firstEntry) guide.request(model.snapshot()); }); $('w-slider').focus({preventScroll:true}); });
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
  setText('room-description',state.roomDescription || '观察各层机关，让能量接力。');
  renderItinerary('room-itinerary',state,state.room);
  const order=state.mechanismOrder || state.nodes.filter(n=>n.kind==='mechanism').map(n=>n.id);
  $('mechanisms').replaceChildren(...order.map(id=>{
    const node=state.nodes.find(n=>n.id===id);
    const row=document.createElement('div');row.className='mechanism-item';row.dataset.mechanism=id;
    row.innerHTML=`<span class="node-light" aria-hidden="true">◇</span><span class="mechanism-name">${node.name}<span class="supply-slots">${(node.required || []).map(source=>{const from=state.nodes.find(n=>n.id===source);return `<i data-source="${source}" title="来自${from.name}" style="--supply-color:${state.layers[from.layer].color}">○</i>`;}).join('')}</span></span><small></small>`;
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
  const firstAction = momentum.firstAction(snapshot, guide);
  const firstTarget = state.nodes.find(node => node.id === firstAction?.node);
  // Keep the first activation and its hub/anchor crossings actionable on the
  // existing route. No timer/beat; deliberate choices keep normal UI.
  const onward = momentum.firstEntry && canAct() && !state.travel && !state.wave &&
    state.phaseStability === 1 && !state.riskMode && !state.stats.failures &&
    ((state.activated.length === 1 && state.activated.includes(state.node)) ||
      (['hub', 'relay'].includes(state.node) && state.activated.length > 0 && state.activated.length < 3)) &&
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
  setText('layer-name',currentLayer?.name || '层间隙');
  setText('layer-symbol',layerSymbols[state.layer] || '◇');
  if(currentNode?.world)setText('position-readout',`位置 ${Number(currentNode.world.x.toFixed(1))}, ${Number(currentNode.world.y.toFixed(1))}, ${Number(currentNode.world.z.toFixed(1))} · W ${state.w.toFixed(2)}`);
  document.body.dataset.layer = String(state.layer);
  for(const [i,button] of [...document.querySelectorAll('.layer-controls [data-layer]')].entries()){
    button.setAttribute('aria-pressed',String(i===state.layer));
    button.disabled=state.phase!=='playing'||paused;
    button.classList.toggle('danger-layer',!!state.wave?.dangerLayers?.includes(i));
    button.classList.toggle('safe-layer',!!state.wave?.safeLayers?.includes(i));
    button.classList.toggle('attention-action', !!onwardShift && onward.layer === i);
    button.title=state.wave?`${state.layers[i].name} · ${state.wave.safeLayers.includes(i)?'安全切片':'回流危险'}`:state.layers[i].name;
  }
  setText('footing',`${currentNode?.name || ''} · ${currentNode?.anchor?'跨层支撑':currentNode?.present?'本层平台':'离层失稳 · 换回有支撑的层'}`);
  $('footing').classList.toggle('unsafe',state.phaseStability<.99);
  setText('objective',firstTarget
    ? firstAction.action === 'move' ? `先到${firstTarget.name} · 稳行过去` : `启动脚下的${firstTarget.name} · 按 E`
    : onwardShift ? (onward.kind === 'shift'
      ? `原地换到${layerSymbols[onward.layer]} ${state.layers[onward.layer].name} · 显现${onwardTarget.name}`
      : `换到${layerSymbols[onward.layer]} ${state.layers[onward.layer].name} · 显现通往${onwardTarget.name}的桥`)
      : onwardMove ? `到${onwardTarget.name} · 沿桥稳行`
        : state.objective || '观察供能关系，切换 W 寻找这一庭的起点');
  for (const node of state.nodes.filter(n => n.kind === 'mechanism')) {
    const row = document.querySelector(`[data-mechanism="${node.id}"]`);
    const active = state.activated.includes(node.id);
    row.classList.toggle('active', active);
    row.querySelector('small').textContent = active ? '已启动' : node.powered ? (node.required?.length?'已供能':'起点') : `供能 ${node.received?.length || 0}/${node.required?.length || 1}`;
    row.title=node.mechanismHint || '';
    row.querySelector('.node-light').textContent = active ? '✦' : '◇';
    for(const slot of row.querySelectorAll('[data-source]')){const received=node.received?.includes(slot.dataset.source);slot.textContent=received?'●':'○';slot.classList.toggle('received',!!received);}
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
  setHTML('move',state.travel ? `穿越中 <span>${Math.round(state.travel.progress*100)}%</span>` : `${firstAction?.action === 'move' ? `到${firstTarget.name}` : onwardMove ? `${['hub', 'relay'].includes(state.node) ? '到' : '稳行到'}${onwardTarget.name}` : state.riskMode?'冒险穿越':'稳行'} <span>${onwardMove && compactProgress.matches ? '↗' : 'Space ↗'}</span>`);
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
  $('pause').disabled = state.phase !== 'playing';
  setText('context-hint',state.objective || '切换空间，观察能量会传到哪一层。');
  // The action popup owns its result; the caption keeps the current place legible.
  const status = (actionFeedback || transientType === 'power' ? null : transient) || (state.travel ? (state.travel.risky?'冒险中 · 留意移动光带':'沿当前切片前进') : `${currentNode?.name || '归响台'} · ${currentLayer?.name || '层间隙'}`);
  $('action-feedback').hidden = !transient || !actionFeedback;
  setText('action-feedback', transient ? actionFeedback : '');
  if (status !== lastStatus) { $('scene-state').textContent = status; lastStatus = status; }
  if (state.phase !== lastPhase) {
    lastPhase = state.phase;
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
for(const button of document.querySelectorAll('.layer-controls [data-layer]'))button.addEventListener('click',()=>{if(canAct())action(()=>model.setW(model.snapshot().layers[Number(button.dataset.layer)].center));});
$('sound').addEventListener('click',()=>{ soundEnabled = !soundEnabled; audio.setEnabled(soundEnabled); unlockAudio(); savePreference('wslice-sound',soundEnabled?'on':'off'); updateSoundButton(); });
function pauseGame() { if(model.snapshot().phase!=='playing'||isModal())return; paused=true; $('pause-dialog').showModal(); syncAudio(); }
function resumeGame() {
  $('pause-dialog').close(); paused=false; lastFrame=performance.now(); syncAudio();
  // Re-enable controls before focus: disabled ranges ignore focus requests.
  updateUI(); $('w-slider').focus({preventScroll:true});
}
$('pause').addEventListener('click',pauseGame); $('resume').addEventListener('click',resumeGame);
$('pause-dialog').addEventListener('cancel',e=>{e.preventDefault();resumeGame();});
function selectHelp(topic) {
  setText('help-tip', contextualHelp(model.snapshot(), topic));
  for (const button of document.querySelectorAll('[data-help]')) button.setAttribute('aria-pressed', String(button.dataset.help === topic));
}
for (const button of document.querySelectorAll('[data-help]')) button.addEventListener('click', () => selectHelp(button.dataset.help));
$('help').addEventListener('click',()=>{ if(!isModal()){paused=true;selectHelp('next');$('help-dialog').showModal();syncAudio();} });
function closeHelp() {$('help-dialog').close();paused=false;lastFrame=performance.now();syncAudio();}
$('close-help').addEventListener('click',closeHelp);$('help-done').addEventListener('click',closeHelp);$('help-dialog').addEventListener('cancel',e=>{e.preventDefault();closeHelp();});
$('restart').addEventListener('click',()=>{if(!isModal()){paused=true;$('restart-dialog').showModal();syncAudio();}});
function cancelRestart() {$('restart-dialog').close();paused=false;lastFrame=performance.now();syncAudio();}
$('cancel-restart').addEventListener('click',cancelRestart);$('restart-dialog').addEventListener('cancel',e=>{e.preventDefault();cancelRestart();});
function restart() {for(const id of dialogs)if($(id).open)$(id).close();paused=false;lastPhase='';destinationKey='';buildKey='';roomKey='';secretKey='';sealKey='';$('secret-panel').open=false;$('build-list').replaceChildren();$('ability-list').replaceChildren();const seed=newSeed();rememberSeed(seed);action(()=>model.restart(seed));}
$('confirm-restart').addEventListener('click',restart);$('play-again').addEventListener('click',restart);
$('choice-dialog').addEventListener('cancel',e=>e.preventDefault());$('result-dialog').addEventListener('cancel',e=>e.preventDefault());
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&!isModal()){e.preventDefault();pauseGame();return;}
  if(!canAct()||e.altKey||e.ctrlKey||e.metaKey)return;
  const key=e.key.toLowerCase();
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
  else if(['z','x','c'].includes(key)){e.preventDefault();action(()=>model.setW(model.snapshot().layers[['z','x','c'].indexOf(key)].center));}
  else if(/^[1-9]$/.test(key)){e.preventDefault();const id=model.snapshot().availableNodes[Number(key)-1];if(id)action(()=>model.select(id));}
});
document.addEventListener('visibilitychange',()=>{lastFrame=performance.now();if(document.hidden&&model.snapshot().phase==='playing'&&!isModal())pauseGame();syncAudio();});
window.addEventListener('pagehide',event=>{if(event.persisted)audio.setEnabled(false);else audio.dispose();});
window.addEventListener('pageshow',event=>{if(event.persisted){audio.setEnabled(soundEnabled);lastFrame=performance.now();}});
function frame(now) {
  const dt=Math.max(0,Math.min(.05,(now-lastFrame)/1000));lastFrame=now;
  if(!paused&&!isModal()&&!document.hidden){model.update(dt);if(transientTime>0){transientTime-=dt;if(transientTime<=0)transient=null;}}
  guide.update(dt, model.snapshot(), !paused && !isModal() && !document.hidden, scene.friends.length > 0 && !momentum.firstEntry);
  momentum.update(dt, model.snapshot(), guide, !paused && !isModal() && !document.hidden);
  consumeEvents();updateUI();syncAudio();scene.render(paused||document.hidden?0:dt);requestAnimationFrame(frame);
}
updateSoundButton();consumeEvents();updateUI();requestAnimationFrame(frame);
