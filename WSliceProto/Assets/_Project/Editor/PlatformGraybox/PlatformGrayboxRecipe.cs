namespace WSlice.Editor
{
    public static class PlatformGrayboxRecipe
    {
        public const string LevelDefinitionPath = "Assets/_Project/Level/Definitions/PlatformLevel.asset";
        public const string ScenePath = "Assets/_Project/Level/Scenes/PlatformGraybox.unity";
        public const string ProfileDirectory = "Assets/_Project/Entities/SliceProfiles";

        public const float GroundScaleXZ = 1.4f;
        public const string PlayerStartNodeId = "West";
        public static readonly UnityEngine.Vector3 PlayerStartPosition = new(0f, 0f, 0f);
        public static readonly UnityEngine.Vector3 BridgeBasePosition = new(3f, 0f, 0f);
    }
}
