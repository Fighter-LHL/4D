// Entry copy only: the courtyard always creates its own normal fresh GameModel.
export const COURTYARD_ENTRY = './?from=flatland';
export function isFlatlandArrival(search, saved) {
  const stars = saved?.ascend;
  return new URLSearchParams(search).get('from') === 'flatland' && Number.isInteger(stars) && stars >= 1 && stars <= 3;
}
