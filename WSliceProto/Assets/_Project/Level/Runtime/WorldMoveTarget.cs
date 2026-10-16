using UnityEngine;

namespace WSlice.Level
{
    // A visible floor or landing maps to an authored destination, not a hidden nearest node.
    public sealed class WorldMoveTarget : MonoBehaviour
    {
        public string NodeId;
    }
}
