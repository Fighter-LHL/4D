namespace WSlice.Editor
{
    public static class GardenGrayboxRecipe
    {
        public const string LevelDefinitionPath = "Assets/_Project/Level/Definitions/GardenLevel.asset";
        public const string ScenePath = "Assets/_Project/Level/Scenes/GardenGraybox.unity";

        public const float GroundScaleXZ = 1.2f;
        public const string PlayerStartNodeId = "Outside";
        public static readonly UnityEngine.Vector3 FlowerBasePosition = new(2f, 0f, 0f);
        public static readonly UnityEngine.Vector3 FlowerTopPosition = new(2f, 1.5f, 3f);
    }
}
