using System.Collections;
using System.Linq;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using WSlice.Level;
using WSlice.Player;
using WSlice.UI;

namespace WSlice.Tests.PlayMode
{
    public class CourtyardPlayModeTests
    {
        private LevelRuntimeController level;
        private LevelSessionController session;
        private LevelFlowController flow;
        private CourtyardPuzzleController puzzle;
        private CourtyardWorldView world;
        private MovementController movement;
        private PlayerCharacter character;
        private PlayerInputRouter router;
        private CourtyardExperienceView experience;
        private CourtyardResonanceController resonance;

        [UnitySetUp]
        public IEnumerator LoadCourtyardScene()
        {
            var operation = SceneManager.LoadSceneAsync(CourtyardLayout.SceneName, LoadSceneMode.Single);
            while (!operation.isDone)
                yield return null;
            yield return null;
            yield return null;

            level = Object.FindFirstObjectByType<LevelRuntimeController>();
            session = Object.FindFirstObjectByType<LevelSessionController>();
            flow = Object.FindFirstObjectByType<LevelFlowController>();
            puzzle = Object.FindFirstObjectByType<CourtyardPuzzleController>();
            world = Object.FindFirstObjectByType<CourtyardWorldView>();
            movement = Object.FindFirstObjectByType<MovementController>();
            character = Object.FindFirstObjectByType<PlayerCharacter>();
            router = Object.FindFirstObjectByType<PlayerInputRouter>();
            experience = Object.FindFirstObjectByType<CourtyardExperienceView>();
            resonance = Object.FindFirstObjectByType<CourtyardResonanceController>();
            Assert.That(level, Is.Not.Null);
            Assert.That(session, Is.Not.Null);
            Assert.That(flow, Is.Not.Null);
            Assert.That(puzzle, Is.Not.Null);
            Assert.That(world, Is.Not.Null);
            Assert.That(movement, Is.Not.Null);
            Assert.That(character, Is.Not.Null);
            Assert.That(router, Is.Not.Null);
            Assert.That(experience, Is.Not.Null);
            Assert.That(resonance, Is.Not.Null, "The player experience must create the real resonance controller.");
            Assert.That(session.State, Is.EqualTo(LevelSessionState.Playing));
            Assert.That(character.CurrentNodeId, Is.EqualTo(CourtyardLayout.Entry));
            Physics.SyncTransforms();
        }

        [UnityTest]
        public IEnumerator CompleteRoute_PreservesMechanismAcrossSlices_AndEndsCatalog()
        {
            yield return EnterAndReachMechanism();
            Assert.That(puzzle.TryActivate(), Is.True);
            Assert.That(puzzle.IsActivated, Is.True);
            Assert.That(puzzle.TryActivate(), Is.True, "Repeating the same activation is harmless.");
            Assert.That(Object.FindFirstObjectByType<LevelGraphMutationController>().AppliedActions.Count, Is.EqualTo(1));

            yield return MoveTo(CourtyardLayout.Courtyard);
            Assert.That(puzzle.ReturnedToCourtyard, Is.True);
            yield return SetW(0.525f);
            Assert.That(puzzle.IsActivated, Is.True);
            Assert.That(world.BridgeOpen, Is.True);
            yield return MoveTo(CourtyardLayout.Goal);

            Assert.That(session.State, Is.EqualTo(LevelSessionState.Completed));
            Assert.That(puzzle.IsSatisfied, Is.True);
            Assert.That(flow.HasNextLevelInCatalog, Is.False);
            Assert.That(flow.TryLoadNextLevel(), Is.False);
            Assert.That(router.SetWDial(0f).Reason, Is.EqualTo(PlayerActionFailureReason.LevelNotPlaying));

            Assert.That(session.RequestRestart(), Is.True);
            yield return null;
            yield return null;
            AssertRestarted();
        }

        [UnityTest]
        public IEnumerator RestartAfterActivation_RestoresLockedGraphAndTeachingProgress()
        {
            yield return EnterAndReachMechanism();
            Assert.That(puzzle.TryActivate(), Is.True);
            yield return null;
            yield return null;
            Assert.That(experience.Model.Stage, Is.EqualTo(CourtyardExperienceStage.ReturnToCourtyard));
            experience.Model.RequestHint();
            Assert.That(experience.Model.HintLevel, Is.EqualTo(1));
            int previousVersion = puzzle.ResetVersion;

            Assert.That(session.RequestRestart(), Is.True);
            yield return null;
            yield return null;

            Assert.That(puzzle.ResetVersion, Is.EqualTo(previousVersion + 1));
            AssertRestarted();
            Assert.That(Object.FindFirstObjectByType<LevelGraphMutationController>().AppliedActions, Is.Empty);
        }

        [UnityTest]
        public IEnumerator UnactivatedBridge_CannotBeOpenedByChangingW()
        {
            var bridgeEdge = level.Graph.Edges.Single(edge => edge.FromNodeId == CourtyardLayout.BridgeStart
                && edge.ToNodeId == CourtyardLayout.ExitLanding);
            Assert.That(bridgeEdge.IsLocked, Is.True);
            for (int step = 0; step <= 1000; step++)
            {
                float w = step / 1000f;
                Assert.That(level.Graph.CanMove(CourtyardLayout.BridgeStart, CourtyardLayout.ExitLanding, w), Is.False, $"W={w}");
                Assert.That(level.Graph.CanMove(CourtyardLayout.ExitLanding, CourtyardLayout.BridgeStart, w), Is.False, $"W={w}");
            }

            yield return SetW(0.525f);
            Assert.That(world.BridgeOpen, Is.False);
            Assert.That(WorldObject("SliceBridge").GetComponent<Collider>().enabled, Is.False);
        }

