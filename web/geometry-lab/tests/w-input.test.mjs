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
  h.app.setDial(wToDial(1.9)); h.app.run.pos = [0, 0];
  h.key('keydown', 'q'); h.advance(4000);
  const blocked = h.app.current;
  assert.equal(h.app.controller.state, 'BLOCKED');
  assert.equal(h.app.wHold, -1);
  assert.equal(h.sounds.filter(([s]) => s === 'refused').length, 1);
  assert.equal(h.app.nudge, null, 'outline expired while the key stays held');
  assert.equal(h.app.flash, 0, 'pulse does not renew');
  h.app.run.pos = [...h.app.level.field.start]; h.advance(100);
  assert.ok(h.app.current < blocked);
  h.key('keyup', 'q'); h.advance(4000);
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
  a.app.setDial(wToDial(1.9)); a.app.run.pos = [0, 0];
  a.key('keydown', 'q'); a.advance(2500);
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

for (const search of ['?study=w1&wcontrol=b&level=station-routes', '?study=w1&wcontrol=a&level=station-routes', '?level=station-routes']) {
  test(`full app ${search}: carrying onto a socket in another W points to it instead of dropping the core`, async () => {
    const h = await appHarness(search);
    const r = h.app.run, s = h.app.level.field.relay.socket;
    r.pos = [...h.app.level.field.item.start.slice(0, 2)]; h.app.handleInteract();
    r.pos = [s.x, s.z]; h.advance(50);
    const btn = h.node('action-btn');
    assert.equal(btn.disabled, true);
    assert.equal(btn.textContent, '放入插座', 'a short verb, not a sentence');
    assert.equal(btn.dataset.key, '−W', 'the chip shows the way');
    assert.equal(h.document.body.dataset.guide, '-1', 'the −W control glows');
    h.key('keydown', ' '); h.key('keyup', ' ');
    assert.equal(r.carrying, true, 'core stays in hand');
    assert.equal(h.node('toast').textContent, '', 'no sentence toast');
    assert.match(h.node('sr-status').textContent, /往 −W/, 'screen readers still hear it');
    h.app.setDial(wToDial(s.w)); h.advance(50);
    assert.equal(btn.textContent, '放入插座');
    assert.equal(btn.disabled, false);
    assert.equal(btn.dataset.key, '空格');
    assert.equal(h.document.body.dataset.guide, '', 'guide ends once the device is reachable');
    h.app.setDial(wToDial(0)); h.advance(50);
    r.pos = [s.x + 1, s.z]; h.advance(50);
    h.app.handleInteract();
    assert.equal(r.carrying, false, 'dropping away from devices still works');
  });
}

test('full app: toasts give way to in-place feedback; the refusal sentence shows once per level', async () => {
  const h = await appHarness('?study=w1&wcontrol=b&level=station-routes');
  const r = h.app.run;
  r.pos = [...h.app.level.field.item.start.slice(0, 2)];
  h.app.handleInteract();
  assert.equal(r.carrying, true);
  assert.equal(h.node('toast').textContent, '', 'pickup has no toast');
  assert.ok(h.node('stats').classes.has('pop'), 'the carry chip pops instead');
  assert.equal(h.node('sr-status').textContent, '拿起晶核');
  const g = await appHarness('?study=w1&wcontrol=b&level=gate');
  for (let i = 0; i < 2; i++) {
    g.app.setDial(wToDial(1.9)); g.app.run.pos = [0, 0];
    g.key('keydown', 'q'); g.advance(1500); g.key('keyup', 'q');
    if (i === 0) { assert.match(g.node('toast').textContent, /碰到障碍/); g.node('toast').textContent = ''; }
  }
  assert.equal(g.node('toast').textContent, '', 'second refusal is visual only');
  assert.match(g.node('sr-status').textContent, /碰到障碍/);
  g.app.startLevel('gate');
  g.app.setDial(wToDial(1.9)); g.app.run.pos = [0, 0];
  g.key('keydown', 'q'); g.advance(1500); g.key('keyup', 'q');
  assert.match(g.node('toast').textContent, /碰到障碍/, 'a new level teaches once again');
});

