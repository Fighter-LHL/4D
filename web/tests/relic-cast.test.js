import test from 'node:test';
import assert from 'node:assert/strict';
import { GameModel, LAYERS } from '../src/model.js';
import { createRoomPlan } from '../src/rooms.js';
import { start, advance, travel, seedFor } from './model-helpers.js';

function expeditionRoom(templateId) {
  for (let seed = 1; seed < 2000; seed++) {
    const plan = createRoomPlan(seed, { mode: 'expedition' });
    const roomIndex = plan.findIndex(p => p.template.id === templateId);
    if (roomIndex !== -1) return { seed, roomIndex };
  }
  throw new Error(`no expedition room for ${templateId}`);
}

test('castTargets stays empty while no relic ability is available', () => {
  const model = start('prism');
  assert.deepEqual(model.snapshot().castTargets, { prism: [], weave: [], shadow: [] });
  travel(model, 'dew', true);
  assert.deepEqual(model.snapshot().castTargets, { prism: [], weave: [], shadow: [] });
});

test('explicit prism target picks the chosen legal mechanism and charges once', () => {
  // Only sanctum authors two mechanisms (dew & crown) into the same W layer,
  // so two simultaneous prism targets can exist nowhere else.
  const { seed, roomIndex } = expeditionRoom('sanctum');
  const model = new GameModel(seed, { mode: 'expedition' });
  assert.equal(model.chooseRelic('prism'), true);
  model.room = roomIndex;
  model._setupRoom();
  model.phase = 'playing';
  assert.equal(model.node, 'hub');
  model.powered.add('crown');
  assert.deepEqual(model._prismTargets(), ['dew', 'crown']);
  model.charge = 2;
  model.drainEvents();
  assert.deepEqual(model.snapshot().castTargets.prism, ['dew', 'crown']);
  assert.equal(model.useAbility('prism', { target: 'bell' }), false);
  assert.equal(model.snapshot().charge, 2);
  assert.equal(model.drainEvents().length, 0);
  assert.equal(model.useAbility('prism', { target: 'crown' }), true);
  assert.equal(model.snapshot().charge, 1);
  assert.ok(model.snapshot().activated.includes('crown'));
  assert.equal(model.snapshot().activated.includes('dew'), false);
});

test('weave accepts only the anchor for a local seed and the shadow island for a remote one', () => {
  const model = start('weave');
  travel(model, 'dew', true);
  assert.equal(model.interact(), true);
  const local = model._weaveTarget();
  assert.equal(local.remote, false);
  model.drainEvents();
  assert.deepEqual(model.snapshot().castTargets.weave, [local.edge.to]);
  assert.equal(model.useAbility('weave', { target: local.node }), false);
  assert.equal(model.snapshot().weaveCharge, 1);
  assert.equal(model.drainEvents().length, 0);
  assert.equal(model.useAbility('weave', { target: local.edge.to }), true);
  assert.equal(model.snapshot().weaveCharge, 0);
  assert.ok(model.snapshot().woven.some(item => item.node === 'dew'));

  const remote = start('weave', seedFor('confluence'));
  travel(remote, 'dew', true);
  assert.equal(remote.interact(), true);
  travel(remote, 'hub');
  remote.ghost = { node: 'dew', layer: remote._node('dew').layer, remaining: 10, duration: 10 };
  const shadowed = remote._weaveTarget();
  assert.equal(shadowed.remote, true);
  assert.deepEqual(remote.snapshot().castTargets.weave, [shadowed.node]);
  assert.equal(remote.useAbility('weave', { target: shadowed.edge.to }), false);
  assert.equal(remote.snapshot().weaveCharge, 1);
  assert.equal(remote.useAbility('weave', { target: shadowed.node }), true);
  assert.equal(remote.snapshot().woven.some(item => item.node === 'dew'), true);
});

test('shadow accepts only the current mechanism and leaves a ghost on it', () => {
  const model = start('shadow');
  travel(model, 'dew');
  assert.equal(model.interact(), true);
  assert.deepEqual(model.snapshot().castTargets.shadow, ['dew']);
  model.drainEvents();
  assert.equal(model.useAbility('shadow', { target: 'bell' }), false);
  assert.equal(model.snapshot().carried, 1);
  assert.equal(model.drainEvents().length, 0);
  assert.equal(model.useAbility('shadow', { target: 'dew' }), true);
  assert.equal(model.snapshot().ghost.node, 'dew');
  assert.equal(model.snapshot().carried, 0);
});

test('targetless casting keeps the original pick-first-available behaviour', () => {
  const model = start();
  travel(model, 'dew', true);
  assert.equal(model.useAbility('prism'), false);
  travel(model, 'hub');
  model.setW(.5);
  assert.equal(model.useAbility('prism'), false);
  model.setW(model.snapshot().nodes.find(node => node.id === 'dew').center);
  assert.equal(model.useAbility('prism'), true);
  assert.deepEqual(model.snapshot().activated, ['dew']);
  assert.equal(model.useAbility(undefined, { target: 'dew' }), false);
});
