using System;
using WSlice.Core;

namespace WSlice.Level
{
    [Serializable]
    public sealed class LevelEdge
    {
        public string FromNodeId;
        public string ToNodeId;
        public WRange WalkableRange;
        public bool Bidirectional = true;
    }
}
