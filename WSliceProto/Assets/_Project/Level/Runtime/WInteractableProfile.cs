using System;
using WSlice.Entities;

namespace WSlice.Level
{
    [Serializable]
    public sealed class WInteractableProfile
    {
        public string DisplayName = "Object";
        public GraphEdgeUnlockAction UnlockAction;
    }

    public static class WInteractableProfileModel
    {
        public static string BuildNotInteractiveHint(WInteractableProfile profile, SliceProfile sliceProfile)
        {
            string name = profile != null && !string.IsNullOrWhiteSpace(profile.DisplayName)
                ? profile.DisplayName
                : "Object";

            if (sliceProfile == null)
                return $"{name} is not interactive at this W.";

            return $"{name} works at W {sliceProfile.InteractiveRange.Min:F2}-{sliceProfile.InteractiveRange.Max:F2}.";
        }
    }
}
