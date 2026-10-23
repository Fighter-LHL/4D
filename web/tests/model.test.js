import test from 'node:test';
import assert from 'node:assert/strict';
import { GameModel, RELICS, NODES, ROOM_NAMES } from '../src/model.js';

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
  assert.equal(model.select(target), true, `route to ${target} is available`);
  assert.equal(model.setW(model.snapshot().range.center), true);
  assert.equal(model.move(), true);
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

function finishRoom(model) {
  for (const node of ['dew', 'bell', 'bloom']) {
    if (!model.snapshot().activated.includes(node)) {
      travel(model, node);
      assert.equal(model.interact(), true);
      travel(model, 'hub');
    }
  }
  travel(model, 'exit');
}

test('starts with safe choice boundary and deterministic seeded per-room centers', () => {
  const model = new GameModel(73);
  assert.equal(model.snapshot().phase, 'choose');
  assert.equal(model.move(), false);
  assert.equal(model.setW(.3), false);
  assert.equal(model.useAbility(), false);
  assert.equal(model.chooseRelic('invalid'), false);
  assert.deepEqual(model.snapshot().nodes, new GameModel(73).snapshot().nodes);
  assert.notDeepEqual(model.snapshot().nodes, new GameModel(74).snapshot().nodes);
  assert.equal(ROOM_NAMES.length, 3);
  assert.equal(NODES.length, 5);
  assert.equal(RELICS.length, 3);
});

test('selected adjacency and W govern departure; locked exit cannot be bypassed', () => {
  const model = start();
  assert.equal(model.select('exit'), false);
  assert.equal(model.select('not-a-node'), false);
  model.setW(1);
  assert.equal(model.snapshot().canMove, false);
  assert.equal(model.move(), false);
  travel(model, 'dew');
  assert.deepEqual(model.snapshot().availableNodes, ['hub']);
  assert.equal(model.select('bell'), false);
  assert.equal(model.useAbility(), false);
});

test('risk range really changes; following it succeeds and yields a three-tier combo', () => {
  const model = start();
  const centers = [];
  model.setRisk(true);
  model.setW(model.snapshot().range.center);
  model.move();
  for (let t = 0; t < 2.51; t += DT) {
    centers.push(model.snapshot().range.center);
    if (model.snapshot().travel) model.setW(model.snapshot().range.center);
    model.update(DT);
  }
  assert.ok(Math.max(...centers) - Math.min(...centers) > .1);
  assert.equal(model.snapshot().carried, 3);
  assert.equal(model.snapshot().charge, 1);
  assert.equal(model.snapshot().combo, 1);
  travel(model, 'hub', true);
  travel(model, 'bell', true);
  travel(model, 'hub', true);
  assert.equal(model.snapshot().combo, 3);
  assert.equal(model.snapshot().stats.risks, 4);
});

test('moving out of W range fails safe travel too; failure returns to its actual source', () => {
  const model = start();
  travel(model, 'dew');
  fall(model, 'hub');
  const state = model.snapshot();
  assert.equal(state.node, 'dew');
  assert.equal(state.lives, 2);
  assert.equal(state.carried, 0);
  assert.equal(state.combo, 0);
  assert.equal(state.stats.failures, 1);
});

test('risk requires correction: fixed starting W fails but a short error can be recovered', () => {
  for (const frameTime of [1 / 30, 1 / 60, 1 / 120]) {
    const idle = start();
    idle.setRisk(true);
    idle.move();
    for (let t = 0; t < 2.6; t += frameTime) idle.update(frameTime);
    assert.equal(idle.snapshot().stats.failures, 1, `fixed W must fail at ${Math.round(1 / frameTime)} fps`);
    assert.equal(idle.snapshot().carried, 0);
  }
  const corrected = start();
  corrected.setRisk(true);
  corrected.move();
  corrected.setW(1);
  advance(corrected, .2);
  assert.ok(corrected.snapshot().travel.stability > .6);
  assert.ok(corrected.snapshot().travel.stability < .8);
  advance(corrected, 2.4, true);
  assert.equal(corrected.snapshot().node, 'dew');
  assert.equal(corrected.snapshot().carried, 3);
  assert.equal(corrected.snapshot().stats.failures, 0);
});

test('each direction pays once across repeated movement and banked rewards survive failure', () => {
  const model = start();
  travel(model, 'dew');
  travel(model, 'hub');
  assert.equal(model.snapshot().carried, 2);
  assert.equal(model.interact(), true);
  assert.equal(model.snapshot().banked, 2);
  travel(model, 'dew', true);
  travel(model, 'hub', true);
  assert.equal(model.snapshot().carried, 0);
  assert.equal(model.snapshot().combo, 0, 'banked directions cannot farm success tiers');
  assert.equal(model.snapshot().charge, 0, 'safe-claimed directions cannot mint later risk pulses');
  travel(model, 'bell');
  fall(model, 'hub');
  assert.equal(model.snapshot().banked, 2);
  travel(model, 'hub');
  travel(model, 'dew');
  travel(model, 'hub');
  assert.equal(model.snapshot().carried, 1, 'only the never-banked bell return pays');
});

