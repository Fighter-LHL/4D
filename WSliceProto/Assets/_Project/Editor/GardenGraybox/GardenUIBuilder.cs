using UnityEditor;
using UnityEngine;
using UnityEngine.UI;
using TMPro;
using WSlice.UI;

namespace WSlice.Editor
{
    public static class GardenUIBuilder
    {
        public static void Build(GardenSceneBuilder.SceneBuildResult scene)
        {
            var canvas = GardenEditorUtilities.FindOrCreate(
                "Canvas",
                typeof(Canvas),
                typeof(CanvasScaler),
                typeof(GraphicRaycaster));
            canvas.GetComponent<Canvas>().renderMode = RenderMode.ScreenSpaceOverlay;

            EnsureEventSystem();

            BuildWDialSlider(canvas.transform, scene);
            BuildWDialTrack(canvas.transform, scene);
            BuildPlayerHud(canvas.transform, scene);
            BuildLevelOutcomeOverlay(canvas.transform, scene);
            BuildDebugOverlay(canvas.transform, scene);
        }

        private static void EnsureEventSystem()
        {
            if (Object.FindFirstObjectByType<UnityEngine.EventSystems.EventSystem>() != null)
                return;

            var eventSystem = new GameObject(
                "EventSystem",
                typeof(UnityEngine.EventSystems.EventSystem),
                typeof(UnityEngine.InputSystem.UI.InputSystemUIInputModule));
            Undo.RegisterCreatedObjectUndo(eventSystem, "Create EventSystem");
        }

        private static void BuildWDialSlider(Transform canvas, GardenSceneBuilder.SceneBuildResult scene)
        {
            var sliderObj = GardenEditorUtilities.FindOrCreate("WDialSlider", typeof(RectTransform), typeof(Slider));
            sliderObj.transform.SetParent(canvas, false);
            var slider = sliderObj.GetComponent<Slider>();
            slider.minValue = 0f;
            slider.maxValue = 1f;

            var sliderRect = sliderObj.GetComponent<RectTransform>();
            sliderRect.anchorMin = new Vector2(0.5f, 0f);
            sliderRect.anchorMax = new Vector2(0.5f, 0f);
            sliderRect.pivot = new Vector2(0.5f, 0.5f);
            sliderRect.anchoredPosition = new Vector2(0f, GardenGrayboxRecipe.UI.DialBottomMargin);
            sliderRect.sizeDelta = new Vector2(GardenGrayboxRecipe.UI.DialWidth, GardenGrayboxRecipe.UI.DialHeight);
            SetupSliderVisuals(sliderObj, slider);

            var dialView = sliderObj.GetComponent<WDialView>() ?? sliderObj.AddComponent<WDialView>();
            var dialSo = new SerializedObject(dialView);
            dialSo.FindProperty("slider").objectReferenceValue = slider;
            dialSo.FindProperty("inputRouter").objectReferenceValue = scene.InputRouter;
            dialSo.ApplyModifiedProperties();
        }

