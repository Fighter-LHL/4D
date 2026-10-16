using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using WSlice.Level;

namespace WSlice.Editor
{
    public static class GardenGrayboxGenerator
    {
        [MenuItem("WSlice/Validate Garden Graybox")]
        public static void Validate()
        {
            GardenGrayboxValidationRunner.Validate();
        }

        [MenuItem("WSlice/Sync Garden Node Mirrors From LevelDefinition")]
        public static void SyncGardenNodeMirrorsFromLevelDefinition()
        {
            var levelDef = AssetDatabase.LoadAssetAtPath<LevelDefinition>(GardenGrayboxRecipe.LevelDefinitionPath);
            if (levelDef == null)
            {
                Debug.LogError("GardenLevel.asset not found. Cannot sync scene node mirrors.");
                return;
            }

            Scene scene = EditorSceneManager.OpenScene(GardenGrayboxRecipe.ScenePath, OpenSceneMode.Single);

            Undo.IncrementCurrentGroup();
            int undoGroup = Undo.GetCurrentGroup();
            Undo.SetCurrentGroupName("Sync Garden Node Mirrors");

            var nodesParent = GardenEditorUtilities.FindOrCreate("Nodes");
            Undo.RecordObject(nodesParent.transform, "Sync Garden Node Mirrors");
            nodesParent.transform.position = Vector3.zero;
            LevelNodeMirrorSync.SyncSceneNodeMirrors(levelDef, nodesParent.transform);

            EditorSceneManager.SaveScene(scene);
            Undo.CollapseUndoOperations(undoGroup);
            Debug.Log("Garden node mirrors synced from LevelDefinition.");
        }

        [MenuItem("WSlice/Generate Garden Graybox")]
        public static void Generate()
        {
            var levelDef = AssetDatabase.LoadAssetAtPath<LevelDefinition>(GardenGrayboxRecipe.LevelDefinitionPath);
            if (levelDef == null)
            {
                Debug.LogError("GardenLevel.asset not found. Aborting generation.");
                return;
            }

            Scene scene = EditorSceneManager.OpenScene(GardenGrayboxRecipe.ScenePath, OpenSceneMode.Single);

            Undo.IncrementCurrentGroup();
            int undoGroup = Undo.GetCurrentGroup();
            Undo.SetCurrentGroupName("Generate Garden Graybox");

            var flowerBase = levelDef.Nodes.Find(node => node.Id == "FlowerBase");
            var flowerTop = levelDef.Nodes.Find(node => node.Id == "FlowerTop");
            if (flowerBase == null || flowerTop == null)
            {
                Debug.LogError("GardenLevel.asset must define both ramp endpoints. Aborting generation.");
                return;
            }
            Undo.RecordObject(levelDef, "Align Garden Ramp Nodes");
            flowerBase.WorldPosition = GardenGrayboxRecipe.FlowerBasePosition;
            flowerTop.WorldPosition = GardenGrayboxRecipe.FlowerTopPosition;
            EditorUtility.SetDirty(levelDef);
            AssetDatabase.SaveAssetIfDirty(levelDef);

            var profiles = GardenProfileFactory.EnsureGardenProfiles();
            var sceneResult = GardenSceneBuilder.Build(levelDef, profiles);
            GardenUIBuilder.Build(sceneResult);
            GrayboxGeneratePipeline.FinalizeGeneratedScene();

            EditorSceneManager.SaveScene(scene);
            AssetDatabase.Refresh();
            Undo.CollapseUndoOperations(undoGroup);
            Debug.Log("GardenGraybox generated successfully.");
        }
    }
}
