using System.Collections.Generic;
using UnityEngine;

namespace WSlice.Core
{
    public static class WSnapResolver
    {
        public static float Resolve(float rawW, IReadOnlyList<float> snapPoints, float snapRadius)
        {
            if (snapPoints == null || snapPoints.Count == 0 || snapRadius <= 0f)
                return rawW;

            float nearest = rawW;
            float minDist = float.MaxValue;
            for (int i = 0; i < snapPoints.Count; i++)
            {
                float d = Mathf.Abs(snapPoints[i] - rawW);
                if (d < minDist)
                {
                    minDist = d;
                    nearest = snapPoints[i];
                }
            }

            return minDist <= snapRadius ? nearest : rawW;
        }
    }
}
