import test from 'node:test';
import assert from 'node:assert/strict';
import { FlatlandRenderer } from '../src/flatland/scene.js';
import { FlatlandModel } from '../src/flatland/model.js';
import { FLATLAND_LEVELS } from '../src/flatland/levels.js';
import { projectFloor } from '../src/flatland/ascend.js';
import { drawCompanions } from '../src/flatland/friends-scene.js';
import { DT, levelIndex, play, goto, playVisitor, solveLocks, solveMirror, runEscape } from './flatland-helpers.js';

function renderer(width = 1000, height = 560) {
  const calls = [];
  const finite = value => {
    if (typeof value === 'number') assert.ok(Number.isFinite(value), `non-finite canvas value: ${value}`);
    if (Array.isArray(value)) value.forEach(finite);
  };
  class Gradient { constructor() { this.stops = []; } addColorStop(...stop) { this.stops.push(stop); } }
  const special = { createRadialGradient: () => new Gradient(), measureText: text => ({ width: String(text).length * 8 }) };
  const context = new Proxy({}, {
    get(target, key) {
      if (key in target) return target[key];
      return (...args) => { args.forEach(finite); calls.push({ method: key, args, stroke: target.strokeStyle, fill: target.fillStyle, alpha: target.globalAlpha, lineWidth: target.lineWidth }); return special[key]?.(...args); };
    },
    set(target, key, value) { finite(value); target[key] = value; return true; },
  });
  globalThis.window = { devicePixelRatio: 2, matchMedia: () => ({ matches: false, addEventListener() {} }) };
  const canvas = { width: 0, height: 0, getContext: () => context, getBoundingClientRect: () => ({ width, height, left: 0, top: 0 }) };
  return { scene: new FlatlandRenderer(canvas), calls, canvas };
}
const SIZES = [[1000, 560], [380, 600]];
const texts = calls => calls.filter(c => c.method === 'fillText').map(c => String(c.args[0]));

test('fresh discoveries leave a bounded wordless tail, freeze on pause and clear on interruption', () => {
  for (const width of [1000, 380, 280]) for (const reduced of [false, true]) {
    const { scene, calls } = renderer(width, 400); scene.reducedMotion = reduced;
    const m = new FlatlandModel(0, { seed: 42, playStyle: 'explore' }); m.start();
    const before = m.snapshot(); scene.setState(before); scene.render(0);
    assert.deepEqual(scene.discoveryEchoes, []);
    for (const event of [
      { type: 'garden_seed', fresh: true, petals: 1, x: 6.5, y: 9 },
      { type: 'friend_found', fresh: true, id: 'sprout', x: 6.5, y: 9 },
    ]) {
      scene.pushEvents([event]); scene.render(.3);
      assert.equal(scene.discoveryEchoes.length, 1);
      const draw = () => { calls.length = 0; scene.drawDiscoveryEchoes(scene.view.main.scale); return structuredClone(calls); };
      const first = draw();
      assert.equal(texts(first).length, 0, 'no new text');
      const oval = first.find(c => c.method === 'ellipse');
      const k = scene.view.main.scale;
      assert.equal(oval.args[3], Math.min(.35, 8 / k), 'readable shallow puddle');
      assert.equal(first.find(c => c.method === 'stroke').lineWidth * k, width <= 480 ? 4 : 3);
      assert.equal(first.find(c => c.method === 'stroke').stroke, '#D4A04A');
      assert.equal(first.find(c => c.method === 'fill').alpha, .32);
      assert.equal(first.filter(c => c.method === 'fill' && c.fill === '#F0C56A').length, 4);
      scene.setState({ ...before, paused: true }); scene.render(3);
      assert.equal(scene.discoveryEchoes[0].age, .3);
      scene.setState(before); scene.render(.1);
      if (reduced) assert.deepEqual(draw(), first, 'reduced motion has no moving geometry');
      scene.render(width <= 480 ? 1 : 1.45);
      assert.equal(scene.popups.filter(p => p.discovery).length, 0);
      assert.equal(scene.discoveryEchoes.length, 1, 'wordless satisfaction continues after short text');
      scene.discoveryEchoes[0].age = 1.5;
      const held = draw();
      assert.equal(held.find(c => c.method === 'fill').alpha, .32, 'still readable at 1.5 seconds');
      if (reduced) assert.deepEqual(held, first, 'hold changes no geometry');
      scene.render(1.6); assert.equal(scene.discoveryEchoes.length, 0);
      scene.pushEvents([{ ...event, fresh: false }]); assert.equal(scene.discoveryEchoes.length, 0);
      for (const type of ['load', 'hurt', 'death', 'guard_alert', 'dimension_start']) {
        scene.pushEvents([event, { type, x: 6.5, y: 9 }]); assert.equal(scene.discoveryEchoes.length, 0);
      }
      scene.pushEvents([event]); scene.setState({ ...before, s: before.s + .6 }); scene.render(0);
      assert.equal(scene.discoveryEchoes.length, 0, 'no stale glow on another slice');
      scene.setState(before);
    }
    assert.deepEqual(m.snapshot(), before);
  }
});

