import test from 'node:test';
import assert from 'node:assert/strict';
import { GameModel, RELICS, NODES, ROOM_NAMES, LAYERS } from '../src/model.js';

const DT = 1 / 60;
function start(relic = 'prism', seed = 42) {
  const model = new GameModel(seed);
  assert.equal(model.chooseRelic(relic), true);
  model.drainEvents();
  return model;
}
function advance(model, seconds, track = false) {
  for (let t = 0; t < seconds - 1e-9; t += DT) {
    if (track && model.snapshot().travel) model.setW(model.snapshot().range.center);
    model.update(Math.min(DT, seconds - t));
  }
}
function travel(model, target, risky = false) {
  assert.equal(model.setRisk(risky), true);
  assert.equal(model.select(target), true, `route from ${model.snapshot().node} to ${target} is available`);
  assert.equal(model.setW(model.snapshot().range.center), true);
  assert.equal(model.move(), true, `route to ${target} is supported`);
  advance(model, risky ? 2.51 : 1.36, true);
  assert.equal(model.snapshot().node, target);
  assert.equal(model.snapshot().travel, null);
}
function fall(model, target = model.snapshot().availableNodes[0]) {
  assert.equal(model.setRisk(false), true);
  assert.equal(model.select(target), true);
  model.setW(model.snapshot().range.center);
  assert.equal(model.move(), true);
  model.setW(1);
  advance(model, .7);
  assert.equal(model.snapshot().travel, null);
}
function powerBell(model) {
  travel(model, 'dew');
  assert.equal(model.interact(), true);
  model.setW(.5);
  assert.equal(model.snapshot().node, 'bell');
  advance(model, .51);
  assert.equal(model.interact(), true);
}
function finishRoom(model) {
  powerBell(model);
  travel(model, 'hub');
  travel(model, 'relay');
  travel(model, 'bloom');
  assert.equal(model.interact(), true);
  travel(model, 'relay');
  travel(model, 'exit');
}
function openVault(model) {
  powerBell(model);
  travel(model, 'hub');
  travel(model, 'vault');
  assert.equal(model.interact(), true);
}

test('choice boundary, authored XYZ/W, fixed first room and seed determinism', () => {
  const model = new GameModel(73);
  assert.equal(model.snapshot().phase, 'choose');
  for (const action of [() => model.move(), () => model.setW(.3), () => model.useAbility(), () => model.interact(), () => model.chooseRelic('invalid')]) assert.equal(action(), false);
  assert.deepEqual(model.snapshot().nodes, new GameModel(74).snapshot().nodes, 'first room is fixed for learning');
  assert.equal(ROOM_NAMES.length, 3);
  assert.equal(NODES.length, 7);
  assert.equal(RELICS.length, 3);
  assert.deepEqual(LAYERS.map(layer => layer.center), [.18, .5, .82]);
  const [dew, bell] = ['dew', 'bell'].map(id => model.snapshot().nodes.find(node => node.id === id));
  assert.deepEqual([dew.world.x, dew.world.y, dew.world.z], [bell.world.x, bell.world.y, bell.world.z]);
  assert.notEqual(dew.world.w, bell.world.w);
  assert.deepEqual([dew.x, dew.y], [292, 242]);
  for (const seed of [73, 74]) {
    const a = start('prism', seed), b = start('prism', seed);
    finishRoom(a); finishRoom(b);
    a.chooseRelic('shell'); b.chooseRelic('shell');
    assert.deepEqual(a.snapshot(), b.snapshot());
  }
  const a = start('prism', 73), b = start('prism', 74);
  finishRoom(a); finishRoom(b); a.chooseRelic('shell'); b.chooseRelic('shell');
  assert.notDeepEqual(a.snapshot().range, b.snapshot().range, 'later seeded bridge tolerances differ');
});

test('continuous spherical section agrees with support and permanent anchors survive every W', () => {
  const model = start();
  for (const [w, expected] of [[.18, 1], [.26, Math.sqrt(.75)], [.34, 0]]) {
    model.setW(w);
    const dew = model.snapshot().nodes.find(node => node.id === 'dew');
    assert.ok(Math.abs(dew.visibility - expected) < 1e-7);
    assert.equal(dew.scale, dew.visibility);
    assert.equal(dew.present, expected >= .5);
  }
  for (const w of [0, .34, .66, 1]) {
    model.setW(w); advance(model, 1.2);
    assert.equal(model.snapshot().node, 'hub');
    assert.equal(model.snapshot().lives, 3);
    assert.equal(model.snapshot().phaseStability, 1);
    assert.equal(model.snapshot().canMove, false);
  }
});

