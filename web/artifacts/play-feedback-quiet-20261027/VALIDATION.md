# 首局反馈安静收口：供能浮字

日期：2026-10-27。分支：`codex/play-fun-play-feedback-quiet-20261027`。基线：`1496b79a91663bb8cca06ae6202472a3ba6392d5`。工作树：`/tmp/4d-play-feedback-quiet-20261027/web`。

## 本次变更

1. `mechanismFeedback` 接收实际 DOM 的 `hasSupplySlots`。节点列表已有可见 slots 时，部分供能返回空串；列表不可见时保留原有进度提示。scene 使用同一判定，power、ring、burst 不受影响。
2. 完成供能由 action popup 承担远端到达提示，scene 不再另发「供能到齐 · 等你启动」。已在接收机关且 E 可用时，也不再提示「到台上按 E」。power popup 显示时，scene-state 保持当前位置，避免第二处可见重复文字；原有无障碍 live announcement 保留。
3. 消费事件时，把实际可见的 `courtyardMomentum` 同时交给 scene 和文字反馈。`mechanism` / `mechanism-follow` 期间部分、完整供能都不追加文字，不排队补发。第二拍结束后不产生第三拍或自动闲置求助。
4. 新增四个聚焦单测，更新两个旧断言，并扩展真实浏览器验证：供能列表、场景文字、action popup、状态栏、announcement、VFX 和唯一主 CTA 同时观察。

运行时仅改 `src/main.js`、`src/play-feedback.js`、`src/scene.js`。[保护范围核对](scope-check.json) 确认 **34 个文件与基线逐字节相同**，包括模型、rooms、所有 Flatland 运行模块、courtyard-momentum、friend-guide、音频、合同、计分所在模型、HTML/CSS、package 和 serve.js。没有修改 #36 参数、#37/#38 时机或 visitor-next-beat，没有新增教程树、常驻 HUD 长文或第三拍。

## 验证结果

- `npm test`：**313/313 PASS**，0 fail、0 skipped；基线 309，本次新增 4 个。[测试收据](test-summary.json)。原始输出保留为本地 `npm-test.txt`，不提交日志。
- `verify-penpal`、`verify-top5`：**1280×900、390×844、320×844 六组全部 PASS**；320px 使用 reduced motion。两个收据的 console warning/error 与 pageerror 均为空。
- 七个修改的 JS/MJS 文件通过 `node --check`，`git diff --check` 通过。[静态检查](static-checks.json)、[源码 SHA-256](source-manifest.json)。

| 场景 | 观察到的结果 |
| --- | --- |
| 普通双源部分供能，三个宽度 | 真实 slots 更新为 1/2；无「还差一路」popup / announcement / 场景 note；保留 power 和 ring |
| 普通远端供能到齐，三个宽度 | 只有一条 action popup；scene note 为零，scene-state 为当前位置 |
| 第二源启动后立即切到同 XYZ 接收台，三个宽度 | 到齐时玩家确实位于 bell，唯一主 CTA 为 interact；无「供能到齐／到台上」popup 或 announcement |
| 真实发现后首进，390px | complete power 在 mechanism-follow 可见期间实际到达；scene note 为零，文字仍是既有启动反馈；供能 slots、power 和 ring 更新 |
| 真实发现后首进，1280 / 320px | 本次随机到分源架桥庭；首机关只开桥，没有 power 事件。按实际模型记为无供能，不虚构第二拍发送能量 |
| 三个首进完整链路 | 实际启动三个机关；到齐提示无多通道冲突；最后再等 6.2 秒，cue 为空、无 action popup、无自动求助；used 仍只有四个既有首进状态 |
| H / 回访 / 唯一 CTA | H 在可用时正常打断；回访没有首进重播；逐帧未出现多个主 CTA 或禁用的主 CTA |

上述逐帧数值与事件在 [供能汇总](power-summary.json)、[penpal 原始收据](browser-penpal/receipt.json)、[TOP5 原始收据](browser-top5/receipt.json)。测试只用原生按钮、键盘、指针、range 和真实收藏/入口；没有写模型、预置存档、修改节拍或刷新入口预算。路径规划只读取快照，移动仍由真实 UI 完成。

