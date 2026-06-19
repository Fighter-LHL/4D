using UnityEngine;
using WSlice.Level;
using WSlice.Player;

namespace WSlice.UI
{
    public sealed class LevelTutorialController : MonoBehaviour, ILevelRestartHandler
    {
        [SerializeField] private LevelRuntimeController levelController;
        [SerializeField] private LevelSessionController session;
        [SerializeField] private MovementController movement;

        private bool _dismissed;
        private float _initialW;
        private GateLeverInteractable _lever;

        public bool IsActive =>
            !_dismissed
            && !string.IsNullOrWhiteSpace(HintText)
            && session != null
            && session.State == LevelSessionState.Playing;

        public string HintText =>
            levelController != null && levelController.Definition != null
                ? levelController.Definition.TutorialHint
                : string.Empty;

        private void Awake()
        {
            ResolveReferences();
        }

        private void Start()
        {
            ResetTutorial();
        }

        private void Update()
        {
            if (_dismissed || session == null || session.State != LevelSessionState.Playing)
                return;

            ResolveReferences();

            if (_lever == null)
                _lever = FindFirstObjectByType<GateLeverInteractable>();

            float targetW = levelController != null && levelController.WState != null
                ? levelController.WState.TargetW
                : _initialW;

            if (LevelTutorialDismissRules.ShouldDismiss(
                movement != null && movement.IsMoving,
                _lever != null && _lever.IsActivated,
                _initialW,
                targetW))
            {
                _dismissed = true;
            }
        }

        public void ApplyLevelRestart(LevelDefinition definition, LevelGraphRuntime graph)
        {
            ResetTutorial();
        }

        private void ResetTutorial()
        {
            _dismissed = false;
            _initialW = levelController != null && levelController.Definition != null
                ? levelController.Definition.InitialW
                : 0f;
            _lever = FindFirstObjectByType<GateLeverInteractable>();
        }

        private void ResolveReferences()
        {
            if (levelController == null)
                levelController = FindFirstObjectByType<LevelRuntimeController>();

            if (session == null)
                session = FindFirstObjectByType<LevelSessionController>();

            if (movement == null)
                movement = FindFirstObjectByType<MovementController>();
        }
    }
}
