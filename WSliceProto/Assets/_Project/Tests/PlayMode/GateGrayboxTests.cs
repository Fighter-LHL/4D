using System.Collections;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using WSlice.Level;
using WSlice.Player;

namespace WSlice.Tests.PlayMode
{
    public class GateGrayboxTests
    {
        [UnitySetUp]
        public IEnumerator LoadScene()
        {
            var op = SceneManager.LoadSceneAsync("GateGraybox", LoadSceneMode.Single);
            while (!op.isDone) yield return null;
            yield return null;
        }

        [UnityTest]
        public IEnumerator GoalBlockedUntilLeverActivated()
        {
            var level = Object.FindFirstObjectByType<LevelRuntimeController>();
            var movement = Object.FindFirstObjectByType<MovementController>();
            var character = Object.FindFirstObjectByType<PlayerCharacter>();
            var lever = Object.FindFirstObjectByType<GateLeverInteractable>();

            Assert.That(level, Is.Not.Null);
            Assert.That(movement, Is.Not.Null);
            Assert.That(character, Is.Not.Null);
            Assert.That(lever, Is.Not.Null);
            Assert.That(lever.IsActivated, Is.False);
            Assert.That(level.Definition.Edges.Find(edge => edge.FromNodeId == "GateRoom" && edge.ToNodeId == "Goal").IsLocked,
                Is.True, "The saved asset must use an explicit lock, not an otherwise reachable W interval.");

            level.WState.Force(0.55f);
            yield return null;

            movement.RequestMove(new Vector3(5f, 0f, 0f));
            yield return WaitForMovement(movement);
            Assert.That(character.CurrentNodeId, Is.EqualTo("GateRoom"));

            foreach (float w in new[] { 0f, 0.3f, 0.45f, 0.55f, 0.65f, 0.99f, 1f })
            {
                level.WState.Force(w);
                yield return null;
                Assert.That(level.Graph.CanMove("GateRoom", "Goal", w), Is.False, $"Unactivated gate at W={w}");
                var result = movement.RequestMove(new Vector3(10f, 0f, 0f));
                Assert.That(result.Reason, Is.EqualTo(PlayerActionFailureReason.NoPathAtCurrentW), $"W={w}");
                Assert.That(movement.IsMoving, Is.False);
                Assert.That(character.CurrentNodeId, Is.EqualTo("GateRoom"));
                Assert.That(GameObject.Find("GateFrame").GetComponent<GraphPassageBarrier>().IsOpen, Is.False);
            }
        }

        [UnityTest]
        public IEnumerator LeverUnlocksGatePathAtMidW()
        {
            var level = Object.FindFirstObjectByType<LevelRuntimeController>();
            var movement = Object.FindFirstObjectByType<MovementController>();
            var character = Object.FindFirstObjectByType<PlayerCharacter>();
            var lever = Object.FindFirstObjectByType<GateLeverInteractable>();

            level.WState.Force(0.55f);
            yield return null;

            movement.RequestMove(new Vector3(5f, 0f, 0f));
            yield return WaitForMovement(movement);
            Assert.That(character.CurrentNodeId, Is.EqualTo("GateRoom"));

            Assert.That(lever.TryInteract(0.55f), Is.True);
            yield return null;
            Assert.That(level.Graph.CanMove("GateRoom", "Goal", 0.45f), Is.True);
            Assert.That(level.Definition.Edges.Find(edge => edge.FromNodeId == "GateRoom" && edge.ToNodeId == "Goal").IsLocked,
                Is.True, "Unlocking the runtime graph must leave the restart source locked.");

            level.WState.Force(0.45f);
            yield return null;

            movement.RequestMove(new Vector3(10f, 0f, 0f));
            yield return WaitForMovement(movement);
            Assert.That(character.CurrentNodeId, Is.EqualTo("Goal"));
        }

        [UnityTest]
        public IEnumerator LeverNotInteractiveAtLowW()
        {
            var lever = Object.FindFirstObjectByType<GateLeverInteractable>();
            var level = Object.FindFirstObjectByType<LevelRuntimeController>();

            level.WState.Force(0f);
            yield return null;

            Assert.That(lever.TryInteract(0f), Is.False);
        }

