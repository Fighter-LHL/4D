using System.Collections.Generic;
using UnityEditor;
using UnityEngine;
using WSlice.Level;

namespace WSlice.Editor
{
    public static class LevelCatalogValidatorRunner
    {
        [MenuItem("WSlice/Validate Level Catalog")]
        public static void ValidateMenu()
        {
            Run(logSuccess: true, exitOnFailure: false);
        }

        public static void Validate()
        {
            Run(logSuccess: true, exitOnFailure: true);
        }

        private static void Run(bool logSuccess, bool exitOnFailure)
        {
            var catalog = AssetDatabase.LoadAssetAtPath<LevelCatalog>(LevelCatalogPaths.AssetPath);
            var definitions = LoadAllDefinitions();
            var buildScenes = ReadBuildScenes();
            var result = LevelCatalogValidator.Validate(catalog, definitions, buildScenes);

            foreach (string warning in result.Warnings)
                Debug.LogWarning(warning);

            if (!result.IsValid)
            {
                foreach (string error in result.Errors)
                    Debug.LogError(error);

                Debug.LogError("LevelCatalog validation failed.");
                if (exitOnFailure)
                    EditorApplication.Exit(1);
                return;
            }

            if (logSuccess)
                Debug.Log("LevelCatalog validation passed.");
        }

        private static List<LevelDefinition> LoadAllDefinitions()
        {
            var definitions = new List<LevelDefinition>();
            string[] guids = AssetDatabase.FindAssets("t:LevelDefinition");
            foreach (string guid in guids)
            {
                string path = AssetDatabase.GUIDToAssetPath(guid);
                var definition = AssetDatabase.LoadAssetAtPath<LevelDefinition>(path);
                if (definition != null)
                    definitions.Add(definition);
            }

            return definitions;
        }

        private static List<BuildSceneEntry> ReadBuildScenes()
        {
            var scenes = new List<BuildSceneEntry>();
            foreach (var scene in EditorBuildSettings.scenes)
            {
                scenes.Add(new BuildSceneEntry(
                    scene.path,
                    LevelCatalogValidator.GetSceneNameFromAssetPath(scene.path),
                    scene.enabled));
            }

            return scenes;
        }
    }
}