        private static void BuildWDialTrack(Transform canvas, GardenSceneBuilder.SceneBuildResult scene)
        {
            var dialTrackObj = GardenEditorUtilities.FindOrCreate(
                "WDialTrack",
                typeof(RectTransform),
                typeof(Image),
                typeof(WDialTrackView));
            dialTrackObj.transform.SetParent(canvas, false);
            var dialTrackImage = dialTrackObj.GetComponent<Image>();
            dialTrackImage.color = new Color(0f, 0f, 0f, 0.28f);
            dialTrackImage.raycastTarget = false;

            var dialTrackRect = dialTrackObj.GetComponent<RectTransform>();
            dialTrackRect.anchorMin = new Vector2(0.5f, 0f);
            dialTrackRect.anchorMax = new Vector2(0.5f, 0f);
            dialTrackRect.pivot = new Vector2(0.5f, 0.5f);
            dialTrackRect.anchoredPosition = new Vector2(0f, GardenGrayboxRecipe.UI.DialTrackBottomMargin);
            dialTrackRect.sizeDelta = new Vector2(GardenGrayboxRecipe.UI.DialWidth, GardenGrayboxRecipe.UI.DialTrackHeight);

            var dialTrackView = dialTrackObj.GetComponent<WDialTrackView>() ?? dialTrackObj.AddComponent<WDialTrackView>();
            var dialTrackSo = new SerializedObject(dialTrackView);
            dialTrackSo.FindProperty("trackRoot").objectReferenceValue = dialTrackRect;
            dialTrackSo.FindProperty("level").objectReferenceValue = scene.LevelController;
            dialTrackSo.FindProperty("movement").objectReferenceValue = scene.Movement;
            dialTrackSo.FindProperty("inputRouter").objectReferenceValue = scene.InputRouter;
            dialTrackSo.FindProperty("character").objectReferenceValue = scene.PlayerCharacter;
            dialTrackSo.ApplyModifiedProperties();
        }

        private static void BuildPlayerHud(Transform canvas, GardenSceneBuilder.SceneBuildResult scene)
        {
            var playerHUDObj = GardenEditorUtilities.FindOrCreate(
                "PlayerHUDText",
                typeof(RectTransform),
                typeof(TextMeshProUGUI),
                typeof(PlayerHUDView));
            playerHUDObj.transform.SetParent(canvas, false);
            var playerHUDText = playerHUDObj.GetComponent<TextMeshProUGUI>();
            playerHUDText.fontSize = 22f;
            playerHUDText.enableAutoSizing = true;
            playerHUDText.fontSizeMin = 14f;
            playerHUDText.fontSizeMax = 22f;
            playerHUDText.alignment = TextAlignmentOptions.Top;
            playerHUDText.color = Color.white;
            playerHUDText.text = "Find a W that opens the path.";

            var playerHUDRect = playerHUDObj.GetComponent<RectTransform>();
            playerHUDRect.anchorMin = new Vector2(0.5f, 1f);
            playerHUDRect.anchorMax = new Vector2(0.5f, 1f);
            playerHUDRect.pivot = new Vector2(0.5f, 1f);
            playerHUDRect.anchoredPosition = new Vector2(0f, -GardenGrayboxRecipe.UI.PlayerHUDTopMargin);
            playerHUDRect.sizeDelta = new Vector2(GardenGrayboxRecipe.UI.PlayerHUDWidth, GardenGrayboxRecipe.UI.PlayerHUDHeight);

            var playerHUDView = playerHUDObj.GetComponent<PlayerHUDView>() ?? playerHUDObj.AddComponent<PlayerHUDView>();
            var playerHUDSo = new SerializedObject(playerHUDView);
            playerHUDSo.FindProperty("label").objectReferenceValue = playerHUDText;
            playerHUDSo.FindProperty("level").objectReferenceValue = scene.LevelController;
            playerHUDSo.FindProperty("session").objectReferenceValue = scene.SessionController;
            playerHUDSo.FindProperty("movement").objectReferenceValue = scene.Movement;
            playerHUDSo.FindProperty("inputRouter").objectReferenceValue = scene.InputRouter;
            playerHUDSo.FindProperty("character").objectReferenceValue = scene.PlayerCharacter;
            playerHUDSo.FindProperty("flow").objectReferenceValue = scene.LevelFlow;
            playerHUDSo.ApplyModifiedProperties();
        }

