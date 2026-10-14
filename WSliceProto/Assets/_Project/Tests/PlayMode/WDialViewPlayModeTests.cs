using System.Collections;
using System.Collections.Generic;
using System.Reflection;
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
            Assert.That(track.LastState.SnapTicks, Is.Empty);
            Assert.That(track.LastState.EdgeBands, Is.Empty);
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
            var playerHudText = GameObject.Find("PlayerHUDText")?.GetComponent<TMPro.TextMeshProUGUI>();
            var camera = Camera.main;

            Assert.That(level, Is.Not.Null);
            Assert.That(router, Is.Not.Null);
            Assert.That(playerHud, Is.Not.Null);
            Assert.That(playerHudText, Is.Not.Null);
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
            Assert.That(playerHud.LastState.FailureText, Is.EqualTo("That destination is unreachable in the current state."));
            Assert.That(playerHud.LastState.ShowHint, Is.False);
            Assert.That(playerHud.LastState.HintText, Is.Empty);
            Assert.That(playerHudText.text, Does.Contain("That destination is unreachable in the current state."));
            Assert.That(playerHudText.text, Does.Not.Contain("Try W"));
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
            var debug = Object.FindFirstObjectByType<DebugOverlay>();

            Assert.That(level, Is.Not.Null);
            Assert.That(movement, Is.Not.Null);
            Assert.That(character, Is.Not.Null);
            Assert.That(playerHud, Is.Not.Null);
            Assert.That(track, Is.Not.Null);
            Assert.That(debug, Is.Not.Null);

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

            debug.SetDeveloperDebugVisible(false);
            Assert.That(playerHud.LastState.ShowWarning, Is.False);
            Assert.That(track.LastState.HasBreakRisk, Is.False);

            debug.SetDeveloperDebugVisible(true);

            Assert.That(playerHud.LastState.ShowWarning, Is.True);
            Assert.That(
                playerHud.LastState.WarningText,
                Is.EqualTo("Changing W now will break the current move."));
            Assert.That(track.LastState.HasBreakRisk, Is.True);
        }

        [UnityTest]
        public IEnumerator DeveloperDebugModeRestoresAndRehidesSolutionOracles()
        {
            var level = Object.FindFirstObjectByType<LevelRuntimeController>();
            var router = Object.FindFirstObjectByType<PlayerInputRouter>();
            var debug = Object.FindFirstObjectByType<DebugOverlay>();
            var preview = Object.FindFirstObjectByType<LevelPathPreviewRenderer>();
            var playerHud = Object.FindFirstObjectByType<PlayerHUDView>();
            var track = Object.FindFirstObjectByType<WDialTrackView>();
            var session = Object.FindFirstObjectByType<LevelSessionController>();
            var character = Object.FindFirstObjectByType<PlayerCharacter>();
            var debugText = GameObject.Find("DebugText")?.GetComponent<TMPro.TextMeshProUGUI>();
            var playerHudText = GameObject.Find("PlayerHUDText")?.GetComponent<TMPro.TextMeshProUGUI>();
            var camera = Camera.main;

            Assert.That(level, Is.Not.Null);
            Assert.That(router, Is.Not.Null);
            Assert.That(debug, Is.Not.Null);
            Assert.That(preview, Is.Not.Null);
            Assert.That(playerHud, Is.Not.Null);
            Assert.That(track, Is.Not.Null);
            Assert.That(session, Is.Not.Null);
            Assert.That(character, Is.Not.Null);
            Assert.That(debugText, Is.Not.Null);
            Assert.That(playerHudText, Is.Not.Null);
            Assert.That(camera, Is.Not.Null);
            var serializedDebugField = typeof(DebugOverlay).GetField(
                "showDeveloperDebug",
                BindingFlags.Instance | BindingFlags.NonPublic);
            var cachedWStateField = typeof(DebugOverlay).GetField(
                "wState",
                BindingFlags.Instance | BindingFlags.NonPublic);
            Assert.That(serializedDebugField, Is.Not.Null);
            Assert.That(cachedWStateField, Is.Not.Null);
            Assert.That(debug.DeveloperDebugVisible, Is.False);
            Assert.That(debugText.enabled, Is.False);
            Assert.That(preview.DeveloperDebugVisible, Is.False);
            Assert.That(playerHud.DeveloperSolutionHintsVisible, Is.False);
            Assert.That(track.DeveloperSolutionOracleVisible, Is.False);
            Assert.That(track.LastState.SnapTicks, Is.Empty);
            Assert.That(track.LastState.EdgeBands, Is.Empty);

            float wBeforeToggle = level.WState.CurrentW;
            float targetWBeforeToggle = level.WState.TargetW;
            string nodeBeforeToggle = character.CurrentNodeId;
            LevelSessionState sessionBeforeToggle = session.State;
            string graphBeforeToggle = BuildGraphSnapshot(level.Graph);
            Vector3 positionBeforeToggle = character.transform.position;

            cachedWStateField.SetValue(debug, null);
            serializedDebugField.SetValue(debug, true);
            yield return null;

            Assert.That(debugText.enabled, Is.True);
            Assert.That(preview.DeveloperDebugVisible, Is.True);
            Assert.That(preview.CurrentVisuals, Is.Not.Empty);
            Assert.That(playerHud.DeveloperSolutionHintsVisible, Is.True);
            Assert.That(track.DeveloperSolutionOracleVisible, Is.True);
            Assert.That(track.LastState.SnapTicks, Is.Not.Empty);
            Assert.That(track.LastState.EdgeBands, Is.Not.Empty);
            Assert.That(level.WState.CurrentW, Is.EqualTo(wBeforeToggle));
            Assert.That(level.WState.TargetW, Is.EqualTo(targetWBeforeToggle));
            Assert.That(character.CurrentNodeId, Is.EqualTo(nodeBeforeToggle));
            Assert.That(session.State, Is.EqualTo(sessionBeforeToggle));
            Assert.That(BuildGraphSnapshot(level.Graph), Is.EqualTo(graphBeforeToggle));
            Assert.That(Vector3.Distance(character.transform.position, positionBeforeToggle), Is.LessThan(0.0001f));

            debug.enabled = false;
            Assert.That(debug.DeveloperDebugVisible, Is.False);
            Assert.That(debugText.enabled, Is.False);
            Assert.That(preview.DeveloperDebugVisible, Is.False);
            Assert.That(playerHud.DeveloperSolutionHintsVisible, Is.False);
            Assert.That(track.DeveloperSolutionOracleVisible, Is.False);
            Assert.That(track.LastState.SnapTicks, Is.Empty);
            Assert.That(track.LastState.EdgeBands, Is.Empty);
            Assert.That(level.WState.CurrentW, Is.EqualTo(wBeforeToggle));
            Assert.That(level.WState.TargetW, Is.EqualTo(targetWBeforeToggle));
            Assert.That(character.CurrentNodeId, Is.EqualTo(nodeBeforeToggle));
            Assert.That(session.State, Is.EqualTo(sessionBeforeToggle));
            Assert.That(BuildGraphSnapshot(level.Graph), Is.EqualTo(graphBeforeToggle));
            Assert.That(Vector3.Distance(character.transform.position, positionBeforeToggle), Is.LessThan(0.0001f));

            debug.SetDeveloperDebugVisible(true);
            Assert.That(debugText.enabled, Is.False);
            Assert.That(preview.DeveloperDebugVisible, Is.False);
            Assert.That(playerHud.DeveloperSolutionHintsVisible, Is.False);
            Assert.That(track.DeveloperSolutionOracleVisible, Is.False);

            debug.enabled = true;
            yield return null;

            Assert.That(debug.DeveloperDebugVisible, Is.True);
            Assert.That(debugText.enabled, Is.True);
            Assert.That(preview.DeveloperDebugVisible, Is.True);
            Assert.That(playerHud.DeveloperSolutionHintsVisible, Is.True);
            Assert.That(track.DeveloperSolutionOracleVisible, Is.True);

            level.WState.Force(0f);
            yield return null;

            router.OnTap(camera.WorldToScreenPoint(new Vector3(0f, 0f, 0f)));
            yield return null;

            Assert.That(debugText.text, Does.Contain("SnapPoints:"));
            Assert.That(debugText.text, Does.Contain("AvailableEdges:"));
            Assert.That(debugText.text, Does.Contain("MoveWillBreak:"));
            Assert.That(debugText.text, Does.Contain("LastFailure: NoPathAtCurrentW"));
            Assert.That(playerHud.LastState.ShowHint, Is.True);
            Assert.That(playerHud.LastState.HintText, Is.EqualTo("Try W 0.50-0.70 to open Outside->Gap."));
            Assert.That(playerHudText.text, Does.Contain("Try W 0.50-0.70 to open Outside->Gap."));

            float wBeforeFinalHide = level.WState.CurrentW;
            float targetWBeforeFinalHide = level.WState.TargetW;
            string nodeBeforeFinalHide = character.CurrentNodeId;
            LevelSessionState sessionBeforeFinalHide = session.State;
            string graphBeforeFinalHide = BuildGraphSnapshot(level.Graph);
            Vector3 positionBeforeFinalHide = character.transform.position;

            serializedDebugField.SetValue(debug, false);
            yield return null;

            Assert.That(debugText.enabled, Is.False);
            Assert.That(debugText.text, Is.Empty);
            Assert.That(preview.DeveloperDebugVisible, Is.False);
            Assert.That(preview.CurrentVisuals, Is.Empty);
            Assert.That(preview.transform.childCount, Is.Zero);
            Assert.That(playerHud.DeveloperSolutionHintsVisible, Is.False);
            Assert.That(track.DeveloperSolutionOracleVisible, Is.False);
            Assert.That(track.LastState.SnapTicks, Is.Empty);
            Assert.That(track.LastState.EdgeBands, Is.Empty);
            Assert.That(playerHudText.text, Does.Contain("That destination is unreachable in the current state."));
            Assert.That(playerHudText.text, Does.Not.Contain("Try W"));
            Assert.That(level.WState.CurrentW, Is.EqualTo(wBeforeFinalHide));
            Assert.That(level.WState.TargetW, Is.EqualTo(targetWBeforeFinalHide));
            Assert.That(character.CurrentNodeId, Is.EqualTo(nodeBeforeFinalHide));
            Assert.That(session.State, Is.EqualTo(sessionBeforeFinalHide));
            Assert.That(BuildGraphSnapshot(level.Graph), Is.EqualTo(graphBeforeFinalHide));
            Assert.That(Vector3.Distance(character.transform.position, positionBeforeFinalHide), Is.LessThan(0.0001f));
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
            yield return null;

            Assert.That(playerHud.LastState.IsComplete, Is.True);
            Assert.That(playerHud.LastState.PrimaryText, Is.EqualTo("Level Complete!"));
        }

        private static string BuildGraphSnapshot(LevelGraphRuntime graph)
        {
            var parts = new List<string>();
            foreach (var pair in graph.Nodes)
            {
                Vector3 position = pair.Value.WorldPosition;
                parts.Add($"N:{pair.Key}:{position.x:R}:{position.y:R}:{position.z:R}");
            }

            foreach (var edge in graph.Edges)
            {
                parts.Add(
                    $"E:{edge.FromNodeId}:{edge.ToNodeId}:"
                    + $"{edge.WalkableRange.Min:R}:{edge.WalkableRange.Max:R}:{edge.Bidirectional}");
            }

            parts.Sort();
            return string.Join("|", parts);
        }
    }
}
