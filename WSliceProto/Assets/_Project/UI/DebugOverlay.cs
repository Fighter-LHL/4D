using System.Text;
using TMPro;
using UnityEngine;
using WSlice.Core;
using WSlice.Level;
using WSlice.Player;

namespace WSlice.UI
{
    public sealed class DebugOverlay : MonoBehaviour
    {
        [SerializeField] private TextMeshProUGUI label;
        [SerializeField] private WState wState;
        [SerializeField] private LevelRuntimeController level;
        [SerializeField] private LevelSessionController session;
        [SerializeField] private PlayerCharacter character;
        [SerializeField] private MovementController movement;
        [SerializeField] private PlayerInputRouter inputRouter;

        private void Start()
        {
            if (level == null)
                level = FindFirstObjectByType<LevelRuntimeController>();

            if (session == null)
                session = FindFirstObjectByType<LevelSessionController>();

            if (wState == null && level != null)
                wState = level.WState;

            if (character == null)
                character = FindFirstObjectByType<PlayerCharacter>();

            if (movement == null)
                movement = FindFirstObjectByType<MovementController>();

            if (inputRouter == null)
                inputRouter = FindFirstObjectByType<PlayerInputRouter>();
        }

        private void Update()
        {
            if (label == null || wState == null || level == null) return;

            HUDState state = WDialModel.Build(level, movement, inputRouter, character);
            label.text = BuildDebugText(state);
        }

        private string BuildDebugText(HUDState state)
        {
            var builder = new StringBuilder();
            builder.AppendLine($"Session: {session?.State ?? LevelSessionState.NotStarted}");
            builder.AppendLine($"CurrentW: {state.CurrentW:F2}");
            builder.AppendLine($"TargetW: {state.TargetW:F2}");
            builder.AppendLine($"CurrentNode: {character?.CurrentNodeId}");
            builder.Append("SnapPoints: ");
            if (state.SnapPoints.Count == 0)
            {
                builder.AppendLine("-");
            }
            else
            {
                for (int i = 0; i < state.SnapPoints.Count; i++)
                {
                    if (i > 0) builder.Append(", ");
                    builder.Append(state.SnapPoints[i].ToString("F2"));
                }
                builder.AppendLine();
            }

            builder.AppendLine($"AvailableEdges: {state.AvailableEdges.Count}");
            foreach (var edge in state.AvailableEdges)
            {
                builder.AppendLine($"- {edge.FromNodeId}->{edge.ToNodeId} [{edge.MinW:F2}-{edge.MaxW:F2}]");
            }

            builder.AppendLine($"MoveWillBreak: {(state.ActiveMoveWillBreakAtTargetW ? "Yes" : "No")}");
            if (state.HasRouteHint)
            {
                builder.AppendLine(
                    $"RouteHint: {state.RouteHint.FromNodeId}->{state.RouteHint.ToNodeId} "
                    + $"[{state.RouteHint.MinW:F2}-{state.RouteHint.MaxW:F2}] target {state.RouteHint.TargetNodeId}");
            }

            if (state.LastFailureReason != PlayerActionFailureReason.None)
                builder.AppendLine($"LastFailure: {state.LastFailureReason} - {state.LastFailureMessage}");

            if (session != null && session.State == LevelSessionState.Completed)
                builder.AppendLine().Append("Level Complete!");

            return builder.ToString();
        }
    }
}
