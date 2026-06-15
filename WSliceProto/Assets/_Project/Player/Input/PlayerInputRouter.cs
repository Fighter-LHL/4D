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
        [SerializeField] private MovementController movement;
        [SerializeField] private float snapRadius = 0.03f;

        public WState WState => levelController != null ? levelController.WState : null;
        public float CurrentW => WState?.CurrentW ?? 0f;

        private void Awake()
        {
            if (gameCamera == null) gameCamera = Camera.main;
        }

        public void SetWDial(float normalizedW)
        {
            Execute(new SetWCommand(normalizedW));
        }

        public void Execute(SetWCommand command)
        {
            if (WState == null) return;
            var def = levelController != null ? levelController.Definition : null;
            float target = def != null
                ? WSnapResolver.Resolve(command.TargetW, def.SnapPoints, snapRadius)
                : command.TargetW;
            WState.SetTarget(target);
        }

        public void OnTap(Vector2 screenPosition)
        {
            if (gameCamera == null || movement == null) return;
            Ray ray = gameCamera.ScreenPointToRay(screenPosition);
            if (Physics.Raycast(ray, out RaycastHit hit, 100f, groundMask))
            {
                var command = new MoveCommand(hit.point);
                movement.RequestMove(command.TargetWorldPosition);
            }
        }
    }
}
