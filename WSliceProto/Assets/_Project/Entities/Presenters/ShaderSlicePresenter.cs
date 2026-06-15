using UnityEngine;

namespace WSlice.Entities
{
    public sealed class ShaderSlicePresenter : SlicePresenter
    {
        [SerializeField] private Renderer targetRenderer;
        [SerializeField] private float objectWCenter;
        [SerializeField] private float objectWThickness = 0.05f;

        private MaterialPropertyBlock _block;
        private static readonly int CenterId = Shader.PropertyToID("_ObjectWCenter");
        private static readonly int ThicknessId = Shader.PropertyToID("_ObjectWThickness");

        private void Awake()
        {
            if (targetRenderer == null) targetRenderer = GetComponent<Renderer>();
            _block = new MaterialPropertyBlock();
        }

        public override void Apply(float visibility, float solidity, float glow, float w)
        {
            if (targetRenderer == null) return;
            targetRenderer.GetPropertyBlock(_block);
            _block.SetFloat(CenterId, objectWCenter);
            _block.SetFloat(ThicknessId, objectWThickness);
            targetRenderer.SetPropertyBlock(_block);
        }
    }
}
