using System.Globalization;
using WSlice.Player;

namespace WSlice.UI
{
    public static class PlayerHUDModel
    {
        private const string DefaultPrimaryText = "Find a W that opens the path.";
        private const string BreakWarningText = "Changing W now will break the current move.";
        private const string CompleteText = "Level Complete!";
        private const string RestartHintText = "Press R to restart.";

        public static PlayerHUDState Build(HUDState hud, bool isLevelComplete)
        {
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
                ? RestartHintText
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
    }
}
