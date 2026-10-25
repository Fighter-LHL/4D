export const STATION_SEALS_KEY = 'wslice-station-seals-v1';
const emptySeals = () => ({ stone: false, copper: false });

export function readStationSeals(storage) {
  try {
    const value = JSON.parse(storage.getItem(STATION_SEALS_KEY));
    return { stone: value?.stone === true, copper: value?.copper === true };
  } catch { return emptySeals(); }
}

export function rememberStationRun(storage, previous, run) {
  if (run.levelId !== 'station-routes' || !run.won) return { ...previous };
  const earned = run.routeSeals();
  const seals = { stone: previous.stone || earned.stone, copper: previous.copper || earned.copper };
  try { storage.setItem(STATION_SEALS_KEY, JSON.stringify(seals)); } catch { /* session still keeps its seals */ }
  return seals;
}

export function stationNextAction(seals) {
  return seals.stone && seals.copper
    ? { label: '去扁平国', level: '0-1' }
    : { label: '再来一次', level: 'station-routes' };
}