test('same XYZ transfers to a distinct W entity without reward and requires delayed power to interact', () => {
  const model = start();
  travel(model, 'dew');
  const carried = model.snapshot().carried;
  model.setW(.5);
  assert.equal(model.snapshot().node, 'bell');
  assert.equal(model.snapshot().interactAvailable, false);
  assert.equal(model.interact(), false, 'the other entity is unpowered');
  assert.equal(model.snapshot().carried, carried);
  assert.ok(model.drainEvents().some(event => event.type === 'phase_transfer' && event.from === 'dew' && event.to === 'bell'));
  model.setW(.18);
  assert.equal(model.snapshot().node, 'dew');
  assert.equal(model.interact(), true);
  model.setW(.5);
  assert.equal(model.interact(), false);
  advance(model, .49);
  assert.equal(model.snapshot().powered.includes('bell'), false);
  advance(model, .02);
  assert.equal(model.snapshot().powered.includes('bell'), true);
  assert.equal(model.snapshot().activated.includes('bell'), false, 'power does not activate automatically');
  assert.equal(model.interact(), true);
  for (let i = 0; i < 100; i++) model.setW(i % 2 ? .18 : .5);
  assert.equal(model.snapshot().carried, carried, 'W shifts cannot farm rewards');
  assert.equal(model.snapshot().stats.chains, 2);
});

test('unsupported space warns for .9 seconds then returns to the last anchor at supported W', () => {
  const model = start();
  travel(model, 'dew');
  model.setW(.82);
  assert.equal(model.interact(), false);
  advance(model, .45);
  assert.ok(model.snapshot().phaseStability > .49 && model.snapshot().phaseStability < .51);
  assert.equal(model.snapshot().node, 'dew');
  model.setW(.18);
  advance(model, .3);
  assert.equal(model.snapshot().phaseStability, 1, 'recovering before collapse is allowed');
  model.setW(.82);
  advance(model, .91);
  assert.equal(model.snapshot().node, 'hub');
  assert.equal(model.snapshot().w, .18);
  assert.equal(model.snapshot().lives, 2);
  assert.equal(model.snapshot().carried, 0);
  assert.ok(model.drainEvents().some(event => event.type === 'fail' && event.reason === 'phase'));
});

test('actual locked graph unlocks in order; visual power never bypasses required W', () => {
  const model = start();
  assert.deepEqual(model.snapshot().availableNodes, ['dew']);
  assert.equal(model.select('exit'), false);
  assert.equal(model.select('relay'), false);
  assert.equal(model.select('bell'), false);
  travel(model, 'dew'); model.interact(); model.setW(.5); advance(model, .51);
  assert.equal(model.snapshot().edges.find(edge => edge.id === 'hub-relay').open, false);
  assert.equal(model.interact(), true);
  assert.equal(model.snapshot().edges.find(edge => edge.id === 'hub-relay').open, true);
  assert.equal(model.snapshot().edges.find(edge => edge.id === 'relay-exit').open, false);
  travel(model, 'hub');
  assert.ok(model.snapshot().availableNodes.includes('relay'));
  model.setW(.82);
  model.select('relay');
  assert.equal(model.move(), false, 'anchor is safe at W2 but bridge belongs to W1');
  travel(model, 'relay');
  model.setW(.82);
  assert.equal(model.snapshot().canMove, true);
  travel(model, 'bloom'); model.interact();
  assert.equal(model.snapshot().edges.find(edge => edge.id === 'relay-exit').open, true);
});

test('committed delayed cross-layer power survives a source collapse before its delivery', () => {
  const model = start();
  travel(model, 'dew');
  model.setW(.82); advance(model, .65);
  model.setW(.18); model.interact(); model.setW(.82);
  advance(model, .26);
  assert.equal(model.snapshot().node, 'hub');
  assert.deepEqual(model.snapshot().activated, ['dew']);
  assert.equal(model.snapshot().powered.includes('bell'), false);
  const failureEvents = model.drainEvents();
  assert.ok(failureEvents.some(event => event.type === 'fail'));
  assert.equal(failureEvents.some(event => ['chain', 'reward', 'unlock', 'activate'].includes(event.type)), false);
  advance(model, .25);
  assert.equal(model.snapshot().powered.includes('bell'), true);
  assert.ok(model.drainEvents().some(event => event.type === 'power' && event.from === 'dew' && event.to === 'bell' && event.layer === 1));
  assert.ok(model.snapshot().availableNodes.includes('bell'));
});

