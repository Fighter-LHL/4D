using WSlice.Core;

namespace WSlice.Entities
{
    public static class SliceInteractionModel
    {
        public static bool CanInteract(SliceProfile profile, float w)
        {
            return profile != null && profile.InteractiveRange.Contains(w);
        }

        public static bool CanInteract(SliceEntity entity, float w)
        {
            return entity != null && CanInteract(entity.profile, w);
        }
    }
}
