// Completion controls entry copy; companion collection is read separately.
// The courtyard still creates a fresh GameModel, without imported powers/scores.
export const COURTYARD_ENTRY = './?from=flatland';
export function isFlatlandArrival(search, saved, visits) {
  const stars = saved?.ascend;
  const completed = (Number.isInteger(stars) && stars >= 1 && stars <= 3) || visits?.ascend === true;
  return new URLSearchParams(search).get('from') === 'flatland' && completed;
}
