import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { StationEffects } from '../station-effects.mjs';
import { levelById, nextLevel } from '../levels.mjs';
import { stationNextAction, rememberStationRun, STATION_SEALS_KEY } from '../station-progress.mjs';

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
  const hintPanel = { hidden: false };
  const stationEffects = new StationEffects();
  stationEffects.observe({powered: false, latched: false}, 0);
  stationEffects.observe({powered: true, latched: true}, 100);
  const context = vm.createContext({ directionalW: false, measuring: () => false, record() {}, pulseUntil: 0, wContactThisFrame: false, groundContactThisFrame: false, gestureDistance: 0, gestureReversals: 0,
    patrol: null, document: { hidden: false }, stationEffects,
    requestAnimationFrame(callback) { pending.set(++scheduled, callback); return scheduled; },
    cancelAnimationFrame(id) { pending.delete(id); },
    clearTimeout() {}, $: (id) => id === 'hint-panel' ? hintPanel : node, hideCard() {}, renderChapters() {}, clearGroundInputs() {},
    render() { rendered += 1; },
  });
  vm.runInContext(`
    let level = {}, frameId = 0, previousTime = 123;
    let trail = [[0, 0, 0]], ripples = [{t0: 0}], flash = 1, railPointer = 1;
    let pressed = new Set(['w']), wHold = 1, heldWKey = 'e', gestureStart = 0;
    let reveal = {}, peekTimer = 1, mapPeeking = true, nudgeTimer = 2, nudge = {}, toastTimer = 3;
    let introCueTimer = 4, introCueUntil = 3000;
    ${['requestFrame', 'tick', 'leaveLevel', 'showTitle'].map(functionSource).join('\n')}
    requestFrame();
  `, context);
  assert.equal(pending.size, 1);
  const staleCallback = [...pending.values()][0];
  vm.runInContext('showTitle()', context);
  assert.equal(pending.size, 0, 'the outstanding callback is cancelled');
  assert.equal(stationEffects.isActive(101), false, 'mechanism responses are cleared on exit');
  assert.equal(vm.runInContext('trail.length + ripples.length + flash + previousTime', context), 0);
  assert.equal(vm.runInContext('introCueUntil', context), 0, 'the opening cue cannot leak onto the title');
  staleCallback(1000); // Also guard callbacks that were already dispatched.
  vm.runInContext('requestFrame()', context);
  assert.equal(pending.size, 0);
  assert.equal(hintPanel.hidden, true, 'the hint panel closes when leaving');
  assert.equal(scheduled, 1, 'no new animation frames on the title');
  assert.equal(rendered, 0);
  vm.runInContext('level = {}; requestFrame()', context);
  assert.equal(pending.size, 1, 'a newly entered level can animate again');
});

test('an idle mechanism interaction draws its transition and final pose, then stops RAF', () => {
  const pending = new Map();
  const poses = [];
  let now = 0, scheduled = 0;
  const relay = { powered: false, latched: false };
  const stationEffects = new StationEffects();
  const context = vm.createContext({ directionalW: false, measuring: () => false, record() {}, pulseUntil: 0, wContactThisFrame: false, groundContactThisFrame: false, gestureDistance: 0, gestureReversals: 0,
    patrol: null, document: { hidden: false }, performance: { now: () => now }, stationEffects,
    requestAnimationFrame(callback) { pending.set(++scheduled, callback); return scheduled; },
    buildFrame() {
      stationEffects.observe(relay, now);
      return { sections: [], w: 0, mechanismEffects: stationEffects.sample(now) };
    },
    visibleIds: () => new Set(), layerIndex: () => 0,
    isWalk: () => true, isFlat: () => false, mapVisible: () => false,
    slice: { render(frame) { poses.push(frame.mechanismEffects); } },
    stepToken() {}, updateWorldTags() {}, updateActionButton() {}, updateRail() {}, updateStats() {},
    $: () => ({}),
  });
  vm.runInContext(`
    let level = { kind: 'walk' }, run = { won: false }, frameId = 0, previousTime = 0;
    let prevVisible = new Set(), prevLayer = 0, sliceOk = true, mapOk = false;
    let reveal = null, wHold = 0, current = 0, target = 0, cardOpen = false;
    let reducedMotion = { matches: false }, flash = 0, trail = [], ripples = [];
    let pressed = new Set(), nudge = null, introCueUntil = 0;
    ${['requestFrame', 'render', 'tick'].map(functionSource).join('\n')}
    render();
  `, context);
  assert.equal(pending.size, 0, 'loading a settled scene stays idle');
  relay.powered = relay.latched = true;
  now = 100;
  vm.runInContext('render()', context); // Interaction handlers draw without an existing RAF.
  assert.equal(pending.size, 1);
  for (now = 150; now <= 1100 && pending.size; now += 50) {
    const [id, callback] = pending.entries().next().value;
    pending.delete(id);
    callback(now);
    assert.ok(pending.size <= 1, 'there is only one animation loop');
  }
  assert.ok(poses.some(({ power, latch }) => power.pose > 0 && power.pose < 1 && latch.pose > 0 && latch.pose < 1));
  assert.equal(poses.at(-1).power.pose, 1);
  assert.equal(poses.at(-1).latch.pose, 1);
  assert.equal(poses.at(-1).power.strength, 0, 'the final zero-glow frame was actually drawn');
  assert.equal(pending.size, 0, 'the scene returns to idle after the longest effect');
});

