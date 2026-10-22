# 4D — W-Slice Puzzle Prototype

W-Slice 玩法实验。核心机制是 **W-Slice**：标量 `w` 控制当前三维截面，玩家靠沿第四维移动来改变几何。

**方向调整（2026-10-15）：** 主线已收敛为纯浏览器小游戏（[`web/geometry-lab/`](web/geometry-lab/)），Unity 工程 `WSliceProto/` 保留为历史参照（停留在 v0.4.0 回响庭院验收状态），不再继续扩展。下文 Unity 相关内容作为历史存档保留。

**当前产品目标：** 让玩家理解 3D 世界是高维结构的截面，并在改变 W 前预测几何变化。当前工作按 mechanic isolation、geometry slice、geometry-driven collision、Impossible Room、playtest 的顺序推进。详见 [`docs/mechanic-validation.md`](docs/mechanic-validation.md)。

## 试玩：W / SLICE 网页小游戏

[`web/geometry-lab/`](web/geometry-lab/) 是当前主线：一个利用第四维空间能力完成行动的网页解谜小游戏。

- **新关卡「中转站」（`?level=station`）**：把晶核送到隔墙另一侧。蓝层插座能持续供电，另一侧的回廊开关会保持开启；晶核的放置、换层和回收共同构成谜题。首页可直接试玩；
- **「无门取物」（`?level=fetch`）**：空手进入锁着的小屋，拿取晶核后寻找能容纳它的出口。放下的晶核留在对应的 `(x, y, z, w)` 位置；完成后可以继续进入中转站；
- **三章 10 关对照流程**：第 0 章「扁平国」、第 1 章「升一维」、第 2 章「只靠截面」（已移除默认流程中的强制预测答题与考试式计分文案）；
- **原理实验室（`?level=lab`，可选）**：保留原 6 道截面变化预测题与截面公式说明，供自愿体验。

暗色发光玻璃美术，五个平行世界「层」各有颜色和花纹，竖直的 W 滑轨，提示分 3 级，进度自动保存。

`WASD` / 方向键按镜头在地面的方向移动，`Q/E` 换层，`空格/F` 拿放晶核或操作机关。拖动转视角、滚轮缩放，“视角复位”恢复取景；`R` 或“重来”重置当前关卡。自动提示只说明当前状态；完整路线需主动点到第三级“查看解法”。

```bash
./scripts/preview-geometry-lab.sh
# 浏览器打开 http://127.0.0.1:4175（?level=1-2 可直接进入某一关）
```

只需要 Python 3 和支持 WebGL 的浏览器，无需 npm install 或 CDN。已有 Node.js 18+ 时可运行测试（包括证明每关都必须用到第四维的搜索测试）：

```bash
node --test web/geometry-lab/tests/*.test.mjs
```

设计依据、几何定义、文件结构与验证记录见 [游戏说明](docs/browser-geometry-lab.md)。

---

## 历史存档：Unity 原型（v0.4.0 回响庭院）

**历史阶段：** v0.4.0 本机独立应用验收通过。`190dd462` 通过 Unity 7 项校验、EditMode 130/130、PlayMode 74/74（含庭院 10/10）及 macOS 构建；同一应用完成三个启动尺寸目标的代理 GUI 回归，庭院共通关 4 次、旧五关各至少 2 次。五名陌生玩家试玩仍为 **0/5，未执行**。证据、尺寸口径和本机应用路径见[本轮运行记录](docs/releases/v0.4-courtyard-runtime.md)。

### 优先试玩：回响庭院

用 Unity **6000.0.77f1** 打开 `WSliceProto`，进入 `LevelSelect`，点击 **开始：回响庭院**；也可直接打开 `Assets/_Project/Level/Scenes/CourtyardSlice.unity` 后 Play。场景已提交，进入 Play 时创建空间表现，不必先运行生成器。

拖动底部滑条切换切片，点击地面落脚点移动。到机关旁点击机关或“启动机关”；“提示”按当前进度逐级揭示。误调切片会返回安全落脚点，可以继续尝试；按 **R** 重开。

制作目标为约 5–10 分钟的观察解谜体验，实际时长尚待验证。机关状态跨切片保留，必须激活后才能到出口完成。

- [实现与试玩说明](docs/courtyard-slice.md)
- [v0.4 测试、构建与桌面验收记录](docs/releases/v0.4-courtyard-runtime.md)
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
| 历史发布锚点 | `main` @ `d6fbea1`（v0.3 release，不代表当前开发版已验证） |

### 1. 打开项目

```bash
# 用 Unity Hub 打开此目录：
WSliceProto/
```

### 2. 生成 / 校验灰盒关卡

在 Unity Editor 菜单：

1. `WSlice → Generate Courtyard Slice` 或 `Generate Garden / Platform / Gate / Chambers / Hazard Graybox` — 开发时生成或刷新对应场景，单独审查生成差异
2. `WSlice → Validate Courtyard Slice` 或 `Validate Garden / Platform / Gate / Chambers / Hazard Graybox` — 校验资产与场景引用
3. `WSlice → Validate Level Catalog` — 校验 catalog 与 Build Settings

场景已入库，正常验证无需 Generate。统一验证脚本覆盖 L0 + 六关 L1 + Catalog：

```bash
./scripts/validate-local.sh
```

### 3. 本地验证

详见 [`WSliceProto/Validation.md`](WSliceProto/Validation.md)（L0–L5 分层清单）。

加 `--tests` 可尝试 L2 EditMode / L3 PlayMode batchmode 测试。

### 4. 手动试玩

进入 Play Mode，从 `LevelSelect` 首页开始，按 [`PlayModeSmokeTest.md`](WSliceProto/Assets/_Project/Tests/PlayModeSmokeTest.md) 完成庭院主线、误调恢复与重开，再回归旧五关。

