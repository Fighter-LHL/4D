# 4D — W-Slice Puzzle Prototype

Unity 早期 playable prototype，核心机制是 **W-Slice**：标量 `w ∈ [0,1]` 控制物体显隐、路径可达性与交互反馈。

**当前阶段：** 回响庭院代表关开发版 + 原五关机制样例。新关代码和场景已加入；当前机器没有 Unity Editor，尚未确认 Unity 编译、实际试玩或 macOS 构建通过。

## 优先试玩：回响庭院

用 Unity **6000.0.77f1** 打开 `WSliceProto`，进入 `LevelSelect`，点击 **开始：回响庭院**；也可直接打开 `Assets/_Project/Level/Scenes/CourtyardSlice.unity` 后 Play。场景已提交，进入 Play 时创建空间表现，不必先运行生成器。

拖动底部滑条切换切片，点击地面落脚点移动。到机关旁点击机关或“启动机关”；“提示”按当前进度逐级揭示。误调切片会返回安全落脚点，可以继续尝试；按 **R** 重开。

制作目标为约 5–10 分钟的观察解谜体验，实际时长尚待验证。机关状态跨切片保留，必须激活后才能到出口完成。

- [实现与试玩说明](docs/courtyard-slice.md)
- [五人无指导试玩记录（目前 0/5）](docs/playtests/courtyard-five-player-template.md)
- [可信验证流程](WSliceProto/Validation.md)：缺失 XML、零用例或失败均不能记为通过。

## 快速开始

| 项 | 值 |
|---|---|
| Unity 版本 | **6000.0.77f1**（Unity 6 LTS） |
| 项目路径 | [`WSliceProto/`](WSliceProto/) |
| 启动场景 | `LevelSelect`（Build Settings 第一项） |
| 代表性试玩 | Courtyard_01（独立结束） |
| 原五关顺序 | Garden_01 → Platform_01 → Gate_03 → Chambers_04 → Hazard_05 |
| Baseline | `main` @ `d6fbea1`（v0.3 release 锚点） |

### 1. 打开项目

```bash
# 用 Unity Hub 打开此目录：
WSliceProto/
```

### 2. 生成 / 校验灰盒关卡

在 Unity Editor 菜单：

1. `WSlice → Generate Garden / Platform / Gate / Chambers / Hazard Graybox` — 生成或刷新对应场景
2. `WSlice → Validate Garden / Platform / Gate / Chambers / Hazard Graybox` — 校验资产与场景引用
3. `WSlice → Validate Level Catalog` — 校验 catalog 与 Build Settings

或一键脚本（L0 + 五关 L1 + catalog）：

```bash
./scripts/validate-local.sh
```

### 3. 本地验证

详见 [`WSliceProto/Validation.md`](WSliceProto/Validation.md)（L0–L5 分层清单）。

加 `--tests` 可尝试 L2 EditMode / L3 PlayMode batchmode 测试。

### 4. 手动试玩

进入 Play Mode，从 `LevelSelect` demo 首页开始，按 [`PlayModeSmokeTest.md`](WSliceProto/Assets/_Project/Tests/PlayModeSmokeTest.md) 走五关 demo 流程。

### 5. macOS 构建

启动场景为 `LevelSelect`（Build Settings 第一项）。也可在 Editor 菜单使用 `WSlice → Build/macOS Standalone`。

```bash
chmod +x scripts/build-macos.sh   # 首次
./scripts/build-macos.sh
open WSliceProto/builds/macos/W-Slice.app
```

构建成功后会在 `WSliceProto/builds/macos/build-info.json` 写入版本、Unity 版本、启用场景与输出路径。

## 仓库结构

```
4D/
├── README.md                 ← 本文件（仓库入口）
├── docs/releases/            ← release checklist 与 tag 说明
├── scripts/
│   ├── validate-local.sh     ← 本地 compile + validate 脚本
│   └── build-macos.sh        ← macOS standalone 构建
└── WSliceProto/              ← Unity 工程根目录
    ├── README.md             ← 模块说明与设计原则
    ├── Validation.md         ← 验证清单与已知限制
    ├── builds/macos/         ← macOS 构建输出（gitignore）
    └── Assets/_Project/      ← 游戏代码（Core/Level/Entities/Player/UI/Editor）
```

## 已实现能力（v0.3）

- W 轴核心：`WState`、`WRange`、`WSnapResolver`、平滑插值与 snap
- 关卡图：`LevelDefinition` + BFS 路径 + W 门控边
- 关卡生命周期：`LevelSessionState`（NotStarted / Playing / Completed / Failed / Restarting）
- 切片实体：`SliceProfile` + Presenter（Fade/Scale/Shader）
- 玩家：tap 移动、W dial、W-aware movement retry
- 世界交互：`IWorldInteractable`、`WInteractableProfile`、`SliceInteractionModel`、W 区间 HUD hint
- Graph mutation：`LevelGraphMutationController` + restart 回滚（Gate 拉杆）
- HUD / UI：路线提示、教学提示、`LevelOutcomeOverlay`（Next / Retry / Level Select）
- 关卡流转：`LevelCatalog`、`LevelSelect` demo 首页、**N** 下一关、**R** 重开（Playing / Completed / Failed）
- 五关 demo：Garden → Platform → Gate → Chambers → Hazard
- Authoring：`LevelCatalogValidator`、`GrayboxLevelRecipe`、五关 graybox 生成器
- macOS 构建：`./scripts/build-macos.sh` → `WSliceProto/builds/macos/W-Slice.app`
- 测试：EditMode + PlayMode 套件

## 已知限制

- **CI（可选）** — GitHub Actions 已提供 L0/L1 workflow；需在 repo secrets 配置 `UNITY_LICENSE` 等（见 `.github/workflows/wslice-validate.yml`）
- **Unity 验证待执行**：脚本现在要求本次新生成且有实际用例的 XML；退出 0 而缺失 XML 视为失败/未确认。
- **无正式美术/音效**：灰盒 demo，URP Lit 统一材质
- **仅 macOS 构建**：无 Windows / Linux standalone、无签名公证
- **试玩证据待补** — 原五关以 Hazard_05 结束；回响庭院独立结束；尚无五人试玩结果。

## 后续规划（v0.3+）

1. **Unity 实测** — 编译、六关校验、EditMode / PlayMode、macOS 独立应用试玩。
2. **五人试玩** — 按预设门槛检查能否自主理解并完成回响庭院，再决定扩关。
3. **CI 环境** — 已实现验证和测试任务；缺少 Unity license 配置时明确记为 SKIPPED。

Release checklist 见 [`docs/releases/v0.3-wslice-demo.md`](docs/releases/v0.3-wslice-demo.md)。

## 文档索引

- [WSliceProto/README.md](WSliceProto/README.md) — 模块与设计原则
- [WSliceProto/Validation.md](WSliceProto/Validation.md) — 验证命令与 PR 测试记录规范
- [docs/releases/v0.3-wslice-demo.md](docs/releases/v0.3-wslice-demo.md) — v0.3 release checklist
- [docs/releases/v0.2-wslice-demo.md](docs/releases/v0.2-wslice-demo.md) — v0.2 release checklist（历史）
- [ManualTesting.md](WSliceProto/Assets/_Project/Tests/ManualTesting.md) — Edit/Play Mode 测试列表
- [PlayModeSmokeTest.md](WSliceProto/Assets/_Project/Tests/PlayModeSmokeTest.md) — 五关 demo 手动冒烟清单