test('discovery popups fit phones, pause, expire, stay still with reduced motion and suppress repeated finds', () => {
  for (const width of [1000, 380, 280]) for (const reduced of [false, true]) {
    const { scene, calls } = renderer(width, 400); scene.reducedMotion = reduced;
    const m = new FlatlandModel(0, { seed: 42, playStyle: 'explore' }); m.start();
    const before = m.snapshot(); scene.setState(before);
    const event = { type: 'garden_seed', id: 'friend-probe-0', fresh: true, petals: 1, x: .1, y: .1 };
    scene.pushEvents([event]); scene.render(.1);
    const drawn = () => calls.findLast(c => c.method === 'fillText' && c.args[0] === '收下花种 · 1/3');
    const first = drawn(); assert.ok(first); assert.ok(first.args[1] > event.x, 'edge text is clamped inward');
    assert.ok(first.args[3] * scene.view.main.scale <= scene.view.main.w);
    scene.setState({ ...before, paused: true }); scene.render(3); assert.equal(scene.popups[0].age, .1);
    scene.setState(before); scene.render(.2);
    if (reduced) assert.deepEqual(drawn().args, first.args, 'no drift or scale change');
    scene.render(1.15);
    assert.equal(scene.popups.length, width <= 480 ? 0 : 1, 'phone discovery clears earlier than desktop');
    scene.render(2); assert.equal(scene.popups.length, 0);
    scene.pushEvents([{ ...event, fresh: false }, { type: 'friend_found', id: 'sprout', fresh: false }]);
    assert.equal(scene.popups.length, 0);
    scene.pushEvents([{ type: 'friend_found', id: 'sprout', x: 4, y: 3, fresh: true }]);
    assert.equal(scene.popups[0].text, '跳跳跟上来了');
    scene.pushEvents([{ type: 'load' }]); assert.equal(scene.popups.length, 0);
    assert.deepEqual(m.snapshot(), before, 'rendering has no game authority');
  }
});

test('approach highlight clears when leaving the real clue layer or loading another scene', () => {
  for (const width of [1000, 380, 280]) {
    const { scene } = renderer(width);
    const m = new FlatlandModel(0, { seed: 42, playStyle: 'explore' }); m.start();
    m.setSlice(2.1); goto(m, 6.5, 9); scene.setState(m.snapshot());
    const cue = { type: 'discovery_near', key: 'visitor:pads', x: 6.5, y: 9, text: '这两片花垫是一对', color: '#78658f' };
    scene.pushEvents([cue]); scene.render(.1); assert.equal(scene.popups.length, 1);
    m.setPaused(true); scene.setState(m.snapshot()); scene.render(3);
    assert.equal(scene.popups.length, 1); assert.equal(scene.popups[0].age, .1);
    m.setPaused(false);
    m.setSlice(.6); scene.setState(m.snapshot()); scene.render(.1); assert.equal(scene.popups.length, 0);
    m.setSlice(2.1); scene.setState(m.snapshot()); scene.pushEvents([cue, { type: 'load' }]); scene.render(0);
    assert.equal(scene.popups.length, 0);
    scene.pushEvents([cue]); scene.render(1.4);
    assert.equal(scene.popups.length, width <= 480 ? 0 : 1, 'phone approach clears earlier than desktop');
  }
});

