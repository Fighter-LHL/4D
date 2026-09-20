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
            var session = Object.FindFirstObjectByType<LevelSessionController>();

            level.WState.Force(0.55f);
            yield return null;

            movement.RequestMove(new Vector3(0f, 0f, 0f));
            yield return null;

            level.WState.Force(0f);
            yield return WaitForMovement(movement);

            Assert.That(character.CurrentNodeId, Is.EqualTo("Outside"));
            Assert.That(Vector3.Distance(character.transform.position, level.Graph.GetNode("Outside").WorldPosition), Is.LessThan(0.001f));
            Assert.That(movement.IsMoving, Is.False);
            Assert.That(session.State, Is.EqualTo(LevelSessionState.Playing));
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
            var session = Object.FindFirstObjectByType<LevelSessionController>();

            character.CurrentNodeId = "FlowerBase";
            character.transform.position = level.Graph.GetNode("FlowerBase").WorldPosition;

            level.WState.Force(0.85f);
            yield return null;

            movement.RequestMove(level.Graph.GetNode("FlowerTop").WorldPosition);
            yield return WaitForMovement(movement);

            Assert.That(character.CurrentNodeId, Is.EqualTo("FlowerTop"));
            Assert.That(Vector3.Distance(character.transform.position, level.Graph.GetNode("FlowerTop").WorldPosition), Is.LessThan(0.001f));
            Assert.That(session.State, Is.EqualTo(LevelSessionState.Completed));
        }

        [UnityTest]
        public IEnumerator ClickedRampRouteRecoversAtItsFootThenCompletes()
        {
            var level = Object.FindFirstObjectByType<LevelRuntimeController>();
            var movement = Object.FindFirstObjectByType<MovementController>();
            var character = Object.FindFirstObjectByType<PlayerCharacter>();
            var session = Object.FindFirstObjectByType<LevelSessionController>();
            var router = Object.FindFirstObjectByType<PlayerInputRouter>();
            var camera = Camera.main;
            Assert.That(camera, Is.Not.Null);

            level.WState.Force(0.55f);
            yield return null;
            Physics.SyncTransforms();
            var insideTap = camera.WorldToScreenPoint(level.Graph.GetNode("InsideGarden").WorldPosition);
            Assert.That(router.OnTap(insideTap).Succeeded, Is.True);
            yield return WaitForMovement(movement);
            Assert.That(character.CurrentNodeId, Is.EqualTo("InsideGarden"));

            level.WState.Force(0.8f);
            yield return null;
            var flowerCollider = GameObject.Find("Flower").GetComponent<Collider>();
            Physics.SyncTransforms();
            var goalTap = camera.WorldToScreenPoint(flowerCollider.bounds.center);
            Assert.That(Physics.Raycast(camera.ScreenPointToRay(goalTap), out var hit, 100f), Is.True);
            Assert.That(hit.collider, Is.SameAs(flowerCollider), "The elevated goal must be reachable by a real camera ray.");
            Assert.That(router.OnTap(goalTap).Succeeded, Is.True);
            Assert.That(movement.LastTargetNodeId, Is.EqualTo("FlowerTop"));

            float elapsed = 0f;
            while (elapsed < 3f && !(movement.ActiveSegmentFromId == "FlowerBase"
                && character.transform.position.y > 0.2f))
            {
                elapsed += Time.deltaTime;
                yield return null;
            }
            Assert.That(movement.ActiveSegmentFromId, Is.EqualTo("FlowerBase"));
            Assert.That(character.transform.position.y, Is.GreaterThan(0.2f));
            level.WState.Force(0f);
            yield return null;
            Assert.That(movement.IsMoving, Is.False);
            Assert.That(session.State, Is.EqualTo(LevelSessionState.Playing));
            Assert.That(character.CurrentNodeId, Is.EqualTo("FlowerBase"));
            Assert.That(Vector3.Distance(character.transform.position, level.Graph.GetNode("FlowerBase").WorldPosition), Is.LessThan(0.001f));

            // Recover through the same screen target without restarting the session.
            level.WState.Force(0.8f);
            yield return null;
            Physics.SyncTransforms();
            Assert.That(router.OnTap(goalTap).Succeeded, Is.True);
            yield return WaitForMovement(movement);
            Assert.That(character.CurrentNodeId, Is.EqualTo("FlowerTop"));
            Assert.That(session.State, Is.EqualTo(LevelSessionState.Completed));
            Assert.That(Vector3.Distance(character.transform.position, level.Graph.GetNode("FlowerTop").WorldPosition), Is.LessThan(0.001f));
        }

        [UnityTest]
        public IEnumerator SessionCompletesWhenPlayerReachesGoal()
        {
            var session = Object.FindFirstObjectByType<LevelSessionController>();
            var character = Object.FindFirstObjectByType<PlayerCharacter>();
            Assert.That(session, Is.Not.Null);
            Assert.That(session.State, Is.EqualTo(LevelSessionState.Playing));

            character.CurrentNodeId = "FlowerTop";
            yield return null;

            Assert.That(session.State, Is.EqualTo(LevelSessionState.Completed));
        }

        [UnityTest]
        public IEnumerator DebugOverlayShowsCompleteWhenSessionCompleted()
        {
            var session = Object.FindFirstObjectByType<LevelSessionController>();
            var character = Object.FindFirstObjectByType<PlayerCharacter>();
            var debugText = GameObject.Find("DebugText")?.GetComponent<TextMeshProUGUI>();
            Assert.That(session, Is.Not.Null);
            Assert.That(character, Is.Not.Null);
            Assert.That(debugText, Is.Not.Null);

            character.CurrentNodeId = "FlowerTop";
            yield return null;
            yield return null;

            Assert.That(session.State, Is.EqualTo(LevelSessionState.Completed));
            Assert.That(debugText.text, Does.Contain("Level Complete!"));
        }

        [UnityTest]
        public IEnumerator ObjectiveReached_FiresWhenSessionCompletes()
        {
            var session = Object.FindFirstObjectByType<LevelSessionController>();
            var character = Object.FindFirstObjectByType<PlayerCharacter>();
            bool objectiveReached = false;
            session.ObjectiveReached += () => objectiveReached = true;

            character.CurrentNodeId = "FlowerTop";
            yield return null;

            Assert.That(objectiveReached, Is.True);
            Assert.That(session.State, Is.EqualTo(LevelSessionState.Completed));
        }

        [UnityTest]
        public IEnumerator CompletedLevel_BlocksGameplayInput()
        {
            var session = Object.FindFirstObjectByType<LevelSessionController>();
            var character = Object.FindFirstObjectByType<PlayerCharacter>();
            var router = Object.FindFirstObjectByType<PlayerInputRouter>();

            character.CurrentNodeId = "FlowerTop";
            yield return null;
            Assert.That(session.State, Is.EqualTo(LevelSessionState.Completed));

            var tapResult = router.OnTap(new Vector2(Screen.width * 0.5f, Screen.height * 0.5f));
            Assert.That(tapResult.Succeeded, Is.False);
            Assert.That(tapResult.Reason, Is.EqualTo(PlayerActionFailureReason.LevelNotPlaying));

            var dialResult = router.SetWDial(0.5f);
            Assert.That(dialResult.Succeeded, Is.False);
            Assert.That(dialResult.Reason, Is.EqualTo(PlayerActionFailureReason.LevelNotPlaying));
        }

        [UnityTest]
        public IEnumerator RestartAfterComplete_ReturnsToStartNodeAndInitialW()
        {
            var level = Object.FindFirstObjectByType<LevelRuntimeController>();
            var session = Object.FindFirstObjectByType<LevelSessionController>();
            var character = Object.FindFirstObjectByType<PlayerCharacter>();

            level.WState.Force(0.85f);
            character.CurrentNodeId = "FlowerTop";
            character.transform.position = level.Graph.GetNode("FlowerTop").WorldPosition;
            yield return null;
            Assert.That(session.State, Is.EqualTo(LevelSessionState.Completed));

            Assert.That(session.RequestRestart(), Is.True);
            yield return null;

            Assert.That(session.State, Is.EqualTo(LevelSessionState.Playing));
            Assert.That(character.CurrentNodeId, Is.EqualTo("Outside"));
            Assert.That(level.WState.CurrentW, Is.EqualTo(0f).Within(0.001f));
            Assert.That(level.WState.TargetW, Is.EqualTo(0f).Within(0.001f));
            Assert.That(
                Vector3.Distance(character.transform.position, level.Graph.GetNode("Outside").WorldPosition),
                Is.LessThan(0.001f));
        }

        [UnityTest]
        public IEnumerator RestartWhilePlaying_StopsMovementAndResetsStart()
        {
            var level = Object.FindFirstObjectByType<LevelRuntimeController>();
            var session = Object.FindFirstObjectByType<LevelSessionController>();
            var movement = Object.FindFirstObjectByType<MovementController>();
            var character = Object.FindFirstObjectByType<PlayerCharacter>();
            var router = Object.FindFirstObjectByType<PlayerInputRouter>();

            level.WState.Force(0.55f);
            yield return null;

            movement.RequestMove(level.Graph.GetNode("InsideGarden").WorldPosition);
            yield return null;
            Assert.That(movement.IsMoving, Is.True);
            Assert.That(session.State, Is.EqualTo(LevelSessionState.Playing));

            Assert.That(session.RequestRestart(), Is.True);
            yield return null;

            Assert.That(session.State, Is.EqualTo(LevelSessionState.Playing));
            Assert.That(movement.IsMoving, Is.False);
            Assert.That(character.CurrentNodeId, Is.EqualTo("Outside"));
            Assert.That(level.WState.CurrentW, Is.EqualTo(0f).Within(0.001f));
            Assert.That(router.LastActionResult.Reason, Is.EqualTo(PlayerActionFailureReason.None));
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
