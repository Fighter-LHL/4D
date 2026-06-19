namespace WSlice.Level
{
    public static class LevelRestartRules
    {
        public static bool CanRequestRestart(LevelSessionState state)
        {
            return state == LevelSessionState.Playing
                || state == LevelSessionState.Completed
                || state == LevelSessionState.Failed;
        }
    }
}
