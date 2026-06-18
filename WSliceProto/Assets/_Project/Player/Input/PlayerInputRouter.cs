using UnityEngine;
using WSlice.Core;
using WSlice.Level;

namespace WSlice.Player
{
    public sealed class PlayerInputRouter : MonoBehaviour
    {
        [SerializeField] private Camera gameCamera;
        [SerializeField] private LayerMask groundMask;
        [SerializeField] private LevelRuntimeController levelController;
        [SerializeField] private LevelSessionController session;
        [SerializeField] private MovementController movement;
        [SerializeField] private float snapRadius = 0.03f;

        public WState WState => levelController != null ? levelController.WState : null;
        public float CurrentW => WState?.CurrentW ?? 0f;
        public PlayerActionResult LastActionResult { get; private set; } = PlayerActionResult.Success();

        private void Awake()
        {
            if (gameCamera == null) gameCamera = Camera.main;

            if (session == null)
                session = FindFirstObjectByType<LevelSessionController>();
        }

        public void ClearLastAction()
        {
            LastActionResult = PlayerActionResult.Success();
        }

        public PlayerActionResult SetWDial(float normalizedW)
        {
            return Execute(new SetWCommand(normalizedW));
        }

        public PlayerActionResult Execute(SetWCommand command)
        {
            if (!CanAcceptGameplayInput())
                return Record(PlayerActionResult.Failure(PlayerActionFailureReason.LevelNotPlaying));

            if (WState == null)
                return Record(PlayerActionResult.Failure(PlayerActionFailureReason.MissingWState));

            var def = levelController != null ? levelController.Definition : null;
            float target = def != null
                ? WSnapResolver.Resolve(command.TargetW, def.SnapPoints, snapRadius)
                : command.TargetW;
            WState.SetTarget(target);
            return Record(PlayerActionResult.Success());
        }

        public PlayerActionResult OnTap(Vector2 screenPosition)
        {
            if (!CanAcceptGameplayInput())
                return Record(PlayerActionResult.Failure(PlayerActionFailureReason.LevelNotPlaying));

            if (gameCamera == null)
                return Record(PlayerActionResult.Failure(PlayerActionFailureReason.MissingCamera));

            if (movement == null)
                return Record(PlayerActionResult.Failure(PlayerActionFailureReason.MissingMovement));

            Ray ray = gameCamera.ScreenPointToRay(screenPosition);
            if (Physics.Raycast(ray, out RaycastHit hit, 100f, groundMask))
            {
                var command = new MoveCommand(hit.point);
                return Record(movement.RequestMove(command.TargetWorldPosition));
            }

            return Record(PlayerActionResult.Failure(PlayerActionFailureReason.NoGroundHit));
        }

        private bool CanAcceptGameplayInput()
        {
            return session == null || session.State == LevelSessionState.Playing;
        }

        private PlayerActionResult Record(PlayerActionResult result)
        {
            LastActionResult = result;
            return result;
        }
    }
}
