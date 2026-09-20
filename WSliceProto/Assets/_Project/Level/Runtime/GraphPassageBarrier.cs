using UnityEngine;
using WSlice.Core;

namespace WSlice.Level
{
    /// <summary>A visible barrier closes exactly when its authored graph edge is unavailable.</summary>
    [DisallowMultipleComponent]
    public sealed class GraphPassageBarrier : MonoBehaviour
    {
        [SerializeField] private LevelRuntimeController levelController;
        [SerializeField] private string fromNodeId;
        [SerializeField] private string toNodeId;

        private Renderer[] barrierRenderers;
        private Collider[] barrierColliders;
        private WState subscribedState;

        public bool IsOpen { get; private set; }

        public void Bind(LevelRuntimeController controller, string from, string to)
        {
            Unsubscribe();
            levelController = controller;
            fromNodeId = from;
            toNodeId = to;
            if (Application.isPlaying)
                SubscribeAndRefresh();
        }

        private void Awake()
        {
            barrierRenderers = GetComponentsInChildren<Renderer>(true);
            barrierColliders = GetComponentsInChildren<Collider>(true);
        }

        private void OnEnable() => SubscribeAndRefresh();
        private void Start() => SubscribeAndRefresh();
        private void OnDisable() => Unsubscribe();

        // Also observe graph resets/mutations that do not change W.
        private void LateUpdate() => Refresh();

        private void SubscribeAndRefresh()
        {
            if (subscribedState == null && levelController != null && levelController.WState != null)
            {
                subscribedState = levelController.WState;
                subscribedState.OnWChanged += OnWChanged;
            }
            Refresh();
        }

        private void Unsubscribe()
        {
            if (subscribedState == null) return;
            subscribedState.OnWChanged -= OnWChanged;
            subscribedState = null;
        }

        private void OnWChanged(float w) => Refresh();

        private void Refresh()
        {
            if (barrierRenderers == null || barrierColliders == null) return;
            IsOpen = levelController != null && levelController.Graph != null && levelController.WState != null
                && levelController.Graph.CanMove(fromNodeId, toNodeId, levelController.WState.CurrentW);
            foreach (var renderer in barrierRenderers)
                if (renderer != null) renderer.enabled = !IsOpen;
            foreach (var collider in barrierColliders)
                if (collider != null) collider.enabled = !IsOpen;
        }
    }
}
