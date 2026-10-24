import test from 'node:test';
import assert from 'node:assert/strict';
import { WControl, W_PARAMS, nearbyDevices, dockingCandidate, studyConfig } from '../controls.mjs';
import { WalkRun } from '../game.mjs';
import { levelById } from '../levels.mjs';
import { dialToW, wToDial, hyperbox } from '../geometry.mjs';
import { StudySession, studyLevel } from '../study.mjs';

const station = () => {
  const level = levelById('station-routes'), run = new WalkRun(level.field, level.id);
  const socket = level.field.relay.socket;
  run.pos = [...level.field.item.start.slice(0, 2)];
  assert.equal(run.interact().action, 'picked');
  run.pos = [socket.x, socket.z];
  run.setDial(wToDial(socket.w + 0.10));
  return { level, run, socket };
};
const drive = (control, level, run, dt = 1 / 60) => {
  if (!control.shouldDrive(run)) return null;
  const from = run.dial;
  const result = run.reachDial(control.next(level, run, dt));
  return control.accepted(run, from, result.clamped);
};

test('B is opt-in; invalid or missing control resolves to A without storage', () => {
  for (const search of ['', '?wcontrol=b', '?study=w1', '?study=w1&wcontrol=c']) assert.equal(studyConfig(search).condition, 'a');
  assert.equal(studyConfig('?study=w1&wcontrol=b').condition, 'b');
});

test('keyboard set is neutral with Q/E; releases restore remaining direction; other sources cannot take over', () => {
  const c = new WControl();
  assert.ok(c.press('keyboard-hold', 'q', -1));
  assert.equal(c.press('keyboard-hold', 'q', -1), false);
  c.press('keyboard-hold', 'e', 1);
  c.press('keyboard-hold', 'PageUp', 1);
  assert.equal(c.direction, 0);
  assert.equal(c.state, 'NEUTRAL');
  assert.equal(c.press('touch-w-button', 2, 1), false);
  assert.equal(c.release('touch-w-button', 2), false);
  c.release('keyboard-hold', 'q');
  assert.equal(c.direction, 1);
  c.cancel();
  assert.equal(c.state, 'IDLE');
});

test('held W stops at wall and resumes from new ground position without a new gesture', () => {
  const level = levelById('gate');
  const run = new WalkRun(level.field, level.id);
  const c = new WControl();
  run.setDial(wToDial(-1.9));
  run.pos = [0, 0];
  c.press('keyboard-hold', 'e', 1);
  let contacts = 0;
  for (let i = 0; i < 300; i++) contacts += Number(drive(c, level, run)?.started ?? false);
  assert.equal(c.state, 'BLOCKED');
  assert.equal(c.direction, 1);
  assert.equal(contacts, 1);
  assert.equal(run.refused, 1);
  const blocked = run.dial;
  assert.equal(c.shouldDrive(run), false, 'unchanged obstruction is not retried');
  run.pos = [...level.field.start];
  for (let i = 0; i < 15; i++) drive(c, level, run);
  assert.ok(run.dial > blocked + 0.05);
  assert.equal(run.refused, 1);
});

test('local speed is 0.50 W/s only beside a solid meaningful device; general speed 1.28', () => {
  const { level, run } = station();
  const c = new WControl(); c.press('keyboard-hold', 'q', -1);
  assert.ok(Math.abs((run.dial - c.next(level, run, .1)) * 4 - .05) < 1e-9);
  run.pos[0] -= 1;
  assert.ok(Math.abs((run.dial - c.next(level, run, .1)) * 4 - .128) < 1e-9);
});

for (const source of ['keyboard-hold', 'touch-w-button', 'rail-pointer', 'rail-keyboard']) {
  test(`${source}: normal release safely docks in 120 ms and never operates the device`, () => {
    const { level, run, socket } = station();
    const c = new WControl(); c.press(source, 1, 0);
    assert.ok(c.release(source, 1, level, run));
    assert.equal(c.state, 'DOCKING');
    for (let i = 0; i < 6; i++) {
      const to = c.dockStep(level, run, .02);
      assert.equal(run.reachDial(to).clamped, false);
    }
    assert.ok(Math.abs(dialToW(run.dial) - socket.w) < 1e-9);
    assert.equal(c.state, 'IDLE');
    assert.equal(run.carrying, true);
    assert.equal(run.socketPowered(), false);
    assert.equal(c.release(source, 1, level, run), false, 'lostcapture after release is inert');
  });
}

test('candidate gates reject hidden/peek, far, ghost, inert, out of capture and free core', () => {
  const { level, run, socket } = station();
  assert.equal(dockingCandidate(level, run).id, 'socket');
  assert.equal(dockingCandidate({ ...level, map: 'hidden' }, run), null);
  assert.equal(dockingCandidate({ ...level, chapter: 2 }, run), null);
  run.pos[0] += socket.reach + .001;
  assert.equal(dockingCandidate(level, run), null);
  run.pos = [socket.x, socket.z];
  run.setDial(wToDial(socket.w + .121));
  assert.equal(dockingCandidate(level, run), null);
  run.setDial(wToDial(socket.w + .251));
  assert.equal(nearbyDevices(level, run).length, 0);
  run.setDial(wToDial(socket.w + .1));
  run.interact(); // dock
  assert.equal(dockingCandidate(level, run).id, 'socket', 'occupied socket still permits retrieval');
  run.interact(); // retrieve
  run.pos[0] -= .3;
  run.setDial(wToDial(socket.w + .4));
  run.interact(); // free drop away from socket
  run.setDial(wToDial(socket.w + .1));
  assert.equal(dockingCandidate(level, run), null, 'free core is not a docking target');
  const latch = level.field.relay.latch;
  run.pos = [latch.x, latch.z]; run.setDial(wToDial(.1));
  assert.equal(dockingCandidate(level, run).id, 'latch');
  run.interact();
  assert.equal(dockingCandidate(level, run), null, 'open latch has no further meaning');
});

