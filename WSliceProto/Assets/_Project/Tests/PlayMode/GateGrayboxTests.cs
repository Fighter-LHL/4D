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

            level.WState.Force(0.55f);
            yield return null;

            movement.RequestMove(new Vector3(5f, 0f, 0f));
            yield return WaitForMovement(movement);
            Assert.That(character.CurrentNodeId, Is.EqualTo("GateRoom"));

            movement.RequestMove(new Vector3(10f, 0f, 0f));
            yield return WaitForMovement(movement);
            Assert.That(character.CurrentNodeId, Is.EqualTo("GateRoom"));
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

            Assert.That(session.RequestRestart(), Is.True);
            yield return null;

            Assert.That(session.State, Is.EqualTo(LevelSessionState.Playing));
            Assert.That(lever.IsActivated, Is.False);
            Assert.That(character.CurrentNodeId, Is.EqualTo("Entry"));
            Assert.That(level.WState.CurrentW, Is.EqualTo(0f).Within(0.001f));

            level.WState.Force(0.55f);
            yield return null;
            movement.RequestMove(new Vector3(10f, 0f, 0f));
            yield return WaitForMovement(movement);
            Assert.That(character.CurrentNodeId, Is.EqualTo("GateRoom"));
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