TOP5 还保留了访客、伙伴发现、花种、afterglow、旁白互斥、存档、静音、暂停、reduced motion、320px 折叠与无横向溢出等回归。单测覆盖列表不可见时的 fallback，以及两个第二拍状态对部分/完整 power 的抑制与 reduced-motion VFX。

已目视检查三个宽度的远端完成和接收台截图，以及 320px 第二拍兑现与全链路安静截图：

- 远端唯一完成提示：[1280](browser-penpal/courtyard-power-complete-remote-1280.png)、[390](browser-penpal/courtyard-power-complete-remote-390.png)、[320](browser-penpal/courtyard-power-complete-remote-320.png)。
- 接收台上的 E，无重复到齐文字：[1280](browser-penpal/courtyard-power-at-receiver-1280.png)、[390](browser-penpal/courtyard-power-at-receiver-390.png)、[320](browser-penpal/courtyard-power-at-receiver-320.png)。
- [320 第二拍兑现](browser-penpal/courtyard-second-beat-complete-320.png)、[320 全链路结束后安静](browser-penpal/courtyard-first-beat-full-power-chain-quiet-320.png)。

## 验收修正记录

保留 [ATTEMPTS.json](ATTEMPTS.json) 和此前各次 receipt，不把中断或失败计作通过。

- 第一轮新增断言错误地要求每个首机关都发 power；分源架桥首机关只开桥。改为校验实际事件，完整链路仍要求出现 complete power。截图同时发现 scene-state 与 popup 重复，本次运行时修复包含该问题。
- 第二轮断言把平台名「供能回声台」误当供能提示；改为匹配进度/到齐的具体短语，未修改运行时。
- 第三轮 penpal 的旧 H 检查在同位接力庭的 0.5 秒供能到达前请求帮助；此时没有可提示的下一步。独立 [模型/guide 复现](help-timing.json) 显示 0.2 秒请求失败、0.55 秒请求成功。检查改为在 follow age ≥0.55 秒请求 H，仍处于原有 0.85 秒反馈期间；模型、H 和节拍运行时完全未改。该轮 TOP5 的三个宽度已全部通过，但仍重跑两条必需命令，使最终证据对应最终脚本。

## 环境与复现

Node `v24.12.0`，本工作树临时安装 Playwright `1.64.1`（no-save、无 lockfile、缓存留在本证据目录的忽略子目录）。使用已有 Chromium `151.0.7922.34`，通过 `PLAYWRIGHT_EXECUTABLE_PATH` 指定；没有安装或改动全局依赖、package 或其他工作树代码。

服务仅绑定 `127.0.0.1:4199`。验收后关闭该服务并清理本次临时 node_modules；未公网部署。可在具备 Playwright 的环境中用新输出目录复现，保留本轮证据：

```sh
cd /tmp/4d-play-feedback-quiet-20261027/web
npm test
export PLAYWRIGHT_EXECUTABLE_PATH='/Users/lvhanlin/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
PORT=4199 node serve.js
BASE_URL=http://127.0.0.1:4199 ARTIFACT_DIR=artifacts/play-feedback-quiet-20261027/browser-penpal-rerun node scripts/verify-penpal.mjs
BASE_URL=http://127.0.0.1:4199 ARTIFACT_DIR=artifacts/play-feedback-quiet-20261027/browser-top5-rerun node scripts/verify-top5.mjs
```

提交/推送/创建 PR 后，本地 `DONE`、`PUBLICATION.json` 记录精确 tip、远端 SHA、PR URL 和测试数；后置收据不进入其引用的提交，避免 SHA 自引用。`MIRROR.json` 记录镜像文件及校验和。关键收据镜像到用户指定主仓 artifacts 目录。CODEX_TASK、pid、log、文本运行日志和临时依赖不进入提交。

不合并 main，不使用 Unity 或 Cloud Agents。仍建议真人试玩；自动验收未验证陌生玩家的理解度、趣味性或完成感。
