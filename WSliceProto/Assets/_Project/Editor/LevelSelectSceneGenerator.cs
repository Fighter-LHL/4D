using UnityEditor;
using UnityEngine;
using UnityEngine.UI;
using TMPro;
using WSlice.Level;
using WSlice.UI;

namespace WSlice.Editor
{
    public static class LevelSelectSceneGenerator
    {
        [MenuItem("WSlice/Generate Level Select Scene")]
        public static void Generate()
        {
            var catalog = AssetDatabase.LoadAssetAtPath<LevelCatalog>(LevelCatalogPaths.AssetPath);
            if (catalog == null)
            {
                Debug.LogError("LevelCatalog.asset not found. Aborting generation.");
                return;
            }

            EnsureSceneAssetExists();
            var scene = UnityEditor.SceneManagement.EditorSceneManager.OpenScene(
                LevelCatalogPaths.LevelSelectScenePath,
                UnityEditor.SceneManagement.OpenSceneMode.Single);

            Undo.IncrementCurrentGroup();
            int undoGroup = Undo.GetCurrentGroup();
            Undo.SetCurrentGroupName("Generate Level Select Scene");

            BuildScene(catalog);

            UnityEditor.SceneManagement.EditorSceneManager.SaveScene(scene);
            AssetDatabase.Refresh();
            Undo.CollapseUndoOperations(undoGroup);
            Debug.Log("LevelSelect scene generated successfully.");
        }

        private static void BuildScene(LevelCatalog catalog)
        {
            var cameraObj = GardenEditorUtilities.FindOrCreate("Main Camera", typeof(Camera));
            cameraObj.transform.position = new Vector3(0f, 0f, -10f);

            var canvas = GardenEditorUtilities.FindOrCreate(
                "Canvas",
                typeof(Canvas),
                typeof(CanvasScaler),
                typeof(GraphicRaycaster));
            canvas.GetComponent<Canvas>().renderMode = RenderMode.ScreenSpaceOverlay;

            if (Object.FindFirstObjectByType<UnityEngine.EventSystems.EventSystem>() == null)
            {
                var eventSystem = new GameObject(
                    "EventSystem",
                    typeof(UnityEngine.EventSystems.EventSystem),
                    typeof(UnityEngine.InputSystem.UI.InputSystemUIInputModule));
                Undo.RegisterCreatedObjectUndo(eventSystem, "Create EventSystem");
            }

            var selectRoot = GardenEditorUtilities.FindOrCreate("LevelSelect", typeof(RectTransform), typeof(LevelSelectView));
            selectRoot.transform.SetParent(canvas.transform, false);
            var selectRect = selectRoot.GetComponent<RectTransform>();
            selectRect.anchorMin = Vector2.zero;
            selectRect.anchorMax = Vector2.one;
            selectRect.offsetMin = Vector2.zero;
            selectRect.offsetMax = Vector2.zero;

            var selectView = selectRoot.GetComponent<LevelSelectView>();
            var selectSo = new SerializedObject(selectView);
            selectSo.FindProperty("catalog").objectReferenceValue = catalog;
            selectSo.ApplyModifiedProperties();

            var titleObj = GardenEditorUtilities.FindOrCreate("Title", typeof(RectTransform), typeof(TextMeshProUGUI));
            titleObj.transform.SetParent(selectRoot.transform, false);
            var titleRect = titleObj.GetComponent<RectTransform>();
            titleRect.anchorMin = new Vector2(0.5f, 1f);
            titleRect.anchorMax = new Vector2(0.5f, 1f);
            titleRect.pivot = new Vector2(0.5f, 1f);
            titleRect.anchoredPosition = new Vector2(0f, -40f);
            titleRect.sizeDelta = new Vector2(600f, 80f);
            var title = titleObj.GetComponent<TextMeshProUGUI>();
            title.text = "W-Slice Demo";
            title.fontSize = 42f;
            title.alignment = TextAlignmentOptions.Center;

            var buttonPanel = GardenEditorUtilities.FindOrCreate("Buttons", typeof(RectTransform), typeof(VerticalLayoutGroup));
            buttonPanel.transform.SetParent(selectRoot.transform, false);
            var panelRect = buttonPanel.GetComponent<RectTransform>();
            panelRect.anchorMin = new Vector2(0.5f, 0.5f);
            panelRect.anchorMax = new Vector2(0.5f, 0.5f);
            panelRect.pivot = new Vector2(0.5f, 0.5f);
            panelRect.anchoredPosition = Vector2.zero;
            panelRect.sizeDelta = new Vector2(360f, 320f);

            var layout = buttonPanel.GetComponent<VerticalLayoutGroup>();
            layout.spacing = 16f;
            layout.childAlignment = TextAnchor.MiddleCenter;
            layout.childControlWidth = true;
            layout.childControlHeight = true;
            layout.childForceExpandWidth = true;
            layout.childForceExpandHeight = false;

            foreach (var entry in catalog.Entries)
            {
                if (string.IsNullOrEmpty(entry.SceneName))
                    continue;

                CreateLevelButton(buttonPanel.transform, selectView, entry);
            }
        }

        private static void CreateLevelButton(Transform parent, LevelSelectView selectView, LevelCatalogEntry entry)
        {
            string buttonName = $"LevelButton_{entry.LevelId}";
            var buttonObj = GardenEditorUtilities.FindOrCreate(buttonName, typeof(RectTransform), typeof(Image), typeof(Button));
            buttonObj.transform.SetParent(parent, false);
            var buttonRect = buttonObj.GetComponent<RectTransform>();
            buttonRect.sizeDelta = new Vector2(360f, 56f);

            var image = buttonObj.GetComponent<Image>();
            image.color = new Color(0.2f, 0.45f, 0.75f, 0.95f);

            var button = buttonObj.GetComponent<Button>();
            string levelId = entry.LevelId;
            button.onClick = new Button.ButtonClickedEvent();
            button.onClick.AddListener(() => selectView.LoadLevel(levelId));

            var labelObj = GardenEditorUtilities.FindOrCreate("Label", typeof(RectTransform), typeof(TextMeshProUGUI));
            labelObj.transform.SetParent(buttonObj.transform, false);
            var labelRect = labelObj.GetComponent<RectTransform>();
            labelRect.anchorMin = Vector2.zero;
            labelRect.anchorMax = Vector2.one;
            labelRect.offsetMin = Vector2.zero;
            labelRect.offsetMax = Vector2.zero;

            var label = labelObj.GetComponent<TextMeshProUGUI>();
            label.text = string.IsNullOrEmpty(entry.DisplayName) ? entry.LevelId : entry.DisplayName;
            label.fontSize = 24f;
            label.alignment = TextAlignmentOptions.Center;
            label.color = Color.white;
        }

        private static void EnsureSceneAssetExists()
        {
            if (System.IO.File.Exists(LevelCatalogPaths.LevelSelectScenePath))
                return;

            string directory = System.IO.Path.GetDirectoryName(LevelCatalogPaths.LevelSelectScenePath);
            if (!string.IsNullOrEmpty(directory) && !System.IO.Directory.Exists(directory))
                System.IO.Directory.CreateDirectory(directory);

            var scene = UnityEditor.SceneManagement.EditorSceneManager.NewScene(
                UnityEditor.SceneManagement.NewSceneSetup.DefaultGameObjects,
                UnityEditor.SceneManagement.NewSceneMode.Single);
            UnityEditor.SceneManagement.EditorSceneManager.SaveScene(scene, LevelCatalogPaths.LevelSelectScenePath);
        }
    }
}
