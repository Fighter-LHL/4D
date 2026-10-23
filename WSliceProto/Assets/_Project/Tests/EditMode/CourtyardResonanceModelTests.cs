using System;
using NUnit.Framework;
using WSlice.Level;

namespace WSlice.Tests.EditMode
{
    public class CourtyardResonanceModelTests
    {
        [TestCase(CourtyardLayout.Entry, CourtyardLayout.Courtyard, 0.2f, 0.4f)]
        [TestCase(CourtyardLayout.StairFoot, CourtyardLayout.UpperLanding, 0.7f, 0.9f)]
        [TestCase(CourtyardLayout.BridgeStart, CourtyardLayout.ExitLanding, 0.45f, 0.6f)]
        public void SliceRanges_MatchAuthoredEdgesInBothDirections(string from, string to, float min, float max)
        {
            Assert.That(CourtyardResonanceModel.GetRange(from, to, out float actualMin, out float actualMax), Is.True);
            Assert.That(actualMin, Is.EqualTo(min));
            Assert.That(actualMax, Is.EqualTo(max));
            Assert.That(CourtyardResonanceModel.GetRange(to, from, out actualMin, out actualMax), Is.True);
            Assert.That(actualMin, Is.EqualTo(min));
            Assert.That(actualMax, Is.EqualTo(max));
        }

        [TestCase(CourtyardLayout.Courtyard, CourtyardLayout.StairFoot)]
        [TestCase(CourtyardLayout.UpperLanding, CourtyardLayout.Mechanism)]
        [TestCase(CourtyardLayout.Courtyard, CourtyardLayout.BridgeStart)]
        [TestCase(CourtyardLayout.ExitLanding, CourtyardLayout.Goal)]
        [TestCase(null, CourtyardLayout.Entry)]
        public void PermanentOrUnknownEdges_CannotEarnOrConsumeStability(string from, string to)
        {
            var model = new CourtyardResonanceModel();
            Assert.That(CourtyardResonanceModel.IsSliceEdge(from, to), Is.False);
            Assert.That(model.BeginCrossing(from, to), Is.False);
            Assert.That(model.Tick(10f, 0f), Is.False);
            Assert.That(model.CompleteCrossing(), Is.Zero);
            Assert.That(model.IsCrossing, Is.False);
            Assert.That(model.Stability, Is.EqualTo(1f));
            Assert.That(model.Charge01, Is.Zero);
        }

        [TestCase(0.2f, true)]
        [TestCase(0.24f, true)]
        [TestCase(0.2401f, false)]
        [TestCase(0.3f, false)]
        [TestCase(0.3599f, false)]
        [TestCase(0.36f, true)]
        [TestCase(0.4f, true)]
        public void OuterTwentyPercent_IsDangerousIncludingItsBoundary(float w, bool dangerous)
        {
            var model = Entrance();
            Assert.That(model.Tick(0.1f, w), Is.False);
            Assert.That(model.IsDangerous, Is.EqualTo(dangerous));
            Assert.That(model.Stability, dangerous ? Is.LessThan(1f) : Is.EqualTo(1f));
        }

        [TestCase(0.1999f)]
        [TestCase(0.4001f)]
        [TestCase(float.NaN)]
        public void OutsideActualRange_CollapsesWithoutGivingCompletionReward(float w)
        {
            var model = Entrance();
            Assert.That(model.Tick(0f, w), Is.True);
            Assert.That(model.Stability, Is.Zero);
            Assert.That(model.Tick(1f, 0.3f), Is.True, "A collapsed crossing cannot recover itself.");
            Assert.That(model.CompleteCrossing(), Is.Zero);
            Assert.That(model.HasReward(CourtyardLayout.Entry, CourtyardLayout.Courtyard), Is.False);
            model.FailCrossing();
            Assert.That(model.IsCrossing, Is.False);
        }

        [Test]
        public void SafeArrival_EarnsOneOnlyAfterSuccessfulCompletion()
        {
            var model = Entrance();
            model.Tick(4f, 0.3f);
            Assert.That(model.Carried, Is.Zero);
            Assert.That(model.CompleteCrossing(), Is.EqualTo(1));
            Assert.That(model.Carried, Is.EqualTo(1));
            Assert.That(model.IsCrossing, Is.False);
            Assert.That(model.HasReward(CourtyardLayout.Entry, CourtyardLayout.Courtyard), Is.True);
            Assert.That(model.CompleteCrossing(), Is.Zero);
        }

