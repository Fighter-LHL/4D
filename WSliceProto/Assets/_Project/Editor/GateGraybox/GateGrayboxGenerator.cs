using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using WSlice.Entities;
using WSlice.Level;

namespace WSlice.Editor
{
    public static class GateGrayboxGenerator
    {
        [MenuItem("WSlice/Generate Gate Graybox")]
        public static void Generate()
        {
            var levelDef = AssetDatabase.LoadAssetAtPath<LevelDefinition>(GateGrayboxRecipe.LevelDefinitionPath);
            if (levelDef == null)
            {
                Debug.LogError("GateLevel.asset not found. Aborting generation.");
                return;
            }

            var gateEdge = levelDef.Edges.Find(edge => edge.FromNodeId == "GateRoom" && edge.ToNodeId == "Goal");
            if (gateEdge == null)
            {
                Debug.LogError("GateLevel.asset has no GateRoom-to-Goal edge. Aborting generation.");
                return;
            }
            // A narrow W interval is not a lock: the lever must explicitly unlock this edge.
            gateEdge.IsLocked = true;
            gateEdge.WalkableRange = new WSlice.Core.WRange { Min = 0.30f, Max = 0.55f };
            EditorUtility.SetDirty(levelDef);
            AssetDatabase.SaveAssets();

            EnsureSceneAssetExists();
            Scene scene = EditorSceneManager.OpenScene(GateGrayboxRecipe.ScenePath, OpenSceneMode.Single);

            Undo.IncrementCurrentGroup();
            int undoGroup = Undo.GetCurrentGroup();
            Undo.SetCurrentGroupName("Generate Gate Graybox");

            var leverProfile = GateProfileFactory.EnsureLeverProfile();
            var sceneResult = GateSceneBuilder.Build(levelDef, leverProfile);
            GardenUIBuilder.Build(sceneResult);
            GrayboxGeneratePipeline.FinalizeGeneratedScene();

            EditorSceneManager.SaveScene(scene);
            AssetDatabase.Refresh();
            Undo.CollapseUndoOperations(undoGroup);
            Debug.Log("GateGraybox generated successfully.");
        }

        [MenuItem("WSlice/Validate Gate Graybox")]
        public static void Validate()
        {
            int errors = 0;

            var levelDef = AssetDatabase.LoadAssetAtPath<LevelDefinition>(GateGrayboxRecipe.LevelDefinitionPath);
            if (levelDef == null)
            {
                Debug.LogError("GateLevel.asset missing");
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

                var gateEdge = levelDef.Edges.Find(edge => edge.FromNodeId == "GateRoom" && edge.ToNodeId == "Goal");
                if (gateEdge == null || !gateEdge.IsLocked
                    || !Mathf.Approximately(gateEdge.WalkableRange.Min, 0.30f)
                    || !Mathf.Approximately(gateEdge.WalkableRange.Max, 0.55f))
                {
                    Debug.LogError("GateRoom-to-Goal must start explicitly locked with the lever's 0.30-0.55 W range.");
                    errors++;
                }
            }

            if (!File.Exists(GateGrayboxRecipe.ScenePath))
            {
                Debug.LogError("GateGraybox.unity scene is missing");
                errors++;
            }
            else
            {
                EditorSceneManager.OpenScene(GateGrayboxRecipe.ScenePath, OpenSceneMode.Single);
                errors += RequireObject("GateLever", typeof(SliceEntity), typeof(GateLeverInteractable));
                errors += RequireObject("LevelRuntime", typeof(LevelRuntimeController), typeof(LevelSessionController));
            }

            if (errors == 0)
                Debug.Log("GateGraybox validation passed.");
            else
                Debug.LogWarning($"GateGraybox validation finished with {errors} error(s).");
        }

        private static void EnsureSceneAssetExists()
        {
            if (File.Exists(GateGrayboxRecipe.ScenePath))
                return;

            string directory = Path.GetDirectoryName(GateGrayboxRecipe.ScenePath);
            if (!string.IsNullOrEmpty(directory) && !Directory.Exists(directory))
                Directory.CreateDirectory(directory);

            var scene = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);
            EditorSceneManager.SaveScene(scene, GateGrayboxRecipe.ScenePath);
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
