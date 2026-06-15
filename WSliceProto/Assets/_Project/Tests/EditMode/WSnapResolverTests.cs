using System.Collections.Generic;
using NUnit.Framework;
using WSlice.Core;

namespace WSlice.Tests.EditMode
{
    public class WSnapResolverTests
    {
        [Test]
        public void Resolve_WithinSnapRadius_SnapsDown()
        {
            IReadOnlyList<float> snaps = new[] { 0f, 0.35f, 0.55f, 0.8f };
            float result = WSnapResolver.Resolve(0.36f, snaps, 0.03f);
            Assert.AreEqual(0.35f, result, 0.0001f);
        }

        [Test]
        public void Resolve_OutsideSnapRadius_KeepsRaw()
        {
            IReadOnlyList<float> snaps = new[] { 0f, 0.5f };
            float result = WSnapResolver.Resolve(0.3f, snaps, 0.05f);
            Assert.AreEqual(0.3f, result, 0.0001f);
        }

        [Test]
        public void Resolve_EmptySnaps_ReturnsRaw()
        {
            IReadOnlyList<float> snaps = new float[0];
            float result = WSnapResolver.Resolve(0.5f, snaps, 0.1f);
            Assert.AreEqual(0.5f, result, 0.0001f);
        }
    }
}