        private static void BuildLevelOutcomeOverlay(Transform canvas, GardenSceneBuilder.SceneBuildResult scene)
        {
            var overlayRoot = GardenEditorUtilities.FindOrCreate(
                "LevelOutcomeOverlay",
                typeof(RectTransform),
                typeof(Image),
                typeof(LevelOutcomeOverlayView));
            overlayRoot.transform.SetParent(canvas, false);
            overlayRoot.SetActive(false);

            var backdrop = overlayRoot.GetComponent<Image>();
            backdrop.color = new Color(0f, 0f, 0f, 0.62f);
            backdrop.raycastTarget = true;

            var overlayRect = overlayRoot.GetComponent<RectTransform>();
            overlayRect.anchorMin = Vector2.zero;
            overlayRect.anchorMax = Vector2.one;
            overlayRect.offsetMin = Vector2.zero;
            overlayRect.offsetMax = Vector2.zero;

            var panel = CreateUIImage(
                "Panel",
                overlayRoot.transform,
                new Color(0.12f, 0.12f, 0.12f, 0.95f),
                new Vector2(0.5f, 0.5f),
                new Vector2(0.5f, 0.5f),
                new Vector2(0.5f, 0.5f));
            var panelRect = panel.GetComponent<RectTransform>();
            panelRect.sizeDelta = new Vector2(
                GardenGrayboxRecipe.UI.OutcomePanelWidth,
                GardenGrayboxRecipe.UI.OutcomePanelHeight);

            var titleObj = new GameObject("Title", typeof(RectTransform), typeof(TextMeshProUGUI));
            titleObj.transform.SetParent(panel.transform, false);
            Undo.RegisterCreatedObjectUndo(titleObj, "Create Outcome Title");
            var titleText = titleObj.GetComponent<TextMeshProUGUI>();
            titleText.text = "Level Complete";
            titleText.fontSize = 28f;
            titleText.alignment = TextAlignmentOptions.Center;
            titleText.color = Color.white;
            var titleRect = titleObj.GetComponent<RectTransform>();
            titleRect.anchorMin = new Vector2(0.5f, 1f);
            titleRect.anchorMax = new Vector2(0.5f, 1f);
            titleRect.pivot = new Vector2(0.5f, 1f);
            titleRect.anchoredPosition = new Vector2(0f, -24f);
            titleRect.sizeDelta = new Vector2(GardenGrayboxRecipe.UI.OutcomePanelWidth - 40f, 48f);

            var buttonRow = CreateUIRect(
                "Buttons",
                panel.transform,
                new Vector2(0.5f, 0f),
                new Vector2(0.5f, 0f),
                new Vector2(0.5f, 0f));
            buttonRow.sizeDelta = new Vector2(
                GardenGrayboxRecipe.UI.OutcomePanelWidth - 40f,
                GardenGrayboxRecipe.UI.OutcomeButtonHeight * 3f
                    + GardenGrayboxRecipe.UI.OutcomeButtonSpacing * 2f);
            buttonRow.anchoredPosition = new Vector2(0f, 28f);

            var nextButton = CreateOverlayButton(buttonRow, "NextButton", "Next");
            var restartButton = CreateOverlayButton(buttonRow, "RestartButton", "Restart");
            var levelSelectButton = CreateOverlayButton(buttonRow, "LevelSelectButton", "Level Select");

            PositionOverlayButton(nextButton, 0);
            PositionOverlayButton(restartButton, 1);
            PositionOverlayButton(levelSelectButton, 2);

            var overlayView = overlayRoot.GetComponent<LevelOutcomeOverlayView>()
                ?? overlayRoot.AddComponent<LevelOutcomeOverlayView>();
            var overlaySo = new SerializedObject(overlayView);
            overlaySo.FindProperty("panelRoot").objectReferenceValue = overlayRoot;
            overlaySo.FindProperty("titleLabel").objectReferenceValue = titleText;
            overlaySo.FindProperty("nextButton").objectReferenceValue = nextButton;
            overlaySo.FindProperty("restartButton").objectReferenceValue = restartButton;
            overlaySo.FindProperty("levelSelectButton").objectReferenceValue = levelSelectButton;
            overlaySo.FindProperty("session").objectReferenceValue = scene.SessionController;
            overlaySo.FindProperty("flow").objectReferenceValue = scene.LevelFlow;
            overlaySo.ApplyModifiedProperties();
        }

