using System;
using UnityEngine;

namespace WSlice.Core
{
    [Serializable]
    public struct WRange : IEquatable<WRange>
    {
        [Range(0f, 1f)] public float Min;
        [Range(0f, 1f)] public float Max;

        public bool Contains(float w)
        {
            float a = Mathf.Min(Min, Max);
            float b = Mathf.Max(Min, Max);
            return w >= a && w <= b;
        }

        public float DistanceTo(float w)
        {
            float a = Mathf.Min(Min, Max);
            float b = Mathf.Max(Min, Max);
            if (w >= a && w <= b) return 0f;
            return w < a ? a - w : w - b;
        }

        public bool Equals(WRange other) => Min.Equals(other.Min) && Max.Equals(other.Max);
        public override bool Equals(object obj) => obj is WRange other && Equals(other);
        public override int GetHashCode() => HashCode.Combine(Min, Max);
    }
}
