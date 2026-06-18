using UnityEngine;
using WSlice.Core;
using WSlice.Entities;

namespace WSlice.Level
{
    public sealed class GateLeverInteractable : MonoBehaviour, IWorldInteractable, ILevelRestartHandler
    {
        [SerializeField] private SliceEntity sliceEntity;
        [SerializeField] private LevelRuntimeController levelController;
        [SerializeField] private string fromNodeId = "GateRoom";
        [SerializeField] private string toNodeId = "Goal";
        [SerializeField] private WRange unlockedWalkableRange = new() { Min = 0.30f, Max = 0.55f };
        [SerializeField] private Transform leverVisual;
        [SerializeField] private float activatedLocalRotationZ = -55f;

        private bool _activated;
        private float _baseLocalRotationZ;

        public bool IsActivated => _activated;

        private void Awake()
        {
            if (sliceEntity == null)
                sliceEntity = GetComponent<SliceEntity>();

            if (levelController == null)
                levelController = FindFirstObjectByType<LevelRuntimeController>();

            if (leverVisual == null)
                leverVisual = transform;

            _baseLocalRotationZ = leverVisual.localEulerAngles.z;
        }

        public bool TryInteract(float currentW)
        {
            if (_activated)
                return true;

            if (!SliceInteractionModel.CanInteract(sliceEntity, currentW))
                return false;

            if (levelController == null || levelController.Graph == null)
                return false;

            _activated = true;
            levelController.Graph.SetEdgeWalkableRange(fromNodeId, toNodeId, unlockedWalkableRange);
            ApplyActivatedVisual();
            return true;
        }

        public void ApplyLevelRestart(LevelDefinition definition, LevelGraphRuntime graph)
        {
            _activated = false;
            ResetVisual();

            if (definition == null || graph == null)
                return;

            graph.Load(definition);
        }

        private void ApplyActivatedVisual()
        {
            if (leverVisual == null)
                return;

            var euler = leverVisual.localEulerAngles;
            euler.z = activatedLocalRotationZ;
            leverVisual.localEulerAngles = euler;
        }

        private void ResetVisual()
        {
            if (leverVisual == null)
                return;

            var euler = leverVisual.localEulerAngles;
            euler.z = _baseLocalRotationZ;
            leverVisual.localEulerAngles = euler;
        }
    }
}
