using System.Collections;
using NUnit.Framework;
using TMPro;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using WSlice.Level;
using WSlice.Player;

namespace WSlice.Tests.PlayMode
{
    public class GardenGrayboxMovementTests
    {
        [UnitySetUp]
        public IEnumerator LoadScene()
        {
            var op = SceneManager.LoadSceneAsync("GardenGraybox", LoadSceneMode.Single);
            while (!op.isDone) yield return null;
            yield return null;
        }

        [UnityTest]
        public IEnumerator GapPathOpensAtMidW()
        {
            var level = Object.FindFirstObjectByType<LevelRuntimeController>();
            var movement = Object.FindFirstObjectByType<MovementController>();
            var character = Object.FindFirstObjectByType<PlayerCharacter>();
            Assert.That(level, Is.Not.Null);
            Assert.That(movement, Is.Not.Null);
            Assert.That(character, Is.Not.Null);
            Assert.That(character.CurrentNodeId, Is.EqualTo("Outside"));

            level.WState.Force(0.55f);
            yield return null;

            movement.RequestMove(new Vector3(0f, 0f, 0f));
            yield return WaitForMovement(movement);

            Assert.That(character.CurrentNodeId, Is.EqualTo("InsideGarden"));
        }

        [UnityTest]
        public IEnumerator GapPathBlockedAtLowW()
        {
            var level = Object.FindFirstObjectByType<LevelRuntimeController>();
            var movement = Object.FindFirstObjectByType<MovementController>();
            var character = Object.FindFirstObjectByType<PlayerCharacter>();

            level.WState.Force(0f);
            yield return null;

            movement.RequestMove(new Vector3(0f, 0f, 0f));
            yield return WaitForMovement(movement);

            Assert.That(character.CurrentNodeId, Is.EqualTo("Outside"));
        }

        [UnityTest]
        public IEnumerator MovingCharacterKeepsCurrentNodeUntilSegmentArrives()
        {
            var level = Object.FindFirstObjectByType<LevelRuntimeController>();
            var movement = Object.FindFirstObjectByType<MovementController>();
            var character = Object.FindFirstObjectByType<PlayerCharacter>();

            level.WState.Force(0.55f);
            yield return null;

            movement.RequestMove(new Vector3(0f, 0f, 0f));
            yield return null;

            Assert.That(movement.IsMoving, Is.True);
            Assert.That(character.CurrentNodeId, Is.EqualTo("Outside"));
        }

        [UnityTest]
        public IEnumerator MovingCharacterStopsWhenCurrentEdgeCloses()
        {
            var level = Object.FindFirstObjectByType<LevelRuntimeController>();
            var movement = Object.FindFirstObjectByType<MovementController>();
            var character = Object.FindFirstObjectByType<PlayerCharacter>();

            level.WState.Force(0.55f);
            yield return null;

            movement.RequestMove(new Vector3(0f, 0f, 0f));
            yield return null;

            level.WState.Force(0f);
            yield return WaitForMovement(movement);

            Assert.That(character.CurrentNodeId, Is.EqualTo("Outside"));
            Assert.That(Vector3.Distance(character.transform.position, level.Graph.GetNode("Outside").WorldPosition), Is.LessThan(0.001f));
        }

        [UnityTest]
        public IEnumerator MovingCharacterContinuesWhenCurrentEdgeRemainsOpen()
        {
            var level = Object.FindFirstObjectByType<LevelRuntimeController>();
            var movement = Object.FindFirstObjectByType<MovementController>();
            var character = Object.FindFirstObjectByType<PlayerCharacter>();

            level.WState.Force(0.55f);
            yield return null;

            movement.RequestMove(new Vector3(0f, 0f, 0f));
            yield return null;

            level.WState.Force(0.56f);
            yield return WaitForMovement(movement);

            Assert.That(character.CurrentNodeId, Is.EqualTo("InsideGarden"));
        }

        [UnityTest]
        public IEnumerator StairPathOpensAtHighW()
        {
            var level = Object.FindFirstObjectByType<LevelRuntimeController>();
            var movement = Object.FindFirstObjectByType<MovementController>();
            var character = Object.FindFirstObjectByType<PlayerCharacter>();

            character.CurrentNodeId = "FlowerBase";
            character.transform.position = new Vector3(2f, 0f, 0f);

            level.WState.Force(0.85f);
            yield return null;

            movement.RequestMove(new Vector3(2f, 1.5f, 0f));
            yield return WaitForMovement(movement);

            Assert.That(character.CurrentNodeId, Is.EqualTo("FlowerTop"));
            Assert.That(Vector3.Distance(character.transform.position, level.Graph.GetNode("FlowerTop").WorldPosition), Is.LessThan(0.001f));
        }

        [UnityTest]
        public IEnumerator DebugOverlayShowsCompleteAtFlowerTop()
        {
            var character = Object.FindFirstObjectByType<PlayerCharacter>();
            var debugText = GameObject.Find("DebugText")?.GetComponent<TextMeshProUGUI>();
            Assert.That(character, Is.Not.Null);
            Assert.That(debugText, Is.Not.Null);

            character.CurrentNodeId = "FlowerTop";
            yield return null;
            yield return null;

            Assert.That(debugText.text, Does.Contain("Level Complete!"));
        }

        private static IEnumerator WaitForMovement(MovementController movement, float timeoutSeconds = 5f)
        {
            float elapsed = 0f;
            while (movement.IsMoving && elapsed < timeoutSeconds)
            {
                elapsed += Time.deltaTime;
                yield return null;
            }
            yield return null;
        }
    }
}
