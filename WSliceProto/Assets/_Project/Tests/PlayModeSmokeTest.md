# Play Mode Smoke Test

完成 `GardenGraybox` 场景搭建并配置 SliceProfile 后，按以下步骤验证最小可玩闭环。

## 准备

1. 打开 `Assets/_Project/Level/Scenes/GardenGraybox.unity`。
2. 可选：运行 `WSlice -> Generate Garden Graybox` 重新同步场景。
3. 运行 `WSlice -> Validate Garden Graybox`，应看到 `GardenGraybox validation passed.`。
4. 确认以下引用已绑定：
   - `LevelRuntime.LevelRuntimeController.Definition` = `GardenLevel`
   - `PlayerInput.PlayerInputRouter.Level Controller` = `LevelRuntime`
   - `PlayerInput.PlayerInputRouter.Movement` = `Player`
   - `PlayerInput.PlayerInputRouter.Ground Mask` 包含 `Default`
   - `WDialSlider.WDialView.Input Router` = `PlayerInput`
   - `WDialTrack.WDialTrackView` 已绑定 `LevelRuntime`、`PlayerInput`、`Player`
   - `PlayerHUDText.PlayerHUDView` 已绑定 `LevelRuntime`、`PlayerInput`、`Player`
   - `DebugText.DebugOverlay` 已绑定 `LevelRuntime`、`PlayerInput`、`Player`

## 测试步骤

1. 进入 Play Mode。
2. 在 Game 视图中拖动 `WDialSlider` 到接近 `0.55`：
   - `GardenWall_GapSegment` 应出现/变厚。
   - `WDialTrack` 应显示 snap tick，并同步当前/目标 W 标记。
3. 点击缺口内部地面：
   - `Player` 应从 `Outside` 经 `Gap` 移动到 `InsideGarden`。
   - `DebugOverlay` 中的 `CurrentNode` 应更新。
4. 回到低 W，点击缺口内部地面：
   - 角色应留在 `Outside`。
   - `PlayerHUDText` 应显示 `No path at this W.`
   - `PlayerHUDText` 应显示 `Try W 0.50-0.70 to open Outside->Gap.`
   - `DebugOverlay` 应显示 `RouteHint: Outside->Gap [0.50-0.70] target InsideGarden`。
5. 在角色移动穿过缺口时，把目标 W 拖到会关闭缺口的位置：
   - 移动可按现有逻辑回退。
   - `PlayerHUDText` 应显示移动断边风险。
   - `WDialTrack` 的目标标记/边段应进入危险颜色。
6. 拖动 `w` 到 `0.80`：
   - `HiddenStair` 应出现。
7. 点击 `FlowerTop` 位置：
   - `Player` 应走到 `FlowerBase`，再登上 `FlowerTop`。
   - `PlayerHUDText` 和 `DebugOverlay` 应显示 `Level Complete!`。

## 预期结果

- 玩家在正确 `w` 下能进入花园。
- 玩家在 `w ≈ 0.80` 时能看到楼梯并登上花台。
- `PlayerHUDText` 显示可读失败原因、移动风险和通关提示。
- `WDialTrack` 显示 snap 点、当前/目标 W 和边状态。
- `DebugOverlay` 继续显示 `CurrentW`、`TargetW`、`CurrentNode`、`AvailableEdges`。

## 常见问题

- 如果角色不动：检查 `PlayerCharacter.CurrentNodeId` 是否初始化为 `Outside`，以及地面是否有 Collider。
- 如果缺口不显现：检查 `GardenWall_GapSegment.SliceEntity.Profile` 是否为 `GapProfile`。
- 如果楼梯不显现：检查 `HiddenStair` 各 Cube 的 `SliceEntity.Profile` 是否为 `StairProfile`。
