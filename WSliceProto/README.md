# W-Slice Puzzle Framework

基于 Unity 6000.0 LTS + URP 的“隐藏维度切片”解谜原型。关卡作者通过 `w ∈ [0,1]` 定义物体显隐与路径可达性，运行时负责平滑插值与交互。

**阶段：** Prototype v0.2 — 三关 demo（Garden / Platform / Gate）、选关与下一关流程、macOS standalone 构建。

仓库入口说明见 [`../README.md`](../README.md)。本地验证见 [`Validation.md`](Validation.md)。Release checklist 见 [`../docs/releases/v0.2-wslice-demo.md`](../docs/releases/v0.2-wslice-demo.md)。

## 环境

| 项 | 值 |
|---|---|
| Unity | `6000.0.77f1` |
| 渲染 | URP 17 |
| 输入 | Input System |
| 测试 | Unity Test Framework + NUnit |

## 核心模块

- `WSlice.Core`: `WState`, `WRange`, `WCondition`, `WSnapResolver`
- `WSlice.Level`: `LevelDefinition`, `LevelGraphRuntime`, `LevelRuntimeController`, `LevelSession`, `LevelFlowModel`, `LevelCatalog`
- `WSlice.Entities`: `SliceProfile`, `SliceEntity`, `SlicePresenter`（Fade / Scale / Shader）
- `WSlice.Player`: `PlayerInputRouter`, `MovementController`, `SliceInteractionModel`, `TapMoveInput`, `WDialInput`
- `WSlice.UI`: `HUDState`, `WDialModel`, `PlayerHUDModel`, `WDialView`, `WDialTrackView`, `PlayerHUDView`, `DebugOverlay`
- `WSlice.Editor`: `GardenGrayboxGenerator`, `PlatformGrayboxGenerator`, `GateGrayboxGenerator`, `WSliceBuildPlayer`, `LevelGraphGizmos`, `LevelPreviewWindow`

## 快速验证

```bash
# 从仓库根目录
./scripts/validate-local.sh          # L0 + L1（三关 graybox validate）
./scripts/validate-local.sh --tests  # 额外尝试 L2/L3 batchmode 测试
```

或见 [Validation.md](Validation.md) 中的 L0–L5 分层清单。

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

## 搭建与校验关卡

**推荐（一键生成 + 校验）：**

| 关卡 | Generate | Validate |
|---|---|---|
| Garden_01 | `WSlice → Generate Garden Graybox` | `WSlice → Validate Garden Graybox` |
| Platform_01 | `WSlice → Generate Platform Graybox` | `WSlice → Validate Platform Graybox` |
| Gate_03 | `WSlice → Generate Gate Graybox` | `WSlice → Validate Gate Graybox` |

手动冒烟：[`Assets/_Project/Tests/PlayModeSmokeTest.md`](Assets/_Project/Tests/PlayModeSmokeTest.md)

**Legacy（手动搭建 Garden，仅供参考）：**

- [`Assets/_Project/Level/Scenes/GardenSceneSetup.md`](Assets/_Project/Level/Scenes/GardenSceneSetup.md)
- [`Assets/_Project/Entities/SliceProfiles/SliceProfileSetup.md`](Assets/_Project/Entities/SliceProfiles/SliceProfileSetup.md)

## macOS 构建

```bash
# 从仓库根目录
./scripts/build-macos.sh
```

或 Editor：`WSlice → Build/macOS Standalone`

**输出路径（统一）：** `WSliceProto/builds/macos/W-Slice.app`

构建成功后同目录生成 `build-info.json`（version、Unity 版本、启用场景、构建时间）。

## 关键设计原则

- `w` 是唯一真相源。所有显隐、通行、交互都从 `WState.CurrentW` 推导。
- 核心逻辑尽量是纯 C#，MonoBehaviour 仅做挂接与表现。
- 关卡可通行关系用手工节点图表达，清晰可控。

## 当前能力（v0.2）

- 三关 graybox demo + `LevelSelect` 选关入口
- 关卡生命周期、目标检测、Completed / Failed 状态
- W 门控边、W-offset 平台、拉杆 interactable 解锁边
- 完成后 **N** 下一关、Completed/Failed 后 **R** 重开
- macOS standalone 构建 + 统一灰盒 URP Lit 材质

## 下一步（v0.3 roadmap 摘要）

1. 完成/失败 overlay UI 面板（可点击 Next / Retry / Level Select）
2. Playing 状态下允许 **R** 重开
3. 每关开局教学提示
4. LevelSelect 升级为 demo 首页（标题、关卡主题、Quit、版本号）
5. `LevelCatalog` 校验器与 graybox recipe 化（authoring hardening）
