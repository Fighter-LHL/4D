using UnityEngine;
using UnityEngine.EventSystems;

namespace WSlice.Player
{
    public sealed class WDialInput : MonoBehaviour, IDragHandler, IBeginDragHandler
    {
        [SerializeField] private PlayerInputRouter router;
        [SerializeField] private RectTransform dialRoot;
        [SerializeField] private float dragSensitivity = 1f;

        public void OnBeginDrag(PointerEventData eventData) { }

        public void OnDrag(PointerEventData eventData)
        {
            if (router == null || dialRoot == null) return;
            float delta = eventData.delta.x / Mathf.Max(dialRoot.rect.width, 0.001f) * dragSensitivity;
            router.SetWDial(Mathf.Clamp01(router.CurrentW + delta));
        }
    }
}
