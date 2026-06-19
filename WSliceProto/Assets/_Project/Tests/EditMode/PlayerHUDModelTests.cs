using NUnit.Framework;
using WSlice.Player;
using WSlice.UI;

namespace WSlice.Tests.EditMode
{
    public class PlayerHUDModelTests
    {
        [Test]
        public void Build_WithoutFailure_ShowsCurrentObjective()
        {
            var hud = CreateHud(PlayerActionFailureReason.None, string.Empty, willBreak: false);

            var state = PlayerHUDModel.Build(hud, isLevelComplete: false);

            Assert.That(state.PrimaryText, Is.EqualTo("Find a W that opens the path."));
            Assert.That(state.ShowFailure, Is.False);
            Assert.That(state.ShowWarning, Is.False);
            Assert.That(state.IsComplete, Is.False);
        }

        [Test]
        public void Build_NoPathFailure_ExplainsDialCanOpenPath()
        {
            var hud = CreateHud(PlayerActionFailureReason.NoPathAtCurrentW, "No path is available at current W.", willBreak: false);

            var state = PlayerHUDModel.Build(hud, isLevelComplete: false);

            Assert.That(state.ShowFailure, Is.True);
            Assert.That(state.FailureText, Is.EqualTo("No path at this W. Shift W and try again."));
        }

        [Test]
        public void Build_NoPathFailureWithRouteHint_ShowsSuggestedWRange()
        {
            var routeHint = new RouteHint("Outside", "Gap", "InsideGarden", 0.5f, 0.7f);
            var hud = CreateHud(
                PlayerActionFailureReason.NoPathAtCurrentW,
                "No path is available at current W.",
                willBreak: false,
                routeHint: routeHint);

            var state = PlayerHUDModel.Build(hud, isLevelComplete: false);

            Assert.That(state.ShowFailure, Is.True);
            Assert.That(state.FailureText, Is.EqualTo("No path at this W."));
            Assert.That(state.ShowHint, Is.True);
            Assert.That(state.HintText, Is.EqualTo("Try W 0.50-0.70 to open Outside->Gap."));
        }

        [Test]
        public void Build_MissingCamera_UsesTechnicalFailureText()
        {
            var hud = CreateHud(PlayerActionFailureReason.MissingCamera, "Camera is not available.", willBreak: false);

            var state = PlayerHUDModel.Build(hud, isLevelComplete: false);

            Assert.That(state.ShowFailure, Is.True);
            Assert.That(state.FailureText, Is.EqualTo("Input setup issue: camera missing."));
        }

        [Test]
        public void Build_MoveWillBreak_ShowsWarning()
        {
            var hud = CreateHud(PlayerActionFailureReason.None, string.Empty, willBreak: true);

            var state = PlayerHUDModel.Build(hud, isLevelComplete: false);

            Assert.That(state.ShowWarning, Is.True);
            Assert.That(state.WarningText, Is.EqualTo("Changing W now will break the current move."));
        }

        [Test]
        public void Build_WhenLevelComplete_ShowsComplete()
        {
            var hud = CreateHud(PlayerActionFailureReason.None, string.Empty, willBreak: false);

            var state = PlayerHUDModel.Build(hud, isLevelComplete: true);

            Assert.That(state.IsComplete, Is.True);
            Assert.That(state.PrimaryText, Is.EqualTo("Level Complete!"));
            Assert.That(state.ShowHint, Is.True);
            Assert.That(state.HintText, Is.EqualTo("All levels complete! Press R to restart."));
        }

        [Test]
        public void Build_WhenLevelCompleteWithNext_ShowsNextLevelHint()
        {
            var hud = CreateHud(PlayerActionFailureReason.None, string.Empty, willBreak: false);

            var state = PlayerHUDModel.Build(hud, isLevelComplete: true, hasNextLevel: true);

            Assert.That(state.HintText, Is.EqualTo("Press N for next level. R to restart."));
        }

        [Test]
        public void Build_LevelNotPlayingFailure_ShowsRestartPrompt()
        {
            var hud = CreateHud(PlayerActionFailureReason.LevelNotPlaying, string.Empty, willBreak: false);

            var state = PlayerHUDModel.Build(hud, isLevelComplete: false);

            Assert.That(state.ShowFailure, Is.True);
            Assert.That(state.FailureText, Is.EqualTo("Level is complete. Press R to restart."));
        }

        [Test]
        public void Build_ShowsTutorialHintWhenActive()
        {
            var hud = CreateHud(PlayerActionFailureReason.None, string.Empty, willBreak: false);

            var state = PlayerHUDModel.Build(
                hud,
                isLevelComplete: false,
                showTutorial: true,
                tutorialHint: "Drag W to reveal gaps.");

            Assert.That(state.PrimaryText, Is.EqualTo("Drag W to reveal gaps."));
        }

        [Test]
        public void Build_TutorialYieldsToFailureHint()
        {
            var hud = CreateHud(PlayerActionFailureReason.NoPathAtCurrentW, "No path.", willBreak: false);

            var state = PlayerHUDModel.Build(
                hud,
                isLevelComplete: false,
                showTutorial: true,
                tutorialHint: "Drag W to reveal gaps.");

            Assert.That(state.PrimaryText, Is.EqualTo("Find a W that opens the path."));
            Assert.That(state.ShowFailure, Is.True);
        }

        private static HUDState CreateHud(
            PlayerActionFailureReason reason,
            string message,
            bool willBreak,
            RouteHint routeHint = null)
        {
            return new HUDState(
                0.55f,
                0.55f,
                new[] { 0f, 0.55f, 0.85f },
                new EdgePreview[0],
                new EdgePreview[0],
                false,
                string.Empty,
                string.Empty,
                willBreak,
                reason,
                message,
                routeHint);
        }
    }
}
