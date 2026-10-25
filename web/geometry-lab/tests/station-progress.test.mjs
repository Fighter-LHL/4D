import test from 'node:test';
import assert from 'node:assert/strict';
import { STATION_SEALS_KEY, readStationSeals, rememberStationRun, stationNextAction } from '../station-progress.mjs';

const run = (seals, won = true, levelId = 'station-routes') => ({ levelId, won, routeSeals: () => seals });
const empty = { stone: false, copper: false };

test('seals persist only after delivery and merge across routes without touching chapter progress', () => {
  const data = new Map([['wslice-progress-v1', '["1-1"]']]);
  const storage = { getItem: (key) => data.get(key), setItem: (key, value) => data.set(key, value) };
  assert.deepEqual(readStationSeals(storage), empty);
  assert.deepEqual(rememberStationRun(storage, empty, run({ stone: true, copper: false }, false)), empty);
  assert.deepEqual(rememberStationRun(storage, empty, run({ stone: true, copper: true }, true, 'station')), empty);
  assert.equal(data.has(STATION_SEALS_KEY), false);
  let seals = rememberStationRun(storage, empty, run({ stone: true, copper: false }));
  assert.deepEqual(readStationSeals(storage), { stone: true, copper: false });
  assert.deepEqual(stationNextAction(seals), { label: '再来一次', level: 'station-routes' });
  seals = rememberStationRun(storage, seals, run({ stone: false, copper: true }));
  assert.deepEqual(readStationSeals(storage), { stone: true, copper: true });
  assert.deepEqual(stationNextAction(seals), { label: '去扁平国', level: '0-1' });
  assert.equal(data.get('wslice-progress-v1'), '["1-1"]');
  assert.deepEqual(rememberStationRun(storage, seals, run(empty)), seals, 'replaying cannot erase an earned seal');
});

test('broken or unavailable storage leaves usable session progress', () => {
  assert.deepEqual(readStationSeals(null), empty);
  assert.deepEqual(readStationSeals({ getItem: () => '{broken' }), empty);
  assert.deepEqual(readStationSeals({ getItem: () => '{"stone":"false","copper":true}' }), { stone: false, copper: true });
  assert.deepEqual(rememberStationRun(null, empty, run({ stone: true, copper: true })), { stone: true, copper: true });
});