        [UnityTest]
        public IEnumerator Activation_RequiresActualArrivalAtMechanism()
        {
            yield return SetW(0.8f);
            Assert.That(puzzle.CanActivate, Is.False);
            Assert.That(puzzle.TryActivate(), Is.False);

            // A stale or forged logical node must not permit a remote activation.
            character.CurrentNodeId = CourtyardLayout.Mechanism;
            Assert.That(puzzle.TryActivate(), Is.False);
            Assert.That(puzzle.IsActivated, Is.False);
            character.CurrentNodeId = CourtyardLayout.Entry;

            yield return EnterAndReachMechanism();
            Assert.That(puzzle.CanActivate, Is.True);
            Assert.That(puzzle.TryActivate(), Is.True);
        }

        [UnityTest]
        public IEnumerator ReachingGoalWithoutActivation_DoesNotComplete()
        {
            character.CurrentNodeId = CourtyardLayout.Goal;
            character.transform.position = level.Graph.GetNode(CourtyardLayout.Goal).WorldPosition;
            yield return null;
            yield return null;

            Assert.That(puzzle.IsActivated, Is.False);
            Assert.That(session.State, Is.EqualTo(LevelSessionState.Playing));
        }

        [UnityTest]
        public IEnumerator ChangingWSliceDuringEntranceCrossing_ReturnsToSafeEntry()
        {
            int recoveryVersion = movement.RecoveryVersion;
            yield return SetW(0.3f);
            Assert.That(movement.RequestMove(level.Graph.GetNode(CourtyardLayout.Courtyard).WorldPosition).Succeeded, Is.True);
            yield return WaitForSegment(CourtyardLayout.Entry, CourtyardLayout.Courtyard);

            yield return SetW(0f);
            yield return WaitForArrival(CourtyardLayout.Entry);

            Assert.That(session.State, Is.EqualTo(LevelSessionState.Playing));
            Assert.That(movement.RecoveryVersion, Is.EqualTo(recoveryVersion + 1));
            Assert.That(puzzle.HasEnteredCourtyard, Is.False);
            AssertWorldMatchesGraph();
        }

        [UnityTest]
        public IEnumerator ChangingWSliceOnStair_ReturnsToStairFoot()
        {
            yield return SetW(0.3f);
            yield return MoveTo(CourtyardLayout.Courtyard);
            yield return SetW(0.8f);
            yield return MoveTo(CourtyardLayout.StairFoot);
            Assert.That(movement.RequestMove(level.Graph.GetNode(CourtyardLayout.Mechanism).WorldPosition).Succeeded, Is.True);
            yield return WaitForSegment(CourtyardLayout.StairFoot, CourtyardLayout.UpperLanding);

            yield return SetW(0.3f);
            yield return WaitForArrival(CourtyardLayout.StairFoot);

            Assert.That(session.State, Is.EqualTo(LevelSessionState.Playing));
            Assert.That(puzzle.IsActivated, Is.False);
            AssertWorldMatchesGraph();
        }

        [UnityTest]
        public IEnumerator VisibleSurfacesAndColliders_FollowGraphBeforeAndAfterActivation()
        {
            foreach (float w in new[] { 0f, 0.2f, 0.3f, 0.4f, 0.45f, 0.525f, 0.6f, 0.7f, 0.8f, 0.9f, 1f })
            {
                yield return SetW(w);
                AssertWorldMatchesGraph();
            }

            yield return EnterAndReachMechanism();
            Assert.That(puzzle.TryActivate(), Is.True);
            foreach (float w in new[] { 0f, 0.3f, 0.45f, 0.525f, 0.6f, 0.8f, 1f })
            {
                yield return SetW(w);
                AssertWorldMatchesGraph();
            }
        }

        [UnityTest]
        public IEnumerator PermanentLandings_RemainSafeAcrossAllSlices()
        {
            foreach (string nodeId in new[]
            {
                CourtyardLayout.Entry, CourtyardLayout.Courtyard, CourtyardLayout.StairFoot,
                CourtyardLayout.UpperLanding, CourtyardLayout.Mechanism, CourtyardLayout.BridgeStart,
                CourtyardLayout.ExitLanding, CourtyardLayout.Goal
            })
            {
                // Isolate standing safety from reachability, covered by the full-route test.
                movement.ResetToNode(nodeId);
                var expectedPosition = level.Graph.GetNode(nodeId).WorldPosition;
                foreach (float w in new[] { 0f, 0.3f, 0.525f, 0.8f, 1f })
                {
                    yield return SetW(w);
                    Assert.That(character.CurrentNodeId, Is.EqualTo(nodeId));
                    Assert.That(Vector3.Distance(character.transform.position, expectedPosition), Is.LessThan(0.001f));
                    Assert.That(movement.IsMoving, Is.False);
                    Assert.That(session.State, Is.EqualTo(LevelSessionState.Playing));
                    var supports = Physics.RaycastAll(expectedPosition + Vector3.up * 0.35f, Vector3.down, 0.5f);
                    Assert.That(supports.Any(hit => hit.collider.transform.IsChildOf(world.transform)), Is.True,
                        $"No visible-world support at {nodeId}, W={w}.");
                }
            }
        }

