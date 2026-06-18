using System.Collections.Generic;
using UnityEngine;

namespace WSlice.Level
{
    public sealed class PathEdgeVisual
    {
        public string FromNodeId { get; }
        public string ToNodeId { get; }
        public Vector3 FromPosition { get; }
        public Vector3 ToPosition { get; }
        public bool IsOpenAtCurrentW { get; }

        public PathEdgeVisual(
            string fromNodeId,
            string toNodeId,
            Vector3 fromPosition,
            Vector3 toPosition,
            bool isOpenAtCurrentW)
        {
            FromNodeId = fromNodeId ?? string.Empty;
            ToNodeId = toNodeId ?? string.Empty;
            FromPosition = fromPosition;
            ToPosition = toPosition;
            IsOpenAtCurrentW = isOpenAtCurrentW;
        }

        public Vector3 LineEndPosition =>
            IsOpenAtCurrentW ? ToPosition : Vector3.Lerp(FromPosition, ToPosition, 0.5f);
    }

    public static class LevelPathPreviewModel
    {
        public static IReadOnlyList<PathEdgeVisual> Build(LevelGraphRuntime graph, float currentW, float yOffset = 0f)
        {
            var visuals = new List<PathEdgeVisual>();
            if (graph == null)
                return visuals.AsReadOnly();

            Vector3 offset = new Vector3(0f, yOffset, 0f);

            foreach (var edge in graph.Edges)
            {
                if (edge == null) continue;

                var from = graph.GetNode(edge.FromNodeId);
                var to = graph.GetNode(edge.ToNodeId);
                if (from == null || to == null) continue;

                bool isOpen = edge.WalkableRange.Contains(currentW);
                visuals.Add(new PathEdgeVisual(
                    edge.FromNodeId,
                    edge.ToNodeId,
                    from.WorldPosition + offset,
                    to.WorldPosition + offset,
                    isOpen));
            }

            return visuals.AsReadOnly();
        }
    }
}
