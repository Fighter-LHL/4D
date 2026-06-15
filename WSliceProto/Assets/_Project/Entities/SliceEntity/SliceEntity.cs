using UnityEngine;
using WSlice.Core;

namespace WSlice.Entities
{
    public sealed class SliceEntity : MonoBehaviour
    {
        public SliceProfile profile;
        public SlicePresenter presenter;
        public Collider[] colliders;

        private Vector3 _basePosition;

        private void Awake()
        {
            _basePosition = transform.localPosition;
            if (colliders == null || colliders.Length == 0)
                colliders = GetComponentsInChildren<Collider>(true);
        }

        public void ApplyW(float w)
        {
            if (profile == null) return;

            float visibility = profile.VisibilityCurve.Evaluate(w);
            float solidity = profile.SolidityCurve.Evaluate(w);
            float glow = profile.GlowCurve.Evaluate(w);

            presenter?.Apply(visibility, solidity, glow, w);

            foreach (var extraPresenter in GetComponents<SlicePresenter>())
            {
                if (extraPresenter != null && extraPresenter != presenter)
                    extraPresenter.Apply(visibility, solidity, glow, w);
            }

            bool solid = profile.SolidRange.Contains(w);
            foreach (var col in colliders)
            {
                if (col != null) col.enabled = solid;
            }

            Vector3 offset = Vector3.Lerp(profile.PositionOffsetAtW0, profile.PositionOffsetAtW1, w);
            transform.localPosition = _basePosition + offset;
        }
    }
}
