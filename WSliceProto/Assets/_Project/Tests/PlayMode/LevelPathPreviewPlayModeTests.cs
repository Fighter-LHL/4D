using System.Collections;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using WSlice.Level;

namespace WSlice.Tests.PlayMode
{
    public class LevelPathPreviewPlayModeTests
    {
        [UnitySetUp]
        public IEnumerator LoadScene()
        {
            var op = SceneManager.LoadSceneAsync("GardenGraybox", LoadSceneMode.Single);
            while (!op.isDone) yield return null;
            yield return null;
        }

        [UnityTest]
        public IEnumerator GardenGapEdge_BlockedAtLowW_OpenAtMidW()
        {
            var level = Object.FindFirstObjectByType<LevelRuntimeController>();
            var preview = Object.FindFirstObjectByType<LevelPathPreviewRenderer>();
            Assert.That(level, Is.Not.Null);
            Assert.That(preview, Is.Not.Null);

            level.WState.Force(0f);
            yield return null;

            Assert.That(preview.IsEdgeOpenAtCurrentW("Outside", "Gap"), Is.False);

            level.WState.Force(0.55f);
            yield return null;

            Assert.That(preview.IsEdgeOpenAtCurrentW("Outside", "Gap"), Is.True);
            Assert.That(preview.IsEdgeOpenAtCurrentW("Gap", "InsideGarden"), Is.True);
        }

        [UnityTest]
        public IEnumerator StairEdge_BlockedAtLowW_OpenAtHighW()
        {
            var level = Object.FindFirstObjectByType<LevelRuntimeController>();
            var preview = Object.FindFirstObjectByType<LevelPathPreviewRenderer>();
            Assert.That(level, Is.Not.Null);
            Assert.That(preview, Is.Not.Null);

            level.WState.Force(0f);
            yield return null;
            Assert.That(preview.IsEdgeOpenAtCurrentW("FlowerBase", "FlowerTop"), Is.False);

            level.WState.Force(0.85f);
            yield return null;
            Assert.That(preview.IsEdgeOpenAtCurrentW("FlowerBase", "FlowerTop"), Is.True);
        }
    }
}
