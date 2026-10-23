import test from 'node:test';
import assert from 'node:assert/strict';
import { GameModel, RELICS, LAYERS } from '../src/model.js';
import { start, advance, travel, reach, activateAll, finishRoom, openVault, escapeWave, fall, seedFor } from './model-helpers.js';

function powerBell(model) { travel(model, 'dew'); model.interact(); model.setW(.5); advance(model, .51); assert.equal(model.interact(), true); }

test('choices and invalid inputs are inert outside the playing boundary', () => {
  const model = new GameModel(73);
  for (const action of [() => model.move(), () => model.setW(.3), () => model.useAbility(), () => model.interact(), () => model.chooseRelic('invalid')]) assert.equal(action(), false);
  model.chooseRelic('prism'); const state = model.snapshot();
  for (const value of [NaN, Infinity, -Infinity, '0.5', null, undefined]) assert.equal(model.setW(value), false);
  for (const dt of [NaN, Infinity, -Infinity, -1, 0, '5', null]) assert.equal(model.update(dt), false);
  assert.deepEqual(model.snapshot(), state); assert.equal(model.setRisk('false'), false);
});

test('continuous sections drive actual support and all anchors remain stable across W', () => {
  const model = start();
  for (const [w, expected] of [[.18, 1], [.26, Math.sqrt(.75)], [.34, 0]]) {
    model.setW(w); const node = model.snapshot().nodes.find(node => node.id === 'dew');
    assert.ok(Math.abs(node.visibility - expected) < 1e-7); assert.equal(node.scale, node.visibility); assert.equal(node.present, expected >= .5);
  }
  for (const w of [0, .34, .66, 1]) { model.setW(w); advance(model, 1.2); assert.equal(model.snapshot().node, 'hub'); assert.equal(model.snapshot().lives, 3); assert.equal(model.snapshot().canMove, false); }
});

test('same XYZ transfer changes entity without reward and still needs delayed power', () => {
  const model = start(); travel(model, 'dew'); const value = model.snapshot().carried;
  model.setW(.5); assert.equal(model.snapshot().node, 'bell'); assert.equal(model.interact(), false); assert.equal(model.snapshot().carried, value);
  model.setW(.18); assert.equal(model.interact(), true); model.setW(.5); advance(model, .49); assert.equal(model.interact(), false);
  advance(model, .02); assert.equal(model.interact(), true);
  for (let i = 0; i < 100; i++) model.setW(i % 2 ? .18 : .5);
  assert.equal(model.snapshot().carried, value); assert.equal(model.snapshot().stats.chains, 2);
});

test('unsupported slice gives recoverable grace then returns to the last anchor', () => {
  const model = start(); travel(model, 'dew'); model.setW(.82); advance(model, .45);
  assert.ok(Math.abs(model.snapshot().phaseStability - .5) < .01); assert.equal(model.interact(), false);
  model.setW(.18); advance(model, .3); assert.equal(model.snapshot().phaseStability, 1);
  model.setW(.82); advance(model, .91); assert.equal(model.snapshot().node, 'hub'); assert.equal(model.snapshot().w, .18); assert.equal(model.snapshot().lives, 2);
});

test('real graph gates require activation and the exit requires all three mechanisms', () => {
  const model = start(); assert.deepEqual(model.snapshot().availableNodes, ['dew']); assert.equal(model.select('exit'), false);
  travel(model, 'dew'); model.interact(); model.setW(.5); advance(model, .51);
  assert.equal(model.snapshot().edges.find(edge => edge.id === 'hub-relay').open, false);
  model.interact(); travel(model, 'hub'); model.setW(.82); model.select('relay'); assert.equal(model.move(), false);
  reach(model, 'bloom'); model.interact(); assert.equal(model.snapshot().nodes.find(node => node.id === 'exit').locked, false);
});

test('committed power survives failure before delivery, without reviving cancelled celebrations', () => {
  const model = start(); travel(model, 'dew'); model.setW(.82); advance(model, .65); model.setW(.18); model.interact(); model.setW(.82); advance(model, .26);
  assert.equal(model.snapshot().node, 'hub'); assert.deepEqual(model.snapshot().activated, ['dew']); assert.equal(model.snapshot().powered.includes('bell'), false);
  const events = model.drainEvents(); assert.ok(events.some(event => event.type === 'fail')); assert.equal(events.some(event => ['chain', 'reward', 'unlock', 'activate'].includes(event.type)), false);
  advance(model, .25); assert.ok(model.snapshot().powered.includes('bell')); assert.ok(model.drainEvents().some(event => event.type === 'power' && event.complete));
});

