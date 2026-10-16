using System.Collections;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using WSlice.Level;
using WSlice.Player;

namespace WSlice.Tests.PlayMode
{
    public class LegacyGrayboxPresentationPlayModeTests
    {
        [UnityTest]
        public IEnumerator LegacyPlayersStandAboveTheirGraphRootsWithoutBlockingClicks()
        {
            foreach (var scene in new[] { "GardenGraybox", "PlatformGraybox", "GateGraybox", "ChambersGraybox", "HazardGraybox" })
            {
                yield return LoadScene(scene);
                var level = Object.FindFirstObjectByType<LevelRuntimeController>();
                var character = Object.FindFirstObjectByType<PlayerCharacter>();
                Assert.That(level.Definition, Is.Not.Null, scene);
                var start = level.Graph.GetNode(level.Definition.StartNodeId).WorldPosition;
                Assert.That(Vector3.Distance(character.transform.position, start), Is.LessThan(0.001f), scene);
                var renderers = character.GetComponentsInChildren<Renderer>();
                Assert.That(renderers, Has.Length.EqualTo(1), scene);
                Assert.That(renderers[0].enabled, Is.True, scene);
                Assert.That(renderers[0].transform.parent, Is.EqualTo(character.transform), scene);
                Assert.That(renderers[0].bounds.min.y, Is.EqualTo(start.y).Within(0.001f), scene);
                Assert.That(renderers[0].bounds.size.y, Is.GreaterThan(1f), scene);
                Assert.That(character.GetComponentsInChildren<Collider>(true), Is.Empty,
                    scene + ": the navigation body must not intercept ground or lever clicks.");
                Physics.SyncTransforms();
                Assert.That(Physics.Raycast(start + Vector3.up * 0.5f, Vector3.down, out var hit, 0.75f), Is.True, scene);
                Assert.That(hit.point.y, Is.EqualTo(start.y).Within(0.025f), scene + ": start must have a matching support surface.");
            }
        }

        [UnityTest]
        public IEnumerator PlatformBridgeSupportsTheEntireOpenGraphEdge()
        {
            yield return CheckBridge("PlatformGraybox", "OffsetBridge");
        }

        [UnityTest]
        public IEnumerator HazardPlatformSupportsTheEntireOpenGraphEdge()
        {
            yield return CheckBridge("HazardGraybox", "HazardPlatform");
        }

        private static IEnumerator CheckBridge(string scene, string bridgeName)
        {
            yield return LoadScene(scene);
            var level = Object.FindFirstObjectByType<LevelRuntimeController>();
            var bridge = GameObject.Find(bridgeName);
            Assert.That(level.Graph, Is.Not.Null);
            Assert.That(bridge, Is.Not.Null);
            var collider = bridge.GetComponent<Collider>();
            var renderer = bridge.GetComponent<Renderer>();
            var west = GameObject.Find("WestPillar").GetComponent<Collider>();
            var east = GameObject.Find("EastPillar").GetComponent<Collider>();

            foreach (float w in new[] { 0f, 0.44f, 0.45f, 0.5f, 0.55f, 0.6f, 0.65f, 0.66f, 1f })
            {
                level.WState.Force(w);
                yield return null;
                Physics.SyncTransforms();
                bool open = level.Graph.CanMove("West", "East", w);
                Assert.That(collider.enabled, Is.EqualTo(open), $"{scene} W={w}: geometry and graph disagree.");
                Assert.That(west.bounds.max.y, Is.EqualTo(0f).Within(0.001f));
                Assert.That(east.bounds.max.y, Is.EqualTo(0f).Within(0.001f));
                Assert.That(renderer.enabled && renderer.gameObject.activeInHierarchy, Is.True);
                if (!open)
                {
                    Assert.That(renderer.bounds.max.y, Is.LessThan(-0.001f), $"{scene} W={w}: closed route still looks connected.");
                    Assert.That(Physics.Raycast(new Vector3(3f, 0.5f, 0f), Vector3.down, 0.75f), Is.False,
                        "A closed crossing must not have an alternative ground plane at the graph height.");
                    continue;
                }

                Assert.That(renderer.bounds.max.y, Is.EqualTo(0f).Within(0.001f));
                Assert.That(collider.bounds.max.y, Is.EqualTo(0f).Within(0.001f));
                Assert.That(collider.bounds.min.x, Is.LessThanOrEqualTo(west.bounds.max.x + 0.001f));
                Assert.That(collider.bounds.max.x, Is.GreaterThanOrEqualTo(east.bounds.min.x - 0.001f));
                for (int sample = 0; sample <= 30; sample++)
                {
                    float x = sample * 0.2f;
                    Assert.That(Physics.Raycast(new Vector3(x, 0.5f, 0f), Vector3.down, out var hit, 0.75f), Is.True,
                        $"{scene} W={w}, x={x}: gap in the walkable graph edge.");
                    Assert.That(hit.point.y, Is.EqualTo(0f).Within(0.001f), $"{scene} W={w}, x={x}");
                }
            }
        }

        private static IEnumerator LoadScene(string name)
        {
            var operation = SceneManager.LoadSceneAsync(name, LoadSceneMode.Single);
            while (!operation.isDone) yield return null;
            yield return null;
        }
    }
}
