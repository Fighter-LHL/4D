using System.Collections.Generic;
using UnityEngine;

namespace WSlice.Level
{
    [CreateAssetMenu(
        fileName = "LevelCatalog",
        menuName = "WSlice/Level Catalog",
        order = 0)]
    public sealed class LevelCatalog : ScriptableObject
    {
        public List<LevelCatalogEntry> Entries = new();
    }
}
