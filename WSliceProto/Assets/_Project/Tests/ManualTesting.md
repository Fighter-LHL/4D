# 手动测试指南

**范围：** v0.4.0 development；回响庭院代表关 + 旧五关回归，共六个可玩关卡、七个启用场景（含 LevelSelect）。

本文列出待执行步骤与预期，不是通过记录。Unity 测试、Editor 人工冒烟与独立应用冒烟须分别记录本次结果；未附证据的项目保持未确认。**五位陌生玩家试玩：0/5，尚未开展。**

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

1. 使用 `ProjectSettings/ProjectVersion.txt` 指定的 Unity **6000.0.77f1**，加载 `WSliceProto/`。
2. `Window → General → Test Runner` → **Edit Mode** → **Run All**。

### 需要执行的测试套件

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
- `CourtyardExperienceModelTests`, `LevelOutcomeOverlayVisibilityTests`

---

## Play Mode 测试

1. 打开 Unity Editor，加载 `WSliceProto/`。
2. Test Runner → **Play Mode** → **Run All**。

### 需要执行的测试套件

**Courtyard**

- `CourtyardPlayModeTests`：机关位置限制、未激活不可绕过、切片间状态保留、重复激活、完整路线、重开、误调恢复、可见表面与碰撞一致
- `CourtyardDemoEntryTests`：首页突出庭院入口、保留旧五关、点击入口加载新关

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

## L4 — 手动冒烟（庭院主线 + 旧五关回归）

完整步骤见 [`PlayModeSmokeTest.md`](PlayModeSmokeTest.md)。摘要：

1. 从 `LevelSelect` 点击“开始：回响庭院”，完成“打开入口 → 抵达并启动机关 → 回庭院 → 换切片过桥 → 到达出口”。
2. 验证远处点击机关、未启动先尝试出口均不能绕过条件；启动后反复点击、换切片均不撤销机关状态。
3. 在入口、上坡、下坡与桥上移动时故意调走切片；角色应回到当前路段出发的安全落脚点，显示中文恢复提示，可继续操作，无需重开。
4. 分别在 Playing 与 Completed 时重开，再完整通关一次；核对机关、出口锁、切片、角色、教学、按需提示与通关面板均恢复。
5. 验证中文、按钮交互及 1280×720、1920×1080、1440×900 窗口尺寸。正常庭院界面不展示内部节点名或 W 数值答案。
6. 庭院通关后通过“关卡选择”返回首页；旧五关仍按 Garden → Platform → Gate → Chambers → Hazard 回归（**N** 下一关）。Gate、Hazard 的移动中断仍应 Failed，之后 **R** 可重开。

人工记录至少包含：日期、执行者、Editor/独立应用、Unity 版本、代码版本与工作区差异、分辨率、实际步骤、结果和截图/录像/日志路径。卡住或出现显示错误时记录失败与复现步骤，不以自动化通过替代人工结果。

---

## L5 — macOS 构建

```bash
./scripts/build-macos.sh
```

成功后用 `open` 命令打开控制台 `VERIFIED BUILD ARTIFACT ONLY:` 后打印的本次 `.app` 完整路径。

**预期：**

- 默认输出新的 `WSliceProto/builds/macos/run-<UTC 时间>-<随机后缀>/W-Slice.app`，不覆盖旧产物或证据；`WSLICE_BUILD_OUTPUT` 可指定新的 `.app` 位置
- `.app` 同级保留 `build-invocation.json`、`build-result.json`、`build.log`、`unity-console.log` 与 `build-info.json`；构建过程中源码和文档不能变化
- 同目录 `build-info.json` 含 version `0.4.0` 与七个启用场景：LevelSelect、CourtyardSlice、GardenGraybox、PlatformGraybox、GateGraybox、ChambersGraybox、HazardGraybox；LevelSelect 为启动场景，SampleScene 不启用
- 启动后进入 LevelSelect，突出“开始：回响庭院”；其下五个机制练习按钮可加载原关卡
- `build-result.json` 通过只代表产物核验，`applicationSmoke` 为 `not_run`。在该轮独立应用中实际完成 L4 路线，并再次核对中文字体、UI 点击、重开与回首页；另外保存人工记录，生成 `.app` 或 manifest 不代表独立应用冒烟通过

Editor 菜单 `WSlice → Build/macOS Standalone` 默认仍输出固定路径 `WSliceProto/builds/macos/W-Slice.app` 及同级 `build-info.json`，不经过脚本的独立运行目录和完整证据核验；两种入口须区分记录。

---

## 当前行为与体验验收门槛

- **R** 重开在 **Playing / Completed / Failed** 状态下均可用；重开会经 `LevelRestartPipeline` 有序重置 graph、W、玩家、机关与 UI
- Gate 关：拉杆在 W 0.45–0.65 可操作；区间外不激活。未激活的门始终锁定，包括 W=0.99/1；激活后墙体和路径线同时反映通行状态。区间外拉杆碰撞体不可点击，不能把特定 HUD 失败文案作为屏幕点击的必然结果。
- 庭院机关只要求角色实际抵达机关节点，不限制启动时的切片；机关状态只在重开时复原
- 庭院移动误调后保持 Playing，返回当前路段出发节点；这与 Gate / Hazard 的 Failed 行为不同
- 庭院是独立试玩，通关后无“下一关”；可选“再试一次”或“关卡选择”。原五关的下一关链保持不变
- 庭院教学按实际动作推进，等待或只拖动滑条不算完成；提示须点击索取，每阶段最多三级，换阶段或重开会清空

五位陌生玩家试玩另行执行，当前 **0/5**。不展示工程解法、不口头指导，记录首次理解操作时间、卡点、提示使用、通关耗时，以及玩家对“切片改变空间、机关保留结果”的复述。目标体验约 5–10 分钟；至少 4/5 人独立完成首段教学、至少 3/5 人完成组合谜题并说明关系，才考虑扩关。自动化、开发者试玩或 AI 操作均不计入这五位玩家。
