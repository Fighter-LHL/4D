import test from 'node:test';
import assert from 'node:assert/strict';
import { GameModel } from '../src/model.js';
import { advance, openVault, start } from './model-helpers.js';

test('first click previews even the suggested platform; second click crosses safely across forty seeds', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const m = new GameModel(seed); m.chooseRelic('shell');
    const target = m.selected; m.setW(m.snapshot().range.center); m.setRisk(true);
    assert.equal(m.selectOrMove(target), true); assert.equal(m.travel, null);
    assert.equal(m.riskMode, true, 'preview preserves the current choice');
    m.drainEvents(); assert.equal(m.selectOrMove(target), true);
    assert.equal(m.travel.to, target); assert.equal(m.travel.risky, false); assert.equal(m.riskMode, false);
    assert.equal(m.selectOrMove(target), false, 'a third click cannot start another crossing');
    advance(m, 1.4); assert.equal(m.node, target, `seed ${seed}`);
    const events = m.drainEvents();
    assert.equal(events.filter(e => e.type === 'move').length, 1);
    assert.equal(events.some(e => e.type === 'risk'), false);
    assert.equal(m.snapshot().stats.failures, 0);
  }
});

test('repeat-click uses the safe bridge width, but never crosses a wrong layer or locked edge', () => {
  const m = start('shell'), target = m.selected;
  m.selectOrMove(target); const safeRange = m.snapshot().range;
  m.setRisk(true); m.setW(safeRange.center + .08);
  assert.equal(m.snapshot().canMove, false, 'outside the narrow risky interval');
  assert.equal(m.selectOrMove(target), true); assert.equal(m.travel.risky, false);
  const wrong = start('shell'); wrong.selectOrMove(wrong.selected); wrong.setRisk(true); wrong.setW(1);
  assert.equal(wrong.selectOrMove(wrong.selected), true, 'keeps the preview without auto-alignment');
  assert.equal(wrong.travel, null); assert.equal(wrong.w, 1); assert.equal(wrong.riskMode, true);
  const before = wrong.snapshot();
  for (const id of ['exit', 'unknown', null]) assert.equal(wrong.selectOrMove(id), false);
  assert.deepEqual(wrong.snapshot(), before);
});

test('clicking a different platform previews it; modal phases and live waves reject repeated clicks', () => {
  const m = start('shell', 513051837), target = m.selected; m.selectOrMove(target);
  const other = m.snapshot().availableNodes.find(id => id !== target); assert.ok(other);
  assert.equal(m.selectOrMove(other), true); assert.equal(m.travel, null); assert.equal(m.selected, other);
  const fresh = new GameModel(42); assert.equal(fresh.selectOrMove('hub'), false);
  openVault(m); assert.ok(m.wave); const state = m.snapshot();
  assert.equal(m.selectOrMove(m.selected), false); assert.deepEqual(m.snapshot(), state);
});
