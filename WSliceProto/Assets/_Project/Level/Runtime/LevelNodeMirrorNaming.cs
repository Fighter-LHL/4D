namespace WSlice.Level
{
    public static class LevelNodeMirrorNaming
    {
        public static string ToMirrorName(string nodeId) => $"{nodeId}Node";

        public static bool IsDefinedMirror(LevelDefinition definition, string mirrorName)
        {
            if (definition == null || string.IsNullOrEmpty(mirrorName)) return false;

            foreach (var node in definition.Nodes)
            {
                if (node == null || string.IsNullOrEmpty(node.Id)) continue;
                if (mirrorName == ToMirrorName(node.Id)) return true;
            }

            return false;
        }
    }
}
