# W-Slice Puzzle Framework

基于 Unity 6000.0 LTS + URP 的“隐藏维度切片”解谜原型。关卡作者通过 `w ∈ [0,1]` 定义物体显隐与路径可达性，运行时负责平滑插值与交互。

**阶段：** Intended Engineering Baseline。五关 playable demo 预期支撑独立机制实验；团队暂停通用 framework 和同类关卡扩张。具体分支仍须通过 wiring、Compile、五关回归与 build 验证，不能仅凭定位宣称稳定。

仓库入口说明见 [`../README.md`](../README.md)。本地验证见 [`Validation.md`](Validation.md)。Release checklist 见 [`../docs/releases/v0.3-wslice-demo.md`](../docs/releases/v0.3-wslice-demo.md)。

## 环境

| 项 | 值 |
|---|---|
| Unity | `6000.0.77f1` |
| 渲染 | URP 17 |
| 输入 | Input System |
| 测试 | Unity Test Framework + NUnit |

## 核心模块

- `WSlice.Core`: `WState`, `WRange`, `WCondition`, `WSnapResolver`
- `WSlice.Level`: `LevelDefinition`, `LevelGraphRuntime`, `LevelSession`, `LevelFlowModel`, `LevelCatalog`, `LevelGraphMutationController`, `GraphMutationModel`
- `WSlice.Entities`: `SliceProfile`, `SliceEntity`, `SlicePresenter`（Fade / Scale / Shader）
- `WSlice.Player`: `PlayerInputRouter`, `MovementController`, `SliceInteractionModel`, `TapMoveInput`, `WDialInput`
- `WSlice.UI`: `HUDState`, `WDialModel`, `PlayerHUDModel`, `LevelTutorialController`, `LevelOutcomeOverlayView`, `LevelSelectView`
- `WSlice.Editor`: graybox 生成器、`LevelCatalogValidatorRunner`, `GrayboxLevelRecipe`, `WSliceBuildPlayer`

## 快速验证

```bash
# 从仓库根目录
./scripts/validate-local.sh          # L0 + L1（五关 graybox + catalog）
./scripts/validate-local.sh --tests  # 额外尝试 L2/L3 batchmode 测试
```

或见 [Validation.md](Validation.md) 中的 L0–L5 分层清单。

## 运行测试

**推荐：** Unity Editor → `Window → General → Test Runner` → Edit Mode / Play Mode → Run All。

命令行（需有效 Unity license）：

```bash
mkdir -p "$(pwd)/WSliceProto/TestResults"
TEST_RUN_DIR="$(mktemp -d "$(pwd)/WSliceProto/TestResults/run.XXXXXX")"
/Applications/Unity/Hub/Editor/6000.0.77f1/Unity.app/Contents/MacOS/Unity \
  -projectPath "$(pwd)/WSliceProto" \
  -runTests -testPlatform EditMode \
  -testResults "$TEST_RUN_DIR/editmode-results.xml" \
  -batchmode -nographics
```

Play Mode 将 `-testPlatform EditMode` 改为 `PlayMode`，结果文件改为 `$TEST_RUN_DIR/playmode-results.xml`。

`validate-local.sh --tests` 为每轮测试创建唯一结果目录，并把 XML 缺失、`total=0`、非 `Passed` 或 `failed>0` 一律视为失败。若命令行环境不能产出有效 XML，必须在 Editor 中手动跑并保存结果（见 Validation.md PR 规范）。

## 搭建与校验关卡

**推荐（一键生成 + 校验）：**

| 关卡 | Generate | Validate |
|---|---|---|
| Garden_01 | `WSlice → Generate Garden Graybox` | `WSlice → Validate Garden Graybox` |
| Platform_01 | `WSlice → Generate Platform Graybox` | `WSlice → Validate Platform Graybox` |
| Gate_03 | `WSlice → Generate Gate Graybox` | `WSlice → Validate Gate Graybox` |
| Chambers_04 | `WSlice → Generate Chambers Graybox` | `WSlice → Validate Chambers Graybox` |
| Hazard_05 | `WSlice → Generate Hazard Graybox` | `WSlice → Validate Hazard Graybox` |
| Catalog | — | `WSlice → Validate Level Catalog` |

手动冒烟：[`Assets/_Project/Tests/PlayModeSmokeTest.md`](Assets/_Project/Tests/PlayModeSmokeTest.md)

## macOS 构建

```bash
# 从仓库根目录
./scripts/build-macos.sh
```

或 Editor：`WSlice → Build/macOS Standalone`

**输出路径（统一）：** `WSliceProto/builds/macos/W-Slice.app`

构建成功后同目录生成 `build-info.json`（version `0.3.0`、Unity 版本、启用场景、构建时间）。

## 关键设计原则

- legacy 五关从 `WState.CurrentW` 推导显隐、通行与交互，保留为 regression baseline。
- `LevelGraph` 继续负责 legacy 导航和流程。新的 4D 实验应让高维几何截面决定 3D geometry、collider 与 connectivity。
- 核心逻辑尽量是纯 C#，MonoBehaviour 仅做挂接与表现。
- Graph 运行时变更通过 `LevelGraphMutationController` 追踪，restart 经 `LevelRestartPipeline` 有序回滚（Graph → W → Player → Interactables → UI）。
- 玩家模式不显示 graph route、正确 W 区间或未来断路提示。`DebugOverlay.showDeveloperDebug` 统一控制这些开发诊断。

## 当前能力（v0.3.x）

- 五关 graybox demo + `LevelSelect` demo 首页（标题、关卡按钮、Quit、版本号）
- 完成/失败 overlay、Playing **R** 重开、开局教学提示
- W 门控边、W-offset 平台、profile 化拉杆 interactable + graph mutation（legacy baseline）
- `LevelCatalogValidator` + `GrayboxLevelRecipe`
- macOS standalone 构建 + 统一灰盒 URP Lit 材质

## 当前实验顺序

1. Mechanic Isolation
2. FourD Geometry Lab
3. Geometry-driven Collider
4. Impossible Room
5. Playtest Instrumentation 与产品判断

产品假设、非目标和 G0–G4 gates 见 [`../docs/mechanic-validation.md`](../docs/mechanic-validation.md)。
