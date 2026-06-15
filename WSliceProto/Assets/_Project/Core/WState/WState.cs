using System;
using UnityEngine;

namespace WSlice.Core
{
    public sealed class WState
    {
        public float CurrentW { get; private set; }
        public float TargetW { get; private set; }

        public event Action<float> OnWChanged;

        public void SetTarget(float targetW)
        {
            TargetW = Mathf.Clamp01(targetW);
        }

        public void Tick(float deltaTime, float smoothing)
        {
            if (smoothing < 0f)
                throw new ArgumentOutOfRangeException(nameof(smoothing), "smoothing must be non-negative");

            float next = Mathf.MoveTowards(CurrentW, TargetW, smoothing * deltaTime);
            if (Mathf.Approximately(next, CurrentW)) return;

            CurrentW = next;
            OnWChanged?.Invoke(CurrentW);
        }

        public void Force(float w)
        {
            CurrentW = TargetW = Mathf.Clamp01(w);
            OnWChanged?.Invoke(CurrentW);
        }
    }
}
