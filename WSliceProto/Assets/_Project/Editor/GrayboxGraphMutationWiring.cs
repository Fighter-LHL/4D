using UnityEditor;
using UnityEngine;
using WSlice.Level;

namespace WSlice.Editor
{
    public static class GrayboxGraphMutationWiring
    {
        public static LevelGraphMutationController Wire(GameObject levelRuntime, LevelRuntimeController levelController)
        {
            var controller = levelRuntime.GetComponent<LevelGraphMutationController>()
                ?? levelRuntime.AddComponent<LevelGraphMutationController>();

            var so = new SerializedObject(controller);
            so.FindProperty("levelController").objectReferenceValue = levelController;
            so.ApplyModifiedProperties();

            return controller;
        }
    }
}
