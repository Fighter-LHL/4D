using System.Text;
using TMPro;
using UnityEngine;
using WSlice.Level;
using WSlice.Player;

namespace WSlice.UI
{
    public sealed class PlayerHUDView : MonoBehaviour
    {
        [SerializeField] private TextMeshProUGUI label;
        [SerializeField] private LevelRuntimeController level;
        [SerializeField] private LevelSessionController session;
        [SerializeField] private LevelFlowController flow;
        [SerializeField] private MovementController movement;
        [SerializeField] private PlayerInputRouter inputRouter;
        [SerializeField] private PlayerCharacter character;

        public PlayerHUDState LastState { get; private set; } =
            new PlayerHUDState("Find a W that opens the path.", string.Empty, string.Empty, false, false, false);

        private void Start()
        {
            ResolveReferences();
        }

        private void Update()
        {
            ResolveReferences();

            HUDState hud = WDialModel.Build(level, movement, inputRouter, character);
            bool isComplete = session != null && session.State == LevelSessionState.Completed;
            bool hasNextLevel = isComplete && flow != null && flow.HasNextLevelInCatalog;
            LastState = PlayerHUDModel.Build(hud, isComplete, hasNextLevel);
            Render(LastState);
        }

        private void ResolveReferences()
        {
            if (label == null)
                label = GetComponent<TextMeshProUGUI>();

            if (level == null)
                level = FindFirstObjectByType<LevelRuntimeController>();

            if (session == null)
                session = FindFirstObjectByType<LevelSessionController>();

            if (movement == null)
                movement = FindFirstObjectByType<MovementController>();

            if (inputRouter == null)
                inputRouter = FindFirstObjectByType<PlayerInputRouter>();

            if (character == null)
                character = FindFirstObjectByType<PlayerCharacter>();

            if (flow == null)
                flow = FindFirstObjectByType<LevelFlowController>();
        }

        private void Render(PlayerHUDState state)
        {
            if (label == null || state == null) return;

            var builder = new StringBuilder();
            builder.Append(state.PrimaryText);

            if (state.ShowWarning)
                builder.AppendLine().Append(state.WarningText);

            if (state.ShowFailure)
                builder.AppendLine().Append(state.FailureText);

            if (state.ShowHint)
                builder.AppendLine().Append(state.HintText);

            label.text = builder.ToString();
        }
    }
}
