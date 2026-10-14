using System.Collections;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using WSlice.Level;
using WSlice.UI;

namespace WSlice.Tests.PlayMode
{
    public class LevelPathPreviewPlayModeTests
    {
        [UnitySetUp]
        public IEnumerator LoadScene()
        {
            var op = SceneManager.LoadSceneAsync("GardenGraybox", LoadSceneMode.Single);
            while (!op.isDone) yield return null;
            yield return null;
        }

        [UnityTest]
        public IEnumerator LegacyGrayboxes_DefaultToPlayerModeAndDebugRoundTripsWithoutGameplayMutation()
        {
            string[][] cases =
            {
                new[] { "GardenGraybox", "Drag W. Tap the ground to move." },
                new[] { "PlatformGraybox", "Drag W. Tap the ground to move." },
                new[] { "GateGraybox", "Drag W. Tap objects to interact or the ground to move." },
                new[] { "ChambersGraybox", "Drag W. Tap the ground to move." },
                new[] { "HazardGraybox", "Drag W. Tap the ground to move." }
            };

            foreach (string[] item in cases)
            {
                string sceneName = item[0];
                string expectedTutorial = item[1];
                var op = SceneManager.LoadSceneAsync(sceneName, LoadSceneMode.Single);
                while (!op.isDone) yield return null;
                yield return null;

                var debug = Object.FindFirstObjectByType<DebugOverlay>();
                var preview = Object.FindFirstObjectByType<LevelPathPreviewRenderer>();
                var playerHud = Object.FindFirstObjectByType<PlayerHUDView>();
                var track = Object.FindFirstObjectByType<WDialTrackView>();
                var level = Object.FindFirstObjectByType<LevelRuntimeController>();
                var session = Object.FindFirstObjectByType<LevelSessionController>();
                var character = Object.FindFirstObjectByType<WSlice.Player.PlayerCharacter>();
                var debugText = GameObject.Find("DebugText")?.GetComponent<TMPro.TextMeshProUGUI>();

                Assert.That(debug, Is.Not.Null, $"{sceneName}: DebugOverlay missing");
                Assert.That(preview, Is.Not.Null, $"{sceneName}: PathPreview missing");
                Assert.That(playerHud, Is.Not.Null, $"{sceneName}: PlayerHUD missing");
                Assert.That(track, Is.Not.Null, $"{sceneName}: WDialTrack missing");
                Assert.That(level, Is.Not.Null, $"{sceneName}: LevelRuntime missing");
                Assert.That(session, Is.Not.Null, $"{sceneName}: LevelSession missing");
                Assert.That(character, Is.Not.Null, $"{sceneName}: PlayerCharacter missing");
                Assert.That(debugText, Is.Not.Null, $"{sceneName}: DebugText missing");
                Assert.That(level.Definition, Is.Not.Null, $"{sceneName}: LevelDefinition missing");
                Assert.That(level.Definition.TutorialHint, Is.EqualTo(expectedTutorial), sceneName);
                Assert.That(playerHud.LastState.PrimaryText, Is.EqualTo(expectedTutorial), sceneName);
                Assert.That(debug.DeveloperDebugVisible, Is.False, sceneName);
                Assert.That(debugText.enabled, Is.False, sceneName);
                Assert.That(preview.DeveloperDebugVisible, Is.False, sceneName);
                Assert.That(preview.CurrentVisuals, Is.Empty, sceneName);
                Assert.That(preview.transform.childCount, Is.Zero, sceneName);
                Assert.That(playerHud.DeveloperSolutionHintsVisible, Is.False, sceneName);
                Assert.That(track.DeveloperSolutionOracleVisible, Is.False, sceneName);
                Assert.That(track.LastState.SnapTicks, Is.Empty, sceneName);
                Assert.That(track.LastState.EdgeBands, Is.Empty, sceneName);

                Assert.That(FindDescendant(track.transform, "CurrentMarker"), Is.Not.Null, sceneName);
                Assert.That(FindDescendant(track.transform, "TargetMarker"), Is.Not.Null, sceneName);
                Assert.That(CountActiveDescendants(track.transform, "SnapTick_"), Is.Zero, sceneName);
                Assert.That(CountActiveDescendants(track.transform, "EdgeBand_"), Is.Zero, sceneName);

                float currentWBefore = level.WState.CurrentW;
                float targetWBefore = level.WState.TargetW;
                string nodeBefore = character.CurrentNodeId;
                Vector3 positionBefore = character.transform.position;
                LevelSessionState sessionBefore = session.State;
                LevelGraphRuntime graphBefore = level.Graph;
                int nodeCountBefore = level.Graph.Nodes.Count;
                int edgeCountBefore = level.Graph.Edges.Count;

                debug.SetDeveloperDebugVisible(true);
                yield return null;

                Assert.That(debug.DeveloperDebugVisible, Is.True, sceneName);
                Assert.That(debugText.enabled, Is.True, sceneName);
                Assert.That(debugText.text, Is.Not.Empty, sceneName);
                Assert.That(preview.DeveloperDebugVisible, Is.True, sceneName);
                Assert.That(preview.CurrentVisuals, Is.Not.Empty, sceneName);
                Assert.That(preview.transform.childCount, Is.GreaterThan(0), sceneName);
                Assert.That(playerHud.DeveloperSolutionHintsVisible, Is.True, sceneName);
                Assert.That(track.DeveloperSolutionOracleVisible, Is.True, sceneName);
                Assert.That(track.LastState.SnapTicks, Is.Not.Empty, sceneName);
                Assert.That(track.LastState.EdgeBands, Is.Not.Empty, sceneName);
                Assert.That(CountActiveDescendants(track.transform, "SnapTick_"), Is.GreaterThan(0), sceneName);
                Assert.That(CountActiveDescendants(track.transform, "EdgeBand_"), Is.GreaterThan(0), sceneName);

                debug.SetDeveloperDebugVisible(false);
                yield return null;

                Assert.That(debug.DeveloperDebugVisible, Is.False, sceneName);
                Assert.That(debugText.enabled, Is.False, sceneName);
                Assert.That(debugText.text, Is.Empty, sceneName);
                Assert.That(preview.DeveloperDebugVisible, Is.False, sceneName);
                Assert.That(preview.CurrentVisuals, Is.Empty, sceneName);
                Assert.That(preview.transform.childCount, Is.Zero, sceneName);
                Assert.That(playerHud.DeveloperSolutionHintsVisible, Is.False, sceneName);
                Assert.That(track.DeveloperSolutionOracleVisible, Is.False, sceneName);
                Assert.That(track.LastState.SnapTicks, Is.Empty, sceneName);
                Assert.That(track.LastState.EdgeBands, Is.Empty, sceneName);
                Assert.That(CountActiveDescendants(track.transform, "SnapTick_"), Is.Zero, sceneName);
                Assert.That(CountActiveDescendants(track.transform, "EdgeBand_"), Is.Zero, sceneName);
                Assert.That(FindDescendant(track.transform, "CurrentMarker").activeInHierarchy, Is.True, sceneName);
                Assert.That(FindDescendant(track.transform, "TargetMarker").activeInHierarchy, Is.True, sceneName);

                Assert.That(level.WState.CurrentW, Is.EqualTo(currentWBefore), sceneName);
                Assert.That(level.WState.TargetW, Is.EqualTo(targetWBefore), sceneName);
                Assert.That(character.CurrentNodeId, Is.EqualTo(nodeBefore), sceneName);
                Assert.That(Vector3.Distance(character.transform.position, positionBefore), Is.LessThan(0.0001f), sceneName);
                Assert.That(session.State, Is.EqualTo(sessionBefore), sceneName);
                Assert.That(level.Graph, Is.SameAs(graphBefore), sceneName);
                Assert.That(level.Graph.Nodes.Count, Is.EqualTo(nodeCountBefore), sceneName);
                Assert.That(level.Graph.Edges.Count, Is.EqualTo(edgeCountBefore), sceneName);
            }
        }

