# 手动测试指南

**版本：** Prototype v0.3.x — 五关 demo + LevelSelect 首页 + overlay/教学/Playing 重开

当前环境可以用 Unity batchmode 做脚本编译和五关 graybox 校验；`-runTests` 有时会退出 0 但不产出 XML。遇到这种情况时，用 Unity Editor Test Runner 手动执行 EditMode/PlayMode。

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

# L0 Compile
$UNITY -projectPath $PROJECT -quit -batchmode -nographics
# Expected: Tundra build success

# L2 EditMode
$UNITY -projectPath $PROJECT \
  -runTests -testPlatform EditMode \
  -testResults $PROJECT/TestResults/editmode-results.xml \
  -quit -batchmode -nographics

# L3 PlayMode
$UNITY -projectPath $PROJECT \
  -runTests -testPlatform PlayMode \
  -testResults $PROJECT/TestResults/playmode-results.xml \
  -quit -batchmode -nographics
```

若 XML 未生成，在 Editor Test Runner 中手动 Run All 并记录结果。

---

## L4 — 手动冒烟（五关 demo）

完整步骤见 [`PlayModeSmokeTest.md`](PlayModeSmokeTest.md)。摘要：

1. 打开 `LevelSelect` 或从 macOS build 启动
2. 依次验证 Garden → Platform → Gate → Chambers → Hazard（**N** 下一关）
3. Gate 关验证拉杆交互、移动中断 Failed、**R** 重开
4. Hazard 关验证移动中降 W → Failed、**R** 重开

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
- Gate 关：未在正确 W 点击 lever 时 HUD 显示 `NotInteractiveAtCurrentW`
