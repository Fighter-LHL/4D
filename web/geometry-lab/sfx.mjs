// Tiny WebAudio cues. Everything degrades silently without an AudioContext.
let ctx = null;
let master = null;

export function sfxInit() {
  if (ctx) return;
  try {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.08;
    master.connect(ctx.destination);
  } catch { /* no audio device */ }
}

function blip(freq, dur = 0.18, type = 'sine', gain = 0.5) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  amp.gain.setValueAtTime(gain, ctx.currentTime);
  amp.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  osc.connect(amp);
  amp.connect(master);
  osc.start();
  osc.stop(ctx.currentTime + dur);
}

export const sfx = {
  appear: () => blip(660, 0.22),
  vanish: () => blip(300, 0.28),
  blocked: () => blip(150, 0.09, 'square', 0.28),
  refused: () => blip(220, 0.12, 'triangle', 0.35),
  win: () => { blip(523, 0.16); setTimeout(() => blip(659, 0.16), 130); setTimeout(() => blip(784, 0.3), 260); },
};
