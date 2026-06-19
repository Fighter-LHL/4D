using System;
using System.Collections.Generic;

namespace WSlice.Level
{
    [Serializable]
    public struct LevelCatalogEntry
    {
        public string LevelId;
        public string DisplayName;
        public string ThemeHint;
        public string SceneName;
    }

    public static class LevelFlowModel
    {
        public static bool TryGetEntry(LevelCatalog catalog, string levelId, out LevelCatalogEntry entry)
        {
            entry = default;
            if (catalog == null || catalog.Entries == null || string.IsNullOrEmpty(levelId))
                return false;

            for (int i = 0; i < catalog.Entries.Count; i++)
            {
                if (catalog.Entries[i].LevelId == levelId)
                {
                    entry = catalog.Entries[i];
                    return !string.IsNullOrEmpty(entry.SceneName);
                }
            }

            return false;
        }

        public static bool TryGetNext(LevelCatalog catalog, string currentLevelId, out LevelCatalogEntry next)
        {
            next = default;
            if (catalog == null || catalog.Entries == null || string.IsNullOrEmpty(currentLevelId))
                return false;

            int index = FindIndex(catalog.Entries, currentLevelId);
            if (index < 0 || index >= catalog.Entries.Count - 1)
                return false;

            next = catalog.Entries[index + 1];
            return !string.IsNullOrEmpty(next.SceneName);
        }

        public static IReadOnlyList<LevelCatalogEntry> GetEntries(LevelCatalog catalog)
        {
            if (catalog == null || catalog.Entries == null)
                return Array.Empty<LevelCatalogEntry>();

            return catalog.Entries;
        }

        private static int FindIndex(IReadOnlyList<LevelCatalogEntry> entries, string levelId)
        {
            for (int i = 0; i < entries.Count; i++)
            {
                if (entries[i].LevelId == levelId)
                    return i;
            }

            return -1;
        }
    }
}
