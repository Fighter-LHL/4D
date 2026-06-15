# GardenGraybox 细节优化设计

## 目标
优化自动生成后的 `GardenGraybox.unity` 灰盒场景比例和 UI 布局，并添加 Play Mode 行为测试验证 W-Slice 核心机制（缺口、楼梯随 `w` 显隐）。

## 背景
上一轮生成后，场景功能正确但存在以下可改进点：
- `Ground` Plane 默认 10×10，缩放 `(10,1,10)` 后变成 100×100，远超花园灰盒需要。
- `WDialSlider` 和 `DebugText` 使用默认 RectTransform，位置和大小不便于测试。
- 缺少自动化的运行时行为验证，无法确保 `w` 变化确实驱动了切片物体的显隐。

## 方案

### 1. 生成器配置区（推荐做法 B）
在 `Assets/_Project/Editor/GardenGrayboxGenerator.cs` 顶部增加一个静态配置区，把场景和 UI 的魔法数字集中：

```csharp
private static class GardenLayout
{
    public const float GroundScaleXZ = 1.2f; // Plane 默认 10x10 => 12x12

    public static class UI
    {
        public const float DialWidth = 300f;
        public const float DialHeight = 40f;
        public const float DialBottomMargin = 60f;

        public const float DebugWidth = 200f;
        public const float DebugHeight = 100f;
        public const float DebugLeftMargin = 20f;
        public const float DebugTopMargin = 20f;
    }
}
```

生成器读取这些值设置 `Ground` scale 和 UI `RectTransform`。

### 2. UI 布局
- **WDialSlider**：锚定底部居中，`anchoredPosition = (0, DialBottomMargin)`，`sizeDelta = (DialWidth, DialHeight)`。
- **DebugText**：锚定左上角，`anchoredPosition = (DebugLeftMargin, -DebugTopMargin)`，`sizeDelta = (DebugWidth, DebugHeight)`。

### 3. Build Settings
把 `Assets/_Project/Level/Scenes/GardenGraybox.unity` 加入 `EditorBuildSettings.scenes`，使 Play Mode 测试可以通过 `SceneManager.LoadScene` 加载。

### 4. Play Mode 行为测试
新建 `Assets/_Project/Tests/PlayMode/GardenGrayboxBehaviorTests.cs`：

- `[UnitySetUp]` 加载 `GardenGraybox` 场景并等待一帧，让 `Awake()` 完成。
- 测试用例：
  - `GapSegmentAppearsAtMidW`：w=0 时 `GardenWall_GapSegment.transform.localScale.magnitude` 接近 0；w=0.55 时接近 1。
  - `StairAppearsAtHighW`：w=0 时 `HiddenStair/Stair_1.transform.localScale.magnitude` 接近 0；w=0.85 时接近 1。
  - `WallRemainsVisible`：w=0 时 `GardenWall_A.transform.localScale.magnitude` 接近 1。

通过 `LevelRuntimeController.WState.Force(w)` 设置 `w`，触发 `OnWChanged` 后读取 scale。

### 5. 测试程序集引用
`WSlice.Tests.PlayMode.asmdef` 增加对 `WSlice.Level` 的引用，以便访问 `LevelRuntimeController` 和 `WState`。

## 文件变更
- 修改：`Assets/_Project/Editor/GardenGrayboxGenerator.cs`
- 修改：`ProjectSettings/EditorBuildSettings.asset`
- 修改：`Assets/_Project/Tests/PlayMode/WSlice.Tests.PlayMode.asmdef`
- 新增：`Assets/_Project/Tests/PlayMode/GardenGrayboxBehaviorTests.cs` + `.meta`

## 测试验证
- 运行生成器重新生成场景。
- 运行 Edit Mode 测试：19/19 通过。
- 运行 Play Mode 测试：原有 1 个 + 新增 3 个全部通过。
