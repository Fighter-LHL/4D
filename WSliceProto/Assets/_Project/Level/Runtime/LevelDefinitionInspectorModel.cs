namespace WSlice.Level
{
    public readonly struct LevelDefinitionSummary
    {
        public int NodeCount { get; }
        public int EdgeCount { get; }
        public int SnapPointCount { get; }

        public LevelDefinitionSummary(int nodeCount, int edgeCount, int snapPointCount)
        {
            NodeCount = nodeCount;
            EdgeCount = edgeCount;
            SnapPointCount = snapPointCount;
        }
    }

    public static class LevelDefinitionInspectorModel
    {
        public static LevelDefinitionSummary BuildSummary(LevelDefinition definition)
        {
            if (definition == null)
                return new LevelDefinitionSummary(0, 0, 0);

            return new LevelDefinitionSummary(
                definition.Nodes?.Count ?? 0,
                definition.Edges?.Count ?? 0,
                definition.SnapPoints?.Count ?? 0);
        }

        public static string BuildStatusLabel(LevelDefinitionValidationResult result)
        {
            if (result == null)
                return "Not validated";

            if (result.IsValid && result.Warnings.Count == 0)
                return "Valid";

            if (result.IsValid)
                return $"Valid with {result.Warnings.Count} warning(s)";

            return $"Invalid ({result.Errors.Count} error(s), {result.Warnings.Count} warning(s))";
        }
    }
}