test('risk traversal oscillates inside base layer support and can be corrected at multiple frame rates', () => {
  for (const frameTime of [1 / 30, 1 / 60, 1 / 120]) {
    const idle = start(); idle.setRisk(true); idle.move();
    for (let t = 0; t < 2.6; t += frameTime) idle.update(frameTime);
    assert.equal(idle.snapshot().stats.failures, 1);
    assert.equal(idle.snapshot().carried, 0);
  }
  const model = start(); model.setRisk(true); model.move();
  const centers = [];
  for (let t = 0; t < 2.51; t += DT) {
    if (model.snapshot().travel) { const range = model.snapshot().range; centers.push(range.center); model.setW(range.center); }
    model.update(DT);
  }
  assert.ok(Math.max(...centers) - Math.min(...centers) > .1);
  assert.equal(model.snapshot().node, 'dew');
  assert.equal(model.snapshot().carried, 3);
  assert.equal(model.snapshot().charge, 1);
  assert.equal(model.snapshot().combo, 1);
  assert.ok(model.snapshot().nodes.find(node => node.id === 'dew').present);
  travel(model, 'hub', true);
  assert.equal(model.snapshot().combo, 2);
  assert.equal(model.snapshot().charge, 1, 'rank 1 capacity cannot overflow');
});

test('travel failure restores its actual source snapshot and only short W errors recover', () => {
  const model = start(); travel(model, 'dew'); fall(model, 'hub');
  assert.equal(model.snapshot().node, 'dew');
  assert.equal(model.snapshot().w, .18);
  assert.equal(model.snapshot().lives, 2);
  assert.equal(model.snapshot().stats.failures, 1);
  const corrected = start(); corrected.setRisk(true); corrected.move(); corrected.setW(1); advance(corrected, .2);
  assert.ok(corrected.snapshot().travel.stability > .6 && corrected.snapshot().travel.stability < .8);
  advance(corrected, 2.4, true);
  assert.equal(corrected.snapshot().node, 'dew');
  assert.equal(corrected.snapshot().carried, 3);
});

test('late W shifts cannot collect a landing reward through an absent destination', () => {
  const model = start();
  model.move(); advance(model, 1.3);
  model.setW(.82); advance(model, .1);
  assert.equal(model.snapshot().node, 'hub');
  assert.equal(model.snapshot().travel.progress, 1);
  assert.equal(model.snapshot().carried, 0);
  model.setW(.18); advance(model, .02);
  assert.equal(model.snapshot().node, 'dew');
  assert.equal(model.snapshot().carried, 1, 'correcting within grace permits a real landing');
});

test('directed reward claims bank once; safe claims cannot later mint risk pulses or combo', () => {
  const model = start(); travel(model, 'dew'); travel(model, 'hub');
  assert.equal(model.snapshot().carried, 2); model.interact();
  travel(model, 'dew', true); travel(model, 'hub', true);
  assert.equal(model.snapshot().banked, 2);
  assert.equal(model.snapshot().carried, 0);
  assert.equal(model.snapshot().combo, 0);
  assert.equal(model.snapshot().charge, 0);
  fall(model, 'dew');
  assert.equal(model.snapshot().banked, 2);
  travel(model, 'dew'); travel(model, 'hub');
  assert.equal(model.snapshot().carried, 0);
});

test('unbanked loss can be reearned but never remints its one-time pulse', () => {
  const model = start(); travel(model, 'dew', true); travel(model, 'hub');
  assert.equal(model.snapshot().charge, 1);
  fall(model, 'dew');
  assert.equal(model.snapshot().charge, 0); assert.equal(model.snapshot().carried, 0);
  travel(model, 'dew', true);
  assert.equal(model.snapshot().carried, 3); assert.equal(model.snapshot().charge, 0);
});

