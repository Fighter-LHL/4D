namespace WSlice.Editor
{
    public static class ChambersGrayboxRecipe
    {
        public const string LevelDefinitionPath = "Assets/_Project/Level/Definitions/ChambersLevel.asset";
        public const string ScenePath = "Assets/_Project/Level/Scenes/ChambersGraybox.unity";

        public const float GroundScaleXZ = 1.8f;
        public const string PlayerStartNodeId = "Lobby";
        public static readonly UnityEngine.Vector3 PlayerStartPosition = new(0f, 0f, 0f);
    }
}
