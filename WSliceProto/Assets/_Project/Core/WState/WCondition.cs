using System;
using UnityEngine;

namespace WSlice.Core
{
    [Serializable]
    public sealed class WCondition
    {
        public WRange ActiveRange;
        public bool Invert;

        public bool Evaluate(float w)
        {
            bool inside = ActiveRange.Contains(w);
            return Invert ? !inside : inside;
        }
    }
}
