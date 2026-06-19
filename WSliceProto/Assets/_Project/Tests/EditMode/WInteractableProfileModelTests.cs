using NUnit.Framework;
using UnityEngine;
using WSlice.Core;
using WSlice.Entities;
using WSlice.Level;

namespace WSlice.Tests.EditMode
{
    public class WInteractableProfileModelTests
    {
        [Test]
        public void BuildNotInteractiveHint_WithSliceProfile_ShowsWRange()
        {
            var sliceProfile = ScriptableObject.CreateInstance<SliceProfile>();
            sliceProfile.InteractiveRange = new WRange { Min = 0.45f, Max = 0.65f };

            var profile = new WInteractableProfile { DisplayName = "Lever" };
            string hint = WInteractableProfileModel.BuildNotInteractiveHint(profile, sliceProfile);

            Assert.That(hint, Is.EqualTo("Lever works at W 0.45-0.65."));
        }

        [Test]
        public void BuildNotInteractiveHint_WithoutSliceProfile_UsesGenericMessage()
        {
            var profile = new WInteractableProfile { DisplayName = "Lever" };

            string hint = WInteractableProfileModel.BuildNotInteractiveHint(profile, null);

            Assert.That(hint, Is.EqualTo("Lever is not interactive at this W."));
        }

        [Test]
        public void BuildNotInteractiveHint_WithoutDisplayName_UsesObjectFallback()
        {
            var sliceProfile = ScriptableObject.CreateInstance<SliceProfile>();
            sliceProfile.InteractiveRange = new WRange { Min = 0.1f, Max = 0.2f };

            string hint = WInteractableProfileModel.BuildNotInteractiveHint(new WInteractableProfile(), sliceProfile);

            Assert.That(hint, Is.EqualTo("Object works at W 0.10-0.20."));
        }
    }
}
