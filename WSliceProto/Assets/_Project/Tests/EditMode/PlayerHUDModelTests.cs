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

            var state = PlayerHUDModel.Build(hud, "Outside", "FlowerTop");

            Assert.That(state.PrimaryText, Is.EqualTo("Find a W that opens the path."));
            Assert.That(state.ShowFailure, Is.False);
            Assert.That(state.ShowWarning, Is.False);
            Assert.That(state.IsComplete, Is.False);
        }

        [Test]
        public void Build_NoPathFailure_ExplainsDialCanOpenPath()
        {
            var hud = CreateHud(PlayerActionFailureReason.NoPathAtCurrentW, "No path is available at current W.", willBreak: false);

            var state = PlayerHUDModel.Build(hud, "Outside", "FlowerTop");

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

            var state = PlayerHUDModel.Build(hud, "Outside", "FlowerTop");

            Assert.That(state.ShowFailure, Is.True);
            Assert.That(state.FailureText, Is.EqualTo("No path at this W."));
            Assert.That(state.ShowHint, Is.True);
            Assert.That(state.HintText, Is.EqualTo("Try W 0.50-0.70 to open Outside->Gap."));
        }

        [Test]
        public void Build_MissingCamera_UsesTechnicalFailureText()
        {
            var hud = CreateHud(PlayerActionFailureReason.MissingCamera, "Camera is not available.", willBreak: false);

            var state = PlayerHUDModel.Build(hud, "Outside", "FlowerTop");

            Assert.That(state.ShowFailure, Is.True);
            Assert.That(state.FailureText, Is.EqualTo("Input setup issue: camera missing."));
        }

        [Test]
        public void Build_MoveWillBreak_ShowsWarning()
        {
            var hud = CreateHud(PlayerActionFailureReason.None, string.Empty, willBreak: true);

            var state = PlayerHUDModel.Build(hud, "Outside", "FlowerTop");

            Assert.That(state.ShowWarning, Is.True);
            Assert.That(state.WarningText, Is.EqualTo("Changing W now will break the current move."));
        }

        [Test]
        public void Build_AtGoal_ShowsComplete()
        {
            var hud = CreateHud(PlayerActionFailureReason.None, string.Empty, willBreak: false);

            var state = PlayerHUDModel.Build(hud, "FlowerTop", "FlowerTop");

            Assert.That(state.IsComplete, Is.True);
            Assert.That(state.PrimaryText, Is.EqualTo("Level Complete!"));
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
