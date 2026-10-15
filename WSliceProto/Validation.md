# W-Slice 本地验证清单

本文档把 compile、五关 graybox 校验、自动化测试、手动冒烟、macOS 构建分层说明，便于新开发者 clone 后按同一流程验证。

**Unity 版本：** `6000.0.77f1`（见 `ProjectSettings/ProjectVersion.txt`）

**Pre-isolation engineering baseline：** `b719b3a`

## 无 Unity 环境中的几何实验

仓库另有独立浏览器实验，启动及测试方法见 [`../docs/browser-geometry-lab.md`](../docs/browser-geometry-lab.md)。它的 Node 测试覆盖超球截面方程和预测挑战状态，浏览器检查覆盖实验页面的交互。该结果单独记录，不计入下方 Unity L0–L5。

---

## 验证层级

| 层级 | 做什么 | 必须通过？ |
|---|---|---|
| L0 Compile | batchmode 打开项目并编译脚本 | 是 |
| L1 Validate | 五关 graybox validate + Level Catalog validate | 是 |
| L2 EditMode | 纯逻辑单元测试 | 是（有 license 时） |
| L3 PlayMode | 五关 + LevelFlow 集成测试 | 是（有 license 时） |
| L4 Smoke | 玩家模式与 Developer Debug 双模式检查 + 五关试玩 | 发布前建议 |
| L5 Build | macOS standalone 构建 | 发布前建议 |

---

## 一键脚本（推荐）

仓库根目录：

```bash
./scripts/validate-local.sh
```

默认执行 **L0 + L1**（含五关 validate + catalog）。加 `--tests` 尝试 **L2 + L3**（需要有效 Unity license 且 batchmode 测试可用）。

batchmode 发现 graybox 或 catalog error 后，Unity 进程返回非零。Editor 菜单记录同一错误并保持编辑器打开。

环境变量：

| 变量 | 默认 | 说明 |
|---|---|---|
| `UNITY_PATH` | macOS Hub 路径 | Unity 可执行文件 |
| `PROJECT_PATH` | `WSliceProto/` | 相对仓库根 |

---

## L0 — 脚本编译

```bash
/Applications/Unity/Hub/Editor/6000.0.77f1/Unity.app/Contents/MacOS/Unity \
  -projectPath WSliceProto \
  -quit -batchmode -nographics \
  -logFile -
```

（从仓库根目录执行；`-projectPath` 也可写绝对路径。）

**预期：** 日志含 `Tundra build success`，退出码 `0`。

---

## L1 — Graybox 校验（五关）

`validate-local.sh` 依次执行以下五关与 catalog 校验。也可单独在 Editor 菜单或 batchmode 运行。

### Garden

Editor：`WSlice → Validate Garden Graybox`

```bash
/Applications/Unity/Hub/Editor/6000.0.77f1/Unity.app/Contents/MacOS/Unity \
  -projectPath WSliceProto \
  -executeMethod WSlice.Editor.GardenGrayboxGenerator.Validate \
  -quit -batchmode -nographics -logFile -
```

**预期：** `GardenGraybox validation passed.`

### Platform

Editor：`WSlice → Validate Platform Graybox`

```bash
/Applications/Unity/Hub/Editor/6000.0.77f1/Unity.app/Contents/MacOS/Unity \
  -projectPath WSliceProto \
  -executeMethod WSlice.Editor.PlatformGrayboxGenerator.Validate \
  -quit -batchmode -nographics -logFile -
```

**预期：** `PlatformGraybox validation passed.`

### Gate

Editor：`WSlice → Validate Gate Graybox`

```bash
/Applications/Unity/Hub/Editor/6000.0.77f1/Unity.app/Contents/MacOS/Unity \
  -projectPath WSliceProto \
  -executeMethod WSlice.Editor.GateGrayboxGenerator.Validate \
  -quit -batchmode -nographics -logFile -
```

**预期：** `GateGraybox validation passed.`

### Chambers

Editor：`WSlice → Validate Chambers Graybox`

