namespace WSlice.Editor
{
    public static class GateGrayboxRecipe
    {
        public const string LevelDefinitionPath = "Assets/_Project/Level/Definitions/GateLevel.asset";
        public const string ScenePath = "Assets/_Project/Level/Scenes/GateGraybox.unity";

        public const float GroundScaleXZ = 1.6f;
        public const string PlayerStartNodeId = "Entry";
        public static readonly UnityEngine.Vector3 PlayerStartPosition = new(0f, 0f, 0f);
        public static readonly UnityEngine.Vector3 LeverPosition = new(5f, 0.75f, 1.2f);

        public static string ProfileDirectory => GrayboxLevelRecipe.ProfileDirectory;
    }
}
