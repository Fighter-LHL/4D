using UnityEditor;
using UnityEngine;
using WSlice.Level;
using WSlice.Player;
using WSlice.UI;

namespace WSlice.Editor
{
    public static class GrayboxTutorialWiring
    {
        public static LevelTutorialController Wire(
            GameObject levelRuntime,
            LevelRuntimeController levelController,
            LevelSessionController sessionController,
            MovementController movement)
        {
            var tutorial = levelRuntime.GetComponent<LevelTutorialController>()
                ?? levelRuntime.AddComponent<LevelTutorialController>();

            var tutorialSo = new SerializedObject(tutorial);
            tutorialSo.FindProperty("levelController").objectReferenceValue = levelController;
            tutorialSo.FindProperty("session").objectReferenceValue = sessionController;
            tutorialSo.FindProperty("movement").objectReferenceValue = movement;
            tutorialSo.ApplyModifiedProperties();

            return tutorial;
        }
    }
}