test('full app: key HUD lights with real keys and fades after walking and moving in W', async () => {
  const h = await appHarness('?study=w1&wcontrol=b&level=gate');
  const cap = (k) => h.node(`#key-hud kbd[data-k="${k}"]`);
  assert.equal(h.node('key-hud').hidden, false);
  h.key('keydown', 'e'); assert.ok(cap('e').classes.has('on'));
  h.key('keyup', 'e'); assert.ok(!cap('e').classes.has('on'));
  assert.ok(!h.node('key-hud').classes.has('learned'));
  h.key('keydown', 'ArrowRight'); assert.ok(cap('d').classes.has('on'), 'arrows light the WASD caps');
  h.key('keyup', 'ArrowRight'); assert.ok(!cap('d').classes.has('on'));
  assert.ok(h.node('key-hud').classes.has('learned'));
});

test('full app: pointing at a mechanism row outlines its door in the scene', async () => {
  const h = await appHarness('?study=w1&wcontrol=b&level=station-routes');
  const outline = () => h.app.frame().sections.find((s) => s.id === 'station-phase-door').refused;
  assert.equal(outline(), 0);
  h.app.pointAt('station-phase-door');
  assert.equal(outline(), -1, 'negative = pointed at (mint), positive = refusal (red)');
  h.app.pointAt(null);
  assert.equal(outline(), 0);
});

test('full app: W gauge beside the character appears while W changes, then fades; A keeps rail-only feedback', async () => {
  for (const [search, expected] of [['?study=w1&wcontrol=b&level=gate', true], ['?level=gate', true], ['?study=w1&wcontrol=a&level=gate', false]]) {
    const h = await appHarness(search);
    const gauge = h.node('w-gauge');
    assert.equal(gauge.hidden, true, `${search}: nothing at rest`);
    h.key('keydown', 'e'); h.advance(300);
    assert.equal(!gauge.hidden, expected, `${search}: shown while moving in W`);
    if (expected) {
      assert.equal(gauge.dataset.move, '1', 'the +W chevron lights');
      assert.ok(parseFloat(h.node('wg-thumb').style.top) < 50, 'thumb rises toward +W');
      assert.ok(h.node('wg-marks').children.some((m) => m.className === 'wg-goal'), 'exit layer is marked');
    }
    h.key('keyup', 'e'); h.advance(2500);
    assert.equal(gauge.hidden, true, `${search}: fades after W settles`);
  }
});

test('full app: a refusal shows the gauge with its red zone, and chapter 2 keeps red zones hidden', async () => {
  const h = await appHarness('?study=w1&wcontrol=b&level=gate');
  h.app.setDial(wToDial(1.9)); h.app.run.pos = [0, 0];
  h.key('keydown', 'q'); h.advance(1500);
  assert.equal(h.node('w-gauge').hidden, false, 'still visible while held against the ball');
  assert.ok(h.node('wg-marks').children.some((m) => m.className === 'wg-block'));
  h.key('keyup', 'q');
  const hidden = await appHarness('?level=2-3');
  hidden.key('keydown', 'q'); hidden.advance(300);
  assert.equal(hidden.node('w-gauge').hidden, false);
  assert.ok(!hidden.node('wg-marks').children.some((m) => m.className === 'wg-block'), 'no W aids without the map');
});

test('full app: one ground key runs along the nearest world axis under the default iso camera', async () => {
  for (const [key, axis, sign] of [['d', 0, 1], ['s', 1, 1], ['a', 0, -1], ['w', 1, -1]]) {
    const h = await appHarness('?study=w1&wcontrol=b&level=gate');
    const start = [...h.app.run.pos];
    h.key('keydown', key); h.advance(200); h.key('keyup', key);
    const moved = [h.app.run.pos[0] - start[0], h.app.run.pos[1] - start[1]];
    assert.ok(sign * moved[axis] > .2, key);
    assert.ok(Math.abs(moved[1 - axis]) < 1e-9, `${key} stays on its axis`);
  }
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
