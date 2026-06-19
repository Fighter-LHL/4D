using System.Collections;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using WSlice.Level;
using WSlice.Player;

namespace WSlice.Tests.PlayMode
{
    public class HazardGrayboxTests
    {
        [UnitySetUp]
        public IEnumerator LoadScene()
        {
            var op = SceneManager.LoadSceneAsync("HazardGraybox", LoadSceneMode.Single);
            while (!op.isDone) yield return null;
            yield return null;
        }

        [UnityTest]
        public IEnumerator PlatformStartsLoweredAtW0()
        {
            var level = Object.FindFirstObjectByType<LevelRuntimeController>();
            var platform = GameObject.Find("HazardPlatform");

            Assert.That(level, Is.Not.Null);
            Assert.That(platform, Is.Not.Null);
            Assert.That(level.WState.CurrentW, Is.EqualTo(0f).Within(0.0001f));
            Assert.That(platform.transform.localPosition.y, Is.EqualTo(-2f).Within(0.01f));
            yield return null;
        }

        [UnityTest]
        public IEnumerator WestToEastBlockedAtLowW()
        {
            var level = Object.FindFirstObjectByType<LevelRuntimeController>();
            var movement = Object.FindFirstObjectByType<MovementController>();
            var character = Object.FindFirstObjectByType<PlayerCharacter>();

            level.WState.Force(0f);
            yield return null;

            movement.RequestMove(new Vector3(6f, 0f, 0f));
            yield return WaitForMovement(movement);

            Assert.That(character.CurrentNodeId, Is.EqualTo("West"));
        }

        [UnityTest]
        public IEnumerator WestToEastOpensAtMidW()
        {
            var level = Object.FindFirstObjectByType<LevelRuntimeController>();
            var movement = Object.FindFirstObjectByType<MovementController>();
            var character = Object.FindFirstObjectByType<PlayerCharacter>();

            level.WState.Force(0.55f);
            yield return null;

            movement.RequestMove(new Vector3(6f, 0f, 0f));
            yield return WaitForMovement(movement);

            Assert.That(character.CurrentNodeId, Is.EqualTo("East"));
        }

        [UnityTest]
        public IEnumerator SegmentBreakWhileCrossingFailsSession()
        {
            var level = Object.FindFirstObjectByType<LevelRuntimeController>();
            var movement = Object.FindFirstObjectByType<MovementController>();
            var character = Object.FindFirstObjectByType<PlayerCharacter>();
            var session = Object.FindFirstObjectByType<LevelSessionController>();

            level.WState.Force(0.55f);
            yield return null;

            movement.RequestMove(new Vector3(6f, 0f, 0f));
            yield return null;

            level.WState.Force(0f);
            yield return WaitForMovement(movement);

            Assert.That(session.State, Is.EqualTo(LevelSessionState.Failed));
            Assert.That(character.CurrentNodeId, Is.EqualTo("West"));
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
