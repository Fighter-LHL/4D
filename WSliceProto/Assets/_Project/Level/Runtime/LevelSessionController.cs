using System;
using UnityEngine;

namespace WSlice.Level
{
    public sealed class LevelSessionController : MonoBehaviour
    {
        [SerializeField] private LevelRuntimeController levelController;
        [SerializeField] private MonoBehaviour objectiveSource;

        private LevelSession _session;
        private ILevelObjectiveSource _objective;

        public LevelSession Session => _session;
        public LevelSessionState State => _session != null ? _session.State : LevelSessionState.NotStarted;

        public event Action<LevelSessionState> StateChanged;

        private void Awake()
        {
            _session = new LevelSession();
            _session.StateChanged += HandleSessionStateChanged;
            ResolveReferences();
        }

        private void OnDestroy()
        {
            if (_session != null)
                _session.StateChanged -= HandleSessionStateChanged;
        }

        private void Start()
        {
            ResolveReferences();
            _session?.Begin();
        }

        private void Update()
        {
            if (_session == null || _objective == null || levelController == null)
                return;

            string goalNodeId = levelController.Definition != null
                ? levelController.Definition.GoalNodeId
                : string.Empty;

            _session.TickObjective(_objective.CurrentNodeId, goalNodeId);
        }

        private void ResolveReferences()
        {
            if (levelController == null)
                levelController = GetComponent<LevelRuntimeController>();

            if (levelController == null)
                levelController = FindFirstObjectByType<LevelRuntimeController>();

            if (objectiveSource == null)
            {
                foreach (var behaviour in FindObjectsByType<MonoBehaviour>(FindObjectsSortMode.None))
                {
                    if (behaviour is ILevelObjectiveSource source)
                    {
                        objectiveSource = behaviour;
                        _objective = source;
                        break;
                    }
                }
            }
            else
            {
                _objective = objectiveSource as ILevelObjectiveSource;
            }
        }

        private void HandleSessionStateChanged(LevelSessionState state)
        {
            StateChanged?.Invoke(state);
        }
    }
}
