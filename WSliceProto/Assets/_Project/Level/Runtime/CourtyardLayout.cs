using UnityEngine;
using WSlice.Core;

namespace WSlice.Level
{
    // The authored graph and its physical presentation share these positions/ranges.
    public static class CourtyardLayout
    {
        public const string LevelId = "Courtyard_01";
        public const string SceneName = "CourtyardSlice";
        public const string DefinitionPath = "Assets/_Project/Level/Definitions/CourtyardLevel.asset";
        public const string ScenePath = "Assets/_Project/Level/Scenes/CourtyardSlice.unity";
        public const string Entry = "Entry";
        public const string Courtyard = "Courtyard";
        public const string StairFoot = "StairFoot";
        public const string UpperLanding = "UpperLanding";
        public const string Mechanism = "Mechanism";
        public const string BridgeStart = "BridgeStart";
        public const string ExitLanding = "ExitLanding";
        public const string Goal = "Goal";

        public static WRange EntranceRange => new() { Min = 0.20f, Max = 0.40f };
        public static WRange StairRange => new() { Min = 0.70f, Max = 0.90f };
        public static WRange BridgeRange => new() { Min = 0.45f, Max = 0.60f };

        public static void Populate(LevelDefinition definition)
        {
            definition.LevelId = LevelId;
            definition.DisplayName = "回响庭院";
            definition.StartNodeId = Entry;
            definition.GoalNodeId = Goal;
            definition.InitialW = 0f;
            definition.TutorialHint = string.Empty;
            definition.SnapPoints = new() { 0f, 0.30f, 0.525f, 0.80f, 1f };
            definition.Nodes = new()
            {
                Node(Entry, 0f, 0f, -6f), Node(Courtyard, 0f, 0f, 0f),
                Node(StairFoot, -3f, 0f, 0f), Node(UpperLanding, -6f, 1.2f, 0f), Node(Mechanism, -7f, 1.2f, 0f),
                Node(BridgeStart, 3f, 0f, 0f), Node(ExitLanding, 6f, 0f, 0f),
                Node(Goal, 8f, 0f, 0f)
            };
            definition.Edges = new()
            {
                Edge(Entry, Courtyard, EntranceRange),
                Edge(Courtyard, StairFoot, new WRange { Min = 0f, Max = 1f }),
                Edge(StairFoot, UpperLanding, StairRange),
                Edge(UpperLanding, Mechanism, new WRange { Min = 0f, Max = 1f }),
                Edge(Courtyard, BridgeStart, new WRange { Min = 0f, Max = 1f }),
                Edge(BridgeStart, ExitLanding, BridgeRange, true),
                Edge(ExitLanding, Goal, new WRange { Min = 0f, Max = 1f })
            };
        }

        private static LevelNode Node(string id, float x, float y, float z) =>
            new() { Id = id, WorldPosition = new Vector3(x, y, z) };

        private static LevelEdge Edge(string from, string to, WRange range, bool locked = false) =>
            new() { FromNodeId = from, ToNodeId = to, WalkableRange = range, Bidirectional = true, IsLocked = locked };
    }
}