test('shell protects currency and claim IDs exactly once and does not protect pulse/combo', () => {
  const model = start('shell'); travel(model, 'dew', true); travel(model, 'hub');
  const carried = model.snapshot().carried;
  fall(model, 'dew');
  assert.equal(model.snapshot().lives, 3); assert.equal(model.snapshot().carried, carried);
  assert.equal(model.snapshot().shield, false); assert.equal(model.snapshot().combo, 0);
  assert.ok(model.drainEvents().some(event => event.type === 'fail' && event.protected));
  travel(model, 'dew', true); travel(model, 'hub');
  assert.equal(model.snapshot().carried, carried);
  assert.equal(model.chooseRelic('shell'), false);
  fall(model, 'dew');
  assert.equal(model.snapshot().lives, 2); assert.equal(model.snapshot().carried, 0);
});

test('prism only spends charge on a powered, unactivated mechanism in the current layer from an anchor', () => {
  const model = start();
  assert.equal(model.useAbility('prism'), false);
  travel(model, 'dew', true);
  assert.equal(model.useAbility('prism'), false, 'must use at hub or relay');
  travel(model, 'hub'); model.setW(.5);
  assert.equal(model.useAbility('prism'), false, 'bell has not received power');
  assert.equal(model.snapshot().charge, 1);
  model.setW(.18); assert.equal(model.useAbility('prism'), true);
  assert.deepEqual(model.snapshot().activated, ['dew']);
  assert.equal(model.snapshot().charge, 0);
  assert.equal(model.useAbility('prism'), false);
  assert.equal(model.snapshot().edges.find(edge => edge.id === 'hub-relay').open, false, 'does not invent permanent shortcuts');
  advance(model, .51);
  travel(model, 'bell', true); travel(model, 'hub');
  assert.equal(model.useAbility('prism'), true);
  assert.ok(model.snapshot().activated.includes('bell'));
});

test('passive power and ghost expiry preserve an explicitly selected valid destination', () => {
  const prism = start();
  travel(prism, 'dew', true); prism.interact(); prism.setW(.5); advance(prism, .51); travel(prism, 'hub');
  assert.equal(prism.useAbility('prism'), true, 'remote bell activation queues bloom power');
  assert.equal(prism.select('vault'), true);
  advance(prism, .51);
  assert.ok(prism.snapshot().powered.includes('bloom'));
  assert.equal(prism.snapshot().selected, 'vault', 'incoming power cannot replace optional destination');
  const shadow = start('shadow');
  travel(shadow, 'dew'); shadow.interact(); shadow.useAbility('shadow');
  shadow.setW(.5); advance(shadow, .51); shadow.interact(); travel(shadow, 'hub');
  assert.equal(shadow.select('vault'), true);
  advance(shadow, 12);
  assert.equal(shadow.snapshot().ghost, null);
  assert.equal(shadow.snapshot().selected, 'vault', 'irrelevant shortcut expiry cannot replace destination');
});

test('shadow at one layer holds a real bridge in another, expires, and honors a committed segment', () => {
  const model = start('shadow');
  assert.equal(model.useAbility('shadow'), false);
  travel(model, 'dew'); model.interact();
  assert.equal(model.useAbility('shadow'), true);
  assert.equal(model.snapshot().carried, 0);
  assert.equal(model.snapshot().ghost.layer, 0);
  assert.equal(model.snapshot().ghost.duration, 12);
  model.setW(.5); advance(model, .51); model.interact();
  assert.equal(model.snapshot().ghost.node, 'dew');
  assert.ok(model.snapshot().availableNodes.includes('relay'));
  advance(model, 11.3);
  assert.ok(model.snapshot().shadowRemaining > 0 && model.snapshot().shadowRemaining < .3);
  model.select('relay'); assert.equal(model.move(), true);
  advance(model, .3, true);
  assert.equal(model.snapshot().ghost, null);
  const committed = model.snapshot().edges.find(edge => edge.id === 'shadow-bell-relay');
  assert.equal(committed.committed, true); assert.equal(committed.open, false);
  advance(model, 1.1, true);
  assert.equal(model.snapshot().node, 'relay'); assert.equal(model.snapshot().lives, 3);
  assert.equal(model.snapshot().availableNodes.includes('bell'), false);
  assert.equal(model.snapshot().edges.some(edge => edge.id === 'shadow-bell-relay'), false);
  travel(model, 'bloom'); model.interact();
  assert.equal(model.useAbility('shadow'), false, 'no refresh after expiry');
});