test('a power delivery and failure in the same frame preserve authoritative power event', () => {
  const model = start(); travel(model, 'dew'); model.setW(.82); advance(model, .4); model.setW(.18); model.interact(); model.setW(.82); model.drainEvents(); advance(model, .51);
  const events = model.drainEvents(); assert.ok(events.some(event => event.type === 'power')); assert.ok(events.some(event => event.type === 'fail')); assert.ok(model.snapshot().powered.includes('bell'));
});

test('risk traversal requires correction across frame rates and awards a bounded pulse', () => {
  for (const dt of [1 / 30, 1 / 60, 1 / 120]) { const idle = start(); idle.setRisk(true); idle.move(); advance(idle, 2.6, false, dt); assert.equal(idle.snapshot().stats.failures, 1); }
  const model = start(); travel(model, 'dew', true); assert.equal(model.snapshot().charge, 1); assert.equal(model.snapshot().carried, 3);
  travel(model, 'hub', true); assert.equal(model.snapshot().combo, 2); assert.equal(model.snapshot().charge, 1);
});

test('travel failure restores actual source; brief errors can recover and late landing cannot bypass W', () => {
  const model = start(); travel(model, 'dew'); fall(model, 'hub'); assert.equal(model.snapshot().node, 'dew'); assert.equal(model.snapshot().w, .18);
  const late = start(); late.move(); advance(late, 1.3); late.setW(.82); advance(late, .1); assert.equal(late.snapshot().travel.progress, 1); assert.equal(late.snapshot().carried, 0);
  late.setW(.18); advance(late, .02); assert.equal(late.snapshot().node, 'dew'); assert.equal(late.snapshot().carried, 1);
});

test('banked directed claims cannot be farmed or converted later into risk pulses', () => {
  const model = start(); travel(model, 'dew'); travel(model, 'hub'); model.interact(); travel(model, 'dew', true); travel(model, 'hub', true);
  assert.equal(model.snapshot().banked, 2); assert.equal(model.snapshot().carried, 0); assert.equal(model.snapshot().combo, 0); assert.equal(model.snapshot().charge, 0);
  fall(model, 'dew'); travel(model, 'dew'); travel(model, 'hub'); assert.equal(model.snapshot().carried, 0); assert.equal(model.snapshot().banked, 2);
});

test('unbanked currency can be reearned after loss but its one-time pulse cannot', () => {
  const model = start(); travel(model, 'dew', true); travel(model, 'hub'); fall(model, 'dew'); travel(model, 'dew', true);
  assert.equal(model.snapshot().carried, 3); assert.equal(model.snapshot().charge, 0);
});

test('shell preserves claim identities once, while pulse and combo still disappear', () => {
  const model = start('shell'); travel(model, 'dew', true); travel(model, 'hub'); const value = model.snapshot().carried; fall(model, 'dew');
  assert.equal(model.snapshot().carried, value); assert.equal(model.snapshot().lives, 3); assert.equal(model.snapshot().shield, false); assert.equal(model.snapshot().combo, 0);
  travel(model, 'dew', true); travel(model, 'hub'); assert.equal(model.snapshot().carried, value); fall(model, 'dew'); assert.equal(model.snapshot().carried, 0); assert.equal(model.snapshot().lives, 2);
});

test('prism needs anchor, stored charge, complete prerequisites and matching W', () => {
  const model = start(); travel(model, 'dew', true); assert.equal(model.useAbility('prism'), false); travel(model, 'hub'); model.setW(.5); assert.equal(model.useAbility('prism'), false);
  model.setW(.18); assert.equal(model.useAbility('prism'), true); assert.equal(model.snapshot().charge, 0); assert.deepEqual(model.snapshot().activated, ['dew']);
  assert.equal(model.snapshot().edges.find(edge => edge.id === 'hub-relay').open, false);
});

test('passive power and ghost expiry do not overwrite explicit available destinations', () => {
  const model = start('shadow'); travel(model, 'dew'); model.interact(); model.useAbility('shadow'); model.setW(.5); advance(model, .51); model.interact(); travel(model, 'hub');
  assert.equal(model.select('vault'), true); advance(model, 12); assert.equal(model.snapshot().selected, 'vault');
  assert.equal(model.snapshot().ghost, null); assert.ok(model.snapshot().powered.includes('bloom'));
});

