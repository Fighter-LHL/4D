import test from 'node:test';
import assert from 'node:assert/strict';
import { appHarness } from './app-harness.mjs';
import { wToDial, dialToW } from '../geometry.mjs';

const parked = async () => {
  const h = await appHarness(); const r = h.app.run, s = h.app.level.field.relay.socket;
  r.pos = [...h.app.level.field.item.start.slice(0, 2)]; h.app.handleInteract();
  r.pos = [s.x, s.z]; h.app.setDial(wToDial(s.w + .1));
  return h;
};

test('full app: Q/E neutrality, immediate release, continuous blocked-to-moving, one feedback per contact', async () => {
  const h = await appHarness('?study=w1&wcontrol=b&level=gate');
  h.key('keydown', 'e'); h.advance(100);
  h.key('keydown', 'q'); const neutral = h.app.current; h.advance(300);
  assert.equal(h.app.current, neutral);
  assert.equal(h.app.controller.state, 'NEUTRAL');
  h.key('keyup', 'q'); h.advance(100); assert.ok(h.app.current > neutral);
  h.key('keyup', 'e'); const released = h.app.current; h.advance(200);
  assert.equal(h.app.current, released);
  assert.equal(h.app.target, released);
  h.app.setDial(wToDial(-1.9)); h.app.run.pos = [0, 0];
  h.key('keydown', 'e'); h.advance(4000);
  const blocked = h.app.current;
  assert.equal(h.app.controller.state, 'BLOCKED');
  assert.equal(h.app.wHold, 1);
  assert.equal(h.sounds.filter(([s]) => s === 'refused').length, 1);
  assert.equal(h.app.nudge, null, 'outline expired while the key stays held');
  assert.equal(h.app.flash, 0, 'pulse does not renew');
  h.app.run.pos = [...h.app.level.field.start]; h.advance(100);
  assert.ok(h.app.current > blocked);
  h.key('keyup', 'e'); h.advance(4000);
  assert.equal(h.frames.size, 0, 'returns to no RAF after release and finite effects');
});

test('full app: second non-primary touch drives W while ground touch remains held', async () => {
  const h = await appHarness('?study=w1&wcontrol=b&level=gate');
  h.node('ArrowRight').emit('pointerdown', { pointerId: 10, isPrimary: true });
  h.node('w:1').emit('pointerdown', { pointerId: 11, isPrimary: false });
  const pos = [...h.app.run.pos]; h.advance(100);
  assert.ok(h.app.current > .5);
  assert.notDeepEqual(h.app.run.pos, pos);
  h.key('keydown', 'q'); assert.equal(h.app.controller.source, 'touch-w-button');
  h.node('w:1').emit('pointercancel', { pointerId: 11 });
  const dial = h.app.current; h.advance(100);
  assert.equal(h.app.current, dial);
  assert.ok(h.app.pressed.has('ArrowRight'), 'W cancel does not clear ground input');
  h.node('ArrowRight').emit('pointerup', { pointerId: 10 });
  h.key('keyup', 'q'); h.advance(3000);
  assert.equal(h.frames.size, 0);
});

for (const cancellation of ['pointercancel', 'lostpointercapture', 'blur', 'hidden', 'card', 'restart', 'title']) {
  test(`full app: ${cancellation} never docks, changes XYZ/item or leaves old input`, async () => {
    const h = await parked();
    h.node('w:1').emit('pointerdown', { pointerId: 2, isPrimary: false });
    const before = h.app.current, oldRun = h.app.run, item = { ...oldRun.item }, pos = [...oldRun.pos];
    if (cancellation === 'blur') h.window.emit('blur');
    else if (cancellation === 'hidden') { h.document.hidden = true; h.document.emit('visibilitychange'); }
    else if (cancellation === 'card') h.app.showCard({ title: 'test', actions: [] });
    else if (cancellation === 'restart') h.app.startLevel('station-routes', { skipIntro: true });
    else if (cancellation === 'title') h.app.showTitle();
    else h.node('w:1').emit(cancellation, { pointerId: 2 });
    assert.equal(h.app.controller.docking, null);
    assert.equal(h.app.wHold, 0);
    assert.equal(oldRun.dial, before);
    assert.deepEqual(oldRun.item, item);
    assert.deepEqual(oldRun.pos, pos);
    assert.equal(oldRun.won, false);
    h.node('w:1').emit('pointerup', { pointerId: 2 });
    assert.equal(h.app.controller.docking, null, 'stale up is inert');
    assert.equal(h.app.gestureStart, null);
    h.advance(3000);
    assert.equal(h.app.wHold, 0);
  });
}

test('full app: real pointerup docks once; lostcapture cannot cancel the dock; interaction invalidates old gesture', async () => {
  const h = await parked();
  h.node('w:1').emit('pointerdown', { pointerId: 3 });
  h.node('w:1').emit('pointerup', { pointerId: 3 });
  h.node('w:1').emit('lostpointercapture', { pointerId: 3 });
  assert.ok(h.app.controller.docking);
  h.advance(200);
  assert.ok(Math.abs(dialToW(h.app.current) + 1.1) < 1e-9);
  assert.equal(h.app.run.wMoves, 1);
  h.app.setDial(wToDial(-1));
  h.key('keydown', 'q'); h.app.handleInteract(); // dock while held
  assert.equal(h.app.wHold, -1);
  h.key('keyup', 'q');
  assert.equal(h.app.controller.docking, null);
  assert.equal(dialToW(h.app.current), -1);
});

