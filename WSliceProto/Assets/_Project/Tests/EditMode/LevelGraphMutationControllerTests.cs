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
                Bidirectional = true,
                IsLocked = true
            });

            var levelRuntime = new GameObject("LevelRuntime");
            try
            {
                var levelController = levelRuntime.AddComponent<LevelRuntimeController>();
                var mutationController = levelRuntime.AddComponent<LevelGraphMutationController>();

                // This EditMode fixture supplies an already-loaded graph. Native
                // MonoBehaviour lifecycle messages require a running behaviour.
                var graph = new LevelGraphRuntime(def);
                var graphProperty = typeof(LevelRuntimeController).GetProperty(nameof(LevelRuntimeController.Graph));
                Assert.That(graphProperty, Is.Not.Null);
                var setGraph = graphProperty.GetSetMethod(true);
                Assert.That(setGraph, Is.Not.Null);
                setGraph.Invoke(levelController, new object[] { graph });

                var mutationSo = new UnityEditor.SerializedObject(mutationController);
                mutationSo.FindProperty("levelController").objectReferenceValue = levelController;
                mutationSo.ApplyModifiedPropertiesWithoutUndo();

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
                Assert.That(graph.Edges[0].IsLocked, Is.False);
                Assert.That(def.Edges[0].IsLocked, Is.True);

                mutationController.ApplyLevelRestart(def, graph);

                Assert.That(mutationController.AppliedActions, Is.Empty);
                Assert.IsFalse(graph.CanMove("A", "B", 0.5f));
                Assert.That(graph.Edges[0].IsLocked, Is.True);
                Assert.That(graph.Edges[0].WalkableRange.Min, Is.EqualTo(def.Edges[0].WalkableRange.Min));
                Assert.That(graph.Edges[0].WalkableRange.Max, Is.EqualTo(def.Edges[0].WalkableRange.Max));
            }
            finally
            {
                Object.DestroyImmediate(levelRuntime);
                Object.DestroyImmediate(def);
            }
        }
    }
}
