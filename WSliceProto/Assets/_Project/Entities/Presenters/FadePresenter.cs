using UnityEngine;

namespace WSlice.Entities
{
    public sealed class FadePresenter : SlicePresenter
    {
        [SerializeField] private Renderer targetRenderer;
        private MaterialPropertyBlock _block;
        private static readonly int AlphaId = Shader.PropertyToID("_Alpha");

        private void Awake()
        {
            if (targetRenderer == null) targetRenderer = GetComponent<Renderer>();
            _block = new MaterialPropertyBlock();
        }

        public override void Apply(float visibility, float solidity, float glow, float w)
        {
            if (targetRenderer == null) return;
            targetRenderer.GetPropertyBlock(_block);
            _block.SetFloat(AlphaId, visibility);
            targetRenderer.SetPropertyBlock(_block);
        }
    }
}
