import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise the actual page lifecycle with a deterministic RAF queue. Render
// and DOM adapters are stubs; the scheduling and exit functions are unchanged.
const source = readFileSync(new URL('../app.mjs', import.meta.url), 'utf8');
const functionSource = (name) => {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0);
  const end = source.indexOf('\n}', start) + 2;
  return source.slice(start, end);
};

test('leaving a moving or rippling level cancels frames and cannot restart on the title', () => {
  const pending = new Map();
  let scheduled = 0;
  let rendered = 0;
  const node = { classList: { remove() {} }, focus() {} };
  const context = vm.createContext({
    document: { hidden: false },
    requestAnimationFrame(callback) { pending.set(++scheduled, callback); return scheduled; },
    cancelAnimationFrame(id) { pending.delete(id); },
    clearTimeout() {}, $: () => node, hideCard() {}, renderChapters() {},
    render() { rendered += 1; },
  });
  vm.runInContext(`
    let level = {}, frameId = 0, previousTime = 123;
    let trail = [[0, 0, 0]], ripples = [{t0: 0}], flash = 1, railPointer = 1;
    let pressed = new Set(['w']), wHold = 1, heldWKey = 'e', gestureStart = 0;
    let reveal = {}, peekTimer = 1, mapPeeking = true, nudgeTimer = 2, nudge = {}, toastTimer = 3;
    ${['requestFrame', 'tick', 'leaveLevel', 'showTitle'].map(functionSource).join('\n')}
    requestFrame();
  `, context);
  assert.equal(pending.size, 1);
  const staleCallback = [...pending.values()][0];
  vm.runInContext('showTitle()', context);
  assert.equal(pending.size, 0, 'the outstanding callback is cancelled');
  assert.equal(vm.runInContext('trail.length + ripples.length + flash + previousTime', context), 0);
  staleCallback(1000); // Also guard callbacks that were already dispatched.
  vm.runInContext('requestFrame()', context);
  assert.equal(pending.size, 0);
  assert.equal(scheduled, 1, 'no new animation frames on the title');
  assert.equal(rendered, 0);
  vm.runInContext('level = {}; requestFrame()', context);
  assert.equal(pending.size, 1, 'a newly entered level can animate again');
});
