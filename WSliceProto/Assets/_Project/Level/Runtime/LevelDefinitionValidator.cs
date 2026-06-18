using System.Collections.Generic;

namespace WSlice.Level
{
    public sealed class LevelDefinitionValidationResult
    {
        public IReadOnlyList<string> Errors { get; }
        public IReadOnlyList<string> Warnings { get; }
        public bool IsValid => Errors.Count == 0;

        public LevelDefinitionValidationResult(IReadOnlyList<string> errors, IReadOnlyList<string> warnings)
        {
            Errors = errors ?? new List<string>().AsReadOnly();
            Warnings = warnings ?? new List<string>().AsReadOnly();
        }
    }

    public static class LevelDefinitionValidator
    {
        public static LevelDefinitionValidationResult Validate(LevelDefinition definition)
        {
            var errors = new List<string>();
            var warnings = new List<string>();

            if (definition == null)
            {
                errors.Add("LevelDefinition is missing.");
                return new LevelDefinitionValidationResult(errors.AsReadOnly(), warnings.AsReadOnly());
            }

            ValidateSnapPoints(definition, errors, warnings);
            var nodeIds = ValidateNodes(definition, errors);
            ValidateEdges(definition, nodeIds, errors, warnings);

            return new LevelDefinitionValidationResult(errors.AsReadOnly(), warnings.AsReadOnly());
        }

        private static void ValidateSnapPoints(LevelDefinition definition, List<string> errors, List<string> warnings)
        {
            float previous = float.NegativeInfinity;
            var seen = new HashSet<float>();

            foreach (float snap in definition.SnapPoints)
            {
                if (snap < 0f || snap > 1f)
                    errors.Add($"Snap point {snap:F2} is outside [0, 1].");

                if (snap < previous)
                    AddOnce(warnings, "Snap points should be sorted ascending for stable authoring.");

                if (!seen.Add(snap))
                    warnings.Add($"Duplicate snap point {snap:F2}.");

                previous = snap;
            }
        }

        private static HashSet<string> ValidateNodes(LevelDefinition definition, List<string> errors)
        {
            var nodeIds = new HashSet<string>();

            foreach (var node in definition.Nodes)
            {
                if (node == null)
                {
                    errors.Add("Level node entry is missing.");
                    continue;
                }

                if (string.IsNullOrWhiteSpace(node.Id))
                {
                    errors.Add("Level node id is missing.");
                    continue;
                }

                if (!nodeIds.Add(node.Id))
                    errors.Add($"Duplicate node id '{node.Id}'.");
            }

            return nodeIds;
        }

        private static void ValidateEdges(
            LevelDefinition definition,
            HashSet<string> nodeIds,
            List<string> errors,
            List<string> warnings)
        {
            foreach (var edge in definition.Edges)
            {
                if (edge == null)
                {
                    errors.Add("Level edge entry is missing.");
                    continue;
                }

                string label = $"{edge.FromNodeId}->{edge.ToNodeId}";

                if (string.IsNullOrWhiteSpace(edge.FromNodeId))
                    errors.Add("Edge from node id is missing.");
                else if (!nodeIds.Contains(edge.FromNodeId))
                    errors.Add($"Edge {label} references missing from node '{edge.FromNodeId}'.");

                if (string.IsNullOrWhiteSpace(edge.ToNodeId))
                    errors.Add($"Edge {edge.FromNodeId}-> references missing to node ''.");
                else if (!nodeIds.Contains(edge.ToNodeId))
                    errors.Add($"Edge {label} references missing to node '{edge.ToNodeId}'.");

                if (edge.WalkableRange.Min < 0f || edge.WalkableRange.Min > 1f
                    || edge.WalkableRange.Max < 0f || edge.WalkableRange.Max > 1f)
                {
                    errors.Add($"Edge {label} walkable range {edge.WalkableRange.Min:F2}-{edge.WalkableRange.Max:F2} is outside [0, 1].");
                }

                if (edge.WalkableRange.Min > edge.WalkableRange.Max)
                    warnings.Add($"Edge {label} walkable range is reversed; runtime normalizes it.");
            }
        }

        private static void AddOnce(List<string> warnings, string warning)
        {
            if (!warnings.Contains(warning))
                warnings.Add(warning);
        }
    }
}
