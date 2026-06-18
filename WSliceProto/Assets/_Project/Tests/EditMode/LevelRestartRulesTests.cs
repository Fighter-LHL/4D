using NUnit.Framework;
using WSlice.Level;

namespace WSlice.Tests.EditMode
{
    public class LevelRestartRulesTests
    {
        [TestCase(LevelSessionState.Completed, true)]
        [TestCase(LevelSessionState.Failed, true)]
        [TestCase(LevelSessionState.Playing, false)]
        [TestCase(LevelSessionState.NotStarted, false)]
        [TestCase(LevelSessionState.Restarting, false)]
        public void CanRequestRestart_OnlyFromTerminalStates(LevelSessionState state, bool expected)
        {
            Assert.That(LevelRestartRules.CanRequestRestart(state), Is.EqualTo(expected));
        }
    }
}
