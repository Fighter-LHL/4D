namespace WSlice.Editor
{
    public static class GrayboxLevelRecipe
    {
        public const string ProfileDirectory = "Assets/_Project/Entities/SliceProfiles";

        public const float WSmoothing = 2f;
        public const float MoveSpeed = 3f;
        public const float ArrivalThreshold = 0.05f;
        public const float SnapRadius = 0.03f;
        public const float PathPreviewYOffset = 0.08f;

        public static class UI
        {
            public const float DialWidth = 300f;
            public const float DialHeight = 40f;
            public const float DialBottomMargin = 60f;
            public const float DialTrackHeight = 36f;
            public const float DialTrackBottomMargin = 104f;

            public const float PlayerHUDWidth = 560f;
            public const float PlayerHUDHeight = 110f;
            public const float PlayerHUDTopMargin = 26f;

            public const float DebugWidth = 220f;
            public const float DebugHeight = 110f;
            public const float DebugLeftMargin = 20f;
            public const float DebugTopMargin = 20f;

            public const float OutcomePanelWidth = 420f;
            public const float OutcomePanelHeight = 240f;
            public const float OutcomeButtonWidth = 160f;
            public const float OutcomeButtonHeight = 44f;
            public const float OutcomeButtonSpacing = 12f;
        }
    }
}
