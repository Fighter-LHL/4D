import test from 'node:test';
import assert from 'node:assert/strict';
import { FriendGuide } from '../src/friend-guide.js';
import { GameModel } from '../src/model.js';
import { courtyardFriends, friendGuideText } from '../src/courtyard-friends.js';

function start() { const m = new GameModel(42); m.chooseRelic('shell'); return m.snapshot(); }
function tick(g, s, seconds, active = true) { for (let n = 0; n < Math.round(seconds * 60); n++) g.update(1 / 60, s, active); }

test('followers reveal only one short hint after six idle seconds, without repeating it', () => {
  const s = start(), g = new FriendGuide(), original = structuredClone(s);
  assert.ok(s.companionGuide);
  assert.equal(g.present(s).companionGuide, null);
  assert.equal(friendGuideText(g.present(s), courtyardFriends({ found: ['sprout'] })), '');
  tick(g, s, 5.9); assert.equal(g.view(s), null);
  tick(g, s, .2); assert.deepEqual(g.view(s), s.companionGuide);
  tick(g, s, 4.1); assert.equal(g.view(s), null);
  tick(g, s, 60); assert.equal(g.view(s), null);
  assert.deepEqual(s, original, 'guidance only changes presentation');
});

test('an explicit request is immediate; a player action recalls the friend and rearms idle guidance', () => {
  const s = start(), g = new FriendGuide();
  assert.equal(g.request(s), true); assert.deepEqual(g.view(s), s.companionGuide);
  tick(g, s, .1); assert.ok(g.view(s), 'first update must retain the explicit request');
  g.activity(); assert.equal(g.view(s), null);
  tick(g, s, 5.9); assert.equal(g.view(s), null);
  tick(g, s, .2); assert.ok(g.view(s));
});

test('a hinted step never automatically advances to the next waypoint', () => {
  const s = start(), g = new FriendGuide(); g.request(s);
  const next = { ...s, companionGuide: { ...s.companionGuide, node: 'different-node' } };
  assert.equal(g.view(next), null);
  tick(g, next, 20); assert.equal(g.view(next), null);
  assert.equal(g.request(next), true); assert.deepEqual(g.view(next), next.companionGuide);
  const view = g.view(next); view.node = 'mutated'; assert.notEqual(g.view(next).node, 'mutated');
});

test('paused, hidden or modal time does not count as idle time or consume a hint', () => {
  const s = start(), g = new FriendGuide(); tick(g, s, 5); tick(g, s, 20, false);
  assert.equal(g.view(s), null); tick(g, s, 1.1); assert.ok(g.view(s));
  const remaining = g.remaining; tick(g, s, 20, false); assert.equal(g.remaining, remaining);
  for (const change of [{ travel: {} }, { wave: {} }, { phase: 'interlude' }, { companionGuide: null }]) {
    const unavailable = { ...s, ...change };
    assert.equal(g.request(unavailable), false); assert.equal(g.view(unavailable), null);
    tick(g, unavailable, .1); assert.equal(g.view(s), null);
  }
  g.request(s); tick(g, { ...s, room: s.room + 1 }, .1); assert.equal(g.view(s), null);
});