        [UnityTest]
        public IEnumerator CameraRaycast_ClosedDoorBlocksTap_VisibleMarkerMovesPlayer()
        {
            var door = WorldObject("SliceDoor").GetComponent<Collider>();
            var blockedTap = router.OnTap(VisibleScreenPoint(door));
            Assert.That(blockedTap.Succeeded, Is.False);
            Assert.That(blockedTap.Reason, Is.EqualTo(PlayerActionFailureReason.NoGroundHit));
            yield return null;
            yield return null;
            Assert.That(experience.VisibleHint, Does.Contain("请点击地面"));
            Assert.That(character.CurrentNodeId, Is.EqualTo(CourtyardLayout.Entry));
            Assert.That(movement.IsMoving, Is.False);

            yield return SetW(0.3f);
            var marker = WorldObject("Landing_" + CourtyardLayout.Courtyard).GetComponent<Collider>();
            var moveTap = router.OnTap(VisibleScreenPoint(marker));
            Assert.That(moveTap.Succeeded, Is.True);
            yield return WaitForArrival(CourtyardLayout.Courtyard);

            yield return SetW(0.8f);
            var mechanism = WorldObject("CourtyardMechanism").GetComponent<Collider>();
            var remoteTap = router.OnTap(VisibleScreenPoint(mechanism));
            Assert.That(remoteTap.Succeeded, Is.False);
            Assert.That(remoteTap.Reason, Is.EqualTo(PlayerActionFailureReason.NotInteractiveAtCurrentW));
            Assert.That(puzzle.IsActivated, Is.False);
            Assert.That(character.CurrentNodeId, Is.EqualTo(CourtyardLayout.Courtyard));

            var mechanismMarker = WorldObject("Landing_" + CourtyardLayout.Mechanism).GetComponent<Collider>();
            Assert.That(router.OnTap(VisibleScreenPoint(mechanismMarker)).Succeeded, Is.True);
            yield return WaitForArrival(CourtyardLayout.Mechanism);
            Assert.That(puzzle.CanActivate, Is.True);
        }

        [UnityTest]
        public IEnumerator RepeatedTarget_DoesNotRestartInFlightMovement()
        {
            yield return BeginEntranceCrossing();
            for (int i = 0; i < 8; i++)
            {
                Vector3 before = character.transform.position;
                Assert.That(movement.RequestMove(level.Graph.GetNode(CourtyardLayout.Courtyard).WorldPosition).Succeeded, Is.True);
                Assert.That(character.transform.position, Is.EqualTo(before));
                yield return null;
                Assert.That(character.transform.position.z, Is.GreaterThanOrEqualTo(before.z));
            }
            yield return WaitForArrival(CourtyardLayout.Courtyard);
        }

        [UnityTest]
        public IEnumerator ChangedTarget_CompletesCurrentSegmentBeforeTurningBack()
        {
            yield return BeginEntranceCrossing();
            Vector3 before = character.transform.position;
            Assert.That(movement.RequestMove(level.Graph.GetNode(CourtyardLayout.Entry).WorldPosition).Succeeded, Is.True);
            Assert.That(character.transform.position, Is.EqualTo(before));
            yield return WaitForSegment(CourtyardLayout.Courtyard, CourtyardLayout.Entry);
            yield return WaitForArrival(CourtyardLayout.Entry);
        }

        [UnityTest]
        public IEnumerator PendingTarget_LatestAcceptedWins_AndRejectedClickPreservesIt()
        {
            yield return BeginEntranceCrossing();
            Assert.That(movement.RequestMove(level.Graph.GetNode(CourtyardLayout.StairFoot).WorldPosition).Succeeded, Is.True);
            var target = level.Graph.GetNode(CourtyardLayout.BridgeStart).WorldPosition;
            Assert.That(movement.RequestMove(target).Succeeded, Is.True);
            Vector3 before = character.transform.position;
            Assert.That(movement.RequestMove(level.Graph.GetNode(CourtyardLayout.Goal).WorldPosition).Reason,
                Is.EqualTo(PlayerActionFailureReason.NoPathAtCurrentW));
            Assert.That(character.transform.position, Is.EqualTo(before));
            Assert.That(movement.LastTargetNodeId, Is.EqualTo(CourtyardLayout.BridgeStart));
            Assert.That(movement.LastTargetWorldPosition, Is.EqualTo(target));
            yield return WaitForArrival(CourtyardLayout.BridgeStart);
        }

        [UnityTest]
        public IEnumerator PendingTarget_RouteClosingAhead_StopsAtSafeLanding()
        {
            movement.ResetToNode(CourtyardLayout.Courtyard);
            yield return SetW(0.8f);
            Assert.That(movement.RequestMove(level.Graph.GetNode(CourtyardLayout.StairFoot).WorldPosition).Succeeded, Is.True);
            yield return WaitForSegment(CourtyardLayout.Courtyard, CourtyardLayout.StairFoot);
            Assert.That(movement.RequestMove(level.Graph.GetNode(CourtyardLayout.Mechanism).WorldPosition).Succeeded, Is.True);
            yield return SetW(0.3f);
            yield return WaitForArrival(CourtyardLayout.StairFoot);
            Assert.That(movement.RecoveryVersion, Is.Zero, "The current permanent segment stays open.");
        }

        [UnityTest]
        public IEnumerator SmoothedDialBreak_WithPendingTarget_RecoversToEntry()
        {
            yield return BeginEntranceCrossing();
            Assert.That(movement.RequestMove(level.Graph.GetNode(CourtyardLayout.StairFoot).WorldPosition).Succeeded, Is.True);
            int recovery = movement.RecoveryVersion;
            float before = level.WState.CurrentW;
            Assert.That(router.SetWDial(0f).Succeeded, Is.True);
            Assert.That(level.WState.CurrentW, Is.EqualTo(before), "The dial sets a target; it does not force W.");
            bool observedIntermediate = false;
            float elapsed = 0f;
            while (movement.IsMoving && elapsed < 5f)
            {
                yield return null;
                elapsed += Time.unscaledDeltaTime;
                observedIntermediate |= level.WState.CurrentW > 0f && level.WState.CurrentW < before;
            }
            Assert.That(observedIntermediate, Is.True);
            yield return WaitForArrival(CourtyardLayout.Entry);
            Assert.That(movement.RecoveryVersion, Is.EqualTo(recovery + 1));
            Assert.That(movement.LastTargetNodeId, Is.EqualTo(CourtyardLayout.StairFoot));
            Assert.That(session.State, Is.EqualTo(LevelSessionState.Playing));
        }

