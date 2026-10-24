import test from 'node:test';
import assert from 'node:assert/strict';
import { FlatlandModel } from '../src/flatland/model.js';
import { FLATLAND_LEVELS } from '../src/flatland/levels.js';

const index = id => FLATLAND_LEVELS.findIndex(level => level.id === id);
function play(id) { const model = new FlatlandModel(index(id)); model.start(); model.drainEvents(); return model; }
function wait(model, seconds) { for (let t = 0; t < seconds - 1e-9; t += .05) model.update(Math.min(.05, seconds - t)); }
function slide(model, target) { model.setSlice(target); model.endSliceGesture(); }
function walk(model, x, y, seconds) { model.setMove(x, y); wait(model, seconds); model.setMove(0, 0); }
const types = model => model.drainEvents().map(event => event.type);

test('levels start in the intro and ignore input until started', () => {
  const model = new FlatlandModel(0);
  assert.equal(model.phase, 'intro');
  assert.equal(model.setSlice(3), false);
  assert.equal(model.start(), true);
  assert.equal(model.setSlice(3), true);
});

test('visitor: sweeping past a ring does not count, holding the match does', () => {
  const model = play('visitor');
  model.setSlice(3); wait(model, .05); model.setSlice(.2); wait(model, .05);
  assert.ok(model.goals.every(goal => !goal.done), 'brief pass-through is not a match');
  model.setSlice(3);
  assert.ok(types(model).includes('section_enter'));
  wait(model, .4);
  assert.equal(model.goals.find(goal => goal.id === 'r25').done, true);
  assert.ok(types(model).includes('goal_done'));
});

test('visitor: player cannot walk, and finishing leads to a quiz then three stars', () => {
  const model = play('visitor');
  const before = { ...model.player };
  walk(model, 1, 0, .5);
  assert.equal(model.player.x, before.x);
  for (const s of [3, 1, 5, 3 - Math.sqrt(2.5 ** 2 - 1)]) { model.setSlice(s); wait(model, .4); }
  model.endSliceGesture();
  assert.equal(model.phase, 'playing', 'matching all rings preserves exploration');
  assert.equal(model.finishObservation(), true);
  assert.equal(model.phase, 'quiz');
  assert.deepEqual(model.goals.find(goal => goal.id === 'r15').sides.size, 2);
  assert.equal(model.answerQuiz(1), true);
  assert.equal(model.phase, 'complete');
  assert.deepEqual(model.stars, [true, true, true]);
});

test('visitor: a wrong answer or a single side loses only the third star', () => {
  const model = play('visitor');
  for (const s of [3, 1, 3 - Math.sqrt(2.5 ** 2 - 1)]) { model.setSlice(s); wait(model, .4); }
  model.finishObservation();
  model.answerQuiz(1);
  assert.deepEqual(model.stars, [true, true, false]);
  const wrong = play('visitor');
  for (const s of [3, 1, 5, 3 - Math.sqrt(2.5 ** 2 - 1)]) { wrong.setSlice(s); wait(wrong, .4); }
  wrong.finishObservation();
  wrong.answerQuiz(0);
  assert.deepEqual(wrong.stars, [true, true, false]);
  assert.equal(wrong.counters.quizWrong, 1);
});

test('visitor: natural upward exploration can still find the second height after all rings are lit', () => {
  const model = play('visitor');
  assert.equal(model.finishObservation(), false, 'cannot skip the rings');
  for (const s of [3 - Math.sqrt(5.25), 1, 3]) { slide(model, s); wait(model, .4); }
  assert.equal(model.snapshot().observationReady, true);
  const earnedAt = model.matchedAt;
  wait(model, 31);
  assert.equal(model.setSlice(5), true);
  wait(model, .4);
  assert.equal(model.finishObservation(), true);
  assert.equal(model.answerQuiz(99), false);
  model.answerQuiz(1);
  assert.ok(earnedAt < 30);
  assert.deepEqual(model.stars, [true, true, true], 'optional exploration does not revoke the earned time star');
});

