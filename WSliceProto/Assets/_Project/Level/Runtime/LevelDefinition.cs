using System.Collections.Generic;
using UnityEngine;

namespace WSlice.Level
{
    [CreateAssetMenu(menuName = "WSlice/Level Definition", fileName = "LevelDefinition")]
    public sealed class LevelDefinition : ScriptableObject
    {
        public string LevelId;
        public string DisplayName;
        public string GoalNodeId;

        [Range(0f, 1f)] public float InitialW;

        public List<float> SnapPoints = new();
        public List<LevelNode> Nodes = new();
        public List<LevelEdge> Edges = new();
    }
}
