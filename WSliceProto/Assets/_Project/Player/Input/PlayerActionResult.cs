namespace WSlice.Player
{
    public enum PlayerActionFailureReason
    {
        None,
        MissingWState,
        MissingCamera,
        MissingMovement,
        NoGroundHit,
        MissingCharacterOrLevel,
        MissingCurrentNode,
        NoNearestNode,
        NoPathAtCurrentW
    }

    public readonly struct PlayerActionResult
    {
        public PlayerActionFailureReason Reason { get; }
        public string Message { get; }
        public bool Succeeded => Reason == PlayerActionFailureReason.None;

        private PlayerActionResult(PlayerActionFailureReason reason, string message)
        {
            Reason = reason;
            Message = message ?? string.Empty;
        }

        public static PlayerActionResult Success()
        {
            return new PlayerActionResult(PlayerActionFailureReason.None, string.Empty);
        }

        public static PlayerActionResult Failure(PlayerActionFailureReason reason)
        {
            return new PlayerActionResult(reason, DefaultMessage(reason));
        }

        private static string DefaultMessage(PlayerActionFailureReason reason)
        {
            return reason switch
            {
                PlayerActionFailureReason.MissingWState => "W state is not available.",
                PlayerActionFailureReason.MissingCamera => "Game camera is not available.",
                PlayerActionFailureReason.MissingMovement => "Movement controller is not available.",
                PlayerActionFailureReason.NoGroundHit => "Tap did not hit walkable ground.",
                PlayerActionFailureReason.MissingCharacterOrLevel => "Character or level runtime is not available.",
                PlayerActionFailureReason.MissingCurrentNode => "Character has no current node.",
                PlayerActionFailureReason.NoNearestNode => "No nearby graph node was found.",
                PlayerActionFailureReason.NoPathAtCurrentW => "No path is available at current W.",
                _ => string.Empty
            };
        }
    }
}