        [UnityTest]
        public IEnumerator Restart_ClearsPendingAndAcceptedTargets()
        {
            yield return BeginEntranceCrossing();
            Assert.That(movement.RequestMove(level.Graph.GetNode(CourtyardLayout.StairFoot).WorldPosition).Succeeded, Is.True);
            Assert.That(session.RequestRestart(), Is.True);
            yield return null;
            yield return null;
            AssertRestarted();
            Assert.That(movement.HasLastTarget, Is.False);
            Assert.That(movement.HasLastTargetNode, Is.False);
            Assert.That(movement.HasActiveSegment, Is.False);
            yield return SetW(0.3f);
            yield return MoveTo(CourtyardLayout.Courtyard);
            Assert.That(movement.IsMoving, Is.False);
        }

        [UnityTest]
        public IEnumerator Resonance_CenterArrivalAndRepeatedRealTaps_EarnOnlyOneReward()
        {
            yield return SetW(0.3f);
            var marker = WorldObject("Landing_" + CourtyardLayout.Courtyard).GetComponent<Collider>();
            Assert.That(router.OnTap(VisibleScreenPoint(marker)).Succeeded, Is.True);
            yield return WaitForSegment(CourtyardLayout.Entry, CourtyardLayout.Courtyard);
            Assert.That(resonance.Model.Carried, Is.Zero, "Accepting movement is not a completed crossing.");
            for (int i = 0; i < 8; i++)
            {
                Assert.That(router.OnTap(VisibleScreenPoint(marker)).Succeeded, Is.True);
                Assert.That(movement.RequestMove(level.Graph.GetNode(CourtyardLayout.Courtyard).WorldPosition).Succeeded, Is.True);
                yield return null;
            }
            yield return WaitForArrival(CourtyardLayout.Courtyard);
            Assert.That(resonance.Model.Carried, Is.EqualTo(1));
            Assert.That(resonance.Model.Banked, Is.Zero);
            Assert.That(resonance.Model.IsCrossing, Is.False);

            Assert.That(router.OnTap(VisibleScreenPoint(marker)).Succeeded, Is.True);
            yield return null;
            Assert.That(resonance.Model.Carried, Is.EqualTo(1));
            yield return MoveTo(CourtyardLayout.Entry);
            Assert.That(resonance.Model.Carried, Is.EqualTo(2), "The reverse crossing has its own reward.");
            yield return MoveTo(CourtyardLayout.Courtyard);
            Assert.That(resonance.Model.Carried, Is.EqualTo(2), "Revisiting an already rewarded direction cannot farm echoes.");
        }

        [UnityTest]
        public IEnumerator Resonance_DangerChargeThenActualCenterW_EarnsThreeAtArrival()
        {
            int recovery = movement.RecoveryVersion;
            yield return SetW(0.21f);
            Assert.That(movement.RequestMove(level.Graph.GetNode(CourtyardLayout.Courtyard).WorldPosition).Succeeded, Is.True);
            yield return WaitForSegment(CourtyardLayout.Entry, CourtyardLayout.Courtyard);
            yield return WaitForResonanceCharge();
            Assert.That(resonance.Model.Carried, Is.Zero);
            Assert.That(resonance.Model.Stability, Is.LessThan(1f).And.GreaterThan(0f));

            yield return SetW(0.3f);
            Assert.That(level.WState.CurrentW, Is.EqualTo(0.3f));
            yield return WaitForArrival(CourtyardLayout.Courtyard);
            Assert.That(resonance.Model.Carried, Is.EqualTo(3));
            Assert.That(movement.RecoveryVersion, Is.EqualTo(recovery));
            Assert.That(session.State, Is.EqualTo(LevelSessionState.Playing));
        }

        [UnityTest]
        public IEnumerator Resonance_UncorrectedDangerCollapsesOnce_ThenCanRetryAndRestart()
        {
            yield return SetW(0.21f);
            int recovery = movement.RecoveryVersion;
            float collapseAt = -1f;
            movement.SegmentBroken += (_, _) => collapseAt = Time.time;
            float beganAt = Time.time;
            Assert.That(movement.RequestMove(level.Graph.GetNode(CourtyardLayout.Courtyard).WorldPosition).Succeeded, Is.True);
            yield return WaitForArrival(CourtyardLayout.Entry);
            Assert.That(collapseAt, Is.GreaterThan(beganAt));
            // Integration timing allows one long frame either side; the pure model
            // tests assert the exact 0.85 s threshold at several frame rates.
            Assert.That(collapseAt - beganAt, Is.InRange(0.5f, 1.25f));
            Assert.That(movement.RecoveryVersion, Is.EqualTo(recovery + 1));
            Assert.That(session.State, Is.EqualTo(LevelSessionState.Playing));
            Assert.That(resonance.Model.Carried, Is.Zero);
            Assert.That(resonance.Model.IsCrossing, Is.False);
            Assert.That(resonance.Model.HasReward(CourtyardLayout.Entry, CourtyardLayout.Courtyard), Is.False);
            yield return null;
            yield return null;
            Assert.That(movement.RecoveryVersion, Is.EqualTo(recovery + 1), "Recovery must not restart itself on the same risky edge.");

            yield return SetW(0.3f);
            yield return MoveTo(CourtyardLayout.Courtyard);
            Assert.That(resonance.Model.Carried, Is.EqualTo(1));
            // R invokes this same public session restart path.
            Assert.That(session.RequestRestart(), Is.True);
            yield return null;
            yield return null;
            AssertRestarted();
            Assert.That(resonance.Model.Carried, Is.Zero);
            Assert.That(resonance.Model.Banked, Is.Zero);
            Assert.That(resonance.Model.IsCrossing, Is.False);
            Assert.That(resonance.Model.HasReward(CourtyardLayout.Entry, CourtyardLayout.Courtyard), Is.False);
        }

