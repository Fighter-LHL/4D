using NUnit.Framework;
using UnityEngine;
using WSlice.Entities;

namespace WSlice.Tests.EditMode
{
    public class SlicePositionOffsetTests
    {
        [TestCase(0f)]
        [TestCase(0.55f)]
        [TestCase(1f)]
        public void DefaultProgressPreservesLegacyLinearOffset(float w)
        {
            CheckOffset(ScriptableObject.CreateInstance<SliceProfile>(), w, -2f + 2f * w);
        }

        [TestCase(false)]
        [TestCase(true)]
        public void MissingProgressPreservesLegacyLinearOffset(bool emptyCurve)
        {
            var profile = ScriptableObject.CreateInstance<SliceProfile>();
            profile.PositionOffsetProgress = emptyCurve ? new AnimationCurve() : null;
            CheckOffset(profile, 0.55f, -0.9f);
        }

        private static void CheckOffset(SliceProfile profile, float w, float expectedOffset)
        {
            var gameObject = new GameObject("slice");
            try
            {
                gameObject.transform.localPosition = new Vector3(3f, -0.2f, 0f);
                profile.PositionOffsetAtW0 = new Vector3(0f, -2f, 0f);
                profile.PositionOffsetAtW1 = Vector3.zero;
                var entity = gameObject.AddComponent<SliceEntity>();
                entity.profile = profile;
                entity.CaptureBasePose();
                entity.ApplyW(w);
                Assert.That(gameObject.transform.localPosition.y, Is.EqualTo(-0.2f + expectedOffset).Within(0.0001f));
                Assert.That(gameObject.transform.localPosition.x, Is.EqualTo(3f));
                entity.ApplyW(w);
                Assert.That(gameObject.transform.localPosition.y, Is.EqualTo(-0.2f + expectedOffset).Within(0.0001f),
                    "Repeated application must not accumulate an offset.");
            }
            finally
            {
                Object.DestroyImmediate(gameObject);
                Object.DestroyImmediate(profile);
            }
        }
    }
}
