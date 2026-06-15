using UnityEngine;
using WSlice.Core;

namespace WSlice.Entities
{
    [CreateAssetMenu(menuName = "WSlice/Slice Profile", fileName = "SliceProfile")]
    public sealed class SliceProfile : ScriptableObject
    {
        public AnimationCurve VisibilityCurve = AnimationCurve.Constant(0f, 1f, 1f);
        public AnimationCurve SolidityCurve = AnimationCurve.Constant(0f, 1f, 1f);
        public AnimationCurve GlowCurve = AnimationCurve.Constant(0f, 1f, 0f);

        public Vector3 PositionOffsetAtW0;
        public Vector3 PositionOffsetAtW1;

        public WRange SolidRange = new() { Min = 0f, Max = 1f };
        public WRange InteractiveRange = new() { Min = 0f, Max = 1f };
    }
}