test('completed walking levels offer the right next step only beside the receiver', () => {
  const nodes = new Map();
  const get = (id) => {
    if (!nodes.has(id)) nodes.set(id, { hidden: false, disabled: false, textContent: '',
      attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } });
    return nodes.get(id);
  };
  const transitions = [];
  const context = vm.createContext({ directionalW: false, measuring: () => false, record() {}, pulseUntil: 0, wContactThisFrame: false, groundContactThisFrame: false, gestureDistance: 0, gestureReversals: 0, $: get, nextLevel, stationNextAction,
    startLevel: (id) => transitions.push(id), showTitle: () => transitions.push('title'),
    level: levelById('station-routes'), run: { won: true, pos: [3, 1.65] }, cardOpen: false,
    stationSeals: { stone: true, copper: false },
  });
  vm.runInContext(`
    const isWalk = () => level?.kind === 'walk';
    ${['updateActionButton', 'atReceiver', 'completionAction', 'handleInteract'].map(functionSource).join('\n')}
    updateActionButton();
  `, context);
  assert.equal(get('action-btn').hidden, false);
  assert.equal(get('action-btn').textContent, '再来一次');
  assert.equal(get('return-levels').hidden, false);
  assert.equal(get('replay-btn').hidden, true);
  vm.runInContext('handleInteract()', context);
  assert.deepEqual(transitions, ['station-routes']);
  context.run.pos = [1.7, 1.65];
  vm.runInContext('updateActionButton(); handleInteract()', context);
  assert.equal(get('action-btn').hidden, true);
  assert.equal(get('return-levels').hidden, true);
  assert.equal(transitions.length, 1, 'F away from the receiver cannot restart the room');
  context.run.pos = [3, 1.65];
  context.stationSeals = { stone: true, copper: true };
  vm.runInContext('updateActionButton(); handleInteract()', context);
  assert.equal(get('action-btn').textContent, '去扁平国');
  assert.equal(get('action-btn').attributes['aria-label'], '去扁平国');
  assert.equal(transitions.at(-1), '0-1');

  for (const [id, label, destination] of [['fetch', '下一关：旧中转站', 'station'], ['station', '下一关：中转站', 'station-routes'], ['2-1', '下一关', '2-2']]) {
    context.level = levelById(id);
    context.run.pos = [...context.level.field.goal];
    vm.runInContext('updateActionButton(); handleInteract()', context);
    assert.equal(get('action-btn').textContent, label, id);
    assert.equal(transitions.at(-1), destination, id);
    assert.equal(get('replay-btn').hidden, id === '2-1', id);
  }
  context.cardOpen = true;
  vm.runInContext('updateActionButton(); handleInteract()', context);
  assert.equal(get('action-btn').hidden, true);
  assert.equal(get('return-levels').hidden, true);
});