test('shadow shortcut waits for permanent escape and survives expiry only for its committed segment', () => {
  const model = start('shadow'); travel(model, 'dew'); model.interact(); assert.equal(model.useAbility('shadow'), true); model.setW(.5); advance(model, .51);
  assert.equal(model.snapshot().edges.find(edge => edge.kind === 'shadow').open, false); assert.equal(model.select('relay'), false);
  model.interact(); advance(model, 11.3); model.select('relay'); assert.equal(model.move(), true); advance(model, .3);
  assert.equal(model.snapshot().ghost, null); const edge = model.snapshot().edges.find(edge => edge.kind === 'shadow'); assert.equal(edge.committed, true); assert.equal(edge.open, false);
  advance(model, 1.1); assert.equal(model.snapshot().node, 'relay'); assert.equal(model.snapshot().lives, 3); assert.equal(model.snapshot().edges.some(item => item.kind === 'shadow'), false);
  finishRoom(model); assert.equal(model.snapshot().phase, 'interlude');
});

test('late bloom shadow changes the exit route without consuming another relic', () => {
  const model = start('shadow'); powerBell(model); reach(model, 'bloom'); model.interact(); assert.equal(model.snapshot().availableNodes.includes('exit'), false);
  assert.equal(model.useAbility('shadow'), true); travel(model, 'exit'); assert.equal(model.snapshot().phase, 'interlude');
});

for (const variant of ['single', 'chase', 'lock']) {
  test(`${variant} challenge locks bypass actions, requires every wave, rewards once and restores its entry-layer bridge`, () => {
    const model = start('prism', seedFor('cascade', variant)); openVault(model); model.drainEvents(); const before = model.snapshot().carried;
    assert.deepEqual(model.snapshot().availableNodes, []); assert.equal(model.move(), false); assert.equal(model.interact(), false); assert.equal(model.useAbility(), false); assert.equal(model.setRisk(true), false);
    const first = model.snapshot().wave; assert.equal(first.steps, variant === 'chase' ? 2 : 1); assert.equal(first.dangerLayers.length, variant === 'lock' ? 2 : 1);
    if (variant === 'chase') { const safe = first.safeLayers[0]; model.setW(LAYERS[safe].center); advance(model, first.duration + .001); assert.equal(model.snapshot().wave.step, 2); assert.deepEqual(model.snapshot().wave.dangerLayers, [safe]); assert.equal(model.snapshot().carried, before); }
    escapeWave(model); const state = model.snapshot(); assert.equal(state.carried, before + state.roomChallenge.reward); assert.equal(state.vaultStatus, 'escaped'); assert.equal(state.charge, 1);
    const events = model.drainEvents(); assert.equal(events.filter(event => event.type === 'reward').length, 1); assert.equal(events.filter(event => event.type === 'evade').length, 1); assert.equal(events.filter(event => event.type === 'dodge').length, variant === 'chase' ? 1 : 0);
    model.setW(LAYERS[state.roomChallenge.entryLayer].center); assert.equal(model.interact(), false); travel(model, 'hub'); model.interact(); const banked = model.snapshot().banked;
    travel(model, 'vault'); assert.equal(model.interact(), false); advance(model, 6); assert.equal(model.snapshot().banked, banked);
  });
  test(`${variant} challenge fails in dangerous or unsupported gap layers, including with shell`, () => {
    for (const gap of [false, true]) { const model = start('shell', seedFor('cascade', variant)); openVault(model); const wave = model.snapshot().wave; const value = model.snapshot().carried;
      model.setW(gap ? .34 : LAYERS[wave.dangerLayers[0]].center); advance(model, wave.duration + .01);
      assert.equal(model.snapshot().vaultStatus, 'failed'); assert.equal(model.snapshot().wave, null); assert.equal(model.snapshot().lives, 3); assert.equal(model.snapshot().carried, value); assert.equal(model.snapshot().shield, false); assert.equal(model.interact(), false);
    }
  });
}

