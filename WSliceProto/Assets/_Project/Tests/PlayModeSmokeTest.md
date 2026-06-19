# Play Mode Smoke Test — v0.3 三关 Demo

验证 **LevelSelect → Garden → Platform → Gate** 完整 demo 流程。单关细节以 Garden 为最完整示例；Platform / Gate 侧重各自机制。

## 准备

1. 运行 `./scripts/validate-local.sh`（或 Editor 菜单 Validate 三关 graybox）。
2. 确认 Build Settings 启用顺序：`LevelSelect` → `GardenGraybox` → `PlatformGraybox` → `GateGraybox`。
3. 打开 `Assets/_Project/Level/Scenes/LevelSelect.unity`（或任意单关场景）。

---

## Part 0 — LevelSelect

1. 进入 Play Mode（或启动 macOS build）。
2. 应看到标题 **W-Slice Demo**、副标题、左下 **v0.3.0**、右下 **Quit**。
3. 三个关卡按钮显示中文名 + 英文教学主题（如 gaps / platform / interact）。
4. 点击各按钮应加载 `GardenGraybox` / `PlatformGraybox` / `GateGraybox`。

---

## Part 1 — Garden_01（W 门控缺口与楼梯）

### 场景准备

1. 打开 `GardenGraybox.unity`（或从 LevelSelect 进入）。
2. 可选：`WSlice → Generate Garden Graybox` + `Validate Garden Graybox`。

### 测试步骤

1. 进入 Play Mode。
2. 拖动 `WDialSlider` 到 W≈0.55：
   - `GardenWall_GapSegment` 应出现。
   - `WDialTrack` 显示 snap tick 与当前/目标 W。
3. 点击缺口内部地面 → 角色从 `Outside` 经 `Gap` 到 `InsideGarden`。
4. 回到低 W，再点缺口 → 角色留在 `Outside`；HUD 显示 `No path at this W.` 及 W 区间提示。
5. 移动穿过缺口时，把 W 拖到会关闭缺口的位置 → HUD 显示移动断边风险；WDialTrack 进入危险色。
6. W≈0.80 → `HiddenStair` 出现。
7. 点击 `FlowerTop` → 角色登上花台；HUD 显示 **Level Complete!**
8. 按 **N** → 加载 Platform 关（若从 LevelSelect 单关进入，确认 next-level 行为；Completed 后 **N** 有效）。

### 预期

- 正确 W 下可进花园并登顶。
- HUD / WDialTrack / DebugOverlay 反馈一致。

---

## Part 2 — Platform_01（W-offset 平台）

1. 进入 `PlatformGraybox`（Completed 后 **N** 或 LevelSelect）。
2. 初始 W 较低时，West→East 边不可通行（平台未对齐）。
3. 调整 W 到平台与 East 对齐的区间（约 W∈[0.45, 0.65]）→ West→East 可走。
4. 从 West 点击 East 侧目标 → 角色移动并完成关卡。
5. Completed 后按 **N** → 加载 Gate 关。

### 预期

- 平台随 W 上升；仅在正确 W 区间可横穿。
- 错误 W 下 tap 移动失败并有 HUD 提示。

---

## Part 3 — Gate_03（W 门控交互 + 移动失败）

1. 进入 `GateGraybox`。
2. 未拉杆时，GateRoom→Goal 不可通行；直接点 Goal 无法到达。
3. W≈0.55 时点击 lever → 拉杆激活，GateRoom→Goal 边在配置 W 区间解锁。
4. W 过低时点击 lever → HUD 显示 `NotInteractiveAtCurrentW`（或类似不可交互反馈）。
5. 拉杆解锁后移动到 Goal → **Level Complete!**（最后一关，**N** 无下一关或提示全部完成）。
6. **失败路径：** 移动过程中把 W 改到路径关闭 → session 进入 **Failed**；HUD 显示移动中断原因。
7. Failed 后按 **R** → 回到 Entry，`InitialW` 重置，lever 与 graph 恢复初始状态。

### 预期

- 必须在中 W 拉杆才能通关。
- Failed 后 **R** 可重开；Completed 后 **R** 也可重开当前关。

---

## Part 4 — macOS Build 冒烟（L5）

```bash
./scripts/build-macos.sh
open WSliceProto/builds/macos/W-Slice.app
```

1. 启动后首先进入 LevelSelect。
2. 走一遍 Part 0–3 的核心路径（至少每关能加载并完成一次）。
3. 检查 `WSliceProto/builds/macos/build-info.json`：
   - `bundleVersion`: `0.3.0`
   - `enabledScenes` 含 LevelSelect、Garden、Platform、Gate

---

## 快捷键（v0.3）

| 键 | 作用 |
|---|---|
| **N** | Completed 后加载下一关 |
| **R** | Playing / Completed / Failed 后重开当前关 |

---

## 常见问题

- **角色不动：** 检查 `PlayerCharacter.CurrentNodeId` 与 ground Collider。
- **缺口/平台/门不显现：** 运行对应 Generate + Validate；检查 SliceProfile 与 W 区间。
- **Gate lever 无反应：** 确认 W 在 interactable 有效区间（约 0.45–0.55）。
- **按 R 无反应：** 确认 session 不是 NotStarted / Restarting；Playing / Completed / Failed 均可重开。

Legacy Garden 单关详细引用检查见历史 commit；日常验证以 Generate/Validate 菜单为准。