test('early dew shadow cannot strand a player on relay before bell latches permanent routes', () => {
  const model = start('shadow');
  travel(model, 'dew'); model.interact();
  assert.equal(model.useAbility('shadow'), true);
  model.setW(.5); advance(model, .51);
  assert.equal(model.snapshot().node, 'bell');
  assert.equal(model.snapshot().powered.includes('bell'), true);
  assert.equal(model.snapshot().activated.includes('bell'), false);
  assert.equal(model.snapshot().edges.find(edge => edge.id === 'shadow-bell-relay').open, false);
  assert.equal(model.snapshot().availableNodes.includes('relay'), false);
  assert.equal(model.select('relay'), false, 'cannot enter relay while every permanent exit is still locked');
  advance(model, 12);
  assert.equal(model.snapshot().ghost, null);
  assert.equal(model.snapshot().node, 'bell');
  assert.deepEqual(model.snapshot().availableNodes, ['hub']);
  assert.equal(model.interact(), true, 'bell remains operable after the wasted shadow expires');
  travel(model, 'hub'); travel(model, 'relay'); travel(model, 'bloom'); model.interact(); travel(model, 'relay'); travel(model, 'exit');
  assert.equal(model.snapshot().phase, 'interlude');
  assert.equal(model.snapshot().lives, 3);
  assert.equal(model.snapshot().stats.failures, 0);
});

test('bloom shadow creates the second real shortcut and can be deliberately chosen instead of early shadow', () => {
  const model = start('shadow'); powerBell(model); travel(model, 'hub'); travel(model, 'relay'); travel(model, 'bloom'); model.interact();
  assert.equal(model.snapshot().availableNodes.includes('exit'), false);
  assert.equal(model.useAbility('shadow'), true);
  assert.ok(model.snapshot().availableNodes.includes('exit'));
  travel(model, 'exit');
  assert.equal(model.snapshot().phase, 'interlude');
});

test('vault wave has a visible warning, locks other actions, allows W escape, and rewards exactly once', () => {
  const model = start(); openVault(model); model.drainEvents();
  assert.equal(model.snapshot().wave.duration, 2.4);
  assert.equal(model.snapshot().wave.layer, 1);
  assert.equal(model.snapshot().edges.find(edge => edge.id === 'hub-vault').open, false);
  assert.deepEqual(model.snapshot().availableNodes, []);
  assert.equal(model.move(), false); assert.equal(model.interact(), false); assert.equal(model.useAbility(), false);
  assert.equal(model.snapshot().carried, 3);
  model.setW(.82); advance(model, 2.39);
  assert.ok(model.snapshot().wave);
  assert.equal(model.snapshot().carried, 3);
  advance(model, .02);
  assert.equal(model.snapshot().wave, null); assert.equal(model.snapshot().vaultStatus, 'escaped');
  assert.equal(model.snapshot().carried, 7); assert.equal(model.snapshot().combo, 1); assert.equal(model.snapshot().charge, 1);
  const events = model.drainEvents();
  assert.equal(events.filter(event => event.type === 'reward').length, 1);
  assert.equal(events.filter(event => event.type === 'evade').length, 1);
  assert.equal(model.snapshot().edges.find(edge => edge.id === 'hub-vault').open, true);
  model.setW(.5); assert.equal(model.interact(), false);
  advance(model, 3); assert.equal(model.snapshot().carried, 7);
  travel(model, 'hub'); model.interact();
  assert.equal(model.snapshot().banked, 8);
});

test('context guidance follows actual relay layer and the required vault return slice', () => {
  const model = start(); powerBell(model);
  assert.match(model.snapshot().objective, /返回归响台/);
  travel(model, 'hub'); travel(model, 'relay');
  assert.match(model.snapshot().objective, /切到绽放层/);
  assert.equal(model.snapshot().interactAvailable, false);
  assert.doesNotMatch(model.snapshot().interactLabel, /启动/);
  model.setW(.82);
  assert.doesNotMatch(model.snapshot().objective, /切到绽放层/);
  assert.match(model.snapshot().objective, /前往/);
  travel(model, 'hub'); travel(model, 'vault'); model.interact(); model.setW(.82); advance(model, 2.41);
  assert.match(model.snapshot().objective, /先切回回声层/);
  assert.doesNotMatch(model.snapshot().interactLabel, /开启/);
  model.setW(.5);
  assert.equal(model.snapshot().canMove, true);
  assert.match(model.snapshot().objective, /返回桥已恢复/);
});

