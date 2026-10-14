# Play Mode Smoke Test — v0.3.x 五关 Demo

验证 **LevelSelect → Garden → Platform → Gate → Chambers → Hazard** 完整 demo 流程。

## 准备

1. 运行 `./scripts/validate-local.sh`（或 Editor 菜单 Validate 五关 graybox + catalog）。
2. 确认 Build Settings 启用顺序：`LevelSelect` → 五关 graybox（Garden / Platform / Gate / Chambers / Hazard）。
3. 打开 `Assets/_Project/Level/Scenes/LevelSelect.unity`（或任意单关场景）。
4. 在 Unity Editor 中确认五关 `DebugText` 上的 `DebugOverlay.showDeveloperDebug` 保持关闭。

---

## Part 0 — LevelSelect

1. 进入 Play Mode（或启动 macOS build）。
2. 应看到标题 **W-Slice Demo**、副标题、左下 **v0.3.0**、右下 **Quit**。
3. 关卡按钮不显示 W 方向、区间或路线解法。
4. 点击各按钮应加载对应 graybox 场景。

---

## Part A — Mechanic Isolation

按 Garden → Platform → Gate → Chambers → Hazard 逐关执行玩家模式检查：

1. 世界中没有红绿 PathPreview，左上没有 DebugText。
2. W 轨道只显示 current/target marker，不显示 authored snap ticks、edge bands 或危险预告。
3. 在当前截面点击不可达目标，HUD 说明目标在本截面不连通，不显示 W 数字区间或 graph 节点名。
4. 在 Gate 的不可交互截面点击拉杆，HUD 不显示精确 WRange。

每一关都仅在 Unity Editor Play Mode 中选中 `DebugText`，开启 `DebugOverlay.showDeveloperDebug`：

1. PathPreview、DebugText、snap ticks、edge bands、route/WRange hint 与危险预告一起恢复。
2. 记录 current/target W、graph、玩家 world position、当前节点和 session。
3. 关闭开关，确认 PathPreview、DebugText、snap ticks、edge bands、route/WRange hint 与危险预告再次清空。
4. 对比记录，确认 W、graph、玩家位置、当前节点和 session 未变，再进入下一关。

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

（依次调 W 穿过三间房；Completed 后 **N** → Hazard。）

---

## Part 5 — Hazard_05（hazard platform + 移动中断）

1. 进入 `HazardGraybox`。
2. 根据平台几何变化寻找可通行截面，不读取数值答案或路线提示。
3. 移动过程中改变 W 使截面断开 → session **Failed**，玩家回到 West。
4. Failed 后 **R** 重开；Completed 后无下一关（demo 最后一关）。

---

## Part 6 — macOS Build 冒烟（L5）

```bash
./scripts/build-macos.sh
open WSliceProto/builds/macos/W-Slice.app
```

1. 启动后首先进入 LevelSelect demo 首页。
2. 走一遍 Part 0–5 的核心路径。
3. 确认 build 保持玩家模式，且没有 runtime Developer Debug 入口。
4. 检查 `WSliceProto/builds/macos/build-info.json`：
   - `version`: `0.3.0`
   - `enabledScenes` 含 LevelSelect + 五关 graybox

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

PlayMode 套件覆盖：LevelSelect 首页、五关核心机制、`LevelFlow` 下一关链。
