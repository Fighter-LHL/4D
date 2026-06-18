# 4D — W-Slice Puzzle Prototype

Unity 早期 playable prototype，核心机制是 **W-Slice**：标量 `w ∈ [0,1]` 控制物体显隐、路径可达性与交互反馈。

**当前阶段：** Prototype v0.2 — 三关 demo（Garden / Platform / Gate）、选关与下一关流程、macOS standalone 构建。

## 快速开始

| 项 | 值 |
|---|---|
| Unity 版本 | **6000.0.77f1**（Unity 6 LTS） |
| 项目路径 | [`WSliceProto/`](WSliceProto/) |
| 参考关卡 | Garden_01（`GardenGraybox.unity`） |
| Baseline | `main` @ `e0e88ab`（PR #1 合并后） |

### 1. 打开项目

```bash
# 用 Unity Hub 打开此目录：
WSliceProto/
```

### 2. 生成 / 校验第一关

在 Unity Editor 菜单：

1. `WSlice → Generate Garden Graybox` — 生成或刷新灰盒场景
2. `WSlice → Validate Garden Graybox` — 校验资产与场景引用

### 3. 本地验证

```bash
./scripts/validate-local.sh
```

详见 [`WSliceProto/Validation.md`](WSliceProto/Validation.md)。

### 4. 手动试玩

进入 Play Mode，从 `LevelSelect` 或单关场景开始，按 [`PlayModeSmokeTest.md`](WSliceProto/Assets/_Project/Tests/PlayModeSmokeTest.md) 走一遍。

### 5. macOS 构建

启动场景为 `LevelSelect`（Build Settings 第一项）。也可在 Editor 菜单使用 `WSlice → Build/macOS Standalone`。

```bash
chmod +x scripts/build-macos.sh   # 首次
./scripts/build-macos.sh
open WSliceProto/builds/macos/W-Slice.app
```

## 仓库结构

```
4D/
├── README.md                 ← 本文件（仓库入口）
├── scripts/
│   ├── validate-local.sh     ← 本地 compile + validate 脚本
│   └── build-macos.sh        ← macOS standalone 构建
└── WSliceProto/              ← Unity 工程根目录
    ├── README.md             ← 模块说明与设计原则
    ├── Validation.md         ← 验证清单与已知限制
    └── Assets/_Project/      ← 游戏代码（Core/Level/Entities/Player/UI/Editor）
```

## 已实现能力（v0.1）

- W 轴核心：`WState`、`WRange`、`WSnapResolver`、平滑插值与 snap
- 关卡图：`LevelDefinition` + BFS 路径 + W 门控边
- 切片实体：`SliceProfile` + Presenter（Fade/Scale/Shader）
- 玩家：tap 移动、W dial、W-aware movement retry
- HUD：`HUDState` / `WDialModel`、路线提示、失败原因文案、`WDialTrack` 色带
- 编辑器：灰盒生成器、`GrayboxVisual` 统一材质、Gizmos、Preview 窗口
- 三关 demo：`LevelSelect` → Garden / Platform / Gate，完成可 **N** 下一关、**R** 重开
- macOS 构建：`./scripts/build-macos.sh` → `WSliceProto/builds/macos/W-Slice.app`
- 测试：EditMode + PlayMode 套件（需在 Editor 或有效 license 下运行）

## 已知限制

- **无 CI**：GitHub Actions 未配置；测试结果需本地或 PR 中手动记录
- **batchmode 测试不稳定**：`-runTests` 有时退出 0 但不产出 XML（见 Validation.md）

## 后续规划

按阶段推进，下一批 PR 优先级：

1. `docs/baseline-readme-validation` — README / 验证清单（本阶段）
2. `feat/level-session-state` — 关卡生命周期状态机
3. `feat/objective-complete-restart` — 目标检测与重开
4. `feat/runtime-path-preview` — 场景内路径可达性可视化
5. `refactor/garden-generator-builders` — 拆分生成器
6. `feat/level-definition-inspector` — 关卡资产 Inspector
7. `feat/second-level-offset-platform` — 第二关
8. `feat/level-flow-select` — 关卡目录、选关场景、完成后的下一关（N 键）
9. `feat/phase-d-gate-interactable` — W 门控机关、第三关多段 W 谜题、移动中断失败态
10. `feat/phase-e-macos-build-visual` — macOS standalone 构建 + 灰盒视觉统一

完整评估与阶段说明见团队内部 roadmap 文档。

## 文档索引

- [WSliceProto/README.md](WSliceProto/README.md) — 模块与设计原则
- [WSliceProto/Validation.md](WSliceProto/Validation.md) — 验证命令与 PR 测试记录规范
- [ManualTesting.md](WSliceProto/Assets/_Project/Tests/ManualTesting.md) — Edit/Play Mode 测试列表
- [PlayModeSmokeTest.md](WSliceProto/Assets/_Project/Tests/PlayModeSmokeTest.md) — 手动冒烟清单
