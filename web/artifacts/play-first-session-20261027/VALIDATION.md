# 首局可体验：提示层摩擦收敛

日期：2026-10-27。分支：`codex/play-fun-first-session-20261027`。基线：`9ada95d0e4800dc650f424377dac49b7b5bad7f3`。

本轮完成三项小改动，范围止于提示表现：

1. 伙伴靠近短字半径从 1.7 收紧到 1.35，继续要求当前可见或正在 peek。seed=42 出生点距伙伴约 1.414，因此即便切到 S=4.7 显出伙伴，站桩也不会触发文字；走近后仍有一次 cue，且不必推进追逐步骤。
2. 仅 fresh `friend_found` gain 从 0.075 到 0.09（+20%），fresh `garden_seed` 从 0.07 到 0.085（约 +21.4%）。master 保持 0.6，音符/时长/非 fresh 分支及日常音效不变。
3. 画布宽度 ≤480 时，near 短字从 1.3s 缩至 1.1s，发现短字从 1.35s 缩至 1.2s。桌面仍为 2.2s/1.8s，既有文字避让和无字 afterglow 保留。

必做项 1 的 4s 到达旁白互斥、可选项 5 的首次稳行落地后收起 friendGuide 已在基线中实现，本轮保留并重新验证，未重复实现。旁白期间 `DiscoveryHints.update` 不消耗地区首次提示，也不发射或 announce `discovery_near`；旁白结束后才允许第一次靠近提示。

## 验收结果

- `npm test`：**300/300 PASS**，0 fail、0 skipped，见 [完整日志](npm-test.txt)。现有回归补充了「显出伙伴但仍站桩」「真正靠近后被旁白延迟」以及 fresh 音量相对日常 chirp 的检查。
- `git diff --check`、改动 JavaScript 的 `node --check` 通过。
- `verify-penpal`、`verify-top5`：**1280×900、390×844、320×844 全部 PASS**。两套收据的 console warning/error、pageerror 均为空。320 同时覆盖 reduced motion，TOP5 的发现阶段覆盖静音。
- 本树独立服务 `http://127.0.0.1:4195`，Chromium 130.0.6723.31，使用主 checkout 已有 Playwright 1.48.2 的只读依赖链接；未写入主 checkout。
- 隔离新档，未预写收藏或直接注入模型状态。通过指针、键盘、按钮和原生 range input/change 事件操作；快照/事件/Canvas 和 oscillator observer 只读记录。

| 宽度 | 首次 near 游戏时间 | near 消退观测 | near/discovery 时长 | 旁白冲突 |
| --- | --- | --- | --- | --- |
| 1280 | 4.0095s | 2.1912s | 2.2s / 1.8s | 0 |
| 390 | 4.0084s | 1.0926s | 1.1s / 1.2s | 0 |
| 320 | 4.0114s | 1.0929s | 1.1s / 1.2s | 0 |

消退观测包含事件同帧的首次老化，因此略短于配置时长。浏览器逐帧检查 arrival 与 near popup/announce 不共存；旁白中暂停不会耗掉窗口。出生点先等到 4.2s，再切片显出伙伴并等到 5s，仍无 near；重来后实际走近，旁白结束才提示一次。

两套脚本还覆盖首次伙伴/花种各一次、暂停冻结与消退、静音不发声、存档/同题重来不重放、HUD 无横向溢出、访客下一拍、真实「去庭院」入口携新收藏、单主 CTA、首次稳行落地及启动机关。庭院落地后继续等 6.2s 无自动说明文字，H 仍可请求短时帮助。afterglow 1500ms 可见、landing/onward glint、320 details、供能反馈等既有回归均通过。

证据：[penpal 收据](browser-penpal/receipt.json)、[日志](browser-penpal.txt)；[TOP5 收据](browser-top5/receipt.json)、[日志](browser-top5.txt)。

目视检查桌面、390、320 的旁白/near/发现截图，以及 320 庭院落地截图；本轮截图中旁白与 near 分时出现，手机发现短字与上方 HUD、物体标签错开。关键截图：[320 旁白](browser-top5/320-arrival-visible-friend.png)、[320 near](browser-top5/320-approach.png)、[390 发现](browser-top5/390-friend-found.png)、[320 花种](browser-top5/320-seed-found.png)、[320 庭院落地](browser-penpal/courtyard-landing-glint-320.png)。

## 尝试记录与范围

TOP5 首次尝试因新加的指针到达判断要求 0.025 单位精度而超时；现有输入逻辑在距目标 0.15 内停止。恢复脚本原有 0.22 容差，并额外断言实际已进入 1.35 的提示范围、追逐尚未推进后，完整三宽度重跑通过。失败日志与收据保留在 [attempt1 日志](browser-top5-attempt1.txt)、[attempt1 收据](browser-top5-attempt1/receipt.json)，未修改游戏移动规则。

[scope-check.json](scope-check.json) 记录六个改动的代码/测试/脚本文件，均在 web；模型、房间、Flatland 关卡/发现/花园规则、friendGuide、momentum、visitor cue、两个 main 及 verify-penpal 均与基线逐字节相同。合同、计分、几何、Unity、选择弹窗、visitor-next-beat、afterglow/momentum/landing E 未改动；无公网部署或 Cloud Agents 操作。

复现（请使用新输出目录保留本轮记录）：

```sh
PORT=4195 node serve.js
npm test
BASE_URL=http://127.0.0.1:4195 ARTIFACT_DIR=artifacts/play-first-session-20261027/browser-penpal-rerun node scripts/verify-penpal.mjs
BASE_URL=http://127.0.0.1:4195 ARTIFACT_DIR=artifacts/play-first-session-20261027/browser-top5-rerun node scripts/verify-top5.mjs
```

提交后的 tip SHA、远端核验、PR URL 与测试数写入本机 [DONE](DONE) 交付收据（发布后生成，不纳入它所引用的提交，避免 SHA 自引用）。

仍建议真人试玩；未做真人听感、真机触控或陌生玩家理解度验证。
