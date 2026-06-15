using UnityEngine;

namespace WSlice.Player
{
    public readonly struct MoveCommand
    {
        public readonly Vector3 TargetWorldPosition;
        public MoveCommand(Vector3 target) => TargetWorldPosition = target;
    }
}
