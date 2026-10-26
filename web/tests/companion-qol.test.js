import test from 'node:test';
import assert from 'node:assert/strict';
import { FlatlandModel } from '../src/flatland/model.js';
import { FLATLAND_LEVELS } from '../src/flatland/levels.js';
import { gardenCollection } from '../src/flatland/companions.js';
import { gardenPadHint } from '../src/flatland/friends-scene.js';
import { courtyardFriends } from '../src/courtyard-friends.js';
import { goto, wait, slide, walk, levelIndex } from './flatland-helpers.js';

const collection = { found: ['sprout', 'lantern', 'ribbon'], companion: 'all' };
const gardens = Object.fromEntries(FLATLAND_LEVELS.filter(l => l.garden).map(l => [l.id, true]));
function roam(options = {}) { const m = new FlatlandModel(0, { seed: 42, playStyle: 'explore', collection, ...options }); m.start(); return m; }

test('direction cycles upper, same, lower once per request, including while the probe is cooling down', () => {
  const m = roam();
  for (const expected of [0, -1, 1, 0]) { assert.equal(m.cycleProbeDirection(), true); assert.equal(m.companions.direction, expected); }
  assert.equal(m.petCompanion(), true); assert.equal(m.cycleProbeDirection(), true);
  assert.equal(m.companions.direction, -1); assert.equal(m.snapshot().companions.probe.z, m.s, 'a live probe retains its launched layer');
  m.setPaused(true); assert.equal(m.cycleProbeDirection(), false); assert.equal(m.snapshot().companions.canAim, false);
  m.setPaused(false); m.setCompanion('lantern'); assert.equal(m.cycleProbeDirection(), false);
  for (const options of [{ collection: {} }, { playStyle: 'challenge' }]) {
    const disabled = roam(options); assert.equal(disabled.cycleProbeDirection(), false); assert.equal(disabled.snapshot().companions.canAim, false);
  }
});

test('flower pads distinguish unknown, unaccompanied and ready friends without asking active mirrors to toggle off', () => {
  const m = roam({ collection: {} });
  assert.equal(gardenPadHint(m.snapshot()).replaceAll('\n', ''), '需要一位懂倒影的朋友');
  m.collection = { found: ['ribbon', 'sprout'], companion: 'sprout' };
  assert.equal(gardenPadHint(m.snapshot()).replaceAll('\n', ''), '在「朋友」里带上反反');
  m.setCompanion('ribbon'); assert.equal(gardenPadHint(m.snapshot()).replaceAll('\n', '，'), '按 B 同步，和反反一起站稳');
  m.petCompanion(); assert.equal(gardenPadHint(m.snapshot()), '和反反一起站稳');
  m.companions.garden.mirrorOpen = true; assert.equal(gardenPadHint(m.snapshot()), '花匣开了');
  m.gardenMemories.visitor = true; assert.equal(gardenPadHint(m.snapshot()), '花园点亮了');
});

test('the flower crown requires all six known completed gardens and transfers independently of selected companion', () => {
  for (const invalid of [null, {}, { ...gardens, visitor: false }, { ...gardens, visitor: 'true', fake: true }]) {
    assert.equal(gardenCollection(invalid, FLATLAND_LEVELS).complete, false);
    assert.ok(courtyardFriends(collection, invalid).every(f => !f.crowned));
  }
  assert.deepEqual(gardenCollection(gardens, FLATLAND_LEVELS), { count: 6, total: 6, complete: true });
  assert.equal(gardenCollection({}, []).complete, false);
  const saved = JSON.parse(JSON.stringify(gardens));
  assert.equal(roam({ gardenMemories: saved }).snapshot().gardenCollection.complete, true);
  const friends = courtyardFriends({ ...collection, companion: 'sprout' }, saved);
  assert.equal(friends.length, 3); assert.ok(friends.every(f => f.crowned));
  assert.deepEqual(courtyardFriends({}, saved), [], 'the crown does not invent uncollected friends');
});

test('picking up the last garden seed announces completion once, and the crown survives reload and replay', () => {
  const m = roam({ gardenMemories: { ...gardens, visitor: false } });
  function bloom() {
    slide(m, 2.1); goto(m, 6.5, 9); walk(m, 1, 0, .008); m.petCompanion(); wait(m, .7);
    for (const drop of Object.values(m.level.garden.drops).flat()) { goto(m, drop.x, drop.y); wait(m, .05); }
  }
  bloom(); assert.equal(m.snapshot().gardenCollection.complete, true);
  assert.equal(m.drainEvents().filter(e => e.type === 'gardens_complete').length, 1);
  const restored = roam({ gardenMemories: JSON.parse(JSON.stringify(m.gardenMemories)) });
  assert.equal(restored.snapshot().gardenCollection.complete, true);
  m.restart(); m.start(); bloom(); assert.equal(m.drainEvents().filter(e => e.type === 'gardens_complete').length, 0);
});

test('storm collection and crown remain cosmetic for matching seeded input sequences', () => {
  for (let seed = 1; seed <= 8; seed++) {
    const plain = new FlatlandModel(levelIndex('storm'), { seed });
    const party = new FlatlandModel(levelIndex('storm'), { seed, collection, gardenMemories: gardens });
    plain.start(); party.start(); plain.drainEvents(); party.drainEvents();
    for (let frame = 0; frame < 900; frame++) {
      for (const m of [plain, party]) { m.setMove(Math.sin(frame / 60), Math.cos(frame / 60)); m.setSlice(3 + 2 * Math.sin(frame / 100)); m.update(1 / 60); }
      assert.equal(party.petCompanion(), false); assert.equal(party.cycleProbeDirection(), false);
      assert.deepEqual(party.drainEvents(), plain.drainEvents());
    }
    const a = plain.snapshot(), b = party.snapshot();
    assert.equal(b.collection.companion, 'all'); assert.equal(b.gardenCollection.complete, true);
    assert.equal(b.companions.enabled, false); assert.equal(b.companions.garden, null); assert.equal(b.companions.radius, 0);
    for (const key of ['score', 'player', 'storm', 'hazards', 'warnings', 'shards', 'stars', 'combo', 'deaths']) assert.deepEqual(b[key], a[key], key);
  }
});
