using System.Linq;
using NUnit.Framework;
using UnityEngine;
using WSlice.Core;
using WSlice.Level;

namespace WSlice.Tests.EditMode
{
    public class LevelGraphRuntimeTests
    {
        private LevelDefinition CreateThreeNodeDef()
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

        [Test]
        public void CanMove_WhenWalkable_ReturnsTrue()
        {
            var graph = new LevelGraphRuntime(CreateThreeNodeDef());
            Assert.IsTrue(graph.CanMove("A", "B", 0.5f));
        }

        [Test]
        public void CanMove_WhenNotWalkable_ReturnsFalse()
        {
            var graph = new LevelGraphRuntime(CreateThreeNodeDef());
            Assert.IsFalse(graph.CanMove("A", "B", 0.2f));
        }

        [Test]
        public void FindPath_TwoHopsButFirstBlocked_ReturnsEmpty()
        {
            var graph = new LevelGraphRuntime(CreateThreeNodeDef());
            var path = graph.FindPath("A", "C", 0.8f);
            Assert.AreEqual(0, path.Count);
        }

        [Test]
        public void FindPath_WhenBothEdgesWalkable_ReturnsFullPath()
        {
            var graph = new LevelGraphRuntime(CreateThreeNodeDef());
            var path = graph.FindPath("A", "C", 0.58f);
            Assert.AreEqual(3, path.Count);
            Assert.AreEqual("A", path[0].Id);
            Assert.AreEqual("B", path[1].Id);
            Assert.AreEqual("C", path[2].Id);
        }

        [Test]
        public void SetEdgeWalkableRange_UnlocksPreviouslyBlockedEdge()
        {
            var graph = new LevelGraphRuntime(CreateThreeNodeDef());
            Assert.IsFalse(graph.CanMove("B", "C", 0.45f));

            Assert.That(
                graph.SetEdgeWalkableRange("B", "C", new WRange { Min = 0.3f, Max = 0.5f }),
                Is.True);
            Assert.IsTrue(graph.CanMove("B", "C", 0.45f));
        }

        [Test]
        public void Load_DoesNotShareDefinitionEdgeReferences()
        {
            var def = CreateThreeNodeDef();
            var originalMax = def.Edges[1].WalkableRange.Max;

            var graph = new LevelGraphRuntime(def);
            Assert.That(
                graph.SetEdgeWalkableRange("B", "C", new WRange { Min = 0.3f, Max = 0.5f }),
                Is.True);

            Assert.That(def.Edges[1].WalkableRange.Max, Is.EqualTo(originalMax));
        }

        [Test]
        public void SetEdgeWalkableRange_MatchesBidirectionalReverse()
        {
            var def = CreateThreeNodeDef();
            var graph = new LevelGraphRuntime(def);

            Assert.That(
                graph.SetEdgeWalkableRange("C", "B", new WRange { Min = 0.3f, Max = 0.5f }),
                Is.True);
            Assert.IsTrue(graph.CanMove("B", "C", 0.45f));
        }

        [Test]
        public void LockedEdge_BlocksBothDirectionsAndPathAtEveryW()
        {
            var def = CreateThreeNodeDef();
            try
            {
                def.Edges[0].IsLocked = true;
                def.Edges[0].WalkableRange = new WRange { Min = 0f, Max = 1f };
                var graph = new LevelGraphRuntime(def);

                foreach (float w in new[] { 0f, 0.5f, 0.58f, 1f })
                {
                    Assert.That(graph.CanMove("A", "B", w), Is.False);
                    Assert.That(graph.CanMove("B", "A", w), Is.False);
                    Assert.That(graph.FindPath("A", "C", w), Is.Empty);
                    Assert.That(graph.GetAvailableEdges(w).Any(edge => edge.FromNodeId == "A"), Is.False);
                }

                graph.SetEdgeWalkableRange("A", "B", new WRange { Min = 0f, Max = 1f });
                Assert.That(graph.CanMove("A", "B", 0.5f), Is.False, "Changing W ranges must not bypass a lock.");
            }
            finally
            {
                Object.DestroyImmediate(def);
            }
        }

        [Test]
        public void Unlock_RespectsDirectionAndCopiesInitialLockState()
        {
            var def = CreateThreeNodeDef();
            try
            {
                def.Edges[0].IsLocked = true;
                def.Edges[0].Bidirectional = false;
                var graph = new LevelGraphRuntime(def);
                var range = new WRange { Min = 0.4f, Max = 0.6f };

                Assert.That(graph.TryUnlockEdge("B", "A", range), Is.False);
                Assert.That(graph.CanMove("A", "B", 0.5f), Is.False);
                Assert.That(graph.TryUnlockEdge("A", "B", range), Is.True);
                Assert.That(graph.CanMove("A", "B", 0.5f), Is.True);
                Assert.That(graph.CanMove("B", "A", 0.5f), Is.False);
                Assert.That(graph.CanMove("A", "B", 0.8f), Is.False);
                Assert.That(def.Edges[0].IsLocked, Is.True);

                graph.Load(def);
                Assert.That(graph.Edges[0].IsLocked, Is.True);
                Assert.That(graph.CanMove("A", "B", 0.5f), Is.False);
            }
            finally
            {
                Object.DestroyImmediate(def);
            }
        }
    }
}
