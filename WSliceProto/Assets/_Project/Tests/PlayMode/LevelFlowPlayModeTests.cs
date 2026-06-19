using System.Collections;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using WSlice.Level;

namespace WSlice.Tests.PlayMode
{
    public class LevelFlowPlayModeTests
    {
        [UnityTest]
        public IEnumerator GardenScene_HasNextLevelInCatalog()
        {
            var op = SceneManager.LoadSceneAsync("GardenGraybox", LoadSceneMode.Single);
            while (!op.isDone) yield return null;
            yield return null;

            var flow = Object.FindFirstObjectByType<LevelFlowController>();
            Assert.That(flow, Is.Not.Null);
            Assert.That(flow.HasNextLevelInCatalog, Is.True);
        }

        [UnityTest]
        public IEnumerator PlatformScene_HasNextLevelInCatalog()
        {
            var op = SceneManager.LoadSceneAsync("PlatformGraybox", LoadSceneMode.Single);
            while (!op.isDone) yield return null;
            yield return null;

            var flow = Object.FindFirstObjectByType<LevelFlowController>();
            Assert.That(flow, Is.Not.Null);
            Assert.That(flow.HasNextLevelInCatalog, Is.True);
        }

        [UnityTest]
        public IEnumerator GateScene_HasNextLevelInCatalog()
        {
            var op = SceneManager.LoadSceneAsync("GateGraybox", LoadSceneMode.Single);
            while (!op.isDone) yield return null;
            yield return null;

            var flow = Object.FindFirstObjectByType<LevelFlowController>();
            Assert.That(flow, Is.Not.Null);
            Assert.That(flow.HasNextLevelInCatalog, Is.True);
        }

        [UnityTest]
        public IEnumerator ChambersScene_HasNextLevelInCatalog()
        {
            var op = SceneManager.LoadSceneAsync("ChambersGraybox", LoadSceneMode.Single);
            while (!op.isDone) yield return null;
            yield return null;

            var flow = Object.FindFirstObjectByType<LevelFlowController>();
            Assert.That(flow, Is.Not.Null);
            Assert.That(flow.HasNextLevelInCatalog, Is.True);
        }

        [UnityTest]
        public IEnumerator HazardScene_IsLastLevelInCatalog()
        {
            var op = SceneManager.LoadSceneAsync("HazardGraybox", LoadSceneMode.Single);
            while (!op.isDone) yield return null;
            yield return null;

            var flow = Object.FindFirstObjectByType<LevelFlowController>();
            Assert.That(flow, Is.Not.Null);
            Assert.That(flow.HasNextLevelInCatalog, Is.False);
        }
    }
}
