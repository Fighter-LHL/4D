using UnityEngine;
using WSlice.Core;
using WSlice.Entities;

namespace WSlice.Level
{
    public sealed class LevelRuntimeController : MonoBehaviour
    {
        [SerializeField] private LevelDefinition definition;
        [SerializeField] private float wSmoothing = 2f;

        public WState WState { get; private set; }
        public LevelGraphRuntime Graph { get; private set; }
        public LevelDefinition Definition => definition;

        private void Awake()
        {
            WState = new WState();
            Graph = new LevelGraphRuntime(definition);
            if (definition != null) WState.Force(definition.InitialW);
            WState.OnWChanged += ApplyWToAllSliceEntities;
        }

        private void OnDestroy()
        {
            if (WState != null)
                WState.OnWChanged -= ApplyWToAllSliceEntities;
        }

        private void Update()
        {
            WState.Tick(Time.deltaTime, wSmoothing);
        }

        public void ApplyWToAllSliceEntities(float w)
        {
            Shader.SetGlobalFloat("_GlobalW", w);
            foreach (var entity in FindObjectsByType<SliceEntity>(FindObjectsSortMode.None))
            {
                entity.ApplyW(w);
            }
        }
    }
}