        [UnityTest]
        public IEnumerator Resonance_StairCollapseLosesCarriedEntranceReward_AndMakesItEarnableAgain()
        {
            yield return SetW(0.3f);
            yield return MoveTo(CourtyardLayout.Courtyard);
            Assert.That(resonance.Model.Carried, Is.EqualTo(1));
            yield return MoveTo(CourtyardLayout.StairFoot);
            yield return SetW(0.71f);
            int recovery = movement.RecoveryVersion;
            Assert.That(movement.RequestMove(level.Graph.GetNode(CourtyardLayout.Mechanism).WorldPosition).Succeeded, Is.True);
            yield return WaitForSegment(CourtyardLayout.StairFoot, CourtyardLayout.UpperLanding);
            yield return WaitForArrival(CourtyardLayout.StairFoot);
            Assert.That(movement.RecoveryVersion, Is.EqualTo(recovery + 1));
            Assert.That(session.State, Is.EqualTo(LevelSessionState.Playing));
            Assert.That(resonance.Model.Carried, Is.Zero);
            Assert.That(resonance.Model.HasReward(CourtyardLayout.Entry, CourtyardLayout.Courtyard), Is.False);
            Assert.That(puzzle.IsActivated, Is.False);

            yield return SetW(0.3f);
            yield return MoveTo(CourtyardLayout.Entry);
            Assert.That(resonance.Model.Carried, Is.EqualTo(1));
            yield return MoveTo(CourtyardLayout.Courtyard);
            Assert.That(resonance.Model.Carried, Is.EqualTo(2), "The previously lost forward reward must be available again.");
        }

        [UnityTest]
        public IEnumerator Resonance_ActivatedMechanismBanksRewards_ReturnCollapsePreservesBankAndUnlock()
        {
            yield return EnterAndReachMechanism();
            Assert.That(resonance.Model.Carried, Is.EqualTo(2));
            Assert.That(puzzle.TryActivate(), Is.True);
            yield return null;
            yield return null;
            Assert.That(resonance.Model.Carried, Is.Zero);
            Assert.That(resonance.Model.Banked, Is.EqualTo(2));

            yield return SetW(0.71f);
            int recovery = movement.RecoveryVersion;
            Assert.That(movement.RequestMove(level.Graph.GetNode(CourtyardLayout.Courtyard).WorldPosition).Succeeded, Is.True);
            yield return WaitForSegment(CourtyardLayout.UpperLanding, CourtyardLayout.StairFoot);
            yield return WaitForArrival(CourtyardLayout.UpperLanding);
            Assert.That(movement.RecoveryVersion, Is.EqualTo(recovery + 1));
            Assert.That(resonance.Model.Banked, Is.EqualTo(2));
            Assert.That(resonance.Model.Carried, Is.Zero);
            Assert.That(resonance.Model.HasReward(CourtyardLayout.Entry, CourtyardLayout.Courtyard), Is.True);
            Assert.That(resonance.Model.HasReward(CourtyardLayout.StairFoot, CourtyardLayout.UpperLanding), Is.True);
            Assert.That(puzzle.IsActivated, Is.True);
            Assert.That(level.Graph.CanMove(CourtyardLayout.BridgeStart, CourtyardLayout.ExitLanding, 0.525f), Is.True);
            Assert.That(session.State, Is.EqualTo(LevelSessionState.Playing));

            yield return SetW(0.8f);
            yield return MoveTo(CourtyardLayout.Courtyard);
            Assert.That(resonance.Model.Carried, Is.EqualTo(1));
            yield return SetW(0.525f);
            yield return MoveTo(CourtyardLayout.Goal);
            Assert.That(session.State, Is.EqualTo(LevelSessionState.Completed));
            Assert.That(resonance.Model.Carried, Is.Zero);
            Assert.That(resonance.Model.Banked, Is.EqualTo(4), "Completion banks the reverse stair and bridge rewards once.");

            Assert.That(session.RequestRestart(), Is.True);
            yield return null;
            yield return null;
            AssertRestarted();
            Assert.That(resonance.Model.Banked, Is.Zero);
            Assert.That(resonance.Model.Carried, Is.Zero);
        }

        [UnityTest]
        public IEnumerator Resonance_WorldEffectsRemainColliderFree_WhileRealRaycastsStillMovePlayer()
        {
            yield return SetW(0.3f);
            yield return MoveTo(CourtyardLayout.Courtyard);
            var feedback = Object.FindFirstObjectByType<CourtyardResonanceView>();
            Assert.That(feedback, Is.Not.Null);
            var effectsRoot = GameObject.Find("CourtyardResonanceFeedback");
            Assert.That(effectsRoot, Is.Not.Null);
            Assert.That(effectsRoot.GetComponentsInChildren<Renderer>(true), Is.Not.Empty,
                "The test must inspect real, built feedback objects.");
            Assert.That(effectsRoot.GetComponentsInChildren<Collider>(true), Is.Empty);
            Assert.That(effectsRoot.GetComponentsInChildren<Transform>(true).All(child => child.gameObject.layer == 2), Is.True,
                "World feedback stays on Ignore Raycast, including its inactive pool.");

            yield return SetW(0.8f);
            var target = WorldObject("Landing_" + CourtyardLayout.Mechanism).GetComponent<Collider>();
            Assert.That(router.OnTap(VisibleScreenPoint(target)).Succeeded, Is.True);
            yield return WaitForArrival(CourtyardLayout.Mechanism);
            var mechanism = WorldObject("CourtyardMechanism").GetComponent<Collider>();
            Assert.That(router.OnTap(VisibleScreenPoint(mechanism)).Succeeded, Is.True);
            yield return null;
            yield return null;
            Assert.That(puzzle.IsActivated, Is.True);
            Assert.That(resonance.Model.Banked, Is.EqualTo(2));
            Assert.That(effectsRoot.GetComponentsInChildren<Collider>(true), Is.Empty);
        }

