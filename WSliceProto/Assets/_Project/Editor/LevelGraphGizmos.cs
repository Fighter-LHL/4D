using UnityEditor;
using UnityEngine;
using WSlice.Level;

namespace WSlice.EditorTools
{
    public static class LevelGraphGizmos
    {
        private const float NodeRadius = 0.2f;
        private const float MissingNodeRadius = 0.12f;

        [DrawGizmo(GizmoType.Selected | GizmoType.NonSelected)]
        private static void DrawLevelRuntimeGraph(LevelRuntimeController controller, GizmoType gizmoType)
        {
            if (controller == null || controller.Definition == null) return;

            float w = controller.WState != null
                ? controller.WState.CurrentW
                : controller.Definition.InitialW;

            DrawDefinitionGraph(controller.Definition, w);
        }

        private static void DrawDefinitionGraph(LevelDefinition definition, float w)
        {
            foreach (var node in definition.Nodes)
            {
                if (node == null || string.IsNullOrEmpty(node.Id)) continue;

                Gizmos.color = Color.yellow;
                Gizmos.DrawSphere(node.WorldPosition, NodeRadius);
            }

            foreach (var edge in definition.Edges)
            {
                if (edge == null) continue;

                var from = FindDefinitionNode(definition, edge.FromNodeId);
                var to = FindDefinitionNode(definition, edge.ToNodeId);

                if (from == null || to == null)
                {
                    DrawMissingEdgeEndpoint(definition, edge);
                    continue;
                }

                bool active = edge.WalkableRange.Contains(w);
                Gizmos.color = active ? Color.green : Color.red;

                if (active)
                {
                    Gizmos.DrawLine(from.WorldPosition, to.WorldPosition);
                }
                else
                {
                    Vector3 mid = Vector3.Lerp(from.WorldPosition, to.WorldPosition, 0.5f);
                    Gizmos.DrawLine(from.WorldPosition, mid);
                }
            }
        }

        private static LevelNode FindDefinitionNode(LevelDefinition definition, string nodeId)
        {
            if (definition == null || string.IsNullOrEmpty(nodeId)) return null;

            foreach (var node in definition.Nodes)
            {
                if (node != null && node.Id == nodeId)
                    return node;
            }

            return null;
        }

        private static void DrawMissingEdgeEndpoint(LevelDefinition definition, LevelEdge edge)
        {
            var from = FindDefinitionNode(definition, edge.FromNodeId);
            var to = FindDefinitionNode(definition, edge.ToNodeId);

            Gizmos.color = Color.magenta;
            if (from != null) Gizmos.DrawWireSphere(from.WorldPosition, MissingNodeRadius);
            if (to != null) Gizmos.DrawWireSphere(to.WorldPosition, MissingNodeRadius);
        }
    }
}
