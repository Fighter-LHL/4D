namespace WSlice.Level
{
    public readonly struct BuildSceneEntry
    {
        public string AssetPath { get; }
        public string SceneName { get; }
        public bool Enabled { get; }

        public BuildSceneEntry(string assetPath, string sceneName, bool enabled)
        {
            AssetPath = assetPath ?? string.Empty;
            SceneName = sceneName ?? string.Empty;
            Enabled = enabled;
        }
    }
}
