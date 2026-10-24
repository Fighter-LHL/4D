import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import * as geometry from '../geometry.mjs';
import * as game from '../game.mjs';
import * as levels from '../levels.mjs';
import * as controls from '../controls.mjs';
import * as study from '../study.mjs';
import * as progress from '../station-progress.mjs';
import * as effects from '../station-effects.mjs';
import * as layers from '../layers.mjs';

// Execute the WHOLE app with its real model/controller. Only DOM, rendering,
// clocks and audio are adapters. This is not installed in the browser game.
export async function appHarness(search = '?study=w1&wcontrol=b&level=station-routes') {
  let now = 1000, seq = 0, focus = null;
  const frames = new Map(), timers = new Map(), nodes = new Map(), sounds = [], writes = [], reads = [];
  class Node {
    hidden = false; children = []; dataset = {}; style = {}; textContent = ''; attributes = {};
    handlers = new Map(); captures = new Set(); classes = new Set();
    constructor(id = '') {
      this.id = id;
      this.classList = { add: (...names) => names.forEach((n) => this.classes.add(n)), remove: (...names) => names.forEach((n) => this.classes.delete(n)),
        contains: (n) => this.classes.has(n), toggle: (n, force) => { const value = force ?? !this.classes.has(n); value ? this.classes.add(n) : this.classes.delete(n); return value; } };
    }
    addEventListener(type, fn) { if (!this.handlers.has(type)) this.handlers.set(type, []); this.handlers.get(type).push(fn); }
    emit(type, props = {}) { const e = { type, target: this, key: '', pointerId: 1, isPrimary: true, preventDefault() {}, stopPropagation() {}, ...props }; for (const fn of this.handlers.get(type) ?? []) fn(e); }
    setAttribute(k, v) { this.attributes[k] = String(v); } getAttribute(k) { return this.attributes[k] ?? null; }
    replaceChildren(...c) { this.children = c; } append(...c) { this.children.push(...c); } before() {}
    get firstChild() { return this.children[0]; }
    querySelector(selector) { return node(this.id + ':' + selector); }
    closest(selector) { return selector === '#w-rail' && this.id === 'w-rail' ? this : null; }
    focus() { focus = this; } click() { this.emit('click'); } scrollIntoView() {}
    getBoundingClientRect() { return { top: 0, height: 400, width: 400 }; }
    setPointerCapture(id) { this.captures.add(id); } hasPointerCapture(id) { return this.captures.has(id); }
    releasePointerCapture(id) { this.captures.delete(id); this.emit('lostpointercapture', { pointerId: id }); }
  }
  const node = (id) => { if (!nodes.has(id)) nodes.set(id, new Node(id)); return nodes.get(id); };
  const wButtons = [-1, 1].map((dir) => { const n = node('w:' + dir); n.dataset.wdir = String(dir); return n; });
  const ground = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].map((dir) => { const n = node(dir); n.dataset.dir = dir; return n; });
  node('w-rail').parentElement = node('railHome');
  const document = new Node('document');
  document.body = node('body');
  document.getElementById = node;
  document.createElement = () => new Node();
  document.querySelector = node;
  document.querySelectorAll = (s) => s === '[data-wdir]' ? wButtons : s === '#dpad button' ? ground : [];
  const window = new Node('window');
  window.matchMedia = () => ({ matches: false, addEventListener() {} });
  class Renderer {
    constructor(canvas) { this.canvas = canvas; this.orbit = { yaw: .66 }; }
    render(frame) { this.frame = frame; } draw() {} project() { return null; } fitTo() {} resetView() {}
  }
  const context = vm.createContext({ ...geometry, ...game, ...levels, ...controls, ...study, ...progress, ...effects, ...layers,
    readStudyBuild: async () => ({ buildCommit: 'test-implementation', status: 'test' }),
    document, window, location: { search }, navigator: { userAgent: 'test' }, innerWidth: 1280, innerHeight: 720,
    URLSearchParams, URL, Blob, crypto: { randomUUID: () => 'integration' }, console,
    performance: { now: () => now },
    fetch: async () => ({ json: async () => ({ buildCommit: 'test-implementation' }) }),
    localStorage: { getItem: (k) => { reads.push(k); return null; }, setItem: (k, v) => writes.push([k, v]) },
    requestAnimationFrame(fn) { frames.set(++seq, fn); return seq; }, cancelAnimationFrame(id) { frames.delete(id); },
    setTimeout(fn, ms) { timers.set(++seq, { fn, until: now + ms }); return seq; }, clearTimeout(id) { timers.delete(id); },
    SliceRenderer: Renderer, MapRenderer: Renderer, FlatRenderer: Renderer,
    sfxInit() {}, sfxSetMuted() {}, sfx: Object.fromEntries(['win', 'appear', 'vanish', 'layer', 'blocked', 'refused'].map((s) => [s, () => sounds.push([s, now])])),
  });
  const source = readFileSync(new URL('../app.mjs', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '');
  const app = await vm.runInContext(`(async () => { ${source}\nreturn {
    startLevel, showTitle, handleInteract, advanceStudy, showCard, hideCard, cancelInputs, requestDial, beginW, releaseW,
    get run() { return run; }, get level() { return level; }, get current() { return current; }, get target() { return target; },
    get controller() { return wControl; }, get session() { return session; }, get pressed() { return pressed; },
    get wHold() { return wHold; }, get gestureStart() { return gestureStart; }, get nudge() { return nudge; },
    get flash() { return flash; }, get segment() { return studySegment; },
    setDial(dial) { run.setDial(dial); current = target = run.dial; },
  }; })()`, context);
  function advance(ms) {
    for (let t = 0; t < ms; t += 1000 / 60) {
      now += 1000 / 60;
      const callbacks = [...frames.values()]; frames.clear();
      callbacks.forEach((fn) => fn(now));
      for (const [id, timer] of timers) if (now >= timer.until) { timers.delete(id); timer.fn(); }
    }
  }
  const key = (type, key, props = {}) => window.emit(type, { key, target: focus ?? node('scene'), ...props });
  return { app, node, window, document, advance, key, sounds, reads, writes, frames };
}
