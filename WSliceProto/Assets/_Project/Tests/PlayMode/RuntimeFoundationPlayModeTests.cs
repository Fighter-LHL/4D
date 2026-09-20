using System.Collections;
using System.Collections.Generic;
using System.Reflection;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using WSlice.Core;
using WSlice.Level;
using WSlice.Player;

namespace WSlice.Tests.PlayMode
{
    public class RuntimeFoundationPlayModeTests
    {
        private readonly List<Object> _createdObjects = new();

        [UnitySetUp]
        public IEnumerator LoadScene()
        {
            var operation = SceneManager.LoadSceneAsync("GateGraybox", LoadSceneMode.Single);
            while (!operation.isDone)
                yield return null;
            yield return null;

            var level = Object.FindFirstObjectByType<LevelRuntimeController>();
            Assert.That(level, Is.Not.Null, "Gate scene must contain its level runtime.");
            Assert.That(level.Definition, Is.Not.Null, "Gate scene must bind its authored LevelDefinition.");
            Assert.That(level.Graph, Is.Not.Null);
            Assert.That(level.WState, Is.Not.Null);
            Assert.That(Object.FindFirstObjectByType<LevelSessionController>(), Is.Not.Null);
            Assert.That(Object.FindFirstObjectByType<PlayerCharacter>(), Is.Not.Null);
            Assert.That(Object.FindFirstObjectByType<LevelGraphMutationController>(), Is.Not.Null);
            Assert.That(Object.FindFirstObjectByType<GateLeverInteractable>(), Is.Not.Null);
        }

        [UnityTearDown]
        public IEnumerator Cleanup()
        {
            foreach (var created in _createdObjects)
                if (created != null)
                    Object.Destroy(created);
            _createdObjects.Clear();
            yield return null;
        }

        [UnityTest]
        public IEnumerator CompletionCondition_RequiresBothGoalAndSatisfiedCondition()
        {
            var session = Object.FindFirstObjectByType<LevelSessionController>();
            var level = Object.FindFirstObjectByType<LevelRuntimeController>();
            var character = Object.FindFirstObjectByType<PlayerCharacter>();
            var condition = CreateObject("CompletionCondition").AddComponent<CompletionConditionProbe>();
            SetField(session, "completionCondition", condition);

            condition.Satisfied = true;
            yield return null;
            Assert.That(session.State, Is.EqualTo(LevelSessionState.Playing), "The condition alone does not complete a level.");

            condition.Satisfied = false;
            character.CurrentNodeId = level.Definition.GoalNodeId;
            yield return null;
            Assert.That(session.State, Is.EqualTo(LevelSessionState.Playing), "Reaching the goal cannot bypass the condition.");

            condition.Satisfied = true;
            yield return null;
            Assert.That(session.State, Is.EqualTo(LevelSessionState.Completed));
        }

        [UnityTest]
        public IEnumerator CompletionCondition_InvalidComponent_DoesNotComplete()
        {
            var session = Object.FindFirstObjectByType<LevelSessionController>();
            var level = Object.FindFirstObjectByType<LevelRuntimeController>();
            var character = Object.FindFirstObjectByType<PlayerCharacter>();
            SetField(session, "completionCondition", character);

            character.CurrentNodeId = level.Definition.GoalNodeId;
            yield return null;
            Assert.That(session.State, Is.EqualTo(LevelSessionState.Playing));
        }

        [UnityTest]
        public IEnumerator Restart_ResetsAllInstancesIncludingInactive_AfterGraphWAndPlayer()
        {
            var session = Object.FindFirstObjectByType<LevelSessionController>();
            var level = Object.FindFirstObjectByType<LevelRuntimeController>();
            var character = Object.FindFirstObjectByType<PlayerCharacter>();
            var mutation = Object.FindFirstObjectByType<LevelGraphMutationController>();
            var definition = Object.Instantiate(level.Definition);
            _createdObjects.Add(definition);
            SetField(level, "definition", definition);

            var goalEdge = definition.Edges.Find(edge => edge.FromNodeId == "GateRoom" && edge.ToNodeId == "Goal");
            Assert.That(goalEdge, Is.Not.Null);
            goalEdge.IsLocked = true;
            level.Graph.Load(definition);
            Assert.That(mutation.ApplyUnlock(new GraphEdgeUnlockAction
            {
                FromNodeId = "GateRoom",
                ToNodeId = "Goal",
                WalkableRange = new WRange { Min = 0f, Max = 1f }
            }), Is.True);

            level.WState.Force(0.55f);
            character.CurrentNodeId = "GateRoom";
            character.transform.position = level.Graph.GetNode("GateRoom").WorldPosition;
            var first = CreateObject("FirstRestartProbe").AddComponent<RestartStateProbe>();
            var second = CreateObject("SecondRestartProbe").AddComponent<RestartStateProbe>();
            first.Level = second.Level = level;
            first.Character = second.Character = character;
            second.gameObject.SetActive(false);

            Assert.That(session.RequestRestart(), Is.True);

            Assert.That(first.RestartCount, Is.EqualTo(1));
            Assert.That(second.RestartCount, Is.EqualTo(1));
            Assert.That(first.SawRestoredState, Is.True);
            Assert.That(second.SawRestoredState, Is.True);
            Assert.That(mutation.AppliedActions, Is.Empty);
            Assert.That(session.State, Is.EqualTo(LevelSessionState.Playing));
            yield return null;
        }

        [UnityTest]
        public IEnumerator FailedGraphUnlock_DoesNotActivateLever()
        {
            var level = Object.FindFirstObjectByType<LevelRuntimeController>();
            var lever = Object.FindFirstObjectByType<GateLeverInteractable>();
            var mutation = Object.FindFirstObjectByType<LevelGraphMutationController>();
            SetField(lever, "interactableProfile", new WInteractableProfile
            {
                UnlockAction = new GraphEdgeUnlockAction
                {
                    FromNodeId = "MissingNode",
                    ToNodeId = "Goal",
                    WalkableRange = new WRange { Min = 0f, Max = 1f }
                }
            });
            level.WState.Force(0.55f);
            yield return null;

            Assert.That(lever.TryInteract(0.55f), Is.False);
            Assert.That(lever.IsActivated, Is.False);
            Assert.That(mutation.AppliedActions, Is.Empty);
        }

        private GameObject CreateObject(string name)
        {
            var created = new GameObject(name);
            _createdObjects.Add(created);
            return created;
        }

        private static void SetField(object target, string fieldName, object value)
        {
            var field = target.GetType().GetField(fieldName, BindingFlags.Instance | BindingFlags.NonPublic);
            Assert.That(field, Is.Not.Null, fieldName);
            field.SetValue(target, value);
        }
    }

    public sealed class CompletionConditionProbe : MonoBehaviour, ILevelCompletionCondition
    {
        public bool Satisfied;
        public bool IsSatisfied => Satisfied;
    }

    public sealed class RestartStateProbe : MonoBehaviour, ILevelRestartHandler
    {
        public LevelRuntimeController Level;
        public PlayerCharacter Character;
        public int RestartCount { get; private set; }
        public bool SawRestoredState { get; private set; }

        public void ApplyLevelRestart(LevelDefinition definition, LevelGraphRuntime graph)
        {
            RestartCount++;
            SawRestoredState = !graph.CanMove("GateRoom", "Goal", 0.55f)
                && Mathf.Approximately(Level.WState.CurrentW, definition.InitialW)
                && Character.CurrentNodeId == definition.StartNodeId;
        }
    }
}