test('mixed relic choices preserve banked score, spent lives, and cumulative statistics across rooms', () => {
  const model = start('prism');
  fall(model, 'dew');
  finishRoom(model);
  const banked = model.snapshot().banked;
  assert.equal(model.chooseRelic('shell'), true);
  assert.equal(model.snapshot().lives, 2);
  assert.equal(model.snapshot().stats.failures, 1);
  assert.equal(model.snapshot().stats.chains, 3);
  assert.equal(model.snapshot().banked, banked);
  fall(model, 'dew');
  assert.equal(model.snapshot().lives, 2);
  assert.equal(model.snapshot().shield, false);
  finishRoom(model);
  assert.equal(model.chooseRelic('shadow'), true);
  assert.equal(model.snapshot().lives, 2);
  assert.equal(model.snapshot().stats.failures, 2);
  assert.equal(model.snapshot().shield, false);
  assert.equal(model.snapshot().abilityAvailable, false);
  finishRoom(model);
  assert.equal(model.snapshot().phase, 'won');
  assert.equal(model.snapshot().banked, 21);
});

test('unprotected loss allows lost currency to be reearned but never remints its risk pulse', () => {
  const model = start();
  travel(model, 'dew', true);
  travel(model, 'hub');
  assert.equal(model.snapshot().charge, 1);
  fall(model, 'bell');
  assert.equal(model.snapshot().charge, 0);
  assert.equal(model.snapshot().carried, 0);
  travel(model, 'dew', true);
  assert.equal(model.snapshot().carried, 3);
  assert.equal(model.snapshot().charge, 0);
});

test('shell preserves carried currency, its claim IDs, and one life exactly once', () => {
  const model = start('shell');
  travel(model, 'dew', true);
  travel(model, 'hub');
  const carried = model.snapshot().carried;
  fall(model, 'bell');
  assert.equal(model.snapshot().lives, 3);
  assert.equal(model.snapshot().carried, carried);
  assert.equal(model.snapshot().shield, false);
  assert.equal(model.snapshot().combo, 0);
  assert.ok(model.drainEvents().some(event => event.type === 'fail' && event.protected));
  travel(model, 'dew', true);
  travel(model, 'hub');
  assert.equal(model.snapshot().carried, carried, 'preserved claim IDs prevent duplication');
  fall(model, 'bell');
  assert.equal(model.snapshot().lives, 2);
  assert.equal(model.snapshot().carried, 0);
  assert.equal(model.chooseRelic('shell'), false, 'cannot re-equip mid-room to refresh shield');
});

test('prism spends exactly one pulse, activates a real mechanism, and permanently opens outer paths', () => {
  const model = start();
  assert.equal(model.useAbility(), false);
  travel(model, 'dew', true);
  travel(model, 'hub');
  assert.equal(model.snapshot().abilityAvailable, true);
  assert.equal(model.useAbility(), true);
  assert.equal(model.useAbility(), false);
  assert.equal(model.snapshot().charge, 0);
  assert.deepEqual(model.snapshot().activated, ['dew']);
  assert.equal(model.snapshot().shortcut, true);
  travel(model, 'dew');
  assert.ok(model.snapshot().availableNodes.includes('bell'));
  travel(model, 'bell');
  assert.equal(model.interact(), true);
  fall(model, 'hub');
  assert.equal(model.snapshot().shortcut, true, 'permanent physical unlock survives failure');
  assert.deepEqual(model.snapshot().activated, ['dew', 'bell']);
});

test('shadow charges currency once, expires, and honors a crossing committed before timeout', () => {
  const model = start('shadow');
  assert.equal(model.useAbility(), false);
  travel(model, 'dew');
  travel(model, 'hub');
  assert.equal(model.useAbility(), true);
  assert.equal(model.snapshot().carried, 1);
  assert.equal(model.useAbility(), false);
  travel(model, 'dew');
  advance(model, 5.4);
  assert.ok(model.snapshot().shadowRemaining > 0 && model.snapshot().shadowRemaining < .3);
  travel(model, 'bell');
  assert.equal(model.snapshot().shortcut, false);
  assert.equal(model.snapshot().lives, 3);
  assert.deepEqual(model.snapshot().availableNodes, ['hub']);
  assert.equal(model.select('bloom'), false);
  travel(model, 'hub');
  assert.equal(model.useAbility(), false, 'no refresh after expiry');
});

test('only genuine activation unlocks exit; activation is idempotent and timed feedback bounded', () => {
  const model = start('shell');
  for (const [index, node] of ['dew', 'bell', 'bloom'].entries()) {
    travel(model, node);
    model.drainEvents();
    assert.equal(model.interact(), true);
    assert.equal(model.interact(), false);
    const first = model.drainEvents();
    assert.equal(first.filter(event => event.type === 'chain').length, 1);
    assert.equal(first.filter(event => event.type === 'unlock').length, index === 2 ? 1 : 0);
    advance(model, .51);
    assert.equal(model.drainEvents().filter(event => event.type === 'chain').length, 2);
    travel(model, 'hub');
    assert.equal(model.snapshot().availableNodes.includes('exit'), index === 2);
  }
  assert.equal(model.snapshot().stats.chains, 3);
});

