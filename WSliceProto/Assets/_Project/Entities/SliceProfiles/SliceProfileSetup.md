# SliceProfile 配置指南

在 Unity Editor 中按以下步骤创建三个 SliceProfile 资产，并绑定到 `GardenGraybox` 场景物体。

## 创建路径

在 `Assets/_Project/Entities/SliceProfiles/` 右键 -> `Create -> WSlice -> Slice Profile`。

## 1. WallProfile

用于 `GardenWall_A`。

| 字段 | 值 |
|------|-----|
| Visibility Curve | 恒为 1（右键 Add Key: (0,1), (1,1)） |
| Solidity Curve | 恒为 1 |
| Glow Curve | 恒为 0 |
| Position Offset At W0 | (0, 0, 0) |
| Position Offset At W1 | (0, 0, 0) |
| Solid Range | Min 0, Max 1 |
| Interactive Range | Min 0, Max 1 |

## 2. GapProfile

用于 `GardenWall_GapSegment`。

| 字段 | 值 |
|------|-----|
| Visibility Curve | 关键帧：(0,0), (0.35,0.3), (0.55,1), (0.70,0.3), (1,0) |
| Solidity Curve | 恒为 1 |
| Glow Curve | 关键帧：(0,0), (0.35,0.5), (0.55,1), (0.70,0.5), (1,0) |
| Position Offset At W0 | (0, 0, 0) |
| Position Offset At W1 | (0, 0, 0) |
| Solid Range | Min 0.50, Max 0.70 |
| Interactive Range | Min 0.50, Max 0.70 |

## 3. StairProfile

用于 `HiddenStair` 的三个 Cube。

| 字段 | 值 |
|------|-----|
| Visibility Curve | 关键帧：(0,0), (0.70,0), (0.80,1), (0.90,1), (1,0) |
| Solidity Curve | 恒为 1 |
| Glow Curve | 恒为 0 |
| Position Offset At W0 | (0, 0, 0) |
| Position Offset At W1 | (0, 0, 0) |
| Solid Range | Min 0.75, Max 0.90 |
| Interactive Range | Min 0.75, Max 0.90 |

## 绑定

- 选中 `GardenWall_A`，将 `WallProfile` 拖到 `Slice Entity.Profile`。
- 选中 `GardenWall_GapSegment`，将 `GapProfile` 拖到 `Slice Entity.Profile`。
- 选中 `HiddenStair` 下的三个楼梯 Cube，将 `StairProfile` 拖到各自的 `Slice Entity.Profile`。

## 提示

当前 `SliceEntity` 只支持一个 Presenter。如果希望缺口段同时表现透明度与缩放，可创建一个组合 Presenter，或先使用 `ScalePresenter` 观察效果。
