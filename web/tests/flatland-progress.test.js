import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProgress, normalizeBest, isLevelUnlocked } from '../src/flatland/progress.js';
import { FLATLAND_LEVELS as levels, UNLOCK_FROM } from '../src/flatland/levels.js';

test('inserting guess preserves old escape stars and access by stable level IDs', () => {
  const progress = normalizeProgress({ visitor: 3, escape: 2 }, levels);
  assert.deepEqual(progress, { visitor: 3, escape: 2 });
  assert.equal(isLevelUnlocked(levels, progress, 1), true);
  assert.equal(isLevelUnlocked(levels, progress, 2), true);
  assert.equal(isLevelUnlocked(levels, progress, 3), true, 'old escape completion opens the newly added vault');
  assert.equal(isLevelUnlocked(levels, { visitor: 3, guess: 3 }, 3), false);
  assert.equal(isLevelUnlocked(levels, { vault: 1 }, 3), true, 'completed direct-entry vault remains available');
  assert.equal(isLevelUnlocked(levels, { vault: 1 }, 4), true, 'completed vault opens mirror');
  assert.equal(isLevelUnlocked(levels, { escape: 3 }, 4), false);
  assert.equal(isLevelUnlocked(levels, { visitor: 1 }, 2), false);
  assert.equal(isLevelUnlocked(levels, { visitor: 1, guess: 1 }, 2), true);
  assert.equal(isLevelUnlocked(levels, {}, 0), true);
  assert.equal(isLevelUnlocked(levels, {}, 99), false);
});

test('malformed saved stars cannot break rendering or unlock the new chapter', () => {
  for (const value of [null, false, 'invalid', [], { visitor: -1, guess: 20, escape: '3' }]) {
    assert.deepEqual(normalizeProgress(value, levels), {});
  }
});

test('the endless storm opens from the escape level, not from the final story level', () => {
  const storm = levels.findIndex(level => level.id === 'storm');
  assert.equal(storm, levels.length - 1);
  assert.equal(isLevelUnlocked(levels, { visitor: 1, guess: 1 }, storm, UNLOCK_FROM), false);
  assert.equal(isLevelUnlocked(levels, { escape: 1 }, storm, UNLOCK_FROM), true);
  assert.equal(isLevelUnlocked(levels, { ascend: 3 }, storm, UNLOCK_FROM), false);
});

test('best scores keep only finite non-negative numbers for known levels', () => {
  assert.deepEqual(normalizeBest({ visitor: 1234.7, storm: 9000, guess: -1, escape: 'x', ghost: 5 }, levels), { visitor: 1234, storm: 9000 });
  for (const value of [null, 'bad', []]) assert.deepEqual(normalizeBest(value, levels), {});
});
