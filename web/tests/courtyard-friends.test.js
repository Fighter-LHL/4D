import test from 'node:test';
import assert from 'node:assert/strict';
import { GameModel } from '../src/model.js';
import { courtyardFriends, friendGuideText } from '../src/courtyard-friends.js';
import { advance, openVault, start } from './model-helpers.js';

test('courtyard imports only known collected friends, independently of the selected follower', () => {
  for (const saved of [null, {}, [], 'sprout', { found: 'sprout' }]) assert.deepEqual(courtyardFriends(saved), []);
  assert.deepEqual(courtyardFriends({ found: ['sprout', 'sprout', 'ribbon', 'unknown'], companion: 'sprout' }).map(f => f.id), ['sprout', 'ribbon']);
  assert.equal(friendGuideText(new GameModel(1).snapshot(), []), '');
});

test('friend guidance follows actual supported routes and completes all three rooms across 40 seeds', () => {
  const kinds = new Set(), templates = new Set();
  const friends = courtyardFriends({ found: ['sprout', 'lantern', 'ribbon'] });
  for (let seed = 1; seed <= 40; seed++) {
    const m = new GameModel(seed); m.chooseRelic('shell');
    for (let steps = 0; steps < 120 && m.phase !== 'won'; steps++) {
      const before = m.snapshot(); templates.add(before.roomId);
      if (before.phase === 'interlude') { m.chooseRelic('shell'); continue; }
      const g = before.companionGuide;
      if (!g) { advance(m, .6); continue; }
      kinds.add(g.kind);
      assert.equal(g.w, before.layers[g.layer].center);
      const target = before.nodes.find(n => n.id === g.node);
      assert.equal(g.x, target.x); assert.equal(g.y, target.y);
      assert.ok(friendGuideText(before, friends)); assert.deepEqual(m.snapshot(), before, 'presentation cannot mutate a run');
      if (g.kind === 'activate') {
        assert.ok(before.powered.includes(g.node)); assert.ok(!before.activated.includes(g.node));
        m.setW(g.w); assert.equal(m.interact(), true); advance(m, .6);
      } else if (g.kind === 'shift') {
        const current = before.nodes.find(n => n.id === before.node);
        assert.deepEqual(target.world, { ...current.world, w: target.world.w });
        m.setW(g.w); assert.equal(m.node, g.node); advance(m, .01);
      } else {
        assert.ok(before.availableNodes.includes(g.node));
        assert.ok(before.edges.some(e => e.open && e.layer === g.layer &&
          ((e.from === before.node && e.to === g.node) || (e.to === before.node && e.from === g.node))));
        m.setW(g.w); assert.equal(m.select(g.node), true); assert.equal(m.move(), true);
        assert.equal(m.snapshot().companionGuide, null, 'no conflicting waypoint during a crossing');
        advance(m, 1.4);
      }
    }
    assert.equal(m.phase, 'won', `seed ${seed}`); assert.equal(m.stats.failures, 0);
  }
  assert.deepEqual([...kinds].sort(), ['activate', 'move', 'shift']); assert.equal(templates.size, 4);
});

test('companions do not advertise a normal route during a live hazard or modal phase', () => {
  const m = start('shell', 102); openVault(m);
  assert.ok(m.snapshot().wave); assert.equal(m.snapshot().companionGuide, null);
  assert.equal(friendGuideText(m.snapshot(), courtyardFriends({ found: ['lantern'] })), '');
  const fresh = new GameModel(102); assert.equal(fresh.snapshot().companionGuide, null);
});
