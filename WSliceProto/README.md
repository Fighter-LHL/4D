# W-Slice Puzzle Framework

基于 Unity 6000.0 LTS + URP 的“隐藏维度切片”解谜原型。关卡作者通过 `w ∈ [0,1]` 定义物体显隐与路径可达性，运行时负责平滑插值与交互。

## 核心模块

- `WSlice.Core`: `WState`, `WRange`, `WCondition`, `WSnapResolver`
- `WSlice.Level`: `LevelDefinition`, `LevelGraphRuntime`, `LevelRuntimeController`
- `WSlice.Entities`: `SliceProfile`, `SliceEntity`, `SlicePresenter`（含 Fade/Scale/Shader）
- `WSlice.Player`: 输入命令、`PlayerInputRouter`、`MovementController`, `TapMoveInput`
- `WSlice.UI`: `WDialView`, `DebugOverlay`
- `WSlice.EditorTools`: `LevelPreviewWindow`, `LevelGraphGizmos`, `GardenGrayboxGenerator`

## 项目位置

```
/Users/lvhanlin/Documents/4D/WSliceProto
```

## 运行测试

由于当前环境缺少 Unity batchmode 许可证，测试需在 Unity Editor 中手动运行：

1. 用 Unity Hub 打开项目路径 `/Users/lvhanlin/Documents/4D/WSliceProto`。
2. `Window -> General -> Test Runner`。
3. 切换 `Edit Mode` 或 `Play Mode`，点击 `Run All`。

如果本机已激活 Unity 许可证，也可用命令行：

```bash
/Applications/Unity/Hub/Editor/6000.0.77f1/Unity.app/Contents/MacOS/Unity \
  -projectPath /Users/lvhanlin/Documents/4D/WSliceProto \
  -runTests -testPlatform EditMode \
  -testResults editmode-results.xml \
  -quit -batchmode
```

Play Mode 测试：

```bash
/Applications/Unity/Hub/Editor/6000.0.77f1/Unity.app/Contents/MacOS/Unity \
  -projectPath /Users/lvhanlin/Documents/4D/WSliceProto \
  -runTests -testPlatform PlayMode \
  -testResults playmode-results.xml \
  -quit -batchmode
```

## 搭建第一关

**推荐（一键生成）：**

1. 在 Unity Editor 菜单选择 `WSlice -> Generate Garden Graybox`。
2. 可选：`WSlice -> Validate Garden Graybox` 校验引用。
3. 进入 Play Mode，按 `Assets/_Project/Tests/PlayModeSmokeTest.md` 验证。

**Legacy（手动搭建，仅供参考）：**

- `Assets/_Project/Level/Scenes/GardenSceneSetup.md`
- `Assets/_Project/Entities/SliceProfiles/SliceProfileSetup.md`

## 关键设计原则

- `w` 是唯一真相源。所有显隐、通行、交互都从 `WState.CurrentW` 推导。
- 核心逻辑尽量是纯 C#，MonoBehaviour 仅做挂接与表现。
- 关卡可通行关系用手工节点图表达，清晰可控。