test('restart clears pending cues and run state; snapshots cannot mutate model state', () => {
  const model = start();
  travel(model, 'dew');
  model.interact();
  model.restart();
  assert.deepEqual(model.drainEvents().map(event => event.type), ['restart']);
  model.chooseRelic('shadow');
  model.drainEvents();
  advance(model, 2);
  assert.deepEqual(model.drainEvents(), []);
  const state = model.snapshot();
  state.nodes[0].center = 99;
  state.activated.push('exit');
  state.stats.failures = 1000;
  assert.equal(model.snapshot().nodes[0].center, .5);
  assert.deepEqual(model.snapshot().activated, []);
  assert.equal(model.snapshot().stats.failures, 0);
  assert.equal(model.snapshot().banked, 0);
  assert.equal(model.snapshot().lives, 3);
});

test('failure removes pending success cues without rolling back actual activation', () => {
  const model = start('prism');
  travel(model, 'dew');
  model.interact();
  // Feedback not yet drained by a stalled view must not play victory after a fall.
  fall(model, 'hub');
  const events = model.drainEvents();
  assert.ok(events.some(event => event.type === 'fail'));
  assert.equal(events.some(event => ['chain', 'reward', 'unlock', 'activate'].includes(event.type)), false);
  assert.deepEqual(model.snapshot().activated, ['dew']);
  advance(model, 1);
  assert.deepEqual(model.drainEvents(), []);
});

test('invalid deltas/inputs are inert; huge deltas are clamped rather than skipping a crossing', () => {
  const model = start();
  const state = model.snapshot();
  for (const value of [NaN, Infinity, -Infinity, '0.5', null, undefined]) assert.equal(model.setW(value), false);
  for (const dt of [NaN, Infinity, -Infinity, -1, 0, '5', null]) assert.equal(model.update(dt), false);
  assert.deepEqual(model.snapshot(), state);
  assert.equal(model.setRisk('false'), false);
  assert.equal(model.move(), true);
  assert.equal(model.setRisk(true), false);
  assert.equal(model.select('bell'), false);
  assert.equal(model.interact(), false);
  model.update(86400);
  assert.ok(model.snapshot().travel.progress < .08);
  assert.equal(model.snapshot().lives, 3);
});

test('input spam has a fixed feedback bound', () => {
  const model = start();
  for (let i = 0; i < 10000; i++) model.select(i % 2 ? 'dew' : 'bell');
  assert.ok(model.drainEvents().length <= 128);
});

test('three unprotected failures end the run; all actions freeze until restart', () => {
  const model = start();
  for (let i = 0; i < 3; i++) fall(model, 'dew');
  assert.equal(model.snapshot().phase, 'lost');
  assert.equal(model.snapshot().lives, 0);
  const state = model.snapshot();
  assert.equal(model.move(), false);
  assert.equal(model.interact(), false);
  assert.equal(model.chooseRelic('shell'), false);
  assert.equal(model.update(1), false);
  assert.deepEqual(model.snapshot(), state);
  model.restart(99);
  assert.equal(model.snapshot().phase, 'choose');
  assert.equal(model.snapshot().seed, 99);
});

for (const relic of RELICS) {
  test(`all three courtyards are solvable with ${relic.id}, without requiring its ability`, () => {
    const model = start(relic.id);
    for (let room = 0; room < 3; room++) {
      const previousBanked = model.snapshot().banked;
      const previousNodes = model.snapshot().nodes;
      finishRoom(model);
      const state = model.snapshot();
      assert.equal(state.banked, previousBanked + 7);
      assert.equal(state.carried, 0);
      assert.equal(state.roomScore, 7);
      assert.equal(state.phase, room === 2 ? 'won' : 'interlude');
      assert.equal(state.room, room);
      assert.equal(state.lives, 3);
      assert.equal(model.setW(.5), false);
      if (room < 2) {
        assert.equal(model.chooseRelic(relic.id), true);
        assert.equal(model.snapshot().room, room + 1);
        assert.deepEqual(model.snapshot().activated, []);
        assert.equal(model.snapshot().banked, state.banked);
        assert.notDeepEqual(model.snapshot().nodes, previousNodes);
        assert.equal(model.snapshot().roomScore, 0);
        assert.equal(model.snapshot().shield, relic.id === 'shell');
        assert.deepEqual(model.drainEvents().map(event => event.type), ['room']);
      }
    }
    assert.equal(model.snapshot().banked, 21);
    assert.equal(model.snapshot().stats.chains, 9);
    assert.equal(model.chooseRelic(relic.id), false);
    assert.ok(model.drainEvents().some(event => event.type === 'win'));
  });
}
