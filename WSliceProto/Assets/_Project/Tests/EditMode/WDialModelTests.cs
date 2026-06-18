using System.Reflection;
using NUnit.Framework;
using UnityEngine;
using WSlice.Core;
using WSlice.Level;
using WSlice.Player;
using WSlice.UI;

namespace WSlice.Tests.EditMode
{
    public class WDialModelTests
    {
        [Test]
        public void WDialModel_BuildsCurrentAndTargetW()
        {
            var wState = new WState();
            wState.Force(0.25f);
            wState.SetTarget(0.75f);

            var state = WDialModel.Build(wState, CreateThreeNodeDef(), null, null, null, null);

            Assert.That(state.CurrentW, Is.EqualTo(0.25f).Within(0.0001f));
            Assert.That(state.TargetW, Is.EqualTo(0.75f).Within(0.0001f));
        }

        [Test]
        public void WDialModel_ReportsSnapPoints()
        {
            var def = CreateThreeNodeDef();
            def.SnapPoints.Add(0.8f);
            def.SnapPoints.Add(0.2f);
            def.SnapPoints.Add(0.5f);

            var state = WDialModel.Build(new WState(), def, null, null, null, null);

            Assert.That(state.SnapPoints, Is.EqualTo(new[] { 0.2f, 0.5f, 0.8f }).Within(0.0001f));
        }

        [Test]
        public void WDialModel_ReportsAvailableEdgesAtCurrentW()
        {
            var def = CreateThreeNodeDef();
            var wState = new WState();
            wState.Force(0.58f);

            var state = WDialModel.Build(wState, def, new LevelGraphRuntime(def), null, null, null);

            Assert.That(state.AvailableEdges.Count, Is.EqualTo(2));
            Assert.That(state.AvailableEdges[0].FromNodeId, Is.EqualTo("A"));
            Assert.That(state.AvailableEdges[0].ToNodeId, Is.EqualTo("B"));
            Assert.That(state.AvailableEdges[0].AvailableAtCurrentW, Is.True);
            Assert.That(state.AvailableEdges[0].AvailableAtTargetW, Is.True);
            Assert.That(state.EdgePreviews.Count, Is.EqualTo(2));
        }

        [Test]
        public void WDialModel_FlagsActiveMoveWillBreakAtTargetW()
        {
            var def = CreateThreeNodeDef();
            var wState = new WState();
            wState.Force(0.58f);
            wState.SetTarget(0.8f);
            var movementObject = new GameObject("Movement");
            var movement = movementObject.AddComponent<MovementController>();
            SetPrivateField(movement, "_isMoving", true);
            SetPrivateField(movement, "_hasActiveSegment", true);
            SetPrivateField(movement, "_activeSegmentFromId", "A");
            SetPrivateField(movement, "_activeSegmentToId", "B");

            try
            {
                var state = WDialModel.Build(wState, def, new LevelGraphRuntime(def), movement, null, null);

                Assert.That(state.IsMoving, Is.True);
                Assert.That(state.ActiveSegmentFromId, Is.EqualTo("A"));
                Assert.That(state.ActiveSegmentToId, Is.EqualTo("B"));
                Assert.That(state.ActiveMoveWillBreakAtTargetW, Is.True);
            }
            finally
            {
                Object.DestroyImmediate(movementObject);
            }
        }

        [Test]
        public void WDialModel_BuildsRouteHintForBlockedTargetPath()
        {
            var def = CreateThreeNodeDef();
            var wState = new WState();
            wState.Force(0.8f);
            var movementObject = new GameObject("Movement");
            var characterObject = new GameObject("Character");
            var movement = movementObject.AddComponent<MovementController>();
            var character = characterObject.AddComponent<PlayerCharacter>();
            character.CurrentNodeId = "A";
            SetPrivateField(movement, "_hasLastTargetNode", true);
            SetPrivateField(movement, "_lastTargetNodeId", "C");

            try
            {
                var state = WDialModel.Build(wState, def, new LevelGraphRuntime(def), movement, null, character);

                Assert.That(state.HasRouteHint, Is.True);
                Assert.That(state.RouteHint.FromNodeId, Is.EqualTo("A"));
                Assert.That(state.RouteHint.ToNodeId, Is.EqualTo("B"));
                Assert.That(state.RouteHint.TargetNodeId, Is.EqualTo("C"));
                Assert.That(state.RouteHint.MinW, Is.EqualTo(0.4f).Within(0.0001f));
                Assert.That(state.RouteHint.MaxW, Is.EqualTo(0.6f).Within(0.0001f));
            }
            finally
            {
                Object.DestroyImmediate(movementObject);
                Object.DestroyImmediate(characterObject);
            }
        }

        private static void SetPrivateField(object target, string fieldName, object value)
        {
            var field = target.GetType().GetField(fieldName, BindingFlags.Instance | BindingFlags.NonPublic);
            Assert.That(field, Is.Not.Null, fieldName);
            field.SetValue(target, value);
        }

        private static LevelDefinition CreateThreeNodeDef()
        {
            var def = ScriptableObject.CreateInstance<LevelDefinition>();
            def.Nodes.Add(new LevelNode { Id = "A", WorldPosition = Vector3.zero });
            def.Nodes.Add(new LevelNode { Id = "B", WorldPosition = Vector3.right });
            def.Nodes.Add(new LevelNode { Id = "C", WorldPosition = Vector3.right * 2f });
            def.Edges.Add(new LevelEdge
            {
                FromNodeId = "A",
                ToNodeId = "B",
                WalkableRange = new WRange { Min = 0.4f, Max = 0.6f },
                Bidirectional = true
            });
            def.Edges.Add(new LevelEdge
            {
                FromNodeId = "B",
                ToNodeId = "C",
                WalkableRange = new WRange { Min = 0.55f, Max = 0.9f },
                Bidirectional = true
            });
            return def;
        }
    }
}
