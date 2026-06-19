using System.Collections;
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
