import { POLYTOPES, projectPolytope4D } from './hyper-prism.js';

const TAU = Math.PI * 2;
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

export function initThemeToggle(arg = {}, legacyOnChange) {
  // Accepts either an options object or (buttonElement, onChange).
  const opts = (typeof Element !== 'undefined' && arg instanceof Element) ? { button: arg, onChange: legacyOnChange } : (arg || {});
  const { buttonId = 'theme-toggle', storageKey = 'wslice-theme', onChange } = opts;
  const getBtn = () => opts.button || document.getElementById(buttonId);
  const read = () => {
    try { return localStorage.getItem(storageKey) || 'astral'; } catch { return 'astral'; }
  };
  const save = value => {
    try { localStorage.setItem(storageKey, value); } catch { /* ignore */ }
  };
  let theme = read();
  const apply = next => {
    theme = next === 'paper' ? 'paper' : 'astral';
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = theme;
      document.body?.setAttribute('data-theme', theme);
      const btn = getBtn();
      if (btn) {
        const isAstral = theme === 'astral';
        btn.setAttribute('aria-pressed', String(isAstral));
        const label = btn.querySelector('.theme-label');
        if (label) label.textContent = isAstral ? '星界棱镜' : '晨雾宣纸';
      }
    }
    onChange?.(theme);
  };
  apply(theme);
  if (typeof document !== 'undefined') {
    const btn = getBtn();
    btn?.addEventListener('click', () => {
      const next = theme === 'astral' ? 'paper' : 'astral';
      save(next);
      apply(next);
    });
  }
  return { getTheme: () => theme, setTheme: apply };
}

