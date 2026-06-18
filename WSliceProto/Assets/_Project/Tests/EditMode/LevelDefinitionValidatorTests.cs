using NUnit.Framework;
using UnityEngine;
using WSlice.Core;
using WSlice.Level;

namespace WSlice.Tests.EditMode
{
    public class LevelDefinitionValidatorTests
    {
        [Test]
        public void Validate_NullDefinition_ReturnsError()
        {
            var result = LevelDefinitionValidator.Validate(null);

            Assert.That(result.IsValid, Is.False);
            Assert.That(result.Errors, Does.Contain("LevelDefinition is missing."));
        }

        [Test]
        public void Validate_RejectsOutOfRangeSnapPoint()
        {
            var def = CreateValidDefinition();
            def.SnapPoints.Add(1.2f);

            var result = LevelDefinitionValidator.Validate(def);

            Assert.That(result.IsValid, Is.False);
            Assert.That(result.Errors, Does.Contain("Snap point 1.20 is outside [0, 1]."));
        }

        [Test]
        public void Validate_WarnsForUnsortedSnapPoints()
        {
            var def = CreateValidDefinition();
            def.SnapPoints.Clear();
            def.SnapPoints.Add(0.8f);
            def.SnapPoints.Add(0.2f);

            var result = LevelDefinitionValidator.Validate(def);

            Assert.That(result.IsValid, Is.True);
            Assert.That(result.Warnings, Does.Contain("Snap points should be sorted ascending for stable authoring."));
        }

        [Test]
        public void Validate_RejectsDuplicateNodeIds()
        {
            var def = CreateValidDefinition();
            def.Nodes.Add(new LevelNode { Id = "A", WorldPosition = Vector3.forward });

            var result = LevelDefinitionValidator.Validate(def);

            Assert.That(result.IsValid, Is.False);
            Assert.That(result.Errors, Does.Contain("Duplicate node id 'A'."));
        }

        [Test]
        public void Validate_RejectsMissingEdgeEndpoint()
        {
            var def = CreateValidDefinition();
            def.Edges.Add(new LevelEdge
            {
                FromNodeId = "A",
                ToNodeId = "Missing",
                WalkableRange = new WRange { Min = 0f, Max = 1f },
                Bidirectional = true
            });

            var result = LevelDefinitionValidator.Validate(def);

            Assert.That(result.IsValid, Is.False);
            Assert.That(result.Errors, Does.Contain("Edge A->Missing references missing to node 'Missing'."));
        }

        [Test]
        public void Validate_RejectsOutOfRangeWRange()
        {
            var def = CreateValidDefinition();
            def.Edges[0].WalkableRange = new WRange { Min = -0.1f, Max = 0.5f };

            var result = LevelDefinitionValidator.Validate(def);

            Assert.That(result.IsValid, Is.False);
            Assert.That(result.Errors, Does.Contain("Edge A->B walkable range -0.10-0.50 is outside [0, 1]."));
        }

        [Test]
        public void Validate_WarnsForReversedWRange()
        {
            var def = CreateValidDefinition();
            def.Edges[0].WalkableRange = new WRange { Min = 0.7f, Max = 0.5f };

            var result = LevelDefinitionValidator.Validate(def);

            Assert.That(result.IsValid, Is.True);
            Assert.That(result.Warnings, Does.Contain("Edge A->B walkable range is reversed; runtime normalizes it."));
        }

        [Test]
        public void Validate_RejectsMissingGoalNode()
        {
            var def = CreateValidDefinition();
            def.GoalNodeId = "Missing";

            var result = LevelDefinitionValidator.Validate(def);

            Assert.That(result.IsValid, Is.False);
            Assert.That(result.Errors, Does.Contain("Goal node 'Missing' is not defined in Nodes."));
        }

        [Test]
        public void Validate_RejectsMissingStartNode()
        {
            var def = CreateValidDefinition();
            def.StartNodeId = "Missing";

            var result = LevelDefinitionValidator.Validate(def);

            Assert.That(result.IsValid, Is.False);
            Assert.That(result.Errors, Does.Contain("Start node 'Missing' is not defined in Nodes."));
        }

        private static LevelDefinition CreateValidDefinition()
        {
            var def = ScriptableObject.CreateInstance<LevelDefinition>();
            def.GoalNodeId = "B";
            def.StartNodeId = "A";
            def.SnapPoints.Add(0f);
            def.SnapPoints.Add(0.55f);
            def.Nodes.Add(new LevelNode { Id = "A", WorldPosition = Vector3.zero });
            def.Nodes.Add(new LevelNode { Id = "B", WorldPosition = Vector3.right });
            def.Edges.Add(new LevelEdge
            {
                FromNodeId = "A",
                ToNodeId = "B",
                WalkableRange = new WRange { Min = 0.5f, Max = 0.7f },
                Bidirectional = true
            });
            return def;
        }
    }
}
