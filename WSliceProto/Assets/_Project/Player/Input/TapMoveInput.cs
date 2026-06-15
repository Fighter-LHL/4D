using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.EnhancedTouch;
using Touch = UnityEngine.InputSystem.EnhancedTouch.Touch;
using TouchPhase = UnityEngine.InputSystem.TouchPhase;

namespace WSlice.Player
{
    public sealed class TapMoveInput : MonoBehaviour
    {
        [SerializeField] private PlayerInputRouter router;

        private void OnEnable() => EnhancedTouchSupport.Enable();
        private void OnDisable() => EnhancedTouchSupport.Disable();

        private void Update()
        {
            if (router == null) return;

            foreach (var touch in Touch.activeTouches)
            {
                if (touch.phase == TouchPhase.Began && !IsPointerOverUI(touch.touchId))
                    router.OnTap(touch.screenPosition);
            }

            var mouse = Mouse.current;
            if (mouse != null && mouse.leftButton.wasPressedThisFrame && !IsPointerOverUI())
                router.OnTap(mouse.position.ReadValue());
        }

        private static bool IsPointerOverUI(int pointerId = -1)
        {
            return EventSystem.current != null && EventSystem.current.IsPointerOverGameObject(pointerId);
        }
    }
}
