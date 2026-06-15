# 手动测试指南

由于当前环境无法运行 Unity batchmode，所有单元测试需要在 Unity Editor 中手动执行。

## Edit Mode 测试

1. 打开 Unity Editor，加载项目：`/Users/lvhanlin/Documents/4D/WSliceProto/.worktrees/feat-w-slice`。
2. 打开 Test Runner 窗口：`Window -> General -> Test Runner`。
3. 切换到 `Edit Mode` 标签。
4. 点击 `Run All`。

### 预期通过的测试

- `WRangeTests`
  - `Contains_Inside_ReturnsTrue`
  - `Contains_OutsideLow_ReturnsFalse`
  - `Contains_OutsideHigh_ReturnsFalse`
  - `DistanceTo_Inside_IsZero`
  - `DistanceTo_Below_ReturnsGap`
  - `DistanceTo_Above_ReturnsGap`
- `WConditionTests`
  - `Evaluate_InsideActiveRange_ReturnsTrue`
  - `Evaluate_InvertedInside_ReturnsFalse`
- `WStateTests`
  - `SetTarget_ClampsAboveOne`
  - `SetTarget_ClampsBelowZero`
  - `Tick_MovesCurrentWAndFiresEvent`
  - `Force_SetsBothAndFiresEvent`
- `WSnapResolverTests`
  - `Resolve_WithinSnapRadius_SnapsDown`
  - `Resolve_OutsideSnapRadius_KeepsRaw`
  - `Resolve_EmptySnaps_ReturnsRaw`
- `LevelGraphRuntimeTests`
  - `CanMove_WhenWalkable_ReturnsTrue`
  - `CanMove_WhenNotWalkable_ReturnsFalse`
  - `FindPath_TwoHopsButFirstBlocked_ReturnsEmpty`
  - `FindPath_WhenBothEdgesWalkable_ReturnsFullPath`

## 命令行方式（需要有效许可证）

如果本机已激活 Unity 许可证，可在终端运行：

```bash
/Applications/Unity/Hub/Editor/6000.0.77f1/Unity.app/Contents/MacOS/Unity \
  -projectPath /Users/lvhanlin/Documents/4D/WSliceProto/.worktrees/feat-w-slice \
  -runTests -testPlatform EditMode \
  -testResults editmode-results.xml \
  -quit -batchmode
```

Expected: `test-run result="Passed"`。
