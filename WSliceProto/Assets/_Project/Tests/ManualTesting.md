# 手动测试指南

**范围：** 旧五关回归 + Courtyard 纵向体验；验证状态以本次证据为准。

使用仓库根目录 `./scripts/validate-local.sh --tests` 校验当前代码与资产。新关 Courtyard 与旧五关一起校验。测试结果必须有本次运行的完整 NUnit XML；退出 0 但没有 XML 时记为失败/未确认，不能记 Pass。参见 [Validation.md](../../../Validation.md)。

项目路径：仓库内 `WSliceProto/`（用 Unity Hub 打开该目录）。

---

## L1 — Graybox 校验（batchmode）

从仓库根目录：

```bash
./scripts/validate-local.sh
```

该命令通过统一 `WSliceValidationRunner.ValidateAll` 校验旧五关、Courtyard 与 Catalog，并核对包含七项 scope 的 fresh JSON receipt。旧生成器 `Validate` 的日志可用于定位问题，但其单独退出码不能代替统一校验。新关的 Generate 为独立开发操作，不在验证时偷偷生成资产。

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

## 命令行测试

从仓库根目录运行：

```bash
./scripts/validate-local.sh --tests
```

脚本在独立结果目录保存 L0/L1 receipt、EditMode/PlayMode XML 与日志。测试调用不加 `-quit`；缺失、陈旧、损坏、失败、未完成或全 skipped 的 XML 都不能通过。Editor 中手动 Run All 也须保存实际 XML 和运行信息。详细标准见 [Validation.md](../../../Validation.md)。

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