        private static Button CreateOverlayButton(RectTransform parent, string name, string label)
        {
            var buttonObj = new GameObject(name, typeof(RectTransform), typeof(Image), typeof(Button));
            buttonObj.transform.SetParent(parent, false);
            Undo.RegisterCreatedObjectUndo(buttonObj, "Create " + name);

            var image = buttonObj.GetComponent<Image>();
            image.color = new Color(0.24f, 0.24f, 0.24f, 1f);

            var button = buttonObj.GetComponent<Button>();
            button.targetGraphic = image;

            var buttonRect = buttonObj.GetComponent<RectTransform>();
            buttonRect.sizeDelta = new Vector2(
                GardenGrayboxRecipe.UI.OutcomeButtonWidth,
                GardenGrayboxRecipe.UI.OutcomeButtonHeight);

            var labelObj = new GameObject("Label", typeof(RectTransform), typeof(TextMeshProUGUI));
            labelObj.transform.SetParent(buttonObj.transform, false);
            Undo.RegisterCreatedObjectUndo(labelObj, "Create " + name + " Label");
            var labelText = labelObj.GetComponent<TextMeshProUGUI>();
            labelText.text = label;
            labelText.fontSize = 20f;
            labelText.alignment = TextAlignmentOptions.Center;
            labelText.color = Color.white;
            var labelRect = labelObj.GetComponent<RectTransform>();
            labelRect.anchorMin = Vector2.zero;
            labelRect.anchorMax = Vector2.one;
            labelRect.offsetMin = Vector2.zero;
            labelRect.offsetMax = Vector2.zero;

            return button;
        }

        private static void PositionOverlayButton(Button button, int index)
        {
            if (button == null)
                return;

            var rect = button.GetComponent<RectTransform>();
            rect.anchorMin = new Vector2(0.5f, 0f);
            rect.anchorMax = new Vector2(0.5f, 0f);
            rect.pivot = new Vector2(0.5f, 0f);
            float y = index * (GardenGrayboxRecipe.UI.OutcomeButtonHeight + GardenGrayboxRecipe.UI.OutcomeButtonSpacing);
            rect.anchoredPosition = new Vector2(0f, y);
        }

        private static void BuildDebugOverlay(Transform canvas, GardenSceneBuilder.SceneBuildResult scene)
        {
            var debugObj = GardenEditorUtilities.FindOrCreate("DebugText", typeof(RectTransform), typeof(TextMeshProUGUI));
            debugObj.transform.SetParent(canvas, false);
            var debugText = debugObj.GetComponent<TextMeshProUGUI>();
            var debugOverlay = debugObj.GetComponent<DebugOverlay>() ?? debugObj.AddComponent<DebugOverlay>();
            debugText.fontSize = 18f;
            debugText.enableAutoSizing = true;
            debugText.alignment = TextAlignmentOptions.TopLeft;

            var debugRect = debugObj.GetComponent<RectTransform>();
            debugRect.anchorMin = new Vector2(0f, 1f);
            debugRect.anchorMax = new Vector2(0f, 1f);
            debugRect.pivot = new Vector2(0f, 1f);
            debugRect.anchoredPosition = new Vector2(GardenGrayboxRecipe.UI.DebugLeftMargin, -GardenGrayboxRecipe.UI.DebugTopMargin);
            debugRect.sizeDelta = new Vector2(GardenGrayboxRecipe.UI.DebugWidth, GardenGrayboxRecipe.UI.DebugHeight);

            var debugSo = new SerializedObject(debugOverlay);
            debugSo.FindProperty("label").objectReferenceValue = debugText;
            debugSo.FindProperty("level").objectReferenceValue = scene.LevelController;
            debugSo.FindProperty("session").objectReferenceValue = scene.SessionController;
            debugSo.FindProperty("character").objectReferenceValue = scene.PlayerCharacter;
            debugSo.FindProperty("movement").objectReferenceValue = scene.Movement;
            debugSo.FindProperty("inputRouter").objectReferenceValue = scene.InputRouter;
            debugSo.ApplyModifiedProperties();
        }

