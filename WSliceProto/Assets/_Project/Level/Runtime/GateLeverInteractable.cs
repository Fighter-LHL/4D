using UnityEngine;
using WSlice.Core;
using WSlice.Entities;

namespace WSlice.Level
{
    public sealed class GateLeverInteractable : MonoBehaviour, IWorldInteractable, ILevelRestartHandler
    {
        [SerializeField] private SliceEntity sliceEntity;
        [SerializeField] private LevelRuntimeController levelController;
        [SerializeField] private LevelGraphMutationController mutationController;
        [SerializeField] private WInteractableProfile interactableProfile = new()
        {
            DisplayName = "Lever",
            UnlockAction = new GraphEdgeUnlockAction
            {
                FromNodeId = "GateRoom",
                ToNodeId = "Goal",
                WalkableRange = new WRange { Min = 0.30f, Max = 0.55f }
            }
        };
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

            if (mutationController == null)
                mutationController = FindFirstObjectByType<LevelGraphMutationController>();

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

            if (mutationController == null || levelController == null)
                return false;

            _activated = true;
            mutationController.ApplyUnlock(interactableProfile.UnlockAction);
            ApplyActivatedVisual();
            return true;
        }

        public string GetNotInteractiveHint()
        {
            SliceProfile profile = sliceEntity != null ? sliceEntity.profile : null;
            return WInteractableProfileModel.BuildNotInteractiveHint(interactableProfile, profile);
        }

        public void ApplyLevelRestart(LevelDefinition definition, LevelGraphRuntime graph)
        {
            _activated = false;
            ResetVisual();
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
