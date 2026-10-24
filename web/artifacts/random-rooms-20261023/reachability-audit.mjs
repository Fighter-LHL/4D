import {GameModel} from '../../src/model.js';
const clone = model => Object.assign(Object.create(GameModel.prototype),structuredClone({...model}));
function wait(m,seconds=.65){for(let t=0;t<seconds-1e-6;t+=.05)m.update(Math.min(.05,seconds-t));m.drainEvents();}
function key(m){const s=m.snapshot();return [s.phase,s.node,s.layer,[...s.activated].sort(),[...s.powered].sort(),s.vaultStatus,m.pending.map(x=>`${x.from}:${x.to}`).sort()].join('|');}
function actions(m){const s=m.snapshot(),out=[];
  for (const layer of s.layers){const n=clone(m);n.setW(layer.center);if(n.snapshot().nodes.find(x=>x.id===n.snapshot().node).present){wait(n);out.push([`W${layer.id}`,n]);}}
  for (const id of s.availableNodes){const n=clone(m);n.select(id);if(n.move()){wait(n,1.5);out.push([`move ${id}`,n]);}}
  if(s.interactAvailable && s.node!=='vault'){const n=clone(m);n.interact();wait(n);out.push(['interact',n]);}
  if(m.pending.length){const n=clone(m);wait(n);out.push(['wait',n]);}
  return out;
}
function explore(start,full=true){const startKey=key(start),states=new Map([[startKey,{m:clone(start),path:[],next:[]}]]),queue=[startKey],finished=[];
  for(let i=0;i<queue.length;i++){const k=queue[i],row=states.get(k),s=row.m.snapshot();
    if(s.phase==='interlude'||s.phase==='won'){finished.push(k);if(!full)return {win:row.m,path:row.path,states};continue;}
    if(s.phase!=='playing')throw Error('unintended fail '+row.path.join(';'));
    for(const [act,n] of actions(row.m)){const nk=key(n);row.next.push(nk);if(!states.has(nk)){states.set(nk,{m:n,path:[...row.path,act],next:[]});queue.push(nk);}}
    if(queue.length>5000)throw Error('state explosion');
  }
  if(!finished.length)throw Error('No solution seed='+start.seed+' room='+start.room+' signature='+start.snapshot().roomSignature);
  const reverse=new Map();for(const[k,row]of states)for(const next of row.next){if(!reverse.has(next))reverse.set(next,[]);reverse.get(next).push(k);}
  const reach=new Set(finished),rqueue=[...finished];for(let i=0;i<rqueue.length;i++)for(const p of reverse.get(rqueue[i])||[])if(!reach.has(p)){reach.add(p);rqueue.push(p);}
  const stuck=[...states].filter(([k])=>!reach.has(k));if(stuck.length)throw Error('Softlock '+start.seed+'/'+start.room+' '+JSON.stringify(stuck[0][1].m.snapshot())+' PATH '+stuck[0][1].path.join(';'));
  return {win:states.get(finished[0]).m,path:states.get(finished[0]).path,states};
}
let checked=0,totalStates=0,ghostStates=0,waveCases=0;const seen=new Set(),signatures=new Set();
for(let seed=0;seed<64;seed++){
 let model=new GameModel(seed);model.chooseRelic('shadow');
 for(let room=0;room<3;room++){
  const result=explore(model);checked++;totalStates+=result.states.size;seen.add(model.snapshot().roomId);signatures.add(model.snapshot().roomSignature);
  // Any accessible activated mechanism may spend its shadow; expiry must not strand anyone.
  if(seed<8)for(const {m} of result.states.values()){
   if(m.snapshot().phase!=='playing'||!m.snapshot().abilities.find(a=>a.id==='shadow').available)continue;
   const g=clone(m);if(!g.useAbility('shadow'))throw Error('shadow available but fails');
   // Explore all legal departures while the bridge is present, then expire from every endpoint.
   const destinations=[g,...actions(g).map(x=>x[1])];
   for(const d of destinations){if(d.snapshot().phase!=='playing')continue;wait(d,25);explore(d,false);ghostStates++;}
  }
  // Independently navigate to every unlocked vault state. Safe and danger outcomes must be meaningful.
  if(seed<8){const candidate=[...result.states.values()].find(({m})=>m.snapshot().node==='vault'&&m.snapshot().interactAvailable);
   if(!candidate)throw Error('Vault unreachable '+seed+'/'+room);
   const v=clone(candidate.m);v.interact();const before=v.snapshot().carried;let waves=0;
   while(v.snapshot().wave){const s=v.snapshot();v.setW(s.layers[s.wave.safeLayers[0]].center);wait(v,s.wave.remaining+.01);waves++;if(waves>3)throw Error('wave loop');}
   if(v.snapshot().vaultStatus!=='escaped'||v.snapshot().carried<=before)throw Error('wave success missing');explore(v,false);waveCases++;
   const f=clone(candidate.m);f.interact();const bad=f.snapshot();f.setW(bad.layers[bad.wave.dangerLayers[0]].center);wait(f,bad.wave.remaining+.01);if(f.snapshot().vaultStatus!=='failed'||f.snapshot().stats.failures!==bad.stats.failures+1)throw Error('wave danger failed to fail');explore(f,false);waveCases++;
  }
  model=result.win;if(room<2)model.chooseRelic('shadow');
 }
}
console.log(JSON.stringify({checked,totalStates,ghostStates,waveCases,templates:[...seen],uniqueSignatures:signatures.size},null,2));
