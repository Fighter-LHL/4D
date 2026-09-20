using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using WSlice.Level;
using WSlice.UI;

namespace WSlice.Editor
{
    // A single non-generating entry point for local and GameCI validation.
    // Legacy validators sometimes only log errors, so exit code alone is insufficient.
    public static class WSliceValidationRunner
    {
        [Serializable]
        private sealed class Receipt
        {
            public int schemaVersion = 1;
            public string status = "failed";
            public string startedUtc;
            public string finishedUtc;
            public int errorCount;
            public int warningCount;
            public List<string> validatedScopes = new();
        }

        public static void ValidateAll()
        {
            var receipt = new Receipt { startedUtc = DateTime.UtcNow.ToString("o") };
            string output = ReadOutputPath();
            Application.LogCallback capture = (message, stackTrace, type) =>
            {
                if (type == LogType.Error || type == LogType.Exception || type == LogType.Assert)
                    receipt.errorCount++;
                else if (type == LogType.Warning)
                    receipt.warningCount++;
            };
            Application.logMessageReceived += capture;
            try
            {
                ValidateLevel("Garden", GardenGrayboxRecipe.ScenePath, GardenGrayboxRecipe.LevelDefinitionPath,
                    GardenGrayboxGenerator.Validate, receipt);
                ValidateLevel("Platform", PlatformGrayboxRecipe.ScenePath, PlatformGrayboxRecipe.LevelDefinitionPath,
                    PlatformGrayboxGenerator.Validate, receipt);
                ValidateLevel("Gate", GateGrayboxRecipe.ScenePath, GateGrayboxRecipe.LevelDefinitionPath,
                    GateGrayboxGenerator.Validate, receipt);
                ValidateLevel("Chambers", ChambersGrayboxRecipe.ScenePath, ChambersGrayboxRecipe.LevelDefinitionPath,
                    ChambersGrayboxGenerator.Validate, receipt);
                ValidateLevel("Hazard", HazardGrayboxRecipe.ScenePath, HazardGrayboxRecipe.LevelDefinitionPath,
                    HazardGrayboxGenerator.Validate, receipt);
                ValidateLevel("Courtyard", CourtyardLayout.ScenePath, CourtyardLayout.DefinitionPath,
                    CourtyardSliceGenerator.Validate, receipt);
                // Menu variant reports errors without exiting before the receipt is saved.
                Validate("Catalog", () =>
                {
                    ValidateMenuCatalog();
                    LevelCatalogValidatorRunner.ValidateMenu();
                }, receipt);
            }
            finally
            {
                Application.logMessageReceived -= capture;
                receipt.finishedUtc = DateTime.UtcNow.ToString("o");
                receipt.status = receipt.errorCount == 0 && receipt.validatedScopes.Count == 7
                    ? "passed" : "failed";
                Directory.CreateDirectory(Path.GetDirectoryName(output));
                File.WriteAllText(output, JsonUtility.ToJson(receipt, true));
            }

            if (receipt.status != "passed")
                throw new InvalidOperationException($"W-Slice validation failed: {receipt.errorCount} error(s). Receipt: {output}");

            Debug.Log($"W-Slice validation completed: {receipt.validatedScopes.Count} scopes; receipt: {output}");
        }

        private static void ValidateLevel(string scope, string scenePath, string definitionPath,
            Action action, Receipt receipt)
        {
            Validate(scope, () =>
            {
                var expected = AssetDatabase.LoadAssetAtPath<LevelDefinition>(definitionPath);
                if (expected == null)
                    throw new InvalidOperationException($"{scope}: missing level definition at {definitionPath}.");

                // Inspect the persisted scene before legacy validators can report success.
                // Loading a definition asset alone does not prove the scene references it.
                var scene = EditorSceneManager.OpenScene(scenePath, OpenSceneMode.Single);
                var controller = RequireSingleSceneComponent<LevelRuntimeController>(scene);
                if (controller.Definition != expected)
                    throw new InvalidOperationException(
                        $"{scenePath}: LevelRuntimeController.Definition must reference {definitionPath}; " +
                        $"found {DescribeAsset(controller.Definition)}.");

                action();
            }, receipt);
        }

        private static void ValidateMenuCatalog()
        {
            var expected = AssetDatabase.LoadAssetAtPath<LevelCatalog>(LevelCatalogPaths.AssetPath);
            if (expected == null)
                throw new InvalidOperationException($"Missing level catalog at {LevelCatalogPaths.AssetPath}.");

            var scene = EditorSceneManager.OpenScene(LevelCatalogPaths.LevelSelectScenePath, OpenSceneMode.Single);
            var view = RequireSingleSceneComponent<LevelSelectView>(scene);
            var catalog = new SerializedObject(view).FindProperty("catalog");
            if (catalog == null || catalog.objectReferenceValue != expected)
                throw new InvalidOperationException(
                    $"{scene.path}: LevelSelectView.catalog must reference {LevelCatalogPaths.AssetPath}; " +
                    $"found {DescribeAsset(catalog?.objectReferenceValue)}.");
        }

        private static T RequireSingleSceneComponent<T>(Scene scene) where T : Component
        {
            var components = scene.GetRootGameObjects()
                .SelectMany(root => root.GetComponentsInChildren<T>(true)).ToArray();
            if (components.Length != 1)
                throw new InvalidOperationException(
                    $"{scene.path}: expected exactly one {typeof(T).Name}, found {components.Length}.");
            return components[0];
        }

        private static string DescribeAsset(UnityEngine.Object asset) =>
            asset == null ? "<missing>" : AssetDatabase.GetAssetPath(asset);

        private static void Validate(string scope, Action action, Receipt receipt)
        {
            int before = receipt.errorCount;
            try
            {
                action();
                if (receipt.errorCount == before)
                    receipt.validatedScopes.Add(scope);
            }
            catch (Exception exception)
            {
                Debug.LogException(exception);
            }
        }

        private static string ReadOutputPath()
        {
            string[] arguments = Environment.GetCommandLineArgs();
            for (int i = 0; i < arguments.Length - 1; i++)
            {
                if (arguments[i] != "-wsliceValidationReport") continue;
                string path = arguments[i + 1];
                return Path.IsPathRooted(path) ? path : Path.GetFullPath(
                    Path.Combine(Application.dataPath, "..", path));
            }
            throw new ArgumentException("Missing -wsliceValidationReport; use scripts/validate-local.sh.");
        }
    }
}