        [UnityTest]
        public IEnumerator Chain_MechanismPropagatesOnce_AndLightsFollowTheRealBridge()
        {
            yield return EnterAndReachMechanism();
            var chain = Object.FindFirstObjectByType<CourtyardChainReactionView>();
            var feedback = Object.FindFirstObjectByType<CourtyardResonanceView>();
            Assert.That(chain, Is.Not.Null);
            Assert.That(chain.LitBeaconCount, Is.Zero);
            Assert.That(puzzle.TryActivate(), Is.True);
            yield return null;
            yield return null;
            Assert.That(feedback.MechanismActivationVersion, Is.EqualTo(1));
            Assert.That(chain.ActiveWaveCount, Is.GreaterThan(0));
            Assert.That(chain.LitBeaconCount, Is.LessThan(chain.BeaconCount), "The scene should wake in sequence.");
            Assert.That(puzzle.TryActivate(), Is.True);
            yield return new WaitForSeconds(4f);
            Assert.That(feedback.MechanismActivationVersion, Is.EqualTo(1));
            Assert.That(chain.BeaconCount, Is.EqualTo(7));
            Assert.That(chain.LitBeaconCount, Is.EqualTo(7));
            Assert.That(chain.ActiveWaveCount, Is.Zero);
            Assert.That(chain.VisibleTier, Is.Zero, "Activating the mechanism does not award a risk tier.");

            var root = GameObject.Find("CourtyardChainReactions");
            Assert.That(root.GetComponentsInChildren<Collider>(true), Is.Empty);
            Assert.That(root.GetComponentsInChildren<Transform>(true).All(child => child.gameObject.layer == 2), Is.True);
            var lamp = root.transform.Find("BridgeChainLight_0");
            var bridge = WorldObject("SliceBridge").transform;
            float loweredLampY = lamp.position.y;
            float offset = lamp.position.y - bridge.position.y;
            yield return SetW(0.525f);
            yield return new WaitForSeconds(1f);
            Assert.That(world.BridgeOpen, Is.True);
            Assert.That(lamp.position.y, Is.GreaterThan(loweredLampY + 0.5f));
            Assert.That(lamp.position.y - bridge.position.y, Is.EqualTo(offset).Within(0.03f));

            Assert.That(session.RequestRestart(), Is.True);
            yield return new WaitForSeconds(3f);
            Assert.That(chain.LitBeaconCount, Is.Zero);
            Assert.That(chain.ActiveWaveCount, Is.Zero);
            Assert.That(chain.VisibleTier, Is.Zero);
            Assert.That(feedback.PendingNoteCount, Is.Zero);
        }

        [UnityTest]
        public IEnumerator Chain_ThreeNewRisksEscalateFeedback_DuplicateCrossingDoesNot()
        {
            var chain = Object.FindFirstObjectByType<CourtyardChainReactionView>();
            var feedback = Object.FindFirstObjectByType<CourtyardResonanceView>();
            yield return RiskMoveTo(CourtyardLayout.Courtyard, 0.21f, 0.3f);
            Assert.That(resonance.Model.RiskChain, Is.EqualTo(1));
            Assert.That(feedback.RiskSuccessVersion, Is.EqualTo(1));
            yield return RiskMoveTo(CourtyardLayout.Entry, 0.21f, 0.3f);
            Assert.That(resonance.Model.RiskChain, Is.EqualTo(2));
            yield return RiskMoveTo(CourtyardLayout.Courtyard, 0.21f, 0.3f);
            Assert.That(resonance.Model.RiskChain, Is.EqualTo(2));
            Assert.That(feedback.RiskSuccessVersion, Is.EqualTo(2), "A claimed direction must not replay a risk victory.");
            yield return RiskMoveTo(CourtyardLayout.Mechanism, 0.71f, 0.8f);
            yield return new WaitForSeconds(4f);
            Assert.That(resonance.Model.Carried, Is.EqualTo(9));
            Assert.That(resonance.Model.RiskChain, Is.EqualTo(3));
            Assert.That(feedback.RiskSuccessVersion, Is.EqualTo(3));
            Assert.That(feedback.LastRiskChain, Is.EqualTo(3));
            Assert.That(feedback.RiskStageVersion, Is.EqualTo(9));
            Assert.That(feedback.PendingNoteCount, Is.Zero);
            Assert.That(chain.VisibleTier, Is.EqualTo(3));
            Assert.That(chain.SecuredTier, Is.Zero);
            Assert.That(chain.LitBeaconCount, Is.EqualTo(7));
            Assert.That(puzzle.IsActivated, Is.False, "Reward waves cannot unlock the real mechanism.");
        }

