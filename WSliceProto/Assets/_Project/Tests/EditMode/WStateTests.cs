using NUnit.Framework;
using WSlice.Core;

namespace WSlice.Tests.EditMode
{
    public class WStateTests
    {
        [Test]
        public void SetTarget_ClampsAboveOne()
        {
            var state = new WState();
            state.SetTarget(1.5f);
            Assert.AreEqual(1f, state.TargetW, 0.0001f);
        }

        [Test]
        public void SetTarget_ClampsBelowZero()
        {
            var state = new WState();
            state.SetTarget(-0.5f);
            Assert.AreEqual(0f, state.TargetW, 0.0001f);
        }

        [Test]
        public void Tick_MovesCurrentWAndFiresEvent()
        {
            var state = new WState();
            float captured = -1f;
            state.OnWChanged += w => captured = w;
            state.SetTarget(0.5f);
            state.Tick(1f, 10f);
            Assert.AreEqual(state.CurrentW, captured, 0.0001f);
            Assert.AreNotEqual(0f, state.CurrentW);
        }

        [Test]
        public void Force_SetsBothAndFiresEvent()
        {
            var state = new WState();
            float captured = -1f;
            state.OnWChanged += w => captured = w;
            state.Force(0.75f);
            Assert.AreEqual(0.75f, state.CurrentW, 0.0001f);
            Assert.AreEqual(0.75f, state.TargetW, 0.0001f);
            Assert.AreEqual(0.75f, captured, 0.0001f);
        }
    }
}