        [TestCase(0.299f, 1)]
        [TestCase(0.3f, 3)]
        [TestCase(0.6f, 3)]
        public void DangerCharge_HasAnActualTimeThreshold(float elapsed, int reward)
        {
            var model = Entrance();
            Assert.That(model.Tick(elapsed, 0.22f), Is.False);
            Assert.That(model.IsCharged, Is.EqualTo(reward == 3));
            Assert.That(model.CompleteCrossing(), Is.EqualTo(reward));
        }

        [Test]
        public void ReturningToCenter_RefillsStabilityButKeepsEarnedCharge()
        {
            var model = Entrance();
            model.Tick(0.4f, 0.22f);
            float depleted = model.Stability;
            model.Tick(0.1f, 0.3f);
            Assert.That(model.Stability, Is.EqualTo(depleted + 0.15f).Within(0.00001f));
            model.Tick(2f, 0.3f);
            Assert.That(model.Stability, Is.EqualTo(1f));
            Assert.That(model.IsDangerous, Is.False);
            Assert.That(model.IsCharged, Is.True);
            Assert.That(model.CompleteCrossing(), Is.EqualTo(3));
        }

        [Test]
        public void SeparateDangerIntervals_AccumulateChargeOnlyDuringCrossing()
        {
            var model = Entrance();
            model.Tick(0.15f, 0.22f);
            model.Tick(0.5f, 0.3f);
            model.Tick(0.15f, 0.38f);
            Assert.That(model.IsCharged, Is.True);
            Assert.That(model.Charge01, Is.EqualTo(1f));
            Assert.That(model.CompleteCrossing(), Is.EqualTo(3));
            Assert.That(model.Tick(5f, 0.22f), Is.False);
            Assert.That(model.Charge01, Is.Zero);
            Assert.That(model.Stability, Is.EqualTo(1f));
        }

        [TestCase(30)]
        [TestCase(60)]
        [TestCase(144)]
        public void ChargeAndCollapse_AreIndependentOfFrameRate(int framesPerSecond)
        {
            var model = Entrance();
            float dt = 1f / framesPerSecond;
            for (int frame = 0; frame < framesPerSecond / 2; frame++)
                Assert.That(model.Tick(dt, 0.22f), Is.False);
            Assert.That(model.Stability, Is.EqualTo(1f - 0.5f / 0.85f).Within(0.00001f));
            Assert.That(model.IsCharged, Is.True);
            Assert.That(model.CompleteCrossing(), Is.EqualTo(3));

            model.BeginCrossing(CourtyardLayout.Courtyard, CourtyardLayout.Entry);
            float elapsed = 0f;
            while (!model.Tick(dt, 0.22f))
                elapsed += dt;
            elapsed += dt;
            Assert.That(elapsed, Is.InRange(0.85f - 0.00001f, 0.85f + dt + 0.00001f));
            Assert.That(model.Stability, Is.Zero);
            Assert.That(model.CompleteCrossing(), Is.Zero);
        }

        [Test]
        public void ExactCollapseThreshold_IsLatchedAndCannotAward()
        {
            var model = Entrance();
            Assert.That(model.Tick(0.85f, 0.22f), Is.True);
            Assert.That(model.IsCrossing, Is.True);
            Assert.That(model.CompleteCrossing(), Is.Zero);
            Assert.That(model.Tick(10f, 0.3f), Is.True);
        }

        [Test]
        public void RepeatedBegin_DoesNotResetTheCurrentRiskOrChangeItsDirection()
        {
            var model = Entrance();
            model.Tick(0.4f, 0.22f);
            float stability = model.Stability;
            Assert.That(model.BeginCrossing(CourtyardLayout.Entry, CourtyardLayout.Courtyard), Is.False);
            Assert.That(model.BeginCrossing(CourtyardLayout.Courtyard, CourtyardLayout.Entry), Is.False);
            Assert.That(model.Stability, Is.EqualTo(stability));
            Assert.That(model.IsCharged, Is.True);
            Assert.That(model.ActiveFrom, Is.EqualTo(CourtyardLayout.Entry));
            Assert.That(model.ActiveTo, Is.EqualTo(CourtyardLayout.Courtyard));
        }

        [Test]
        public void DirectedRewards_AreUniqueWhileCarriedAndAfterBanking()
        {
            var model = Entrance();
            Assert.That(model.CompleteCrossing(), Is.EqualTo(1));
            model.BeginCrossing(CourtyardLayout.Entry, CourtyardLayout.Courtyard);
            model.Tick(0.4f, 0.22f);
            Assert.That(model.CompleteCrossing(), Is.Zero, "Risky repeats cannot upgrade or farm a claimed edge.");
            model.BeginCrossing(CourtyardLayout.Courtyard, CourtyardLayout.Entry);
            Assert.That(model.CompleteCrossing(), Is.EqualTo(1));
            Assert.That(model.Bank(), Is.EqualTo(2));
            Assert.That(model.Bank(), Is.Zero);
            Assert.That(model.Banked, Is.EqualTo(2));
            Assert.That(model.Carried, Is.Zero);
            model.BeginCrossing(CourtyardLayout.Entry, CourtyardLayout.Courtyard);
            Assert.That(model.CompleteCrossing(), Is.Zero);
        }