        [UnityTest]
        public IEnumerator Chain_FailureRetractsUnbankedTier_CompletionKeepsOnlySecuredTier()
        {
            var chain = Object.FindFirstObjectByType<CourtyardChainReactionView>();
            yield return RiskMoveTo(CourtyardLayout.Courtyard, 0.21f, 0.3f);
            yield return SetW(0.8f);
            yield return MoveTo(CourtyardLayout.Mechanism);
            Assert.That(puzzle.TryActivate(), Is.True);
            yield return null;
            yield return null;
            Assert.That(resonance.Model.Banked, Is.EqualTo(4));
            Assert.That(chain.SecuredTier, Is.EqualTo(1));
            yield return RiskMoveTo(CourtyardLayout.Courtyard, 0.71f, 0.8f);
            Assert.That(chain.VisibleTier, Is.EqualTo(2));
            yield return SetW(0.21f);
            Assert.That(movement.RequestMove(level.Graph.GetNode(CourtyardLayout.Entry).WorldPosition).Succeeded, Is.True);
            yield return WaitForArrival(CourtyardLayout.Courtyard);
            yield return new WaitForSeconds(4f);
            Assert.That(resonance.Model.Carried, Is.Zero);
            Assert.That(resonance.Model.RiskChain, Is.Zero);
            Assert.That(resonance.Model.BestRiskChain, Is.EqualTo(2));
            Assert.That(resonance.Model.Banked, Is.EqualTo(4));
            Assert.That(chain.VisibleTier, Is.EqualTo(1));
            Assert.That(chain.SecuredTier, Is.EqualTo(1));
            Assert.That(chain.ActiveWaveCount, Is.Zero);
            yield return SetW(0.525f);
            yield return MoveTo(CourtyardLayout.Goal);
            yield return new WaitForSeconds(4f);
            Assert.That(session.State, Is.EqualTo(LevelSessionState.Completed));
            Assert.That(chain.IsCompleted, Is.True);
            Assert.That(chain.SecuredTier, Is.EqualTo(1), "The finale must not restore a lost personal best.");
            Assert.That(chain.VisibleTier, Is.EqualTo(1));
        }

        [UnityTest]
        public IEnumerator Chain_MutingPreservesVisualStages_RestartCancelsDelayedVictory()
        {
            var chain = Object.FindFirstObjectByType<CourtyardChainReactionView>();
            var feedback = Object.FindFirstObjectByType<CourtyardResonanceView>();
            feedback.SetMuted(true);
            int notes = feedback.AudioNotesStarted;
            yield return RiskMoveTo(CourtyardLayout.Courtyard, 0.21f, 0.3f);
            yield return new WaitForSeconds(1f);
            Assert.That(feedback.RiskStageVersion, Is.EqualTo(3));
            Assert.That(feedback.AudioNotesStarted, Is.EqualTo(notes));
            Assert.That(feedback.PendingNoteCount, Is.Zero);
            feedback.SetMuted(false);
            yield return RiskMoveTo(CourtyardLayout.Entry, 0.21f, 0.3f);
            Assert.That(feedback.AudioNotesStarted, Is.GreaterThan(notes));
            Assert.That(feedback.PendingNoteCount, Is.GreaterThan(0));
            Assert.That(chain.ActiveWaveCount, Is.GreaterThan(0));
            Assert.That(session.RequestRestart(), Is.True);
            int stagesAtRestart = feedback.RiskStageVersion;
            yield return new WaitForSeconds(4f);
            Assert.That(feedback.RiskStageVersion, Is.EqualTo(stagesAtRestart));
            Assert.That(feedback.PendingNoteCount, Is.Zero);
            Assert.That(feedback.LastRiskChain, Is.Zero);
            Assert.That(chain.ActiveWaveCount, Is.Zero);
            Assert.That(chain.LitBeaconCount, Is.Zero);
            Assert.That(chain.SecuredTier, Is.Zero);
            Assert.That(chain.VisibleTier, Is.Zero);
            AssertRestarted();
        }

        private IEnumerator RiskMoveTo(string target, float dangerW, float centerW)
        {
            yield return SetW(dangerW);
            Assert.That(movement.RequestMove(level.Graph.GetNode(target).WorldPosition).Succeeded, Is.True);
            yield return WaitForResonanceCharge();
            Assert.That(router.SetWDial(centerW).Succeeded, Is.True);
            yield return WaitForArrival(target);
            Assert.That(level.WState.CurrentW, Is.EqualTo(centerW).Within(0.005f),
                "The actual smoothed dial must return to safety before arrival.");
        }

        private IEnumerator WaitForResonanceCharge()
        {
            float timeoutAt = Time.realtimeSinceStartup + 8f;
            while (movement.IsMoving && !resonance.Model.IsCharged && Time.realtimeSinceStartup < timeoutAt)
                yield return null;
            Assert.That(movement.IsMoving, Is.True, "Charging should finish before arrival or collapse.");
            Assert.That(resonance.Model.IsCrossing, Is.True);
            Assert.That(resonance.Model.IsCharged, Is.True);
        }

        private IEnumerator BeginEntranceCrossing()
        {
            yield return SetW(0.3f);
            Assert.That(movement.RequestMove(level.Graph.GetNode(CourtyardLayout.Courtyard).WorldPosition).Succeeded, Is.True);
            yield return WaitForSegment(CourtyardLayout.Entry, CourtyardLayout.Courtyard);
            // Exercise clicks away from either landing, where a rewind is visible.
            float elapsed = 0f;
            var origin = level.Graph.GetNode(CourtyardLayout.Entry).WorldPosition;
            while (Vector3.Distance(character.transform.position, origin) < 0.5f && elapsed < 3f)
            {
                elapsed += Time.unscaledDeltaTime;
                yield return null;
            }
            Assert.That(movement.IsMoving, Is.True);
            Assert.That(Vector3.Distance(character.transform.position, origin), Is.GreaterThanOrEqualTo(0.5f));
        }

        private IEnumerator EnterAndReachMechanism()
        {
            yield return SetW(0.3f);
            yield return MoveTo(CourtyardLayout.Courtyard);
            yield return SetW(0.8f);
            yield return MoveTo(CourtyardLayout.Mechanism);
        }

        private IEnumerator SetW(float w)
        {
            level.WState.Force(w);
            yield return null;
            yield return null;
            Physics.SyncTransforms();
        }

        private IEnumerator MoveTo(string nodeId)
        {
            var result = movement.RequestMove(level.Graph.GetNode(nodeId).WorldPosition);
            Assert.That(result.Succeeded, Is.True, $"Move to {nodeId}: {result.Reason}");
            yield return WaitForArrival(nodeId);
        }

