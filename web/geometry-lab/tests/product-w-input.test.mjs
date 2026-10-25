import test from 'node:test';
import assert from 'node:assert/strict';
import { appHarness } from './app-harness.mjs';
import { wToDial, dialToW } from '../geometry.mjs';

const parked = async () => {
  const h = await appHarness('?level=station-routes');
  h.app.run.pos = [...h.app.level.field.item.start.slice(0, 2)];
  h.app.handleInteract();
  const socket = h.app.level.field.relay.socket;
  h.app.run.pos = [socket.x, socket.z];
  h.app.setDial(wToDial(socket.w + .10));
  return h;
};

test('product: short taps finely adjust W, long holds accelerate, release has no tail or XYZ movement', async () => {
  const h = await appHarness('?level=gate');
  assert.equal(h.node('w-buttons').hidden, false);
  const pos = [...h.app.run.pos];
  h.key('keydown', 'e'); h.advance(100); h.key('keyup', 'e');
  const tap = dialToW(h.app.current);
  assert.ok(tap > .04 && tap < .1, `100 ms tap: ${tap} W`);
  const stopped = h.app.current;
  h.advance(400);
  assert.equal(h.app.current, stopped);
  assert.equal(h.app.current, h.app.target);
  assert.deepEqual(h.app.run.pos, pos);
  h.key('keydown', 'e'); h.advance(1000); h.key('keyup', 'e');
  h.advance(17);
  assert.ok(dialToW(h.app.current) - tap > 1.0, 'long holds cross the room without repeated taps');
  assert.deepEqual(h.app.run.pos, pos);
  assert.equal(h.node('layer-name').textContent, '已停');
});

test('product: Q/E cancel each other, release resumes the held direction, buttons follow actual input', async () => {
  const h = await appHarness('?level=gate');
  h.key('keydown', 'e'); h.advance(100);
  assert.equal(h.node('w:1').classes.has('held'), true);
  h.key('keydown', 'q'); h.advance(400);
  const neutral = h.app.current;
  assert.equal(h.node('layer-name').textContent, '两向抵消');
  assert.equal(h.node('w:-1').classes.has('held'), true);
  h.advance(500); assert.equal(h.app.current, neutral);
  h.key('keyup', 'e'); h.advance(100);
  assert.ok(h.app.current < neutral);
  assert.equal(h.node('w:1').classes.has('held'), false);
  h.key('keyup', 'q'); h.advance(3000);
  assert.equal(h.frames.size, 0);
});

test('product: W intent survives a wall and resumes after walking away; refusal feedback is not repeated', async () => {
  const h = await appHarness('?level=gate');
  h.app.setDial(wToDial(1.9)); h.app.run.pos = [0, 0];
  h.key('keydown', 'q'); h.advance(3000);
  const blocked = h.app.current;
  assert.equal(h.app.wHold, -1);
  assert.equal(h.node('layer-name').textContent, '受阻');
  assert.equal(h.sounds.filter(([s]) => s === 'refused').length, 1);
  h.key('keydown', 'a'); h.advance(1800); h.key('keyup', 'a');
  assert.ok(h.app.run.pos[0] < -2);
  assert.ok(h.app.current < blocked - .1, 'the same held W input continues once there is room');
  h.key('keyup', 'q'); h.advance(3000);
  assert.equal(h.frames.size, 0);
});

for (const source of ['keyboard', 'button', 'rail', 'rail-keyboard']) {
  test(`product: ${source} stops where released even inside a socket capture band`, async () => {
    const h = await parked();
    if (source === 'keyboard') { h.key('keydown', 'q'); h.advance(50); }
    if (source === 'button') { h.node('w:-1').emit('pointerdown', { pointerId: 5 }); h.advance(50); }
    if (source === 'rail') h.node('w-rail').emit('pointerdown', { pointerId: 5, clientY: 300 });
    if (source === 'rail-keyboard') { h.app.setDial(wToDial(-.92)); h.node('w-rail').emit('keydown', { key: 'ArrowDown' }); }
    const released = h.app.current;
    assert.ok(Math.abs(dialToW(released) + 1.1) > .02, 'release is deliberately off the socket centre');
    if (source === 'keyboard') h.key('keyup', 'q');
    if (source === 'button') h.node('w:-1').emit('pointerup', { pointerId: 5 });
    if (source === 'rail') h.node('w-rail').emit('pointerup', { pointerId: 5 });
    if (source === 'rail-keyboard') h.node('w-rail').emit('keyup', { key: 'ArrowDown' });
    h.advance(600);
    assert.equal(h.app.controller.docking, null);
    assert.equal(h.app.current, released);
    assert.equal(h.app.run.carrying, true);
    assert.equal(h.app.run.socketPowered(), false);
    h.app.handleInteract();
    assert.equal(h.app.run.socketPowered(), true, 'manual interaction still operates the actual socket');
  });
}

