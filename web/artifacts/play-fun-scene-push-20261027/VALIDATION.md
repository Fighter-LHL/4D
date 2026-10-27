# 场景推力 · 四项交付

- 工作树：`/tmp/4d-scene-push-20261027`；分支：`codex/play-fun-scene-push-20261027`。
- 基线：`cf94c0c1dfb25f541ae53e90128e1f89155cbdd4`。提交后的精确 tip 与 UTC 见本目录本地 `DONE`。
- 已读主 checkout 的 Penpal `penpal-play-20261027-1040/SUMMARY.md`、`TOP5.md`，以及本树 `docs/playtests/llm-design-and-playtest-prompt.md`。
- 全部改动在本工作树 `web/`。主 checkout 仅用于读取要求及复用已有 Playwright 依赖；没有安装依赖或写入主 checkout。未修改 Unity、合同、模型规则或公网部署。

## 完成范围

1. 可在当前切片实际前往的平台持续脉冲描边；消失、锁定、穿越中和回流中不画可行提示。安全模式下实际出发按钮 `#move` 显示「稳行」，有效预览时为金边主按钮。原稳行/冒险模式开关与 Space、平台第二次点击的语义保留。穿越中 E 禁用，title 与空 E 的「还在穿越，落稳后再按 E」保留。
2. 双源接收台已有一路启动时，尚未启动的另一路弱脉冲，并标出名字和层位。异层源仍为空心虚线，不能点击成可通行平台。在已启动源空 E 显示「这边已经亮了 · 去辉光源」（反向顺序读取真实另一源）。两源都启动后提示消失，不把仍在传输的能量当成未启动。
3. 底栏优先级：可启动机关 → 可穿越 → 可交互；无可执行动作时没有强强调按钮。已启动 E 低对比「已启动」。金边只用于一个主 CTA，键盘焦点使用深色虚线，避免成功后残留第二圈金边。
4. 戳球后保留 1.2 秒观察提示，再将同一个 `#visitor-goal` 改为「走到光环边找访客」。暂停、口袋暂停和后台不推进模型时间；重戳重播观察拍，重玩重置。进入越墙显示 4 秒「墙那边有动静 · 换个切片看看」，不提供坐标。

## 自动化与浏览器实测

- `npm test`：**273 / 273 通过**，失败、取消、跳过均 0。原有 267 项，新增 6 项，详见 `tests-final.txt`。
- 新增覆盖：40 个种子的预览/穿越/启动/完成主 CTA；错误切片、失去支撑、回流、非游玩阶段；双源任意先后顺序与传输等待；提示不改变模型；访客观察/暂停/再次戳球/重玩；越墙短旁白；脉冲暂停与减少动态效果。
- 浏览器：本树 `PORT=4187 node serve.js`，没有重启或终止用户已有 4173 服务。Playwright 隔离浏览器上下文，庭院 seed=2、访客 seed=7，实际 DOM/Canvas 点击及键盘操作；没有预写收藏或注入游戏状态。Canvas 点击坐标只读取同 seed 的初始几何。
- 最终收据：`browser-verified/receipt.json`。1280×900、390×844、320×844（减少动态效果）全部通过；浏览器 pageerror / console error 均为空。
- 路径：选缓落壳 → 空 E 原因 → 点潮汐源预览 → 金边稳行 → 穿越中灰显 E → 落地 E → 供能 1/2 → 重按 E 指向辉光源 → 经归响台换层 → 辉光源启动 → 供能到齐 → 三个帮助主题；随后访客戳球、暂停、恢复、下一拍、切到越墙、旁白消退。
- 每帧观察庭院底栏：没有多个 `.primary-button` / `.attention-action`，也没有禁用状态的主 CTA。实测减少动态效果下按钮无动画，Canvas 脉冲有静态保留。
- 已目视检查桌面与窄屏的预览、第二源指向、穿越/已启动按钮及访客/越墙提示截图。没有横向溢出；键盘焦点清楚且不再使用主 CTA 金边。
- `git diff --check` 和修改后 JS 语法检查通过。`source-sha256.txt` 绑定源文件、测试与验证脚本。

重现命令（独立端口服务启动后）：

```sh
BASE_URL=http://127.0.0.1:4187 \
ARTIFACT_DIR=artifacts/play-fun-scene-push-20261027/browser-verified \
node scripts/verify-penpal.mjs
```

## 验收边界与并行对接

- 收据中的 `firstCrossingMs` 从选遗物后计到首次落地；`secondSourceCueMs` 从首次按 E 启动计到再次空 E 的第二源提示出现。均为脚本操作时延，分别通过 30 秒/20 秒的回归上限；**不能据此宣称真人新玩家的 30 秒/20 秒目标已验证，理解度与趣味性仍待试玩**。
- 本轮不实现或验收发现加汁。没有修改 `discoveries.js`、`companions.js`、`friends-scene.js`、音频或花种/伙伴事件。`VisitorCueSequence` 只消费现有 `load` / `visitor_poke` 和模型时间；并行分支合并 `flatland/main.js` 时保留此调用以及其自身的发现事件处理。
- `browser/` 是首次回归；`browser-final/` 是焦点样式复查，其旧 `secondSourceCueMs` 只统计空 E 响应；最终完整计时以 `browser-verified/` 为准。前两轮本地证据保留，不作为最终收据提交。
- `DONE` 在提交、推送及远端 SHA 复核后生成于本地，精确引用该 tip；不将它再提交以制造自引用 SHA。原有 `codex-exec.log`、`codex.pid`、`CODEX_TASK.md` 和 `node_modules` 链接保留，不混入提交。