        [Test]
        public void FailedCrossing_LosesAllCarriedRewardsAndAllowsTheirRecovery()
        {
            var model = Entrance();
            model.Tick(0.3f, 0.22f);
            model.CompleteCrossing();
            model.BeginCrossing(CourtyardLayout.StairFoot, CourtyardLayout.UpperLanding);
            model.CompleteCrossing();
            model.BeginCrossing(CourtyardLayout.BridgeStart, CourtyardLayout.ExitLanding);
            Assert.That(model.FailCrossing(), Is.EqualTo(4));
            Assert.That(model.FailCrossing(), Is.Zero, "A repeated recovery must not charge twice.");
            Assert.That(model.Carried, Is.Zero);
            Assert.That(model.HasReward(CourtyardLayout.Entry, CourtyardLayout.Courtyard), Is.False);
            Assert.That(model.HasReward(CourtyardLayout.StairFoot, CourtyardLayout.UpperLanding), Is.False);
            model.BeginCrossing(CourtyardLayout.Entry, CourtyardLayout.Courtyard);
            Assert.That(model.CompleteCrossing(), Is.EqualTo(1));
            model.BeginCrossing(CourtyardLayout.StairFoot, CourtyardLayout.UpperLanding);
            Assert.That(model.CompleteCrossing(), Is.EqualTo(1));
        }

        [Test]
        public void Failure_OnAnAlreadyRewardedEdgeStillLosesCarriedButPreservesBanked()
        {
            var model = Entrance();
            model.CompleteCrossing();
            model.Bank();
            model.BeginCrossing(CourtyardLayout.Courtyard, CourtyardLayout.Entry);
            model.Tick(0.3f, 0.22f);
            model.CompleteCrossing();
            model.BeginCrossing(CourtyardLayout.Entry, CourtyardLayout.Courtyard);
            Assert.That(model.Tick(0.85f, 0.22f), Is.True);
            Assert.That(model.FailCrossing(), Is.EqualTo(3));
            Assert.That(model.Banked, Is.EqualTo(1));
            Assert.That(model.HasReward(CourtyardLayout.Entry, CourtyardLayout.Courtyard), Is.True);
            Assert.That(model.HasReward(CourtyardLayout.Courtyard, CourtyardLayout.Entry), Is.False);
            model.BeginCrossing(CourtyardLayout.Entry, CourtyardLayout.Courtyard);
            Assert.That(model.CompleteCrossing(), Is.Zero);
        }

        [Test]
        public void Reset_ClearsBankedCarriedClaimsAndActiveCrossing()
        {
            var model = Entrance();
            model.CompleteCrossing();
            model.Bank();
            model.BeginCrossing(CourtyardLayout.Courtyard, CourtyardLayout.Entry);
            model.CompleteCrossing();
            model.BeginCrossing(CourtyardLayout.StairFoot, CourtyardLayout.UpperLanding);
            model.Tick(0.4f, 0.72f);
            model.Reset();
            Assert.That(model.Carried, Is.Zero);
            Assert.That(model.Banked, Is.Zero);
            Assert.That(model.IsCrossing, Is.False);
            Assert.That(model.IsDangerous, Is.False);
            Assert.That(model.IsCharged, Is.False);
            Assert.That(model.ActiveFrom, Is.Empty);
            Assert.That(model.ActiveTo, Is.Empty);
            Assert.That(model.Stability, Is.EqualTo(1f));
            Assert.That(model.Charge01, Is.Zero);
            Assert.That(model.HasReward(CourtyardLayout.Entry, CourtyardLayout.Courtyard), Is.False);
            Assert.That(model.HasReward(CourtyardLayout.Courtyard, CourtyardLayout.Entry), Is.False);
            model.BeginCrossing(CourtyardLayout.Entry, CourtyardLayout.Courtyard);
            Assert.That(model.CompleteCrossing(), Is.EqualTo(1));
        }

