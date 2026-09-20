using System.Collections;
using System.Linq;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using WSlice.Level;
using WSlice.Player;

namespace WSlice.Tests.PlayMode
{
    public class ChambersGrayboxTests
    {
        [UnitySetUp]
        public IEnumerator LoadScene()
        {
            var op = SceneManager.LoadSceneAsync("ChambersGraybox", LoadSceneMode.Single);
            while (!op.isDone) yield return null;
            yield return null;
        }

        [UnityTest]
        public IEnumerator MidWBlocksFirstCorridorFromLobby()
        {
            var level = Object.FindFirstObjectByType<LevelRuntimeController>();
            var movement = Object.FindFirstObjectByType<MovementController>();
            var character = Object.FindFirstObjectByType<PlayerCharacter>();

            Assert.That(character.CurrentNodeId, Is.EqualTo("Lobby"));

            level.WState.Force(0.55f);
            yield return null;

            movement.RequestMove(new Vector3(4f, 0f, 0f));
            yield return WaitForMovement(movement);

            Assert.That(character.CurrentNodeId, Is.EqualTo("Lobby"));
        }

        [UnityTest]
        public IEnumerator WSequenceOpensRoomsInOrder()
        {
            var level = Object.FindFirstObjectByType<LevelRuntimeController>();
            var movement = Object.FindFirstObjectByType<MovementController>();
            var character = Object.FindFirstObjectByType<PlayerCharacter>();

            level.WState.Force(0.2f);
            yield return null;
            movement.RequestMove(new Vector3(4f, 0f, 0f));
            yield return WaitForMovement(movement);
            Assert.That(character.CurrentNodeId, Is.EqualTo("ChamberA"));

            level.WState.Force(0.55f);
            yield return null;
            movement.RequestMove(new Vector3(8f, 0f, 0f));
            yield return WaitForMovement(movement);
            Assert.That(character.CurrentNodeId, Is.EqualTo("ChamberB"));

            level.WState.Force(0.55f);
            yield return null;
            movement.RequestMove(new Vector3(12f, 0f, 0f));
            yield return WaitForMovement(movement);
            Assert.That(character.CurrentNodeId, Is.EqualTo("ChamberB"));

            level.WState.Force(0.8f);
            yield return null;
            movement.RequestMove(new Vector3(12f, 0f, 0f));
            yield return WaitForMovement(movement);
            Assert.That(character.CurrentNodeId, Is.EqualTo("Goal"));
        }

        [UnityTest]
        public IEnumerator DividersMatchGraphVisibilityAndPhysicalPassages()
        {
            var level = Object.FindFirstObjectByType<LevelRuntimeController>();
            var names = new[] { "Divider_LobbyA", "Divider_AB", "Divider_BGoal" };
            var nodes = new[] { "Lobby", "ChamberA", "ChamberB", "Goal" };
            foreach (float w in new[] { 0f, 0.2f, 0.35f, 0.55f, 0.65f, 0.8f, 1f })
            {
                level.WState.Force(w);
                yield return null;
                Physics.SyncTransforms();
                for (int i = 0; i < names.Length; i++)
                {
                    var wall = GameObject.Find(names[i]);
                    Assert.That(wall, Is.Not.Null);
                    Assert.That(wall.GetComponent<GraphPassageBarrier>(), Is.Not.Null);
                    var collider = wall.GetComponent<Collider>();
                    bool open = level.Graph.CanMove(nodes[i], nodes[i + 1], w);
                    Assert.That(wall.GetComponent<Renderer>().enabled, Is.EqualTo(!open), $"{names[i]}, W={w}");
                    Assert.That(collider.enabled, Is.EqualTo(!open), $"{names[i]}, W={w}");
                    Vector3 start = level.Graph.GetNode(nodes[i]).WorldPosition + Vector3.up * 0.6f;
                    Vector3 end = level.Graph.GetNode(nodes[i + 1]).WorldPosition + Vector3.up * 0.6f;
                    var hits = Physics.SphereCastAll(start, 0.2f, (end - start).normalized, Vector3.Distance(start, end));
                    Assert.That(hits.Any(hit => hit.collider == collider), Is.EqualTo(!open),
                        $"The player route must not cross a visible solid divider: {names[i]}, W={w}.");
                }
            }

            var markers = new[] { "LobbyMarker", "ChamberAMarker", "ChamberBMarker", "GoalMarker" };
            var ground = GameObject.Find("Ground").GetComponent<Collider>();
            for (int i = 0; i < markers.Length; i++)
            {
                var marker = GameObject.Find(markers[i]);
                Assert.That(marker, Is.Not.Null);
                Assert.That(marker.GetComponent<Renderer>().enabled, Is.True);
                Assert.That(marker.GetComponent<Renderer>().bounds.max.y, Is.LessThanOrEqualTo(0.05f),
                    "A landing marker must not hide the standing player inside a solid block.");
                Assert.That(marker.GetComponent<Collider>().bounds.max.y, Is.LessThanOrEqualTo(0.05f),
                    "A thin marker must not retain an invisible capsule collider above its surface.");
                Vector3 node = level.Graph.GetNode(nodes[i]).WorldPosition;
                Assert.That(ground.Raycast(new Ray(node + Vector3.up, Vector3.down), out var hit, 2f), Is.True,
                    $"Ground must support the landing {nodes[i]}.");
                Assert.That(hit.point.y, Is.EqualTo(node.y).Within(0.01f));
            }
        }

        private static IEnumerator WaitForMovement(MovementController movement, float timeoutSeconds = 5f)
        {
            float elapsed = 0f;
            while (movement.IsMoving && elapsed < timeoutSeconds)
            {
                elapsed += Time.deltaTime;
                yield return null;
            }
        }
    }
}
