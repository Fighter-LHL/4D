using UnityEngine;
using UnityEngine.SceneManagement;

namespace WSlice.Level
{
    public sealed class LevelFlowController : MonoBehaviour
    {
        [SerializeField] private LevelCatalog catalog;
        [SerializeField] private LevelRuntimeController levelController;
        [SerializeField] private LevelSessionController session;

        public bool HasNextLevelInCatalog =>
            LevelFlowModel.TryGetNext(catalog, CurrentLevelId, out _);

        private string CurrentLevelId =>
            levelController != null && levelController.Definition != null
                ? levelController.Definition.LevelId
                : string.Empty;

        public bool TryLoadNextLevel()
        {
            if (session == null || session.State != LevelSessionState.Completed)
                return false;

            if (!LevelFlowModel.TryGetNext(catalog, CurrentLevelId, out LevelCatalogEntry next))
                return false;

            return LoadScene(next.SceneName);
        }

        public bool TryLoadLevel(string levelId)
        {
            if (!LevelFlowModel.TryGetEntry(catalog, levelId, out LevelCatalogEntry entry))
                return false;

            return LoadScene(entry.SceneName);
        }

        private static bool LoadScene(string sceneName)
        {
            if (string.IsNullOrEmpty(sceneName))
                return false;

            SceneManager.LoadScene(sceneName);
            return true;
        }
    }
}
