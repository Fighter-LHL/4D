using UnityEngine;
using UnityEngine.UI;
using WSlice.Level;
using WSlice.Player;

namespace WSlice.UI
{
    /// <summary>Player-facing UI for the representative courtyard, built without editor-only dependencies.</summary>
    public sealed class CourtyardExperienceView : MonoBehaviour
    {
        [SerializeField] private CourtyardPuzzleController controller;

        private readonly CourtyardExperienceModel model = new CourtyardExperienceModel();
        private GameObject uiRoot;
        private Font chineseFont;
        private Text instruction;
        private Text hint;
        private Text hintButtonLabel;
        private Button hintButton;
        private Button activateButton;
        private MovementController movement;
        private int recoveryVersion;
        private int observedResetVersion = -1;
        private float recoveryMessageUntil;
        private PlayerInputRouter inputRouter;
        private int actionVersion;
        private string actionFeedback;
        private float actionMessageUntil;

        public CourtyardExperienceModel Model => model;
        public string VisibleHint => hint != null ? hint.text : string.Empty;

        public static CourtyardExperienceView Build(Transform parent, CourtyardPuzzleController puzzle)
        {
            var host = new GameObject("CourtyardExperience", typeof(RectTransform));
            host.transform.SetParent(parent, false);
            var view = host.AddComponent<CourtyardExperienceView>();
            view.Bind(puzzle);
            return view;
        }

        public void Bind(CourtyardPuzzleController puzzle)
        {
            controller = puzzle;
            if (Application.isPlaying)
            {
                EnsureUI();
                Render();
            }
        }

        private void Start()
        {
            if (controller == null)
                controller = FindFirstObjectByType<CourtyardPuzzleController>();
            movement = FindFirstObjectByType<MovementController>();
            inputRouter = FindFirstObjectByType<PlayerInputRouter>();
            actionVersion = inputRouter != null ? inputRouter.ActionVersion : 0;
            recoveryVersion = movement != null ? movement.RecoveryVersion : 0;

            EnsureUI();
            Render();
        }

        private void OnEnable()
        {
            WireButtons();
            if (uiRoot != null)
                Render();
        }

        private void OnDisable()
        {
            if (hintButton != null)
                hintButton.onClick.RemoveListener(OnHintClicked);
            if (activateButton != null)
                activateButton.onClick.RemoveListener(OnActivateClicked);
            if (uiRoot != null)
                uiRoot.SetActive(false);
        }

        private void OnDestroy()
        {
            if (uiRoot != null)
                Destroy(uiRoot);
            if (chineseFont != null)
                Destroy(chineseFont);
        }

        private void Update()
        {
            Render();
        }

        private void OnHintClicked()
        {
            recoveryMessageUntil = 0f;
            actionMessageUntil = 0f;
            model.RequestHint();
            Render();
        }

        private void OnActivateClicked()
        {
            if (controller != null)
                controller.TryActivate();
            Render();
        }

        private void EnsureUI()
        {
            if (uiRoot != null)
                return;

            // A dynamic OS font includes Chinese glyphs on the target macOS platform;
            // the project's default TMP font only contains a small Latin character set.
            chineseFont = CourtyardFontSupport.CreateFont();
            var outcome = FindFirstObjectByType<LevelOutcomeOverlayView>();
            if (outcome != null && outcome.UseChineseText)
                outcome.ConfigureChineseFont(chineseFont);

            Canvas canvas = GetComponentInParent<Canvas>();
            if (canvas == null)
                canvas = FindFirstObjectByType<Canvas>();

            uiRoot = new GameObject("CourtyardPlayerUI", typeof(RectTransform));
            if (canvas != null)
            {
                uiRoot.transform.SetParent(canvas.transform, false);
                // Keep the existing outcome overlay and dial above the instruction layer.
                uiRoot.transform.SetAsFirstSibling();
            }
            else
            {
                uiRoot.transform.SetParent(transform, false);
                canvas = uiRoot.AddComponent<Canvas>();
                canvas.renderMode = RenderMode.ScreenSpaceOverlay;
                uiRoot.AddComponent<GraphicRaycaster>();
            }

            var scaler = canvas.GetComponent<CanvasScaler>();
            if (scaler == null)
                scaler = canvas.gameObject.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1280f, 720f);
            scaler.screenMatchMode = CanvasScaler.ScreenMatchMode.MatchWidthOrHeight;
            scaler.matchWidthOrHeight = 0.5f;

            var rootRect = (RectTransform)uiRoot.transform;
            rootRect.anchorMin = Vector2.zero;
            rootRect.anchorMax = Vector2.one;
            rootRect.offsetMin = Vector2.zero;
            rootRect.offsetMax = Vector2.zero;

            var panel = CreateRect("Instructions", uiRoot.transform, new Vector2(0.5f, 1f),
                new Vector2(0f, -70f), new Vector2(820f, 110f));
            var panelImage = panel.gameObject.AddComponent<Image>();
            panelImage.color = new Color(0.055f, 0.07f, 0.09f, 0.88f);
            panelImage.raycastTarget = false;
            instruction = CreateText("Objective", panel, new Vector2(0f, 26f), new Vector2(780f, 40f), 24);
            hint = CreateText("Hint", panel, new Vector2(0f, -22f), new Vector2(780f, 58f), 20);
            hint.color = new Color(0.89f, 0.83f, 0.67f);

            var dialLabel = CreateText("DialLabel", uiRoot.transform, new Vector2(0f, 101f),
                new Vector2(240f, 30f), 19);
            ((RectTransform)dialLabel.transform).anchorMin = new Vector2(0.5f, 0f);
            ((RectTransform)dialLabel.transform).anchorMax = new Vector2(0.5f, 0f);
            dialLabel.text = "切换切片";

