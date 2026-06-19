using WSlice.Level;

namespace WSlice.UI
{
    public static class LevelOutcomeOverlayModel
    {
        private const string CompleteTitle = "Level Complete";
        private const string AllLevelsCompleteTitle = "All Levels Complete";
        private const string FailedTitle = "Move Interrupted";

        public static LevelOutcomeOverlayState Build(
            LevelSessionState sessionState,
            bool hasNextLevel)
        {
            if (sessionState == LevelSessionState.Completed)
            {
                return new LevelOutcomeOverlayState(
                    LevelOutcomeOverlayMode.Complete,
                    hasNextLevel ? CompleteTitle : AllLevelsCompleteTitle,
                    showNext: hasNextLevel,
                    showRestart: true,
                    showLevelSelect: true);
            }

            if (sessionState == LevelSessionState.Failed)
            {
                return new LevelOutcomeOverlayState(
                    LevelOutcomeOverlayMode.Failed,
                    FailedTitle,
                    showNext: false,
                    showRestart: true,
                    showLevelSelect: true);
            }

            return new LevelOutcomeOverlayState(
                LevelOutcomeOverlayMode.Hidden,
                string.Empty,
                showNext: false,
                showRestart: false,
                showLevelSelect: false);
        }
    }
}
