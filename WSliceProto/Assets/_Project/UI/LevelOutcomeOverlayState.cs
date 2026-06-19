namespace WSlice.UI
{
    public enum LevelOutcomeOverlayMode
    {
        Hidden,
        Complete,
        Failed
    }

    public sealed class LevelOutcomeOverlayState
    {
        public LevelOutcomeOverlayMode Mode { get; }
        public string Title { get; }
        public bool ShowNext { get; }
        public bool ShowRestart { get; }
        public bool ShowLevelSelect { get; }

        public LevelOutcomeOverlayState(
            LevelOutcomeOverlayMode mode,
            string title,
            bool showNext,
            bool showRestart,
            bool showLevelSelect)
        {
            Mode = mode;
            Title = title ?? string.Empty;
            ShowNext = showNext;
            ShowRestart = showRestart;
            ShowLevelSelect = showLevelSelect;
        }
    }
}
