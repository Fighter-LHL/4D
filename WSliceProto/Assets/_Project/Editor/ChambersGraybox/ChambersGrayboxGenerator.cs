using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using WSlice.Level;
using WSlice.Player;

namespace WSlice.Editor
{
    public static class ChambersGrayboxGenerator
    {
        [MenuItem("WSlice/Generate Chambers Graybox")]
        public static void Generate()
        {
            var levelDef = AssetDatabase.LoadAssetAtPath<LevelDefinition>(ChambersGrayboxRecipe.LevelDefinitionPath);
            if (levelDef == null)
            {
                Debug.LogError("ChambersLevel.asset not found. Aborting generation.");
                return;
            }

            EnsureSceneAssetExists();
            Scene scene = EditorSceneManager.OpenScene(ChambersGrayboxRecipe.ScenePath, OpenSceneMode.Single);

            Undo.IncrementCurrentGroup();
            int undoGroup = Undo.GetCurrentGroup();
            Undo.SetCurrentGroupName("Generate Chambers Graybox");

            var sceneResult = ChambersSceneBuilder.Build(levelDef);
            GardenUIBuilder.Build(sceneResult);
            GrayboxGeneratePipeline.FinalizeGeneratedScene();

            EditorSceneManager.SaveScene(scene);
            AssetDatabase.Refresh();
            Undo.CollapseUndoOperations(undoGroup);
            Debug.Log("ChambersGraybox generated successfully.");
        }

        [MenuItem("WSlice/Validate Chambers Graybox")]
        public static void Validate()
        {
            int errors = 0;

            var levelDef = AssetDatabase.LoadAssetAtPath<LevelDefinition>(ChambersGrayboxRecipe.LevelDefinitionPath);
            if (levelDef == null)
            {
                Debug.LogError("ChambersLevel.asset missing");
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

            if (!File.Exists(ChambersGrayboxRecipe.ScenePath))
            {
                Debug.LogError("ChambersGraybox.unity scene is missing");
                errors++;
            }
            else
            {
                EditorSceneManager.OpenScene(ChambersGrayboxRecipe.ScenePath, OpenSceneMode.Single);
                errors += RequireObject("LevelRuntime", typeof(LevelRuntimeController), typeof(LevelSessionController));
                errors += RequireObject("PathPreview", typeof(LevelPathPreviewRenderer));
                errors += RequireObject("GoalMarker");
            }

            if (errors == 0)
                Debug.Log("ChambersGraybox validation passed.");
            else
                Debug.LogWarning($"ChambersGraybox validation finished with {errors} error(s).");
        }

        private static void EnsureSceneAssetExists()
        {
            if (File.Exists(ChambersGrayboxRecipe.ScenePath))
                return;

            string directory = Path.GetDirectoryName(ChambersGrayboxRecipe.ScenePath);
            if (!string.IsNullOrEmpty(directory) && !Directory.Exists(directory))
                Directory.CreateDirectory(directory);

            var scene = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);
            EditorSceneManager.SaveScene(scene, ChambersGrayboxRecipe.ScenePath);
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