        [UnityTest]
        public IEnumerator SegmentBreakMarksSessionFailed()
        {
            var level = Object.FindFirstObjectByType<LevelRuntimeController>();
            var movement = Object.FindFirstObjectByType<MovementController>();
            var character = Object.FindFirstObjectByType<PlayerCharacter>();
            var session = Object.FindFirstObjectByType<LevelSessionController>();
            var lever = Object.FindFirstObjectByType<GateLeverInteractable>();

            level.WState.Force(0.55f);
            yield return null;
            movement.RequestMove(new Vector3(5f, 0f, 0f));
            yield return WaitForMovement(movement);
            lever.TryInteract(0.55f);
            yield return null;

            level.WState.Force(0.45f);
            yield return null;
            movement.RequestMove(new Vector3(10f, 0f, 0f));
            yield return null;

            level.WState.Force(0f);
            yield return WaitForMovement(movement);

            Assert.That(session.State, Is.EqualTo(LevelSessionState.Failed));
            Assert.That(character.CurrentNodeId, Is.EqualTo("GateRoom"));
        }

        [UnityTest]
        public IEnumerator RestartWhilePlaying_ResetsLeverAndGraph()
        {
            var level = Object.FindFirstObjectByType<LevelRuntimeController>();
            var movement = Object.FindFirstObjectByType<MovementController>();
            var character = Object.FindFirstObjectByType<PlayerCharacter>();
            var session = Object.FindFirstObjectByType<LevelSessionController>();
            var lever = Object.FindFirstObjectByType<GateLeverInteractable>();

            level.WState.Force(0.55f);
            yield return null;

            movement.RequestMove(new Vector3(5f, 0f, 0f));
            yield return WaitForMovement(movement);
            Assert.That(lever.TryInteract(0.55f), Is.True);
            yield return null;
            Assert.That(lever.IsActivated, Is.True);
            Assert.That(level.Graph.CanMove("GateRoom", "Goal", 0.55f), Is.True);

            Assert.That(session.RequestRestart(), Is.True);
            yield return null;

            Assert.That(session.State, Is.EqualTo(LevelSessionState.Playing));
            Assert.That(lever.IsActivated, Is.False);
            Assert.That(character.CurrentNodeId, Is.EqualTo("Entry"));
            Assert.That(level.WState.CurrentW, Is.EqualTo(0f).Within(0.001f));
            Assert.That(level.Graph.CanMove("GateRoom", "Goal", 0.55f), Is.False);

            // A blocked destination rejects the whole request; it does not walk a partial path.
            foreach (float w in new[] { 0.45f, 0.55f, 0.99f, 1f })
            {
                level.WState.Force(w);
                yield return null;
                Assert.That(level.Graph.CanMove("GateRoom", "Goal", w), Is.False, $"Restart must restore the gate lock at W={w}");
                var blockedFromEntry = movement.RequestMove(new Vector3(10f, 0f, 0f));
                Assert.That(blockedFromEntry.Reason, Is.EqualTo(PlayerActionFailureReason.NoPathAtCurrentW));
                Assert.That(movement.IsMoving, Is.False);
                Assert.That(character.CurrentNodeId, Is.EqualTo("Entry"));
            }

            level.WState.Force(0.55f);
            yield return null;

            Assert.That(movement.RequestMove(new Vector3(5f, 0f, 0f)).Succeeded, Is.True);
            yield return WaitForMovement(movement);
            Assert.That(character.CurrentNodeId, Is.EqualTo("GateRoom"));

            var blockedAtGate = movement.RequestMove(new Vector3(10f, 0f, 0f));
            Assert.That(blockedAtGate.Reason, Is.EqualTo(PlayerActionFailureReason.NoPathAtCurrentW));
            yield return WaitForMovement(movement);
            Assert.That(movement.IsMoving, Is.False);
            Assert.That(character.CurrentNodeId, Is.EqualTo("GateRoom"));
        }

