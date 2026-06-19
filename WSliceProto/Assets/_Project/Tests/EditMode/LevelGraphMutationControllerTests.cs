using NUnit.Framework;
using UnityEngine;
using WSlice.Core;
using WSlice.Level;

namespace WSlice.Tests.EditMode
{
    public class LevelGraphMutationControllerTests
    {
        [Test]
        public void ApplyLevelRestart_ClearsAppliedActionsAndRestoresGraph()
        {
            var def = ScriptableObject.CreateInstance<LevelDefinition>();
            def.Nodes.Add(new LevelNode { Id = "A", WorldPosition = Vector3.zero });
            def.Nodes.Add(new LevelNode { Id = "B", WorldPosition = Vector3.right });
            def.Edges.Add(new LevelEdge
            {
                FromNodeId = "A",
                ToNodeId = "B",
                WalkableRange = new WRange { Min = 0.99f, Max = 0.99f },
                Bidirectional = true
            });

            var levelRuntime = new GameObject("LevelRuntime");
            var levelController = levelRuntime.AddComponent<LevelRuntimeController>();
            var mutationController = levelRuntime.AddComponent<LevelGraphMutationController>();

            var levelSo = new UnityEditor.SerializedObject(levelController);
            levelSo.FindProperty("definition").objectReferenceValue = def;
            levelSo.ApplyModifiedPropertiesWithoutUndo();

            var mutationSo = new UnityEditor.SerializedObject(mutationController);
            mutationSo.FindProperty("levelController").objectReferenceValue = levelController;
            mutationSo.ApplyModifiedPropertiesWithoutUndo();

            levelController.enabled = true;
            mutationController.enabled = true;

            var graph = levelController.Graph;
            Assert.IsFalse(graph.CanMove("A", "B", 0.5f));

            Assert.That(
                mutationController.ApplyUnlock(new GraphEdgeUnlockAction
                {
                    FromNodeId = "A",
                    ToNodeId = "B",
                    WalkableRange = new WRange { Min = 0.4f, Max = 0.6f }
                }),
                Is.True);
            Assert.That(mutationController.AppliedActions, Has.Count.EqualTo(1));
            Assert.IsTrue(graph.CanMove("A", "B", 0.5f));

            mutationController.ApplyLevelRestart(def, graph);

            Assert.That(mutationController.AppliedActions, Is.Empty);
            Assert.IsFalse(graph.CanMove("A", "B", 0.5f));

            Object.DestroyImmediate(levelRuntime);
            Object.DestroyImmediate(def);
        }
    }
}
