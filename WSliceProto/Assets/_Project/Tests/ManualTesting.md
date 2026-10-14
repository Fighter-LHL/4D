# 手动测试指南

**阶段：** Engineering Baseline — 五关 demo + LevelSelect 首页 + overlay/教学/Playing 重开

在具备 Unity 6000.0.77f1 与有效 license 的环境中，可用 batchmode 做脚本编译、五关 graybox 校验和自动测试。`validate-local.sh --tests` 会拒绝缺失或无效的 XML；命令行不能产出有效 XML 时，用 Unity Editor Test Runner 手动执行并保存结果。

项目路径：仓库内 `WSliceProto/`（用 Unity Hub 打开该目录）。

---

## L1 — Graybox 校验（batchmode）

从仓库根目录：

```bash
./scripts/validate-local.sh
```

或单独执行：

```bash
UNITY=/Applications/Unity/Hub/Editor/6000.0.77f1/Unity.app/Contents/MacOS/Unity
PROJECT=WSliceProto

$UNITY -projectPath $PROJECT -executeMethod WSlice.Editor.GardenGrayboxGenerator.Validate -quit -batchmode -nographics
$UNITY -projectPath $PROJECT -executeMethod WSlice.Editor.PlatformGrayboxGenerator.Validate -quit -batchmode -nographics
$UNITY -projectPath $PROJECT -executeMethod WSlice.Editor.GateGrayboxGenerator.Validate -quit -batchmode -nographics
$UNITY -projectPath $PROJECT -executeMethod WSlice.Editor.ChambersGrayboxGenerator.Validate -quit -batchmode -nographics
$UNITY -projectPath $PROJECT -executeMethod WSlice.Editor.HazardGrayboxGenerator.Validate -quit -batchmode -nographics
$UNITY -projectPath $PROJECT -executeMethod WSlice.Editor.LevelCatalogValidatorRunner.Validate -quit -batchmode -nographics
```

**预期：** 各关日志含 `<Level>Graybox validation passed.`；catalog 日志含 `LevelCatalog validation passed.`

---

## Edit Mode 测试

1. 打开 Unity Editor，加载 `WSliceProto/`。
2. `Window → General → Test Runner` → **Edit Mode** → **Run All**。

### 预期通过的测试

**Core**

- `WRangeTests`, `WConditionTests`, `WStateTests`, `WSnapResolverTests`

**Level**

- `LevelGraphRuntimeTests`, `LevelDefinitionValidatorTests`, `LevelCatalogValidatorTests`
- `LevelSessionTests`, `LevelRestartRulesTests`, `LevelFlowModelTests`
- `GraphMutationModelTests`, `LevelGraphMutationControllerTests`
- `LevelPathPreviewModelTests`, `LevelDefinitionInspectorModelTests`, `LevelNodeMirrorNamingTests`
- `LevelTutorialDismissRulesTests`, `LevelSelectButtonModelTests`

**Interaction**

- `SliceInteractionModelTests`, `WInteractableProfileModelTests`

**UI**

- `WDialModelTests`, `PlayerHUDModelTests`, `WDialTrackModelTests`

---

## Play Mode 测试

1. 打开 Unity Editor，加载 `WSliceProto/`。
2. Test Runner → **Play Mode** → **Run All**。

### 预期通过的测试

**Garden**

- `GardenGrayboxBehaviorTests`, `GardenGrayboxMovementTests`

**Platform**

- `PlatformGrayboxTests`

**Gate**

- `GateGrayboxTests`

**Chambers**

- `ChambersGrayboxTests`

**Hazard**

- `HazardGrayboxTests`

**Flow**

- `LevelFlowPlayModeTests`, `LevelSelectPlayModeTests`

**Entities / UI**

- `SliceEntityPlayModeTests`, `WDialViewPlayModeTests`, `LevelPathPreviewPlayModeTests`

---

## 命令行测试（可选）

```bash
UNITY=/Applications/Unity/Hub/Editor/6000.0.77f1/Unity.app/Contents/MacOS/Unity
PROJECT=WSliceProto
mkdir -p "$PROJECT/TestResults"
TEST_RUN_DIR="$(mktemp -d "$PROJECT/TestResults/run.XXXXXX")"

# L0 Compile
$UNITY -projectPath $PROJECT -quit -batchmode -nographics
# Expected: Tundra build success

# L2 EditMode
$UNITY -projectPath $PROJECT \
  -runTests -testPlatform EditMode \
  -testResults "$TEST_RUN_DIR/editmode-results.xml" \
  -batchmode -nographics

# L3 PlayMode
$UNITY -projectPath $PROJECT \
  -runTests -testPlatform PlayMode \
  -testResults "$TEST_RUN_DIR/playmode-results.xml" \
  -batchmode -nographics
```

若 XML 未生成或内容无效，在 Editor Test Runner 中手动 Run All 并保存结果；不得根据进程退出 0 推断通过。

---

## L4 — 手动冒烟（五关 demo）

完整步骤见 [`PlayModeSmokeTest.md`](PlayModeSmokeTest.md)。摘要：

1. 打开 `LevelSelect` 或从 macOS build 启动
2. 保持 `DebugOverlay.showDeveloperDebug = false`，在 Editor 或 macOS build 检查五关无 solution oracle
3. 仅在 Unity Editor Play Mode 中显式开启 Developer Debug，检查路径、区间、route 与 debug text 恢复；再关闭并检查清空
4. 依次验证 Garden → Platform → Gate → Chambers → Hazard（**N** 下一关）
5. Gate 关验证拉杆交互、移动中断 Failed、**R** 重开
6. Hazard 关验证移动中改变 W → Failed、**R** 重开

### Mechanic Isolation 验收

玩家模式应保留 W slider、current/target marker、世界变化、失败与完成反馈。以下信息不得出现：

- 红绿 PathPreview、DebugText
- authored snap ticks、edge WRange bands、目标 W 断路预告
- `Try W min-max`、graph 节点名、interactable 精确 WRange

Developer Debug 通过 Unity Editor Inspector 中 `DebugText` 对象上的一个开关统一恢复这些诊断。切换前后记录 current/target W、graph、玩家 world position、当前节点与 session，确认状态未变。普通 macOS build 没有 runtime 开关。

---

## L5 — macOS 构建

```bash
./scripts/build-macos.sh
open WSliceProto/builds/macos/W-Slice.app
```

**预期：**

- 输出 `WSliceProto/builds/macos/W-Slice.app`
- 同目录 `build-info.json` 含 version `0.3.0` 与六个启用场景（LevelSelect + 五关）
- 启动后进入 LevelSelect，五关按钮可加载对应关卡

Editor 菜单 `WSlice → Build/macOS Standalone` 应输出到同一路径。

---

## 已知行为（v0.3.x）

- **R** 重开在 **Playing / Completed / Failed** 状态下均可用；重开会经 `LevelRestartPipeline` 有序重置 graph、W、玩家、机关与 UI
- Gate 关：未在可交互截面点击 lever 时，玩家 HUD 只说明当前截面不可交互；Developer Debug 保留精确 WRange
