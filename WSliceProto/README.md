# W-Slice Puzzle Framework

基于 Unity 6000.0 LTS + URP 的“隐藏维度切片”解谜原型。关卡作者通过 `w ∈ [0,1]` 定义物体显隐与路径可达性，运行时负责平滑插值与交互。

**阶段：** v0.4.0 development，回响庭院代表关 + 原五关回归样例。新关尚待本次 Unity 实测，不能把已写测试视为通过结果；五人试玩为 0/5。见 [`../docs/courtyard-slice.md`](../docs/courtyard-slice.md)。

仓库入口说明见 [`../README.md`](../README.md)。本地验证见 [`Validation.md`](Validation.md)。历史 v0.3 release checklist 见 [`../docs/releases/v0.3-wslice-demo.md`](../docs/releases/v0.3-wslice-demo.md)，不作为当前开发版通过证据。

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
./scripts/validate-local.sh          # L0 + L1（庭院、旧五关 + Catalog）
./scripts/validate-local.sh --tests  # 额外尝试 L2/L3 batchmode 测试
```

或见 [Validation.md](Validation.md) 中的 L0–L5 分层清单。

## 运行测试

**推荐：** Unity Editor → `Window → General → Test Runner` → Edit Mode / Play Mode → Run All。

命令行（需有效 Unity license）：

```bash
../scripts/validate-local.sh --tests
```

脚本依次执行 EditMode 和 PlayMode，每次生成独立证据目录并解析实际用例结果。

**证据要求：** 退出 0 但没有新 XML 时，本轮验证失败/未确认。可改用 Editor Test Runner，但必须导出本次结果并记录实际用例数量。

## 搭建与校验关卡

场景已入库，运行和验证无需先 Generate。仅在开发更改生成规则时生成资产，单独审查差异后再执行统一验证。

| 关卡 | Generate | Validate |
|---|---|---|
| Garden_01 | `WSlice → Generate Garden Graybox` | `WSlice → Validate Garden Graybox` |
| Platform_01 | `WSlice → Generate Platform Graybox` | `WSlice → Validate Platform Graybox` |
| Gate_03 | `WSlice → Generate Gate Graybox` | `WSlice → Validate Gate Graybox` |
| Chambers_04 | `WSlice → Generate Chambers Graybox` | `WSlice → Validate Chambers Graybox` |
| Hazard_05 | `WSlice → Generate Hazard Graybox` | `WSlice → Validate Hazard Graybox` |
| Catalog | — | `WSlice → Validate Level Catalog` |
| Courtyard_01 | `WSlice → Generate Courtyard Slice` | `WSlice → Validate Courtyard Slice` |

手动冒烟：[`Assets/_Project/Tests/PlayModeSmokeTest.md`](Assets/_Project/Tests/PlayModeSmokeTest.md)

## macOS 构建

```bash
# 从仓库根目录
./scripts/build-macos.sh
```

脚本默认输出到新的 `WSliceProto/builds/macos/run-<UTC 时间>-<随机后缀>/W-Slice.app`。成功后用 `open` 打开控制台 `VERIFIED BUILD ARTIFACT ONLY:` 后的本次完整路径。

同级保存 `build-invocation.json`、`build-result.json`、`build.log`、`unity-console.log` 与 `build-info.json`。Manifest 应记录 version `0.4.0`、Unity 版本及七个启用场景。脚本拒绝覆盖已有产物和证据；`WSLICE_BUILD_OUTPUT` 可指定新的 `.app` 位置。

构建产物核验不启动应用，`build-result.json` 中的 `applicationSmoke` 保持 `not_run`；独立应用启动、完整路线与返回首页须另外保存实际记录。当前开发版构建仍待本次证据确认。

Editor 菜单 `WSlice → Build/macOS Standalone` 默认仍输出固定位置 `WSliceProto/builds/macos/W-Slice.app` 及同级 `build-info.json`，不经过脚本的独立运行目录和完整证据核验。两种入口不可混用输出路径或证据结论。

## 关键设计原则

- 切片取自 `WState.CurrentW`；通行还受 graph 的显式锁与机关状态约束，空间表现与这些实际条件同步。
- 核心逻辑尽量是纯 C#，MonoBehaviour 仅做挂接与表现。
- 关卡可通行关系用手工节点图表达，清晰可控。
- Graph 运行时变更通过 `LevelGraphMutationController` 追踪，restart 经 `LevelRestartPipeline` 有序回滚（Graph → W → Player → Interactables → UI）。

## 当前实现（v0.4.0 development，待实测）

- 回响庭院 + 原五关回归，共六个可玩关卡、七个启用场景；`LevelSelect` 首页突出庭院入口并保留机制练习
- 庭院位置约束机关、显式锁边、跨切片状态、条件完成、可恢复误调与中文按进度提示
- 完成/失败 overlay、Playing **R** 重开、开局教学提示
- W 门控边、W-offset 平台、profile 化拉杆 interactable + graph mutation
- `LevelCatalogValidator` + `GrayboxLevelRecipe`
- macOS standalone 构建、每轮独立产物与证据核验 + 统一灰盒 URP Lit 材质

## 下一步（v0.4.0 验证与试玩）

1. 取得本次 Unity 编译、六关与 Catalog 校验、EditMode / PlayMode 的有效 receipt/XML。
2. 构建独立 macOS 产物，按人工清单验证庭院主线、恢复、重开、中文与原五关回归；启动记录与构建结果分开保存。
3. 开展五位陌生玩家的无指导试玩；当前 0/5，达到教学与解谜门槛后再决定扩关。
4. CI 校验 + EditMode/PlayMode 以实际 Actions 证据为准（需配置 Unity license；缺失时明确跳过）。
