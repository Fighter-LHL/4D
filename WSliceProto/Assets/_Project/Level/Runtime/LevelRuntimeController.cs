using System;
using UnityEngine;
using WSlice.Core;
using WSlice.Entities;

namespace WSlice.Level
{
    public sealed class LevelRuntimeController : MonoBehaviour
    {
        [SerializeField] private LevelDefinition definition;
        [SerializeField] private float wSmoothing = 2f;

        private SliceEntity[] sliceEntities = Array.Empty<SliceEntity>();
        private bool sliceEntityCacheReady;

        public WState WState { get; private set; }
        public LevelGraphRuntime Graph { get; private set; }
        public LevelDefinition Definition => definition;

        private void Awake()
        {
            WState = new WState();
            Graph = definition != null ? new LevelGraphRuntime(definition) : new LevelGraphRuntime();
            RefreshSliceEntityCache();

            WState.OnWChanged += ApplyWToAllSliceEntities;

            if (definition != null)
                WState.Force(definition.InitialW);
            else
                ApplyWToAllSliceEntities(WState.CurrentW);
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

        public void ResetToInitialState()
        {
            if (definition == null || WState == null)
                return;

            WState.Force(definition.InitialW);
        }

        public void RefreshSliceEntityCache()
        {
            sliceEntities = FindObjectsByType<SliceEntity>(FindObjectsSortMode.None);
            foreach (var entity in sliceEntities)
            {
                if (entity != null)
                    entity.RefreshRuntimeCache();
            }
            sliceEntityCacheReady = true;
        }

        public void ApplyWToAllSliceEntities(float w)
        {
            Shader.SetGlobalFloat("_GlobalW", w);

            if (!sliceEntityCacheReady)
                RefreshSliceEntityCache();

            foreach (var entity in sliceEntities)
            {
                if (entity != null)
                    entity.ApplyW(w);
            }
        }
    }
}
