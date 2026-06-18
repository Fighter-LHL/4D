using UnityEngine;

namespace WSlice.Entities
{
    public sealed class ScalePresenter : SlicePresenter
    {
        [SerializeField] private Transform target;
        public Vector3 scaleAtW0 = Vector3.one;
        public Vector3 scaleAtW1 = Vector3.one;

        [SerializeField, HideInInspector] private Vector3 baseLocalScale;
        [SerializeField, HideInInspector] private bool hasBaseLocalScale;

        private void Awake()
        {
            if (target == null) target = transform;
            EnsureBaseScale();
        }

        private void OnValidate()
        {
            if (!Application.isPlaying)
                EnsureBaseScale();
        }

        [ContextMenu("Capture Base Scale")]
        public void CaptureBaseScale()
        {
            if (target == null) target = transform;
            baseLocalScale = target.localScale;
            hasBaseLocalScale = true;
        }

        private void EnsureBaseScale()
        {
            if (hasBaseLocalScale) return;
            CaptureBaseScale();
        }

        public override void Apply(float visibility, float solidity, float glow, float w)
        {
            if (target == null) target = transform;
            EnsureBaseScale();

            Vector3 wScale = Vector3.Lerp(scaleAtW0, scaleAtW1, w);
            target.localScale = Vector3.Scale(baseLocalScale, Vector3.Scale(wScale, Vector3.one * visibility));
        }
    }
}
