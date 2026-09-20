using System;
using System.Collections.Generic;
using UnityEngine;

namespace WSlice.Level
{
    public static class LevelRestartPipeline
    {
        private const string PlayerHandlerType = "WSlice.Player.LevelPlayerReset";
        private const string TutorialHandlerType = "WSlice.UI.LevelTutorialController";

        public static void Apply(
            LevelDefinition definition,
            LevelGraphRuntime graph,
            LevelRuntimeController levelController)
        {
            var handlers = CollectHandlers();
            bool graphReset = false;

            foreach (var handler in handlers)
            {
                if (handler is LevelGraphMutationController)
                {
                    handler.ApplyLevelRestart(definition, graph);
                    graphReset = true;
                }
            }

            if (!graphReset)
                GraphMutationModel.ResetToDefinition(graph, definition);

            // Reset W even when a scene has no graph mutation component.
            levelController?.ResetToInitialState();

            foreach (var handler in handlers)
            {
                if (handler is not LevelGraphMutationController)
                    handler.ApplyLevelRestart(definition, graph);
            }
        }

        private static List<ILevelRestartHandler> CollectHandlers()
        {
            var handlers = new List<ILevelRestartHandler>();

            foreach (var behaviour in UnityEngine.Object.FindObjectsByType<MonoBehaviour>(
                         FindObjectsInactive.Include, FindObjectsSortMode.InstanceID))
            {
                if (behaviour is ILevelRestartHandler handler)
                    handlers.Add(handler);
            }

            handlers.Sort((left, right) =>
            {
                int phase = GetPhase(left).CompareTo(GetPhase(right));
                if (phase != 0)
                    return phase;

                int type = string.Compare(left.GetType().FullName, right.GetType().FullName, StringComparison.Ordinal);
                return type != 0 ? type : ((MonoBehaviour)left).GetInstanceID().CompareTo(((MonoBehaviour)right).GetInstanceID());
            });

            return handlers;
        }

        private static int GetPhase(ILevelRestartHandler handler)
        {
            if (handler is LevelGraphMutationController)
                return 0;
            if (handler.GetType().FullName == PlayerHandlerType)
                return 1;
            return handler.GetType().FullName == TutorialHandlerType ? 3 : 2;
        }
    }
}
