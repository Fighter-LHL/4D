import test from 'node:test';
import assert from 'node:assert/strict';
import { screenToWorldMove } from '../controls.mjs';

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
