using NUnit.Framework;
using WSlice.Core;

namespace WSlice.Tests.EditMode
{
    public class WConditionTests
    {
        [Test]
        public void Evaluate_InsideActiveRange_ReturnsTrue()
        {
            var condition = new WCondition
            {
                ActiveRange = new WRange { Min = 0.3f, Max = 0.7f },
                Invert = false
            };
            Assert.IsTrue(condition.Evaluate(0.5f));
        }

        [Test]
        public void Evaluate_InvertedInside_ReturnsFalse()
        {
            var condition = new WCondition
            {
                ActiveRange = new WRange { Min = 0.3f, Max = 0.7f },
                Invert = true
            };
            Assert.IsFalse(condition.Evaluate(0.5f));
        }
    }
}
