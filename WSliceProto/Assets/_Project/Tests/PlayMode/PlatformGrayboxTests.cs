using System.Collections;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using UnityEngine.TestTools.Utils;
using WSlice.Entities;
using WSlice.Level;
using WSlice.Player;

namespace WSlice.Tests.PlayMode
{
    public class PlatformGrayboxBehaviorTests
    {
        [UnitySetUp]
        public IEnumerator LoadScene()
        {
            var op = SceneManager.LoadSceneAsync("PlatformGraybox", LoadSceneMode.Single);
            while (!op.isDone) yield return null;
            yield return null;
        }

        [UnityTest]
        public IEnumerator BridgeStartsLoweredAtW0()
        {
            var level = Object.FindFirstObjectByType<LevelRuntimeController>();
            var bridge = GameObject.Find("OffsetBridge");
            Assert.That(level, Is.Not.Null);
            Assert.That(bridge, Is.Not.Null);
            Assert.That(level.WState.CurrentW, Is.EqualTo(0f).Within(0.0001f));
            Assert.That(bridge.transform.localPosition.y, Is.EqualTo(-2f).Within(0.01f));
            yield return null;
        }

        [UnityTest]
        public IEnumerator BridgeRisesAtMidW()
        {
            var level = Object.FindFirstObjectByType<LevelRuntimeController>();
            var bridge = GameObject.Find("OffsetBridge");
            Assert.That(level, Is.Not.Null);
            Assert.That(bridge, Is.Not.Null);

            level.WState.Force(0.55f);
            yield return null;

            Assert.That(bridge.transform.localPosition.y, Is.EqualTo(-0.9f).Within(0.05f));
        }

        [UnityTest]
        public IEnumerator BridgeReachesBaseAtW1()
        {
            var level = Object.FindFirstObjectByType<LevelRuntimeController>();
            var bridge = GameObject.Find("OffsetBridge");
            Assert.That(level, Is.Not.Null);
            Assert.That(bridge, Is.Not.Null);

            level.WState.Force(1f);
            yield return null;

            Assert.That(bridge.transform.localPosition, Is.EqualTo(new Vector3(3f, 0f, 0f)).Using(Vector3ComparerWithEqualsOperator.Instance));
        }
    }

    public class PlatformGrayboxMovementTests
    {
        [UnitySetUp]
        public IEnumerator LoadScene()
        {
            var op = SceneManager.LoadSceneAsync("PlatformGraybox", LoadSceneMode.Single);
            while (!op.isDone) yield return null;
            yield return null;
        }

        [UnityTest]
        public IEnumerator WestToEastBlockedAtLowW()
        {
            var level = Object.FindFirstObjectByType<LevelRuntimeController>();
            var movement = Object.FindFirstObjectByType<MovementController>();
            var character = Object.FindFirstObjectByType<PlayerCharacter>();
            Assert.That(character.CurrentNodeId, Is.EqualTo("West"));

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
