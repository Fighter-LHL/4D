namespace WSlice.UI
{
    public static class LevelSelectButtonModel
    {
        public static string FormatButtonLabel(string displayName, string themeHint)
        {
            if (string.IsNullOrWhiteSpace(themeHint))
                return displayName ?? string.Empty;

            if (string.IsNullOrWhiteSpace(displayName))
                return themeHint;

            return displayName + "\n<size=18><color=#C8D4E8>" + themeHint + "</color></size>";
        }
    }
}
