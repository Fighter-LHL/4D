# 首局可体验：庭院一个清晰节拍

日期：2026-10-27。分支：`codex/play-fun-courtyard-beat-20261027`。基线：`a08e2108dec97b6db9fbc3616659bfbeaef5dc3e`（已含 #36）。

本轮止于任务的三个必做项：

1. 首次携真实收藏通过「去庭院」进入并选好遗物后，1.2 秒开始照亮当前可达、已选中的下一平台；复用场景 glint 和唯一「稳行」主 CTA。原先照亮出生平台的 welcome 改为一次明确邀请；首次入口不再先显示自动 friendGuide。
2. 玩家实际安全抵达邀请的平台后，复用一次 0.85 秒 follow 辉光。邀请 2.1 秒后安静消退，之后才跟随仍可兑现；未显示的邀请、失败、冒险、转向、离开切片或 H 中断不会补发兑现。兑现后不再追加 landing/onward 自动提示。
3. 首进这一庭期间关闭自动闲置求助，保留 H 即时求助及其原有期限；首次安全落地继续收起 friendGuide。复用原存档入口预算，回访不重播首拍。暂停冻结，窄屏与 reduced motion 继续使用既有绘制通道。

未增加下一拍提示或教程树。游戏运行代码仅修改 `src/courtyard-momentum.js` 与 `src/main.js`。

## 验收结果

- `npm test`：**302/302 PASS**，0 fail、0 skipped，见 [完整日志](npm-test.txt)。新增用例覆盖即时/过期后跟随、一次兑现、暂停、不改模型状态、完成后无续拍，以及失败/冒险/转向/切片/未显示/H 中断。
- `verify-penpal` 与 `verify-top5`：**1280×900、390×844、320×844，六组全部 PASS**。两个收据的 console warning/error、pageerror 均为空。
- `git diff --check`、六个改动/新增 JavaScript 文件的 `node --check` 通过。
- 独立本树服务 `http://127.0.0.1:4196`；Chromium `130.0.6723.31`，复用已有 Playwright `1.48.2` 只读依赖链接，验收后移除链接并关闭服务。

| 浏览器路径 | 1280 | 390 | 320 |
| --- | --- | --- | --- |
| penpal 真实发现 → 庭院 | 首拍兑现一次 | 首拍兑现一次 | 首拍兑现一次，reduced motion |
| TOP5 真实发现 → 庭院 | 首拍兑现一次 | 首拍兑现一次 | 邀请中按 H，即时让位且后续不补发 |
| 回访 | 无首拍重播 | 无首拍重播 | 无首拍重播 |

penpal 三个宽度的邀请首次绘制均约为游戏时间 **1.217 秒**。正常路径刻意静置 **6.5 秒**再跟随：没有第二条自动提示或 announcement，只有真实到达后一次 follow；启动机关后继续等 **6.2 秒**，不追加下一拍。逐帧 observer 检查唯一主 CTA、主按钮可用性、glint 与 friendGuide 不共存；Canvas stroke observer 确认邀请和兑现实际绘制。H 同时覆盖邀请与兑现两阶段。

全部为隔离新档，通过真实指针、键盘、按钮、原生 range input/change 完成发现、收集与庭院入口；未预写收藏、清除入口预算或注入模型状态。新 observer 仅由浏览器脚本追加，不进入游戏运行文件。

两套脚本保留既有回归：普通入口的 landing/onward、落地 E、供能反馈、访客下一拍、平面国旁白互斥与靠近提示、fresh SFX、afterglow、暂停、存档、320 reduced motion/静音、HUD 无横向溢出等。#36 的 Flatland 提示参数未修改。

证据：[penpal 收据](browser-penpal/receipt.json)、[penpal 日志](browser-penpal.txt)、[TOP5 收据](browser-top5/receipt.json)、[TOP5 日志](browser-top5.txt)、[首拍汇总](first-beat-summary.json)。

目视核验了三个宽度的邀请与兑现截图；目标平台的辉光与名称分开，主按钮从稳行切换到落地 E，没有新增常驻 HUD 或说明段落：

- 1280：[邀请](browser-penpal/courtyard-first-beat-invitation-1280.png)、[兑现](browser-penpal/courtyard-first-beat-complete-1280.png)。
- 390：[邀请](browser-penpal/courtyard-first-beat-invitation-390.png)、[兑现](browser-penpal/courtyard-first-beat-complete-390.png)。
- 320：[邀请](browser-penpal/courtyard-first-beat-invitation-320.png)、[兑现](browser-penpal/courtyard-first-beat-complete-320.png)、[H 让位](browser-top5/courtyard-first-beat-help-320.png)。

## 范围与复现

[scope-check.json](scope-check.json) 核对 34 个受保护文件与基线逐字节一致：模型、房间、全部 Flatland 运行模块、friendGuide、scene、audio、play-feedback、CSS/HTML、package 及合同。计分、房间几何、Unity、visitor-next-beat 大逻辑均未改动，无公网部署或 Cloud Agents 操作。[source-manifest.json](source-manifest.json) 记录实际通过验收的六个代码/测试/脚本文件 SHA-256。

新增的负向单测最初尝试选择当前不可达的 `vault`，选择被模型拒绝，未形成预期的转向；修正为真实可选的 `bloom` 并断言选择成功后，聚焦用例与完整测试通过。两套完整浏览器验收首次运行均通过。

已安装 Playwright 的环境可用新输出目录复现，保留本轮证据：

```sh
PORT=4196 node serve.js
npm test
BASE_URL=http://127.0.0.1:4196 ARTIFACT_DIR=artifacts/play-courtyard-beat-20261027/browser-penpal-rerun node scripts/verify-penpal.mjs
BASE_URL=http://127.0.0.1:4196 ARTIFACT_DIR=artifacts/play-courtyard-beat-20261027/browser-top5-rerun node scripts/verify-top5.mjs
```

提交、推送并创建 PR 后，精确 tip SHA、PR URL、远端核验和测试数写入本机 `DONE` 收据；该收据在提交后生成，不纳入它所引用的提交，避免 SHA 自引用。

仍建议真人试玩；陌生玩家的理解度和完成感尚未验证。
