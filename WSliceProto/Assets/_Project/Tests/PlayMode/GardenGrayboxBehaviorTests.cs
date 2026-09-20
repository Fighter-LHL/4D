using System.Collections;
using System.Linq;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using UnityEngine.TestTools.Utils;
using NUnit.Framework;
using WSlice.Level;
using WSlice.UI;

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
        public IEnumerator InitialWIsAppliedWhenSceneLoads()
        {
            var level = Object.FindFirstObjectByType<LevelRuntimeController>();
            var gap = GameObject.Find("GardenWall_GapSegment");
            var stair = GameObject.Find("HiddenStair/Stair_1");
            var wall = GameObject.Find("GardenWall_A");

            Assert.That(level, Is.Not.Null);
            Assert.That(gap, Is.Not.Null);
            Assert.That(stair, Is.Not.Null);
            Assert.That(wall, Is.Not.Null);
            Assert.That(level.WState.CurrentW, Is.EqualTo(0f).Within(0.0001f));
            Assert.That(gap.GetComponent<Renderer>().enabled, Is.True);
            Assert.That(gap.GetComponent<Collider>().enabled, Is.True);
            Assert.That(stair.transform.localScale.sqrMagnitude, Is.LessThan(0.01f));
            Assert.That(wall.transform.localScale, Is.EqualTo(new Vector3(1.5f, 2f, 0.5f)).Using(Vector3ComparerWithEqualsOperator.Instance));
            var flower = GameObject.Find("Flower");
            Assert.That(flower, Is.Not.Null);
            Assert.That(flower.GetComponent<Renderer>().bounds.size.y, Is.LessThanOrEqualTo(0.05f),
                "The goal marker must not swallow the player on the vertical legacy route.");
            var flowerCollider = flower.GetComponent<BoxCollider>();
            Assert.That(flowerCollider, Is.Not.Null);
            Assert.That(flower.GetComponent<CapsuleCollider>(), Is.Null);
            Physics.SyncTransforms();
            Vector3 goal = level.Graph.GetNode("FlowerTop").WorldPosition;
            Assert.That(flowerCollider.Raycast(new Ray(goal + Vector3.up, Vector3.down), out var hit, 2f), Is.True,
                "The elevated goal marker must remain clickable.");
            Assert.That(hit.point.y, Is.EqualTo(goal.y).Within(0.03f));
            yield return null;
        }

        [UnityTest]
        public IEnumerator WallPreservesDesignedScaleAcrossWChanges()
        {
            var level = Object.FindFirstObjectByType<LevelRuntimeController>();
            var wall = GameObject.Find("GardenWall_A");

            Assert.That(level, Is.Not.Null);
            Assert.That(wall, Is.Not.Null);

            level.WState.Force(0.55f);
            yield return null;

            Assert.That(wall.transform.localScale, Is.EqualTo(new Vector3(1.5f, 2f, 0.5f)).Using(Vector3ComparerWithEqualsOperator.Instance));
        }

        [UnityTest]
        public IEnumerator EntranceOpensOnlyWithItsGraphEdge_AndDoesNotEncloseLandingNodes()
        {
            var level = Object.FindFirstObjectByType<LevelRuntimeController>();
            var gap = GameObject.Find("GardenWall_GapSegment");
            Assert.That(level, Is.Not.Null);
            Assert.That(gap, Is.Not.Null);
            var walls = new[] { gap, GameObject.Find("GardenWall_A"), GameObject.Find("GardenWall_B") };
            Assert.That(walls.All(wall => wall != null), Is.True);
            var wallColliders = walls.Select(wall => wall.GetComponent<Collider>()).ToArray();
            Assert.That(wallColliders.All(collider => collider != null), Is.True);

            foreach (float w in new[] { 0f, 0.499f, 0.5f, 0.55f, 0.7f, 0.701f, 1f })
            {
                level.WState.Force(w);
                yield return null;
                Physics.SyncTransforms();
                bool open = level.Graph.CanMove("Outside", "Gap", w);
                Assert.That(gap.GetComponent<GraphPassageBarrier>(), Is.Not.Null);
                Assert.That(gap.GetComponent<Renderer>().enabled, Is.EqualTo(!open), $"W={w}");
                Assert.That(gap.GetComponent<Collider>().enabled, Is.EqualTo(!open), $"W={w}");

                Vector3 start = level.Graph.GetNode("Outside").WorldPosition + Vector3.up * 0.6f;
                Vector3 end = level.Graph.GetNode("Gap").WorldPosition + Vector3.up * 0.6f;
                var hits = Physics.SphereCastAll(start, 0.2f, (end - start).normalized, Vector3.Distance(start, end));
                Assert.That(hits.Any(hit => wallColliders.Contains(hit.collider)), Is.EqualTo(!open),
                    $"The visible entrance must block exactly when its graph edge is closed, W={w}.");

                foreach (string nodeId in new[] { "Outside", "Gap", "InsideGarden", "FlowerBase" })
                {
                    Vector3 body = level.Graph.GetNode(nodeId).WorldPosition + Vector3.up * 0.6f;
                    Assert.That(wallColliders.Any(collider => collider.enabled && collider.bounds.Contains(body)), Is.False,
                        $"A wall encloses the safe landing {nodeId}, W={w}.");
                }
                // The original solid wall occupied both InsideGarden and the route to the flower.
                start = level.Graph.GetNode("Gap").WorldPosition + Vector3.up * 0.6f;
                end = level.Graph.GetNode("InsideGarden").WorldPosition + Vector3.up * 0.6f;
                hits = Physics.SphereCastAll(start, 0.2f, (end - start).normalized, Vector3.Distance(start, end));
                Assert.That(hits.Any(hit => wallColliders.Contains(hit.collider)), Is.False);
            }
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
        public IEnumerator RampAndLandingSupportTheGraphAtEveryOpenBoundary()
        {
            var level = Object.FindFirstObjectByType<LevelRuntimeController>();
            var ramp = GameObject.Find("HiddenStair/Stair_1");
            var landing = GameObject.Find("FlowerLanding");
            Assert.That(ramp, Is.Not.Null);
            Assert.That(landing, Is.Not.Null);
            var rampCollider = ramp.GetComponent<Collider>();
            var landingCollider = landing.GetComponent<Collider>();
            var supports = new[] { rampCollider, landingCollider, GameObject.Find("Ground").GetComponent<Collider>() };
            Vector3 start = level.Graph.GetNode("FlowerBase").WorldPosition;
            Vector3 end = level.Graph.GetNode("FlowerTop").WorldPosition;
            Assert.That(Vector3.ProjectOnPlane(end - start, Vector3.up).magnitude, Is.GreaterThan(1f),
                "The ascent must follow a supported slope rather than a vertical airborne segment.");

            foreach (float w in new[] { 0f, 0.749f, 0.75f, 0.76f, 0.8f, 0.85f, 0.9f, 0.901f, 1f })
            {
                level.WState.Force(w);
                yield return null;
                Physics.SyncTransforms();
                bool open = level.Graph.CanMove("FlowerBase", "FlowerTop", w);
                Assert.That(rampCollider.enabled, Is.EqualTo(open), $"W={w}");
                Assert.That(landingCollider.enabled, Is.True);
                Assert.That(landing.GetComponent<Renderer>().enabled, Is.True);
                Assert.That(landingCollider.Raycast(new Ray(end + Vector3.up * 0.3f, Vector3.down), out var landingHit, 0.6f), Is.True,
                    $"The destination must retain support even with the ramp closed, W={w}.");
                Assert.That(landingHit.point.y, Is.EqualTo(end.y).Within(0.005f));
                if (!open) continue;

                Assert.That(ramp.GetComponent<Renderer>().enabled, Is.True);
                for (int sample = 0; sample <= 30; sample++)
                {
                    Vector3 feet = Vector3.Lerp(start, end, sample / 30f);
                    var hits = Physics.RaycastAll(feet + Vector3.up * 0.3f, Vector3.down, 0.6f);
                    Assert.That(hits.Any(hit => supports.Contains(hit.collider) && Mathf.Abs(hit.point.y - feet.y) < 0.005f), Is.True,
                        $"Ascent lacks visible geometric support at sample {sample}, W={w}.");
                    var bodyHits = Physics.OverlapSphere(feet + Vector3.up * 0.6f, 0.18f);
                    Assert.That(bodyHits.Any(hit => hit == rampCollider || hit == landingCollider), Is.False,
                        $"The standing body intersects the ascent geometry at sample {sample}, W={w}.");
                }
            }
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

        [UnityTest]
        public IEnumerator TutorialHintShowsUntilWChanges()
        {
            var hud = Object.FindFirstObjectByType<PlayerHUDView>();
            var level = Object.FindFirstObjectByType<LevelRuntimeController>();

            Assert.That(hud, Is.Not.Null);
            Assert.That(level, Is.Not.Null);
            yield return null;

            Assert.That(hud.LastState.PrimaryText, Does.Contain("gap and ramp"));

            level.WState.SetTarget(0.55f);
            yield return null;
            yield return null;

            Assert.That(hud.LastState.PrimaryText, Is.EqualTo("Find a W that opens the path."));
        }
    }
}