test('whole swept path rejects an intermediate obstacle even when both endpoints are legal', () => {
  const { level, run, socket } = station();
  const barrier = hyperbox('thin-intermediate', [socket.x, .3, socket.z, socket.w + .05], [.5, .5, .5, .005]);
  run.carriedField = { ...run.activeField(), bodies: [barrier] };
  assert.equal(run.canSetDial(run.dial), true);
  assert.equal(run.canSetDial(wToDial(socket.w), wToDial(socket.w)), true);
  assert.equal(dockingCandidate(level, run), null);
  const c = new WControl(); c.press('rail-pointer', 1); c.release('rail-pointer', 1, level, run);
  assert.equal(c.docking, null);
  assert.ok(Math.abs(dialToW(run.dial) - socket.w - .1) < 1e-9);
});

test('state changes forbid docking for the whole gesture while preserving held intent', () => {
  const { level, run } = station();
  const c = new WControl(); c.press('keyboard-hold', 'e', 1);
  c.invalidate();
  assert.equal(c.direction, 1);
  c.release('keyboard-hold', 'e', level, run);
  assert.equal(c.docking, null);
  c.press('keyboard-hold', 'e', 1);
  c.release('keyboard-hold', 'e', level, run);
  assert.ok(c.docking);
  run.interact();
  assert.equal(c.dockStep(level, run, .02), null);
});

test('docking cancels on lost reach, new state, cancellation or new input without moving', () => {
  for (const cause of ['reach', 'state', 'cancel', 'input', 'geometry']) {
    const { level, run } = station();
    const c = new WControl(); c.press('keyboard-hold', 'e', 1); c.release('keyboard-hold', 'e', level, run);
    const from = run.dial;
    if (cause === 'reach') run.pos[0] -= 1;
    if (cause === 'state') run.relayLatched = true;
    if (cause === 'cancel') c.cancel(true);
    if (cause === 'input') c.press('touch-w-button', 2, -1);
    if (cause === 'geometry') run.carriedField = { ...run.carriedField };
    assert.equal(c.dockStep(level, run, .1), null, cause);
    assert.equal(run.dial, from);
  }
});

test('contact re-arms after .02 W safe motion without resetting per-gesture refusal counts', () => {
  const { run } = station(); const c = new WControl(); c.press('keyboard-hold', 'e', 1);
  assert.equal(c.accepted(run, run.dial, true).started, true);
  assert.equal(c.accepted(run, run.dial, true).started, false);
  const from = run.dial; run.dial += .005;
  assert.equal(c.accepted(run, from, false).ended, true);
  assert.equal(c.accepted(run, run.dial, true).started, true);
});

test('study copy overlays two hints without mutating geometry/levels; incomplete logs use explicit time', () => {
  const original = levelById('2-3');
  const override = studyLevel(original, true);
  assert.equal(override.field, original.field);
  assert.equal(override.hints.length, 2);
  assert.equal(original.hints.length, 3);
  assert.equal(studyLevel(original, false), original);
  const log = new StudySession(studyConfig('?study=w1&wcontrol=wrong'), { buildCommit: 'implementation' }, 1000, 'test');
  log.record('level_enter', { level: 'gate', dial: .5 }, {}, 1100);
  assert.equal(log.export(1600).elapsed_ms, 600);
  assert.equal(log.export(1600).actualCondition, 'a');
  log.finish({}, 1700);
  log.record('complete', {}, {}, 1800);
  assert.equal(log.export(2000).elapsed_ms, 700);
  assert.equal(log.events.at(-1).type, 'session_end');
  assert.equal(W_PARAMS.dockMs, 120);
});

test('ambiguous nearby devices cancel rather than selecting the first or safest target', () => {
  const { level, run, socket } = station();
  const ambiguous = { ...level, field: { ...level.field, relay: { ...level.field.relay, latch: { ...socket, w: socket.w + .02 } } } };
  assert.equal(nearbyDevices(ambiguous, run).length, 2);
  assert.equal(dockingCandidate(ambiguous, run), null);
});

test('build receipt verifies source and refuses to mislabel edited code with an old commit', async () => {
  const { readStudyBuild } = await import('../study.mjs');
  const { createHash } = await import('node:crypto');
  const hash = (s) => createHash('sha256').update(s).digest('hex');
  const source = 'console.log(1);';
  const receipt = { buildCommit: 'a'.repeat(40), files: ['app.mjs'], sourceDigest: hash(`app.mjs\0${hash(source)}\n`) };
  let served = source;
  const fetcher = async (path) => ({ ok: true, json: async () => receipt, text: async () => served });
  assert.equal((await readStudyBuild(fetcher, hash)).status, 'verified');
  served = 'console.log(2);';
  const mismatch = await readStudyBuild(fetcher, hash);
  assert.equal(mismatch.buildCommit, null);
  assert.equal(mismatch.status, 'source_mismatch');
  assert.equal(mismatch.declaredBuildCommit, receipt.buildCommit);
});