test('phone seed and friend discovery text stays below nearby object labels throughout its lifetime', () => {
  for (const width of [380, 280]) for (const reduced of [false, true]) {
    const { scene, calls } = renderer(width, 400); scene.reducedMotion = reduced;
    const m = new FlatlandModel(0, { seed: 42, playStyle: 'explore' }); m.start();
    m.setSlice(2.1); goto(m, 6.5, 9); scene.setState(m.snapshot());
    for (const event of [
      { type: 'garden_seed', fresh: true, petals: 1, x: 6.5, y: 9 },
      { type: 'friend_found', fresh: true, id: 'sprout', x: 6.5, y: 9 },
    ]) {
      scene.pushEvents([event]);
      let firstY;
      for (const dt of [.016, .3, .7]) {
        scene.render(dt);
        const popup = calls.findLast(c => c.method === 'fillText' && /收下花种|跟上来了/.test(c.args[0]));
        const padLabel = calls.findLast(c => c.method === 'fillText' && c.args[0] === '懂倒影的朋友');
        assert.ok(popup && padLabel);
        const k = scene.view.main.scale;
        assert.ok((popup.args[2] - padLabel.args[2]) * k >= 24, 'label baselines have room for separate lines');
        assert.ok((popup.args[2] - event.y) * k >= 23.9, 'discovery appears below its object');
        if (firstY !== undefined) assert.equal(popup.args[2], firstY, 'no upward drift into existing labels');
        firstY = popup.args[2];
      }
      scene.render(1); assert.equal(scene.popups.length, 0);
    }
  }
});
// Steps the model while drawing every frame, so bots exercise every effect path.
function drawing(m, scene) {
  const update = m.update.bind(m);
  m.update = dt => { update(dt); scene.setState(m.snapshot()); scene.pushEvents(m.drainEvents()); scene.render(dt); };
  return m;
}

test('every level renders finite geometry across the slice range, wide and narrow', () => {
  for (const [width, height] of SIZES) {
    const { scene, canvas } = renderer(width, height);
    FLATLAND_LEVELS.forEach((_, index) => {
      const model = new FlatlandModel(index, { seed: index + 1 }); model.start();
      for (let s = 0; s <= 6; s += .25) {
        model.setSlice(s); model.update(.05);
        scene.setState(model.snapshot()); scene.pushEvents(model.drainEvents()); scene.render(1 / 60);
      }
    });
    assert.equal(canvas.width, width * 2);
  }
});

test('full bot runs draw score popups, particles and the HUD for every story level', () => {
  for (const [width, height] of SIZES) for (const reduced of [false, true]) {
    const { scene, calls } = renderer(width, height); scene.reducedMotion = reduced;
    for (const [id, solve] of [['visitor', playVisitor], ['guess', solveLocks], ['escape', runEscape], ['mirror', solveMirror]]) {
      const m = drawing(play(id, 4), scene);
      solve(m);
      assert.equal(m.phase, 'complete', id);
      for (let i = 0; i < 30; i++) m.update(DT);
      scene.render(.05);
    }
    const drawn = texts(calls);
    assert.ok(drawn.some(t => /^\+\d+/.test(t)), 'score popups');
    assert.ok(drawn.some(t => t.includes('×')), 'combo multiplier');
    assert.ok(drawn.some(t => t.startsWith('S ')), 'slice readout');
    assert.ok(calls.some(c => c.method === 'ellipse'));
  }
});

test('hazards, warnings and deaths draw in the danger colour with a screen flash', () => {
  const { scene, calls } = renderer();
  const m = drawing(play('escape', 2), scene);
  goto(m, 10, 6); m.setSlice(4); goto(m, 13.8, 6); m.setSlice(2.6); goto(m, 15.8, 6, 3);
  for (let i = 0; i < 300 && !m.dying; i++) m.update(DT);
  assert.ok(m.deaths >= 1);
  assert.ok(calls.some(c => c.method === 'stroke' && c.stroke === '#c4553b'));
  assert.ok(calls.some(c => c.method === 'createRadialGradient'), 'hurt vignette');
  assert.ok(scene.particles.length > 0);
});

test('storm draws hearts, waves and hazard profiles in the side view', () => {
  const { scene, calls } = renderer();
  const m = drawing(play('storm', 6), scene);
  m.safeUntil = Infinity;
  for (let i = 0; i < 60 * 15; i++) m.update(DT);
  assert.ok(texts(calls).some(t => t.startsWith('第 ')));
  assert.ok(calls.some(c => c.method === 'fill' && c.fill === '#f1c2b4'));
});

