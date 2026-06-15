using UnityEngine;

namespace WSlice.Entities
{
    public sealed class ScalePresenter : SlicePresenter
    {
        [SerializeField] private Transform target;
        public Vector3 scaleAtW0 = Vector3.one;
        public Vector3 scaleAtW1 = Vector3.one;

        private void Awake()
        {
            if (target == null) target = transform;
        }

        public override void Apply(float visibility, float solidity, float glow, float w)
        {
            if (target == null) return;
            Vector3 baseScale = Vector3.Lerp(scaleAtW0, scaleAtW1, w);
            target.localScale = Vector3.Scale(baseScale, new Vector3(visibility, visibility, visibility));
        }
    }
}