test('visitor: each matching height needs its own continuous hold', () => {
  const model = play('visitor');
  slide(model, 1); wait(model, .4);
  slide(model, 5); wait(model, .05);
  assert.equal(model.goals.find(goal => goal.id === 'r15').sides.size, 1);
  slide(model, 3); slide(model, 5); wait(model, .1);
  assert.equal(model.goals.find(goal => goal.id === 'r15').sides.size, 1);
  wait(model, .3);
  assert.equal(model.goals.find(goal => goal.id === 'r15').sides.size, 2);
});

function observe(model, heights) {
  for (const s of heights) { slide(model, s); wait(model, .3); }
}
function finishGuess(choices) {
  const model = play('guess');
  observe(model, [1.7, 3, 4.3]);
  for (const choice of choices) {
    assert.equal(model.answerRound(choice), true);
    observe(model, model.snapshot().round.targets);
    assert.equal(model.nextRound(), true);
  }
  return model;
}

test('guess: observations precede the first answer and the hidden profile is not exposed', () => {
  const model = play('guess');
  wait(model, 1);
  assert.equal(model.phase, 'playing', 'empty reach goals do not complete a quiz level');
  assert.equal(model.answerRound(1), false);
  assert.equal(model.nextRound(), false);
  assert.deepEqual(model.snapshot().profiles, []);
  observe(model, [1.7, 3, 4.3]);
  assert.equal(model.snapshot().round.stage, 'answer');
  assert.equal(model.snapshot().round.explain, null);
  assert.equal('answer' in model.snapshot().round, false);
  assert.equal(model.answerRound(-1), false);
  assert.equal(model.answerRound(4), false);
  assert.equal(model.answerRound(1.5), false);
  assert.equal(model.answerRound(1), true);
  assert.equal(model.snapshot().profiles.length, 1);
  assert.equal(model.snapshot().sideView, 'full');
  assert.equal(model.nextRound(), false, 'a correct guess cannot skip physical verification');
  assert.equal(model.answerRound(1), false, 'repeated clicks do not award more correct answers');
  assert.equal(model.counters.firstCorrect, 1);
});

test('guess: sweeps, interrupted holds and large frames cannot fabricate observations', () => {
  const model = play('guess');
  slide(model, 1.7); wait(model, .1); slide(model, 3); slide(model, 1.7); wait(model, .1);
  assert.equal(model.snapshot().round.samples.length, 0);
  model.update(10);
  assert.equal(model.snapshot().round.samples.length, 0);
  wait(model, .1);
  assert.equal(model.snapshot().round.samples.length, 1);
  slide(model, 4.3); wait(model, .4);
  assert.equal(model.snapshot().round.samples.length, 1, 'must observe the middle rather than skip it');
});

test('guess: cone prediction locks scrubbing, then verifies small to large to absent while descending', () => {
  const model = play('guess');
  observe(model, [1.7, 3, 4.3]); model.answerRound(1); observe(model, [3]); model.nextRound();
  assert.equal(model.snapshot().round.stage, 'predict');
  assert.equal(model.setSlice(3), false);
  model.setSliceVelocity(-1); wait(model, 1); model.setSliceVelocity(0);
  assert.equal(model.s, 5.8);
  model.answerRound(0); observe(model, [5.25, 3, .6, .2]);
  const shapes = model.snapshot().round.samples.map(sample => sample.shape);
  assert.ok(shapes[0].r < shapes[1].r && shapes[1].r < shapes[2].r);
  assert.equal(shapes[3], null);
  assert.equal(model.snapshot().round.stage, 'review');
});

test('guess: three verified rounds earn three stars and the diagonal cube really has six edges', () => {
  const model = finishGuess([1, 0, 1]);
  assert.equal(model.phase, 'complete');
  assert.deepEqual(model.stars, [true, true, true]);
  assert.deepEqual(model.snapshot().round.samples.map(s => s.shape.points.length), [3, 6, 3]);
  assert.equal(model.roundResults.length, 3);
  assert.equal(model.nextRound(), false);
  assert.equal(types(model).filter(type => type === 'complete').length, 1);
  assert.equal(model.next(), true);
  assert.equal(model.level.id, 'escape');
});

