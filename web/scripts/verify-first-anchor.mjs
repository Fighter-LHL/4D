// The first anchor stop after crossing the named hub (split room: after ① and ②'s sloped
// W-ramp, the bridge to ③ leaves ⚓ 维度锚台). The walk passes through ⚓ 归响台 without stopping
// there — the planner hands over at the anchor that actually carries the bridge — then
// behaves like the hub stop: waiting or a non-target slice never moves on, the instructed slice resumes to ③.
import assert from 'node:assert/strict';
import { runCourtyardChecks, FIRST_ROOMS } from './courtyard-first-beat.mjs';
import { verifyAnchorStop } from './verify-first-return.mjs';

await runCourtyardChecks({ name: 'first-anchor', cases: FIRST_ROOMS.filter(r => r.anchor === 'relay'), run: async args => {
  const result = await verifyAnchorStop(args);
  assert.ok(result.visited.includes('hub'), `the walk crosses ⚓ 归响台 on the way: ${JSON.stringify(result.visited)}`);
  assert.ok(result.visited.includes('relay'), 'and arrives at ⚓ 维度锚台');
  const shifts = result.trace.filter(t => t.instruction);
  assert.ok(shifts.every(t => t.instruction.at === 'relay'), 'the only layer instruction is given on the relay');
  return result;
} });
