using UnityEngine;
using UnityEngine.UI;
using TMPro;
using WSlice.Level;

namespace WSlice.UI
{
    public sealed class LevelOutcomeOverlayView : MonoBehaviour
    {
        [SerializeField] private GameObject panelRoot;
        [SerializeField] private TextMeshProUGUI titleLabel;
        [SerializeField] private Button nextButton;
        [SerializeField] private Button restartButton;
        [SerializeField] private Button levelSelectButton;
        [SerializeField] private LevelSessionController session;
        [SerializeField] private LevelFlowController flow;
        [SerializeField] private bool useChineseText;

        private CanvasGroup panelVisibility;
        private Font chineseFont;
        private bool ownsChineseFont;
        private TMP_FontAsset chineseFontAsset;
        private bool chineseFontConfigured;

        public bool UseChineseText => useChineseText;

        public LevelOutcomeOverlayState LastState { get; private set; } =
            new LevelOutcomeOverlayState(LevelOutcomeOverlayMode.Hidden, string.Empty, false, false, false);

        private void Awake()
        {
            ResolveReferences();
            WireButtons();
            Render(LastState);
        }

        private void Update()
        {
            ResolveReferences();
            if (useChineseText && !chineseFontConfigured)
            {
                ConfigureChineseFont(CourtyardFontSupport.CreateFont());
                ownsChineseFont = true;
            }

            bool isComplete = session != null && session.State == LevelSessionState.Completed;
            bool isFailed = session != null && session.State == LevelSessionState.Failed;
            bool hasNextLevel = isComplete && flow != null && flow.HasNextLevelInCatalog;
            LastState = LevelOutcomeOverlayModel.Build(
                session != null ? session.State : LevelSessionState.NotStarted,
                hasNextLevel);
            Render(LastState);
        }

        public void ConfigureChineseFont(Font font)
        {
            if (!useChineseText || font == null || chineseFont == font && chineseFontAsset != null)
                return;

            ReleaseChineseFont();
            chineseFont = font;
            chineseFontConfigured = true;
            chineseFontAsset = CourtyardFontSupport.CreateTMPFontAsset(font);
            if (chineseFontAsset == null)
                return;

            chineseFontAsset.name = "Courtyard Chinese UI";
            if (titleLabel != null)
                titleLabel.font = chineseFontAsset;
            LocalizeButton(nextButton, "下一关");
            LocalizeButton(restartButton, "再试一次");
            LocalizeButton(levelSelectButton, "关卡选择");
        }

        private void LocalizeButton(Button button, string text)
        {
            if (button == null)
                return;
            var label = button.GetComponentInChildren<TextMeshProUGUI>(true);
            if (label == null)
                return;
            label.font = chineseFontAsset;
            label.text = text;
        }

        private void OnDestroy()
        {
            ReleaseChineseFont();
        }

        private void ReleaseChineseFont()
        {
            if (chineseFontAsset != null)
            {
                if (chineseFontAsset.material != null)
                    Destroy(chineseFontAsset.material);
                foreach (var texture in chineseFontAsset.atlasTextures)
                {
                    if (texture != null)
                        Destroy(texture);
                }
                Destroy(chineseFontAsset);
            }
            if (ownsChineseFont && chineseFont != null)
                Destroy(chineseFont);
            chineseFontAsset = null;
            chineseFont = null;
            ownsChineseFont = false;
        }

        public void OnNextClicked()
        {
            if (flow != null)
                flow.TryLoadNextLevel();
        }

        public void OnRestartClicked()
        {
            if (session != null)
                session.RequestRestart();
        }

        public void OnLevelSelectClicked()
        {
            if (flow != null)
                flow.TryLoadLevelSelect();
        }

        private void ResolveReferences()
        {
            if (session == null)
                session = FindFirstObjectByType<LevelSessionController>();

            if (flow == null)
                flow = FindFirstObjectByType<LevelFlowController>();
        }

        private void WireButtons()
        {
            if (nextButton != null)
            {
                nextButton.onClick.RemoveListener(OnNextClicked);
                nextButton.onClick.AddListener(OnNextClicked);
            }

            if (restartButton != null)
            {
                restartButton.onClick.RemoveListener(OnRestartClicked);
                restartButton.onClick.AddListener(OnRestartClicked);
            }

            if (levelSelectButton != null)
            {
                levelSelectButton.onClick.RemoveListener(OnLevelSelectClicked);
                levelSelectButton.onClick.AddListener(OnLevelSelectClicked);
            }
        }

        private void Render(LevelOutcomeOverlayState state)
        {
            if (panelRoot != null)
            {
                // This view lives on panelRoot in generated scenes. Disabling that
                // object also disables Update, so a hidden overlay could never reopen.
                if (panelVisibility == null || panelVisibility.gameObject != panelRoot)
                    panelVisibility = panelRoot.GetComponent<CanvasGroup>() ?? panelRoot.AddComponent<CanvasGroup>();

                bool visible = state.Mode != LevelOutcomeOverlayMode.Hidden;
                panelVisibility.alpha = visible ? 1f : 0f;
                panelVisibility.interactable = visible;
                panelVisibility.blocksRaycasts = visible;
            }

            if (titleLabel != null)
                titleLabel.text = useChineseText && state.Mode != LevelOutcomeOverlayMode.Hidden
                    ? state.Mode == LevelOutcomeOverlayMode.Complete ? "你走出了庭院" : "路径已改变"
                    : state.Title;

            if (nextButton != null)
                nextButton.gameObject.SetActive(state.ShowNext);

            if (restartButton != null)
                restartButton.gameObject.SetActive(state.ShowRestart);

            if (levelSelectButton != null)
                levelSelectButton.gameObject.SetActive(state.ShowLevelSelect);
        }
    }
}