test('chase gives no partial reward and can fail its second wave', () => {
  const model = start('prism', seedFor('cascade', 'chase')); openVault(model); const wave = model.snapshot().wave; model.setW(LAYERS[wave.safeLayers[0]].center); advance(model, 2.41);
  assert.equal(model.snapshot().wave.step, 2); advance(model, 2.41); assert.equal(model.snapshot().vaultStatus, 'failed'); assert.equal(model.snapshot().carried, 0); assert.equal(model.snapshot().lives, 2);
});

test('wave clock pauses without updates, clamps background deltas, and is cancelled by restart', () => {
  const model = start(); openVault(model); const state = model.snapshot(); model.update(0); assert.deepEqual(model.snapshot(), state);
  model.update(86400); assert.ok(model.snapshot().wave.remaining > state.wave.duration - .11); model.restart(); assert.equal(model.snapshot().wave, null);
  model.chooseRelic('prism'); advance(model, 3); assert.equal(model.snapshot().carried, 0); assert.equal(model.snapshot().stats.risks, 0);
});

test('different relics accumulate while per-room uses reset and life/bank remain', () => {
  const model = start(); fall(model, 'dew'); finishRoom(model); const bank = model.snapshot().banked; model.chooseRelic('shell');
  assert.deepEqual(model.snapshot().relics, { prism: 1, shadow: 0, shell: 1, coil: 0, weave: 0 }); assert.equal(model.snapshot().lives, 2); assert.equal(model.snapshot().banked, bank);
  fall(model); assert.equal(model.snapshot().shield, false); finishRoom(model); model.chooseRelic('shadow'); assert.deepEqual(model.snapshot().relics, { prism: 1, shadow: 1, shell: 1, coil: 0, weave: 0 }); assert.equal(model.snapshot().shield, true);
});

for (const relic of RELICS) test(`${relic.id} upgrades persist through three different rooms with no ability required to win`, () => {
  const model = start(relic.id);
  for (let room = 0; room < 3; room++) {
    assert.equal(model.snapshot().relics[relic.id], room + 1); if (relic.id === 'shell') assert.equal(model.snapshot().shieldUses, room + 1);
    finishRoom(model); const state = model.snapshot(); assert.equal(state.phase, room === 2 ? 'won' : 'interlude'); assert.equal(state.lives, 3); assert.equal(state.carried, 0); assert.equal(model.update(3), false); assert.deepEqual(model.snapshot(), state);
    if (room < 2) { const preview = state.nextRoom; model.chooseRelic(relic.id); assert.equal(model.snapshot().roomSignature, preview.signature); }
  }
  assert.equal(model.snapshot().stats.chains, 9); assert.equal(model.chooseRelic(relic.id), false);
});

test('restart clears power, relics, queues and score; snapshots deeply isolate added plan and wave fields', () => {
  const model = start(); travel(model, 'dew'); model.interact(); model.restart(); assert.deepEqual(model.drainEvents().map(event => event.type), ['restart']); model.chooseRelic('shadow'); model.drainEvents(); advance(model, 2); assert.deepEqual(model.drainEvents(), []);
  const state = model.snapshot(); state.nodes[0].world.x = 99; state.nodes[1].required.push('exit'); state.nodes[1].received.push('exit'); state.relics.shadow = 99; state.roomPlan[0].name = 'bad'; state.roomChallenge.reward = 99; state.mechanismOrder.push('exit');
  assert.notEqual(model.snapshot().nodes[0].world.x, 99); assert.equal(model.snapshot().nodes[1].required.includes('exit'), false); assert.equal(model.snapshot().roomPlan[0].name === 'bad', false); assert.equal(model.snapshot().relics.shadow, 1); assert.equal(model.snapshot().mechanismOrder.length, 3);
});

test('three unprotected failures end a run; events stay bounded and huge deltas cannot skip travel', () => {
  const model = start(); model.move(); model.update(86400); assert.ok(model.snapshot().travel.progress < .08); advance(model, 1.4);
  for (let i = 0; i < 10000; i++) model.setW(i % 2 ? .18 : .5); assert.ok(model.drainEvents().length <= 128);
  model.restart(); model.chooseRelic('prism'); for (let i = 0; i < 3; i++) fall(model, 'dew'); const state = model.snapshot(); assert.equal(state.phase, 'lost');
  for (const action of [() => model.move(), () => model.interact(), () => model.chooseRelic('shell'), () => model.update(1), () => model.setW(.5)]) assert.equal(action(), false); assert.deepEqual(model.snapshot(), state);
});
