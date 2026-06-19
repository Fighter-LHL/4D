using NUnit.Framework;
using UnityEngine;
using WSlice.Core;
using WSlice.Level;

namespace WSlice.Tests.EditMode
{
    public class GraphMutationModelTests
    {
        private LevelDefinition CreateGateLikeDef()
        {
            var def = ScriptableObject.CreateInstance<LevelDefinition>();
            def.Nodes.Add(new LevelNode { Id = "Entry", WorldPosition = Vector3.zero });
            def.Nodes.Add(new LevelNode { Id = "GateRoom", WorldPosition = Vector3.right * 5f });
            def.Nodes.Add(new LevelNode { Id = "Goal", WorldPosition = Vector3.right * 10f });
            def.Edges.Add(new LevelEdge
            {
                FromNodeId = "Entry",
                ToNodeId = "GateRoom",
                WalkableRange = new WRange { Min = 0f, Max = 1f },
                Bidirectional = true
            });
            def.Edges.Add(new LevelEdge
            {
                FromNodeId = "GateRoom",
                ToNodeId = "Goal",
                WalkableRange = new WRange { Min = 0.99f, Max = 0.99f },
                Bidirectional = true
            });
            return def;
        }

        [Test]
        public void TryApplyUnlock_UnlocksBlockedEdge()
        {
            var graph = new LevelGraphRuntime(CreateGateLikeDef());
            Assert.IsFalse(graph.CanMove("GateRoom", "Goal", 0.45f));

            var action = new GraphEdgeUnlockAction
            {
                FromNodeId = "GateRoom",
                ToNodeId = "Goal",
                WalkableRange = new WRange { Min = 0.30f, Max = 0.55f }
            };

            Assert.That(GraphMutationModel.TryApplyUnlock(graph, action), Is.True);
            Assert.IsTrue(graph.CanMove("GateRoom", "Goal", 0.45f));
        }

        [Test]
        public void ApplyUnlockSequence_AppliesAllValidActions()
        {
            var graph = new LevelGraphRuntime(CreateGateLikeDef());
            var actions = new[]
            {
                new GraphEdgeUnlockAction
                {
                    FromNodeId = "GateRoom",
                    ToNodeId = "Goal",
                    WalkableRange = new WRange { Min = 0.30f, Max = 0.55f }
                },
                new GraphEdgeUnlockAction
                {
                    FromNodeId = "Missing",
                    ToNodeId = "Goal",
                    WalkableRange = new WRange { Min = 0f, Max = 1f }
                }
            };

            Assert.That(GraphMutationModel.ApplyUnlockSequence(graph, actions), Is.EqualTo(1));
        }

        [Test]
        public void ResetToDefinition_RestoresOriginalWalkableRanges()
        {
            var def = CreateGateLikeDef();
            var graph = new LevelGraphRuntime(def);

            GraphMutationModel.TryApplyUnlock(graph, new GraphEdgeUnlockAction
            {
                FromNodeId = "GateRoom",
                ToNodeId = "Goal",
                WalkableRange = new WRange { Min = 0.30f, Max = 0.55f }
            });
            Assert.IsTrue(graph.CanMove("GateRoom", "Goal", 0.45f));

            GraphMutationModel.ResetToDefinition(graph, def);
            Assert.IsFalse(graph.CanMove("GateRoom", "Goal", 0.45f));
        }
    }
}
