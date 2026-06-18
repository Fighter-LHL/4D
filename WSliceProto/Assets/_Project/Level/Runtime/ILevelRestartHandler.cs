namespace WSlice.Level
{
    public interface ILevelRestartHandler
    {
        void ApplyLevelRestart(LevelDefinition definition, LevelGraphRuntime graph);
    }
}
