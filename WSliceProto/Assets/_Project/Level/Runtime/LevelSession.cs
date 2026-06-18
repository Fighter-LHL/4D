using System;

namespace WSlice.Level
{
    public sealed class LevelSession
    {
        public LevelSessionState State { get; private set; } = LevelSessionState.NotStarted;

        public event Action<LevelSessionState> StateChanged;

        public void Begin()
        {
            if (State != LevelSessionState.NotStarted)
                return;

            SetState(LevelSessionState.Playing);
        }

        public void TickObjective(string currentNodeId, string goalNodeId)
        {
            if (State != LevelSessionState.Playing)
                return;

            if (string.IsNullOrEmpty(goalNodeId))
                return;

            if (currentNodeId == goalNodeId)
                SetState(LevelSessionState.Completed);
        }

        public void MarkFailed()
        {
            if (State == LevelSessionState.Completed || State == LevelSessionState.Failed)
                return;

            SetState(LevelSessionState.Failed);
        }

        public void BeginRestart()
        {
            if (State != LevelSessionState.Completed && State != LevelSessionState.Failed)
                return;

            SetState(LevelSessionState.Restarting);
        }

        public void CompleteRestart()
        {
            if (State != LevelSessionState.Restarting)
                return;

            SetState(LevelSessionState.Playing);
        }

        private void SetState(LevelSessionState next)
        {
            if (State == next)
                return;

            State = next;
            StateChanged?.Invoke(next);
        }
    }
}
