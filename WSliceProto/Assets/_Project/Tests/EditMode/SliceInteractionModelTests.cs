using NUnit.Framework;
using WSlice.Core;
using WSlice.Entities;

namespace WSlice.Tests.EditMode
{
    public class SliceInteractionModelTests
    {
        [Test]
        public void CanInteract_InsideInteractiveRange_ReturnsTrue()
        {
            var profile = UnityEngine.ScriptableObject.CreateInstance<SliceProfile>();
            profile.InteractiveRange = new WRange { Min = 0.45f, Max = 0.65f };

            Assert.That(SliceInteractionModel.CanInteract(profile, 0.55f), Is.True);
            Assert.That(SliceInteractionModel.CanInteract(profile, 0.45f), Is.True);
            Assert.That(SliceInteractionModel.CanInteract(profile, 0.65f), Is.True);
        }

        [Test]
        public void CanInteract_OutsideInteractiveRange_ReturnsFalse()
        {
            var profile = UnityEngine.ScriptableObject.CreateInstance<SliceProfile>();
            profile.InteractiveRange = new WRange { Min = 0.45f, Max = 0.65f };

            Assert.That(SliceInteractionModel.CanInteract(profile, 0f), Is.False);
            Assert.That(SliceInteractionModel.CanInteract(profile, 0.8f), Is.False);
        }
    }
}