test('walking delivery stays in the scene and records seals; visits keep their completion card', () => {
  const nodes = new Map();
  const get = (id) => {
    if (!nodes.has(id)) nodes.set(id, { hidden: false, classList: { remove() {} } });
    return nodes.get(id);
  };
  const stored = new Map(), cards = [], objectives = [];
  const context = vm.createContext({ directionalW: false, measuring: () => false, record() {}, pulseUntil: 0, wContactThisFrame: false, groundContactThisFrame: false, gestureDistance: 0, gestureReversals: 0, $: get, nextLevel, rememberStationRun,
    level: levelById('station-routes'), run: { won: true, levelId: 'station-routes', routeSeals: () => ({ stone: true, copper: false }) },
    progress: new Set(), saveProgress() {}, sfx: { win() {} }, clearTimeout() {},
    toastTimer: 0, pressed: new Set(['w']), wHold: 1,
    stationSeals: { stone: false, copper: false },
    sealStorage: { setItem: (key, value) => stored.set(key, value) },
    sealMarkup: () => 'seals', updateActionButton() {}, toast() {},
    showCard: (card) => cards.push(card), setObjective: (text) => objectives.push(text),
    download() {}, showTitle() {}, showWhy() {}, startLevel() {},
  });
  vm.runInContext(`const isWalk = () => level?.kind === 'walk'; ${functionSource('win')} win();`, context);
  assert.equal(cards.length, 0, 'delivery does not open a fullscreen card');
  assert.match(objectives.at(-1), /留在这里走走/);
  assert.deepEqual(JSON.parse(stored.get(STATION_SEALS_KEY)), { stone: true, copper: false });
  assert.ok(context.progress.has('station-routes'));
  assert.equal(context.pressed.size, 0, 'delivery stops held movement before free wandering');
  context.level = levelById('0-1');
  context.run = { won: true, levelId: '0-1' };
  vm.runInContext('win()', context);
  assert.equal(cards.length, 1, 'observation levels keep the existing card flow');
  assert.equal(cards[0].title, context.level.done);
});

test('hints persist independently of toast messages; reopening never reveals another hint', () => {
  const nodes = new Map();
  const node = () => ({ hidden: false, textContent: '', attributes: {}, children: [],
    setAttribute(key, value) { this.attributes[key] = value; },
    replaceChildren(...children) { this.children = children; },
  });
  const get = (id) => { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); };
  get('hint-panel').hidden = true;
  const context = vm.createContext({ directionalW: false, measuring: () => false, record() {}, pulseUntil: 0, wContactThisFrame: false, groundContactThisFrame: false, gestureDistance: 0, gestureReversals: 0, $: get, document: { createElement: node } });
  vm.runInContext(`
    let level = { hints: ['观察线索', '进一步提示', '完整解法'] }, cardOpen = false;
    let hintLevel = 0, run = { hints: 0 };
    ${['updateHintButton', 'revealHint', 'showHint'].map(functionSource).join('\n')}
    showHint();
  `, context);
  assert.equal(get('hint-panel').hidden, false);
  assert.equal(get('hint-history').children[0].textContent, '观察线索');
  get('toast').textContent = '拿起晶核。';
  assert.equal(get('hint-history').children.length, 1, 'operation feedback cannot replace the hint');
  vm.runInContext('showHint(); showHint()', context);
  assert.equal(get('hint-panel').hidden, false);
  assert.equal(vm.runInContext('run.hints', context), 1, 'reopening is not a new reveal');
  vm.runInContext('revealHint()', context);
  assert.deepEqual(get('hint-history').children.map((item) => item.textContent), ['观察线索', '进一步提示']);
  assert.equal(get('hint-next').textContent, '直接告诉我');
  vm.runInContext('revealHint(); showHint(); showHint()', context);
  assert.equal(get('hint-history').children.length, 3);
  assert.equal(get('hint-next').hidden, true);
  assert.equal(vm.runInContext('run.hints', context), 3);
});

test('slice gate cards explicitly enter the station or the unscored hidden-map replay', () => {
  const cards = [], transitions = [];
  const node = { classList: { remove() {} } };
  const context = vm.createContext({ directionalW: false, measuring: () => false, record() {}, pulseUntil: 0, wContactThisFrame: false, groundContactThisFrame: false, gestureDistance: 0, gestureReversals: 0,
    $: () => node, level: levelById('gate'), run: { won: true },
    progress: new Set(), saveProgress() {}, sfx: { win() {} }, clearTimeout() {},
    toastTimer: 0, pressed: new Set(), wHold: 0,
    showCard: (card) => cards.push(card), setObjective() {}, updateActionButton() {},
    startLevel: (id) => transitions.push(id),
    nextLevel() { throw new Error('gate must not enter the prologue chain'); },
  });
  vm.runInContext(`const isWalk = () => true; ${functionSource('completionAction')} ${functionSource('win')} win();`, context);
  assert.equal(cards[0].title, '球门', 'the card reports the run, not the principle');
  assert.equal(cards[0].stats, undefined);
  assert.deepEqual(Array.from(cards[0].actions, ([label]) => label), ['下一关：中转站', '盲走一次']);
  cards[0].actions[0][2]();
  cards[0].actions[1][2]();
  assert.deepEqual(transitions, ['station-routes', 'gate-blind']);
  context.level = levelById('gate-blind');
  vm.runInContext('win()', context);
  assert.equal(cards[1].stats, undefined);
  assert.equal(cards[1].actions.length, 1);
  cards[1].actions[0][2]();
  assert.equal(transitions.at(-1), 'station-routes');
});
