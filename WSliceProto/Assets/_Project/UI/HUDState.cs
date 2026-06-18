using System.Collections.Generic;
using WSlice.Player;

namespace WSlice.UI
{
    public sealed class EdgePreview
    {
        public string FromNodeId { get; }
        public string ToNodeId { get; }
        public float MinW { get; }
        public float MaxW { get; }
        public bool AvailableAtCurrentW { get; }
        public bool AvailableAtTargetW { get; }

        public EdgePreview(
            string fromNodeId,
            string toNodeId,
            float minW,
            float maxW,
            bool availableAtCurrentW,
            bool availableAtTargetW)
        {
            FromNodeId = fromNodeId ?? string.Empty;
            ToNodeId = toNodeId ?? string.Empty;
            MinW = minW;
            MaxW = maxW;
            AvailableAtCurrentW = availableAtCurrentW;
            AvailableAtTargetW = availableAtTargetW;
        }
    }

    public sealed class RouteHint
    {
        public string FromNodeId { get; }
        public string ToNodeId { get; }
        public string TargetNodeId { get; }
        public float MinW { get; }
        public float MaxW { get; }

        public RouteHint(
            string fromNodeId,
            string toNodeId,
            string targetNodeId,
            float minW,
            float maxW)
        {
            FromNodeId = fromNodeId ?? string.Empty;
            ToNodeId = toNodeId ?? string.Empty;
            TargetNodeId = targetNodeId ?? string.Empty;
            MinW = minW;
            MaxW = maxW;
        }
    }

    public sealed class HUDState
    {
        public float CurrentW { get; }
        public float TargetW { get; }
        public IReadOnlyList<float> SnapPoints { get; }
        public IReadOnlyList<EdgePreview> AvailableEdges { get; }
        public IReadOnlyList<EdgePreview> EdgePreviews { get; }
        public bool IsMoving { get; }
        public string ActiveSegmentFromId { get; }
        public string ActiveSegmentToId { get; }
        public bool ActiveMoveWillBreakAtTargetW { get; }
        public PlayerActionFailureReason LastFailureReason { get; }
        public string LastFailureMessage { get; }
        public RouteHint RouteHint { get; }
        public bool HasRouteHint => RouteHint != null;

        public HUDState(
            float currentW,
            float targetW,
            IReadOnlyList<float> snapPoints,
            IReadOnlyList<EdgePreview> availableEdges,
            IReadOnlyList<EdgePreview> edgePreviews,
            bool isMoving,
            string activeSegmentFromId,
            string activeSegmentToId,
            bool activeMoveWillBreakAtTargetW,
            PlayerActionFailureReason lastFailureReason,
            string lastFailureMessage)
            : this(
                currentW,
                targetW,
                snapPoints,
                availableEdges,
                edgePreviews,
                isMoving,
                activeSegmentFromId,
                activeSegmentToId,
                activeMoveWillBreakAtTargetW,
                lastFailureReason,
                lastFailureMessage,
                null)
        {
        }

        public HUDState(
            float currentW,
            float targetW,
            IReadOnlyList<float> snapPoints,
            IReadOnlyList<EdgePreview> availableEdges,
            IReadOnlyList<EdgePreview> edgePreviews,
            bool isMoving,
            string activeSegmentFromId,
            string activeSegmentToId,
            bool activeMoveWillBreakAtTargetW,
            PlayerActionFailureReason lastFailureReason,
            string lastFailureMessage,
            RouteHint routeHint)
        {
            CurrentW = currentW;
            TargetW = targetW;
            SnapPoints = snapPoints ?? new List<float>().AsReadOnly();
            AvailableEdges = availableEdges ?? new List<EdgePreview>().AsReadOnly();
            EdgePreviews = edgePreviews ?? new List<EdgePreview>().AsReadOnly();
            IsMoving = isMoving;
            ActiveSegmentFromId = activeSegmentFromId ?? string.Empty;
            ActiveSegmentToId = activeSegmentToId ?? string.Empty;
            ActiveMoveWillBreakAtTargetW = activeMoveWillBreakAtTargetW;
            LastFailureReason = lastFailureReason;
            LastFailureMessage = lastFailureMessage ?? string.Empty;
            RouteHint = routeHint;
        }
    }
}