test('pause freezes particles, popups and the current shake offset', () => {
  const { scene, calls } = renderer();
  const m = play('storm'); scene.setState(m.snapshot());
  scene.pushEvents([{ type: 'hurt', x: 10, y: 6 }, { type: 'graze', x: 10, y: 6, points: 75 }]);
  scene.render(.05); m.setPaused(true); scene.setState(m.snapshot());
  calls.length = 0; scene.render(.1); const first = JSON.stringify(calls);
  calls.length = 0; scene.render(.1);
  assert.equal(JSON.stringify(calls), first);
  assert.ok(texts(calls).includes('险过 +75'));
});

test('exploration draws encounters, companion parties and toy faces with finite geometry', () => {
  const collection = { found: ['sprout', 'lantern', 'ribbon'], companion: 'all' };
  for (const [width, height] of SIZES) for (const reduced of [false, true]) {
    const { scene, calls } = renderer(width, height); scene.reducedMotion = reduced;
    for (const id of ['visitor', 'guess', 'escape', 'vault', 'mirror', 'ascend']) {
      const m = new FlatlandModel(levelIndex(id), { seed: 42, playStyle: 'explore', collection }); m.start();
      for (const s of [.6, 2.7, 3, 4.7, 5.4]) {
        m.setSlice(s); m.setPeek(true); m.petCompanion(); m.update(.1);
        scene.setState(m.snapshot()); scene.pushEvents(m.drainEvents()); scene.render(.1);
      }
    }
    assert.ok(!texts(calls).some(t => /^\+\d+/.test(t)), 'roaming does not advertise score');
    assert.ok(calls.some(c => c.method === 'bezierCurveTo'), 'ribbon companion is drawn');
  }
});

test('storm friends cheer at grazes and high combos, keep crowns, and freeze with pause or reduced motion', () => {
  const collection = { found: ['sprout', 'lantern', 'ribbon'], companion: 'all' };
  const gardens = Object.fromEntries(FLATLAND_LEVELS.filter(l => l.garden).map(l => [l.id, true]));
  for (const reduced of [false, true]) {
    const { scene, calls } = renderer(320, 400); scene.reducedMotion = reduced;
    const m = new FlatlandModel(levelIndex('storm'), { seed: 42, collection, gardenMemories: gardens }); m.start();
    const before = m.snapshot(); scene.setState(before); drawCompanions(scene);
    const restingY = calls.find(c => c.method === 'translate').args[1];
    assert.equal(calls.filter(c => c.method === 'fill' && c.fill === '#fff4d9').length, 45, 'three five-petal flowers on each friend');
    scene.pushEvents([{ type: 'score', combo: 2, points: 100, x: 10, y: 6 }]); assert.equal(scene.friendCheer, 0);
    for (const event of [{ type: 'graze', points: 75, x: 10, y: 6 }, { type: 'score', combo: 3, points: 200, x: 10, y: 6 }]) {
      scene.pushEvents([event]); assert.equal(scene.friendCheer, 1.1);
      calls.length = 0; drawCompanions(scene);
      const happyY = calls.find(c => c.method === 'translate').args[1];
      if (reduced) assert.equal(happyY, restingY); else assert.ok(happyY < restingY);
      assert.ok(calls.some(c => c.method === 'quadraticCurveTo'), 'happy eyes remain visible without hopping');
      scene.render(.2); const remaining = scene.friendCheer;
      scene.setState({ ...before, paused: true }); scene.render(.5); assert.equal(scene.friendCheer, remaining);
      scene.setState(before); scene.render(1.2); assert.equal(scene.friendCheer, 0);
    }
    scene.pushEvents([{ type: 'graze', points: 75, x: 10, y: 6 }, { type: 'hurt', x: 10, y: 6 }]);
    assert.equal(scene.friendCheer, 0, 'do not celebrate a lost life');
    scene.pushEvents([{ type: 'graze', points: 75, x: 10, y: 6 }, { type: 'load' }]); assert.equal(scene.friendCheer, 0);
    assert.deepEqual(m.snapshot(), before, 'presentation leaves the game authority untouched');
  }
});

test('a large visitor section cannot paint over the nearby flower-pad instruction on a phone', () => {
  const { scene, calls } = renderer(320, 400);
  const m = new FlatlandModel(levelIndex('visitor'), { seed: 42, playStyle: 'explore' }); m.start();
  m.setSlice(2.1); goto(m, 6.5, 9); scene.setState(m.snapshot()); scene.render(.016);
  const instruction = calls.findIndex(c => c.method === 'fillText' && c.args[0] === '懂倒影的朋友');
  const visitor = calls.findIndex(c => c.method === 'fill' && c.fill === '#cfe6ee');
  assert.ok(visitor >= 0 && instruction > visitor, 'instruction belongs to the foreground');
});

