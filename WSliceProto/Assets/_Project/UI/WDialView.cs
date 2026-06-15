using UnityEngine;
using UnityEngine.UI;
using WSlice.Core;
using WSlice.Level;

namespace WSlice.UI
{
    public sealed class WDialView : MonoBehaviour
    {
        [SerializeField] private Slider slider;
        [SerializeField] private WState wState;

        private void Start()
        {
            if (wState == null)
            {
                var level = FindFirstObjectByType<LevelRuntimeController>();
                if (level != null) Bind(level.WState);
            }
        }

        private void OnEnable()
        {
            if (slider != null)
                slider.onValueChanged.AddListener(OnSliderChanged);
            if (wState != null)
                wState.OnWChanged += OnWChanged;
        }

        private void OnDisable()
        {
            if (slider != null)
                slider.onValueChanged.RemoveListener(OnSliderChanged);
            if (wState != null)
                wState.OnWChanged -= OnWChanged;
        }

        public void Bind(WState state)
        {
            if (wState != null) wState.OnWChanged -= OnWChanged;
            wState = state;
            if (wState != null)
            {
                wState.OnWChanged += OnWChanged;
                OnWChanged(wState.CurrentW);
            }
        }

        private void OnSliderChanged(float value)
        {
            wState?.SetTarget(value);
        }

        private void OnWChanged(float w)
        {
            if (slider != null)
                slider.SetValueWithoutNotify(w);
        }
    }
}
