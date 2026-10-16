using NUnit.Framework;
using WSlice.UI;

namespace WSlice.Tests.EditMode
{
    public class CourtyardExperienceModelTests
    {
        [Test]
        public void ObservingWithoutACompletedAction_DoesNotDismissInstructionOrRevealHint()
        {
            var model = new CourtyardExperienceModel();
            model.Observe(CourtyardExperienceStage.EnterCourtyard, 0);
            string instruction = model.Instruction;

            for (int frame = 0; frame < 100; frame++)
                model.Observe(CourtyardExperienceStage.EnterCourtyard, 0);

            Assert.That(model.Instruction, Is.EqualTo(instruction));
            Assert.That(model.Hint, Is.Empty);
        }

        [Test]
        public void RequestingHints_RevealsThreeIncreasingLevelsAndStops()
        {
            var model = new CourtyardExperienceModel();
            model.Observe(CourtyardExperienceStage.FindMechanism, 0);
            model.RequestHint();
            string first = model.Hint;
            model.RequestHint();
            string second = model.Hint;
            model.RequestHint();
            string third = model.Hint;
            model.RequestHint();

            Assert.That(first, Is.Not.Empty.And.Not.EqualTo(second));
            Assert.That(second, Is.Not.EqualTo(third));
            Assert.That(model.Hint, Is.EqualTo(third));
            Assert.That(model.HintLevel, Is.EqualTo(3));
            Assert.That(model.HasMoreHints, Is.False);
        }

        [Test]
        public void CompletedAction_ClearsPreviousHintAndAdvancesInstruction()
        {
            var model = new CourtyardExperienceModel();
            model.Observe(CourtyardExperienceStage.FindMechanism, 0);
            model.RequestHint();
            model.Observe(CourtyardExperienceStage.ActivateMechanism, 0);

            Assert.That(model.Hint, Is.Empty);
            Assert.That(model.Instruction, Does.Contain("已到达机关旁"));
            Assert.That(model.HintLevel, Is.Zero);
        }

        [Test]
        public void RestartAtSameStage_ClearsHints()
        {
            var model = new CourtyardExperienceModel();
            model.Observe(CourtyardExperienceStage.EnterCourtyard, 7);
            model.RequestHint();
            model.Observe(CourtyardExperienceStage.EnterCourtyard, 8);

            Assert.That(model.Hint, Is.Empty);
            Assert.That(model.HintButtonLabel, Is.EqualTo("提示"));
        }

        [Test]
        public void Complete_DoesNotOfferHints()
        {
            var model = new CourtyardExperienceModel();
            model.Observe(CourtyardExperienceStage.Complete, 0);
            model.RequestHint();

            Assert.That(model.Hint, Is.Empty);
            Assert.That(model.HasMoreHints, Is.False);
        }

        [TestCase(CourtyardExperienceStage.EnterCourtyard)]
        [TestCase(CourtyardExperienceStage.FindMechanism)]
        [TestCase(CourtyardExperienceStage.ActivateMechanism)]
        [TestCase(CourtyardExperienceStage.ReturnToCourtyard)]
        [TestCase(CourtyardExperienceStage.ReachExit)]
        public void PlayerCopy_DoesNotExposeInternalNodesOrNumericSolutions(CourtyardExperienceStage stage)
        {
            var model = new CourtyardExperienceModel();
            model.Observe(stage, 0);
            string copy = model.Instruction;
            for (int i = 0; i < 3; i++)
            {
                model.RequestHint();
                copy += model.Hint;
            }

            Assert.That(copy, Does.Not.Match("[A-Za-z0-9]"));
        }
    }
}
