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
    }
}
