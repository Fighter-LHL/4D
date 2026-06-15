namespace WSlice.Player
{
    public readonly struct SetWCommand
    {
        public readonly float TargetW;
        public SetWCommand(float target) => TargetW = target;
    }
}