test('vault fails in source layer or unsupported W gap and shell cannot restore claim eligibility', () => {
  for (const w of [.5, .34, .66, 0, 1]) {
    const model = start('shell'); openVault(model); model.setW(w); advance(model, 2.41);
    assert.equal(model.snapshot().vaultStatus, 'failed', `invalid escape W=${w}`);
    assert.equal(model.snapshot().lives, 3); assert.equal(model.snapshot().shield, false);
    assert.equal(model.snapshot().carried, 3);
    model.setW(.5); assert.equal(model.interact(), false);
    assert.equal(model.snapshot().stats.failures, 1);
    assert.equal(model.snapshot().wave, null);
    assert.equal(model.snapshot().edges.find(edge => edge.id === 'hub-vault').open, true);
  }
  const unprotected = start(); openVault(unprotected); advance(unprotected, 2.41);
  assert.equal(unprotected.snapshot().lives, 2); assert.equal(unprotected.snapshot().carried, 0);
});

test('warning clock is frame-clamped, huge background deltas cannot skip it, and restart cancels it', () => {
  const model = start(); openVault(model);
  const before = model.snapshot().wave.remaining;
  assert.equal(model.update(0), false);
  assert.equal(model.snapshot().wave.remaining, before);
  model.update(86400);
  assert.ok(model.snapshot().wave.remaining > 2.29);
  assert.equal(model.snapshot().vaultStatus, 'warning');
  model.restart();
  assert.equal(model.snapshot().wave, null);
  model.chooseRelic('prism'); advance(model, 3);
  assert.equal(model.snapshot().stats.risks, 0);
  assert.equal(model.snapshot().carried, 0);
});

test('different relics accumulate across rooms and per-room uses refresh without restoring lives or score', () => {
  const model = start('prism'); fall(model, 'dew'); finishRoom(model);
  const banked = model.snapshot().banked;
  assert.equal(model.chooseRelic('shell'), true);
  assert.deepEqual(model.snapshot().relics, { prism: 1, shadow: 0, shell: 1 });
  assert.equal(model.snapshot().lives, 2); assert.equal(model.snapshot().banked, banked);
  fall(model, 'dew'); assert.equal(model.snapshot().lives, 2); assert.equal(model.snapshot().shield, false);
  finishRoom(model); assert.equal(model.chooseRelic('shadow'), true);
  assert.deepEqual(model.snapshot().relics, { prism: 1, shadow: 1, shell: 1 });
  assert.equal(model.snapshot().shield, true);
  assert.equal(model.snapshot().abilities.filter(ability => ability.rank > 0).length, 3);
  travel(model, 'dew', true); assert.equal(model.snapshot().charge, 1, 'earlier prism still works');
  model.interact(); assert.equal(model.useAbility('shadow'), true, 'new shadow joins earlier build');
});

test('repeated picks upgrade shield count, shadow duration and prism capacity rather than replacing the build', () => {
  for (const id of ['prism', 'shadow', 'shell']) {
    const model = start(id);
    for (let rank = 1; rank <= 3; rank++) {
      assert.equal(model.snapshot().relics[id], rank);
      assert.equal(model.snapshot().choices.find(choice => choice.id === id).rank, rank);
      if (id === 'shell') assert.equal(model.snapshot().shieldUses, rank);
      if (id === 'prism' && rank > 1) {
        travel(model, 'dew', true); travel(model, 'hub', true);
        assert.equal(model.snapshot().charge, 2);
      }
      if (id === 'shadow') {
        travel(model, 'dew'); model.interact(); model.useAbility('shadow');
        assert.equal(model.snapshot().ghost.duration, [0, 12, 18, 24][rank]);
        model.setW(.5); advance(model, .51); model.interact(); travel(model, 'hub'); travel(model, 'relay'); travel(model, 'bloom'); model.interact(); travel(model, 'relay'); travel(model, 'exit');
      } else finishRoom(model);
      if (rank < 3) assert.equal(model.chooseRelic(id), true);
    }
    assert.equal(model.snapshot().phase, 'won');
  }
});

