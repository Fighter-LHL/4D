namespace WSlice.UI
{
    public static class LevelTutorialDismissRules
    {
        public const float DefaultWChangeThreshold = 0.08f;

        public static bool ShouldDismiss(
            bool isMoving,
            bool leverActivated,
            float initialW,
            float targetW,
            float wChangeThreshold = DefaultWChangeThreshold)
        {
            if (isMoving)
                return true;

            if (leverActivated)
                return true;

            return System.Math.Abs(targetW - initialW) >= wChangeThreshold;
        }
    }
}
