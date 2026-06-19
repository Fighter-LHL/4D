# Play Mode Smoke Test — v0.3 四关 Demo

验证 **LevelSelect → Garden → Platform → Gate → Chambers** 完整 demo 流程。

## 准备

1. 运行 `./scripts/validate-local.sh`（或 Editor 菜单 Validate 四关 graybox + catalog）。
2. 确认 Build Settings 启用顺序：`LevelSelect` → `GardenGraybox` → `PlatformGraybox` → `GateGraybox` → `ChambersGraybox`。
3. 打开 `Assets/_Project/Level/Scenes/LevelSelect.unity`（或任意单关场景）。

---

## Part 0 — LevelSelect

1. 进入 Play Mode（或启动 macOS build）。
2. 应看到标题 **W-Slice Demo**、副标题、左下 **v0.3.0**、右下 **Quit**。
3. 四个关卡按钮显示中文名 + 英文教学主题。
4. 点击各按钮应加载对应 graybox 场景。

---

## Part 1 — Garden_01（W 门控缺口与楼梯）

（同 v0.2；含教学提示首次交互后消失、Playing **R** 重开、Completed overlay/**N**。）

---

## Part 2 — Platform_01（W-offset 平台）

（同 v0.2；Completed 后 **N** → Gate。）

---

## Part 3 — Gate_03（W 门控交互 + 移动失败）

1. 拉杆解锁 GateRoom→Goal；移动中 W 关闭 → **Failed**；**R** 重开。
2. Completed 后 **N** → Chambers（第四关）。

---

## Part 4 — Chambers_04（multi-room W sequence）

1. 进入 `ChambersGraybox`。
2. 在 W≈0.55 时无法从 Lobby 进入 ChamberA（首段走廊需低 W）。
3. 依次调 W：低 W 进 ChamberA → 中 W 进 ChamberB → 高 W 进 Goal。
4. Completed 后 **N** 无下一关（当前 demo 最后一关）。

---

## Part 5 — macOS Build 冒烟（L5）

```bash
./scripts/build-macos.sh
open WSliceProto/builds/macos/W-Slice.app
```

1. 启动后首先进入 LevelSelect demo 首页。
2. 走一遍 Part 0–4 的核心路径。
3. 检查 `WSliceProto/builds/macos/build-info.json`：
   - `version`: `0.3.0`
   - `enabledScenes` 含 LevelSelect + 四关 graybox

---

## 快捷键（v0.3）

| 键 | 作用 |
|---|---|
| **R** | 重开（Playing / Completed / Failed） |
| **N** | 下一关（Completed 且有 catalog 下一项） |

## 自动化替代（L4 部分项）

若无法手动冒烟，可先跑：

```bash
./scripts/validate-local.sh --tests
```

PlayMode 套件覆盖：LevelSelect 首页、`Garden`/`Platform`/`Gate`/`Chambers` 核心机制、`LevelFlow` 下一关链。