test('blocked events flash the blocking solid', () => {
  const { scene, calls } = renderer();
  const model = play('escape');
  model.setMove(1, 0); for (let i = 0; i < 5; i++) model.update(.1);
  model.setSlice(4); model.setMove(1, 0); model.update(.1); model.setMove(0, 0);
  for (let i = 0; i < 6; i++) model.update(.1);
  assert.equal(model.setSlice(1), false, 'standing over the east wall');
  scene.setState(model.snapshot()); scene.pushEvents(model.drainEvents()); scene.render(.05);
  assert.ok(calls.some(call => call.method === 'stroke' && call.stroke === '#c4553b'));
});

test('screenToWorld maps canvas pixels into the flat world', () => {
  const { scene } = renderer();
  scene.setState(new FlatlandModel(1, { seed: 1 }).snapshot()); scene.render(0);
  const { main } = scene.view;
  const point = scene.screenToWorld(main.ox + 5 * main.scale, main.oy + 3 * main.scale);
  assert.ok(Math.abs(point.x - 5) < 1e-9 && Math.abs(point.y - 3) < 1e-9);
  assert.equal(scene.screenToWorld(1, 1), null);
});

test('locks hide the side view behind a question mark until revealed', () => {
  const { scene, calls } = renderer();
  const m = play('guess', 3);
  scene.setState(m.snapshot()); scene.render(.05);
  assert.ok(texts(calls).includes('?'));
  calls.length = 0; m.reveal(); scene.setState(m.snapshot()); scene.render(.05);
  assert.ok(!texts(calls).includes('?'));
});

test('narrow 320px side view keeps readable height and non-overlapping height ticks', () => {
  for (const h of [220, 260, 400]) {
    const { scene, calls } = renderer(320, h);
    const m = new FlatlandModel(levelIndex('visitor'), { seed: 42, playStyle: 'explore' }); m.start();
    scene.setState(m.snapshot()); scene.render(.016);
    assert.ok(scene.view.side.h >= 88, `side view height ${scene.view.side.h} at 320x${h}`);
    const ticks = calls.filter(c => c.method === 'fillText' && /^[0-6]$/.test(c.args[0])).map(c => c.args[2]);
    assert.ok(ticks.length >= 4);
    for (let i = 1; i < ticks.length; i++) {
      assert.ok(Math.abs(ticks[i] - ticks[i - 1]) >= 10, `ticks separated at 320x${h}`);
    }
  }
});

test('ascend renders both dimensions and a reversible pointer projection', () => {
  for (const [width, height] of SIZES) for (const reduced of [false, true]) {
    const { scene, calls } = renderer(width, height); scene.reducedMotion = reduced;
    const m = drawing(new FlatlandModel(levelIndex('ascend'), { seed: 1 }), scene); m.start();
    const wait = seconds => { for (let t = 0; t < seconds - 1e-9; t += .05) m.update(.05); };
    m.setSlice(4); m.setMove(1, 0); wait(1.4); m.setMove(0, 0); m.setSlice(1); wait(.05);
    assert.equal(m.ascend.stage, 'transition'); assert.equal(scene.screenToWorld(100, 100), null);
    wait(4);
    assert.equal(m.ascend.stage, 'volume');
    assert.ok(texts(calls).includes('Z') && texts(calls).includes('W'));
    const { ox, oy, k } = scene.dimensionView;
    for (const [x, z] of [[1, 1], [10, 6], [17, 6], [19, 11]]) {
      const [u, v] = projectFloor(x, z); const point = scene.screenToWorld(ox + u * k, oy + v * k);
      assert.ok(Math.abs(point.x - x) < 1e-8 && Math.abs(point.y - z) < 1e-8);
    }
    m.setSlice(.82); m.setMove(1, 0); wait(1.4); m.setMove(0, 0); m.setSlice(.18); wait(.05);
    assert.equal(m.phase, 'complete');
    assert.ok(texts(calls).includes('✓'));
  }
});


