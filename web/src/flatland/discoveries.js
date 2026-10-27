import { createRandom } from './random.js';

// Optional encounters use the world's existing slicing, peeking and chirality.
// Coordinates are deliberately reachable without changing the collision rules.
export const FRIENDS = Object.freeze([
  Object.freeze({ id: 'sprout', level: 'escape', name: '跳跳', icon: '♧', color: '#4d9270', clue: '墙上方，有一对耳朵。', memory: '它总想再躲一次。' }),
  Object.freeze({ id: 'lantern', level: 'vault', name: '瞌睡灯', icon: '✦', color: '#bc872f', clue: '升到盒子上方，按住 Space 往下看，谁在打呼噜？', memory: '看一眼，它就醒了。' }),
  Object.freeze({ id: 'ribbon', level: 'mirror', name: '反反', icon: '❧', color: '#8c6cad', clue: '有个倒影，没在照着你做。', memory: '绕到另一面，才认得彼此。' }),
]);

export function normalizeCollection(value) {
  const found = FRIENDS.map(f => f.id).filter(id => Array.isArray(value?.found) && value.found.includes(id));
  const companion = found.includes(value?.companion) || (value?.companion === 'all' && found.length === FRIENDS.length) ? value.companion : found[0] || null;
  return { found, companion };
}

export function createEncounter(levelId, seed) {
  const rng = createRandom(seed ^ 0x51ceba11);
  if (levelId === 'escape') {
    const y = rng.next() < .5 ? 3 : 9;
    return { id: 'sprout', kind: 'chase', step: 0, hold: 0, cooldown: 0, found: false,
      path: [{ x: 11, y: 5, z: 4.7 }, { x: 4, y, z: 2.7 }, { x: 4, y: 12 - y, z: .6 }] };
  }
  if (levelId === 'vault') return { id: 'lantern', kind: 'peek', step: 0, hold: 0, rise: 0, found: false, x: 10.65, y: 6.8, z: 1.25 };
  if (levelId === 'mirror') return { id: 'ribbon', kind: 'mirror', step: 0, hold: 0, found: false, x: 5, y: 9.7, z: 3, chirality: -1, turns: rng.pick([1, 2, 3]) };
  return null;
}

export function encounterPose(encounter) {
  return encounter.kind === 'chase' ? encounter.path[encounter.step] : { x: encounter.x, y: encounter.y, z: encounter.z };
}

// No future chase positions or exact off-layer heights are leaked to the view.
export function encounterView(encounter, model) {
  if (!encounter) return null;
  const p = encounterPose(encounter), distance = Math.hypot(model.player.x - p.x, model.player.y - p.y);
  if (encounter.found) return { id: encounter.id, kind: 'home', x: p.x, y: p.y };
  const visible = Math.abs(model.s - p.z) <= .4;
  const peeking = encounter.kind === 'peek' && model.peek && model.s > p.z + .4;
  const aboveBox = encounter.kind === 'peek' && model.s > 4;
  const insideBox = encounter.kind === 'peek' && model.player.x > 8.35 && model.player.x < 11.65 && model.player.y > 4.35 && model.player.y < 7.65;
  const hidden = encounter.kind === 'peek' && !peeking && !aboveBox && !insideBox && !model.visible.has('vault-key') && encounter.step === 0;
  return { id: encounter.id, kind: encounter.kind, x: p.x, y: p.y, visible: visible && !hidden, peeking,
    nearby: distance < 2, trace: !hidden && (!visible || encounter.cooldown > 0), hold: Math.min(1, encounter.hold / .25),
    step: encounter.step, chirality: encounter.chirality, turns: encounter.turns,
    direction: p.z > model.s ? 1 : -1, rising: encounter.kind === 'peek' && encounter.step === 1 };
}

export function stepEncounter(model, dt) {
  const e = model.encounter;
  if (!e || e.found) return;
  const p = encounterPose(e), near = Math.hypot(model.player.x - p.x, model.player.y - p.y) < 1.15;
  const sameLayer = Math.abs(model.s - p.z) <= .4;
  e.cooldown = Math.max(0, (e.cooldown || 0) - dt);
  if (e.kind === 'peek' && e.step === 1) {
    e.rise = Math.min(1, e.rise + dt / 1.3); e.z = 1.25 + (4.8 - 1.25) * e.rise;
    if (e.rise === 1) e.step = 2;
    return;
  }
  const waking = e.kind === 'peek' && e.step === 0;
  const ready = waking ? near && model.peek && model.s > 4.2
    : near && sameLayer && e.cooldown === 0 && (e.kind !== 'mirror' ||
      (model.carrying && model.keyChirality === e.chirality && model.keyTurns === e.turns));
  e.hold = ready ? e.hold + dt : 0;
  if (e.hold < (waking ? .45 : .25)) return;
  e.hold = 0;
  if (waking) {
    e.step = 1;
    model._emit('friend_wake', { id: e.id, x: p.x, y: p.y });
  } else if (e.kind === 'chase' && e.step < e.path.length - 1) {
    const from = { ...p }; e.step++; e.cooldown = .55;
    model._emit('friend_hop', { id: e.id, x: from.x, y: from.y, to: { ...encounterPose(e) } });
  } else {
    e.found = true;
    const fresh = !model.collection.found.includes(e.id);
    if (fresh) model.collection.found.push(e.id);
    if (fresh || !model.collection.companion) model.collection.companion = e.id;
    model._emit('friend_found', { id: e.id, x: p.x, y: p.y, fresh, all: model.collection.found.length === FRIENDS.length });
  }
}

export function friendPortrait(friend, found, { crowned = false } = {}) {
  const color = found ? friend.color : '#a3afa1';
  const feature = friend.id === 'sprout' ? '<ellipse cx="34" cy="23" rx="9" ry="20" transform="rotate(-18 34 23)"/><ellipse cx="66" cy="23" rx="9" ry="20" transform="rotate(18 66 23)"/>'
    : friend.id === 'lantern' ? '<path d="M50 4 58 27 50 23 42 27Z"/><circle cx="50" cy="54" r="43" opacity=".15"/>'
      : '<path d="M70 61C110 80 104 0 68 17C95 20 84 52 65 42Z"/>';
  const face = found ? '<g fill="#fffdf0"><ellipse cx="39" cy="48" rx="4" ry="6"/><ellipse cx="61" cy="48" rx="4" ry="6"/></g><path d="M44 61Q50 67 56 61" fill="none" stroke="#fffdf0" stroke-width="3" stroke-linecap="round"/>' : '';
  const crown = found && crowned ? `<g stroke="#4c8b62" stroke-width="3" fill="none"><path d="M29 18Q50 3 71 18"/></g>${[[33,16],[50,10],[67,16]].map(([x,y]) => `<g fill="#fff4d9">${Array.from({ length: 5 }, (_, i) => { const a = i * Math.PI * 2 / 5; return `<circle cx="${x + Math.cos(a) * 4}" cy="${y + Math.sin(a) * 4}" r="3"/>`; }).join('')}<circle cx="${x}" cy="${y}" r="2" fill="#d6a63b"/></g>`).join('')}` : '';
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><g fill="${color}">${feature}<ellipse cx="50" cy="54" rx="30" ry="27"/></g>${face}${crown}</svg>`;
}
