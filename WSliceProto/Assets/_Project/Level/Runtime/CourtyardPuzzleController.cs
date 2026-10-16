using UnityEngine;

namespace WSlice.Level
{
    public sealed class CourtyardPuzzleController : MonoBehaviour, ILevelCompletionCondition, ILevelRestartHandler
    {
        [SerializeField] private LevelRuntimeController levelController;
        [SerializeField] private LevelSessionController session;
        [SerializeField] private MonoBehaviour objectiveSource;
        [SerializeField] private LevelGraphMutationController mutations;
        [SerializeField] private CourtyardWorldView world;

        public string CurrentNodeId => (objectiveSource as ILevelObjectiveSource)?.CurrentNodeId ?? string.Empty;
        public float CurrentW => levelController != null && levelController.WState != null ? levelController.WState.CurrentW : 0f;
        public bool IsActivated { get; private set; }
        public bool HasEnteredCourtyard { get; private set; }
        public bool ReturnedToCourtyard { get; private set; }
        public int ResetVersion { get; private set; }
        public bool IsComplete => session != null && session.State == LevelSessionState.Completed;
        public bool IsSatisfied => IsActivated;
        public bool CanActivate => !IsActivated && session != null && session.State == LevelSessionState.Playing
            && IsAtMechanism();

        private void Start()
        {
            if (world != null)
                world.EnsureBuilt(this);
            RefreshWorld();
        }

        private void Update()
        {
            if (CurrentNodeId == CourtyardLayout.Courtyard)
            {
                HasEnteredCourtyard = true;
                if (IsActivated) ReturnedToCourtyard = true;
            }
            RefreshWorld();
        }

        public bool TryActivate()
        {
            if (session == null || session.State != LevelSessionState.Playing || !IsAtMechanism())
                return false;
            if (IsActivated) return true;
            if (mutations == null || !mutations.ApplyUnlock(new GraphEdgeUnlockAction
                {
                    FromNodeId = CourtyardLayout.BridgeStart,
                    ToNodeId = CourtyardLayout.ExitLanding,
                    WalkableRange = CourtyardLayout.BridgeRange
                }))
                return false;

            IsActivated = true;
            RefreshWorld();
            return true;
        }

        public void ApplyLevelRestart(LevelDefinition definition, LevelGraphRuntime graph)
        {
            IsActivated = false;
            HasEnteredCourtyard = false;
            ReturnedToCourtyard = false;
            ResetVersion++;
            RefreshWorld();
        }

        private bool IsAtMechanism()
        {
            var node = levelController?.Graph?.GetNode(CourtyardLayout.Mechanism);
            return objectiveSource != null && CurrentNodeId == CourtyardLayout.Mechanism && node != null
                && Vector3.Distance(objectiveSource.transform.position, node.WorldPosition) <= 0.06f;
        }

        private void RefreshWorld()
        {
            if (world != null && levelController != null && levelController.Graph != null)
                world.Render(levelController.Graph, CurrentW, IsActivated);
        }
    }
}
