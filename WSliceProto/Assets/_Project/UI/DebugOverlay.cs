using TMPro;
using UnityEngine;
using WSlice.Core;
using WSlice.Level;

namespace WSlice.UI
{
    public sealed class DebugOverlay : MonoBehaviour
    {
        [SerializeField] private TextMeshProUGUI label;
        [SerializeField] private WState wState;
        [SerializeField] private LevelRuntimeController level;
        [SerializeField] private Player.PlayerCharacter character;

        [SerializeField] private string goalNodeId = "FlowerTop";

        private bool _levelComplete;

        private void Start()
        {
            if (level == null)
                level = FindFirstObjectByType<LevelRuntimeController>();

            if (wState == null && level != null)
                wState = level.WState;

            if (character == null)
                character = FindFirstObjectByType<Player.PlayerCharacter>();
        }

        private void Update()
        {
            if (label == null || wState == null || level == null) return;

            int edgeCount = 0;
            foreach (var _ in level.Graph.GetAvailableEdges(wState.CurrentW))
                edgeCount++;

            label.text =
                $"CurrentW: {wState.CurrentW:F2}\n" +
                $"TargetW: {wState.TargetW:F2}\n" +
                $"CurrentNode: {character?.CurrentNodeId}\n" +
                $"AvailableEdges: {edgeCount}" +
                (_levelComplete ? "\n\nLevel Complete!" : string.Empty);
        }

        private void LateUpdate()
        {
            if (!_levelComplete && character != null && character.CurrentNodeId == goalNodeId)
                _levelComplete = true;
        }
    }
}
