# W-Slice Mechanic Validation

## North star

玩家应把当前 3D 世界理解为高维结构的截面。他们需要在改变 W 前预测几何、开口或连接将如何变化，并把这套心智模型迁移到新布局。

通关只说明规则可以被试出。Prediction 与 Transfer 决定团队是否继续投入核心 mechanic。

## Engineering baseline

`main` 的五关 graybox、LevelGraph、WState、LevelSession、restart、HUD、测试和 macOS build 被定位为预期工程底座。任何分支引用它作为 regression baseline 前，都必须确认场景 wiring、Compile、五关规则与 build 实际通过；产品定位本身不是稳定性证据。团队保留这些能力用于 regression，并暂停 objective framework、save system、更多同类关卡、通用 validator、跨平台 build 和 production art。

新的实验从独立 scene 或窄 spike 开始。legacy 五关无需为架构统一而重写。

## 当前实验顺序

| 阶段 | 要回答的问题 | 完成条件 |
|---|---|---|
| A. Mechanic Isolation | 能否从五关默认玩家面移除 solution oracle，同时保留开发诊断和既有玩法规则？ | 玩家模式隐藏 solution oracle，显式 Developer Debug 可恢复诊断，五关规则保持不变 |
| B. FourD Geometry Lab | 一个最小 4D 定义能否产生连续且可读的 3D 截面？ | 一个 hypersphere 从不存在到增大、缩小、消失，且变化来自统一 4D 定义 |
| C. Geometry-driven Collider | movement legality 能否来自截面 geometry？ | 一个通路由当前 collider 决定，不读取 WRange graph edge |
| D. Impossible Room | 玩家能否用高维方向绕过 3D 封闭障碍？ | 玩家能说明通过原因，关卡不提供 route、数值 W 答案或文字解法 |
| E. Playtest | 玩家是否形成预测和迁移？ | 按 G0–G4 记录观察，再给出 GO、MODIFY 或 ABANDON 建议 |

每个 PR 只回答表中的一个主要问题。

阶段 A 只建立可测的无 oracle 基线。它不提供 G0–G4 的 comprehension、prediction 或 transfer 证据。

## Player 与 Developer Debug 合同

玩家模式保留 W 操作、当前与目标位置、世界几何反馈、失败、完成和重开。它隐藏以下诊断：

- 红绿 PathPreview 与 graph edge 状态
- authored snap ticks、edge WRange bands 与未来断路预告
- 精确 route、节点名和 `Try W min-max`
- DebugOverlay 中的 W、graph、route 与 failure 明细

Unity Editor Play Mode 中，每关 `DebugText` 上的 `DebugOverlay.showDeveloperDebug` 是唯一入口。开发者开启它时，上述诊断一起恢复；关闭开关或禁用组件时，诊断一起撤销。切换不得改变 W、graph、session 或玩家位置。

普通 macOS build 只提供默认关闭的玩家模式。当前没有 runtime debug 开关，本阶段也不新增 settings framework 或快捷键。

输入层仍会在 `snapRadius` 内吸附 authored snap points。Mechanic Isolation 暂不改变这条 legacy control 规则。后续 playtest 需要单独比较有吸附与无吸附条件，检查 blind W sweeping。

## Gameplay gates

| Gate | 观察问题 |
|---|---|
| G0 Discoverability | 玩家能否在没有解释时发现 W 与世界变化的关系？ |
| G1 Causality | 玩家能否说明世界为何变化？ |
| G2 Prediction | 玩家能否在操作前预测大小、位置、出现或连接？ |
| G3 Exploitation | 玩家遇到新障碍时会主动利用第四维吗？ |
| G4 Transfer | 玩家换到新布局后会复用已经形成的模型吗？ |

工程验证只覆盖软件 correctness。团队需要真实 playtest 观察才能填写这些 gates。

## 实验记录

每个 cycle 记录以下内容：

1. 唯一产品问题与假设
2. 代码范围、复用模块和新增模块
3. 实际执行的 Compile、EditMode、PlayMode 与手动 mechanic check
4. 实验支持的判断与证据边界
5. `CONTINUE`、`MODIFY` 或 `ABANDON`，以及下一项最小实验

`What this proves` 只能引用本轮证据。测试通过不能替代 comprehension、prediction 或 transfer 观察。
