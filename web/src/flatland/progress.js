// Keep saved stars keyed by stable level ID when a chapter gains new levels.
export function normalizeProgress(value, levels) {
  const result = {};
  for (const { id } of levels) {
    const stars = value?.[id];
    if (Number.isInteger(stars) && stars >= 0 && stars <= 3) result[id] = stars;
  }
  return result;
}

export function isLevelUnlocked(levels, progress, index) {
  return !!levels[index] && (index === 0 || progress[levels[index].id] > 0 || progress[levels[index - 1].id] > 0);
}