```bash
/Applications/Unity/Hub/Editor/6000.0.77f1/Unity.app/Contents/MacOS/Unity \
  -projectPath WSliceProto \
  -executeMethod WSlice.Editor.ChambersGrayboxGenerator.Validate \
  -quit -batchmode -nographics -logFile -
```

**预期：** `ChambersGraybox validation passed.`

### Hazard

Editor：`WSlice → Validate Hazard Graybox`

```bash
/Applications/Unity/Hub/Editor/6000.0.77f1/Unity.app/Contents/MacOS/Unity \
  -projectPath WSliceProto \
  -executeMethod WSlice.Editor.HazardGrayboxGenerator.Validate \
  -quit -batchmode -nographics -logFile -
```

**预期：** `HazardGraybox validation passed.`

### Level Catalog

Editor：`WSlice → Validate Level Catalog`

```bash
/Applications/Unity/Hub/Editor/6000.0.77f1/Unity.app/Contents/MacOS/Unity \
  -projectPath WSliceProto \
  -executeMethod WSlice.Editor.LevelCatalogValidatorRunner.Validate \
  -quit -batchmode -nographics -logFile -
```

**预期：** `LevelCatalog validation passed.`

校验内容：LevelId 唯一、SceneName 非空、LevelDefinition 与 catalog 一致、Build Settings 第一项为 LevelSelect、catalog 场景均已启用。

---

## L2 — Edit Mode 测试

Editor：`Window → General → Test Runner → Edit Mode → Run All`

命令行：

```bash
mkdir -p WSliceProto/TestResults
TEST_RUN_DIR="$(mktemp -d WSliceProto/TestResults/run.XXXXXX)"
/Applications/Unity/Hub/Editor/6000.0.77f1/Unity.app/Contents/MacOS/Unity \
  -projectPath WSliceProto \
  -runTests -testPlatform EditMode \
  -testResults "$TEST_RUN_DIR/editmode-results.xml" \
  -batchmode -nographics -logFile -
```

**预期套件：**

- Core: `WRangeTests`, `WConditionTests`, `WStateTests`, `WSnapResolverTests`
- Level: `LevelGraphRuntimeTests`, `LevelDefinitionValidatorTests`, `LevelCatalogValidatorTests`, `LevelSessionTests`, `LevelRestartRulesTests`, `LevelFlowModelTests`, `GraphMutationModelTests`, `LevelGraphMutationControllerTests`, `LevelPathPreviewModelTests`, `LevelDefinitionInspectorModelTests`, `LevelNodeMirrorNamingTests`, `LevelTutorialDismissRulesTests`, `LevelSelectButtonModelTests`
- Interaction: `SliceInteractionModelTests`, `WInteractableProfileModelTests`
- UI: `WDialModelTests`, `PlayerHUDModelTests`, `WDialTrackModelTests`

`validate-local.sh --tests` 使用每轮唯一结果目录，并要求 XML 为 `Passed`、`failed=0`、`total>0` 且 `passed=total`；缺失或不满足任一条件都返回非零。若命令行环境不能产出有效 XML，必须在 Unity Editor Test Runner 中手动 Run All 并保存结果。

---

## L3 — Play Mode 测试

Editor：`Test Runner → Play Mode → Run All`

命令行：

```bash
mkdir -p WSliceProto/TestResults
TEST_RUN_DIR="$(mktemp -d WSliceProto/TestResults/run.XXXXXX)"
/Applications/Unity/Hub/Editor/6000.0.77f1/Unity.app/Contents/MacOS/Unity \
  -projectPath WSliceProto \
  -runTests -testPlatform PlayMode \
  -testResults "$TEST_RUN_DIR/playmode-results.xml" \
  -batchmode -nographics -logFile -
```

**预期套件：**

- Garden: `GardenGrayboxBehaviorTests`, `GardenGrayboxMovementTests`
- Platform: `PlatformGrayboxTests`
- Gate: `GateGrayboxTests`
- Chambers: `ChambersGrayboxTests`
- Hazard: `HazardGrayboxTests`
- Flow: `LevelFlowPlayModeTests`, `LevelSelectPlayModeTests`
- Entities/UI: `SliceEntityPlayModeTests`, `WDialViewPlayModeTests`, `LevelPathPreviewPlayModeTests`