test('restart clears committed power, all relic ranks, queues and score; snapshots are deeply isolated', () => {
  const model = start(); travel(model, 'dew'); model.interact(); model.restart();
  assert.deepEqual(model.drainEvents().map(event => event.type), ['restart']);
  model.chooseRelic('shadow'); model.drainEvents(); advance(model, 2);
  assert.deepEqual(model.drainEvents(), []);
  const state = model.snapshot();
  state.nodes[0].world.x = 99; state.nodes[0].center = 99; state.relics.shadow = 99; state.layers[0].center = 99;
  state.edges[0].open = false; state.activated.push('exit'); state.powered.push('bell'); state.stats.failures = 1000;
  assert.equal(model.snapshot().nodes[0].world.x, 0);
  assert.equal(model.snapshot().nodes[0].center, .5);
  assert.deepEqual(model.snapshot().activated, []); assert.deepEqual(model.snapshot().powered, ['dew']);
  assert.equal(model.snapshot().relics.shadow, 1); assert.equal(model.snapshot().relics.prism, 0);
  assert.equal(model.snapshot().layers[0].center, .18); assert.equal(model.snapshot().edges[0].open, true);
  assert.equal(model.snapshot().stats.failures, 0); assert.equal(model.snapshot().banked, 0); assert.equal(model.snapshot().lives, 3);
});

test('invalid deltas/inputs are inert, traversals freeze other actions, and event feedback is bounded', () => {
  const model = start(), state = model.snapshot();
  for (const value of [NaN, Infinity, -Infinity, '0.5', null, undefined]) assert.equal(model.setW(value), false);
  for (const dt of [NaN, Infinity, -Infinity, -1, 0, '5', null]) assert.equal(model.update(dt), false);
  assert.deepEqual(model.snapshot(), state); assert.equal(model.setRisk('false'), false);
  assert.equal(model.move(), true); assert.equal(model.setRisk(true), false); assert.equal(model.select('bell'), false); assert.equal(model.interact(), false);
  model.update(86400); assert.ok(model.snapshot().travel.progress < .08);
  advance(model, 1.4, true);
  for (let i = 0; i < 10000; i++) model.setW(i % 2 ? .18 : .5);
  assert.ok(model.drainEvents().length <= 128);
});

test('three unprotected failures end the run and freeze actions until restart', () => {
  const model = start(); for (let i = 0; i < 3; i++) fall(model, 'dew');
  assert.equal(model.snapshot().phase, 'lost'); assert.equal(model.snapshot().lives, 0);
  const state = model.snapshot();
  for (const action of [() => model.move(), () => model.interact(), () => model.chooseRelic('shell'), () => model.update(1), () => model.setW(.5)]) assert.equal(action(), false);
  assert.deepEqual(model.snapshot(), state);
  model.restart(99); assert.equal(model.snapshot().phase, 'choose'); assert.equal(model.snapshot().seed, 99);
});

for (const relic of RELICS) {
  test(`all three rooms are solvable with ${relic.id} and no ability; room choice pauses time and retains ranks`, () => {
    const model = start(relic.id);
    for (let room = 0; room < 3; room++) {
      const previousBanked = model.snapshot().banked;
      finishRoom(model);
      const state = model.snapshot();
      assert.equal(state.banked, previousBanked + 6);
      assert.equal(state.carried, 0); assert.equal(state.roomScore, 6);
      assert.equal(state.phase, room === 2 ? 'won' : 'interlude'); assert.equal(state.room, room); assert.equal(state.lives, 3);
      assert.equal(model.setW(.5), false); assert.equal(model.update(30), false);
      assert.deepEqual(model.snapshot(), state);
      if (room < 2) {
        assert.equal(model.chooseRelic(relic.id), true);
        assert.equal(model.snapshot().room, room + 1); assert.deepEqual(model.snapshot().activated, []);
        assert.deepEqual(model.snapshot().powered, ['dew']); assert.equal(model.snapshot().banked, state.banked);
        assert.equal(model.snapshot().relics[relic.id], room + 2);
        assert.equal(model.snapshot().roomScore, 0); assert.deepEqual(model.drainEvents().map(event => event.type), ['room']);
      }
    }
    assert.equal(model.snapshot().banked, 18); assert.equal(model.snapshot().stats.chains, 9);
    assert.equal(model.chooseRelic(relic.id), false); assert.ok(model.drainEvents().some(event => event.type === 'win'));
  });
}
