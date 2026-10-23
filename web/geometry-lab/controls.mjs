import { clampDial, dialToW, wToDial } from './geometry.mjs';

// Screen right and screen down projected onto the floor. The flat view keeps
// its original axes; a 3D camera's yaw rotates both movement vectors together.
export function screenToWorldMove(right, down, yaw = 0) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [right * c + down * s, -right * s + down * c];
}
export const RAIL_SNAP_W = 0.12;

// These marks identify devices, not safe W ranges. Chapter 2 never adds them.
export function relayRailMarks(level, aidsVisible) {
  if (!aidsVisible || level?.chapter === 2 || !level?.field?.relay) return [];
  const { socket, latch } = level.field.relay;
  return [{ w: socket.w, label: '插座' }, { w: latch.w, label: '回廊' }];
}

export function nearbyRailMark(dial, marks) {
  const w = dialToW(clampDial(dial));
  return marks.reduce((nearest, mark) => {
    const distance = Math.abs(w - mark.w);
    return distance <= RAIL_SNAP_W + 1e-9 && (!nearest || distance < Math.abs(w - nearest.w)) ? mark : nearest;
  }, null);
}

// Only a released pointer gesture uses this. The caller still asks WalkRun
// to accept the entire W change, so snapping cannot bypass engulf checks.
export function railReleaseDial(dial, marks) {
  const mark = nearbyRailMark(dial, marks);
  return mark ? wToDial(mark.w) : clampDial(dial);
}
