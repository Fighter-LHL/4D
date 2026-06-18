using System.Collections.Generic;

namespace WSlice.UI
{
    public sealed class WDialEdgeBand
    {
        public string Label { get; }
        public float MinW { get; }
        public float MaxW { get; }
        public bool AvailableAtCurrentW { get; }
        public bool AvailableAtTargetW { get; }

        public WDialEdgeBand(
            string label,
            float minW,
            float maxW,
            bool availableAtCurrentW,
            bool availableAtTargetW)
        {
            Label = label ?? string.Empty;
            MinW = minW;
            MaxW = maxW;
            AvailableAtCurrentW = availableAtCurrentW;
            AvailableAtTargetW = availableAtTargetW;
        }
    }

    public sealed class WDialTrackState
    {
        public float CurrentW { get; }
        public float TargetW { get; }
        public IReadOnlyList<float> SnapTicks { get; }
        public IReadOnlyList<WDialEdgeBand> EdgeBands { get; }
        public bool HasBreakRisk { get; }

        public WDialTrackState(
            float currentW,
            float targetW,
            IReadOnlyList<float> snapTicks,
            IReadOnlyList<WDialEdgeBand> edgeBands,
            bool hasBreakRisk)
        {
            CurrentW = currentW;
            TargetW = targetW;
            SnapTicks = snapTicks ?? new List<float>().AsReadOnly();
            EdgeBands = edgeBands ?? new List<WDialEdgeBand>().AsReadOnly();
            HasBreakRisk = hasBreakRisk;
        }
    }
}
