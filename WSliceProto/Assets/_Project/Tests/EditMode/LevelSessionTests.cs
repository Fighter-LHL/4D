using NUnit.Framework;
using WSlice.Level;

namespace WSlice.Tests.EditMode
{
    public class LevelSessionTests
    {
        [Test]
        public void Begin_FromNotStarted_TransitionsToPlaying()
        {
            var session = new LevelSession();

            session.Begin();

            Assert.That(session.State, Is.EqualTo(LevelSessionState.Playing));
        }

        [Test]
        public void Begin_WhenAlreadyPlaying_IsIdempotent()
        {
            var session = new LevelSession();
            session.Begin();
            int changeCount = 0;
            session.StateChanged += _ => changeCount++;

            session.Begin();

            Assert.That(session.State, Is.EqualTo(LevelSessionState.Playing));
            Assert.That(changeCount, Is.EqualTo(0));
        }

        [Test]
        public void TickObjective_AtGoalWhilePlaying_CompletesSession()
        {
            var session = new LevelSession();
            session.Begin();
            LevelSessionState? lastState = null;
            session.StateChanged += state => lastState = state;

            session.TickObjective("FlowerTop", "FlowerTop");

            Assert.That(session.State, Is.EqualTo(LevelSessionState.Completed));
            Assert.That(lastState, Is.EqualTo(LevelSessionState.Completed));
        }

        [Test]
        public void TickObjective_BeforeGoal_StaysPlaying()
        {
            var session = new LevelSession();
            session.Begin();

            session.TickObjective("Outside", "FlowerTop");

            Assert.That(session.State, Is.EqualTo(LevelSessionState.Playing));
        }

        [Test]
        public void TickObjective_EmptyGoal_DoesNotComplete()
        {
            var session = new LevelSession();
            session.Begin();

            session.TickObjective("FlowerTop", string.Empty);

            Assert.That(session.State, Is.EqualTo(LevelSessionState.Playing));
        }

        [Test]
        public void MarkFailed_FromPlaying_TransitionsToFailed()
        {
            var session = new LevelSession();
            session.Begin();

            session.MarkFailed();

            Assert.That(session.State, Is.EqualTo(LevelSessionState.Failed));
        }

        [Test]
        public void RestartFlow_CompletedToPlaying()
        {
            var session = new LevelSession();
            session.Begin();
            session.TickObjective("FlowerTop", "FlowerTop");

            session.BeginRestart();
            Assert.That(session.State, Is.EqualTo(LevelSessionState.Restarting));

            session.CompleteRestart();
            Assert.That(session.State, Is.EqualTo(LevelSessionState.Playing));
        }

        [Test]
        public void RestartFlow_PlayingToPlaying()
        {
            var session = new LevelSession();
            session.Begin();

            session.BeginRestart();
            Assert.That(session.State, Is.EqualTo(LevelSessionState.Restarting));

            session.CompleteRestart();
            Assert.That(session.State, Is.EqualTo(LevelSessionState.Playing));
        }
    }
}