---

## L4 — 手动冒烟

按 [`Assets/_Project/Tests/PlayModeSmokeTest.md`](Assets/_Project/Tests/PlayModeSmokeTest.md) 完整走一遍。先在玩家模式检查机制隔离，再显式开启 Developer Debug 检查诊断恢复：

- 玩家模式：无 PathPreview、DebugText、authored snap ticks、edge bands、精确 WRange、route 节点名或未来断路预告
- Developer Debug：仅在 Unity Editor Play Mode 中通过 `DebugOverlay.showDeveloperDebug` 恢复上述诊断；关闭后清空
- 模式切换：W、graph、session 与玩家位置保持不变

随后验证五关流程：

1. **LevelSelect** — demo 首页（标题、版本、Quit）、五关按钮
2. **Garden_01** — 教学提示、W 门控缺口/楼梯、Playing **R** 重开、Completed overlay/**N**
3. **Platform_01** — W-offset 平台、West→East 边 W 区间通行
4. **Gate_03** — 拉杆 interactable hint、GateRoom→Goal 解锁、移动中断 Failed、overlay/**R**
5. **Chambers_04** — 多房间 W 序列解谜
6. **Hazard_05** — hazard platform、移动中降 W → Failed、**R** 重开

普通 macOS build 没有 runtime Developer Debug 入口，只验证默认关闭的玩家模式。

L0–L5 只证明软件和手动流程按预期工作。它们不提供 G0 discoverability、G2 prediction 或 G4 transfer 的玩家证据。

---

## L5 — macOS Standalone 构建

仓库根目录：

```bash
./scripts/build-macos.sh
```

或 Editor：`WSlice → Build/macOS Standalone`

**输出路径（统一）：** `WSliceProto/builds/macos/W-Slice.app`

**Manifest：** `WSliceProto/builds/macos/build-info.json`（version、Unity 版本、enabled scenes、build time、output path）

**预期：** 日志含 `macOS build succeeded`，退出码 `0`。启动后首先进入 `LevelSelect`。

Build Settings 启用场景顺序：

1. `LevelSelect`
2. `GardenGraybox`
3. `PlatformGraybox`
4. `GateGraybox`
5. `ChambersGraybox`
6. `HazardGraybox`

环境变量 `WSLICE_BUILD_OUTPUT` 可覆盖输出 `.app` 路径（manifest 写入同目录）。

---

## PR 测试记录规范

每个改动 WSlice 代码的 PR 都使用仓库的
[`pull_request_template.md`](../.github/pull_request_template.md) 作为唯一格式来源，包含：

```markdown
## Goal
## Product hypothesis
## Changed files
## Reused modules
## New modules
## Gameplay effect
## Validation
## What this proves
## What this does NOT prove
## Recommendation
```

`Validation` 内分别记录 Compile、EditMode、PlayMode、Manual mechanic check、L1 legacy validate 与 macOS build。测试必须写 N/N 及实际执行方式；没有新鲜 XML 或保存的 Editor Test Runner 结果就写 `Not run`，不得根据进程退出 0 推断 Pass。

---

## 生成场景（开发用）

修改生成器或关卡数据后：

1. `WSlice → Generate <Level> Graybox`
2. `WSlice → Validate <Level> Graybox`
3. 重新跑 L2/L3 或至少 L4

---

## 当前能力边界（v0.3.x）

- 有：五关 demo、LevelSelect 首页、overlay/教学/Playing 重开、W 门控机关、LevelCatalog 校验、graph mutation（runtime deep-copy）、有序 restart pipeline、macOS 构建
- 无：已配置 secrets 前的 CI 自动跑通、objective/condition 系统、Windows/Linux 构建、正式美术与音效

Release tag：`v0.3-wslice-demo`（见 [`docs/releases/v0.3-wslice-demo.md`](../docs/releases/v0.3-wslice-demo.md)）。v0.2 见 [`v0.2-wslice-demo.md`](../docs/releases/v0.2-wslice-demo.md)。