        [TestCase(-0.1f)]
        [TestCase(float.NaN)]
        [TestCase(float.PositiveInfinity)]
        public void InvalidDelta_CannotCorruptStability(float delta)
        {
            var model = Entrance();
            Assert.Throws<ArgumentOutOfRangeException>(() => model.Tick(delta, 0.22f));
            Assert.That(model.Stability, Is.EqualTo(1f));
        }

        [Test]
        public void RiskChain_AdvancesOnlyForNewChargedRewardsAndCapsAtThree()
        {
            var model = Entrance();
            model.Tick(0.3f, 0.22f);
            model.CompleteCrossing();
            Assert.That(model.RiskChain, Is.EqualTo(1));
            Assert.That(model.BestRiskChain, Is.EqualTo(1));
            model.BeginCrossing(CourtyardLayout.Entry, CourtyardLayout.Courtyard);
            model.Tick(0.3f, 0.22f);
            Assert.That(model.CompleteCrossing(), Is.Zero);
            Assert.That(model.RiskChain, Is.EqualTo(1), "Already claimed directions must not upgrade scene responses.");
            RiskReward(model, CourtyardLayout.Courtyard, CourtyardLayout.Entry, 0.22f);
            RiskReward(model, CourtyardLayout.StairFoot, CourtyardLayout.UpperLanding, 0.72f);
            RiskReward(model, CourtyardLayout.UpperLanding, CourtyardLayout.StairFoot, 0.72f);
            Assert.That(model.RiskChain, Is.EqualTo(3));
            Assert.That(model.BestRiskChain, Is.EqualTo(3));
            Assert.That(model.Carried, Is.EqualTo(12), "A stronger spectacle must not silently change currency rewards.");
        }

        [Test]
        public void SafeTravelAndBanking_PreserveChain_OnlyDepositedTierSurvivesFailure()
        {
            var model = Entrance();
            model.Tick(0.3f, 0.22f);
            model.CompleteCrossing();
            model.BeginCrossing(CourtyardLayout.Courtyard, CourtyardLayout.Entry);
            Assert.That(model.CompleteCrossing(), Is.EqualTo(1));
            Assert.That(model.RiskChain, Is.EqualTo(1));
            Assert.That(model.Bank(), Is.EqualTo(4));
            Assert.That(model.SecuredRiskChain, Is.EqualTo(1));
            Assert.That(model.RiskChain, Is.EqualTo(1));
            RiskReward(model, CourtyardLayout.StairFoot, CourtyardLayout.UpperLanding, 0.72f);
            Assert.That(model.RiskChain, Is.EqualTo(2));
            Assert.That(model.FailCrossing(), Is.EqualTo(3));
            Assert.That(model.RiskChain, Is.Zero);
            Assert.That(model.SecuredRiskChain, Is.EqualTo(1));
            Assert.That(model.BestRiskChain, Is.EqualTo(2));
            Assert.That(model.Banked, Is.EqualTo(4));
            model.Bank();
            Assert.That(model.SecuredRiskChain, Is.EqualTo(1), "Empty banking cannot secure a lost best streak.");
            model.Reset();
            Assert.That(model.RiskChain, Is.Zero);
            Assert.That(model.BestRiskChain, Is.Zero);
            Assert.That(model.SecuredRiskChain, Is.Zero);
        }

        [Test]
        public void FailedChargeAndUnbankedChain_DoNotSecureSceneProgress()
        {
            var model = Entrance();
            model.Tick(0.85f, 0.22f);
            Assert.That(model.CompleteCrossing(), Is.Zero);
            Assert.That(model.RiskChain, Is.Zero);
            model.FailCrossing();
            RiskReward(model, CourtyardLayout.Entry, CourtyardLayout.Courtyard, 0.22f);
            Assert.That(model.SecuredRiskChain, Is.Zero);
            model.FailCrossing();
            Assert.That(model.RiskChain, Is.Zero);
            Assert.That(model.SecuredRiskChain, Is.Zero);
            RiskReward(model, CourtyardLayout.Entry, CourtyardLayout.Courtyard, 0.22f);
            Assert.That(model.RiskChain, Is.EqualTo(1), "Retry starts a new chain, not the lost tier.");
        }

        private static void RiskReward(CourtyardResonanceModel model, string from, string to, float w)
        {
            Assert.That(model.BeginCrossing(from, to), Is.True);
            Assert.That(model.Tick(0.3f, w), Is.False);
            Assert.That(model.CompleteCrossing(), Is.EqualTo(3));
        }

        private static CourtyardResonanceModel Entrance()
        {
            var model = new CourtyardResonanceModel();
            Assert.That(model.BeginCrossing(CourtyardLayout.Entry, CourtyardLayout.Courtyard), Is.True);
            return model;
        }
    }
}
