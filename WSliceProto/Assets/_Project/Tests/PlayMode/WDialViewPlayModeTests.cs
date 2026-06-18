using System.Collections;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.UI;
using UnityEngine.TestTools;
using WSlice.Level;
using WSlice.Player;
using WSlice.UI;

namespace WSlice.Tests.PlayMode
{
    public class WDialViewPlayModeTests
    {
        [UnitySetUp]
        public IEnumerator LoadScene()
        {
            var op = SceneManager.LoadSceneAsync("GardenGraybox", LoadSceneMode.Single);
            while (!op.isDone) yield return null;
            yield return null;
        }

        [UnityTest]
        public IEnumerator SliderInputUsesLevelSnapPoints()
        {
            var level = Object.FindFirstObjectByType<LevelRuntimeController>();
            var dial = Object.FindFirstObjectByType<WDialView>();
            var slider = Object.FindFirstObjectByType<Slider>();
            var track = Object.FindFirstObjectByType<WDialTrackView>();

            Assert.That(level, Is.Not.Null);
            Assert.That(dial, Is.Not.Null);
            Assert.That(slider, Is.Not.Null);
            Assert.That(track, Is.Not.Null);

            slider.value = 0.54f;
            yield return null;

            Assert.That(level.WState.TargetW, Is.EqualTo(0.55f).Within(0.0001f));
            var hudState = WDialModel.Build(
                level,
                Object.FindFirstObjectByType<MovementController>(),
                Object.FindFirstObjectByType<PlayerInputRouter>(),
                Object.FindFirstObjectByType<PlayerCharacter>());
            Assert.That(hudState.TargetW, Is.EqualTo(0.55f).Within(0.0001f));
            Assert.That(track.LastState.TargetW, Is.EqualTo(0.55f).Within(0.0001f));
            Assert.That(track.LastState.SnapTicks[1], Is.EqualTo(0.55f).Within(0.0001f));
        }

        [UnityTest]
        public IEnumerator SliderResyncsAfterDisableEnable()
        {
            var level = Object.FindFirstObjectByType<LevelRuntimeController>();
            var dial = Object.FindFirstObjectByType<WDialView>();
            var slider = Object.FindFirstObjectByType<Slider>();

            Assert.That(level, Is.Not.Null);
            Assert.That(dial, Is.Not.Null);
            Assert.That(slider, Is.Not.Null);

            dial.gameObject.SetActive(false);
            level.WState.Force(0.55f);
            yield return null;

            dial.gameObject.SetActive(true);
            yield return null;

            Assert.That(slider.value, Is.EqualTo(0.55f).Within(0.0001f));
        }

        [UnityTest]
        public IEnumerator LowWTapRecordsNoPathFailure()
        {
            var level = Object.FindFirstObjectByType<LevelRuntimeController>();
            var router = Object.FindFirstObjectByType<PlayerInputRouter>();
            var playerHud = Object.FindFirstObjectByType<PlayerHUDView>();
            var camera = Camera.main;

            Assert.That(level, Is.Not.Null);
            Assert.That(router, Is.Not.Null);
            Assert.That(playerHud, Is.Not.Null);
            Assert.That(camera, Is.Not.Null);

            level.WState.Force(0f);
            yield return null;

            var result = router.OnTap(camera.WorldToScreenPoint(new Vector3(0f, 0f, 0f)));
            yield return null;

            Assert.That(result.Succeeded, Is.False);
            Assert.That(result.Reason, Is.EqualTo(PlayerActionFailureReason.NoPathAtCurrentW));
            Assert.That(router.LastActionResult.Reason, Is.EqualTo(PlayerActionFailureReason.NoPathAtCurrentW));
            var hudState = WDialModel.Build(
                level,
                Object.FindFirstObjectByType<MovementController>(),
                router,
                Object.FindFirstObjectByType<PlayerCharacter>());
            Assert.That(hudState.LastFailureReason, Is.EqualTo(PlayerActionFailureReason.NoPathAtCurrentW));
            Assert.That(hudState.HasRouteHint, Is.True);
            Assert.That(hudState.RouteHint.FromNodeId, Is.EqualTo("Outside"));
            Assert.That(hudState.RouteHint.ToNodeId, Is.EqualTo("Gap"));
            Assert.That(playerHud.LastState.ShowFailure, Is.True);
            Assert.That(playerHud.LastState.FailureText, Is.EqualTo("No path at this W."));
            Assert.That(playerHud.LastState.ShowHint, Is.True);
            Assert.That(playerHud.LastState.HintText, Is.EqualTo("Try W 0.50-0.70 to open Outside->Gap."));
        }

