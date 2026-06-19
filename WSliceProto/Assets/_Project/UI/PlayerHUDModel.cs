using System.Globalization;
using WSlice.Player;

namespace WSlice.UI
{
    public static class PlayerHUDModel
    {
        private const string DefaultPrimaryText = "Find a W that opens the path.";
        private const string BreakWarningText = "Changing W now will break the current move.";
        private const string CompleteText = "Level Complete!";
        private const string FailedText = "Move interrupted!";
        private const string NextLevelHintText = "Press N for next level. R to restart.";
        private const string AllLevelsCompleteHintText = "All levels complete! Press R to restart.";
        private const string RestartAfterFailHintText = "Press R to retry.";

        public static PlayerHUDState Build(HUDState hud, bool isLevelComplete, bool hasNextLevel = false, bool isLevelFailed = false)
        {
            if (isLevelFailed)
            {
                return new PlayerHUDState(
                    FailedText,
                    string.Empty,
                    string.Empty,
                    false,
                    false,
                    false,
                    RestartAfterFailHintText,
                    true);
            }

            bool isComplete = isLevelComplete;
            bool showWarning = hud != null && hud.ActiveMoveWillBreakAtTargetW && !isComplete;
            bool showFailure = hud != null
                && hud.LastFailureReason != PlayerActionFailureReason.None
                && !isComplete;
            bool showHint = !isComplete
                && showFailure
                && hud.LastFailureReason == PlayerActionFailureReason.NoPathAtCurrentW
                && hud.HasRouteHint;
            bool showRestartHint = isComplete;

            string primary = isComplete ? CompleteText : DefaultPrimaryText;
            string warning = showWarning ? BreakWarningText : string.Empty;
            string failure = showFailure
                ? BuildFailureText(hud.LastFailureReason, hud.LastFailureMessage, hud.HasRouteHint)
                : string.Empty;
            string hint = isComplete
                ? BuildCompleteHint(hasNextLevel)
                : (showHint ? BuildHintText(hud.RouteHint) : string.Empty);

            return new PlayerHUDState(
                primary,
                warning,
                failure,
                showWarning,
                showFailure,
                isComplete,
                hint,
                showHint || showRestartHint);
        }

        private static string BuildFailureText(PlayerActionFailureReason reason, string fallback, bool hasRouteHint)
        {
            switch (reason)
            {
                case PlayerActionFailureReason.MissingWState:
                    return "W controls are not ready.";
                case PlayerActionFailureReason.MissingCamera:
                    return "Input setup issue: camera missing.";
                case PlayerActionFailureReason.MissingMovement:
                    return "Input setup issue: movement missing.";
                case PlayerActionFailureReason.NoGroundHit:
                    return "Tap the ground to move.";
                case PlayerActionFailureReason.MissingCharacterOrLevel:
                    return "Level setup is not ready.";
                case PlayerActionFailureReason.MissingCurrentNode:
                    return "Player is not linked to the graph.";
                case PlayerActionFailureReason.NoNearestNode:
                    return "No graph node near that target.";
                case PlayerActionFailureReason.NoPathAtCurrentW:
                    return hasRouteHint
                        ? "No path at this W."
                        : "No path at this W. Shift W and try again.";
                case PlayerActionFailureReason.NotInteractiveAtCurrentW:
                    return string.IsNullOrEmpty(fallback)
                        ? "Not interactive at this W. Shift W and try again."
                        : fallback;
                case PlayerActionFailureReason.LevelNotPlaying:
                    return "Level is complete. Press R to restart.";
                default:
                    return string.IsNullOrEmpty(fallback) ? "Action failed." : fallback;
            }
        }

        private static string BuildHintText(RouteHint hint)
        {
            if (hint == null)
                return string.Empty;

            return "Try W "
                + hint.MinW.ToString("F2", CultureInfo.InvariantCulture)
                + "-"
                + hint.MaxW.ToString("F2", CultureInfo.InvariantCulture)
                + " to open "
                + hint.FromNodeId
                + "->"
                + hint.ToNodeId
                + ".";
        }

        private static string BuildCompleteHint(bool hasNextLevel)
        {
            if (hasNextLevel)
                return NextLevelHintText;

            return AllLevelsCompleteHintText;
        }
    }
}