        private IEnumerator WaitForArrival(string expectedNode, float timeoutSeconds = 12f)
        {
            // Always advance a frame: StartCoroutine can finish synchronously, and the
            // session/controller still need Update to observe an arrival.
            yield return null;
            float elapsed = 0f;
            while (movement.IsMoving && elapsed < timeoutSeconds)
            {
                elapsed += Time.unscaledDeltaTime;
                yield return null;
            }
            yield return null;
            yield return null;
            Assert.That(movement.IsMoving, Is.False, $"Movement timed out before {expectedNode}.");
            Assert.That(character.CurrentNodeId, Is.EqualTo(expectedNode));
            Assert.That(Vector3.Distance(character.transform.position, level.Graph.GetNode(expectedNode).WorldPosition), Is.LessThan(0.001f));
        }

        private IEnumerator WaitForSegment(string from, string to)
        {
            float elapsed = 0f;
            while (!(movement.HasActiveSegment && movement.ActiveSegmentFromId == from && movement.ActiveSegmentToId == to)
                && elapsed < 5f)
            {
                elapsed += Time.unscaledDeltaTime;
                yield return null;
            }
            Assert.That(movement.IsMoving, Is.True);
            Assert.That(movement.ActiveSegmentFromId, Is.EqualTo(from));
            Assert.That(movement.ActiveSegmentToId, Is.EqualTo(to));
            yield return null;
            Assert.That(movement.IsMoving, Is.True, "The crossing must still be in flight when W changes.");
        }

        private void AssertRestarted()
        {
            Assert.That(session.State, Is.EqualTo(LevelSessionState.Playing));
            Assert.That(character.CurrentNodeId, Is.EqualTo(CourtyardLayout.Entry));
            Assert.That(level.WState.CurrentW, Is.EqualTo(level.Definition.InitialW));
            Assert.That(level.WState.TargetW, Is.EqualTo(level.Definition.InitialW));
            Assert.That(puzzle.IsActivated, Is.False);
            Assert.That(puzzle.HasEnteredCourtyard, Is.False);
            Assert.That(puzzle.ReturnedToCourtyard, Is.False);
            Assert.That(level.Graph.CanMove(CourtyardLayout.BridgeStart, CourtyardLayout.ExitLanding, 0.525f), Is.False);
            Assert.That(experience.Model.Stage, Is.EqualTo(CourtyardExperienceStage.EnterCourtyard));
            Assert.That(experience.Model.HintLevel, Is.Zero);
            AssertWorldMatchesGraph();
        }

        private void AssertWorldMatchesGraph()
        {
            float w = level.WState.CurrentW;
            Assert.That(world.EntranceOpen, Is.EqualTo(level.Graph.CanMove(CourtyardLayout.Entry, CourtyardLayout.Courtyard, w)));
            Assert.That(world.StairOpen, Is.EqualTo(level.Graph.CanMove(CourtyardLayout.StairFoot, CourtyardLayout.UpperLanding, w)));
            Assert.That(world.BridgeOpen, Is.EqualTo(level.Graph.CanMove(CourtyardLayout.BridgeStart, CourtyardLayout.ExitLanding, w)));
            var door = WorldObject("SliceDoor");
            var stair = WorldObject("SliceStair");
            var bridge = WorldObject("SliceBridge");
            Assert.That(HasVisibleRenderer(door), Is.EqualTo(!world.EntranceOpen));
            Assert.That(HasActiveCollider(door), Is.EqualTo(!world.EntranceOpen));
            Assert.That(HasVisibleRenderer(stair), Is.EqualTo(world.StairOpen));
            Assert.That(HasActiveCollider(stair), Is.EqualTo(world.StairOpen));
            Assert.That(HasVisibleRenderer(bridge), Is.True);
            Assert.That(HasActiveCollider(bridge), Is.EqualTo(world.BridgeOpen));
            Assert.That(bridge.transform.localPosition.y, Is.EqualTo(world.BridgeOpen ? -0.15f : -1.8f).Within(0.001f));
        }

        private GameObject WorldObject(string name)
        {
            var found = world.GetComponentsInChildren<Transform>(true).SingleOrDefault(child => child.name == name);
            Assert.That(found, Is.Not.Null, name);
            return found.gameObject;
        }

        private static bool HasVisibleRenderer(GameObject target) => target.activeInHierarchy && target.GetComponent<Renderer>().enabled;
        private static bool HasActiveCollider(GameObject target) => target.activeInHierarchy && target.GetComponent<Collider>().enabled;

        private static Vector2 VisibleScreenPoint(Collider target)
        {
            var camera = Camera.main;
            Assert.That(camera, Is.Not.Null);
            Physics.SyncTransforms();
            // Use the authored camera, accepting any exposed part of the target.
            // This tests real occlusion without assuming its centre is unobstructed.
            foreach (float x in new[] { 0f, -0.7f, 0.7f })
            foreach (float y in new[] { 0f, -0.7f, 0.7f })
            foreach (float z in new[] { 0f, -0.7f, 0.7f })
            {
                Vector3 point = target.bounds.center + Vector3.Scale(target.bounds.extents, new Vector3(x, y, z));
                Vector3 viewport = camera.WorldToViewportPoint(point);
                if (viewport.z <= 0f || viewport.x < 0f || viewport.x > 1f || viewport.y < 0f || viewport.y > 1f)
                    continue;
                Vector3 screen = camera.WorldToScreenPoint(point);
                if (Physics.Raycast(camera.ScreenPointToRay(screen), out var hit, 100f, LayerMask.GetMask("Default"))
                    && hit.collider == target)
                    return new Vector2(screen.x, screen.y);
            }

            Assert.Fail($"{target.name} has no exposed clickable point from the scene camera.");
            return Vector2.zero;
        }
    }
}
