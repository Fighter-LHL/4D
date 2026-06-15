# GardenGraybox 场景搭建指南

> **Legacy：** 推荐使用菜单 `WSlice -> Generate Garden Graybox` 一键生成。本文档保留作手动参考。

打开 `Assets/_Project/Level/Scenes/GardenGraybox.unity` 后按以下步骤搭建灰盒关卡。

## 1. 基础环境

- 选中 Main Camera，设置：
  - Position: `(0, 5, -8)`
  - Rotation: `(35, 0, 0)`
  - Projection: Perspective
- 选中 Directional Light，保持默认即可。
- 创建 `Ground`：GameObject -> 3D Object -> Plane，Scale `(10, 1, 10)`。

## 2. 玩家

- 创建 `Player`：GameObject -> 3D Object -> Capsule。
  - Position: `(0, 0, -4)`
  - 添加 `PlayerCharacter`，`Current Node Id` 填 `Outside`。
  - 添加 `MovementController`。

## 3. 场景切片物体

### GardenWall_A（完整墙体）
- GameObject -> 3D Object -> Cube，命名 `GardenWall_A`。
- Position `(0, 1, 0)`，Scale `(4, 2, 0.5)`。
- 添加 `SliceEntity`。
- 添加 `ScalePresenter`。
- 在 Inspector 把 `Scale Presenter` 拖到 `Slice Entity.Presenter`。
- （后续创建 WallProfile 后）把 `WallProfile` 拖到 `Slice Entity.Profile`。

### GardenWall_GapSegment（缺口段）
- GameObject -> 3D Object -> Cube，命名 `GardenWall_GapSegment`。
- Position `(0, 1, -2)`，Scale `(1, 2, 0.5)`。
- 添加 `SliceEntity`。
- 添加 `FadePresenter`。
- 添加 `ScalePresenter`。
- 目前 `SliceEntity` 只支持一个 Presenter；先拖入 `ScalePresenter`。
- （后续创建 GapProfile 后）把 `GapProfile` 拖到 `Slice Entity.Profile`。

### HiddenStair（隐藏楼梯）
- 用 3 个 Cube 拼成楼梯：
  - `Stair_1`: Position `(2, 0.25, 0)`, Scale `(1, 0.5, 0.3)`
  - `Stair_2`: Position `(2, 0.75, 0.3)`, Scale `(1, 0.5, 0.3)`
  - `Stair_3`: Position `(2, 1.25, 0.6)`, Scale `(1, 0.5, 0.3)`
- 给每个 Cube 添加 `SliceEntity` 和 `ScalePresenter`。
- （后续创建 StairProfile 后）把 `StairProfile` 拖到每个 `Slice Entity.Profile`。

### Flower（目标）
- GameObject -> 3D Object -> Capsule，命名 `Flower`。
- Position `(2, 1, 0)`。

## 4. 路径节点

创建空对象 `Nodes`，在其下创建 5 个子空对象，Reset Transform 后设置 Position：

| 名称 | Position |
|------|----------|
| OutsideNode | `(0, 0, -4)` |
| GapNode | `(0, 0, -2)` |
| InsideGardenNode | `(0, 0, 0)` |
| FlowerBaseNode | `(2, 0, 0)` |
| FlowerTopNode | `(2, 1.5, 0)` |

这些空对象仅用于可视化，实际数据来自 `GardenLevel.asset`。

## 5. 运行时对象

### LevelRuntime
- 创建空对象 `LevelRuntime`。
- 添加 `LevelRuntimeController`。
- `Definition` 字段拖到 `Assets/_Project/Level/Definitions/GardenLevel.asset`。
- `W Smoothing` 保持 `2`。

### PlayerInput
- 创建空对象 `PlayerInput`。
- 添加 `PlayerInputRouter`。
- `Level Controller` 拖到 `LevelRuntime`。
- `Movement` 拖到 `Player`。
- `Ground Mask` 选择 `Default`。

## 6. UI

- 创建 `Canvas`（GameObject -> UI -> Canvas），Render Mode 保持 Screen Space - Overlay。
- 在 Canvas 下创建 `Slider`（GameObject -> UI -> Slider），命名 `WDialSlider`。
  - Min Value `0`，Max Value `1`。
  - 添加 `WDialView`。
  - 把 `LevelRuntime` 上的 `WState` 拖到 `WDial View.W State`（注意：运行后 `WState` 才会实例化；如无法拖动，可在 Play 后或参考下方自动绑定说明）。
- 在 Canvas 下创建 `Text - TextMeshPro`，命名 `DebugText`。
  - 添加 `DebugOverlay`。
  - `Label` 拖到自身 TextMeshPro。
  - `W State`、`Level`、`Character` 分别拖到 `LevelRuntime.WState`、`LevelRuntime`、`Player`。

## 7. 自动绑定（可选）

如果运行时 `WDialView` 没有反应，说明 `W State` 引用为空。可临时在 `WDialView.Start()` 中添加：

```csharp
if (wState == null)
{
    var level = FindFirstObjectByType<LevelRuntimeController>();
    if (level != null) Bind(level.WState);
}
```

同理在 `DebugOverlay.Start()` 中：

```csharp
if (level == null)
{
    level = FindFirstObjectByType<LevelRuntimeController>();
    wState = level?.WState;
}
if (character == null)
    character = FindFirstObjectByType<PlayerCharacter>();
```

## 8. 保存

保存场景，进入 Play Mode 测试。
