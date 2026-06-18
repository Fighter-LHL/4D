using System;
using System.Collections.Generic;
using UnityEngine;
using WSlice.Core;

namespace WSlice.Level
{
    public sealed class LevelPathPreviewRenderer : MonoBehaviour
    {
        [SerializeField] private LevelRuntimeController levelController;
        [SerializeField] private float yOffset = 0.08f;
        [SerializeField] private float openWidth = 0.07f;
        [SerializeField] private float blockedWidth = 0.05f;
        [SerializeField] private Color openColor = new(0.2f, 0.9f, 0.35f, 0.95f);
        [SerializeField] private Color blockedColor = new(0.95f, 0.25f, 0.2f, 0.6f);

        private readonly List<EdgeLineBinding> _bindings = new();
        private WState _subscribedWState;
        private float _lastW = float.NaN;

        public IReadOnlyList<PathEdgeVisual> CurrentVisuals { get; private set; } = Array.Empty<PathEdgeVisual>();

        private void OnEnable()
        {
            ResolveReferences();
            RebuildBindings();
            SubscribeW();
            Refresh();
        }

        private void OnDisable()
        {
            UnsubscribeW();
            ClearBindings();
        }

        private void LateUpdate()
        {
            if (levelController?.WState == null)
                return;

            float currentW = levelController.WState.CurrentW;
            if (Mathf.Approximately(currentW, _lastW))
                return;

            Refresh();
        }

        public bool IsEdgeOpenAtCurrentW(string fromNodeId, string toNodeId)
        {
            foreach (var visual in CurrentVisuals)
            {
                if (visual.FromNodeId == fromNodeId && visual.ToNodeId == toNodeId)
                    return visual.IsOpenAtCurrentW;
            }

            return false;
        }

        private void ResolveReferences()
        {
            if (levelController == null)
                levelController = FindFirstObjectByType<LevelRuntimeController>();
        }

        private void RebuildBindings()
        {
            ClearBindings();
            if (levelController?.Graph == null)
                return;

            foreach (var edge in levelController.Graph.Edges)
            {
                if (edge == null) continue;

                var lineObject = new GameObject($"Path_{edge.FromNodeId}_{edge.ToNodeId}");
                lineObject.transform.SetParent(transform, false);

                var lineRenderer = lineObject.AddComponent<LineRenderer>();
                ConfigureLineRenderer(lineRenderer);

                _bindings.Add(new EdgeLineBinding(edge.FromNodeId, edge.ToNodeId, lineRenderer));
            }
        }

        private Material _lineMaterial;

        private void ConfigureLineRenderer(LineRenderer lineRenderer)
        {
            lineRenderer.useWorldSpace = true;
            lineRenderer.positionCount = 2;
            lineRenderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            lineRenderer.receiveShadows = false;
            lineRenderer.numCapVertices = 4;
            lineRenderer.numCornerVertices = 4;
            _lineMaterial ??= new Material(Shader.Find("Sprites/Default"));
            lineRenderer.material = _lineMaterial;
        }

        private void Refresh()
        {
            if (levelController?.Graph == null || levelController.WState == null)
                return;

            _lastW = levelController.WState.CurrentW;
            CurrentVisuals = LevelPathPreviewModel.Build(levelController.Graph, _lastW, yOffset);

            for (int i = 0; i < _bindings.Count; i++)
            {
                var binding = _bindings[i];
                if (binding.LineRenderer == null) continue;

                PathEdgeVisual visual = FindVisual(binding.FromNodeId, binding.ToNodeId);
                if (visual == null)
                {
                    binding.LineRenderer.enabled = false;
                    continue;
                }

                binding.LineRenderer.enabled = true;
                binding.LineRenderer.startWidth = visual.IsOpenAtCurrentW ? openWidth : blockedWidth;
                binding.LineRenderer.endWidth = visual.IsOpenAtCurrentW ? openWidth : blockedWidth;
                binding.LineRenderer.startColor = visual.IsOpenAtCurrentW ? openColor : blockedColor;
                binding.LineRenderer.endColor = visual.IsOpenAtCurrentW ? openColor : blockedColor;
                binding.LineRenderer.SetPosition(0, visual.FromPosition);
                binding.LineRenderer.SetPosition(1, visual.LineEndPosition);
            }
        }

        private PathEdgeVisual FindVisual(string fromNodeId, string toNodeId)
        {
            foreach (var visual in CurrentVisuals)
            {
                if (visual.FromNodeId == fromNodeId && visual.ToNodeId == toNodeId)
                    return visual;
            }

            return null;
        }

        private void SubscribeW()
        {
            if (_subscribedWState != null || levelController?.WState == null)
                return;

            _subscribedWState = levelController.WState;
            _subscribedWState.OnWChanged += OnWChanged;
        }

        private void UnsubscribeW()
        {
            if (_subscribedWState == null)
                return;

            _subscribedWState.OnWChanged -= OnWChanged;
            _subscribedWState = null;
        }

        private void OnWChanged(float w)
        {
            Refresh();
        }

        private void ClearBindings()
        {
            foreach (var binding in _bindings)
            {
                if (binding.LineRenderer != null)
                    Destroy(binding.LineRenderer.gameObject);
            }

            _bindings.Clear();
            CurrentVisuals = Array.Empty<PathEdgeVisual>();
            _lastW = float.NaN;
        }

        private sealed class EdgeLineBinding
        {
            public string FromNodeId { get; }
            public string ToNodeId { get; }
            public LineRenderer LineRenderer { get; }

            public EdgeLineBinding(string fromNodeId, string toNodeId, LineRenderer lineRenderer)
            {
                FromNodeId = fromNodeId;
                ToNodeId = toNodeId;
                LineRenderer = lineRenderer;
            }
        }
    }
}