export function initHyperLab({
  openButtonId = 'open-hyper-lab',
  dialogId = 'hyper-lab-dialog',
  openButton = null,
  dialog: dialogEl = null,
  canvas: canvasEl = null,
  wSlider = null,
  wValue = null,
  polytopeButtons = null,
  autoSpinButton = null,
  syncButton = null,
  closeButtons = null,
  getW = () => .5,
  setW = () => {},
  onOpen = () => {},
  onClose = () => {},
} = {}) {
  if (typeof document === 'undefined') return null;
  const openBtn = openButton || document.getElementById(openButtonId);
  const dialog = dialogEl || document.getElementById(dialogId);
  if (!openBtn || !dialog) return null;

  const canvas = canvasEl || dialog.querySelector('#hyper-lab-canvas');
  const slider = wSlider || dialog.querySelector('#hyper-lab-w');
  const readout = wValue || dialog.querySelector('#hyper-lab-w-value');
  const titleEl = dialog.querySelector('#hyper-lab-title');
  const subEl = dialog.querySelector('#hyper-lab-sub');
  const descEl = dialog.querySelector('#hyper-lab-desc');
  const statsEl = dialog.querySelector('#hyper-lab-stats');
  const syncBtn = syncButton || dialog.querySelector('#hyper-lab-sync');
  const closeBtns = closeButtons ? [...closeButtons] : [...dialog.querySelectorAll('[data-close-hyper-lab], #hyper-lab-close')];
  const spinBtn = autoSpinButton || dialog.querySelector('#hyper-lab-spin');
  const polyButtons = polytopeButtons ? [...polytopeButtons] : [...dialog.querySelectorAll('[data-polytope]')];

  let activePoly = 'tesseract';
  let w = clamp(getW(), 0, 1);
  let autoSpin = true;
  let time = 0;
  let tiltX = .25;
  let tiltY = -.18;
  let dragging = false;
  let lastPointer = { x: 0, y: 0 };
  let rafId = 0;
  let lastTick = performance.now();

  function selectPolytope(id) {
    if (!POLYTOPES[id]) return;
    activePoly = id;
    const info = POLYTOPES[id];
    if (titleEl) titleEl.textContent = info.name;
    if (subEl) subEl.textContent = info.subtitle;
    if (descEl) descEl.textContent = info.description;
    for (const btn of polyButtons) {
      btn.setAttribute('aria-pressed', String(btn.dataset.polytope === id));
    }
  }

  function updateW(nextW) {
    w = clamp(Number(nextW), 0, 1);
    if (slider) slider.value = String(w);
    if (readout) readout.textContent = w.toFixed(3);
  }

  function draw() {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(280, rect.width || 560);
    const height = Math.max(200, rect.height || 300);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Deep astral backdrop
    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, '#0d1922');
    bg.addColorStop(1, '#152730');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    const radius = Math.min(width * .28, height * .42);
    const leftCx = width * .34;
    const rightCx = width * .74;
    const cy = height * .52;

    const proj = projectPolytope4D(activePoly, { w, time, tiltX, tiltY, radius });
    const layerColor = w < .34 ? '#4fd2e8' : w < .66 ? '#b896ff' : '#ffcf70';

    // Subtle grid rings on left (4D hyper-projection) and right (3D cross-section)
    ctx.save();
    ctx.strokeStyle = 'rgba(130, 195, 200, 0.14)';
    ctx.lineWidth = 1;
    for (const r of [radius * .45, radius * .82, radius * 1.12]) {
      ctx.beginPath(); ctx.ellipse(leftCx, cy, r, r, 0, 0, TAU); ctx.stroke();
    }
    ctx.beginPath(); ctx.ellipse(rightCx, cy, radius * .82, radius * .82, 0, 0, TAU); ctx.stroke();
    ctx.restore();

    // Draw 4D wireframe on the left
    ctx.save();
    ctx.translate(leftCx, cy);
    for (const [aIdx, bIdx] of proj.edges) {
      const a = proj.vertices[aIdx], b = proj.vertices[bIdx];
      const near = Math.max(a.proximity, b.proximity);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = near > .65 ? layerColor : 'rgba(148, 210, 218, 0.32)';
      ctx.lineWidth = near > .65 ? 2 : 1.1;
      ctx.stroke();
    }
    // Draw slice hull superimposed on 4D wireframe
    if (proj.sliceHull.length >= 3) {
      ctx.beginPath();
      proj.sliceHull.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
      ctx.closePath();
      ctx.fillStyle = layerColor + '33';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.2;
      ctx.stroke();
    }
    for (const v of proj.vertices) {
      const r = 2.4 + v.proximity * 2.8;
      ctx.beginPath();
      ctx.ellipse(v.x, v.y, r, r, 0, 0, TAU);
      ctx.fillStyle = v.proximity > .6 ? '#ffffff' : layerColor;
      ctx.fill();
    }
    ctx.restore();

    // Draw isolated 3D/2D Cross-Section on the right
    ctx.save();
    ctx.translate(rightCx, cy);
    if (proj.sliceHull.length >= 3) {
      ctx.beginPath();
      proj.sliceHull.forEach((p, i) => i ? ctx.lineTo(p.x * 1.12, p.y * 1.12) : ctx.moveTo(p.x * 1.12, p.y * 1.12));
      ctx.closePath();
      ctx.fillStyle = layerColor + '44';
      ctx.fill();
      ctx.strokeStyle = layerColor;
      ctx.lineWidth = 2.6;
      ctx.stroke();

      // Internal triangulation lines from centroid for 3D facet feel
      const cx = proj.sliceHull.reduce((s, p) => s + p.x, 0) / proj.sliceHull.length * 1.12;
      const cyHull = proj.sliceHull.reduce((s, p) => s + p.y, 0) / proj.sliceHull.length * 1.12;
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 1;
      for (const p of proj.sliceHull) {
        ctx.beginPath();
        ctx.moveTo(cx, cyHull);
        ctx.lineTo(p.x * 1.12, p.y * 1.12);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(p.x * 1.12, p.y * 1.12, 3.5, 3.5, 0, 0, TAU);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      }
    } else {
      ctx.fillStyle = 'rgba(200, 225, 220, 0.55)';
      ctx.font = '500 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('W 处于顶点外侧 · 截面退化为空集', 0, 0);
    }
    ctx.restore();

    // Labels
    ctx.fillStyle = 'rgba(220, 240, 236, 0.85)';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('4D 全息投影 (拖拽旋转四维视角)', leftCx, 22);
    ctx.fillText(`W = ${w.toFixed(2)} 实时三维截面`, rightCx, 22);

    if (statsEl) {
      statsEl.textContent = `当前切出 ${proj.intersections.length} 处棱截面交点 · ${proj.sliceHull.length >= 3 ? `${proj.sliceHull.length} 边形截面体` : '临界退化截面'}`;
    }
  }

  function loop(now) {
    if (!dialog.open) return;
    const dt = Math.min(.05, Math.max(0, (now - lastTick) / 1000));
    lastTick = now;
    if (autoSpin && !dragging) time += dt;
    draw();
    rafId = requestAnimationFrame(loop);
  }

  openBtn.addEventListener('click', () => {
    if (dialog.open) return;
    onOpen();
    updateW(getW());
    selectPolytope(activePoly);
    dialog.showModal();
    lastTick = performance.now();
    rafId = requestAnimationFrame(loop);
  });

  function close() {
    if (!dialog.open) return;
    cancelAnimationFrame(rafId);
    dialog.close();
    onClose();
  }

  for (const b of closeBtns) b.addEventListener('click', close);
  dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });

  syncBtn?.addEventListener('click', () => {
    setW(w);
    close();
  });

  spinBtn?.addEventListener('click', () => {
    autoSpin = !autoSpin;
    spinBtn.setAttribute('aria-pressed', String(autoSpin));
    spinBtn.textContent = autoSpin ? '自动四维旋转：开' : '自动四维旋转：关';
  });

  slider?.addEventListener('input', e => updateW(e.target.value));
  for (const btn of polyButtons) {
    btn.addEventListener('click', () => selectPolytope(btn.dataset.polytope));
  }

  canvas?.addEventListener('pointerdown', e => {
    dragging = true;
    lastPointer = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture?.(e.pointerId);
  });
  canvas?.addEventListener('pointermove', e => {
    if (!dragging) return;
    const dx = e.clientX - lastPointer.x;
    const dy = e.clientY - lastPointer.y;
    lastPointer = { x: e.clientX, y: e.clientY };
    tiltX += dx * .012;
    tiltY += dy * .012;
  });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    canvas?.addEventListener(ev, () => { dragging = false; });
  }
  canvas?.addEventListener('wheel', e => {
    e.preventDefault();
    updateW(w - Math.sign(e.deltaY) * .025);
  }, { passive: false });

  return { open: () => openBtn.click(), close, updateW };
}