        private static GameObject FindDescendant(Transform root, string objectName)
        {
            foreach (var child in root.GetComponentsInChildren<Transform>(includeInactive: true))
            {
                if (child.gameObject.name == objectName)
                    return child.gameObject;
            }

            return null;
        }

        private static int CountActiveDescendants(Transform root, string namePrefix)
        {
            int count = 0;
            foreach (var child in root.GetComponentsInChildren<Transform>(includeInactive: true))
            {
                if (child != root
                    && child.gameObject.name.StartsWith(namePrefix)
                    && child.gameObject.activeInHierarchy)
                {
                    count++;
                }
            }

            return count;
        }

        [UnityTest]
        public IEnumerator GardenGapEdge_PlayerDefaultHidden_DeveloperDebugTracksW()
        {
            var level = Object.FindFirstObjectByType<LevelRuntimeController>();
            var preview = Object.FindFirstObjectByType<LevelPathPreviewRenderer>();
            var debug = Object.FindFirstObjectByType<DebugOverlay>();
            Assert.That(level, Is.Not.Null);
            Assert.That(preview, Is.Not.Null);
            Assert.That(debug, Is.Not.Null);
            Assert.That(preview.DeveloperDebugVisible, Is.False);
            Assert.That(preview.CurrentVisuals, Is.Empty);
            Assert.That(preview.transform.childCount, Is.Zero);

            debug.SetDeveloperDebugVisible(true);
            yield return null;

            Assert.That(preview.DeveloperDebugVisible, Is.True);
            Assert.That(preview.CurrentVisuals, Is.Not.Empty);

            level.WState.Force(0f);
            yield return null;

            Assert.That(preview.IsEdgeOpenAtCurrentW("Outside", "Gap"), Is.False);

            level.WState.Force(0.55f);
            yield return null;

            Assert.That(preview.IsEdgeOpenAtCurrentW("Outside", "Gap"), Is.True);
            Assert.That(preview.IsEdgeOpenAtCurrentW("Gap", "InsideGarden"), Is.True);
        }

        [UnityTest]
        public IEnumerator StairEdge_DeveloperDebugTracksW()
        {
            var level = Object.FindFirstObjectByType<LevelRuntimeController>();
            var preview = Object.FindFirstObjectByType<LevelPathPreviewRenderer>();
            var debug = Object.FindFirstObjectByType<DebugOverlay>();
            Assert.That(level, Is.Not.Null);
            Assert.That(preview, Is.Not.Null);
            Assert.That(debug, Is.Not.Null);

            debug.SetDeveloperDebugVisible(true);
            yield return null;

            level.WState.Force(0f);
            yield return null;
            Assert.That(preview.IsEdgeOpenAtCurrentW("FlowerBase", "FlowerTop"), Is.False);

            level.WState.Force(0.85f);
            yield return null;
            Assert.That(preview.IsEdgeOpenAtCurrentW("FlowerBase", "FlowerTop"), Is.True);
        }
    }
}