### 5. macOS 构建

启动场景为 `LevelSelect`（Build Settings 第一项）。从仓库根目录执行：

```bash
./scripts/build-macos.sh
```

脚本默认输出到新的 `WSliceProto/builds/macos/run-<UTC 时间>-<随机后缀>/W-Slice.app`。成功后用 `open` 命令打开控制台 `VERIFIED BUILD ARTIFACT ONLY:` 后打印的本次完整路径，不使用旧产物或猜测最近目录。

`.app` 同级保留 `build-invocation.json`、`build-result.json`、`build.log`、`unity-console.log` 与 `build-info.json`。脚本核对源码快照、产物与 manifest；结果中的 `applicationSmoke: not_run` 表示构建脚本自身未执行 GUI 验收。随后实际启动和通关的结果另按冒烟清单记录。可用 `WSLICE_BUILD_OUTPUT` 指定全新的 `.app` 路径；已有产物或同名证据文件会被拒绝，不覆盖。

Editor 菜单 `WSlice → Build/macOS Standalone` 的默认位置仍为 `WSliceProto/builds/macos/W-Slice.app`，同级生成 `build-info.json`；它不经过脚本的独立运行目录及完整证据核验流程。

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

## 当前实现（v0.4.0 可构建候选）

- W 轴核心：`WState`、`WRange`、`WSnapResolver`、平滑插值与 snap
- 关卡图：`LevelDefinition` + BFS 路径 + W 门控边
- 关卡生命周期：`LevelSessionState`（NotStarted / Playing / Completed / Failed / Restarting）
- 切片实体：`SliceProfile` + Presenter（Fade/Scale/Shader）
- 玩家：tap 移动、W dial、W-aware movement retry
- 世界交互：`IWorldInteractable`、`WInteractableProfile`、`SliceInteractionModel`；玩家反馈不显示精确 W 区间
- Graph mutation：`LevelGraphMutationController` + restart 回滚（Gate 拉杆）
- HUD / UI：中性切片反馈、`LevelOutcomeOverlay`（Next / Retry / Level Select）；路线、W 区间和 PathPreview 只供显式 Developer Debug 使用
- 关卡流转：`LevelCatalog`、`LevelSelect` demo 首页、**N** 下一关、**R** 重开（Playing / Completed / Failed）
- 回响庭院：位置约束机关、显式锁边、跨切片状态、条件完成、可恢复误调与中文按需提示；独立试玩结束后可回首页
- 原五关回归：Garden → Platform → Gate → Chambers → Hazard
- Authoring：`LevelCatalogValidator`、`GrayboxLevelRecipe`、庭院和原五关生成器
- macOS 构建：`./scripts/build-macos.sh` 创建独立运行目录并核验产物，实际路径以脚本打印为准
- 测试：EditMode + PlayMode 套件

## 已知限制

- **CI（可选）** — GitHub Actions 已提供 L0/L1 workflow；需在 repo secrets 配置 `UNITY_LICENSE` 等（见 `.github/workflows/wslice-validate.yml`）
- **验收边界**：当前通过的是本机代理 GUI 回归，不能替代陌生玩家理解度；历史失败和退出阶段 Mono 提示保留在本轮运行记录。
- **无正式美术/音效**：灰盒 demo，URP Lit 统一材质
- **仅 macOS 构建**：无 Windows / Linux standalone、无签名公证
- **试玩证据待补** — 原五关以 Hazard_05 结束；回响庭院独立结束；尚无五人试玩结果。
- **显示验收范围** — M4 外接 S27C900P，5120×2880 物理像素、2560×1440 点 HiDPI；通过 1280×720、1440×900、1920×1080 预期逻辑尺寸启动目标的 GUI 检查，缩放截图尺寸另记。Garden 末段已修为有支撑的斜坡。

## 下一步（v0.4.0 验证与试玩）

1. **五人试玩** — 使用已验收候选，按预设门槛检查能否自主理解并完成回响庭院，再决定扩关。
2. **候选交接** — 保留 `190dd462` 应用与证据；源码变更后重新测试、构建并复验，交付文档提交单独记录。
3. **CI 环境** — 已实现验证和测试任务；缺少 Unity license 配置时明确记为 SKIPPED。

历史 v0.3 release checklist 见 [`docs/releases/v0.3-wslice-demo.md`](docs/releases/v0.3-wslice-demo.md)，不能替代当前开发版的验证记录。

## 文档索引

- [docs/browser-geometry-lab.md](docs/browser-geometry-lab.md) — 浏览器主线小游戏设计与验证说明
- [docs/mechanic-validation.md](docs/mechanic-validation.md) — 产品假设、实验顺序与 gameplay gates
- [WSliceProto/README.md](WSliceProto/README.md) — 模块与设计原则
- [WSliceProto/Validation.md](WSliceProto/Validation.md) — 验证命令与 PR 测试记录规范
- [docs/releases/v0.4-courtyard-runtime.md](docs/releases/v0.4-courtyard-runtime.md) — 本轮真实测试、构建与 GUI 验收边界
- [docs/releases/v0.3-wslice-demo.md](docs/releases/v0.3-wslice-demo.md) — v0.3 release checklist（历史）
- [docs/releases/v0.2-wslice-demo.md](docs/releases/v0.2-wslice-demo.md) — v0.2 release checklist（历史）
- [ManualTesting.md](WSliceProto/Assets/_Project/Tests/ManualTesting.md) — Edit/Play Mode 测试列表
- [PlayModeSmokeTest.md](WSliceProto/Assets/_Project/Tests/PlayModeSmokeTest.md) — 庭院主线与旧五关手动冒烟清单
