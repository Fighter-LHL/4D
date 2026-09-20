using System.Reflection;
using NUnit.Framework;
using UnityEngine;
using WSlice.UI;

namespace WSlice.Tests.EditMode
{
    public class LevelOutcomeOverlayVisibilityTests
    {
        [Test]
        public void HiddenSelfHostedPanel_StaysActiveAndCanShowTheNextOutcome()
        {
            var root = new GameObject("SelfHostedOutcomePanel");
            try
            {
                Assert.That(root.GetComponents<CanvasGroup>(), Is.Empty,
                    "The view must create visibility control for a panel without a CanvasGroup.");
                var view = root.AddComponent<LevelOutcomeOverlayView>();
                typeof(LevelOutcomeOverlayView).GetField("panelRoot", BindingFlags.Instance | BindingFlags.NonPublic)
                    .SetValue(view, root);
                var render = typeof(LevelOutcomeOverlayView).GetMethod("Render", BindingFlags.Instance | BindingFlags.NonPublic);

                render.Invoke(view, new object[]
                {
                    new LevelOutcomeOverlayState(LevelOutcomeOverlayMode.Hidden, string.Empty, false, false, false)
                });

                var visibility = root.GetComponent<CanvasGroup>();
                Assert.That(visibility != null, Is.True, "Rendering must create a live CanvasGroup.");
                Assert.That(root.activeSelf, Is.True, "Hiding the panel must not disable the view that observes completion.");
                Assert.That(visibility.alpha, Is.Zero);
                Assert.That(visibility.blocksRaycasts, Is.False, "Hidden outcomes must not swallow world clicks.");
                Assert.That(visibility.interactable, Is.False);

                render.Invoke(view, new object[]
                {
                    new LevelOutcomeOverlayState(LevelOutcomeOverlayMode.Complete, "Complete", false, true, true)
                });

                Assert.That(root.activeSelf, Is.True);
                Assert.That(visibility.alpha, Is.EqualTo(1f));
                Assert.That(visibility.blocksRaycasts, Is.True);
                Assert.That(visibility.interactable, Is.True);

                render.Invoke(view, new object[]
                {
                    new LevelOutcomeOverlayState(LevelOutcomeOverlayMode.Hidden, string.Empty, false, false, false)
                });
                Assert.That(root.activeSelf, Is.True, "Restarting must leave the view able to show another outcome.");
                Assert.That(visibility.alpha, Is.Zero);
                Assert.That(root.GetComponents<CanvasGroup>(), Has.Length.EqualTo(1),
                    "Rendering multiple outcomes must reuse the panel's CanvasGroup.");
                Assert.That(root.GetComponent<CanvasGroup>(), Is.SameAs(visibility));
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        [Test]
        public void DestroyedVisibilityComponent_IsRecreatedBeforeRenderingNextOutcome()
        {
            var root = new GameObject("RecreatedOutcomePanel", typeof(CanvasGroup));
            try
            {
                var view = root.AddComponent<LevelOutcomeOverlayView>();
                typeof(LevelOutcomeOverlayView).GetField("panelRoot", BindingFlags.Instance | BindingFlags.NonPublic)
                    .SetValue(view, root);
                var render = typeof(LevelOutcomeOverlayView).GetMethod("Render", BindingFlags.Instance | BindingFlags.NonPublic);
                render.Invoke(view, new object[]
                {
                    new LevelOutcomeOverlayState(LevelOutcomeOverlayMode.Hidden, string.Empty, false, false, false)
                });

                var previousVisibility = root.GetComponent<CanvasGroup>();
                Object.DestroyImmediate(previousVisibility);
                Assert.That(root.GetComponents<CanvasGroup>(), Is.Empty);

                render.Invoke(view, new object[]
                {
                    new LevelOutcomeOverlayState(LevelOutcomeOverlayMode.Failed, "Failed", false, true, true)
                });

                var visibility = root.GetComponent<CanvasGroup>();
                Assert.That(visibility != null, Is.True, "A destroyed cached component must be replaced.");
                Assert.That(visibility, Is.Not.SameAs(previousVisibility));
                Assert.That(root.GetComponents<CanvasGroup>(), Has.Length.EqualTo(1));
                Assert.That(root.activeSelf, Is.True);
                Assert.That(visibility.alpha, Is.EqualTo(1f));
                Assert.That(visibility.interactable, Is.True);
                Assert.That(visibility.blocksRaycasts, Is.True);
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }
    }
}
