using System;
using System.Collections.Generic;
using UnityEngine;

namespace WSlice.Level
{
    public static class LevelRestartPipeline
    {
        private static readonly string[] EarlyHandlerTypes =
        {
            "WSlice.Level.LevelGraphMutationController",
            "WSlice.Player.LevelPlayerReset",
        };

        private const string LateHandlerType = "WSlice.UI.LevelTutorialController";

        public static void Apply(
            LevelDefinition definition,
            LevelGraphRuntime graph,
            LevelRuntimeController levelController)
        {
            var handlers = CollectHandlers();

            foreach (var typeName in EarlyHandlerTypes)
            {
                if (handlers.TryGetValue(typeName, out var handler))
                {
                    handler.ApplyLevelRestart(definition, graph);
                    handlers.Remove(typeName);

                    if (typeName == EarlyHandlerTypes[0])
                        levelController?.ResetToInitialState();
                }
            }

            handlers.Remove(LateHandlerType, out var tutorialHandler);

            var remaining = new List<ILevelRestartHandler>(handlers.Values);
            remaining.Sort((left, right) =>
                string.Compare(
                    left.GetType().FullName,
                    right.GetType().FullName,
                    StringComparison.Ordinal));

            foreach (var handler in remaining)
                handler.ApplyLevelRestart(definition, graph);

            tutorialHandler?.ApplyLevelRestart(definition, graph);
        }

        private static Dictionary<string, ILevelRestartHandler> CollectHandlers()
        {
            var handlers = new Dictionary<string, ILevelRestartHandler>();

            foreach (var behaviour in UnityEngine.Object.FindObjectsByType<MonoBehaviour>(FindObjectsSortMode.None))
            {
                if (behaviour is not ILevelRestartHandler handler)
                    continue;

                var typeName = handler.GetType().FullName;
                if (!handlers.ContainsKey(typeName))
                    handlers[typeName] = handler;
            }

            return handlers;
        }
    }
}
