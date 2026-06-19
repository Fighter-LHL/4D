using System;
using WSlice.Core;

namespace WSlice.Level
{
    [Serializable]
    public struct GraphEdgeUnlockAction
    {
        public string FromNodeId;
        public string ToNodeId;
        public WRange WalkableRange;
    }
}
