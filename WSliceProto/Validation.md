# W-Slice 本地验证清单

本文档把 compile、Garden graybox 校验、自动化测试、手动冒烟分层说明，便于新开发者 clone 后按同一流程验证。

**Unity 版本：** `6000.0.77f1`（见 `ProjectSettings/ProjectVersion.txt`）

**Baseline commit：** `e0e88ab`（PR #1: HUD state protocol 合并后）

---

## 验证层级

| 层级 | 做什么 | 必须通过？ |
|---|---|---|
| L0 Compile | batchmode 打开项目并编译脚本 | 是 |
| L1 Validate | `WSlice.Validate Garden Graybox` | 是 |
| L2 EditMode | 纯逻辑单元测试 | 是（有 license 时） |
| L3 PlayMode | Garden 场景集成测试 | 是（有 license 时） |
| L4 Smoke | 手动 Play Mode 试玩 | 发布前建议 |

---

## 一键脚本（推荐）

仓库根目录：

```bash
./scripts/validate-local.sh
```

默认执行 **L0 + L1**。加 `--tests` 尝试 **L2 + L3**（需要有效 Unity license 且 batchmode 测试可用）。

环境变量：

| 变量 | 默认 | 说明 |
|---|---|---|
| `UNITY_PATH` | macOS Hub 路径 | Unity 可执行文件 |
| `PROJECT_PATH` | `WSliceProto/` | 相对仓库根 |

---

## L0 — 脚本编译

```bash
/Applications/Unity/Hub/Editor/6000.0.77f1/Unity.app/Contents/MacOS/Unity \
  -projectPath "$(pwd)" \
  -quit -batchmode -nographics \
  -logFile -
```

**预期：** 日志含 `Tundra build success`，退出码 `0`。

---

## L1 — Garden Graybox 校验

Editor 菜单：`WSlice → Validate Garden Graybox`

或 batchmode：

```bash
/Applications/Unity/Hub/Editor/6000.0.77f1/Unity.app/Contents/MacOS/Unity \
  -projectPath "$(pwd)" \
  -executeMethod WSlice.Editor.GardenGrayboxGenerator.Validate \
  -quit -batchmode -nographics \
  -logFile -
```

**预期：** 日志含 `GardenGraybox validation passed.`，退出码 `0`。

校验内容：SliceProfile 资产、场景对象引用、`LevelRuntime` / `PlayerInput` / HUD / WDial 组件等。

---

## L2 — Edit Mode 测试

Editor：`Window → General → Test Runner → Edit Mode → Run All`

命令行：

```bash
/Applications/Unity/Hub/Editor/6000.0.77f1/Unity.app/Contents/MacOS/Unity \
  -projectPath "$(pwd)" \
  -runTests -testPlatform EditMode \
  -testResults TestResults/editmode-results.xml \
  -quit -batchmode -nographics \
  -logFile -
```

**预期套件：**

- `WRangeTests`, `WConditionTests`, `WStateTests`, `WSnapResolverTests`
- `LevelGraphRuntimeTests`, `LevelDefinitionValidatorTests`
- `WDialModelTests`, `PlayerHUDModelTests`, `WDialTrackModelTests`

**已知问题：** 部分环境 `-runTests` 退出 `0` 但不生成 XML。若 XML 缺失，必须在 Unity Editor Test Runner 中手动 Run All 并记录结果。

---

## L3 — Play Mode 测试

Editor：`Test Runner → Play Mode → Run All`

命令行：

```bash
/Applications/Unity/Hub/Editor/6000.0.77f1/Unity.app/Contents/MacOS/Unity \
  -projectPath "$(pwd)" \
  -runTests -testPlatform PlayMode \
  -testResults TestResults/playmode-results.xml \
  -quit -batchmode -nographics \
  -logFile -
```

**预期套件：**

- `GardenGrayboxBehaviorTests`
- `GardenGrayboxMovementTests`
- `SliceEntityPlayModeTests`
- `WDialViewPlayModeTests`

---

## L4 — 手动冒烟

按 [`Assets/_Project/Tests/PlayModeSmokeTest.md`](Assets/_Project/Tests/PlayModeSmokeTest.md)：

1. 打开 `GardenGraybox` 场景，进入 Play Mode
2. W=0：墙可见，缺口/楼梯不可见，Outside→Gap 不可走
3. W≈0.55：缺口出现，可进入花园
4. W≈0.85：楼梯出现，可上到 `FlowerTop`
5. HUD 显示路线提示 / 失败原因；WDialTrack 色带与边区间一致

---

## PR 测试记录规范

每个改动 WSlice 代码的 PR，body 中应包含：

```markdown
## Test plan

- Unity: 6000.0.77f1
- L0 Compile: Pass / Fail / Not run
- L1 Validate Garden Graybox: Pass / Fail / Not run
- L2 EditMode: Pass / Fail / Not run (N/N tests) — Editor manual if batchmode skipped
- L3 PlayMode: Pass / Fail / Not run (N/N tests)
- L4 Smoke: Pass / Fail / Not run
```

不要求把 XML 提交进仓库，但必须写清实际执行方式（batchmode 或 Editor 手动）。

---

## 生成场景（开发用）

修改生成器或关卡数据后：

1. `WSlice → Generate Garden Graybox`
2. `WSlice → Validate Garden Graybox`
3. 重新跑 L2/L3 或至少 L4

---

## 当前能力边界（v0.1）

- 有：W 机制、Garden_01 灰盒、HUD/WDial 语义反馈、移动失败与路线提示
- 无：关卡完成状态机、重开、下一关、CI、standalone build

下一里程碑：完整 playable loop（到达目标 → Completed → Restart）。
