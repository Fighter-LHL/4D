// Keep saved stars keyed by stable level ID when a chapter gains new levels.
export function normalizeProgress(value, levels) {
  const result = {};
  for (const { id } of levels) {
    const stars = value?.[id];
    if (Number.isInteger(stars) && stars >= 0 && stars <= 3) result[id] = stars;
  }
  return result;
}

// A level opens once it or its prerequisite (the previous level unless
// `unlockFrom` names another) has been completed.
export function isLevelUnlocked(levels, progress, index, unlockFrom = {}) {
  const level = levels[index];
  if (!level) return false;
  if (index === 0 || progress[level.id] > 0) return true;
  return progress[unlockFrom[level.id] ?? levels[index - 1].id] > 0;
}

// Best score per level: only finite non-negative numbers survive.
export function normalizeBest(value, levels) {
  const result = {};
  for (const { id } of levels) {
    const score = value?.[id];
    if (Number.isFinite(score) && score >= 0) result[id] = Math.floor(score);
  }
  return result;
}
