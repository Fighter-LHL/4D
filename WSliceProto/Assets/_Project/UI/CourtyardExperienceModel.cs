using WSlice.Player;

namespace WSlice.UI
{
    public enum CourtyardExperienceStage
    {
        EnterCourtyard,
        FindMechanism,
        ActivateMechanism,
        ReturnToCourtyard,
        ReachExit,
        Complete
    }

    /// <summary>Action-driven instruction and opt-in hints for the courtyard slice.</summary>
    public sealed class CourtyardExperienceModel
    {
        private int resetVersion = -1;

        public CourtyardExperienceStage Stage { get; private set; }
        public int HintLevel { get; private set; }
        public bool HasMoreHints => Stage != CourtyardExperienceStage.Complete && HintLevel < 3;
        public string HintButtonLabel => HintLevel == 0 ? "提示" : HintLevel < 3 ? "更多提示" : "提示已展开";

        public static string DescribeFailure(PlayerActionFailureReason reason) => reason switch
        {
            PlayerActionFailureReason.None => string.Empty,
            PlayerActionFailureReason.NoPathAtCurrentW => "路还没有连通。试着调整切片，观察门、石路或桥面的变化。",
            PlayerActionFailureReason.NotInteractiveAtCurrentW => "先走到机关旁，再点击启动机关。",
            PlayerActionFailureReason.NoGroundHit => "请点击地面或圆形落脚点。门墙不能作为目的地。",
            PlayerActionFailureReason.LevelNotPlaying => "请使用结算界面继续或重新开始。",
            _ => "这次操作没有完成，可以重新点击落脚点或按 R 重开。"
        };

        public void Observe(CourtyardExperienceStage stage, int version)
        {
            if (Stage != stage || resetVersion != version)
                HintLevel = 0;

            Stage = stage;
            resetVersion = version;
        }

        public void RequestHint()
        {
            if (HasMoreHints)
                HintLevel++;
        }

        public string Instruction
        {
            get
            {
                switch (Stage)
                {
                    case CourtyardExperienceStage.EnterCourtyard:
                        return "拖动切片，观察入口的变化。点击落脚点进入庭院。";
                    case CourtyardExperienceStage.FindMechanism:
                        return "在庭院里观察其他切片，寻找通向机关的路。";
                    case CourtyardExperienceStage.ActivateMechanism:
                        return "你已到达机关旁。点击机关，让它转动。";
                    case CourtyardExperienceStage.ReturnToCourtyard:
                        return "机关已经启动。先回到庭院，看看出口有什么变化。";
                    case CourtyardExperienceStage.ReachExit:
                        return "机关的改变仍在。寻找能走到出口的切片。";
                    default:
                        return "你走出了庭院。切片改变空间，机关留下结果。";
                }
            }
        }

        public string Hint
        {
            get
            {
                if (HintLevel == 0 || Stage == CourtyardExperienceStage.Complete)
                    return string.Empty;

                switch (Stage)
                {
                    case CourtyardExperienceStage.EnterCourtyard:
                        return Choose("留意入口的门洞和门前的石路。",
                            "慢慢拖动滑条，找到门洞敞开、石路连通的切片。",
                            "在入口打开时停下，点击庭院中央的落脚点。拖动本身不会让角色行走。");
                    case CourtyardExperienceStage.FindMechanism:
                        return Choose("庭院是安全的观察位置。切片里还有另一条路。",
                            "留意机关所在的支路。调整切片，观察通向它的石路何时出现。",
                            "等机关支路完整连通，点击机关前的落脚点。到达后才能启动机关。");
                    case CourtyardExperienceStage.ActivateMechanism:
                        return Choose("机关需要你亲手启动。",
                            "点击场景中的机关，或使用下方的“启动机关”按钮。",
                            "启动后留意出口的变化；机关的状态会保留，不用一直停在这个切片。");
                    case CourtyardExperienceStage.ReturnToCourtyard:
                        return Choose("先沿来路回到安全的庭院。",
                            "保持机关支路连通，点击庭院中央的落脚点。",
                            "若回路隐去了，调回能看见支路的切片，再点击庭院。机关不会因此复原。");
                    case CourtyardExperienceStage.ReachExit:
                        return Choose("观察出口，机关改变的部分还留在那里。",
                            "继续切换，寻找能与机关留下的结构接上的石桥。",
                            "让通往出口的石桥完整显现，再点击桥另一端的落脚点。");
                    default:
                        return string.Empty;
                }
            }
        }

        private string Choose(string first, string second, string third)
        {
            return HintLevel == 1 ? first : HintLevel == 2 ? second : third;
        }
    }
}
