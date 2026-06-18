using UnityEngine;
using UnityEngine.SceneManagement;
using WSlice.Level;

namespace WSlice.UI
{
    public sealed class LevelSelectView : MonoBehaviour
    {
        [SerializeField] private LevelCatalog catalog;

        public void LoadLevel(string levelId)
        {
            if (catalog == null || string.IsNullOrEmpty(levelId))
                return;

            if (!LevelFlowModel.TryGetEntry(catalog, levelId, out LevelCatalogEntry entry))
                return;

            if (!string.IsNullOrEmpty(entry.SceneName))
                SceneManager.LoadScene(entry.SceneName);
        }
    }
}
