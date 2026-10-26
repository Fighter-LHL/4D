// Small seeded RNG so every attempt can vary while tests stay reproducible.
export function createRandom(seed = 1) {
  let a = seed >>> 0 || 1;
  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng = {
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: list => list[Math.floor(next() * list.length)],
    shuffle: list => { const out = [...list]; for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; } return out; },
  };
  return rng;
}

export const randomSeed = () => Math.floor(Math.random() * 4294967296) >>> 0;

// URL challenges accept only an unambiguous unsigned 32-bit decimal seed.
export const parseSeed = value => typeof value === 'string' && /^\d{1,10}$/.test(value) && Number(value) <= 0xffffffff ? Number(value) : null;
