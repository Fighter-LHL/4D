using UnityEditor;
using UnityEngine;
using WSlice.Entities;

namespace WSlice.EditorTools
{
    public class LevelPreviewWindow : EditorWindow
    {
        [SerializeField] private float previewW = 0.5f;
        [SerializeField] private bool showInactive = true;
        [SerializeField] private bool simulateSnap = false;

        [MenuItem("Window/WSlice/Level Preview")]
        private static void Open()
        {
            GetWindow<LevelPreviewWindow>("Level Preview");
        }

        private void OnGUI()
        {
            previewW = EditorGUILayout.Slider("W", previewW, 0f, 1f);
            showInactive = EditorGUILayout.Toggle("Show Inactive Slice Entities", showInactive);
            simulateSnap = EditorGUILayout.Toggle("Simulate Snap", simulateSnap);

            if (GUILayout.Button("Apply to Scene"))
            {
                ApplyToScene();
            }
        }

        private void ApplyToScene()
        {
            float w = previewW;
            foreach (var entity in FindObjectsByType<SliceEntity>(FindObjectsSortMode.None))
            {
                entity.ApplyW(w);
            }
        }
    }
}
