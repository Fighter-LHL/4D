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
        public string StartNodeId;

        [Range(0f, 1f)] public float InitialW;

        [TextArea(2, 4)] public string TutorialHint;

        public List<float> SnapPoints = new();
        public List<LevelNode> Nodes = new();
        public List<LevelEdge> Edges = new();
    }
}
