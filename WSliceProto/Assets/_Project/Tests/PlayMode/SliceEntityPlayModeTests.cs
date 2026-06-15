using System.Collections;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;
using WSlice.Core;
using WSlice.Entities;

namespace WSlice.Tests.PlayMode
{
    public class SliceEntityPlayModeTests
    {
        [UnityTest]
        public IEnumerator ApplyW_UpdatesScaleAccordingToW()
        {
            var go = new GameObject("TestSliceEntity");
            var profile = ScriptableObject.CreateInstance<SliceProfile>();
            profile.VisibilityCurve = AnimationCurve.Constant(0f, 1f, 1f);
            profile.SolidityCurve = AnimationCurve.Constant(0f, 1f, 1f);
            profile.GlowCurve = AnimationCurve.Constant(0f, 1f, 0f);
            profile.SolidRange = new WRange { Min = 0f, Max = 1f };

            var entity = go.AddComponent<SliceEntity>();
            entity.profile = profile;

            var presenter = go.AddComponent<ScalePresenter>();
            presenter.scaleAtW0 = Vector3.one;
            presenter.scaleAtW1 = Vector3.one * 2f;
            entity.presenter = presenter;

            entity.ApplyW(0.5f);
            yield return null;

            Assert.AreEqual(1.5f, go.transform.localScale.x, 0.0001f);

            Object.Destroy(go);
        }
    }
}
