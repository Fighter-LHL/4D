using UnityEditor;
using UnityEngine;
using WSlice.Level;
using WSlice.Player;

namespace WSlice.Editor
{
    public static class GrayboxLevelFlowWiring
    {
        public static LevelFlowController WireLevelFlow(
            GameObject levelRuntime,
            LevelRuntimeController levelController,
            LevelSessionController sessionController,
            GameObject inputRoot,
            PlayerInputRouter inputRouter,
            LevelPlayerReset playerReset)
        {
            var catalog = AssetDatabase.LoadAssetAtPath<LevelCatalog>(LevelCatalogPaths.AssetPath);
            var flow = levelRuntime.GetComponent<LevelFlowController>() ?? levelRuntime.AddComponent<LevelFlowController>();

            var flowSo = new SerializedObject(flow);
            flowSo.FindProperty("catalog").objectReferenceValue = catalog;
            flowSo.FindProperty("levelController").objectReferenceValue = levelController;
            flowSo.FindProperty("session").objectReferenceValue = sessionController;
            flowSo.ApplyModifiedProperties();

            var nextInput = inputRoot.GetComponent<LevelNextInput>() ?? inputRoot.AddComponent<LevelNextInput>();
            var nextSo = new SerializedObject(nextInput);
            nextSo.FindProperty("flow").objectReferenceValue = flow;
            nextSo.FindProperty("session").objectReferenceValue = sessionController;
            nextSo.ApplyModifiedProperties();

            return flow;
        }
    }
}