test('phone bud feedback sits below its probe and a fresh discovery retires the old label', () => {
  for (const width of [380, 280]) for (const reduced of [false, true]) {
    const { scene, calls } = renderer(width, 400); scene.reducedMotion = reduced;
    const m = new FlatlandModel(0, { seed: 42, playStyle: 'explore', collection: { found: ['sprout'], companion: 'sprout' } }); m.start();
    m.setSlice(2.1); goto(m, 6.5, 9);
    const state = m.snapshot(); state.companions.probe = { x: 7, y: 8, z: 3.1, remaining: 2 };
    scene.setState(state);
    scene.popup(7, 8, '靠近', '#386f53', false, { near: { key: 'visitor:pads' } });
    scene.pushEvents([{ type: 'friend_garden', kind: 'probe', x: 7, y: 8 }]);
    assert.equal(scene.popups.some(p => p.near), false); scene.render(.1);
    const bud = calls.findLast(c => c.method === 'fillText' && c.args[0] === '花苞醒了');
    const probe = calls.findLast(c => c.method === 'fillText' && /^S .*s$/.test(c.args[0]));
    assert.ok(bud && probe);
    assert.ok(calls.indexOf(probe) > calls.findIndex(c => c.method === 'fill' && c.fill === '#cfe6ee'), 'probe label is above the visitor section');
    assert.ok((bud.args[2] - probe.args[2]) * scene.view.main.scale >= 43.9);
    assert.equal(texts(calls).includes('懂倒影的朋友'), false, 'pad instruction yields while the probe is active');
    assert.equal(scene.popups.find(p => p.garden).duration, .8);
    scene.pushEvents([{ type: 'garden_seed', fresh: true, petals: 1, x: 7, y: 8 }]);
    assert.equal(scene.popups.some(p => p.garden), false); assert.equal(scene.discoveryEchoes.length, 1);
    scene.render(2.7); assert.equal(scene.popups.length, 0); assert.equal(scene.discoveryEchoes.length, 0);
    state.companions.probe = null; calls.length = 0; scene.render(.1);
    assert.ok(texts(calls).includes('懂倒影的朋友'), 'nearby pad instruction returns after the probe');
  }
});


test('a temporarily collapsed canvas preserves a discovery tail and resumes with positive geometry', () => {
  const { scene, canvas, calls } = renderer(1000, 560);
  const m = new FlatlandModel(0, { seed: 42, playStyle: 'explore' }); m.start(); scene.setState(m.snapshot());
  scene.pushEvents([{ type: 'garden_seed', fresh: true, petals: 1, x: 7, y: 8 }]); scene.render(.1);
  const before = structuredClone(scene.discoveryEchoes), rect = canvas.getBoundingClientRect;
  for (const [width, height] of [[0, 0], [1, 560], [1000, 1]]) {
    canvas.getBoundingClientRect = () => ({ width, height }); calls.length = 0; scene.render(.1);
    assert.deepEqual(scene.discoveryEchoes, before); assert.equal(calls.length, 0);
  }
  canvas.getBoundingClientRect = rect; scene.render(.1);
  assert.ok(scene.view.main.scale > 0); assert.ok(scene.discoveryEchoes[0].age > before[0].age);
  assert.ok(calls.filter(c => c.method === 'ellipse').every(c => c.args[2] >= 0 && c.args[3] >= 0));
});

test('seed collection wins over garden labels in either event order and briefly hides the ring instruction', () => {
  for (const width of [1280, 390, 320]) for (const reverse of [false, true]) {
    const { scene, calls } = renderer(width, 400);
    const m = new FlatlandModel(0, { seed: 42, playStyle: 'explore' }); m.start();
    const state = m.snapshot();
    state.rings = { active: true, radius: 1, center: [4, 4], window: null, elapsed: 1, hold: 0 };
    scene.setState(state); scene.render(0);
    const seed = { type: 'garden_seed', fresh: true, petals: 1, x: 7, y: 8 };
    const garden = { type: 'friend_garden', kind: 'probe', x: 7, y: 8 };
    scene.pushEvents([garden]);
    scene.pushEvents(reverse ? [seed, garden] : [garden, seed]);
    assert.deepEqual(scene.popups.map(p => p.text), ['收下花种 · 1/3']);
    scene.render(.1); scene.pushEvents([garden]);
    assert.deepEqual(scene.popups.map(p => p.text), ['收下花种 · 1/3']);
    assert.ok(scene.particles.length, 'garden VFX survives label arbitration');
    calls.length = 0; scene.drawRing(scene.view.main.scale);
    assert.equal(texts(calls).includes('走到光环边'), false);
    scene.render(1); calls.length = 0; scene.drawRing(scene.view.main.scale);
    assert.ok(texts(calls).includes('走到光环边'), 'the existing instruction returns');
  }
});
