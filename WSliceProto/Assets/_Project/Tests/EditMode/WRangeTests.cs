using NUnit.Framework;
using WSlice.Core;

namespace WSlice.Tests.EditMode
{
    public class WRangeTests
    {
        [Test]
        public void Contains_Inside_ReturnsTrue()
        {
            var range = new WRange { Min = 0.3f, Max = 0.7f };
            Assert.IsTrue(range.Contains(0.5f));
        }

        [Test]
        public void Contains_OutsideLow_ReturnsFalse()
        {
            var range = new WRange { Min = 0.3f, Max = 0.7f };
            Assert.IsFalse(range.Contains(0.2f));
        }

        [Test]
        public void Contains_OutsideHigh_ReturnsFalse()
        {
            var range = new WRange { Min = 0.3f, Max = 0.7f };
            Assert.IsFalse(range.Contains(0.8f));
        }

        [Test]
        public void DistanceTo_Inside_IsZero()
        {
            var range = new WRange { Min = 0.3f, Max = 0.7f };
            Assert.AreEqual(0f, range.DistanceTo(0.5f), 0.0001f);
        }

        [Test]
        public void DistanceTo_Below_ReturnsGap()
        {
            var range = new WRange { Min = 0.3f, Max = 0.7f };
            Assert.AreEqual(0.1f, range.DistanceTo(0.2f), 0.0001f);
        }

        [Test]
        public void DistanceTo_Above_ReturnsGap()
        {
            var range = new WRange { Min = 0.3f, Max = 0.7f };
            Assert.AreEqual(0.1f, range.DistanceTo(0.8f), 0.0001f);
        }
    }
}
