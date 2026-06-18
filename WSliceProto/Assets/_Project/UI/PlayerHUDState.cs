namespace WSlice.UI
{
    public sealed class PlayerHUDState
    {
        public string PrimaryText { get; }
        public string WarningText { get; }
        public string FailureText { get; }
        public string HintText { get; }
        public bool ShowWarning { get; }
        public bool ShowFailure { get; }
        public bool ShowHint { get; }
        public bool IsComplete { get; }

        public PlayerHUDState(
            string primaryText,
            string warningText,
            string failureText,
            bool showWarning,
            bool showFailure,
            bool isComplete)
            : this(
                primaryText,
                warningText,
                failureText,
                showWarning,
                showFailure,
                isComplete,
                string.Empty,
                false)
        {
        }

        public PlayerHUDState(
            string primaryText,
            string warningText,
            string failureText,
            bool showWarning,
            bool showFailure,
            bool isComplete,
            string hintText,
            bool showHint)
        {
            PrimaryText = primaryText ?? string.Empty;
            WarningText = warningText ?? string.Empty;
            FailureText = failureText ?? string.Empty;
            HintText = hintText ?? string.Empty;
            ShowWarning = showWarning;
            ShowFailure = showFailure;
            ShowHint = showHint;
            IsComplete = isComplete;
        }
    }
}
