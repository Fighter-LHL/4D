import test from 'node:test';
import assert from 'node:assert/strict';
import { sliceSolid, profileXZ, circleHitsShape, convexHull, polygonArea, alignToZ, cube, rect } from '../src/flatland/geometry.js';

const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-6, `${message}: ${actual} != ${expected}`);

test('sphere sections grow then shrink and vanish outside the solid', () => {
  const ball = { id: 'ball', kind: 'sphere', center: [10, 6, 3], r: 2.5 };
  close(sliceSolid(ball, 3).r, 2.5, 'equator');
  close(sliceSolid(ball, 1).r, 1.5, 'below');
  close(sliceSolid(ball, 5).r, 1.5, 'same radius appears twice');
  assert.equal(sliceSolid(ball, .4), null);
  assert.equal(sliceSolid(ball, 5.6), null);
  assert.deepEqual([sliceSolid(ball, 2).cx, sliceSolid(ball, 2).cy], [10, 6]);
});

test('prism sections are constant inside their z interval, inclusive at the edges', () => {
  const wall = rect('wall', 0, 0, 2, 1, [0, 3.5]);
  assert.equal(sliceSolid(wall, 3.5).points.length, 4);
  close(polygonArea(sliceSolid(wall, 1).points), 2, 'area');
  assert.equal(sliceSolid(wall, 3.52), null);
});

test('cone sections shrink linearly toward the apex', () => {
  const cone = { id: 'cone', kind: 'cone', base: [5, 5, 1], height: 4, r: 2 };
  close(sliceSolid(cone, 1).r, 2, 'base');
  close(sliceSolid(cone, 3).r, 1, 'middle');
  assert.equal(sliceSolid(cone, .9), null);
  assert.equal(sliceSolid(cone, 5), null);
});

test('axis-aligned cube slices into a constant square', () => {
  const box = cube('box', { center: [0, 0, 3], size: 2 });
  for (const s of [2, 2.7, 3, 4]) close(polygonArea(sliceSolid(box, s).points), 4, `s=${s}`);
  assert.equal(sliceSolid(box, 4.1), null);
});

test('a cube standing on its corner slices into triangles then a hexagon', () => {
  const matrix = alignToZ([1, 1, 1]);
  const rotated = [0, 1, 2].map(row => matrix[row].reduce((sum, value, k) => sum + value * [1, 1, 1][k] / Math.sqrt(3), 0));
  close(rotated[0], 0, 'x'); close(rotated[1], 0, 'y'); close(rotated[2], 1, 'z');
  const box = cube('diag', { center: [0, 0, 3], size: 2, matrix });
  assert.equal(sliceSolid(box, 3).points.length, 6, 'center section is a hexagon');
  assert.equal(sliceSolid(box, 3 + Math.sqrt(3) - .3).points.length, 3, 'near a corner it is a triangle');
  const profile = profileXZ(box);
  const zs = profile.points.map(point => point[1]);
  close(Math.max(...zs) - Math.min(...zs), 2 * Math.sqrt(3), 'stands one body diagonal tall');
});

test('side-view profiles project along Y', () => {
  assert.deepEqual(profileXZ({ kind: 'sphere', center: [1, 2, 3], r: 1 }), { type: 'circle', cx: 1, cy: 3, r: 1 });
  assert.deepEqual(profileXZ(rect('w', 1, 5, 4, 6, [0, 2])).points, [[1, 0], [4, 0], [4, 2], [1, 2]]);
});

test('circle collision treats touching as free and overlap as blocked', () => {
  const square = { type: 'polygon', points: [[0, 0], [2, 0], [2, 2], [0, 2]] };
  assert.equal(circleHitsShape(2.4, 1, .4, square), false);
  assert.equal(circleHitsShape(2.39, 1, .4, square), true);
  assert.equal(circleHitsShape(1, 1, .1, square), true, 'fully inside');
  assert.equal(circleHitsShape(0, 0, 1, { type: 'circle', cx: 2, cy: 0, r: 1 }), false);
  assert.equal(circleHitsShape(0, 0, 1, { type: 'circle', cx: 1.9, cy: 0, r: 1 }), true);
});

test('convex hull removes interior and duplicate points', () => {
  const hull = convexHull([[0, 0], [1, 0], [1, 1], [0, 1], [.5, .5], [1, 1], [.5, 0]]);
  assert.equal(hull.length, 4);
  close(polygonArea(hull), 1, 'area');
});
