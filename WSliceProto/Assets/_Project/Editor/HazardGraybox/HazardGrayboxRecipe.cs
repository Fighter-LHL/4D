namespace WSlice.Editor
{
    public static class HazardGrayboxRecipe
    {
        public const string LevelDefinitionPath = "Assets/_Project/Level/Definitions/HazardLevel.asset";
        public const string ScenePath = "Assets/_Project/Level/Scenes/HazardGraybox.unity";

        public const float GroundScaleXZ = 1.4f;
        public const string PlayerStartNodeId = "West";
        public static readonly UnityEngine.Vector3 PlayerStartPosition = new(0f, 0f, 0f);
        public static readonly UnityEngine.Vector3 PlatformBasePosition = new(3f, 0f, 0f);
    }
}
