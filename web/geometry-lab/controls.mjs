// Screen right and screen down projected onto the floor. The flat view keeps
// its original axes; a 3D camera's yaw rotates both movement vectors together.
export function screenToWorldMove(right, down, yaw = 0) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [right * c + down * s, -right * s + down * c];
}