        [UnityTest]
        public IEnumerator MovingTargetWThatClosesCurrentEdgeIsFlagged()
        {
            var level = Object.FindFirstObjectByType<LevelRuntimeController>();
            var movement = Object.FindFirstObjectByType<MovementController>();
            var router = Object.FindFirstObjectByType<PlayerInputRouter>();
            var character = Object.FindFirstObjectByType<PlayerCharacter>();
            var playerHud = Object.FindFirstObjectByType<PlayerHUDView>();
            var track = Object.FindFirstObjectByType<WDialTrackView>();

            Assert.That(level, Is.Not.Null);
            Assert.That(movement, Is.Not.Null);
            Assert.That(character, Is.Not.Null);
            Assert.That(playerHud, Is.Not.Null);
            Assert.That(track, Is.Not.Null);

            level.WState.Force(0.55f);
            yield return null;

            var result = movement.RequestMove(new Vector3(0f, 0f, 0f));
            Assert.That(result.Succeeded, Is.True);
            Assert.That(movement.IsMoving, Is.True);

            level.WState.SetTarget(0f);
            var hudState = WDialModel.Build(level, movement, router, character);

            Assert.That(hudState.ActiveSegmentFromId, Is.Not.Empty);
            Assert.That(hudState.ActiveSegmentToId, Is.Not.Empty);
            Assert.That(hudState.ActiveMoveWillBreakAtTargetW, Is.True);
            yield return null;
            Assert.That(playerHud.LastState.ShowWarning, Is.True);
            Assert.That(track.LastState.HasBreakRisk, Is.True);
        }

        [UnityTest]
        public IEnumerator DebugOverlayShowsHudStateFieldsAndFailures()
        {
            var level = Object.FindFirstObjectByType<LevelRuntimeController>();
            var router = Object.FindFirstObjectByType<PlayerInputRouter>();
            var debugText = GameObject.Find("DebugText")?.GetComponent<TMPro.TextMeshProUGUI>();
            var camera = Camera.main;

            Assert.That(level, Is.Not.Null);
            Assert.That(router, Is.Not.Null);
            Assert.That(debugText, Is.Not.Null);
            Assert.That(camera, Is.Not.Null);

            level.WState.Force(0f);
            yield return null;

            router.OnTap(camera.WorldToScreenPoint(new Vector3(0f, 0f, 0f)));
            yield return null;

            Assert.That(debugText.text, Does.Contain("SnapPoints:"));
            Assert.That(debugText.text, Does.Contain("AvailableEdges:"));
            Assert.That(debugText.text, Does.Contain("MoveWillBreak:"));
            Assert.That(debugText.text, Does.Contain("LastFailure: NoPathAtCurrentW"));
        }

        [UnityTest]
        public IEnumerator PlayerHudShowsCompleteAtGoal()
        {
            var character = Object.FindFirstObjectByType<PlayerCharacter>();
            var playerHud = Object.FindFirstObjectByType<PlayerHUDView>();

            Assert.That(character, Is.Not.Null);
            Assert.That(playerHud, Is.Not.Null);

            character.CurrentNodeId = "FlowerTop";
            yield return null;

            Assert.That(playerHud.LastState.IsComplete, Is.True);
            Assert.That(playerHud.LastState.PrimaryText, Is.EqualTo("Level Complete!"));
        }
    }
}
