using NUnit.Framework;
using WSlice.UI;

namespace WSlice.Tests.EditMode
{
    public class LevelTutorialDismissRulesTests
    {
        [Test]
        public void ShouldDismiss_WhenMoving_ReturnsTrue()
        {
            Assert.That(
                LevelTutorialDismissRules.ShouldDismiss(
                    isMoving: true,
                    leverActivated: false,
                    initialW: 0f,
                    targetW: 0f),
                Is.True);
        }

        [Test]
        public void ShouldDismiss_WhenLeverActivated_ReturnsTrue()
        {
            Assert.That(
                LevelTutorialDismissRules.ShouldDismiss(
                    isMoving: false,
                    leverActivated: true,
                    initialW: 0f,
                    targetW: 0f),
                Is.True);
        }

        [Test]
        public void ShouldDismiss_WhenTargetWChangesEnough_ReturnsTrue()
        {
            Assert.That(
                LevelTutorialDismissRules.ShouldDismiss(
                    isMoving: false,
                    leverActivated: false,
                    initialW: 0f,
                    targetW: 0.1f),
                Is.True);
        }

        [Test]
        public void ShouldDismiss_WhenNoMeaningfulChange_ReturnsFalse()
        {
            Assert.That(
                LevelTutorialDismissRules.ShouldDismiss(
                    isMoving: false,
                    leverActivated: false,
                    initialW: 0f,
                    targetW: 0.02f),
                Is.False);
        }
    }
}
