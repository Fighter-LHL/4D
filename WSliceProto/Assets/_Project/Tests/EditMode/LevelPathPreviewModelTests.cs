using NUnit.Framework;
using UnityEngine;
using WSlice.Core;
using WSlice.Level;

namespace WSlice.Tests.EditMode
{
    public class LevelPathPreviewModelTests
    {
        [Test]
        public void Build_GardenGapEdge_BlockedAtLowW()
        {
            var graph = CreateGardenGraph();

            var visuals = LevelPathPreviewModel.Build(graph, 0f);

            Assert.That(TryFindEdge(visuals, "Outside", "Gap", out var edge), Is.True);
            Assert.That(edge.IsOpenAtCurrentW, Is.False);
            Assert.That(edge.LineEndPosition, Is.EqualTo(Vector3.Lerp(edge.FromPosition, edge.ToPosition, 0.5f)));
        }

        [Test]
        public void Build_GardenGapEdge_OpenAtMidW()
        {
            var graph = CreateGardenGraph();

            var visuals = LevelPathPreviewModel.Build(graph, 0.55f);

            Assert.That(TryFindEdge(visuals, "Outside", "Gap", out var edge), Is.True);
            Assert.That(edge.IsOpenAtCurrentW, Is.True);
            Assert.That(edge.LineEndPosition, Is.EqualTo(edge.ToPosition));
        }

        [Test]
        public void Build_AppliesYOffsetToPositions()
        {
            var graph = CreateGardenGraph();

            var visuals = LevelPathPreviewModel.Build(graph, 0.55f, yOffset: 0.1f);
            var node = graph.GetNode("Outside");

            Assert.That(TryFindEdge(visuals, "Outside", "Gap", out var edge), Is.True);
            Assert.That(edge.FromPosition, Is.EqualTo(node.WorldPosition + new Vector3(0f, 0.1f, 0f)));
        }

        private static bool TryFindEdge(
            System.Collections.Generic.IReadOnlyList<PathEdgeVisual> visuals,
            string fromNodeId,
            string toNodeId,
            out PathEdgeVisual edge)
        {
            foreach (var visual in visuals)
            {
                if (visual.FromNodeId == fromNodeId && visual.ToNodeId == toNodeId)
                {
                    edge = visual;
                    return true;
                }
            }

            edge = null;
            return false;
        }

        private static LevelGraphRuntime CreateGardenGraph()
        {
            var def = ScriptableObject.CreateInstance<LevelDefinition>();
            def.Nodes.Add(new LevelNode { Id = "Outside", WorldPosition = new Vector3(0f, 0f, -4f) });
            def.Nodes.Add(new LevelNode { Id = "Gap", WorldPosition = new Vector3(0f, 0f, -2f) });
            def.Nodes.Add(new LevelNode { Id = "InsideGarden", WorldPosition = Vector3.zero });
            def.Edges.Add(new LevelEdge
            {
                FromNodeId = "Outside",
                ToNodeId = "Gap",
                WalkableRange = new WRange { Min = 0.5f, Max = 0.7f },
                Bidirectional = true
            });
            def.Edges.Add(new LevelEdge
            {
                FromNodeId = "Gap",
                ToNodeId = "InsideGarden",
                WalkableRange = new WRange { Min = 0.5f, Max = 0.7f },
                Bidirectional = true
            });

            return new LevelGraphRuntime(def);
        }
    }
}
