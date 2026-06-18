using System;
using System.Collections.Generic;
using UnityEngine;
using WSlice.Core;

namespace WSlice.Level
{
    public sealed class LevelGraphRuntime
    {
        private readonly Dictionary<string, LevelNode> _nodes = new();
        private readonly List<LevelEdge> _edges = new();

        public IReadOnlyDictionary<string, LevelNode> Nodes => _nodes;
        public IReadOnlyList<LevelEdge> Edges => _edges;

        public LevelGraphRuntime() { }
        public LevelGraphRuntime(LevelDefinition definition) => Load(definition);

        public void Load(LevelDefinition definition)
        {
            if (definition == null) throw new ArgumentNullException(nameof(definition));

            _nodes.Clear();
            _edges.Clear();

            foreach (var node in definition.Nodes)
            {
                if (string.IsNullOrEmpty(node.Id)) continue;
                _nodes[node.Id] = node;
            }

            foreach (var edge in definition.Edges)
            {
                if (string.IsNullOrEmpty(edge.FromNodeId) || string.IsNullOrEmpty(edge.ToNodeId)) continue;
                if (!_nodes.ContainsKey(edge.FromNodeId) || !_nodes.ContainsKey(edge.ToNodeId)) continue;
                _edges.Add(edge);
            }
        }

        public IEnumerable<LevelEdge> GetAvailableEdges(float w)
        {
            foreach (var edge in _edges)
            {
                if (edge.WalkableRange.Contains(w))
                    yield return edge;
            }
        }

        public bool CanMove(string from, string to, float w)
        {
            if (from == to) return true;
            foreach (var edge in _edges)
            {
                bool connects = edge.FromNodeId == from && edge.ToNodeId == to;
                if (edge.Bidirectional)
                    connects |= edge.FromNodeId == to && edge.ToNodeId == from;
                if (connects && edge.WalkableRange.Contains(w)) return true;
            }
            return false;
        }

        public IReadOnlyList<LevelNode> FindPath(string fromId, string toId, float w)
        {
            if (!_nodes.TryGetValue(fromId, out _) || !_nodes.TryGetValue(toId, out _))
                return Array.Empty<LevelNode>();
            if (fromId == toId)
                return new List<LevelNode> { _nodes[fromId] };

            var prev = new Dictionary<string, string>();
            var queue = new Queue<string>();
            var visited = new HashSet<string>();
            queue.Enqueue(fromId);
            visited.Add(fromId);

            while (queue.Count > 0)
            {
                string current = queue.Dequeue();
                foreach (var edge in GetAvailableEdges(w))
                {
                    string next = null;
                    if (edge.FromNodeId == current) next = edge.ToNodeId;
                    else if (edge.Bidirectional && edge.ToNodeId == current) next = edge.FromNodeId;

                    if (next == null || visited.Contains(next)) continue;

                    visited.Add(next);
                    prev[next] = current;

                    if (next == toId)
                    {
                        var path = new List<LevelNode>();
                        string step = toId;
                        while (step != fromId)
                        {
                            path.Add(_nodes[step]);
                            step = prev[step];
                        }
                        path.Add(_nodes[fromId]);
                        path.Reverse();
                        return path;
                    }

                    queue.Enqueue(next);
                }
            }

            return Array.Empty<LevelNode>();
        }

        public LevelNode GetNode(string id)
        {
            _nodes.TryGetValue(id, out var node);
            return node;
        }

        public bool SetEdgeWalkableRange(string fromNodeId, string toNodeId, WRange walkableRange)
        {
            if (string.IsNullOrEmpty(fromNodeId) || string.IsNullOrEmpty(toNodeId))
                return false;

            for (int i = 0; i < _edges.Count; i++)
            {
                var edge = _edges[i];
                if (edge.FromNodeId == fromNodeId && edge.ToNodeId == toNodeId)
                {
                    edge.WalkableRange = walkableRange;
                    return true;
                }
            }

            return false;
        }
    }
}
