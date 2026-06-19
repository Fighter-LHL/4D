using System.Collections.Generic;

namespace WSlice.Level
{
    public static class GraphMutationModel
    {
        public static bool TryApplyUnlock(LevelGraphRuntime graph, GraphEdgeUnlockAction action)
        {
            if (graph == null)
                return false;

            return graph.SetEdgeWalkableRange(action.FromNodeId, action.ToNodeId, action.WalkableRange);
        }

        public static int ApplyUnlockSequence(LevelGraphRuntime graph, IReadOnlyList<GraphEdgeUnlockAction> actions)
        {
            if (graph == null || actions == null)
                return 0;

            int applied = 0;
            for (int i = 0; i < actions.Count; i++)
            {
                if (TryApplyUnlock(graph, actions[i]))
                    applied++;
            }

            return applied;
        }

        public static void ResetToDefinition(LevelGraphRuntime graph, LevelDefinition definition)
        {
            if (graph == null || definition == null)
                return;

            graph.Load(definition);
        }
    }
}