test('guess: wrong predictions remain solvable, with stars based only on first answers', () => {
  const oneWrong = finishGuess([1, 0, 0]);
  assert.deepEqual(oneWrong.stars, [true, true, false]);
  assert.equal(oneWrong.counters.quizWrong, 1);
  const allWrong = finishGuess([0, 2, 3]);
  assert.deepEqual(allWrong.stars, [true, false, false]);
  assert.equal(allWrong.counters.quizWrong, 3);
  allWrong.restart(); allWrong.start();
  assert.equal(allWrong.roundIndex, 0);
  assert.equal(allWrong.counters.firstCorrect, 0);
  assert.equal(allWrong.counters.quizWrong, 0);
  assert.deepEqual(allWrong.roundResults, []);
  assert.deepEqual(allWrong.snapshot().profiles, []);
});

test('guess: observation snapshots cannot mutate saved samples, options or geometry', () => {
  const model = play('guess');
  observe(model, [1.7]);
  const snap = model.snapshot();
  snap.round.samples[0].shape.points[0][0] = -999;
  snap.sections[0].shape.points[0][0] = -999;
  snap.round.options[0].label = 'changed';
  const fresh = model.snapshot();
  assert.notEqual(fresh.round.samples[0].shape.points[0][0], -999);
  assert.notEqual(fresh.sections[0].shape.points[0][0], -999);
  assert.equal(fresh.round.options[0].label, '球');
});

test('escape: walls block walking at low s and vanish above their height', () => {
  const model = play('escape');
  walk(model, 1, 0, 2);
  assert.ok(model.player.x <= 12.2 + 1e-6, 'stopped by the east wall');
  slide(model, 4);
  walk(model, 1, 0, .4);
  assert.ok(model.player.x > 13.4, 'walked out over the wall');
});

test('escape: descending onto a wall stops flush above it and reports the blocker once', () => {
  const model = play('escape');
  walk(model, 1, 0, 2);
  slide(model, 4);
  walk(model, 1, 0, .1);
  model.drainEvents();
  assert.equal(model.setSlice(1), false);
  assert.ok(model.s > 3.5 && model.s < 3.52, `stopped flush at ${model.s}`);
  const events = model.drainEvents();
  assert.deepEqual(events.filter(event => event.type === 'blocked').map(event => event.solid), ['wall-e']);
  model.setSlice(1);
  assert.equal(model.counters.blockedCount, 1, 'held input does not spam blocked');
});

test('escape: the intended route earns all three stars', () => {
  const model = play('escape');
  slide(model, 4);
  walk(model, 1, 0, .8);
  assert.ok(model.player.x > 13.4 && model.player.x < 14.2, `between wall and pillar at ${model.player.x}`);
  slide(model, 1);
  walk(model, 1, 0, 1);
  assert.equal(model.phase, 'complete');
  assert.deepEqual(model.stars, [true, true, true]);
  assert.equal(model.counters.sliceMoves, 2);
});

test('escape: the pillar blocks the high route and small adjustments are not counted as moves', () => {
  const model = play('escape');
  slide(model, 4);
  walk(model, 1, 0, 2);
  assert.ok(model.player.x <= 14.2 + 1e-6, 'pillar stops walking at high s');
  for (let i = 0; i < 5; i++) slide(model, model.s + .1);
  assert.equal(model.counters.sliceMoves, 1);
});

test('hints appear after idle time and reset on action', () => {
  const model = play('visitor');
  wait(model, 5);
  assert.equal(model.hint, null);
  model.setSlice(.3);
  wait(model, 5);
  assert.equal(model.hint, null, 'acting resets idle');
  wait(model, 1.2);
  assert.match(model.hint, /S/);
  assert.equal(model.counters.hintsShown, 1);
});

test('keyboard slice velocity moves continuously and ends the gesture on release', () => {
  const model = play('escape');
  model.setSliceVelocity(1);
  wait(model, 1);
  assert.ok(Math.abs(model.s - 2.2) < .02, `s=${model.s}`);
  model.setSliceVelocity(0);
  assert.equal(model.counters.sliceMoves, 1);
});

test('snapshots are plain data and next() advances levels', () => {
  const model = play('visitor');
  const snapshot = model.snapshot();
  assert.doesNotThrow(() => JSON.stringify(snapshot));
  assert.equal(snapshot.profiles.length, 1);
  assert.equal(snapshot.goals[0].center.length, 2);
  assert.equal(model.next(), true);
  assert.equal(model.snapshot().levelId, FLATLAND_LEVELS[1].id);
  assert.equal(model.load(99), false);
});
