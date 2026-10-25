import test from 'node:test';
import assert from 'node:assert/strict';
import { appHarness } from './app-harness.mjs';

const caught = (h) => {
  h.app.run.pos = [-1.1, 0];
  h.app.setDial(0.5);
  h.advance(50);
};

test('ordinary entry: stale movement repeats cannot walk out of a respawn', async () => {
  const h = await appHarness('?level=sentry');
  h.key('keydown', 'd');
  caught(h);
  const safe = [...h.app.run.pos];
  h.key('keydown', 'd', { repeat: true });
  h.advance(200);
  assert.deepEqual(h.app.run.pos, safe);
  h.key('keyup', 'd');
  h.key('keydown', 'd');
  h.advance(100);
  assert.ok(h.app.run.pos[0] > safe[0], 'a fresh press still moves during protection');
});

test('ordinary entry: a held rail is cancelled on capture and cannot move the respawn W', async () => {
  const h = await appHarness('?level=sentry');
  const rail = h.node('w-rail');
  rail.emit('pointerdown', { pointerId: 9, clientY: 200 });
  caught(h);
  rail.emit('pointermove', { pointerId: 9, clientY: 80 });
  h.advance(100);
  assert.equal(h.app.current, 0.5);
  assert.equal(rail.hasPointerCapture(9), false);
});

test('hiding the patrol pauses it and requires an explicit resume', async () => {
  const h = await appHarness('?level=sentry');
  h.key('keydown', 'd');
  h.document.hidden = true;
  h.document.emit('visibilitychange');
  const safe = [...h.app.run.pos];
  h.advance(1500);
  assert.deepEqual(h.app.run.pos, safe);
  assert.equal(h.frames.size, 0);
  h.document.hidden = false;
  h.document.emit('visibilitychange');
  h.advance(300);
  assert.deepEqual(h.app.run.pos, safe);
  assert.equal(h.node('card-layer').hidden, false);
  assert.equal(h.node('card-title').textContent, '已暂停');
});

test('danger feedback distinguishes current sight, cooling, and recovery protection', async () => {
  const h = await appHarness('?level=sentry');
  const status = h.node('stealth-status');
  assert.equal(status.dataset.state, 'clear');
  h.app.run.pos = [-1.45, 0];
  h.advance(150);
  assert.equal(status.dataset.state, 'watched');
  assert.ok(Number(h.node('stealth-meter').getAttribute('aria-valuenow')) > 0);
  h.app.setDial(1);
  h.advance(50);
  assert.equal(status.dataset.state, 'cooling', 'leaving W sight does not pretend accumulated alert is gone');
  h.app.run.pos = [...h.app.level.field.start];
  h.advance(700);
  assert.equal(status.dataset.state, 'clear');
  caught(h);
  assert.equal(status.dataset.state, 'grace');
  assert.match(h.node('stealth-label').textContent, /返回入口/);
  assert.match(h.node('sr-status').textContent, /回到入口/);
  assert.equal(h.node('stealth-meter').getAttribute('aria-label'), '剩余保护');
  h.advance(1500);
  assert.equal(status.dataset.state, 'clear');
});

test('checkpoint is visibly saved, survives a catch, and is cleared by restart', async () => {
  const h = await appHarness('?level=sentry');
  h.app.run.pos = [...h.app.level.field.checkpoint.pos];
  h.advance(50);
  assert.equal(h.node('checkpoint-tag').textContent, '✓ 检查点');
  assert.equal(h.node('toast').textContent, '检查点已保存');
  caught(h);
  assert.deepEqual(h.app.run.pos, [...h.app.level.field.checkpoint.pos]);
  assert.match(h.node('stealth-label').textContent, /返回检查点/);
  h.node('restart').click();
  assert.equal(h.node('checkpoint-tag').textContent, '检查点');
  assert.equal(h.app.patrol.caught, 0);
  assert.equal(h.node('stage').classes.has('caught'), false);
  assert.equal(h.node('sr-status').textContent, '');
});

test('pausing freezes patrol, alert and protection; continuing restarts RAF without old inputs', async () => {
  const h = await appHarness('?level=sentry');
  h.key('keydown', 'd'); h.advance(100); h.key('keyup', 'd');
  caught(h);
  h.node('ArrowRight').emit('pointerdown', { pointerId: 3 });
  h.node('pause').click();
  const t = h.app.patrol.t, grace = h.app.patrol.grace, startedAt = h.app.run.startedAt;
  const safe = [...h.app.run.pos];
  assert.equal(h.node('ArrowRight').hasPointerCapture(3), false);
  h.advance(3000);
  assert.equal(h.frames.size, 0);
  assert.equal(h.app.patrol.t, t);
  assert.equal(h.app.patrol.grace, grace);
  assert.equal(h.node('stealth-status').hidden, true);
  h.node('card-actions').children[0].click();
  assert.ok(h.app.run.startedAt >= startedAt + 3000, 'pause duration is excluded from completion time');
  h.advance(100);
  assert.ok(h.app.patrol.t > t);
  assert.ok(h.app.patrol.grace < grace);
  assert.deepEqual(h.app.run.pos, safe);
  h.key('keydown', 'ArrowRight');
  h.node('ArrowRight').emit('pointerup', { pointerId: 3 });
  h.advance(100);
  assert.ok(h.app.run.pos[0] > safe[0], 'a late cancelled touch release cannot cancel a fresh keyboard press');
});

test('focus loss pauses and stale rail keyboard repeats cannot change W after continuing', async () => {
  const h = await appHarness('?level=sentry');
  const rail = h.node('w-rail');
  rail.emit('keydown', { key: 'ArrowUp' });
  h.advance(150);
  h.window.emit('blur');
  const dial = h.app.current, t = h.app.patrol.t;
  h.advance(1000);
  assert.equal(h.app.current, dial);
  assert.equal(h.app.patrol.t, t);
  h.node('card-actions').children[0].click();
  rail.emit('keydown', { key: 'ArrowUp', repeat: true });
  h.advance(100);
  assert.equal(h.app.current, dial);
  rail.emit('keyup', { key: 'ArrowUp' });
  rail.emit('keydown', { key: 'ArrowUp' });
  h.advance(150);
  assert.ok(h.app.current > dial);
});

test('P/Escape pause, completion and other levels do not leave patrol HUD or frames running', async () => {
  const h = await appHarness('?level=sentry');
  h.key('keydown', 'p');
  assert.equal(h.node('card-title').textContent, '已暂停');
  h.node('card-actions').children[0].click();
  h.key('keydown', 'Escape');
  assert.equal(h.node('card-layer').hidden, false);
  h.node('card-actions').children[0].click();
  h.app.run.pos = [...h.app.level.field.goal];
  h.advance(1000);
  assert.equal(h.app.run.won, true);
  assert.equal(h.node('stealth-status').hidden, true);
  assert.equal(h.frames.size, 0);
  h.app.startLevel('gate');
  assert.equal(h.node('pause').hidden, true);
  assert.equal(h.node('stealth-status').hidden, true);
  assert.equal(h.node('checkpoint-tag').hidden, true);
});