            hintButton = CreateButton("HintButton", new Vector2(250f, 60f), "提示", out hintButtonLabel);
            activateButton = CreateButton("ActivateButton", new Vector2(440f, 60f), "启动机关", out _);
            WireButtons();
        }

        private void WireButtons()
        {
            if (hintButton != null)
            {
                hintButton.onClick.RemoveListener(OnHintClicked);
                hintButton.onClick.AddListener(OnHintClicked);
            }
            if (activateButton != null)
            {
                activateButton.onClick.RemoveListener(OnActivateClicked);
                activateButton.onClick.AddListener(OnActivateClicked);
            }
        }

        private void Render()
        {
            if (uiRoot == null)
                return;

            bool visible = controller != null && !controller.IsComplete && isActiveAndEnabled;
            uiRoot.SetActive(visible);
            if (controller == null)
                return;

            model.Observe(CurrentStage(), controller.ResetVersion);
            if (observedResetVersion != controller.ResetVersion)
            {
                observedResetVersion = controller.ResetVersion;
                recoveryMessageUntil = 0f;
                actionMessageUntil = 0f;
                actionVersion = inputRouter != null ? inputRouter.ActionVersion : 0;
                recoveryVersion = movement != null ? movement.RecoveryVersion : 0;
            }
            if (movement != null && recoveryVersion != movement.RecoveryVersion)
            {
                recoveryVersion = movement.RecoveryVersion;
                recoveryMessageUntil = Time.unscaledTime + 3f;
            }
            if (inputRouter != null && actionVersion != inputRouter.ActionVersion)
            {
                actionVersion = inputRouter.ActionVersion;
                actionFeedback = CourtyardExperienceModel.DescribeFailure(inputRouter.LastActionResult.Reason);
                actionMessageUntil = string.IsNullOrEmpty(actionFeedback) ? 0f : Time.unscaledTime + 3f;
            }
            instruction.text = model.Instruction;
            hint.text = Time.unscaledTime < recoveryMessageUntil
                ? "这条路隐去了，已回到安全落脚点。可以继续调整切片。"
                : Time.unscaledTime < actionMessageUntil ? actionFeedback : model.Hint;
            hintButtonLabel.text = model.HintButtonLabel;
            hintButton.interactable = model.HasMoreHints;
            activateButton.gameObject.SetActive(controller.CanActivate);
        }

        private CourtyardExperienceStage CurrentStage()
        {
            if (controller.IsComplete)
                return CourtyardExperienceStage.Complete;
            if (controller.IsActivated)
                return controller.ReturnedToCourtyard
                    ? CourtyardExperienceStage.ReachExit
                    : CourtyardExperienceStage.ReturnToCourtyard;
            if (controller.CurrentNodeId == CourtyardLayout.Mechanism)
                return CourtyardExperienceStage.ActivateMechanism;
            return controller.HasEnteredCourtyard
                ? CourtyardExperienceStage.FindMechanism
                : CourtyardExperienceStage.EnterCourtyard;
        }

        private Button CreateButton(string objectName, Vector2 position, string label, out Text labelText)
        {
            var rect = CreateRect(objectName, uiRoot.transform, new Vector2(0.5f, 0f), position, new Vector2(158f, 46f));
            var background = rect.gameObject.AddComponent<Image>();
            background.color = new Color(0.19f, 0.24f, 0.29f, 0.98f);
            var button = rect.gameObject.AddComponent<Button>();
            button.targetGraphic = background;
            labelText = CreateText("Label", rect, Vector2.zero, new Vector2(146f, 40f), 20);
            labelText.text = label;
            return button;
        }

        private Text CreateText(string objectName, Transform parent, Vector2 position, Vector2 size, int fontSize)
        {
            var rect = CreateRect(objectName, parent, new Vector2(0.5f, 0.5f), position, size);
            var label = rect.gameObject.AddComponent<Text>();
            label.font = chineseFont;
            label.fontSize = fontSize;
            label.color = new Color(0.97f, 0.96f, 0.93f);
            label.alignment = TextAnchor.MiddleCenter;
            label.horizontalOverflow = HorizontalWrapMode.Wrap;
            label.verticalOverflow = VerticalWrapMode.Truncate;
            label.raycastTarget = false;
            label.supportRichText = false;
            return label;
        }

        private static RectTransform CreateRect(string objectName, Transform parent, Vector2 anchor, Vector2 position, Vector2 size)
        {
            var rect = new GameObject(objectName, typeof(RectTransform)).GetComponent<RectTransform>();
            rect.SetParent(parent, false);
            rect.anchorMin = anchor;
            rect.anchorMax = anchor;
            rect.pivot = new Vector2(0.5f, 0.5f);
            rect.anchoredPosition = position;
            rect.sizeDelta = size;
            return rect;
        }
    }

    internal static class CourtyardFontSupport
    {
        public static Font CreateFont() => Font.CreateDynamicFontFromOSFont(new[]
        {
            "PingFang SC", "Hiragino Sans GB", "Heiti SC", "Microsoft YaHei", "Noto Sans CJK SC", "Arial"
        }, 24);

        public static TMPro.TMP_FontAsset CreateTMPFontAsset(Font font)
        {
            if (font == null)
                return null;

            // OS Font objects reference installed fonts but do not embed font data.
            // TMP's family/style overload creates a DynamicOS asset that can load
            // glyphs from the same family; the Font overload requires embedded data.
            foreach (var family in font.fontNames)
            {
                var asset = TMPro.TMP_FontAsset.CreateFontAsset(family, "Regular", 48);
                if (asset != null)
                    return asset;
            }
            return null;
        }
    }
}
