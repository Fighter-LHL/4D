using System.Collections;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using NUnit.Framework;
using WSlice.Level;

namespace WSlice.Tests.PlayMode
{
    public class GardenGrayboxBehaviorTests
    {
        [UnitySetUp]
        public IEnumerator LoadScene()
        {
            var op = SceneManager.LoadSceneAsync("GardenGraybox", LoadSceneMode.Single);
            while (!op.isDone) yield return null;
            yield return null; // wait for Awake
        }

        [UnityTest]
        public IEnumerator GapSegmentAppearsAtMidW()
        {
            var level = Object.FindFirstObjectByType<LevelRuntimeController>();
            var gap = GameObject.Find("GardenWall_GapSegment");
            Assert.That(level, Is.Not.Null);
            Assert.That(gap, Is.Not.Null);

            level.WState.Force(0f);
            yield return null;
            Assert.That(gap.transform.localScale.sqrMagnitude, Is.LessThan(0.01f), "Gap should be invisible at w=0");

            // GapProfile visibility peaks around w=0.55 (SolidRange 0.50-0.70)
            level.WState.Force(0.55f);
            yield return null;
            Assert.That(gap.transform.localScale.sqrMagnitude, Is.GreaterThan(0.5f), "Gap should be visible at w=0.55");
        }

        [UnityTest]
        public IEnumerator StairAppearsAtHighW()
        {
            var level = Object.FindFirstObjectByType<LevelRuntimeController>();
            var stair = GameObject.Find("HiddenStair/Stair_1");
            Assert.That(level, Is.Not.Null);
            Assert.That(stair, Is.Not.Null);

            level.WState.Force(0f);
            yield return null;
            Assert.That(stair.transform.localScale.sqrMagnitude, Is.LessThan(0.01f), "Stair should be invisible at w=0");

            // StairProfile visibility is high around w=0.85 (SolidRange 0.75-0.90)
            level.WState.Force(0.85f);
            yield return null;
            Assert.That(stair.transform.localScale.sqrMagnitude, Is.GreaterThan(0.5f), "Stair should be visible at w=0.85");
        }

        [UnityTest]
        public IEnumerator WallRemainsVisible()
        {
            var level = Object.FindFirstObjectByType<LevelRuntimeController>();
            var wall = GameObject.Find("GardenWall_A");
            Assert.That(level, Is.Not.Null);
            Assert.That(wall, Is.Not.Null);

            level.WState.Force(0f);
            yield return null;
            Assert.That(wall.transform.localScale.sqrMagnitude, Is.GreaterThan(0.5f), "Wall should remain visible at w=0");
        }
    }
}
