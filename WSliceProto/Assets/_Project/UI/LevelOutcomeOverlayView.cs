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

        public LevelOutcomeOverlayState LastState { get; private set; } =
            new LevelOutcomeOverlayState(LevelOutcomeOverlayMode.Hidden, string.Empty, false, false, false);

        private void Awake()
        {
            ResolveReferences();
            WireButtons();
        }

        private void Update()
        {
            ResolveReferences();

            bool isComplete = session != null && session.State == LevelSessionState.Completed;
            bool isFailed = session != null && session.State == LevelSessionState.Failed;
            bool hasNextLevel = isComplete && flow != null && flow.HasNextLevelInCatalog;
            LastState = LevelOutcomeOverlayModel.Build(
                session != null ? session.State : LevelSessionState.NotStarted,
                hasNextLevel);
            Render(LastState);
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
                panelRoot.SetActive(state.Mode != LevelOutcomeOverlayMode.Hidden);

            if (titleLabel != null)
                titleLabel.text = state.Title;

            if (nextButton != null)
                nextButton.gameObject.SetActive(state.ShowNext);

            if (restartButton != null)
                restartButton.gameObject.SetActive(state.ShowRestart);

            if (levelSelectButton != null)
                levelSelectButton.gameObject.SetActive(state.ShowLevelSelect);
        }
    }
}
