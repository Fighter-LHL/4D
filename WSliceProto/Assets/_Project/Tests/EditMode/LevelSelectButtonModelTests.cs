using NUnit.Framework;
using WSlice.UI;

namespace WSlice.Tests.EditMode
{
    public class LevelSelectButtonModelTests
    {
        [Test]
        public void FormatButtonLabel_IncludesDisplayNameAndTheme()
        {
            string label = LevelSelectButtonModel.FormatButtonLabel("封闭花园", "Adjust W to find gaps");

            Assert.That(label, Does.Contain("封闭花园"));
            Assert.That(label, Does.Contain("Adjust W to find gaps"));
        }

        [Test]
        public void FormatButtonLabel_WithoutTheme_ReturnsDisplayNameOnly()
        {
            Assert.That(
                LevelSelectButtonModel.FormatButtonLabel("封闭花园", string.Empty),
                Is.EqualTo("封闭花园"));
        }
    }
}
