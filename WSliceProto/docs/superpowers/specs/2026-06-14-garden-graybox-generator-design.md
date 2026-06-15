# GardenGraybox 自动生成器设计

## 目标
提供一个 Unity Editor 菜单 `WSlice/Generate Garden Graybox`，一键完成当前 `GardenGraybox.unity` 灰盒关卡和三个 `SliceProfile` 资产的创建与绑定，替代原来的手动搭建流程。

## 背景
原项目通过 `GardenSceneSetup.md` 和 `SliceProfileSetup.md` 描述手动步骤。由于 Unity 场景和 ScriptableObject 引用关系复杂，手动操作容易遗漏。本设计采用 Editor 脚本调用 Unity API 自动生成，保证引用正确且可重复。

## 生成内容

### 1. SliceProfile 资产
在 `Assets/_Project/Entities/SliceProfiles/` 下创建：

| 资产 | 用途 | 关键配置 |
|------|------|----------|
| `WallProfile.asset` | `GardenWall_A` | Visibility/Solidity 恒为 1，Glow 恒为 0，Solid/Interactive Range [0,1] |
| `GapProfile.asset` | `GardenWall_GapSegment` | 文档指定的 Visibility/Glow 曲线，Solid/Interactive Range [0.50,0.70] |
| `StairProfile.asset` | `HiddenStair` 三个 Cube | 文档指定的 Visibility 曲线，Solidity/Glow 恒为 1/0，Solid/Interactive Range [0.75,0.90] |

所有 Position Offset 均为 `(0,0,0)`。

### 2. 场景物体
打开现有 `Assets/_Project/Level/Scenes/GardenGraybox.unity` 并增量修改/添加：

- **Main Camera**：position `(0,5,-8)`，rotation `(35,0,0)`
- **Directional Light** 和 **Global Volume**：保持现状
- **Ground**：Plane，scale `(10,1,10)`
- **Player**：Capsule，position `(0,0,-4)`，添加 `PlayerCharacter`（CurrentNodeId = "Outside"）和 `MovementController`
- **GardenWall_A**：Cube `(0,1,0)` scale `(4,2,0.5)`，添加 `SliceEntity` + `ScalePresenter`，绑定 `WallProfile`
- **GardenWall_GapSegment**：Cube `(0,1,-2)` scale `(1,2,0.5)`，添加 `SliceEntity` + `ScalePresenter`，绑定 `GapProfile`
- **HiddenStair**：父节点 + 3 个 Cube 子物体，每个添加 `SliceEntity` + `ScalePresenter`，绑定 `StairProfile`
- **Flower**：Capsule，position `(2,1,0)`
- **Nodes**：空父节点 + 5 个空子节点（OutsideNode、GapNode、InsideGardenNode、FlowerBaseNode、FlowerTopNode）
- **LevelRuntime**：空节点，添加 `LevelRuntimeController`，绑定 `GardenLevel.asset`
- **PlayerInput**：空节点，添加 `PlayerInputRouter`，绑定 Main Camera、LevelRuntime、Player
- **Canvas**：Screen Space - Overlay，包含 `WDialSlider`（Slider + WDialView）和 `DebugText`（TMP + DebugOverlay）

## 幂等性
- 按名称查找场景对象；已存在则只更新 Transform/字段，不重复创建。
- 已存在的 `SliceProfile` 资产直接加载复用，不重新创建，避免 GUID 变化破坏引用。

## 引用自动绑定
脚本通过 `GameObject.GetComponent`、`FindFirstObjectByType` 和直接字段赋值完成所有 `[SerializeField]` 引用，无需手动拖拽。

## 文件变更
- 新增：`Assets/_Project/Editor/GardenGrayboxGenerator.cs`
- 新增：`Assets/_Project/Entities/SliceProfiles/WallProfile.asset` + `.meta`
- 新增：`Assets/_Project/Entities/SliceProfiles/GapProfile.asset` + `.meta`
- 新增：`Assets/_Project/Entities/SliceProfiles/StairProfile.asset` + `.meta`
- 修改：`Assets/_Project/Level/Scenes/GardenGraybox.unity`

## 测试验证
- 运行 Edit Mode 19 个测试 + Play Mode 1 个测试，全部通过。
- 打开场景检查关键物体存在、引用不为空。
