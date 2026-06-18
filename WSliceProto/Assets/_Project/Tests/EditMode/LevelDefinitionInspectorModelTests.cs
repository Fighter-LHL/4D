using NUnit.Framework;
using UnityEngine;
using WSlice.Core;
using WSlice.Level;

namespace WSlice.Tests.EditMode
{
    public class LevelDefinitionInspectorModelTests
    {
        [Test]
        public void BuildSummary_CountsNodesEdgesAndSnapPoints()
        {
            var definition = ScriptableObject.CreateInstance<LevelDefinition>();
            definition.SnapPoints.Add(0f);
            definition.SnapPoints.Add(0.5f);
            definition.Nodes.Add(new LevelNode { Id = "A", WorldPosition = Vector3.zero });
            definition.Edges.Add(new LevelEdge
            {
                FromNodeId = "A",
                ToNodeId = "B",
                WalkableRange = new WRange { Min = 0f, Max = 1f }
            });

            var summary = LevelDefinitionInspectorModel.BuildSummary(definition);

            Assert.That(summary.NodeCount, Is.EqualTo(1));
            Assert.That(summary.EdgeCount, Is.EqualTo(1));
            Assert.That(summary.SnapPointCount, Is.EqualTo(2));
        }

        [Test]
        public void BuildStatusLabel_ReportsValidInvalidAndWarnings()
        {
            var valid = LevelDefinitionValidator.Validate(CreateValidDefinition());
            Assert.That(LevelDefinitionInspectorModel.BuildStatusLabel(valid), Is.EqualTo("Valid"));

            var definition = CreateValidDefinition();
            definition.GoalNodeId = string.Empty;
            var warned = LevelDefinitionValidator.Validate(definition);
            Assert.That(LevelDefinitionInspectorModel.BuildStatusLabel(warned), Is.EqualTo("Valid with 1 warning(s)"));

            definition.GoalNodeId = "Missing";
            var invalid = LevelDefinitionValidator.Validate(definition);
            Assert.That(
                LevelDefinitionInspectorModel.BuildStatusLabel(invalid),
                Is.EqualTo("Invalid (1 error(s), 1 warning(s))"));
        }

        private static LevelDefinition CreateValidDefinition()
        {
            var definition = ScriptableObject.CreateInstance<LevelDefinition>();
            definition.GoalNodeId = "B";
            definition.StartNodeId = "A";
            definition.Nodes.Add(new LevelNode { Id = "A", WorldPosition = Vector3.zero });
            definition.Nodes.Add(new LevelNode { Id = "B", WorldPosition = Vector3.right });
            definition.Edges.Add(new LevelEdge
            {
                FromNodeId = "A",
                ToNodeId = "B",
                WalkableRange = new WRange { Min = 0f, Max = 1f },
                Bidirectional = true
            });
            return definition;
        }
    }
}