test('product: a second touch can hold W while moving, and cancelling it preserves the ground touch', async () => {
  const h = await appHarness('?level=gate');
  h.node('ArrowRight').emit('pointerdown', { pointerId: 1, isPrimary: true });
  h.node('w:1').emit('pointerdown', { pointerId: 2, isPrimary: false });
  const pos = [...h.app.run.pos]; h.advance(150);
  assert.ok(h.app.current > .5);
  assert.ok(h.app.run.pos[0] > pos[0]);
  h.node('w:1').emit('pointercancel', { pointerId: 2 });
  const w = h.app.current, x = h.app.run.pos[0]; h.advance(100);
  assert.equal(h.app.current, w);
  assert.ok(h.app.run.pos[0] > x);
  h.node('ArrowRight').emit('pointerup', { pointerId: 1 }); h.advance(3000);
  assert.equal(h.frames.size, 0);
});

for (const reason of ['blur', 'hidden', 'restart', 'title']) {
  test(`product: ${reason} cancels inputs and stale repeats/releases cannot resume them`, async () => {
    const h = await parked();
    h.key('keydown', 'q'); h.key('keydown', 'd'); h.advance(50);
    const oldRun = h.app.run, w = h.app.current, pos = [...oldRun.pos];
    if (reason === 'blur') h.window.emit('blur');
    if (reason === 'hidden') { h.document.hidden = true; h.document.emit('visibilitychange'); }
    if (reason === 'restart') h.app.startLevel('station-routes', { skipIntro: true });
    if (reason === 'title') h.app.showTitle();
    h.key('keydown', 'q', { repeat: true }); h.key('keydown', 'd', { repeat: true });
    h.key('keyup', 'q'); h.key('keyup', 'd'); h.advance(500);
    assert.equal(oldRun.dial, w);
    assert.deepEqual(oldRun.pos, pos);
    assert.equal(h.app.wHold, 0);
    assert.equal(h.app.pressed.size, 0);
    assert.equal(h.app.controller.docking, null);
  });
}

test('product: fine rail stepping and W endpoints preserve geometry and do not manufacture a refusal', async () => {
  const h = await appHarness('?level=gate');
  const rail = h.node('w-rail');
  rail.emit('keydown', { key: 'ArrowUp' }); rail.emit('keyup', { key: 'ArrowUp' });
  assert.ok(Math.abs(dialToW(h.app.current) - .08) < 1e-9);
  h.key('keydown', 'e'); h.advance(4000);
  assert.equal(h.app.current, 1);
  assert.equal(h.node('layer-name').textContent, '已到端点');
  assert.equal(h.app.run.refused, 0);
  h.key('keyup', 'e'); h.advance(3000);
  assert.equal(h.frames.size, 0);
  h.app.startLevel('2-3', { skipIntro: true });
  const frame = h.app.frame();
  assert.equal(frame.blocked.length, 0, 'hidden-map control does not leak W safety zones');
  assert.ok(frame.sections.every((s) => s.ghost === 0));
});

test('product: observation levels also support a small tap and exact release', async () => {
  const h = await appHarness('?level=0-1');
  h.app.startLevel('0-1', { skipIntro: true });
  assert.equal(h.node('w:1').getAttribute('aria-label'), '按住升高高度');
  const start = h.app.current;
  h.key('keydown', 'e'); h.advance(100); h.key('keyup', 'e');
  const stop = h.app.current;
  assert.ok((stop - start) * 4 > .04 && (stop - start) * 4 < .1);
  h.advance(500);
  assert.equal(h.app.current, stop);
  assert.equal(h.app.run.won, false);
});
