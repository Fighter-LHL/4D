using UnityEngine;
using WSlice.Level;

namespace WSlice.EditorTools
{
    public sealed class LevelGraphGizmos : MonoBehaviour
    {
        [SerializeField] private LevelDefinition definition;
        [SerializeField] private float currentW;

        private void OnDrawGizmos()
        {
            if (definition == null) return;

            Gizmos.color = Color.yellow;
            foreach (var node in definition.Nodes)
            {
                Gizmos.DrawSphere(node.WorldPosition, 0.2f);
            }

            foreach (var edge in definition.Edges)
            {
                var from = definition.Nodes.Find(n => n.Id == edge.FromNodeId);
                var to = definition.Nodes.Find(n => n.Id == edge.ToNodeId);
                if (from == null || to == null) continue;

                bool active = edge.WalkableRange.Contains(currentW);
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
    }
}
