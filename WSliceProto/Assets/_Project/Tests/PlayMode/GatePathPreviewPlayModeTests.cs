using System.Collections;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using WSlice.Level;

namespace WSlice.Tests.PlayMode
{
    public class GatePathPreviewPlayModeTests
    {
        [UnityTest]
        public IEnumerator LockedGateLine_OpensAfterLeverAtSameW_AndClosesAfterRestart()
        {
            var operation = SceneManager.LoadSceneAsync("GateGraybox", LoadSceneMode.Single);
            while (!operation.isDone) yield return null;
            yield return null;

            var level = Object.FindFirstObjectByType<LevelRuntimeController>();
            var preview = Object.FindFirstObjectByType<LevelPathPreviewRenderer>();
            var lever = Object.FindFirstObjectByType<GateLeverInteractable>();
            var session = Object.FindFirstObjectByType<LevelSessionController>();
            Assert.That(level?.Definition, Is.Not.Null);
            Assert.That(preview, Is.Not.Null);
            Assert.That(lever, Is.Not.Null);
            Assert.That(session, Is.Not.Null);

            const float w = 0.55f;
            level.WState.Force(w);
            yield return null;
            var line = preview.transform.Find("Path_GateRoom_Goal")?.GetComponent<LineRenderer>();
            Assert.That(line, Is.Not.Null);
            var savedEdge = level.Definition.Edges.Find(edge => edge.FromNodeId == "GateRoom" && edge.ToNodeId == "Goal");
            Assert.That(savedEdge, Is.Not.Null);
            Assert.That(savedEdge.IsLocked, Is.True);
            AssertLine(level, preview, line, false);
            Color lockedColor = line.startColor;

            int wChangeCount = 0;
            System.Action<float> onWChanged = _ => wChangeCount++;
            level.WState.OnWChanged += onWChanged;
            try
            {
                Assert.That(lever.TryInteract(w), Is.True);
                yield return null;

                Assert.That(wChangeCount, Is.Zero, "The preview must observe graph mutation without needing a W event.");
                Assert.That(level.WState.CurrentW, Is.EqualTo(w));
                Assert.That(lever.IsActivated, Is.True);
                Assert.That(savedEdge.IsLocked, Is.True, "The asset remains the locked restart source.");
                AssertLine(level, preview, line, true);

                Assert.That(session.RequestRestart(), Is.True);
                // Return to the same eligible W: the red line must represent the restored lock,
                // not merely an out-of-range initial W.
                level.WState.Force(w);
                yield return null;

                Assert.That(lever.IsActivated, Is.False);
                Assert.That(session.State, Is.EqualTo(LevelSessionState.Playing));
                AssertLine(level, preview, line, false);
                Assert.That(line.startColor, Is.EqualTo(lockedColor));
            }
            finally
            {
                level.WState.OnWChanged -= onWChanged;
            }
        }

        private static void AssertLine(LevelRuntimeController level, LevelPathPreviewRenderer preview,
            LineRenderer line, bool open)
        {
            Assert.That(level.Graph.CanMove("GateRoom", "Goal", level.WState.CurrentW), Is.EqualTo(open));
            Assert.That(preview.IsEdgeOpenAtCurrentW("GateRoom", "Goal"), Is.EqualTo(open));
            Assert.That(line.enabled, Is.True);
            Assert.That(line.positionCount, Is.EqualTo(2));
            Assert.That(line.startColor, Is.EqualTo(line.endColor));
            if (open)
                Assert.That(line.startColor.g, Is.GreaterThan(line.startColor.r), "An open route must render green.");
            else
                Assert.That(line.startColor.r, Is.GreaterThan(line.startColor.g), "A locked route must render red.");

            Vector3 from = level.Graph.GetNode("GateRoom").WorldPosition;
            Vector3 goal = level.Graph.GetNode("Goal").WorldPosition;
            Vector3 expectedEnd = open ? goal : Vector3.Lerp(from, goal, 0.5f);
            Assert.That(line.GetPosition(0).x, Is.EqualTo(from.x).Within(0.001f));
            Assert.That(line.GetPosition(1).x, Is.EqualTo(expectedEnd.x).Within(0.001f));
            Assert.That(line.GetPosition(1).z, Is.EqualTo(expectedEnd.z).Within(0.001f));
        }
    }
}
