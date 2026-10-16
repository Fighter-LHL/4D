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
    public static class PlatformGrayboxGenerator
    {
        [MenuItem("WSlice/Generate Platform Graybox")]
        public static void Generate()
        {
            var levelDef = AssetDatabase.LoadAssetAtPath<LevelDefinition>(PlatformGrayboxRecipe.LevelDefinitionPath);
            if (levelDef == null)
            {
                Debug.LogError("PlatformLevel.asset not found. Aborting generation.");
                return;
            }

            EnsureSceneAssetExists();
            Scene scene = EditorSceneManager.OpenScene(PlatformGrayboxRecipe.ScenePath, OpenSceneMode.Single);

            Undo.IncrementCurrentGroup();
            int undoGroup = Undo.GetCurrentGroup();
            Undo.SetCurrentGroupName("Generate Platform Graybox");

            var bridgeProfile = PlatformProfileFactory.EnsureBridgeProfile();
            var sceneResult = PlatformSceneBuilder.Build(levelDef, bridgeProfile);
            GardenUIBuilder.Build(sceneResult);
            GrayboxGeneratePipeline.FinalizeGeneratedScene();

            EditorSceneManager.SaveScene(scene);
            AssetDatabase.Refresh();
            Undo.CollapseUndoOperations(undoGroup);
            Debug.Log("PlatformGraybox generated successfully.");
        }

        [MenuItem("WSlice/Validate Platform Graybox")]
        public static void Validate()
        {
            int errors = 0;

            var levelDef = AssetDatabase.LoadAssetAtPath<LevelDefinition>(PlatformGrayboxRecipe.LevelDefinitionPath);
            if (levelDef == null)
            {
                Debug.LogError("PlatformLevel.asset missing");
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

            var bridgeProfile = AssetDatabase.LoadAssetAtPath<SliceProfile>(
                $"{PlatformGrayboxRecipe.ProfileDirectory}/PlatformBridgeProfile.asset");
            if (bridgeProfile == null)
            {
                Debug.LogError("PlatformBridgeProfile.asset missing");
                errors++;
            }
            else if (bridgeProfile.PositionOffsetAtW0.y >= bridgeProfile.PositionOffsetAtW1.y)
            {
                Debug.LogError("PlatformBridgeProfile should rise from W0 to W1 via PositionOffset.");
                errors++;
            }

            if (!File.Exists(PlatformGrayboxRecipe.ScenePath))
            {
                Debug.LogError("PlatformGraybox.unity scene is missing");
                errors++;
            }
            else
            {
                EditorSceneManager.OpenScene(PlatformGrayboxRecipe.ScenePath, OpenSceneMode.Single);
                errors += RequireObject("OffsetBridge", typeof(SliceEntity));
                errors += RequireObject("LevelRuntime", typeof(LevelRuntimeController), typeof(LevelSessionController));
                errors += RequireObject("PathPreview", typeof(LevelPathPreviewRenderer));
            }

            if (errors == 0)
                Debug.Log("PlatformGraybox validation passed.");
            else
                Debug.LogWarning($"PlatformGraybox validation finished with {errors} error(s).");
        }

        private static void EnsureSceneAssetExists()
        {
            if (File.Exists(PlatformGrayboxRecipe.ScenePath))
                return;

            string directory = Path.GetDirectoryName(PlatformGrayboxRecipe.ScenePath);
            if (!string.IsNullOrEmpty(directory) && !Directory.Exists(directory))
                Directory.CreateDirectory(directory);

            var scene = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);
            EditorSceneManager.SaveScene(scene, PlatformGrayboxRecipe.ScenePath);
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
