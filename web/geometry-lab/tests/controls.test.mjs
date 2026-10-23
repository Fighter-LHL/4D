import test from 'node:test';
import assert from 'node:assert/strict';
import { screenToWorldMove, relayRailMarks, nearbyRailMark, railReleaseDial } from '../controls.mjs';
import { wToDial, dialToW } from '../geometry.mjs';
import { levelById } from '../levels.mjs';
import { WalkRun } from '../game.mjs';

test('movement follows the camera screen axes across a full orbit', () => {
  for (const yaw of [0, 0.66, Math.PI / 2, Math.PI, -Math.PI / 2, 7.2]) {
    for (const [right, down] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1]]) {
      const [x, z] = screenToWorldMove(right, down, yaw);
      // Project the resulting floor displacement onto the camera's right and
      // ground-forward basis, independently of the input mapping.
      assert.ok(Math.abs(x * Math.cos(yaw) - z * Math.sin(yaw) - right) < 1e-9);
      assert.ok(Math.abs(-x * Math.sin(yaw) - z * Math.cos(yaw) + down) < 1e-9);
      assert.ok(Math.abs(Math.hypot(x, z) - Math.hypot(right, down)) < 1e-9);
    }
  }
  assert.deepEqual(screenToWorldMove(0, -1), [0, -1], 'Flatland retains its screen-aligned axes');
});

test('pointer landing uses W distance and the actual socket/latch positions', () => {
  const level = levelById('station-routes');
  const marks = relayRailMarks(level, true);
  assert.deepEqual(marks.map((mark) => mark.w), [level.field.relay.socket.w, level.field.relay.latch.w]);
  for (const mark of marks) {
    for (const offset of [-0.12, -0.08, 0, 0.08, 0.12]) {
      assert.equal(railReleaseDial(wToDial(mark.w + offset), marks), wToDial(mark.w));
      assert.equal(nearbyRailMark(wToDial(mark.w + offset), marks).label, mark.label);
    }
    for (const offset of [-0.121, 0.121]) {
      const dial = wToDial(mark.w + offset);
      assert.equal(railReleaseDial(dial, marks), dial, 'outside the narrow capture window there is no snap');
    }
  }
  assert.deepEqual(relayRailMarks(level, false), []);
  assert.deepEqual(relayRailMarks({ ...level, chapter: 2 }, true), [], 'even a map peek in chapter 2 adds no new ticks');
  assert.equal(railReleaseDial(wToDial(-1.03), []), wToDial(-1.03));
  const run = new WalkRun(level.field, level.id);
  run.setDial(wToDial(1.1));
  run.pos = [0, 0];
  const landing = railReleaseDial(wToDial(0.08), marks);
  assert.equal(dialToW(landing), 0);
  assert.equal(run.setDial(landing), false, 'a suggested landing must still pass the full collision check');
});
