using NUnit.Framework;
using WSlice.Level;

namespace WSlice.Tests.EditMode
{
    public class LevelRestartRulesTests
    {
        [TestCase(LevelSessionState.Playing, true)]
        [TestCase(LevelSessionState.Completed, true)]
        [TestCase(LevelSessionState.Failed, true)]
        [TestCase(LevelSessionState.NotStarted, false)]
        [TestCase(LevelSessionState.Restarting, false)]
        public void CanRequestRestart_FromActiveOrTerminalStates(LevelSessionState state, bool expected)
        {
            Assert.That(LevelRestartRules.CanRequestRestart(state), Is.EqualTo(expected));
        }
    }
}