test('full app: rail absolute changes are synchronous; fine keyboard and pointer share B release rules', async () => {
  for (const source of ['pointer', 'keyboard']) {
    const h = await parked();
    h.app.setDial(wToDial(-.92));
    if (source === 'pointer') {
      h.node('w-rail').emit('pointerdown', { pointerId: 2, clientY: 300 }); // W = -1
      assert.equal(dialToW(h.app.current), -1);
      assert.equal(h.app.current, h.app.target);
      h.node('w-rail').emit('pointerup', { pointerId: 2 });
    } else {
      h.node('w-rail').emit('keydown', { key: 'ArrowDown' }); // -0.08 W
      h.node('w-rail').emit('keyup', { key: 'ArrowDown' });
    }
    h.advance(200);
    assert.ok(Math.abs(dialToW(h.app.current) + 1.1) < 1e-9, source);
  }
});

test('full app: A retains collision stop and display trailing; normal copy and progress stay original', async () => {
  const a = await appHarness('?study=w1&wcontrol=a&level=gate');
  a.app.setDial(wToDial(-1.9)); a.app.run.pos = [0, 0];
  a.key('keydown', 'e'); a.advance(2500);
  assert.equal(a.app.wHold, 0);
  a.app.run.pos = [...a.app.level.field.start]; const stopped = a.app.target; a.advance(100);
  assert.equal(a.app.target, stopped);
  const normal = await appHarness('?level=gate');
  assert.equal(normal.app.level.objective, '走到东边的出口。');
  assert.equal(normal.app.level.hints.length, 3);
  assert.ok(normal.reads.length >= 2);
  normal.key('keydown', 'e'); normal.advance(100);
  assert.notEqual(normal.app.current, normal.app.target);
});

test('full app: research navigation/copy/storage/export span unfinished levels, with no completion invented', async () => {
  const h = await appHarness('?study=w1&wcontrol=b&level=gate');
  assert.equal(h.app.level.hints.length, 2);
  h.node('hint').click(); h.node('hint-next').click();
  assert.equal(h.node('hint-next').hidden, true);
  assert.equal(h.node('hint-next').textContent, '再看一条提示');
  h.node('study-next').click(); assert.equal(h.app.level.id, 'station-routes');
  h.node('study-next').click(); assert.equal(h.app.level.id, '2-3');
  assert.equal(h.app.level.objective, '到达金色出口。');
  assert.equal(h.app.session.events.filter((e) => e.type === 'complete').length, 0);
  h.node('study-next').click(); assert.equal(h.app.segment, 3);
  assert.equal(h.app.level.objective, '请把晶核放进插座。');
  h.node('study-next').click(); assert.equal(h.app.segment, 4);
  assert.equal(h.app.level.id, 'station-routes');
  assert.deepEqual(h.reads, []); assert.deepEqual(h.writes, []);
  assert.equal(h.app.session.metadata.buildCommit, 'test-implementation');
});

test('full app: blur during docking and stale key repeats cannot resume motion; new input can', async () => {
  const h = await parked();
  h.key('keydown', 'e'); h.key('keyup', 'e'); h.advance(33);
  const atBlur = h.app.current;
  assert.ok(h.app.controller.docking);
  h.window.emit('blur'); h.advance(500);
  assert.equal(h.app.current, atBlur);
  h.key('keydown', 'e', { repeat: true });
  h.key('keydown', 'd', { repeat: true });
  h.node('w-rail').emit('keydown', { key: 'ArrowDown', repeat: true });
  h.advance(300);
  assert.equal(h.app.current, atBlur);
  assert.equal(h.app.pressed.size, 0);
  h.key('keydown', 'e'); h.advance(100);
  assert.ok(h.app.current > atBlur);
});

test('full app: cancelling a W gesture at the receiver does not deliver the core', async () => {
  const h = await parked();
  h.app.run.pos = [...h.app.level.field.goal];
  h.app.setDial(.5);
  h.node('w:1').emit('pointerdown', { pointerId: 20 });
  const item = { ...h.app.run.item };
  h.node('w:1').emit('pointercancel', { pointerId: 20 });
  assert.equal(h.app.run.won, false);
  assert.equal(h.app.run.carrying, true);
  assert.deepEqual(h.app.run.item, item);
});

test('full app: a new input interrupts docking and final release closes each gesture once', async () => {
  const h = await parked();
  h.key('keydown', 'q'); h.key('keyup', 'q'); h.advance(33);
  const from = h.app.current;
  h.node('w:1').emit('pointerdown', { pointerId: 30 });
  assert.equal(h.app.controller.docking, null);
  h.advance(100);
  assert.ok(h.app.current > from);
  h.node('w:1').emit('pointercancel', { pointerId: 30 });
  const events = h.app.session.events;
  assert.equal(events.filter((e) => e.type === 'w_gesture_start').length, 2);
  assert.equal(events.filter((e) => e.type === 'w_gesture_end').length, 2);
  assert.equal(events.filter((e) => e.type === 'dock_cancel').length, 1);
});

test('full app: W endpoints have no refusal feedback and Escape cancels without snapping', async () => {
  const h = await appHarness('?study=w1&wcontrol=b&level=gate');
  h.key('keydown', 'e'); h.advance(4000); h.key('keyup', 'e');
  assert.equal(h.app.current, 1);
  assert.equal(h.app.run.refused, 0);
  assert.equal(h.sounds.filter(([s]) => s === 'refused').length, 0);
  const p = await parked();
  p.key('keydown', 'e'); p.key('keydown', 'Escape');
  assert.equal(p.app.controller.docking, null);
  assert.equal(p.app.wHold, 0);
  assert.equal(dialToW(p.app.current), -1);
});
