# W-Slice Puzzle Framework

基于 Unity 6000.0 LTS + URP 的“隐藏维度切片”解谜原型。关卡作者通过 `w ∈ [0,1]` 定义物体显隐与路径可达性，运行时负责平滑插值与交互。

**阶段：** Prototype v0.1 — Garden graybox 机制可跑，完整关卡生命周期待做。

仓库入口说明见 [`../README.md`](../README.md)。本地验证见 [`Validation.md`](Validation.md)。

## 环境

| 项 | 值 |
|---|---|
| Unity | `6000.0.77f1` |
| 渲染 | URP 17 |
| 输入 | Input System |
| 测试 | Unity Test Framework + NUnit |

## 核心模块

- `WSlice.Core`: `WState`, `WRange`, `WCondition`, `WSnapResolver`
- `WSlice.Level`: `LevelDefinition`, `LevelGraphRuntime`, `LevelRuntimeController`, `LevelDefinitionValidator`
- `WSlice.Entities`: `SliceProfile`, `SliceEntity`, `SlicePresenter`（Fade / Scale / Shader）
- `WSlice.Player`: `PlayerInputRouter`, `MovementController`, `PlayerActionResult`, `TapMoveInput`, `WDialInput`
- `WSlice.UI`: `HUDState`, `WDialModel`, `PlayerHUDModel`, `WDialView`, `WDialTrackView`, `PlayerHUDView`, `DebugOverlay`
- `WSlice.Editor`: `GardenGrayboxGenerator`, `LevelGraphGizmos`, `LevelPreviewWindow`

## 快速验证

```bash
# 从仓库根目录
./scripts/validate-local.sh
```

或见 [Validation.md](Validation.md) 中的 L0–L4 分层清单。

## 运行测试

**推荐：** Unity Editor → `Window → General → Test Runner` → Edit Mode / Play Mode → Run All。

命令行（需有效 Unity license）：

```bash
/Applications/Unity/Hub/Editor/6000.0.77f1/Unity.app/Contents/MacOS/Unity \
  -projectPath "$(pwd)" \
  -runTests -testPlatform EditMode \
  -testResults TestResults/editmode-results.xml \
  -quit -batchmode -nographics
```

Play Mode 将 `-testPlatform EditMode` 改为 `PlayMode`，结果文件改为 `playmode-results.xml`。

**已知限制：** batchmode `-runTests` 有时退出 0 但不产出 XML，此时必须在 Editor 中手动跑并记录结果（见 Validation.md PR 规范）。

## 搭建第一关

**推荐（一键生成）：**

1. `WSlice → Generate Garden Graybox`
2. `WSlice → Validate Garden Graybox`
3. Play Mode 冒烟：[`Assets/_Project/Tests/PlayModeSmokeTest.md`](Assets/_Project/Tests/PlayModeSmokeTest.md)

**Legacy（手动搭建，仅供参考）：**

- [`Assets/_Project/Level/Scenes/GardenSceneSetup.md`](Assets/_Project/Level/Scenes/GardenSceneSetup.md)
- [`Assets/_Project/Entities/SliceProfiles/SliceProfileSetup.md`](Assets/_Project/Entities/SliceProfiles/SliceProfileSetup.md)

## 关键设计原则

- `w` 是唯一真相源。所有显隐、通行、交互都从 `WState.CurrentW` 推导。
- 核心逻辑尽量是纯 C#，MonoBehaviour 仅做挂接与表现。
- 关卡可通行关系用手工节点图表达，清晰可控。

## 下一步（roadmap 摘要）

1. 关卡生命周期（`LevelSessionState`：Playing / Completed / Restart）
2. 目标触发与重开（不只 HUD 文案）
3. 场景内路径可达性可视化
4. 生成器拆分 + `LevelDefinition` Inspector
5. 第二关（W-offset 平台）
