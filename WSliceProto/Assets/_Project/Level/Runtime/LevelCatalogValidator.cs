using System.Collections.Generic;
using System.IO;

namespace WSlice.Level
{
    public static class LevelCatalogValidator
    {
        public static LevelDefinitionValidationResult Validate(
            LevelCatalog catalog,
            IReadOnlyList<LevelDefinition> definitions,
            IReadOnlyList<BuildSceneEntry> buildScenes)
        {
            var errors = new List<string>();
            var warnings = new List<string>();

            if (catalog == null)
            {
                errors.Add("LevelCatalog is missing.");
                return new LevelDefinitionValidationResult(errors.AsReadOnly(), warnings.AsReadOnly());
            }

            if (catalog.Entries == null || catalog.Entries.Count == 0)
            {
                errors.Add("LevelCatalog has no entries.");
                return new LevelDefinitionValidationResult(errors.AsReadOnly(), warnings.AsReadOnly());
            }

            ValidateEntries(catalog, definitions, errors);
            ValidateBuildSettings(catalog, buildScenes, errors, warnings);

            return new LevelDefinitionValidationResult(errors.AsReadOnly(), warnings.AsReadOnly());
        }

        private static void ValidateEntries(
            LevelCatalog catalog,
            IReadOnlyList<LevelDefinition> definitions,
            List<string> errors)
        {
            var levelIds = new HashSet<string>();
            var sceneNames = new HashSet<string>();
            var definitionsByLevelId = IndexDefinitionsByLevelId(definitions);

            foreach (var entry in catalog.Entries)
            {
                if (string.IsNullOrWhiteSpace(entry.LevelId))
                {
                    errors.Add("Catalog entry LevelId is missing.");
                    continue;
                }

                if (!levelIds.Add(entry.LevelId))
                    errors.Add($"Duplicate catalog LevelId '{entry.LevelId}'.");

                if (string.IsNullOrWhiteSpace(entry.SceneName))
                {
                    errors.Add($"Catalog entry '{entry.LevelId}' SceneName is missing.");
                    continue;
                }

                if (!sceneNames.Add(entry.SceneName))
                    errors.Add($"Duplicate catalog SceneName '{entry.SceneName}'.");

                if (!definitionsByLevelId.TryGetValue(entry.LevelId, out LevelDefinition definition))
                {
                    errors.Add($"No LevelDefinition found for catalog LevelId '{entry.LevelId}'.");
                    continue;
                }

                if (definition.LevelId != entry.LevelId)
                {
                    errors.Add(
                        $"LevelDefinition '{definition.name}' LevelId '{definition.LevelId}' "
                        + $"does not match catalog entry '{entry.LevelId}'.");
                }
            }
        }

        private static void ValidateBuildSettings(
            LevelCatalog catalog,
            IReadOnlyList<BuildSceneEntry> buildScenes,
            List<string> errors,
            List<string> warnings)
        {
            if (buildScenes == null || buildScenes.Count == 0)
            {
                warnings.Add("Build settings are unavailable; skipped build scene checks.");
                return;
            }

            var enabledScenes = new List<BuildSceneEntry>();
            foreach (var scene in buildScenes)
            {
                if (scene.Enabled)
                    enabledScenes.Add(scene);
            }

            if (enabledScenes.Count == 0)
            {
                errors.Add("No enabled scenes in Build Settings.");
                return;
            }

            if (enabledScenes[0].SceneName != LevelCatalogPaths.LevelSelectSceneName)
            {
                errors.Add(
                    $"First enabled Build Settings scene must be '{LevelCatalogPaths.LevelSelectSceneName}', "
                    + $"found '{enabledScenes[0].SceneName}'.");
            }

            var enabledSceneNames = new HashSet<string>();
            foreach (var scene in enabledScenes)
                enabledSceneNames.Add(scene.SceneName);

            foreach (var entry in catalog.Entries)
            {
                if (string.IsNullOrWhiteSpace(entry.SceneName))
                    continue;

                if (!enabledSceneNames.Contains(entry.SceneName))
                {
                    errors.Add(
                        $"Catalog scene '{entry.SceneName}' for '{entry.LevelId}' is not enabled in Build Settings.");
                }
            }

            var catalogSceneNames = new HashSet<string>();
            foreach (var entry in catalog.Entries)
            {
                if (!string.IsNullOrWhiteSpace(entry.SceneName))
                    catalogSceneNames.Add(entry.SceneName);
            }

            foreach (var scene in enabledScenes)
            {
                if (scene.SceneName == LevelCatalogPaths.LevelSelectSceneName)
                    continue;

                if (!catalogSceneNames.Contains(scene.SceneName))
                {
                    warnings.Add(
                        $"Enabled build scene '{scene.SceneName}' is not listed in LevelCatalog.");
                }
            }
        }

        private static Dictionary<string, LevelDefinition> IndexDefinitionsByLevelId(
            IReadOnlyList<LevelDefinition> definitions)
        {
            var map = new Dictionary<string, LevelDefinition>();
            if (definitions == null)
                return map;

            foreach (var definition in definitions)
            {
                if (definition == null || string.IsNullOrWhiteSpace(definition.LevelId))
                    continue;

                if (map.ContainsKey(definition.LevelId))
                    continue;

                map[definition.LevelId] = definition;
            }

            return map;
        }

        public static string GetSceneNameFromAssetPath(string assetPath)
        {
            if (string.IsNullOrWhiteSpace(assetPath))
                return string.Empty;

            return Path.GetFileNameWithoutExtension(assetPath);
        }
    }
}
