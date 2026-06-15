# Play Mode Smoke Test

完成 `GardenGraybox` 场景搭建并配置 SliceProfile 后，按以下步骤验证最小可玩闭环。

## 准备

1. 打开 `Assets/_Project/Level/Scenes/GardenGraybox.unity`。
2. 确认以下引用已绑定：
   - `LevelRuntime.LevelRuntimeController.Definition` = `GardenLevel`
   - `PlayerInput.PlayerInputRouter.Level Controller` = `LevelRuntime`
   - `PlayerInput.PlayerInputRouter.Movement` = `Player`
   - `PlayerInput.PlayerInputRouter.Ground Mask` 包含 `Default`
   - `WDialSlider.WDialView.W State` = `LevelRuntime.WState`（如无法拖动，运行后自动绑定或参考场景指南的自动绑定代码）
   - `DebugText.DebugOverlay.Label` = 自身 TextMeshPro
   - `DebugText.DebugOverlay.W State` = `LevelRuntime.WState`
   - `DebugText.DebugOverlay.Level` = `LevelRuntime`
   - `DebugText.DebugOverlay.Character` = `Player`

## 测试步骤

1. 进入 Play Mode。
2. 在 Game 视图中拖动 `WDialSlider`：
   - 当 `w` 接近 `0.55` 时，`GardenWall_GapSegment` 应出现/变厚。
3. 点击缺口内部地面（或 Game 视图中的地面）：
   - `Player` 应从 `Outside` 经 `Gap` 移动到 `InsideGarden`。
   - `DebugOverlay` 中的 `CurrentNode` 应更新。
4. 拖动 `w` 到 `0.80`：
   - `HiddenStair` 应出现。
5. 点击 `FlowerTop` 位置：
   - `Player` 应走到 `FlowerBase`，再登上 `FlowerTop`。

## 预期结果

- 玩家在正确 `w` 下能进入花园。
- 玩家在 `w ≈ 0.80` 时能看到楼梯并登上花台。
- `DebugOverlay` 实时显示 `CurrentW`、`TargetW`、`CurrentNode`、`AvailableEdges`。

## 常见问题

- 如果角色不动：检查 `PlayerCharacter.CurrentNodeId` 是否初始化为 `Outside`，以及地面是否有 Collider。
- 如果缺口不显现：检查 `GardenWall_GapSegment.SliceEntity.Profile` 是否为 `GapProfile`。
- 如果楼梯不显现：检查 `HiddenStair` 各 Cube 的 `SliceEntity.Profile` 是否为 `StairProfile`。
