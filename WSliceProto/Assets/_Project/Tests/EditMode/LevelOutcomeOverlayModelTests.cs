using NUnit.Framework;
using WSlice.Level;
using WSlice.UI;

namespace WSlice.Tests.EditMode
{
    public class LevelOutcomeOverlayModelTests
    {
        [Test]
        public void Build_WhenPlaying_ReturnsHidden()
        {
            var state = LevelOutcomeOverlayModel.Build(LevelSessionState.Playing, hasNextLevel: false);

            Assert.That(state.Mode, Is.EqualTo(LevelOutcomeOverlayMode.Hidden));
            Assert.That(state.ShowNext, Is.False);
            Assert.That(state.ShowRestart, Is.False);
            Assert.That(state.ShowLevelSelect, Is.False);
        }

        [Test]
        public void Build_WhenCompleteWithNext_ShowsNextRestartAndLevelSelect()
        {
            var state = LevelOutcomeOverlayModel.Build(LevelSessionState.Completed, hasNextLevel: true);

            Assert.That(state.Mode, Is.EqualTo(LevelOutcomeOverlayMode.Complete));
            Assert.That(state.Title, Is.EqualTo("Level Complete"));
            Assert.That(state.ShowNext, Is.True);
            Assert.That(state.ShowRestart, Is.True);
            Assert.That(state.ShowLevelSelect, Is.True);
        }

        [Test]
        public void Build_WhenCompleteWithoutNext_ShowsAllLevelsCompleteTitle()
        {
            var state = LevelOutcomeOverlayModel.Build(LevelSessionState.Completed, hasNextLevel: false);

            Assert.That(state.Mode, Is.EqualTo(LevelOutcomeOverlayMode.Complete));
            Assert.That(state.Title, Is.EqualTo("All Levels Complete"));
            Assert.That(state.ShowNext, Is.False);
            Assert.That(state.ShowRestart, Is.True);
            Assert.That(state.ShowLevelSelect, Is.True);
        }

        [Test]
        public void Build_WhenFailed_ShowsRetryAndLevelSelect()
        {
            var state = LevelOutcomeOverlayModel.Build(LevelSessionState.Failed, hasNextLevel: false);

            Assert.That(state.Mode, Is.EqualTo(LevelOutcomeOverlayMode.Failed));
            Assert.That(state.Title, Is.EqualTo("Move Interrupted"));
            Assert.That(state.ShowNext, Is.False);
            Assert.That(state.ShowRestart, Is.True);
            Assert.That(state.ShowLevelSelect, Is.True);
        }
    }
}
