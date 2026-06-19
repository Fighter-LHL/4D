using System.Collections.Generic;
using UnityEngine;

namespace WSlice.Level
{
    public sealed class LevelGraphMutationController : MonoBehaviour, ILevelRestartHandler
    {
        [SerializeField] private LevelRuntimeController levelController;

        private readonly List<GraphEdgeUnlockAction> _appliedActions = new();

        public IReadOnlyList<GraphEdgeUnlockAction> AppliedActions => _appliedActions;

        public bool ApplyUnlock(GraphEdgeUnlockAction action)
        {
            if (levelController == null || levelController.Graph == null)
                return false;

            if (!GraphMutationModel.TryApplyUnlock(levelController.Graph, action))
                return false;

            _appliedActions.Add(action);
            return true;
        }

        public void ApplyLevelRestart(LevelDefinition definition, LevelGraphRuntime graph)
        {
            _appliedActions.Clear();
            GraphMutationModel.ResetToDefinition(graph, definition);
        }

        private void Awake()
        {
            if (levelController == null)
                levelController = GetComponent<LevelRuntimeController>();
        }
    }
}
