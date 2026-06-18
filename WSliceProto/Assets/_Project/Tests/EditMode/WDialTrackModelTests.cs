using NUnit.Framework;
using WSlice.Player;
using WSlice.UI;

namespace WSlice.Tests.EditMode
{
    public class WDialTrackModelTests
    {
        [Test]
        public void Build_ReportsSnapTicksInHudOrder()
        {
            var hud = CreateHud(
                0.25f,
                0.55f,
                new[] { 0f, 0.55f, 0.85f },
                new EdgePreview[0],
                willBreak: false);

            var state = WDialTrackModel.Build(hud);

            Assert.That(state.SnapTicks.Count, Is.EqualTo(3));
            Assert.That(state.SnapTicks[0], Is.EqualTo(0f).Within(0.0001f));
            Assert.That(state.SnapTicks[1], Is.EqualTo(0.55f).Within(0.0001f));
            Assert.That(state.SnapTicks[2], Is.EqualTo(0.85f).Within(0.0001f));
        }

        [Test]
        public void Build_ReportsCurrentAndTargetW()
        {
            var hud = CreateHud(
                0.25f,
                0.55f,
                new[] { 0f, 0.55f },
                new EdgePreview[0],
                willBreak: false);

            var state = WDialTrackModel.Build(hud);

            Assert.That(state.CurrentW, Is.EqualTo(0.25f).Within(0.0001f));
            Assert.That(state.TargetW, Is.EqualTo(0.55f).Within(0.0001f));
        }

        [Test]
        public void Build_ReportsEdgeBands()
        {
            var hud = CreateHud(
                0.55f,
                0.85f,
                new[] { 0f, 0.55f, 0.85f },
                new[]
                {
                    new EdgePreview("Outside", "InsideGarden", 0.5f, 0.7f, true, false),
                    new EdgePreview("FlowerBase", "FlowerTop", 0.75f, 0.9f, false, true)
                },
                willBreak: false);

            var state = WDialTrackModel.Build(hud);

            Assert.That(state.EdgeBands.Count, Is.EqualTo(2));
            Assert.That(state.EdgeBands[0].Label, Is.EqualTo("Outside->InsideGarden"));
            Assert.That(state.EdgeBands[0].AvailableAtCurrentW, Is.True);
            Assert.That(state.EdgeBands[0].AvailableAtTargetW, Is.False);
            Assert.That(state.EdgeBands[1].AvailableAtCurrentW, Is.False);
            Assert.That(state.EdgeBands[1].AvailableAtTargetW, Is.True);
        }

        [Test]
        public void Build_CarriesDangerState()
        {
            var hud = CreateHud(
                0.55f,
                0f,
                new[] { 0f, 0.55f },
                new EdgePreview[0],
                willBreak: true);

            var state = WDialTrackModel.Build(hud);

            Assert.That(state.HasBreakRisk, Is.True);
        }

        private static HUDState CreateHud(
            float currentW,
            float targetW,
            float[] snapPoints,
            EdgePreview[] previews,
            bool willBreak)
        {
            return new HUDState(
                currentW,
                targetW,
                snapPoints,
                new EdgePreview[0],
                previews,
                false,
                string.Empty,
                string.Empty,
                willBreak,
                PlayerActionFailureReason.None,
                string.Empty);
        }
    }
}
