# 4D — W-Slice Puzzle Prototype

W-Slice 玩法实验。核心机制是 **W-Slice**：标量 `w` 控制当前三维截面，玩家靠沿第四维移动来改变几何。

**方向调整（2026-10-15）：** 主线已收敛为纯浏览器小游戏（`web/geometry-lab/`），Unity 工程 `WSliceProto/` 保留为历史参照，不再维护。下文 Unity 相关内容仅作存档。

**历史阶段：** Intended Engineering Baseline。五关 demo、LevelSelect、restart、测试和 macOS build 曾预期共同构成机制实验底座；随着方向调整，浏览器原型取代 Unity 成为玩法验证载体。

**当前产品目标：** 让玩家理解 3D 世界是高维结构的截面，并在改变 W 前预测几何变化。当前工作按 mechanic isolation、geometry slice、geometry-driven collision、Impossible Room、playtest 的顺序推进。详见 [`docs/mechanic-validation.md`](docs/mechanic-validation.md)。

## 不安装 Unity，先试玩切片实验

独立的 [浏览器几何实验](web/geometry-lab/) 是当前主线：观察真实四维超球的三维截面，并练习预测变化。支持单个超球、W 方向错位的双球、旋转视角、六轮预测挑战，以及两个可玩关卡——"截面通道"（两堵 W 错位的墙）和"不可能的密室"（三维封死、只有换 W 才能走出）。关卡墙体是四维超立方体的三维截面墙板，光点的移动合法性完全由当前截面几何决定。

```bash
./scripts/preview-geometry-lab.sh
# 浏览器打开 http://127.0.0.1:4175
```

启动只需要 Python 3 和支持 WebGL 的浏览器，无需 Unity、npm install 或 CDN。已有 Node.js 18+ 时，可运行几何与挑战逻辑测试：

```bash
node --test web/geometry-lab/tests/geometry.test.mjs
```

这是独立的玩法实验，尚未接入 Unity 五关、碰撞或移动系统。计算、操作和验证范围见 [浏览器实验说明](docs/browser-geometry-lab.md)。

## 快速开始

| 项 | 值 |
|---|---|
| Unity 版本 | **6000.0.77f1**（Unity 6 LTS） |
| 项目路径 | [`WSliceProto/`](WSliceProto/) |
| 启动场景 | `LevelSelect`（Build Settings 第一项） |
| 关卡顺序 | Garden_01 → Platform_01 → Gate_03 → Chambers_04 → Hazard_05 |
| Pre-isolation baseline | `b719b3a` |

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
- 世界交互：`IWorldInteractable`、`WInteractableProfile`、`SliceInteractionModel`；玩家反馈不显示精确 W 区间
- Graph mutation：`LevelGraphMutationController` + restart 回滚（Gate 拉杆）
- HUD / UI：中性切片反馈、`LevelOutcomeOverlay`（Next / Retry / Level Select）；路线、W 区间和 PathPreview 只供显式 Developer Debug 使用
- 关卡流转：`LevelCatalog`、`LevelSelect` demo 首页、**N** 下一关、**R** 重开（Playing / Completed / Failed）
- 五关 demo：Garden → Platform → Gate → Chambers → Hazard
- Authoring：`LevelCatalogValidator`、`GrayboxLevelRecipe`、五关 graybox 生成器
- macOS 构建：`./scripts/build-macos.sh` → `WSliceProto/builds/macos/W-Slice.app`
- 测试：EditMode + PlayMode 套件

## 已知限制

- **CI（可选）** — GitHub Actions 已提供 L0/L1 workflow；需在 repo secrets 配置 `UNITY_LICENSE` 等（见 `.github/workflows/wslice-validate.yml`）
- **测试证据必须可核验**：当前脚本把缺失/无效 XML 判为失败；无法产出 XML 时须保存 Editor Test Runner 结果（见 Validation.md）
- **无正式美术/音效**：灰盒 demo，URP Lit 统一材质
- **仅 macOS 构建**：无 Windows / Linux standalone、无签名公证
- **五关 demo** — Hazard_05 为当前最后一关；无存档，CI workflow 也未配置 Unity license secrets
- **尚无玩法证据**：compile、测试和 build 不能证明玩家理解、预测或迁移 W-Slice 心智模型

## 当前实验顺序

1. **Mechanic Isolation**：玩家默认移除 route 与正确 W 区间 oracle
2. **FourD Geometry Lab**：用统一 4D 定义生成连续 3D 截面
3. **Geometry-driven Collider**：让截面决定碰撞与通路
4. **Impossible Room**：验证空间绕行是否形成可解释的 aha moment
5. **Playtest**：记录 discoverability、causality、prediction、exploitation、transfer 后再做产品判断

Release checklist 见 [`docs/releases/v0.3-wslice-demo.md`](docs/releases/v0.3-wslice-demo.md)。

## 文档索引

- [WSliceProto/README.md](WSliceProto/README.md) — 模块与设计原则
- [WSliceProto/Validation.md](WSliceProto/Validation.md) — 验证命令与 PR 测试记录规范
- [docs/mechanic-validation.md](docs/mechanic-validation.md) — 当前产品假设、实验顺序与 gameplay gates
- [docs/releases/v0.3-wslice-demo.md](docs/releases/v0.3-wslice-demo.md) — v0.3 release checklist
- [docs/releases/v0.2-wslice-demo.md](docs/releases/v0.2-wslice-demo.md) — v0.2 release checklist（历史）
- [ManualTesting.md](WSliceProto/Assets/_Project/Tests/ManualTesting.md) — Edit/Play Mode 测试列表
- [PlayModeSmokeTest.md](WSliceProto/Assets/_Project/Tests/PlayModeSmokeTest.md) — 五关 demo 手动冒烟清单
