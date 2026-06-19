using UnityEditor;
using UnityEditor.Events;
using UnityEngine;
using UnityEngine.UI;
using TMPro;
using WSlice.Level;
using WSlice.UI;

namespace WSlice.Editor
{
    public static class LevelSelectSceneGenerator
    {
        private const float ButtonWidth = 420f;
        private const float ButtonHeight = 72f;

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
            GrayboxGeneratePipeline.FinalizeGeneratedScene();

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

            BuildTitle(selectRoot.transform);
            BuildVersionLabel(selectRoot.transform);
            BuildQuitButton(selectRoot.transform, selectView);

            var buttonPanel = GardenEditorUtilities.FindOrCreate("Buttons", typeof(RectTransform), typeof(VerticalLayoutGroup));
            buttonPanel.transform.SetParent(selectRoot.transform, false);
            var panelRect = buttonPanel.GetComponent<RectTransform>();
            panelRect.anchorMin = new Vector2(0.5f, 0.5f);
            panelRect.anchorMax = new Vector2(0.5f, 0.5f);
            panelRect.pivot = new Vector2(0.5f, 0.5f);
            panelRect.anchoredPosition = new Vector2(0f, -20f);
            panelRect.sizeDelta = new Vector2(ButtonWidth, 280f);

            var layout = buttonPanel.GetComponent<VerticalLayoutGroup>();
            layout.spacing = 14f;
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

        private static void BuildTitle(Transform parent)
        {
            var titleObj = GardenEditorUtilities.FindOrCreate("Title", typeof(RectTransform), typeof(TextMeshProUGUI));
            titleObj.transform.SetParent(parent, false);
            var titleRect = titleObj.GetComponent<RectTransform>();
            titleRect.anchorMin = new Vector2(0.5f, 1f);
            titleRect.anchorMax = new Vector2(0.5f, 1f);
            titleRect.pivot = new Vector2(0.5f, 1f);
            titleRect.anchoredPosition = new Vector2(0f, -48f);
            titleRect.sizeDelta = new Vector2(640f, 56f);
            var title = titleObj.GetComponent<TextMeshProUGUI>();
            title.text = LevelSelectDemoInfo.Title;
            title.fontSize = 44f;
            title.alignment = TextAlignmentOptions.Center;
            title.color = Color.white;

            var subtitleObj = GardenEditorUtilities.FindOrCreate("Subtitle", typeof(RectTransform), typeof(TextMeshProUGUI));
            subtitleObj.transform.SetParent(parent, false);
            var subtitleRect = subtitleObj.GetComponent<RectTransform>();
            subtitleRect.anchorMin = new Vector2(0.5f, 1f);
            subtitleRect.anchorMax = new Vector2(0.5f, 1f);
            subtitleRect.pivot = new Vector2(0.5f, 1f);
            subtitleRect.anchoredPosition = new Vector2(0f, -108f);
            subtitleRect.sizeDelta = new Vector2(640f, 36f);
            var subtitle = subtitleObj.GetComponent<TextMeshProUGUI>();
            subtitle.text = "Three-level W-Slice graybox demo";
            subtitle.fontSize = 20f;
            subtitle.alignment = TextAlignmentOptions.Center;
            subtitle.color = new Color(0.78f, 0.84f, 0.92f, 1f);
        }

        private static void BuildVersionLabel(Transform parent)
        {
            var versionObj = GardenEditorUtilities.FindOrCreate("VersionLabel", typeof(RectTransform), typeof(TextMeshProUGUI));
            versionObj.transform.SetParent(parent, false);
            var versionRect = versionObj.GetComponent<RectTransform>();
            versionRect.anchorMin = new Vector2(0f, 0f);
            versionRect.anchorMax = new Vector2(0f, 0f);
            versionRect.pivot = new Vector2(0f, 0f);
            versionRect.anchoredPosition = new Vector2(24f, 20f);
            versionRect.sizeDelta = new Vector2(200f, 28f);
            var version = versionObj.GetComponent<TextMeshProUGUI>();
            version.text = LevelSelectDemoInfo.Version;
            version.fontSize = 18f;
            version.alignment = TextAlignmentOptions.BottomLeft;
            version.color = new Color(0.65f, 0.72f, 0.82f, 1f);
        }