        private static void SetupSliderVisuals(GameObject sliderObj, Slider slider)
        {
            for (int i = sliderObj.transform.childCount - 1; i >= 0; i--)
            {
                var child = sliderObj.transform.GetChild(i);
                if (child.name == "Background" || child.name == "Fill Area" || child.name == "Handle Slide Area")
                    Undo.DestroyObjectImmediate(child.gameObject);
            }

            float padding = 4f;
            var background = CreateUIImage("Background", sliderObj.transform,
                new Color(0f, 0f, 0f, 0.5f), Vector2.zero, Vector2.one, new Vector2(0.5f, 0.5f));
            background.GetComponent<RectTransform>().offsetMin = Vector2.zero;
            background.GetComponent<RectTransform>().offsetMax = Vector2.zero;

            var fillArea = CreateUIRect("Fill Area", sliderObj.transform,
                Vector2.zero, Vector2.one, new Vector2(0.5f, 0.5f));
            fillArea.offsetMin = new Vector2(padding, padding);
            fillArea.offsetMax = new Vector2(-padding, -padding);

            var fill = CreateUIImage("Fill", fillArea,
                new Color(1f, 1f, 1f, 0.9f), Vector2.zero, new Vector2(0f, 1f), new Vector2(0f, 0.5f));
            fill.GetComponent<RectTransform>().offsetMin = Vector2.zero;
            fill.GetComponent<RectTransform>().offsetMax = Vector2.zero;

            var handleArea = CreateUIRect("Handle Slide Area", sliderObj.transform,
                Vector2.zero, Vector2.one, new Vector2(0.5f, 0.5f));
            handleArea.offsetMin = new Vector2(padding, padding);
            handleArea.offsetMax = new Vector2(-padding, -padding);

            var handle = CreateUIImage("Handle", handleArea,
                Color.white, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(0.5f, 0.5f));
            handle.GetComponent<RectTransform>().sizeDelta = new Vector2(20f, 20f);

            slider.fillRect = fill.GetComponent<RectTransform>();
            slider.handleRect = handle.GetComponent<RectTransform>();
            slider.targetGraphic = handle.GetComponent<Image>();
            slider.transition = Selectable.Transition.None;
        }

        private static GameObject CreateUIImage(string name, Transform parent, Color color,
            Vector2 anchorMin, Vector2 anchorMax, Vector2 pivot)
        {
            var go = new GameObject(name, typeof(RectTransform), typeof(Image));
            go.transform.SetParent(parent, false);
            var rectTransform = go.GetComponent<RectTransform>();
            rectTransform.anchorMin = anchorMin;
            rectTransform.anchorMax = anchorMax;
            rectTransform.pivot = pivot;
            rectTransform.anchoredPosition = Vector2.zero;
            rectTransform.sizeDelta = Vector2.zero;
            go.GetComponent<Image>().color = color;
            Undo.RegisterCreatedObjectUndo(go, "Create " + name);
            return go;
        }

        private static RectTransform CreateUIRect(string name, Transform parent,
            Vector2 anchorMin, Vector2 anchorMax, Vector2 pivot)
        {
            var go = new GameObject(name, typeof(RectTransform));
            go.transform.SetParent(parent, false);
            var rectTransform = go.GetComponent<RectTransform>();
            rectTransform.anchorMin = anchorMin;
            rectTransform.anchorMax = anchorMax;
            rectTransform.pivot = pivot;
            rectTransform.anchoredPosition = Vector2.zero;
            rectTransform.sizeDelta = Vector2.zero;
            Undo.RegisterCreatedObjectUndo(go, "Create " + name);
            return rectTransform;
        }
    }
}
