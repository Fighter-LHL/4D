# 4D — W-Slice Puzzle Prototype

Unity 早期 playable prototype，核心机制是 **W-Slice**：标量 `w ∈ [0,1]` 控制物体显隐、路径可达性与交互反馈。

**当前阶段：** Prototype v0.2 — 三关 demo（Garden / Platform / Gate）、选关与下一关流程、macOS standalone 构建。

## 快速开始

| 项 | 值 |
|---|---|
| Unity 版本 | **6000.0.77f1**（Unity 6 LTS） |
| 项目路径 | [`WSliceProto/`](WSliceProto/) |
| 启动场景 | `LevelSelect`（Build Settings 第一项） |
| 关卡顺序 | Garden_01 → Platform_01 → Gate_03 |
| Baseline | `main` @ `c3a90b0`（v0.2 release hardening 锚点） |

### 1. 打开项目

```bash
# 用 Unity Hub 打开此目录：
WSliceProto/
```

### 2. 生成 / 校验灰盒关卡

在 Unity Editor 菜单：

1. `WSlice → Generate Garden / Platform / Gate Graybox` — 生成或刷新对应场景
2. `WSlice → Validate Garden / Platform / Gate Graybox` — 校验资产与场景引用

或一键脚本（L0 + 三关 L1）：

```bash
./scripts/validate-local.sh
```

### 3. 本地验证

详见 [`WSliceProto/Validation.md`](WSliceProto/Validation.md)（L0–L5 分层清单）。

加 `--tests` 可尝试 L2 EditMode / L3 PlayMode batchmode 测试。

### 4. 手动试玩

进入 Play Mode，从 `LevelSelect` 开始，按 [`PlayModeSmokeTest.md`](WSliceProto/Assets/_Project/Tests/PlayModeSmokeTest.md) 走三关 demo 流程。

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

## 已实现能力（v0.2）

- W 轴核心：`WState`、`WRange`、`WSnapResolver`、平滑插值与 snap
- 关卡图：`LevelDefinition` + BFS 路径 + W 门控边
- 关卡生命周期：`LevelSessionState`（NotStarted / Playing / Completed / Failed / Restarting）
- 切片实体：`SliceProfile` + Presenter（Fade/Scale/Shader）
- 玩家：tap 移动、W dial、W-aware movement retry
- 世界交互：`IWorldInteractable`、`SliceInteractionModel`、W 门控 tap 交互
- HUD：`HUDState` / `WDialModel`、路线提示、失败原因文案、`WDialTrack` 色带
- 关卡流转：`LevelCatalog`、`LevelSelect` 选关、完成后 **N** 下一关、**R** 重开（Playing / Completed / Failed）
- 三关 demo：Garden（缺口/楼梯）→ Platform（W-offset 平台）→ Gate（拉杆解锁 + 移动中断失败）
- 编辑器：三关 graybox 生成器、`GrayboxVisual` 统一材质、Gizmos、Preview 窗口
- macOS 构建：`./scripts/build-macos.sh` 或 Editor 菜单 → `WSliceProto/builds/macos/W-Slice.app`
- 测试：EditMode + PlayMode 套件（需在 Editor 或有效 license 下运行）

## 已知限制

- **无 CI**：GitHub Actions 未配置；测试结果需本地或 PR 中手动记录
- **batchmode 测试不稳定**：`-runTests` 有时退出 0 但不产出 XML（见 Validation.md）
- **无正式美术/音效**：灰盒 demo，URP Lit 统一材质
- **仅 macOS 构建**：无 Windows / Linux standalone、无签名公证

## 后续规划（v0.3+）

1. **Demo polish** — 完成/失败 overlay UI、Playing 状态下可重开、每关教学提示、LevelSelect 首页
2. **Authoring hardening** — `LevelCatalog` 校验器、graph mutation 规范化、interactable profile 化、graybox recipe
3. **Content expansion** — 第四关 multi-room W sequence、第五关 hazard platform（框架稳定后再加）

Release checklist 见 [`docs/releases/v0.2-wslice-demo.md`](docs/releases/v0.2-wslice-demo.md)。

## 文档索引

- [WSliceProto/README.md](WSliceProto/README.md) — 模块与设计原则
- [WSliceProto/Validation.md](WSliceProto/Validation.md) — 验证命令与 PR 测试记录规范
- [docs/releases/v0.2-wslice-demo.md](docs/releases/v0.2-wslice-demo.md) — v0.2 release checklist
- [ManualTesting.md](WSliceProto/Assets/_Project/Tests/ManualTesting.md) — Edit/Play Mode 测试列表
- [PlayModeSmokeTest.md](WSliceProto/Assets/_Project/Tests/PlayModeSmokeTest.md) — 三关 demo 手动冒烟清单
