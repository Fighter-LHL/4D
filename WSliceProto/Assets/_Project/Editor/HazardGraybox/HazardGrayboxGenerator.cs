using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using WSlice.Entities;
using WSlice.Level;
using WSlice.Player;

namespace WSlice.Editor
{
    public static class HazardGrayboxGenerator
    {
        [MenuItem("WSlice/Generate Hazard Graybox")]
        public static void Generate()
        {
            var levelDef = AssetDatabase.LoadAssetAtPath<LevelDefinition>(HazardGrayboxRecipe.LevelDefinitionPath);
            if (levelDef == null)
            {
                Debug.LogError("HazardLevel.asset not found. Aborting generation.");
                return;
            }

            EnsureSceneAssetExists();
            Scene scene = EditorSceneManager.OpenScene(HazardGrayboxRecipe.ScenePath, OpenSceneMode.Single);

            Undo.IncrementCurrentGroup();
            int undoGroup = Undo.GetCurrentGroup();
            Undo.SetCurrentGroupName("Generate Hazard Graybox");

            var platformProfile = HazardProfileFactory.EnsureHazardPlatformProfile();
            var sceneResult = HazardSceneBuilder.Build(levelDef, platformProfile);
            GardenUIBuilder.Build(sceneResult);
            GrayboxGeneratePipeline.FinalizeGeneratedScene();

            EditorSceneManager.SaveScene(scene);
            AssetDatabase.Refresh();
            Undo.CollapseUndoOperations(undoGroup);
            Debug.Log("HazardGraybox generated successfully.");
        }

        [MenuItem("WSlice/Validate Hazard Graybox")]
        public static void Validate()
        {
            int errors = 0;

            var levelDef = AssetDatabase.LoadAssetAtPath<LevelDefinition>(HazardGrayboxRecipe.LevelDefinitionPath);
            if (levelDef == null)
            {
                Debug.LogError("HazardLevel.asset missing");
                errors++;
            }
            else
            {
                var validation = LevelDefinitionValidator.Validate(levelDef);
                foreach (string error in validation.Errors)
                {
                    Debug.LogError(error);
                    errors++;
                }
            }

            var platformProfile = AssetDatabase.LoadAssetAtPath<SliceProfile>(
                $"{GrayboxLevelRecipe.ProfileDirectory}/HazardPlatformProfile.asset");
            if (platformProfile == null)
            {
                Debug.LogError("HazardPlatformProfile.asset missing");
                errors++;
            }
            else if (platformProfile.PositionOffsetAtW0.y >= platformProfile.PositionOffsetAtW1.y)
            {
                Debug.LogError("HazardPlatformProfile should rise from W0 to W1 via PositionOffset.");
                errors++;
            }

            if (!File.Exists(HazardGrayboxRecipe.ScenePath))
            {
                Debug.LogError("HazardGraybox.unity scene is missing");
                errors++;
            }
            else
            {
                EditorSceneManager.OpenScene(HazardGrayboxRecipe.ScenePath, OpenSceneMode.Single);
                errors += RequireObject("HazardPlatform", typeof(SliceEntity));
                errors += RequireObject("LevelRuntime", typeof(LevelRuntimeController), typeof(LevelSessionController));
                errors += RequireObject("PathPreview", typeof(LevelPathPreviewRenderer));
            }

            if (errors == 0)
                Debug.Log("HazardGraybox validation passed.");
            else
                Debug.LogWarning($"HazardGraybox validation finished with {errors} error(s).");
        }

        private static void EnsureSceneAssetExists()
        {
            if (File.Exists(HazardGrayboxRecipe.ScenePath))
                return;

            string directory = Path.GetDirectoryName(HazardGrayboxRecipe.ScenePath);
            if (!string.IsNullOrEmpty(directory) && !Directory.Exists(directory))
                Directory.CreateDirectory(directory);

            var scene = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);
            EditorSceneManager.SaveScene(scene, HazardGrayboxRecipe.ScenePath);
        }

        private static int RequireObject(string name, params System.Type[] expectedComponents)
        {
            var go = GameObject.Find(name);
            if (go == null)
            {
                Debug.LogError($"Required object '{name}' not found in scene");
                return 1;
            }

            foreach (var type in expectedComponents)
            {
                if (type != null && !go.TryGetComponent(type, out _))
                {
                    Debug.LogError($"Object '{name}' is missing component {type.Name}");
                    return 1;
                }
            }

            return 0;
        }
    }
}
