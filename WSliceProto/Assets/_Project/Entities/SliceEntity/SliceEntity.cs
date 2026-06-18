using UnityEngine;
using WSlice.Core;

namespace WSlice.Entities
{
    public sealed class SliceEntity : MonoBehaviour
    {
        public SliceProfile profile;
        public SlicePresenter presenter;
        public Collider[] colliders;

        [SerializeField, HideInInspector] private Vector3 baseLocalPosition;
        [SerializeField, HideInInspector] private bool hasBaseLocalPosition;

        private SlicePresenter[] cachedPresenters;

        private void Awake()
        {
            EnsureBasePose();
            EnsureColliders();
            EnsurePresenters();
        }

        private void OnValidate()
        {
            if (!Application.isPlaying)
                EnsureBasePose();
        }

        public void CaptureBasePose()
        {
            baseLocalPosition = transform.localPosition;
            hasBaseLocalPosition = true;
        }

        public void RefreshRuntimeCache()
        {
            colliders = GetComponentsInChildren<Collider>(true);
            cachedPresenters = GetComponents<SlicePresenter>();
        }

        public void ApplyW(float w)
        {
            if (profile == null) return;

            EnsureBasePose();
            EnsureColliders();
            EnsurePresenters();

            float visibility = profile.VisibilityCurve.Evaluate(w);
            float solidity = profile.SolidityCurve.Evaluate(w);
            float glow = profile.GlowCurve.Evaluate(w);

            foreach (var slicePresenter in cachedPresenters)
            {
                if (slicePresenter != null)
                    slicePresenter.Apply(visibility, solidity, glow, w);
            }

            bool solid = profile.SolidRange.Contains(w);
            foreach (var col in colliders)
            {
                if (col != null) col.enabled = solid;
            }

            Vector3 offset = Vector3.Lerp(profile.PositionOffsetAtW0, profile.PositionOffsetAtW1, w);
            transform.localPosition = baseLocalPosition + offset;
        }

        private void EnsureBasePose()
        {
            if (hasBaseLocalPosition) return;
            CaptureBasePose();
        }

        private void EnsureColliders()
        {
            if (colliders != null && colliders.Length > 0) return;
            colliders = GetComponentsInChildren<Collider>(true);
        }

        private void EnsurePresenters()
        {
            if (cachedPresenters != null && cachedPresenters.Length > 0) return;
            cachedPresenters = GetComponents<SlicePresenter>();
        }
    }
}