        private static void BuildQuitButton(Transform parent, LevelSelectView selectView)
        {
            var buttonObj = GardenEditorUtilities.FindOrCreate(
                "QuitButton",
                typeof(RectTransform),
                typeof(Image),
                typeof(Button));
            buttonObj.transform.SetParent(parent, false);
            var buttonRect = buttonObj.GetComponent<RectTransform>();
            buttonRect.anchorMin = new Vector2(1f, 0f);
            buttonRect.anchorMax = new Vector2(1f, 0f);
            buttonRect.pivot = new Vector2(1f, 0f);
            buttonRect.anchoredPosition = new Vector2(-24f, 20f);
            buttonRect.sizeDelta = new Vector2(120f, 40f);

            var image = buttonObj.GetComponent<Image>();
            image.color = new Color(0.18f, 0.2f, 0.24f, 0.95f);

            var button = buttonObj.GetComponent<Button>();
            while (button.onClick.GetPersistentEventCount() > 0)
                UnityEventTools.RemovePersistentListener(button.onClick, 0);
            UnityEventTools.AddPersistentListener(button.onClick, selectView.QuitDemo);

            var labelObj = GardenEditorUtilities.FindOrCreate("Label", typeof(RectTransform), typeof(TextMeshProUGUI));
            labelObj.transform.SetParent(buttonObj.transform, false);
            var labelRect = labelObj.GetComponent<RectTransform>();
            labelRect.anchorMin = Vector2.zero;
            labelRect.anchorMax = Vector2.one;
            labelRect.offsetMin = Vector2.zero;
            labelRect.offsetMax = Vector2.zero;
            var label = labelObj.GetComponent<TextMeshProUGUI>();
            label.text = "Quit";
            label.fontSize = 20f;
            label.alignment = TextAlignmentOptions.Center;
            label.color = Color.white;
        }

        private static void CreateLevelButton(Transform parent, LevelSelectView selectView, LevelCatalogEntry entry)
        {
            string buttonName = $"LevelButton_{entry.LevelId}";
            var buttonObj = GardenEditorUtilities.FindOrCreate(buttonName, typeof(RectTransform), typeof(Image), typeof(Button));
            buttonObj.transform.SetParent(parent, false);
            var buttonRect = buttonObj.GetComponent<RectTransform>();
            buttonRect.sizeDelta = new Vector2(ButtonWidth, ButtonHeight);

            var image = buttonObj.GetComponent<Image>();
            image.color = new Color(0.2f, 0.45f, 0.75f, 0.95f);

            var bridge = buttonObj.GetComponent<LevelSelectLevelButton>() ?? buttonObj.AddComponent<LevelSelectLevelButton>();
            var bridgeSo = new SerializedObject(bridge);
            bridgeSo.FindProperty("levelId").stringValue = entry.LevelId;
            bridgeSo.FindProperty("selectView").objectReferenceValue = selectView;
            bridgeSo.ApplyModifiedProperties();

            var button = buttonObj.GetComponent<Button>();
            while (button.onClick.GetPersistentEventCount() > 0)
                UnityEventTools.RemovePersistentListener(button.onClick, 0);
            UnityEventTools.AddPersistentListener(button.onClick, bridge.OnClick);

            var labelObj = GardenEditorUtilities.FindOrCreate("Label", typeof(RectTransform), typeof(TextMeshProUGUI));
            labelObj.transform.SetParent(buttonObj.transform, false);
            var labelRect = labelObj.GetComponent<RectTransform>();
            labelRect.anchorMin = Vector2.zero;
            labelRect.anchorMax = Vector2.one;
            labelRect.offsetMin = new Vector2(12f, 8f);
            labelRect.offsetMax = new Vector2(-12f, -8f);

            var label = labelObj.GetComponent<TextMeshProUGUI>();
            label.text = LevelSelectButtonModel.FormatButtonLabel(entry.DisplayName, entry.ThemeHint);
            label.fontSize = 24f;
            label.alignment = TextAlignmentOptions.Center;
            label.color = Color.white;
            label.richText = true;
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
