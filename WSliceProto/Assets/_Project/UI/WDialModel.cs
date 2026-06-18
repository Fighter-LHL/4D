using System.Collections.Generic;
using UnityEngine;
using WSlice.Core;
using WSlice.Level;
using WSlice.Player;

namespace WSlice.UI
{
    public static class WDialModel
    {
        public static HUDState Build(
            LevelRuntimeController level,
            MovementController movement,
            PlayerInputRouter inputRouter,
            PlayerCharacter character)
        {
            return Build(
                level != null ? level.WState : null,
                level != null ? level.Definition : null,
                level != null ? level.Graph : null,
                movement,
                inputRouter,
                character);
        }

        public static HUDState Build(
            WState wState,
            LevelDefinition definition,
            LevelGraphRuntime graph,
            MovementController movement,
            PlayerInputRouter inputRouter,
            PlayerCharacter character)
        {
            float currentW = wState != null ? wState.CurrentW : 0f;
            float targetW = wState != null ? wState.TargetW : currentW;
            var runtimeGraph = graph ?? (definition != null ? new LevelGraphRuntime(definition) : null);
            var snapPoints = BuildSnapPoints(definition);
            var edgePreviews = BuildEdgePreviews(runtimeGraph, currentW, targetW);
            var availableEdges = new List<EdgePreview>();
            var routeHint = BuildRouteHint(runtimeGraph, movement, character, currentW);

            foreach (var preview in edgePreviews)
            {
                if (preview.AvailableAtCurrentW)
                    availableEdges.Add(preview);
            }

            bool hasActiveSegment = movement != null && movement.HasActiveSegment;
            string activeFrom = hasActiveSegment ? movement.ActiveSegmentFromId : string.Empty;
            string activeTo = hasActiveSegment ? movement.ActiveSegmentToId : string.Empty;
            bool activeMoveWillBreak = false;

            if (runtimeGraph != null && movement != null && movement.IsMoving && hasActiveSegment)
            {
                bool openNow = runtimeGraph.CanMove(activeFrom, activeTo, currentW);
                bool openAtTarget = runtimeGraph.CanMove(activeFrom, activeTo, targetW);
                activeMoveWillBreak = openNow && !openAtTarget;
            }

            PlayerActionResult lastAction = inputRouter != null
                ? inputRouter.LastActionResult
                : PlayerActionResult.Success();
            var lastFailureReason = lastAction.Succeeded
                ? PlayerActionFailureReason.None
                : lastAction.Reason;
            string lastFailureMessage = lastAction.Succeeded ? string.Empty : lastAction.Message;

            return new HUDState(
                currentW,
                targetW,
                snapPoints,
                availableEdges.AsReadOnly(),
                edgePreviews.AsReadOnly(),
                movement != null && movement.IsMoving,
                activeFrom,
                activeTo,
                activeMoveWillBreak,
                lastFailureReason,
                lastFailureMessage,
                routeHint);
        }

        private static IReadOnlyList<float> BuildSnapPoints(LevelDefinition definition)
        {
            var values = new List<float>();
            if (definition != null && definition.SnapPoints != null)
            {
                foreach (float value in definition.SnapPoints)
                    values.Add(value);
            }

            values.Sort();
            return values.AsReadOnly();
        }

        private static List<EdgePreview> BuildEdgePreviews(LevelGraphRuntime graph, float currentW, float targetW)
        {
            var previews = new List<EdgePreview>();
            if (graph == null) return previews;

            foreach (var edge in graph.Edges)
            {
                if (edge == null) continue;

                float minW = Mathf.Min(edge.WalkableRange.Min, edge.WalkableRange.Max);
                float maxW = Mathf.Max(edge.WalkableRange.Min, edge.WalkableRange.Max);
                previews.Add(new EdgePreview(
                    edge.FromNodeId,
                    edge.ToNodeId,
                    minW,
                    maxW,
                    edge.WalkableRange.Contains(currentW),
                    edge.WalkableRange.Contains(targetW)));
            }

            return previews;
        }

        private static RouteHint BuildRouteHint(
            LevelGraphRuntime graph,
            MovementController movement,
            PlayerCharacter character,
            float currentW)
        {
            if (graph == null || movement == null || character == null)
                return null;

            if (!movement.HasLastTargetNode)
                return null;

            string currentNodeId = character.CurrentNodeId;
            string targetNodeId = movement.LastTargetNodeId;
            if (string.IsNullOrEmpty(currentNodeId) || string.IsNullOrEmpty(targetNodeId))
                return null;

            if (currentNodeId == targetNodeId)
                return null;

            if (graph.FindPath(currentNodeId, targetNodeId, currentW).Count > 0)
                return null;

            var route = FindRouteIgnoringW(graph, currentNodeId, targetNodeId);
            foreach (var step in route)
            {
                if (step.Edge.WalkableRange.Contains(currentW))
                    continue;

                float minW = Mathf.Min(step.Edge.WalkableRange.Min, step.Edge.WalkableRange.Max);
                float maxW = Mathf.Max(step.Edge.WalkableRange.Min, step.Edge.WalkableRange.Max);
                return new RouteHint(step.FromNodeId, step.ToNodeId, targetNodeId, minW, maxW);
            }

            return null;
        }

        private static List<RouteStep> FindRouteIgnoringW(LevelGraphRuntime graph, string fromId, string toId)
        {
            var route = new List<RouteStep>();
            if (!graph.Nodes.ContainsKey(fromId) || !graph.Nodes.ContainsKey(toId))
                return route;

            var previous = new Dictionary<string, RouteStep>();
            var queue = new Queue<string>();
            var visited = new HashSet<string>();
            queue.Enqueue(fromId);
            visited.Add(fromId);

            while (queue.Count > 0)
            {
                string current = queue.Dequeue();
                foreach (var edge in graph.Edges)
                {
                    string next = null;
                    if (edge.FromNodeId == current)
                        next = edge.ToNodeId;
                    else if (edge.Bidirectional && edge.ToNodeId == current)
                        next = edge.FromNodeId;

                    if (string.IsNullOrEmpty(next) || visited.Contains(next))
                        continue;

                    visited.Add(next);
                    previous[next] = new RouteStep(current, next, edge);

                    if (next == toId)
                        return ReconstructRoute(previous, fromId, toId);

                    queue.Enqueue(next);
                }
            }

            return route;
        }

        private static List<RouteStep> ReconstructRoute(
            Dictionary<string, RouteStep> previous,
            string fromId,
            string toId)
        {
            var route = new List<RouteStep>();
            string stepId = toId;
            while (stepId != fromId)
            {
                if (!previous.TryGetValue(stepId, out var step))
                    return new List<RouteStep>();

                route.Add(step);
                stepId = step.FromNodeId;
            }

            route.Reverse();
            return route;
        }

        private sealed class RouteStep
        {
            public string FromNodeId { get; }
            public string ToNodeId { get; }
            public LevelEdge Edge { get; }

            public RouteStep(string fromNodeId, string toNodeId, LevelEdge edge)
            {
                FromNodeId = fromNodeId;
                ToNodeId = toNodeId;
                Edge = edge;
            }
        }
    }
}