        [UnityTest]
        public IEnumerator GroundSupportsTheWholeRoute_AndMarkersLeaveStandingRoom()
        {
            var level = Object.FindFirstObjectByType<LevelRuntimeController>();
            var ground = GameObject.Find("Ground").GetComponent<Collider>();
            var entryMarker = GameObject.Find("EntryMarker").GetComponent<Renderer>();
            var goalMarker = GameObject.Find("GoalMarker").GetComponent<Renderer>();
            Physics.SyncTransforms();

            foreach (var node in level.Definition.Nodes)
            {
                var ray = new Ray(node.WorldPosition + Vector3.up * 2f, Vector3.down);
                Assert.That(ground.Raycast(ray, out var hit, 3f), Is.True,
                    "Ground must support " + node.Id + ", including the exit.");
                Assert.That(hit.point.y, Is.EqualTo(node.WorldPosition.y).Within(0.01f));
            }
            Assert.That(entryMarker.bounds.max.y, Is.EqualTo(0f).Within(0.01f));
            Assert.That(goalMarker.bounds.max.y, Is.EqualTo(0f).Within(0.01f));
            Assert.That(goalMarker.GetComponent<Collider>().enabled, Is.False,
                "The decorative cylinder's capsule collider must not obstruct the goal.");
            yield return null;
        }

        [UnityTest]
        public IEnumerator GateBarrierTracksTraversal_AndLeverIsClickableFromTheRoom()
        {
            var level = Object.FindFirstObjectByType<LevelRuntimeController>();
            var movement = Object.FindFirstObjectByType<MovementController>();
            var character = Object.FindFirstObjectByType<PlayerCharacter>();
            var lever = Object.FindFirstObjectByType<GateLeverInteractable>();
            var session = Object.FindFirstObjectByType<LevelSessionController>();
            var gate = GameObject.Find("GateFrame");
            var barrier = gate.GetComponent<GraphPassageBarrier>();
            var gateRenderer = gate.GetComponent<Renderer>();
            var gateCollider = gate.GetComponent<Collider>();
            Assert.That(barrier, Is.Not.Null);

            level.WState.Force(0.55f);
            yield return null;
            Assert.That(barrier.IsOpen, Is.False);
            Assert.That(gateRenderer.enabled, Is.True);
            Assert.That(gateCollider.enabled, Is.True);
            Assert.That(gateCollider.bounds.min.x, Is.GreaterThan(5f),
                "The closed gate must leave the room and lever accessible.");
            Assert.That(gateCollider.bounds.max.x, Is.LessThan(10f));

            Assert.That(movement.RequestMove(new Vector3(5f, 0f, 0f)).Succeeded, Is.True);
            yield return WaitForMovement(movement);
            Assert.That(character.CurrentNodeId, Is.EqualTo("GateRoom"));
            Physics.SyncTransforms();
            var camera = GameObject.Find("Main Camera").GetComponent<Camera>();
            var leverCenter = lever.GetComponent<Collider>().bounds.center;
            var ray = new Ray(camera.transform.position, leverCenter - camera.transform.position);
            Assert.That(Physics.Raycast(ray, out var leverHit, 30f), Is.True);
            Assert.That(leverHit.collider.GetComponent<GateLeverInteractable>(), Is.SameAs(lever),
                "The room's player and wall must not intercept a click on the lever.");

            Assert.That(lever.TryInteract(level.WState.CurrentW), Is.True);
            yield return null;
            Assert.That(level.Graph.CanMove("GateRoom", "Goal", level.WState.CurrentW), Is.True);
            Assert.That(barrier.IsOpen, Is.True);
            Assert.That(gateRenderer.enabled, Is.False);
            Assert.That(gateCollider.enabled, Is.False);

            level.WState.Force(0.8f);
            yield return null;
            Assert.That(level.Graph.CanMove("GateRoom", "Goal", level.WState.CurrentW), Is.False);
            Assert.That(barrier.IsOpen, Is.False);
            Assert.That(gateRenderer.enabled, Is.True);
            Assert.That(gateCollider.enabled, Is.True);

            level.WState.Force(0.45f);
            yield return null;
            Assert.That(barrier.IsOpen, Is.True);
            Assert.That(gateRenderer.enabled, Is.False);
            Assert.That(gateCollider.enabled, Is.False);

            Assert.That(session.RequestRestart(), Is.True);
            yield return null;
            Assert.That(lever.IsActivated, Is.False);
            Assert.That(barrier.IsOpen, Is.False);
            Assert.That(gateRenderer.enabled, Is.True);
            Assert.That(gateCollider.enabled, Is.True);
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
