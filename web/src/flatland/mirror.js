// Unequal arms matter: a symmetric L could match its reflection by a planar turn.
export const KEY_OUTLINE = Object.freeze([[-.8,-1.4],[-.25,-1.4],[-.25,.7],[.85,.7],[.85,1.3],[-.8,1.3]].map(Object.freeze));
export const FLIP_DURATION = 1.2;
// Briefly hold the edge-on pose so the dimensional change can be seen.
export function flipProgress(elapsed) {
  const p = Math.max(0, Math.min(1, elapsed / FLIP_DURATION));
  return p < 5 / 12 ? p * 1.2 : p <= 7 / 12 ? .5 : .5 + (p - 7 / 12) * 1.2;
}
export const quarterTurn = turns => ((turns % 4) + 4) % 4;

export function keyPoints(chirality = 1, turns = 0) {
  const angle = quarterTurn(turns) * Math.PI / 2, c = Math.cos(angle), s = Math.sin(angle);
  return KEY_OUTLINE.map(([x, y]) => [x * c - y * chirality * s, x * s + y * chirality * c]);
}
export function keyShape(x, y, chirality = 1, turns = 0) {
  return { type: 'polygon', points: keyPoints(chirality, turns).map(([u, v]) => [x + u, y + v]) };
}
// Orthographic projection of a rigid rotation around X. Z is a physical offset
// above/below the player's S plane; XY is a projection, not a slicing claim.
export function flipVertices(chirality, turns, progress) {
  const angle = Math.PI * Math.max(0, Math.min(1, progress));
  return keyPoints(chirality, turns).map(([x, y]) => [x, y * Math.cos(angle), y * Math.sin(angle)]);
}
export function flippedPose(chirality, turns) { return { chirality: -chirality, turns: quarterTurn(-turns) }; }
